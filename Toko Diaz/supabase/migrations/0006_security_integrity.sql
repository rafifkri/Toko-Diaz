-- 0006: Keamanan dan integritas data
-- 1) Penomoran dokumen per toko   2) Stok dan HPP hanya berubah lewat fungsi
-- 3) Tulis langsung ke tabel sensitif ditutup   4) Audit log otomatis   5) Index performa

------------------------------------------------------------------------------
-- 1. Penomoran dokumen per toko (reset harian, tidak melompat antar toko)
------------------------------------------------------------------------------
create table public.doc_counters (
  store_id uuid not null references public.stores on delete cascade,
  doc_type text not null,
  doc_date date not null,
  last_value integer not null default 0,
  primary key (store_id, doc_type, doc_date)
);
alter table public.doc_counters enable row level security; -- tanpa policy: hanya fungsi security definer

create function public.next_doc_number(p_store uuid, p_type text, p_prefix text)
returns text language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Jakarta')::date; n integer;
begin
  insert into doc_counters (store_id, doc_type, doc_date, last_value) values (p_store, p_type, d, 1)
  on conflict (store_id, doc_type, doc_date) do update set last_value = doc_counters.last_value + 1
  returning last_value into n;
  return p_prefix || '-' || to_char(d, 'YYMMDD') || '-' || lpad(n::text, 5, '0');
end $$;
revoke all on function public.next_doc_number(uuid, text, text) from public, anon, authenticated;

-- Selaraskan counter dengan nomor lama agar tidak bentrok pada hari migrasi
insert into public.doc_counters (store_id, doc_type, doc_date, last_value)
select store_id, 'sale', (sale_date at time zone 'Asia/Jakarta')::date, max(split_part(invoice_number, '-', 3)::int)
from public.sales where invoice_number ~ '^INV-\d{6}-\d+$' group by 1, 3
on conflict do nothing;
insert into public.doc_counters (store_id, doc_type, doc_date, last_value)
select store_id, 'purchase', to_date(split_part(purchase_number, '-', 2), 'YYMMDD'), max(split_part(purchase_number, '-', 3)::int)
from public.purchases where purchase_number ~ '^PB-\d{6}-\d+$' group by 1, 3
on conflict do nothing;
insert into public.doc_counters (store_id, doc_type, doc_date, last_value)
select store_id, 'expense', to_date(split_part(expense_number, '-', 2), 'YYMMDD'), max(split_part(expense_number, '-', 3)::int)
from public.expenses where expense_number ~ '^EX-\d{6}-\d+$' group by 1, 3
on conflict do nothing;

------------------------------------------------------------------------------
-- 2. Stok dan HPP tidak boleh diubah langsung lewat API.
--    Hak tulis diberikan per kolom; stock, average_cost, purchase_price hanya
--    berubah lewat fungsi security definer yang menulis riwayat.
------------------------------------------------------------------------------
revoke insert, update on public.products from anon, authenticated;
grant insert (store_id, category_id, product_code, barcode, product_name, unit, selling_price, minimum_stock, image_url, is_active)
  on public.products to authenticated;
grant update (category_id, barcode, product_name, unit, selling_price, minimum_stock, image_url, is_active, updated_at)
  on public.products to authenticated;

-- Toko: owner_id tidak boleh dipindah
revoke update on public.stores from anon, authenticated;
grant update (store_name, logo_url, address, phone, email, updated_at) on public.stores to authenticated;

-- Keanggotaan: perubahan lewat fungsi (set_member_active / set_member_role)
drop policy if exists su_owner_upd on public.store_users;
revoke insert, update, delete on public.store_users from anon, authenticated;

------------------------------------------------------------------------------
-- 3. Pembelian dan pengeluaran: hanya baca langsung; tulis lewat fungsi
--    (sebelumnya owner dapat membalik status pembelian tanpa menambah stok)
------------------------------------------------------------------------------
drop policy if exists pur_owner on public.purchases;
drop policy if exists pit_owner on public.purchase_items;
drop policy if exists exp_owner on public.expenses;
create policy pur_read on public.purchases for select using (is_owner(store_id));
create policy pit_read on public.purchase_items for select
  using (exists (select 1 from public.purchases p where p.id = purchase_id and is_owner(p.store_id)));
