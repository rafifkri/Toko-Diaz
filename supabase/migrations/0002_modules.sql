-- Tabel pendukung
create table public.suppliers (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores on delete cascade,
  supplier_name text not null, phone text, address text, contact_person text, notes text, is_active boolean not null default true, created_at timestamptz not null default now());
create table public.purchases (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores on delete cascade,
  supplier_id uuid references public.suppliers, purchase_number text not null, purchase_date date not null default current_date,
  subtotal bigint not null default 0, discount bigint not null default 0, total_amount bigint not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid')),
  receiving_status text not null default 'draft' check (receiving_status in ('draft','received','cancelled')),
  notes text, created_by uuid references public.profiles, created_at timestamptz not null default now(), unique (store_id, purchase_number));
create table public.purchase_items (id uuid primary key default gen_random_uuid(), purchase_id uuid not null references public.purchases on delete cascade,
  product_id uuid not null references public.products, quantity integer not null check (quantity > 0), unit_cost bigint not null check (unit_cost >= 0), subtotal bigint not null);
create table public.expenses (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores on delete cascade,
  expense_number text not null, expense_date date not null default current_date, category text not null, description text,
  amount bigint not null check (amount > 0), payment_method text not null default 'cash', receipt_path text,
  status text not null default 'active' check (status in ('active','voided')), created_by uuid references public.profiles, created_at timestamptz not null default now(), unique (store_id, expense_number));
create table public.store_payment_settings (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores on delete cascade,
  payment_method text not null check (payment_method in ('cash','transfer','qris')), qris_path text, is_active boolean not null default true,
  updated_at timestamptz not null default now(), unique (store_id, payment_method));
create table public.audit_logs (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores on delete cascade,
  user_id uuid, action text not null, table_name text, record_id uuid, old_data jsonb, new_data jsonb, created_at timestamptz not null default now());
create sequence public.doc_seq;

alter table suppliers enable row level security; alter table purchases enable row level security; alter table purchase_items enable row level security;
alter table expenses enable row level security; alter table store_payment_settings enable row level security; alter table audit_logs enable row level security;
create policy sup_owner on suppliers for all using (is_owner(store_id)) with check (is_owner(store_id));
create policy pur_owner on purchases for all using (is_owner(store_id)) with check (is_owner(store_id));
create policy pit_owner on purchase_items for all using (exists (select 1 from purchases p where p.id = purchase_id and is_owner(p.store_id)));
create policy exp_owner on expenses for all using (is_owner(store_id)) with check (is_owner(store_id));
create policy sps_read on store_payment_settings for select using (is_member(store_id));
create policy sps_write on store_payment_settings for all using (is_owner(store_id)) with check (is_owner(store_id));
create policy aud_owner on audit_logs for select using (is_owner(store_id));

-- View produk untuk kasir (tanpa harga modal)
create view public.products_pos as
  select id, store_id, category_id, product_code, barcode, product_name, unit, selling_price, stock, minimum_stock, image_url
  from public.products where is_active and is_member(store_id);
grant select on public.products_pos to authenticated;

-- Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
 ('product-images','product-images',false,2097152,'{image/png,image/jpeg}'), ('store-logos','store-logos',false,2097152,'{image/png,image/jpeg}'),
 ('qris-images','qris-images',false,2097152,'{image/png,image/jpeg}'), ('expense-receipts','expense-receipts',false,5242880,'{image/png,image/jpeg,application/pdf}')
 on conflict (id) do nothing;
create policy st_member_read on storage.objects for select using (bucket_id in ('product-images','store-logos','qris-images') and is_member(((storage.foldername(name))[1])::uuid));
create policy st_owner_all on storage.objects for all
  using (bucket_id in ('product-images','store-logos','qris-images','expense-receipts') and is_owner(((storage.foldername(name))[1])::uuid))
  with check (bucket_id in ('product-images','store-logos','qris-images','expense-receipts') and is_owner(((storage.foldername(name))[1])::uuid));

