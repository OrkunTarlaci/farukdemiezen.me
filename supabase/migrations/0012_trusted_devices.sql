-- =============================================================================
-- 0012 — Güvenilir cihaz: gün içinde aynı cihazda iki adımlı kod yeniden istenmez
--
-- Supabase'de "cihazı hatırla" yoktur: her parola girişi aal1 başlar ve aal2'yi yalnızca Auth sunucusu
-- verir. Bu migration aal2'yi taklit ETMEZ; is_admin()'e ayrı ve sunucuda doğrulanan bir koşul ekler:
--
--   aal2 oturum                                  → yönetici (değişmedi)
--   iki adımlı giriş açık değil                  → yönetici (değişmedi)
--   aal1 oturum + bu kullanıcıya ait geçerli cihaz → yönetici (YENİ)
--   aal1 oturum, cihaz yok veya süresi dolmuş     → yönetici değil (değişmedi)
--
-- Cihaz kaydı: 244 bit rastgele değer yalnızca cihazda, veritabanında SHA-256 özeti tutulur. Kaydı yalnızca
-- Auth'un imzaladığı aal2 JWT'si ve son 5 dakikada girilmiş TOTP ile alınır; istemci kendisi üretemez.
-- Süre: doğrulamanın yapıldığı günün sonu, Europe/Istanbul 00.00. Her cihaz kendi kaydını alır.
--
-- Bilinen sınır: Realtime istek başlığı taşımaz; aal1+cihaz oturumunda liste 30 sn yoklamayla güncellenir.
-- Yıkıcı işlem yoktur; tek transaction. Tekrar çalıştırılması zararsızdır.
-- =============================================================================

begin;

create table if not exists public.trusted_devices (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists trusted_devices_user_idx on public.trusted_devices (user_id);

alter table public.trusted_devices enable row level security;
revoke all on table public.trusted_devices from public, anon, authenticated;

-- Verilen andan sonraki ilk İstanbul gece yarısı.
create or replace function public.next_istanbul_midnight(p_at timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select (date_trunc('day', p_at at time zone 'Europe/Istanbul') + interval '1 day') at time zone 'Europe/Istanbul';
$$;

-- Bu isteğin x-device-token başlığı, oturumdaki kullanıcıya ait geçerli bir kayıt mı? Geçerliyse bitiş anı.
create or replace function public.device_trust_expires() returns timestamptz
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_token text;
  v_until timestamptz;
begin
  begin
    v_token := nullif(current_setting('request.headers', true), '')::json ->> 'x-device-token';
  exception when others then
    return null;
  end;
  if v_token is null or auth.uid() is null then return null; end if;
  select d.expires_at into v_until from public.trusted_devices d
   where d.user_id = auth.uid()
     and d.token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
     and d.expires_at > now();
  return v_until;
end;
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid())
     and (
       coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
       or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
       or public.device_trust_expires() is not null
     );
$$;

-- Yalnızca kodu az önce girmiş aal2 oturumu çağırabilir. Gece yarısını geçen eski aal2 oturumu yeni gün için
-- kayıt alamaz; aksi hâlde kod girilmeden güven yenilenebilirdi.
create or replace function public.trust_this_device() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_jwt   jsonb := auth.jwt();
  v_totp  bigint;
  v_token text;
  v_until timestamptz := public.next_istanbul_midnight(now());
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(v_jwt ->> 'aal', '') <> 'aal2' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select max((m ->> 'timestamp')::bigint) into v_totp
    from jsonb_array_elements(coalesce(v_jwt -> 'amr', '[]'::jsonb)) m
   where m ->> 'method' = 'totp';
  if v_totp is null or v_totp < extract(epoch from now()) - 300 then
    raise exception 'mfa_not_fresh';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  delete from public.trusted_devices where user_id = auth.uid() and expires_at <= now();
  insert into public.trusted_devices (user_id, token_hash, expires_at)
  values (auth.uid(), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_until);
  return jsonb_build_object('token', v_token, 'expires_at', v_until);
end;
$$;

-- Kaybolan cihaz için: bu yöneticinin bütün güvenilir cihazları silinir.
create or replace function public.revoke_trusted_devices() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.trusted_devices where user_id = auth.uid();
end;
$$;

revoke all on function public.next_istanbul_midnight(timestamptz) from public, anon, authenticated;
revoke all on function public.device_trust_expires()   from public, anon;
revoke all on function public.trust_this_device()      from public, anon;
revoke all on function public.revoke_trusted_devices() from public, anon;
grant execute on function public.device_trust_expires()   to authenticated;
grant execute on function public.trust_this_device()      to authenticated;
grant execute on function public.revoke_trusted_devices() to authenticated;

commit;
