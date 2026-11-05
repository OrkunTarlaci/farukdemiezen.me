-- =============================================================================
-- 0014 — Her yönetici için iki adımlı giriş zorunlu
--
-- Önceden iki adımlı girişi açmamış yönetici yalnızca parolayla yönetici sayılıyordu. Artık yönetici sayılmak
-- için aal2 oturum veya güvenilir cihaz şarttır. admin_users tablosundaki kimse silinmez ve değişmez.
-- Kurulumu olmayan yönetici kilitlenmez: is_admin_member() ile tanınır ve panel önce kod kurulumunu açar.
--
-- Tek transaction. Tekrar çalıştırılması zararsızdır.
-- =============================================================================

begin;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid())
     and (
       coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
       or public.device_trust_expires() is not null
     );
$$;

-- Yalnızca oturumdaki kullanıcının kendisi için: panel kurulum ekranını göstermek içindir, yetki vermez.
create or replace function public.is_admin_member() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

revoke all on function public.is_admin_member() from public, anon;
grant execute on function public.is_admin_member() to authenticated;

commit;