create function public._audit(sid uuid, act text, tbl text, rid uuid, o jsonb, n jsonb) returns void language sql security definer set search_path = public as
$$ insert into audit_logs (store_id, user_id, action, table_name, record_id, old_data, new_data) values (sid, auth.uid(), act, tbl, rid, o, n) $$;
revoke all on function public._audit(uuid, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;

-- Pembelian: draft, lalu received (stok + weighted average)
create function public.create_purchase(p_store uuid, p_supplier uuid, p_items jsonb, p_discount bigint, p_paid boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid := gen_random_uuid(); it jsonb; sub bigint := 0; line bigint;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Daftar barang kosong'; end if;
  insert into purchases (id, store_id, supplier_id, purchase_number, payment_status, created_by)
    values (pid, p_store, p_supplier, 'PB-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('doc_seq')::text, 5, '0'), case when p_paid then 'paid' else 'unpaid' end, auth.uid());
  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'quantity')::int <= 0 or (it->>'unit_cost')::bigint < 0 then raise exception 'Jumlah atau harga tidak valid'; end if;
    if not exists (select 1 from products where id = (it->>'product_id')::uuid and store_id = p_store) then raise exception 'Produk tidak ditemukan'; end if;
    line := (it->>'quantity')::int * (it->>'unit_cost')::bigint; sub := sub + line;
    insert into purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal) values (pid, (it->>'product_id')::uuid, (it->>'quantity')::int, (it->>'unit_cost')::bigint, line);
  end loop;
  if coalesce(p_discount, 0) > sub or coalesce(p_discount, 0) < 0 then raise exception 'Diskon tidak valid'; end if;
  update purchases set subtotal = sub, discount = coalesce(p_discount, 0), total_amount = sub - coalesce(p_discount, 0) where id = pid;
  return pid;
end $$;

create function public.receive_purchase(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare pu purchases; it record; pr products; new_avg numeric;
begin
  select * into pu from purchases where id = p_id for update;
  if not found or not is_owner(pu.store_id) then raise exception 'Tidak diizinkan'; end if;
  if pu.receiving_status <> 'draft' then raise exception 'Pembelian sudah diproses'; end if;
  for it in select * from purchase_items where purchase_id = p_id loop
    select * into pr from products where id = it.product_id for update;
    new_avg := (pr.stock * pr.average_cost + it.quantity * it.unit_cost)::numeric / (pr.stock + it.quantity);
    update products set stock = stock + it.quantity, average_cost = new_avg, purchase_price = it.unit_cost, updated_at = now() where id = pr.id;
    insert into stock_movements (store_id, product_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, created_by)
      values (pu.store_id, pr.id, 'purchase_in', it.quantity, pr.stock, pr.stock + it.quantity, 'purchase', p_id, auth.uid());
  end loop;
  update purchases set receiving_status = 'received' where id = p_id;
  perform _audit(pu.store_id, 'receive_purchase', 'purchases', p_id, null, to_jsonb(pu));
end $$;

create function public.cancel_purchase(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare pu purchases;
begin
  select * into pu from purchases where id = p_id for update;
  if not found or not is_owner(pu.store_id) then raise exception 'Tidak diizinkan'; end if;
  if pu.receiving_status <> 'draft' then raise exception 'Hanya pembelian draft yang dapat dibatalkan'; end if;
  update purchases set receiving_status = 'cancelled' where id = p_id;
  perform _audit(pu.store_id, 'cancel_purchase', 'purchases', p_id, to_jsonb(pu), null);
end $$;

create function public.adjust_stock(p_product uuid, p_delta integer, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare pr products;
begin
  select * into pr from products where id = p_product for update;
  if not found or not is_owner(pr.store_id) then raise exception 'Tidak diizinkan'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan wajib diisi'; end if;
  if pr.stock + p_delta < 0 then raise exception 'Stok tidak boleh negatif'; end if;
  update products set stock = stock + p_delta, updated_at = now() where id = p_product;
  insert into stock_movements (store_id, product_id, movement_type, quantity, stock_before, stock_after, reference_type, notes, created_by)
    values (pr.store_id, p_product, 'adjustment', p_delta, pr.stock, pr.stock + p_delta, 'adjustment', p_reason, auth.uid());
  perform _audit(pr.store_id, 'adjust_stock', 'products', p_product, jsonb_build_object('stock', pr.stock), jsonb_build_object('stock', pr.stock + p_delta, 'reason', p_reason));
end $$;

create function public.add_expense(p_store uuid, p_date date, p_category text, p_desc text, p_amount bigint, p_method text) returns uuid
language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  insert into expenses (store_id, expense_number, expense_date, category, description, amount, payment_method, created_by)
    values (p_store, 'EX-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('doc_seq')::text, 5, '0'), p_date, p_category, p_desc, p_amount, p_method, auth.uid()) returning id into eid;
  return eid;
end $$;

create function public.void_expense(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare e expenses;
begin
  select * into e from expenses where id = p_id for update;
  if not found or not is_owner(e.store_id) then raise exception 'Tidak diizinkan'; end if;
  update expenses set status = 'voided' where id = p_id;
  perform _audit(e.store_id, 'void_expense', 'expenses', p_id, to_jsonb(e), jsonb_build_object('reason', p_reason));
end $$;

grant execute on function public.create_purchase(uuid, uuid, jsonb, bigint, boolean), public.receive_purchase(uuid), public.cancel_purchase(uuid),
  public.adjust_stock(uuid, integer, text), public.add_expense(uuid, date, text, text, bigint, text), public.void_expense(uuid, text) to authenticated;
