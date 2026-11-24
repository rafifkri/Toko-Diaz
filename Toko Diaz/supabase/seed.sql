-- Data awal untuk development. Jalankan setelah mendaftar sebagai pemilik (memakai toko pertama).
do $$ declare sid uuid; begin
  select id into sid from public.stores order by created_at limit 1; if sid is null then return; end if;
  insert into public.categories (store_id, category_name) values (sid,'Makanan'),(sid,'Minuman'),(sid,'Perlengkapan rumah'),(sid,'Kebutuhan dapur'),(sid,'Produk lainnya') on conflict do nothing;
  insert into public.suppliers (store_id, supplier_name, phone) select sid,'Supplier Contoh','081200000000' where not exists (select 1 from public.suppliers where store_id = sid);
end $$;
