-- 0008: Pembelian (diskon masuk HPP, pembayaran utang, edit draft), stok (jenis keluar, opname),
-- pengeluaran (edit, kategori, bukti), dan pembuatan toko dengan data bawaan.

------------------------------------------------------------------------------
-- Pembelian
------------------------------------------------------------------------------
alter table public.purchases drop constraint purchases_payment_status_check;
alter table public.purchases
  add column paid_amount bigint not null default 0,
  add column pay_on_receive boolean not null default false,
  add column payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'other')),
  add column due_date date;
alter table public.purchase_items add column allocated_cost numeric(18, 4);
update public.purchase_items set allocated_cost = unit_cost where allocated_cost is null;

create table public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  purchase_id uuid not null references public.purchases on delete cascade,
  payment_date date not null default current_date,
  amount bigint not null check (amount > 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'other')),
  notes text,
  created_by uuid references public.profiles,
  created_at timestamptz not null default now()
);
create index idx_purchase_payments_purchase on public.purchase_payments (purchase_id);
create index idx_purchase_payments_date on public.purchase_payments (store_id, payment_date);
alter table public.purchase_payments enable row level security;
create policy ppay_read on public.purchase_payments for select using (is_owner(store_id));
revoke insert, update, delete on public.purchase_payments from anon, authenticated;

-- Data lama: pembelian diterima yang sudah lunas dibuatkan catatan pembayarannya
update public.purchases set pay_on_receive = true, payment_status = 'unpaid' where receiving_status = 'draft' and payment_status = 'paid';
update public.purchases set payment_status = 'unpaid' where receiving_status = 'cancelled' and payment_status = 'paid';
insert into public.purchase_payments (store_id, purchase_id, payment_date, amount, payment_method, notes)
  select store_id, id, purchase_date, total_amount, 'cash', 'Pembayaran awal (migrasi)'
  from public.purchases where receiving_status = 'received' and payment_status = 'paid' and total_amount > 0;
update public.purchases set paid_amount = total_amount where receiving_status = 'received' and payment_status = 'paid';
alter table public.purchases add constraint purchases_payment_status_check check (payment_status in ('unpaid', 'partial', 'paid'));
alter table public.purchases add constraint purchases_paid_amount_check check (paid_amount >= 0 and paid_amount <= total_amount);

drop function if exists public.create_purchase(uuid, uuid, jsonb, bigint, boolean);
create function public.create_purchase(p_store uuid, p_supplier uuid, p_items jsonb, p_discount bigint, p_paid boolean,
  p_date date default current_date, p_method text default 'cash', p_notes text default null, p_due date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid := gen_random_uuid(); it jsonb; sub bigint := 0; line bigint; disc bigint := coalesce(p_discount, 0);
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Daftar barang kosong'; end if;
  if p_supplier is not null and not exists (select 1 from suppliers where id = p_supplier and store_id = p_store) then raise exception 'Supplier tidak ditemukan'; end if;
  if p_method not in ('cash', 'transfer', 'other') then raise exception 'Metode pembayaran tidak valid'; end if;
  insert into purchases (id, store_id, supplier_id, purchase_number, purchase_date, payment_method, notes, due_date, pay_on_receive, created_by)
    values (pid, p_store, p_supplier, next_doc_number(p_store, 'purchase', 'PB'), coalesce(p_date, current_date), p_method, nullif(trim(coalesce(p_notes, '')), ''), p_due, coalesce(p_paid, false), auth.uid());
  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'quantity')::int <= 0 or (it->>'unit_cost')::bigint < 0 then raise exception 'Jumlah atau harga tidak valid'; end if;
    if not exists (select 1 from products where id = (it->>'product_id')::uuid and store_id = p_store) then raise exception 'Produk tidak ditemukan'; end if;
    line := (it->>'quantity')::int * (it->>'unit_cost')::bigint; sub := sub + line;
    insert into purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal) values (pid, (it->>'product_id')::uuid, (it->>'quantity')::int, (it->>'unit_cost')::bigint, line);
  end loop;
  if disc > sub or disc < 0 then raise exception 'Diskon tidak valid'; end if;
  update purchases set subtotal = sub, discount = disc, total_amount = sub - disc where id = pid;
  perform _audit(p_store, 'create_purchase', 'purchases', pid, null, jsonb_build_object('total', sub - disc, 'items', jsonb_array_length(p_items)));
  return pid;
