-- Toko Diaz POS: skema inti, RLS, dan fungsi atomik penjualan
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text, email text, phone text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles,
  store_name text not null, logo_url text, address text, phone text, email text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table public.store_users (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  user_id uuid not null references public.profiles,
  role text not null check (role in ('owner','cashier')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(), unique (store_id, user_id));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  category_name text not null, description text,
  created_at timestamptz not null default now(), unique (store_id, category_name));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  category_id uuid references public.categories,
  product_code text not null, barcode text, product_name text not null, unit text not null default 'pcs',
  purchase_price bigint not null default 0 check (purchase_price >= 0),
  average_cost numeric(18,4) not null default 0 check (average_cost >= 0),
  selling_price bigint not null default 0 check (selling_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  image_url text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (store_id, product_code));
create index on public.products (store_id, product_name);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  product_id uuid not null references public.products,
  movement_type text not null, quantity integer not null,
  stock_before integer not null, stock_after integer not null,
  reference_type text, reference_id uuid, notes text,
  created_by uuid references public.profiles, created_at timestamptz not null default now());

create sequence public.invoice_seq;
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  invoice_number text not null, sale_date timestamptz not null default now(),
  subtotal bigint not null, discount bigint not null default 0, total_amount bigint not null,
  payment_method text not null check (payment_method in ('cash','transfer','qris')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','cancelled')),
  cashier_id uuid references public.profiles, created_at timestamptz not null default now(),
  unique (store_id, invoice_number));
create index on public.sales (store_id, sale_date);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales on delete cascade,
  product_id uuid not null references public.products,
  quantity integer not null check (quantity > 0),
  selling_price bigint not null, unit_cost_snapshot numeric(18,4) not null, subtotal bigint not null);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  sale_id uuid not null references public.sales,
  payment_method text not null, payment_amount bigint not null,
  payment_status text not null default 'pending',
  payment_reference text, confirmed_by uuid references public.profiles, confirmed_at timestamptz,
  created_at timestamptz not null default now());
create unique index payments_one_active on public.payments (sale_id) where payment_status in ('pending','paid');

