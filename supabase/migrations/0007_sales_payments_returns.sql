-- 0007: Penjualan, pembayaran (uang diterima, referensi, rekening, status gagal),
-- retur sebagian, pengaturan struk dan stok.

------------------------------------------------------------------------------
-- Pengaturan toko (struk, stok) dan pengaturan pembayaran
------------------------------------------------------------------------------
create table public.store_settings (
  store_id uuid primary key references public.stores on delete cascade,
  receipt_footer text not null default 'Terima kasih sudah berbelanja',
  receipt_width integer not null default 58 check (receipt_width in (58, 80)),
  auto_print_receipt boolean not null default false,
  default_unit text not null default 'pcs',
  default_minimum_stock integer not null default 0 check (default_minimum_stock >= 0),
  updated_at timestamptz not null default now()
);
alter table public.store_settings enable row level security;
create policy ss_read on public.store_settings for select using (is_member(store_id));
create policy ss_write on public.store_settings for all using (is_owner(store_id)) with check (is_owner(store_id));
insert into public.store_settings (store_id) select id from public.stores on conflict do nothing;

alter table public.store_payment_settings
  add column bank_name text, add column bank_account_number text, add column bank_account_name text;
insert into public.store_payment_settings (store_id, payment_method)
  select s.id, m.method from public.stores s cross join (values ('cash'), ('transfer'), ('qris')) as m(method)
  on conflict (store_id, payment_method) do nothing;
-- QRIS tanpa gambar belum bisa dipakai
update public.store_payment_settings set is_active = false where payment_method = 'qris' and qris_path is null;

------------------------------------------------------------------------------
-- Kolom tambahan penjualan: uang diterima, kembalian, total refund
------------------------------------------------------------------------------
alter table public.sales
  add column received_amount bigint, add column change_amount bigint not null default 0,
  add column refunded_amount bigint not null default 0;
update public.sales set received_amount = total_amount where received_amount is null;
update public.sales s set refunded_amount = r.refund_amount from public.sale_returns r where r.sale_id = s.id;

------------------------------------------------------------------------------
-- Finalisasi, pembuatan, konfirmasi, pembatalan, dan kegagalan transaksi
------------------------------------------------------------------------------
create or replace function public._finalize_sale(p_sale uuid) returns void language plpgsql security definer set search_path = public as $$
declare s sales; it record; p products;
begin
  select * into s from sales where id = p_sale for update;
  if s.payment_status <> 'pending' then raise exception 'Transaksi sudah diproses'; end if;
  for it in select * from sale_items where sale_id = p_sale loop
    select * into p from products where id = it.product_id for update;
    if p.stock < it.quantity then raise exception 'Stok % tidak mencukupi', p.product_name; end if;
    update products set stock = stock - it.quantity, updated_at = now() where id = p.id;
    insert into stock_movements (store_id, product_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, created_by)
      values (s.store_id, p.id, 'sale_out', -it.quantity, p.stock, p.stock - it.quantity, 'sale', s.id, auth.uid());
  end loop;
  update sales set payment_status = 'paid' where id = p_sale;
  update payments set payment_status = 'paid', confirmed_by = auth.uid(), confirmed_at = now() where sale_id = p_sale and payment_status = 'pending';
  perform _audit(s.store_id, 'confirm_payment', 'sales', p_sale, jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'paid', 'invoice', s.invoice_number, 'total', s.total_amount, 'method', s.payment_method));
end $$;

