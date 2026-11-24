-- create_store dibuat idempoten: akun yang sudah punya keanggotaan aktif menerima toko yang sama,
-- bukan error "Akun sudah memiliki toko". Keanggotaan nonaktif mendapat pesan yang tepat.
create or replace function public.create_store(p_store_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi'; end if;
  select store_id into sid from store_users where user_id = auth.uid() and is_active order by created_at limit 1;
  if sid is not null then return sid; end if;
  if exists (select 1 from store_users where user_id = auth.uid()) then
    raise exception 'Akun Anda dinonaktifkan di toko. Hubungi pemilik toko.';
  end if;
  if coalesce(trim(p_store_name), '') = '' then raise exception 'Nama toko wajib diisi'; end if;
  insert into stores (owner_id, store_name) values (auth.uid(), trim(p_store_name)) returning id into sid;
  insert into store_users (store_id, user_id, role) values (sid, auth.uid(), 'owner');
  perform _seed_store_defaults(sid);
  return sid;
end $$;

grant execute on function public.create_store(text) to authenticated;
