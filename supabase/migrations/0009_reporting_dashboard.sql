-- 0009: Laporan dan dashboard.
-- Memperbaiki get_sales_breakdown (sebelumnya "stable" tetapi membuat tabel sementara sehingga ditolak Postgres).
-- Semua fungsi laporan memakai CTE murni dan tetap bertipe stable.

------------------------------------------------------------------------------
-- View produk untuk owner (status stok dihitung di database agar bisa difilter dan dipaginasi)
------------------------------------------------------------------------------
create view public.products_owner with (security_invoker = true) as
select p.*, c.category_name,
  case when p.stock <= 0 then 'out' when p.stock <= p.minimum_stock then 'low' else 'ok' end as stock_status
from public.products p left join public.categories c on c.id = p.category_id;
grant select on public.products_owner to authenticated;

create function public.get_low_stock(p_store uuid, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  return jsonb_build_object(
    'count', (select count(*) from products where store_id = p_store and is_active and stock <= minimum_stock),
    'items', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (
      select id, product_name as name, stock, minimum_stock, unit from products
      where store_id = p_store and is_active and stock <= minimum_stock order by stock - minimum_stock, product_name limit p_limit) x));
end $$;

------------------------------------------------------------------------------
-- Laporan keuangan (ringkasan). Penjualan = lunas (termasuk yang kemudian direfund, lalu refund dikurangkan)
------------------------------------------------------------------------------
create or replace function public.get_financial_report(p_store uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare gross bigint; n int; ref bigint; cogs_rev bigint; cogs numeric; ex bigint; pur bigint; pur_paid bigint; bym jsonb; daily jsonb; pend_n int; pend_amt bigint;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  select coalesce(sum(total_amount), 0), count(*) into gross, n from sales where store_id = p_store and payment_status in ('paid', 'refunded')
    and (sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to;
  select coalesce(sum(refund_amount), 0), coalesce(sum(cogs_reversed), 0) into ref, cogs_rev from sale_returns where store_id = p_store
    and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to;
  select coalesce(sum(i.quantity * i.unit_cost_snapshot), 0) into cogs from sale_items i join sales s on s.id = i.sale_id
    where s.store_id = p_store and s.payment_status in ('paid', 'refunded') and (s.sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to;
  select coalesce(sum(amount), 0) into ex from expenses where store_id = p_store and status = 'active' and expense_date between p_from and p_to;
  select coalesce(sum(total_amount), 0) into pur from purchases where store_id = p_store and receiving_status = 'received' and purchase_date between p_from and p_to;
  select coalesce(sum(amount), 0) into pur_paid from purchase_payments where store_id = p_store and payment_date between p_from and p_to;
  select coalesce(jsonb_object_agg(payment_method, t), '{}') into bym from (select payment_method, sum(total_amount) t from sales where store_id = p_store
    and payment_status in ('paid', 'refunded') and (sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to group by 1) x;
  select coalesce(jsonb_agg(jsonb_build_object('d', d, 'sales', t) order by d), '[]') into daily from (select (sale_date at time zone 'Asia/Jakarta')::date d, sum(total_amount) t
    from sales where store_id = p_store and payment_status in ('paid', 'refunded') and (sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to group by 1) x;
  select count(*), coalesce(sum(total_amount), 0) into pend_n, pend_amt from sales where store_id = p_store and payment_status = 'pending'
    and (sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to;
  return jsonb_build_object('transactions', n, 'gross_sales', gross, 'refunds', ref, 'net_sales', gross - ref, 'cogs', round(cogs) - cogs_rev,
    'gross_profit', gross - ref - (round(cogs) - cogs_rev), 'expenses', ex, 'net_profit', gross - ref - (round(cogs) - cogs_rev) - ex,
    'purchases', pur, 'purchases_paid', pur_paid, 'cash_in', gross, 'cash_out', ref + ex + pur_paid, 'net_cash', gross - ref - ex - pur_paid,
    'avg_transaction', case when n = 0 then 0 else round(gross::numeric / n) end, 'pending_count', pend_n, 'pending_amount', pend_amt,
    'by_method', bym, 'daily', daily);
end $$;

------------------------------------------------------------------------------
-- Penjualan per produk / kategori dengan filter. Retur sebagian dikeluarkan.
------------------------------------------------------------------------------
drop function if exists public.get_sales_breakdown(uuid, date, date);
create function public.get_sales_breakdown(p_store uuid, p_from date, p_to date, p_method text default null,
  p_category uuid default null, p_product uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  with b as (
    select p.id as product_id, p.product_name as name, coalesce(c.category_name, 'Tanpa kategori') as category,
      (sum(i.quantity) - coalesce(sum(r.qty), 0))::bigint as qty,
      -- omzet bersih: diskon transaksi dibagi proporsional ke tiap barang, retur (sudah berbasis proporsi yang sama) dikurangkan
      round(sum(case when s.subtotal = 0 then 0 else i.subtotal::numeric * s.total_amount / s.subtotal end) - coalesce(sum(r.amount), 0))::bigint as revenue,
      round(sum(i.quantity * i.unit_cost_snapshot) - coalesce(sum(r.cogs), 0))::bigint as cogs
    from sale_items i
    join sales s on s.id = i.sale_id
    join products p on p.id = i.product_id
    left join categories c on c.id = p.category_id
    left join (select sale_item_id, sum(quantity) qty, sum(refund_amount) amount, sum(cogs_reversed) cogs from sale_return_items group by 1) r on r.sale_item_id = i.id
    where s.store_id = p_store and s.payment_status in ('paid', 'refunded')
      and (s.sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to
      and (p_method is null or s.payment_method = p_method)
      and (p_category is null or p.category_id = p_category)
      and (p_product is null or p.id = p_product)
    group by p.id, p.product_name, c.category_name
  )
  select jsonb_build_object(
    'products', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'category', category, 'qty', qty, 'revenue', revenue, 'cogs', cogs) order by revenue desc), '[]') from b),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('name', category, 'qty', q, 'revenue', rv, 'cogs', g) order by rv desc), '[]')
      from (select category, sum(qty) q, sum(revenue) rv, sum(cogs) g from b group by category) y))
  into result;
  return result;
end $$;

------------------------------------------------------------------------------
-- Daftar transaksi penjualan (semua status, termasuk pending) dengan filter dan paginasi
------------------------------------------------------------------------------
create function public.get_sales_report(p_store uuid, p_from date, p_to date, p_method text default null, p_status text default null,
  p_category uuid default null, p_product uuid default null, p_limit integer default 20, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  with f as (
    select s.* from sales s
    where s.store_id = p_store and (s.sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to
      and (p_method is null or s.payment_method = p_method) and (p_status is null or s.payment_status = p_status)
      and ((p_category is null and p_product is null) or exists (select 1 from sale_items i join products p on p.id = i.product_id
        where i.sale_id = s.id and (p_product is null or p.id = p_product) and (p_category is null or p.category_id = p_category)))
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'sum', (select coalesce(sum(total_amount), 0) from f),
    'rows', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sale_date desc), '[]') from (
      select f.id, f.invoice_number, f.sale_date, f.payment_method, f.payment_status, f.total_amount, f.refunded_amount,
        (select full_name from profiles where id = f.cashier_id) as cashier
      from f order by f.sale_date desc limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0)) x))
  into result;
  return result;