drop function if exists public.create_sale(uuid, jsonb, bigint, text, text);
create function public.create_sale(p_store uuid, p_items jsonb, p_discount bigint, p_method text,
  p_reference text default null, p_received bigint default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid := gen_random_uuid(); it jsonb; p products; q int; sub bigint := 0; total bigint; disc bigint := coalesce(p_discount, 0); inv text;
begin
  if not is_member(p_store) then raise exception 'Tidak diizinkan'; end if;
  if p_method not in ('cash', 'transfer', 'qris') then raise exception 'Metode pembayaran tidak valid'; end if;
  if exists (select 1 from store_payment_settings where store_id = p_store and payment_method = p_method and not is_active) then
    raise exception 'Metode pembayaran % sedang dinonaktifkan', case p_method when 'cash' then 'tunai' when 'transfer' then 'transfer' else 'QRIS' end;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Keranjang kosong'; end if;
  if disc < 0 then raise exception 'Diskon tidak valid'; end if;
  inv := next_doc_number(p_store, 'sale', 'INV');
  insert into sales (id, store_id, invoice_number, subtotal, discount, total_amount, payment_method, cashier_id)
    values (sid, p_store, inv, 0, 0, 0, p_method, auth.uid());
  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'quantity')::int;
    if q is null or q <= 0 then raise exception 'Jumlah harus lebih dari nol'; end if;
    select * into p from products where id = (it->>'product_id')::uuid and store_id = p_store and is_active for update;
    if not found then raise exception 'Produk tidak ditemukan'; end if;
    if p.stock < q then raise exception 'Stok % tidak mencukupi', p.product_name; end if;
    insert into sale_items (sale_id, product_id, quantity, selling_price, unit_cost_snapshot, subtotal)
      values (sid, p.id, q, p.selling_price, p.average_cost, p.selling_price * q);
    sub := sub + p.selling_price * q;
  end loop;
  total := sub - disc;
  if total < 0 then raise exception 'Diskon melebihi subtotal'; end if;
  if p_method = 'cash' and (p_received is null or p_received < total) then raise exception 'Uang diterima kurang dari total'; end if;
  update sales set subtotal = sub, discount = disc, total_amount = total,
    received_amount = case when p_method = 'cash' then p_received else total end,
    change_amount = case when p_method = 'cash' then p_received - total else 0 end where id = sid;
  insert into payments (store_id, sale_id, payment_method, payment_amount, payment_reference)
    values (p_store, sid, p_method, total, nullif(trim(coalesce(p_reference, '')), ''));
  perform _audit(p_store, 'create_sale', 'sales', sid, null, jsonb_build_object('invoice', inv, 'total', total, 'method', p_method));
  if p_method = 'cash' then perform _finalize_sale(sid); end if;
  return sid;
end $$;

-- Konfirmasi hanya oleh owner atau kasir pembuat transaksi
create or replace function public.confirm_payment(p_sale uuid, p_reference text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s sales;
begin
  select * into s from sales where id = p_sale;
  if not found or not (is_owner(s.store_id) or (is_member(s.store_id) and s.cashier_id = auth.uid())) then raise exception 'Tidak diizinkan'; end if;
  if nullif(trim(coalesce(p_reference, '')), '') is not null then
    update payments set payment_reference = trim(p_reference) where sale_id = p_sale and payment_status = 'pending';
  end if;
  perform _finalize_sale(p_sale);
end $$;
drop function if exists public.confirm_payment(uuid);

create or replace function public.cancel_pending_sale(p_sale uuid) returns void language plpgsql security definer set search_path = public as $$
declare s sales;
begin
  select * into s from sales where id = p_sale for update;
  if not found or not (is_owner(s.store_id) or (is_member(s.store_id) and s.cashier_id = auth.uid())) then raise exception 'Tidak diizinkan'; end if;
  if s.payment_status <> 'pending' then raise exception 'Hanya transaksi pending yang dapat dibatalkan'; end if;
  update sales set payment_status = 'cancelled' where id = p_sale;
  update payments set payment_status = 'cancelled' where sale_id = p_sale and payment_status = 'pending';
  perform _audit(s.store_id, 'cancel_sale', 'sales', p_sale, jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'cancelled', 'invoice', s.invoice_number));
end $$;

create function public.fail_pending_sale(p_sale uuid, p_reason text default null) returns void language plpgsql security definer set search_path = public as $$
declare s sales;
begin
  select * into s from sales where id = p_sale for update;
  if not found or not (is_owner(s.store_id) or (is_member(s.store_id) and s.cashier_id = auth.uid())) then raise exception 'Tidak diizinkan'; end if;
  if s.payment_status <> 'pending' then raise exception 'Hanya transaksi pending yang dapat ditandai gagal'; end if;
  update sales set payment_status = 'failed' where id = p_sale;
  update payments set payment_status = 'failed' where sale_id = p_sale and payment_status = 'pending';
  perform _audit(s.store_id, 'fail_sale', 'sales', p_sale, jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'failed', 'invoice', s.invoice_number, 'reason', p_reason));
