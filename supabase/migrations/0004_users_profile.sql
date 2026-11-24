-- Owner dapat melihat profil anggota tokonya dan mengaktifkan/nonaktifkan anggota
create policy profiles_store_owner on public.profiles for select using (exists (
  select 1 from public.store_users a join public.store_users b on a.store_id = b.store_id
  where a.user_id = auth.uid() and a.role = 'owner' and a.is_active and b.user_id = profiles.id));
create policy su_owner_upd on public.store_users for update using (is_owner(store_id) and user_id <> auth.uid()) with check (is_owner(store_id));