end $$;

-- Edit draft: hanya sebelum barang diterima
create function public.update_purchase_draft(p_id uuid, p_supplier uuid, p_items jsonb, p_discount bigint, p_paid boolean,
  p_date date, p_method text, p_notes text, p_due date default null) returns void
language plpgsql security definer set search_path = public as $$
declare pu purchases; it jsonb; sub bigint := 0; line bigint; disc bigint := coalesce(p_discount, 0);
begin
  select * into pu from purchases where id = p_id for update;
  if not found or not is_owner(pu.store_id) then raise exception 'Tidak diizinkan'; end if;
  if pu.receiving_status <> 'draft' then raise exception 'Hanya pembelian draft yang dapat diubah'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Daftar barang kosong'; end if;
  if p_supplier is not null and not exists (select 1 from suppliers where id = p_supplier and store_id = pu.store_id) then raise exception 'Supplier tidak ditemukan'; end if;
  if p_method not in ('cash', 'transfer', 'other') then raise exception 'Metode pembayaran tidak valid'; end if;
  delete from purchase_items where purchase_id = p_id;
  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'quantity')::int <= 0 or (it->>'unit_cost')::bigint < 0 then raise exception 'Jumlah atau harga tidak valid'; end if;
    if not exists (select 1 from products where id = (it->>'product_id')::uuid and store_id = pu.store_id) then raise exception 'Produk tidak ditemukan'; end if;
    line := (it->>'quantity')::int * (it->>'unit_cost')::bigint; sub := sub + line;
    insert into purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal) values (p_id, (it->>'product_id')::uuid, (it->>'quantity')::int, (it->>'unit_cost')::bigint, line);
  end loop;
  if disc > sub or disc < 0 then raise exception 'Diskon tidak valid'; end if;
  update purchases set supplier_id = p_supplier, subtotal = sub, discount = disc, total_amount = sub - disc, pay_on_receive = coalesce(p_paid, false),
    purchase_date = coalesce(p_date, purchase_date), payment_method = p_method, notes = nullif(trim(coalesce(p_notes, '')), ''), due_date = p_due where id = p_id;
  perform _audit(pu.store_id, 'update_purchase', 'purchases', p_id, to_jsonb(pu), jsonb_build_object('total', sub - disc));
end $$;