end $$;

------------------------------------------------------------------------------
-- Retur sebagian (sale_return_items). Satu transaksi dapat diretur berkali-kali
------------------------------------------------------------------------------
alter table public.sale_returns drop constraint sale_returns_sale_id_key;
alter table public.sale_returns add column return_number text;
create table public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sale_returns on delete cascade,
  sale_item_id uuid not null references public.sale_items,
  product_id uuid not null references public.products,
  quantity integer not null check (quantity > 0),
  refund_amount bigint not null check (refund_amount >= 0),
  cogs_reversed bigint not null default 0,
  restocked boolean not null
);
create index idx_return_items_item on public.sale_return_items (sale_item_id);
create index idx_return_items_return on public.sale_return_items (return_id);
create index idx_returns_sale on public.sale_returns (sale_id);
alter table public.sale_return_items enable row level security;
create policy rit_owner on public.sale_return_items for select
  using (exists (select 1 from public.sale_returns r where r.id = return_id and is_owner(r.store_id)));
revoke insert, update, delete on public.sale_return_items from anon, authenticated;

-- Data refund lama (penuh) dijadikan baris item agar konsisten
insert into public.sale_return_items (return_id, sale_item_id, product_id, quantity, refund_amount, cogs_reversed, restocked)
select r.id, i.id, i.product_id, i.quantity, i.subtotal, case when r.restock then round(i.quantity * i.unit_cost_snapshot) else 0 end, r.restock
from public.sale_returns r join public.sale_items i on i.sale_id = r.sale_id;

