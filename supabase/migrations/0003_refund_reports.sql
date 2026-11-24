alter table public.sales drop constraint sales_payment_status_check;
alter table public.sales add constraint sales_payment_status_check check (payment_status in ('pending','paid','failed','cancelled','refunded'));

create table public.sale_returns (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores on delete cascade,
  sale_id uuid not null unique references public.sales, reason text not null, refund_amount bigint not null, restock boolean not null,
  cogs_reversed bigint not null default 0, created_by uuid references public.profiles, created_at timestamptz not null default now());
alter table public.sale_returns enable row level security;
create policy ret_owner on public.sale_returns for select using (is_owner(store_id));

-- Refund penuh; stok kembali hanya jika barang benar-benar dikembalikan (p_restock)
create function public.refund_sale(p_sale uuid, p_reason text, p_restock boolean) returns void language plpgsql security definer set search_path = public as $$
declare s sales; it record; pr products; cg numeric := 0;
begin
  select * into s from sales where id = p_sale for update;
  if not found or not is_owner(s.store_id) then raise exception 'Tidak diizinkan'; end if;
  if s.payment_status <> 'paid' then raise exception 'Hanya transaksi lunas yang dapat direfund'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan wajib diisi'; end if;
  if p_restock then
    for it in select * from sale_items where sale_id = p_sale loop
      select * into pr from products where id = it.product_id for update;
      update products set stock = stock + it.quantity, updated_at = now() where id = pr.id;
      insert into stock_movements (store_id, product_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, notes, created_by)
        values (s.store_id, pr.id, 'return_in', it.quantity, pr.stock, pr.stock + it.quantity, 'refund', p_sale, p_reason, auth.uid());
      cg := cg + it.quantity * it.unit_cost_snapshot;
    end loop;
  end if;
  insert into sale_returns (store_id, sale_id, reason, refund_amount, restock, cogs_reversed, created_by) values (s.store_id, p_sale, p_reason, s.total_amount, p_restock, round(cg), auth.uid());
  update sales set payment_status = 'refunded' where id = p_sale;
  update payments set payment_status = 'refunded' where sale_id = p_sale;
  perform _audit(s.store_id, 'refund_sale', 'sales', p_sale, to_jsonb(s), jsonb_build_object('reason', p_reason, 'restock', p_restock));
end $$;

-- Data struk (aman untuk kasir: tanpa harga modal)
create function public.get_receipt(p_sale uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s sales; st stores;
begin
  select * into s from sales where id = p_sale;
  if not found or not (is_owner(s.store_id) or (is_member(s.store_id) and s.cashier_id = auth.uid())) then raise exception 'Tidak diizinkan'; end if;
  select * into st from stores where id = s.store_id;
  return jsonb_build_object('store', st.store_name, 'address', st.address, 'phone', st.phone, 'invoice', s.invoice_number, 'date', s.sale_date,
    'cashier', (select full_name from profiles where id = s.cashier_id), 'method', s.payment_method, 'status', s.payment_status,
    'subtotal', s.subtotal, 'discount', s.discount, 'total', s.total_amount,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', p.product_name, 'quantity', i.quantity, 'price', i.selling_price, 'subtotal', i.subtotal)), '[]')
      from sale_items i join products p on p.id = i.product_id where i.sale_id = s.id));
end $$;

-- Laporan keuangan (owner). Penjualan = lunas; pending tidak dihitung. Pembelian bukan beban; HPP dari snapshot saat penjualan.
create function public.get_financial_report(p_store uuid, p_from date, p_to date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare gross bigint; n int; ref bigint; cogs_rev bigint; cogs numeric; ex bigint; pur bigint; pur_paid bigint; bym jsonb; daily jsonb;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  select coalesce(sum(total_amount), 0), count(*) into gross, n from sales where store_id = p_store and payment_status in ('paid','refunded')
    and (sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to;
  select coalesce(sum(refund_amount), 0), coalesce(sum(cogs_reversed), 0) into ref, cogs_rev from sale_returns where store_id = p_store
    and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to;
  select coalesce(sum(i.quantity * i.unit_cost_snapshot), 0) into cogs from sale_items i join sales s on s.id = i.sale_id
    where s.store_id = p_store and s.payment_status in ('paid','refunded') and (s.sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to;
  select coalesce(sum(amount), 0) into ex from expenses where store_id = p_store and status = 'active' and expense_date between p_from and p_to;
  select coalesce(sum(total_amount), 0), coalesce(sum(total_amount) filter (where payment_status = 'paid'), 0) into pur, pur_paid from purchases
    where store_id = p_store and receiving_status = 'received' and purchase_date between p_from and p_to;
  select coalesce(jsonb_object_agg(payment_method, t), '{}') into bym from (select payment_method, sum(total_amount) t from sales where store_id = p_store
    and payment_status in ('paid','refunded') and (sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to group by 1) x;
  select coalesce(jsonb_agg(jsonb_build_object('d', d, 'sales', t) order by d), '[]') into daily from (select (sale_date at time zone 'Asia/Jakarta')::date d, sum(total_amount) t
    from sales where store_id = p_store and payment_status in ('paid','refunded') and (sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to group by 1) x;
  return jsonb_build_object('transactions', n, 'gross_sales', gross, 'refunds', ref, 'net_sales', gross - ref, 'cogs', round(cogs) - cogs_rev,
    'gross_profit', gross - ref - (round(cogs) - cogs_rev), 'expenses', ex, 'net_profit', gross - ref - (round(cogs) - cogs_rev) - ex,
    'purchases', pur, 'cash_in', gross, 'cash_out', ref + ex + pur_paid, 'net_cash', gross - ref - ex - pur_paid, 'by_method', bym, 'daily', daily);
end $$;
grant execute on function public.refund_sale(uuid, text, boolean), public.get_receipt(uuid), public.get_financial_report(uuid, date, date) to authenticated;