-- Terima barang. Diskon pembelian dibagi proporsional ke tiap barang sehingga
-- nilai persediaan sama dengan uang yang benar-benar keluar.
create or replace function public.receive_purchase(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare pu purchases; it record; pr products; ratio numeric; alloc numeric; new_avg numeric;
begin
  select * into pu from purchases where id = p_id for update;
  if not found or not is_owner(pu.store_id) then raise exception 'Tidak diizinkan'; end if;
  if pu.receiving_status <> 'draft' then raise exception 'Pembelian sudah diproses'; end if;
  ratio := case when pu.subtotal > 0 then pu.total_amount::numeric / pu.subtotal else 0 end;
  for it in select * from purchase_items where purchase_id = p_id loop
    alloc := it.unit_cost * ratio;
    select * into pr from products where id = it.product_id for update;
    new_avg := (pr.stock * pr.average_cost + it.quantity * alloc) / (pr.stock + it.quantity);
    update products set stock = stock + it.quantity, average_cost = new_avg, purchase_price = it.unit_cost, updated_at = now() where id = pr.id;
    update purchase_items set allocated_cost = alloc where id = it.id;
    insert into stock_movements (store_id, product_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, created_by)
      values (pu.store_id, pr.id, 'purchase_in', it.quantity, pr.stock, pr.stock + it.quantity, 'purchase', p_id, auth.uid());
  end loop;
  update purchases set receiving_status = 'received' where id = p_id;
  if pu.pay_on_receive and pu.total_amount > 0 then
    insert into purchase_payments (store_id, purchase_id, payment_date, amount, payment_method, notes, created_by)
      values (pu.store_id, p_id, pu.purchase_date, pu.total_amount, pu.payment_method, 'Dibayar saat barang diterima', auth.uid());
    update purchases set paid_amount = total_amount, payment_status = 'paid' where id = p_id;
  elsif pu.total_amount = 0 then
    update purchases set payment_status = 'paid' where id = p_id;
  end if;
  perform _audit(pu.store_id, 'receive_purchase', 'purchases', p_id, null, to_jsonb(pu));
end $$;

-- Pembayaran utang supplier (boleh dicicil)
create function public.pay_purchase(p_purchase uuid, p_amount bigint, p_method text default 'cash', p_date date default current_date, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pu purchases; paid bigint;
begin
  select * into pu from purchases where id = p_purchase for update;
  if not found or not is_owner(pu.store_id) then raise exception 'Tidak diizinkan'; end if;
  if pu.receiving_status <> 'received' then raise exception 'Pembayaran hanya untuk pembelian yang sudah diterima'; end if;
  if p_method not in ('cash', 'transfer', 'other') then raise exception 'Metode pembayaran tidak valid'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari nol'; end if;
  if p_amount > pu.total_amount - pu.paid_amount then raise exception 'Nominal melebihi sisa utang'; end if;
  insert into purchase_payments (store_id, purchase_id, payment_date, amount, payment_method, notes, created_by)
    values (pu.store_id, p_purchase, coalesce(p_date, current_date), p_amount, p_method, nullif(trim(coalesce(p_notes, '')), ''), auth.uid());
  paid := pu.paid_amount + p_amount;
  update purchases set paid_amount = paid, payment_status = case when paid >= total_amount then 'paid' else 'partial' end where id = p_purchase;
  perform _audit(pu.store_id, 'pay_purchase', 'purchases', p_purchase, jsonb_build_object('paid_amount', pu.paid_amount), jsonb_build_object('paid_amount', paid, 'amount', p_amount));
end $$;

------------------------------------------------------------------------------
-- Stok: jenis stok keluar, HPP untuk stok masuk, dan stok opname
------------------------------------------------------------------------------
drop function if exists public.adjust_stock(uuid, integer, text);
create function public.adjust_stock(p_product uuid, p_delta integer, p_reason text, p_type text default 'adjustment', p_unit_cost numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare pr products; new_avg numeric;
begin
  select * into pr from products where id = p_product for update;
  if not found or not is_owner(pr.store_id) then raise exception 'Tidak diizinkan'; end if;
  if p_type not in ('adjustment', 'damage_out', 'lost_out') then raise exception 'Jenis penyesuaian tidak valid'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Perubahan stok tidak boleh nol'; end if;
  if p_type in ('damage_out', 'lost_out') and p_delta > 0 then raise exception 'Stok rusak atau hilang harus bernilai negatif'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan wajib diisi'; end if;
  if pr.stock + p_delta < 0 then raise exception 'Stok tidak boleh negatif'; end if;
  if p_unit_cost is not null and p_unit_cost < 0 then raise exception 'HPP tidak valid'; end if;
  new_avg := pr.average_cost;
  -- Stok masuk dengan HPP diketahui memakai rata-rata tertimbang (mis. stok awal)
  if p_delta > 0 and p_unit_cost is not null then new_avg := (pr.stock * pr.average_cost + p_delta * p_unit_cost) / (pr.stock + p_delta); end if;
  update products set stock = stock + p_delta, average_cost = new_avg, updated_at = now() where id = p_product;
  insert into stock_movements (store_id, product_id, movement_type, quantity, stock_before, stock_after, reference_type, notes, created_by)
    values (pr.store_id, p_product, p_type, p_delta, pr.stock, pr.stock + p_delta, 'adjustment', trim(p_reason), auth.uid());
  perform _audit(pr.store_id, 'adjust_stock', 'products', p_product, jsonb_build_object('stock', pr.stock, 'average_cost', pr.average_cost),
    jsonb_build_object('stock', pr.stock + p_delta, 'average_cost', new_avg, 'type', p_type, 'reason', p_reason));
end $$;

create table public.stock_opnames (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  opname_number text not null,
  notes text,
  created_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  unique (store_id, opname_number)
);
create table public.stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  opname_id uuid not null references public.stock_opnames on delete cascade,
  product_id uuid not null references public.products,
  system_qty integer not null,
  counted_qty integer not null check (counted_qty >= 0),
  difference integer not null
);
create index idx_opname_items_opname on public.stock_opname_items (opname_id);
create index idx_opnames_store on public.stock_opnames (store_id, created_at desc);
alter table public.stock_opnames enable row level security;
alter table public.stock_opname_items enable row level security;
create policy opn_read on public.stock_opnames for select using (is_owner(store_id));
create policy opi_read on public.stock_opname_items for select
  using (exists (select 1 from public.stock_opnames o where o.id = opname_id and is_owner(o.store_id)));
revoke insert, update, delete on public.stock_opnames, public.stock_opname_items from anon, authenticated;

-- p_items: [{"product_id": "...", "counted": 12}]; selisih menjadi pergerakan stok bertipe opname
create function public.create_stock_opname(p_store uuid, p_items jsonb, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid := gen_random_uuid(); it jsonb; pr products; cnt int; diff int; changed int := 0;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Tidak ada barang yang dihitung'; end if;
  insert into stock_opnames (id, store_id, opname_number, notes, created_by)
    values (oid, p_store, next_doc_number(p_store, 'opname', 'SO'), nullif(trim(coalesce(p_notes, '')), ''), auth.uid());
  for it in select * from jsonb_array_elements(p_items) loop
    cnt := (it->>'counted')::int;
    if cnt is null or cnt < 0 then raise exception 'Jumlah hitung tidak valid'; end if;
    select * into pr from products where id = (it->>'product_id')::uuid and store_id = p_store for update;
    if not found then raise exception 'Produk tidak ditemukan'; end if;
    diff := cnt - pr.stock;
    insert into stock_opname_items (opname_id, product_id, system_qty, counted_qty, difference) values (oid, pr.id, pr.stock, cnt, diff);
    if diff <> 0 then
      update products set stock = cnt, updated_at = now() where id = pr.id;
      insert into stock_movements (store_id, product_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, notes, created_by)
        values (p_store, pr.id, 'opname', diff, pr.stock, cnt, 'opname', oid, coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'Stok opname'), auth.uid());
      changed := changed + 1;
    end if;
  end loop;
  perform _audit(p_store, 'stock_opname', 'stock_opnames', oid, null, jsonb_build_object('items', jsonb_array_length(p_items), 'changed', changed));
  return oid;
end $$;

------------------------------------------------------------------------------
-- Pengeluaran: kategori dikelola sendiri, edit, bukti transaksi
------------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  category_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, category_name)
);
alter table public.expense_categories enable row level security;
create policy ecat_owner on public.expense_categories for all using (is_owner(store_id)) with check (is_owner(store_id));