end $$;

------------------------------------------------------------------------------
-- Laporan pembelian: per supplier, per produk, dan daftar dengan status penerimaan
------------------------------------------------------------------------------
drop function if exists public.get_purchase_report(uuid, date, date);
create function public.get_purchase_report(p_store uuid, p_from date, p_to date, p_supplier uuid default null,
  p_product uuid default null, p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  with pf as (
    select p.* from purchases p
    where p.store_id = p_store and p.purchase_date between p_from and p_to
      and (p_supplier is null or p.supplier_id = p_supplier)
      and (p_status is null or p.receiving_status = p_status)
      and (p_product is null or exists (select 1 from purchase_items i where i.purchase_id = p.id and i.product_id = p_product))
  )
  select jsonb_build_object(
    'by_supplier', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'count', c, 'total', t, 'unpaid', u) order by t desc), '[]') from (
      select coalesce(s.supplier_name, 'Tanpa supplier') n, count(*) c, sum(pf.total_amount) t, coalesce(sum(pf.total_amount - pf.paid_amount), 0) u
      from pf left join suppliers s on s.id = pf.supplier_id where pf.receiving_status = 'received' group by 1) x),
    'by_product', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'qty', q, 'total', t) order by t desc), '[]') from (
      select pr.product_name n, sum(i.quantity) q, sum(i.subtotal) t from purchase_items i join pf on pf.id = i.purchase_id
      join products pr on pr.id = i.product_id where pf.receiving_status = 'received' and (p_product is null or i.product_id = p_product) group by 1) y),
    'list', (select coalesce(jsonb_agg(jsonb_build_object('number', pf.purchase_number, 'date', pf.purchase_date, 'supplier', coalesce(s.supplier_name, 'Tanpa supplier'),
        'total', pf.total_amount, 'paid', pf.paid_amount, 'payment_status', pf.payment_status, 'receiving_status', pf.receiving_status) order by pf.purchase_date desc, pf.purchase_number desc), '[]')
      from pf left join suppliers s on s.id = pf.supplier_id))
  into result;
  return result;
