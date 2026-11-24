-- 0010: Pengguna, role, dan profil

-- Profil: pengguna hanya boleh mengubah nama dan telepon miliknya sendiri
create policy profiles_self_upd on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, updated_at) on public.profiles to authenticated;

-- Log audit dapat menampilkan nama pelaku
alter table public.audit_logs add constraint audit_logs_user_fk foreign key (user_id) references public.profiles (id) on delete set null;

-- Aktif/nonaktif anggota. Owner tidak dapat mengubah dirinya sendiri.
create function public.set_member_active(p_member uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m store_users;
begin
  select * into m from store_users where id = p_member for update;
  if not found or not is_owner(m.store_id) then raise exception 'Tidak diizinkan'; end if;
  if m.user_id = auth.uid() then raise exception 'Anda tidak dapat mengubah akun Anda sendiri'; end if;
  update store_users set is_active = p_active where id = p_member;
end $$;

-- Ubah role anggota (cashier <-> owner). Tidak berlaku untuk diri sendiri.
create function public.set_member_role(p_member uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare m store_users;
begin
  if p_role not in ('owner', 'cashier') then raise exception 'Role tidak valid'; end if;
  select * into m from store_users where id = p_member for update;
  if not found or not is_owner(m.store_id) then raise exception 'Tidak diizinkan'; end if;
  if m.user_id = auth.uid() then raise exception 'Anda tidak dapat mengubah role Anda sendiri'; end if;
  update store_users set role = p_role where id = p_member;
end $$;

grant execute on function public.set_member_active(uuid, boolean), public.set_member_role(uuid, text) to authenticated;