create function public._seed_store_defaults(p_store uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into store_settings (store_id) values (p_store) on conflict do nothing;
  insert into store_payment_settings (store_id, payment_method, is_active)
    values (p_store, 'cash', true), (p_store, 'transfer', true), (p_store, 'qris', false) on conflict (store_id, payment_method) do nothing;
  insert into expense_categories (store_id, category_name)
    select p_store, c from unnest(array['Token listrik', 'Tagihan listrik', 'Air', 'Plastik dan kemasan', 'Perlengkapan kebersihan', 'Peralatan toko',
      'Transportasi', 'Biaya internet', 'Perbaikan toko', 'Pengeluaran lainnya']) c on conflict do nothing;
end $$;
revoke all on function public._seed_store_defaults(uuid) from public, anon, authenticated;
select public._seed_store_defaults(id) from public.stores;
insert into public.expense_categories (store_id, category_name)
  select distinct store_id, category from public.expenses on conflict do nothing;

alter table public.expenses add constraint expenses_method_check check (payment_method in ('cash', 'transfer', 'qris', 'other'));

drop function if exists public.add_expense(uuid, date, text, text, bigint, text);
create function public.add_expense(p_store uuid, p_date date, p_category text, p_desc text, p_amount bigint, p_method text,
  p_receipt text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  if not is_owner(p_store) then raise exception 'Tidak diizinkan'; end if;
  if coalesce(trim(p_category), '') = '' then raise exception 'Kategori wajib diisi'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari nol'; end if;
  if p_method not in ('cash', 'transfer', 'qris', 'other') then raise exception 'Metode pembayaran tidak valid'; end if;
  insert into expenses (store_id, expense_number, expense_date, category, description, amount, payment_method, receipt_path, created_by)
    values (p_store, next_doc_number(p_store, 'expense', 'EX'), coalesce(p_date, current_date), trim(p_category), nullif(trim(coalesce(p_desc, '')), ''),
      p_amount, p_method, p_receipt, auth.uid()) returning id into eid;
  perform _audit(p_store, 'add_expense', 'expenses', eid, null, jsonb_build_object('category', p_category, 'amount', p_amount));
  return eid;
end $$;

create function public.update_expense(p_id uuid, p_date date, p_category text, p_desc text, p_amount bigint, p_method text, p_receipt text default null)
returns void language plpgsql security definer set search_path = public as $$
declare e expenses;
begin
  select * into e from expenses where id = p_id for update;
  if not found or not is_owner(e.store_id) then raise exception 'Tidak diizinkan'; end if;
  if e.status <> 'active' then raise exception 'Pengeluaran yang dibatalkan tidak dapat diubah'; end if;
  if coalesce(trim(p_category), '') = '' then raise exception 'Kategori wajib diisi'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari nol'; end if;
  if p_method not in ('cash', 'transfer', 'qris', 'other') then raise exception 'Metode pembayaran tidak valid'; end if;
  update expenses set expense_date = coalesce(p_date, expense_date), category = trim(p_category), description = nullif(trim(coalesce(p_desc, '')), ''),
    amount = p_amount, payment_method = p_method, receipt_path = coalesce(p_receipt, receipt_path) where id = p_id;
  perform _audit(e.store_id, 'update_expense', 'expenses', p_id, to_jsonb(e),
    jsonb_build_object('category', p_category, 'amount', p_amount, 'date', p_date, 'method', p_method));
end $$;

create or replace function public.void_expense(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare e expenses;
begin
  select * into e from expenses where id = p_id for update;
  if not found or not is_owner(e.store_id) then raise exception 'Tidak diizinkan'; end if;
  if e.status <> 'active' then raise exception 'Pengeluaran sudah dibatalkan'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan wajib diisi'; end if;
  update expenses set status = 'voided' where id = p_id;
  perform _audit(e.store_id, 'void_expense', 'expenses', p_id, to_jsonb(e), jsonb_build_object('reason', p_reason));
end $$;

------------------------------------------------------------------------------
-- Pembuatan toko: owner + data bawaan (pengaturan, metode bayar, kategori pengeluaran)
------------------------------------------------------------------------------
create or replace function public.create_store(p_store_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi'; end if;
  if coalesce(trim(p_store_name), '') = '' then raise exception 'Nama toko wajib diisi'; end if;
  if exists (select 1 from store_users where user_id = auth.uid()) then raise exception 'Akun sudah memiliki toko'; end if;
  insert into stores (owner_id, store_name) values (auth.uid(), trim(p_store_name)) returning id into sid;
  insert into store_users (store_id, user_id, role) values (sid, auth.uid(), 'owner');
  perform _seed_store_defaults(sid);
  return sid;
end $$;

grant execute on function public.create_purchase(uuid, uuid, jsonb, bigint, boolean, date, text, text, date),
  public.update_purchase_draft(uuid, uuid, jsonb, bigint, boolean, date, text, text, date),
  public.receive_purchase(uuid), public.pay_purchase(uuid, bigint, text, date, text),
  public.adjust_stock(uuid, integer, text, text, numeric), public.create_stock_opname(uuid, jsonb, text),
  public.add_expense(uuid, date, text, text, bigint, text, text), public.update_expense(uuid, date, text, text, bigint, text, text),
  public.void_expense(uuid, text), public.create_store(text) to authenticated;