end $$;

------------------------------------------------------------------------------
-- Dashboard owner: kartu bulan ini, tren 12 bulan, pengeluaran per kategori, daftar ringkas
------------------------------------------------------------------------------
create function public.get_dashboard(p_store uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jakarta')::date; m_from date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  fin jsonb; today_tot bigint; today_n int; result jsonb;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  fin := get_financial_report(p_store, m_from, today);
  select coalesce(sum(total_amount), 0), count(*) into today_tot, today_n from sales
    where store_id = p_store and payment_status in ('paid', 'refunded') and (sale_date at time zone 'Asia/Jakarta')::date = today;
  with months as (select generate_series(m_from - interval '11 months', m_from::timestamp, interval '1 month')::date as m),
  sm as (select date_trunc('month', sale_date at time zone 'Asia/Jakarta')::date m, sum(total_amount) gross from sales
         where store_id = p_store and payment_status in ('paid', 'refunded') and sale_date >= (m_from - interval '11 months') group by 1),
  cm as (select date_trunc('month', s.sale_date at time zone 'Asia/Jakarta')::date m, sum(i.quantity * i.unit_cost_snapshot) cogs from sale_items i join sales s on s.id = i.sale_id
         where s.store_id = p_store and s.payment_status in ('paid', 'refunded') and s.sale_date >= (m_from - interval '11 months') group by 1),
  rm as (select date_trunc('month', created_at at time zone 'Asia/Jakarta')::date m, sum(refund_amount) refunds, sum(cogs_reversed) cogs_rev from sale_returns
         where store_id = p_store and created_at >= (m_from - interval '11 months') group by 1),
  em as (select date_trunc('month', expense_date)::date m, sum(amount) expenses from expenses
         where store_id = p_store and status = 'active' and expense_date >= (m_from - interval '11 months') group by 1),
  pm as (select date_trunc('month', purchase_date)::date m, sum(total_amount) purchases from purchases
         where store_id = p_store and receiving_status = 'received' and purchase_date >= (m_from - interval '11 months') group by 1),
  series as (
    select months.m, coalesce(sm.gross, 0) - coalesce(rm.refunds, 0) as sales, coalesce(pm.purchases, 0) as purchases, coalesce(em.expenses, 0) as expenses,
      coalesce(sm.gross, 0) - coalesce(rm.refunds, 0) - (round(coalesce(cm.cogs, 0)) - coalesce(rm.cogs_rev, 0)) as gross_profit
    from months left join sm on sm.m = months.m left join cm on cm.m = months.m left join rm on rm.m = months.m
      left join em on em.m = months.m left join pm on pm.m = months.m)
  select jsonb_build_object(
    'month', jsonb_build_object('sales', fin->'net_sales', 'purchases', fin->'purchases', 'expenses', fin->'expenses', 'gross_profit', fin->'gross_profit', 'net_profit', fin->'net_profit'),
    'today', jsonb_build_object('sales', today_tot, 'transactions', today_n),
    'series', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'sales', sales, 'purchases', purchases, 'expenses', expenses,
        'gross_profit', gross_profit, 'net_profit', gross_profit - expenses) order by m) from series),
    'expense_by_category', (select coalesce(jsonb_agg(jsonb_build_object('name', category, 'total', t) order by t desc), '[]') from (
        select category, sum(amount) t from expenses where store_id = p_store and status = 'active' and expense_date between m_from and today group by 1) x),
    'recent_sales', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select id, invoice_number, sale_date, total_amount, payment_method, payment_status from sales
        where store_id = p_store order by sale_date desc limit 8) x),
    'top_products', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select p.product_name as name, sum(i.quantity) as qty, sum(i.subtotal) as revenue
        from sale_items i join sales s on s.id = i.sale_id join products p on p.id = i.product_id
        where s.store_id = p_store and s.payment_status in ('paid', 'refunded') and (s.sale_date at time zone 'Asia/Jakarta')::date between m_from and today
        group by p.id, p.product_name order by sum(i.quantity) desc limit 5) x),
    'lowest_stock', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select product_name as name, stock, minimum_stock, unit from products
        where store_id = p_store and is_active order by stock - minimum_stock, product_name limit 5) x),
    'recent_purchases', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select p.id, p.purchase_number, p.purchase_date, p.total_amount, p.receiving_status,
        p.payment_status, s.supplier_name from purchases p left join suppliers s on s.id = p.supplier_id where p.store_id = p_store
        order by p.created_at desc limit 5) x),
    'active_products', (select count(*) from products where store_id = p_store and is_active),
    'low_stock', (select count(*) from products where store_id = p_store and is_active and stock <= minimum_stock),
    'pending_sales', (select count(*) from sales where store_id = p_store and payment_status = 'pending'),
    'payables', (select coalesce(sum(total_amount - paid_amount), 0) from purchases where store_id = p_store and receiving_status = 'received'))
  into result;
  return result;
end $$;

-- Ringkasan kasir: hanya transaksi miliknya hari ini (tanpa data modal/laba)
create function public.get_cashier_summary(p_store uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not is_member(p_store) then raise exception 'Tidak diizinkan'; end if;
  return jsonb_build_object(
    'sales', (select coalesce(sum(total_amount), 0) from sales where store_id = p_store and cashier_id = auth.uid() and payment_status in ('paid', 'refunded')
      and (sale_date at time zone 'Asia/Jakarta')::date = today),
    'transactions', (select count(*) from sales where store_id = p_store and cashier_id = auth.uid() and payment_status in ('paid', 'refunded')
      and (sale_date at time zone 'Asia/Jakarta')::date = today),
    'pending', (select count(*) from sales where store_id = p_store and cashier_id = auth.uid() and payment_status = 'pending'));
end $$;

grant execute on function public.get_low_stock(uuid, integer), public.get_financial_report(uuid, date, date),
  public.get_sales_breakdown(uuid, date, date, text, uuid, uuid), public.get_sales_report(uuid, date, date, text, text, uuid, uuid, integer, integer),
  public.get_purchase_report(uuid, date, date, uuid, uuid, text), public.get_dashboard(uuid), public.get_cashier_summary(uuid) to authenticated;