drop function if exists public.refund_sale(uuid, text, boolean);
create function public.refund_sale(p_sale uuid, p_reason text, p_restock boolean, p_items jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare s sales; it sale_items; pr products; line jsonb; rid uuid := gen_random_uuid(); qty int; done_qty int; line_refund bigint; line_cogs bigint;
  tot_refund bigint := 0; tot_cogs bigint := 0; n int := 0; fully boolean; prior bigint;
begin
  select * into s from sales where id = p_sale for update;
  if not found or not is_owner(s.store_id) then raise exception 'Tidak diizinkan'; end if;
  if s.payment_status <> 'paid' then raise exception 'Hanya transaksi lunas yang dapat direfund'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan wajib diisi'; end if;
  prior := s.refunded_amount;
  insert into sale_returns (id, store_id, sale_id, reason, refund_amount, restock, cogs_reversed, created_by, return_number)
    values (rid, s.store_id, p_sale, trim(p_reason), 0, coalesce(p_restock, false), 0, auth.uid(), next_doc_number(s.store_id, 'return', 'RT'));

  -- Tanpa p_items: retur seluruh sisa barang
  for line in select * from jsonb_array_elements(coalesce(p_items,
      (select coalesce(jsonb_agg(jsonb_build_object('sale_item_id', i.id, 'quantity',
         i.quantity - coalesce((select sum(r.quantity) from sale_return_items r where r.sale_item_id = i.id), 0))), '[]'::jsonb)
       from sale_items i where i.sale_id = p_sale))) loop
    qty := (line->>'quantity')::int;
    if qty is null or qty = 0 then continue; end if;
    if qty < 0 then raise exception 'Jumlah retur tidak valid'; end if;
    select * into it from sale_items where id = (line->>'sale_item_id')::uuid and sale_id = p_sale;
    if not found then raise exception 'Barang tidak ada pada transaksi ini'; end if;
    select coalesce(sum(quantity), 0) into done_qty from sale_return_items where sale_item_id = it.id;
    if qty > it.quantity - done_qty then raise exception 'Jumlah retur melebihi jumlah yang terjual'; end if;
    -- Diskon transaksi dibagi proporsional ke tiap barang
    line_refund := case when s.subtotal = 0 then 0 else round(it.subtotal::numeric * qty / it.quantity * s.total_amount / s.subtotal) end;
    line_cogs := 0;
    if p_restock then
      select * into pr from products where id = it.product_id for update;
      update products set stock = stock + qty, updated_at = now() where id = pr.id;
      insert into stock_movements (store_id, product_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, notes, created_by)
        values (s.store_id, pr.id, 'return_in', qty, pr.stock, pr.stock + qty, 'refund', p_sale, trim(p_reason), auth.uid());
      line_cogs := round(qty * it.unit_cost_snapshot);
    end if;
    insert into sale_return_items (return_id, sale_item_id, product_id, quantity, refund_amount, cogs_reversed, restocked)
      values (rid, it.id, it.product_id, qty, line_refund, line_cogs, coalesce(p_restock, false));
    tot_refund := tot_refund + line_refund; tot_cogs := tot_cogs + line_cogs; n := n + 1;
  end loop;
  if n = 0 then raise exception 'Pilih barang yang diretur'; end if;

  fully := not exists (select 1 from sale_items i where i.sale_id = p_sale
    and i.quantity > coalesce((select sum(r.quantity) from sale_return_items r where r.sale_item_id = i.id), 0));
  if fully then -- sisa pembulatan masuk ke retur terakhir agar total refund = total transaksi
    tot_refund := s.total_amount - prior;
  end if;
  update sale_returns set refund_amount = tot_refund, cogs_reversed = tot_cogs where id = rid;
  update sales set refunded_amount = prior + tot_refund, payment_status = case when fully then 'refunded' else 'paid' end where id = p_sale;
  if fully then update payments set payment_status = 'refunded' where sale_id = p_sale; end if;
  perform _audit(s.store_id, case when fully then 'refund_sale' else 'partial_refund_sale' end, 'sales', p_sale, to_jsonb(s),
    jsonb_build_object('reason', p_reason, 'restock', p_restock, 'refund_amount', tot_refund, 'return_id', rid));
  return rid;
end $$;

------------------------------------------------------------------------------
-- Data struk dan detail transaksi (aman untuk kasir: tanpa harga modal)
------------------------------------------------------------------------------
create or replace function public.get_receipt(p_sale uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s sales; st stores; ss store_settings;
begin
  select * into s from sales where id = p_sale;
  if not found or not (is_owner(s.store_id) or (is_member(s.store_id) and s.cashier_id = auth.uid())) then raise exception 'Tidak diizinkan'; end if;
  select * into st from stores where id = s.store_id;
  select * into ss from store_settings where store_id = s.store_id;
  return jsonb_build_object('id', s.id, 'store', st.store_name, 'address', st.address, 'phone', st.phone, 'invoice', s.invoice_number, 'date', s.sale_date,
    'cashier', (select full_name from profiles where id = s.cashier_id), 'method', s.payment_method, 'status', s.payment_status,
    'subtotal', s.subtotal, 'discount', s.discount, 'total', s.total_amount, 'received', s.received_amount, 'change', s.change_amount,
    'refunded', s.refunded_amount, 'footer', coalesce(ss.receipt_footer, 'Terima kasih'),
    'reference', (select payment_reference from payments where sale_id = s.id order by created_at desc limit 1),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', p.product_name, 'quantity', i.quantity, 'price', i.selling_price,
        'subtotal', i.subtotal, 'returned', coalesce((select sum(r.quantity) from sale_return_items r where r.sale_item_id = i.id), 0)) order by p.product_name), '[]')
      from sale_items i join products p on p.id = i.product_id where i.sale_id = s.id));
end $$;

------------------------------------------------------------------------------
-- Buat toko: sekaligus mengisi pengaturan bawaan. Dilengkapi di 0008 (kategori pengeluaran).
------------------------------------------------------------------------------
grant execute on function public.create_sale(uuid, jsonb, bigint, text, text, bigint), public.confirm_payment(uuid, text),
  public.cancel_pending_sale(uuid), public.fail_pending_sale(uuid, text), public.refund_sale(uuid, text, boolean, jsonb),
  public.get_receipt(uuid) to authenticated;
