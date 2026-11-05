-- =============================================================================
-- 0011 — Güvenlik sertleştirmesi (denetim raporu: H2, M2, M5, M6, L1, L2, L5 ve işlem kaydı)
--
--   is_admin()                 — iki adımlı girişi açmış yönetici yalnızca aal2 oturumuyla yönetici sayılır.
--                                Henüz açmamış yönetici etkilenmez; bu yüzden panel kilitlenmez.
--   IP başına günlük sınır     — bookings_per_ip_per_day (varsayılan 30)
--   Hız sınırları              — ayar satırı yoksa artık izin vermez (kapalı kalır)
--   Takvim genel sınırı        — dakikada 10000 (az sayıda IP'nin herkesi kilitlemesini zorlaştırır)
--   Push                       — yalnızca bilinen bildirim servisleri; abonelik yöneticiye bağlı
--   search_path                — kalan üç fonksiyonda sabit; referans kodu güvenli rastgelelikle
--   admin_audit_log            — hizmet, ayar, saat, kapalı dönem ve yönetici değişikliklerinin kaydı
--
-- Günlük randevu temizliğine ve randevu verisine dokunmaz. Tek transaction; tekrar çalıştırılabilir.
-- =============================================================================

begin;

-- İki adımlı giriş denetimi bu rolle okunabilmeli; okunamazsa is_admin() değişmeden migration durur.
do $$
begin
  perform 1 from auth.mfa_factors limit 1;
end;
$$;

-- -----------------------------------------------------------------------------
-- Yönetici: iki adımlı giriş
-- -----------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid())
     and (
       coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
       or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
     );
$$;

-- -----------------------------------------------------------------------------
-- Hız sınırları
-- -----------------------------------------------------------------------------
alter table public.private_settings
  add column if not exists bookings_per_ip_per_day integer not null default 30 check (bookings_per_ip_per_day > 0);

update public.private_settings
   set public_queries_global_per_minute = greatest(public_queries_global_per_minute, 10000)
 where id = 1;

create or replace function public.booking_rate_limit_hit(p_client_ip text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c    public.private_settings;
  v_ip text := coalesce(nullif(btrim(p_client_ip), ''), 'unknown');
begin
  select * into c from public.private_settings where id = 1;
  if not found then return false; end if;
  if not public.rate_limit_hit('booking_ip', v_ip, c.bookings_per_ip_per_hour, 3600) then
    return false;
  end if;
  return public.rate_limit_hit('booking_ip_day', v_ip, c.bookings_per_ip_per_day, 86400);
end;
$$;

create or replace function public.booking_global_limit_hit() returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.private_settings;
begin
  select * into c from public.private_settings where id = 1;
  if not found then return false; end if;
  return public.rate_limit_hit('booking_global', 'all', c.bookings_global_per_hour, 3600);
end;
$$;

create or replace function public.enforce_public_query_limit(p_cost integer) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.private_settings;
begin
  select * into c from public.private_settings where id = 1;
  if not found then raise exception 'rate_limited'; end if;
  if not public.rate_limit_hit('public_query_ip', coalesce(public.request_client_ip(), 'unknown'),
                               c.public_queries_per_ip_per_minute, 60, p_cost)
     or not public.rate_limit_hit('public_query_global', 'all',
                                  c.public_queries_global_per_minute, 60, p_cost) then
    raise exception 'rate_limited';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Push: bilinen servisler ve yöneticiye bağlı abonelik
-- -----------------------------------------------------------------------------
alter table public.push_subscriptions
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create or replace function public.admin_save_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com)/' then
    raise exception 'invalid_endpoint';
  end if;
  insert into public.push_subscriptions (endpoint, user_id) values (p_endpoint, auth.uid())
  on conflict (endpoint) do update set user_id = excluded.user_id;
end;
$$;

-- Yöneticilikten çıkarılan kişinin cihazları bildirim almaya devam etmez.
create or replace function public.remove_admin_push() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.push_subscriptions where user_id = old.user_id;
  return null;
end;
$$;

drop trigger if exists admin_users_remove_push on public.admin_users;
create trigger admin_users_remove_push after delete on public.admin_users
  for each row execute function public.remove_admin_push();

-- -----------------------------------------------------------------------------
-- search_path ve referans kodu
-- -----------------------------------------------------------------------------
alter function public.set_updated_at() set search_path = '';
alter function public.normalize_tr_phone(text) set search_path = '';

create or replace function public.generate_reference_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- karışabilen karakterler yok
  code  text;
  bytes bytea;
  i     int;
begin
  loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    code := 'FD-';
    for i in 0..5 loop
      code := code || substr(alphabet, 1 + get_byte(bytes, i + 8) % length(alphabet), 1);
    end loop;
    exit when not exists (select 1 from public.appointments where reference_code = code);
  end loop;
  return code;
end;
$$;

-- -----------------------------------------------------------------------------
-- Yönetici işlem kaydı: kim, ne zaman, neyi değiştirdi. Müşteri verisi içermez.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  table_name text not null,
  action     text not null,
  old_data   jsonb,
  new_data   jsonb
);
create index if not exists admin_audit_log_at_idx on public.admin_audit_log (at desc);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from public, anon, authenticated;

create or replace function public.log_admin_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.admin_audit_log (actor, table_name, action, old_data, new_data)
  values (
    auth.uid(), tg_table_name, tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  if random() < 0.01 then
    delete from public.admin_audit_log where at < now() - interval '180 days';
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['services', 'business_settings', 'working_hours', 'blocked_periods', 'admin_users'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_admin_change()', t || '_audit', t);
  end loop;
end;
$$;

revoke all on function public.remove_admin_push() from public, anon, authenticated;
revoke all on function public.log_admin_change()  from public, anon, authenticated;
revoke all on function public.generate_reference_code() from public, anon, authenticated;

commit;