create policy exp_read on public.expenses for select using (is_owner(store_id));
revoke insert, update, delete on public.purchases, public.purchase_items, public.expenses from anon, authenticated;

-- Tabel transaksi tidak pernah ditulis klien
revoke insert, update, delete on public.sales, public.sale_items, public.payments, public.stock_movements,
  public.audit_logs, public.sale_returns from anon, authenticated;

------------------------------------------------------------------------------
-- 4. Audit log otomatis untuk perubahan data penting
------------------------------------------------------------------------------
create function public.audit_row_change() returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; sid uuid; rid uuid;
begin
  if tg_op = 'DELETE' then o := to_jsonb(old); sid := (o->>'store_id')::uuid; rid := (o->>'id')::uuid;
  elsif tg_op = 'INSERT' then n := to_jsonb(new); sid := (n->>'store_id')::uuid; rid := (n->>'id')::uuid;
  else
    o := to_jsonb(old); n := to_jsonb(new); sid := (n->>'store_id')::uuid; rid := (n->>'id')::uuid;
    if o = n then return new; end if;
  end if;
  if tg_table_name = 'stores' then sid := rid; end if;
  insert into audit_logs (store_id, user_id, action, table_name, record_id, old_data, new_data)
    values (sid, auth.uid(), lower(tg_op) || '_' || tg_table_name, tg_table_name, rid, o, n);
  return coalesce(new, old);
end $$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

-- Produk: catat pembuatan serta perubahan harga/identitas/status (perubahan stok dicatat fungsi stok)
create trigger audit_products_ins after insert on public.products for each row execute function public.audit_row_change();
create trigger audit_products_upd after update on public.products for each row
  when (old.selling_price is distinct from new.selling_price or old.product_name is distinct from new.product_name
     or old.is_active is distinct from new.is_active or old.minimum_stock is distinct from new.minimum_stock
     or old.category_id is distinct from new.category_id or old.barcode is distinct from new.barcode or old.unit is distinct from new.unit)
  execute function public.audit_row_change();
-- Pengaturan pembayaran/QRIS, keanggotaan pengguna, profil toko
create trigger audit_payset after insert or update or delete on public.store_payment_settings for each row execute function public.audit_row_change();
create trigger audit_members after insert or update or delete on public.store_users for each row execute function public.audit_row_change();
create trigger audit_stores after update on public.stores for each row execute function public.audit_row_change();

------------------------------------------------------------------------------
-- 5. Index untuk query laporan, riwayat, dan relasi
------------------------------------------------------------------------------
create index if not exists idx_sale_items_sale on public.sale_items (sale_id);
create index if not exists idx_sale_items_product on public.sale_items (product_id);
create index if not exists idx_sales_status_date on public.sales (store_id, payment_status, sale_date desc);
create index if not exists idx_sales_cashier on public.sales (store_id, cashier_id, sale_date desc);
create index if not exists idx_payments_sale on public.payments (sale_id);
create index if not exists idx_products_category on public.products (store_id, category_id);
create index if not exists idx_moves_store_date on public.stock_movements (store_id, created_at desc);
create index if not exists idx_moves_product on public.stock_movements (product_id, created_at desc);
create index if not exists idx_purchases_date on public.purchases (store_id, purchase_date desc);
create index if not exists idx_purchases_supplier on public.purchases (supplier_id);
create index if not exists idx_purchase_items_purchase on public.purchase_items (purchase_id);
create index if not exists idx_purchase_items_product on public.purchase_items (product_id);
create index if not exists idx_expenses_date on public.expenses (store_id, expense_date desc);
create index if not exists idx_audit_store_date on public.audit_logs (store_id, created_at desc);
create index if not exists idx_returns_store_date on public.sale_returns (store_id, created_at desc);
create index if not exists idx_store_users_user on public.store_users (user_id) where is_active;