-- Helper akses
create function public.is_member(sid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from store_users where store_id = sid and user_id = auth.uid() and is_active) $$;
create function public.is_owner(sid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from store_users where store_id = sid and user_id = auth.uid() and is_active and role = 'owner') $$;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as
$$ begin insert into profiles (id, email, full_name) values (new.id, new.email, new.raw_user_meta_data->>'full_name'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RLS
alter table profiles enable row level security; alter table stores enable row level security;
alter table store_users enable row level security; alter table categories enable row level security;
alter table products enable row level security; alter table stock_movements enable row level security;
alter table sales enable row level security; alter table sale_items enable row level security;
alter table payments enable row level security;

create policy profiles_self on profiles for select using (id = auth.uid());
create policy stores_member on stores for select using (is_member(id));
create policy stores_owner_upd on stores for update using (is_owner(id));
create policy su_self on store_users for select using (user_id = auth.uid() or is_owner(store_id));
create policy cat_read on categories for select using (is_member(store_id));
create policy cat_write on categories for all using (is_owner(store_id)) with check (is_owner(store_id));
-- Catatan: cashier tidak boleh melihat harga modal. Produk untuk kasir dibaca lewat view pada phase berikutnya;
-- sementara tabel products hanya dapat dibaca owner.
create policy prod_owner on products for all using (is_owner(store_id)) with check (is_owner(store_id));
create policy mov_owner on stock_movements for select using (is_owner(store_id));
create policy sales_read on sales for select using (is_owner(store_id) or (is_member(store_id) and cashier_id = auth.uid()));
create policy items_read on sale_items for select using (exists (select 1 from sales s where s.id = sale_id and (is_owner(s.store_id) or s.cashier_id = auth.uid())));
create policy pay_read on payments for select using (is_owner(store_id) or exists (select 1 from sales s where s.id = sale_id and s.cashier_id = auth.uid()));
-- sales, sale_items, payments, stock_movements: tanpa policy tulis; hanya diubah lewat fungsi di bawah.

-- Membuat toko + keanggotaan owner
create function public.create_store(p_store_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi'; end if;
  if coalesce(trim(p_store_name), '') = '' then raise exception 'Nama toko wajib diisi'; end if;
  if exists (select 1 from store_users where user_id = auth.uid()) then raise exception 'Akun sudah memiliki toko'; end if;
  insert into stores (owner_id, store_name) values (auth.uid(), trim(p_store_name)) returning id into sid;
  insert into store_users (store_id, user_id, role) values (sid, auth.uid(), 'owner');
  return sid;
end $$;

-- Finalisasi pembayaran: kurangi stok tepat sekali
create function public._finalize_sale(p_sale uuid) returns void language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on function public._finalize_sale(uuid) from public, anon, authenticated;

-- p_items: [{"product_id": "...", "quantity": 2}] ; harga selalu diambil dari database
create function public.create_sale(p_store uuid, p_items jsonb, p_discount bigint, p_method text, p_reference text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid := gen_random_uuid(); it jsonb; p products; q int; sub bigint := 0; total bigint;
begin
  if not is_member(p_store) then raise exception 'Tidak diizinkan'; end if;
  if p_method not in ('cash','transfer','qris') then raise exception 'Metode pembayaran tidak valid'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Keranjang kosong'; end if;
  if coalesce(p_discount, 0) < 0 then raise exception 'Diskon tidak valid'; end if;
  insert into sales (id, store_id, invoice_number, subtotal, discount, total_amount, payment_method, cashier_id)
    values (sid, p_store, 'INV-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || '-' || lpad(nextval('invoice_seq')::text, 5, '0'), 0, 0, 0, p_method, auth.uid());
  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'quantity')::int;
    if q <= 0 then raise exception 'Jumlah harus lebih dari nol'; end if;
    select * into p from products where id = (it->>'product_id')::uuid and store_id = p_store and is_active for update;
    if not found then raise exception 'Produk tidak ditemukan'; end if;
    if p.stock < q then raise exception 'Stok % tidak mencukupi', p.product_name; end if;
    insert into sale_items (sale_id, product_id, quantity, selling_price, unit_cost_snapshot, subtotal)
      values (sid, p.id, q, p.selling_price, p.average_cost, p.selling_price * q);
    sub := sub + p.selling_price * q;
  end loop;
  total := sub - coalesce(p_discount, 0);
  if total < 0 then raise exception 'Diskon melebihi subtotal'; end if;
  update sales set subtotal = sub, discount = coalesce(p_discount, 0), total_amount = total where id = sid;
  insert into payments (store_id, sale_id, payment_method, payment_amount, payment_reference) values (p_store, sid, p_method, total, p_reference);
  if p_method = 'cash' then perform _finalize_sale(sid); end if;
  return sid;
end $$;

-- Konfirmasi manual transfer/QRIS oleh kasir; tidak bisa dikonfirmasi dua kali
create function public.confirm_payment(p_sale uuid) returns void language plpgsql security definer set search_path = public as $$
declare s sales;
begin
  select * into s from sales where id = p_sale;
  if not found or not is_member(s.store_id) then raise exception 'Tidak diizinkan'; end if;
  perform _finalize_sale(p_sale);
end $$;

create function public.cancel_pending_sale(p_sale uuid) returns void language plpgsql security definer set search_path = public as $$
declare s sales;
begin
  select * into s from sales where id = p_sale for update;
  if not found or not is_member(s.store_id) then raise exception 'Tidak diizinkan'; end if;
  if s.payment_status <> 'pending' then raise exception 'Hanya transaksi pending yang dapat dibatalkan'; end if;
  update sales set payment_status = 'cancelled' where id = p_sale;
  update payments set payment_status = 'cancelled' where sale_id = p_sale and payment_status = 'pending';
end $$;

grant execute on function public.create_store(text), public.create_sale(uuid, jsonb, bigint, text, text),
  public.confirm_payment(uuid), public.cancel_pending_sale(uuid) to authenticated;
