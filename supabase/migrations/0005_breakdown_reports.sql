-- Laporan penjualan per produk/kategori (transaksi lunas saja; refund dikeluarkan)
create function public.get_sales_breakdown(p_store uuid, p_from date, p_to date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare prod jsonb; cat jsonb;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  create temp table _b on commit drop as
    select p.product_name as name, coalesce(c.category_name, 'Tanpa kategori') as category, sum(i.quantity)::bigint as qty, sum(i.subtotal)::bigint as revenue,
      round(sum(i.quantity * i.unit_cost_snapshot))::bigint as cogs
    from sale_items i join sales s on s.id = i.sale_id join products p on p.id = i.product_id left join categories c on c.id = p.category_id
    where s.store_id = p_store and s.payment_status = 'paid' and (s.sale_date at time zone 'Asia/Jakarta')::date between p_from and p_to group by p.id, p.product_name, c.category_name;
  select coalesce(jsonb_agg(to_jsonb(x) order by revenue desc), '[]') into prod from _b x;
  select coalesce(jsonb_agg(jsonb_build_object('name', category, 'qty', q, 'revenue', r, 'cogs', g) order by r desc), '[]') into cat
    from (select category, sum(qty) q, sum(revenue) r, sum(cogs) g from _b group by category) y;
  return jsonb_build_object('products', prod, 'categories', cat);
end $$;

-- Laporan pembelian (barang diterima)
create function public.get_purchase_report(p_store uuid, p_from date, p_to date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare sup jsonb; prod jsonb;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', n, 'count', c, 'total', t, 'unpaid', u) order by t desc), '[]') into sup from (
    select coalesce(s.supplier_name, 'Tanpa supplier') n, count(*) c, sum(p.total_amount) t, coalesce(sum(p.total_amount) filter (where p.payment_status = 'unpaid'), 0) u
    from purchases p left join suppliers s on s.id = p.supplier_id where p.store_id = p_store and p.receiving_status = 'received' and p.purchase_date between p_from and p_to group by 1) x;
  select coalesce(jsonb_agg(jsonb_build_object('name', n, 'qty', q, 'total', t) order by t desc), '[]') into prod from (
    select pr.product_name n, sum(i.quantity) q, sum(i.subtotal) t from purchase_items i join purchases p on p.id = i.purchase_id join products pr on pr.id = i.product_id
    where p.store_id = p_store and p.receiving_status = 'received' and p.purchase_date between p_from and p_to group by 1) y;
  return jsonb_build_object('by_supplier', sup, 'by_product', prod);
end $$;
grant execute on function public.get_sales_breakdown(uuid, date, date), public.get_purchase_report(uuid, date, date) to authenticated;
