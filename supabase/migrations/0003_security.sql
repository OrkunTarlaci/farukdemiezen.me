-- =============================================================================
-- 0003 — CAPTCHA'lı rezervasyon, anonim sorgu hız sınırı, performans, KVKK saklama/silme
--
-- 1) create_appointment artık istemciye KAPALIDIR. Rezervasyon yalnızca Cloudflare Turnstile
--    doğrulaması yapan "create-booking" Edge Function'ı üzerinden (service_role ile) yapılır.
--    Doğrulanmamış bir CAPTCHA sonucuyla randevu oluşturulamaz.
-- 2) get_available_slots / get_available_dates IP başına ve genel (tüm istemciler) hız sınırına
--    tabidir. IP adresi saklanmaz; tuzlanmış SHA-256 özeti en fazla 1 gün tutulur.
-- 3) get_available_dates her gün için ilk uygun saatte durur (önceden tüm saatleri hesaplıyordu).
-- 4) Saklama süresi dolan müşteri verisini silen ve tek bir müşterinin verisini silen fonksiyonlar.
--
-- Çakışma koruması (advisory lock + EXCLUDE kısıtı) ve check_slot kuralları DEĞİŞMEZ.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- İstemciye kapalı ayarlar
-- -----------------------------------------------------------------------------
create table public.private_settings (
  id                               smallint primary key default 1 check (id = 1),
  -- Anonim takvim sorguları (get_available_slots / get_available_dates), dakika başına
  public_queries_per_ip_per_minute integer not null default 60   check (public_queries_per_ip_per_minute > 0),
  public_queries_global_per_minute integer not null default 1500 check (public_queries_global_per_minute > 0),
  -- Rezervasyon denemeleri (Edge Function), saat başına
  bookings_per_ip_per_hour         integer not null default 10   check (bookings_per_ip_per_hour > 0),
  bookings_global_per_hour         integer not null default 60   check (bookings_global_per_hour > 0),
  -- KVKK: randevu bitiminden itibaren müşteri verisinin saklanacağı gün sayısı.
  -- 180 gün bir ÖNERİDİR; hukuki danışmanla teyit edilmeden kesin kabul edilmemelidir.
  customer_data_retention_days     integer not null default 180  check (customer_data_retention_days between 1 and 3650),
  -- IP özetleri için gizli tuz (istemciye hiçbir zaman açılmaz)
  rate_limit_salt                  text    not null default gen_random_uuid()::text,
  updated_at                       timestamptz not null default now()
);
insert into public.private_settings (id) values (1) on conflict (id) do nothing;

create trigger private_settings_updated_at before update on public.private_settings
  for each row execute function public.set_updated_at();

-- Sabit pencereli sayaçlar. key_hash = sha256(tuz || anahtar); ham IP saklanmaz.
create table public.rate_limit_counters (
  bucket       text        not null,
  key_hash     text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, key_hash, window_start)
);
create index rate_limit_counters_window_idx on public.rate_limit_counters (window_start);

alter table public.private_settings    enable row level security;
alter table public.rate_limit_counters enable row level security;
revoke all on public.private_settings, public.rate_limit_counters from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Hız sınırı yardımcıları
-- -----------------------------------------------------------------------------

-- PostgREST'in request.headers ayarından istemci IP'si. Bulunamazsa NULL.
-- Hangi başlığın güvenilir olduğu canlı projede doğrulanmalıdır (README, bölüm 4).
create function public.request_client_ip() returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare
  h json;
  v text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if h is null then return null; end if;
  v := coalesce(
    nullif(btrim(h ->> 'cf-connecting-ip'), ''),
    nullif(btrim(h ->> 'x-real-ip'), ''),
    nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), '')
  );
  return left(v, 64);
end;
$$;

-- Sayaca p_cost ekler; pencere içindeki toplam p_limit'i aşmıyorsa true döner.
create function public.rate_limit_hit(
  p_bucket text, p_key text, p_limit integer, p_window_seconds integer, p_cost integer default 1
) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_salt   text;
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits   integer;
begin
  select rate_limit_salt into v_salt from public.private_settings where id = 1;
  insert into public.rate_limit_counters (bucket, key_hash, window_start, hits)
  values (
    p_bucket,
    encode(sha256(convert_to(coalesce(v_salt, '') || coalesce(p_key, 'unknown'), 'UTF8')), 'hex'),
    v_window,
    p_cost
  )
  on conflict (bucket, key_hash, window_start)
    do update set hits = public.rate_limit_counters.hits + excluded.hits
  returning hits into v_hits;

  -- Ara sıra eski sayaçları temizle (IP özetleri en fazla 1 gün kalır).
  if random() < 0.01 then
    delete from public.rate_limit_counters where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

-- Anonim takvim sorguları için: IP başına ve genel sınır. Aşılırsa 'rate_limited' fırlatır.
-- (Hata transaction'ı geri aldığı için reddedilen istek sayaca eklenmez.)
create function public.enforce_public_query_limit(p_cost integer) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.private_settings;
begin
  select * into c from public.private_settings where id = 1;
  if not found then return; end if;
  if not public.rate_limit_hit('public_query_ip', coalesce(public.request_client_ip(), 'unknown'),
                               c.public_queries_per_ip_per_minute, 60, p_cost)
     or not public.rate_limit_hit('public_query_global', 'all',
                                  c.public_queries_global_per_minute, 60, p_cost) then
    raise exception 'rate_limited';
  end if;
end;
$$;

-- Edge Function için: rezervasyon denemesi sınırı (IP başına + genel). true = izin ver.
create function public.booking_rate_limit_hit(p_client_ip text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.private_settings;
begin
  select * into c from public.private_settings where id = 1;
  if not found then return true; end if;
  if not public.rate_limit_hit('booking_ip', coalesce(nullif(btrim(p_client_ip), ''), 'unknown'),
                               c.bookings_per_ip_per_hour, 3600) then
    return false;
  end if;
  return public.rate_limit_hit('booking_global', 'all', c.bookings_global_per_hour, 3600);
end;
$$;

-- -----------------------------------------------------------------------------
-- Müsaitlik: iç fonksiyonlar (sınırsız, istemciye kapalı) + sınırlı genel sarmalayıcılar
-- -----------------------------------------------------------------------------

-- 0001'deki get_available_slots gövdesinin aynısı; kurallar yine check_slot'tadır.
create function public.available_slots_internal(p_date date, p_service_id uuid)
returns table (slot_start timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s      public.business_settings;
  svc    public.services;
  wh     public.working_hours;
  v_open timestamptz;
  v_n    integer;
  i      integer;
begin
  select * into s from public.business_settings where id = 1;
  if not found then return; end if;
  select * into svc from public.services where id = p_service_id and is_active;
  if not found then return; end if;
  select * into wh from public.working_hours where weekday = extract(isodow from p_date)::int;
  if not found or wh.is_closed then return; end if;

  v_open := (p_date + wh.opens_at) at time zone s.timezone;
  v_n := floor(extract(epoch from (wh.closes_at - wh.opens_at)) / 60 / s.booking_interval_minutes)::int;

  for i in 0..v_n loop
    slot_start := v_open + make_interval(mins => i * s.booking_interval_minutes);
    if public.check_slot(slot_start, svc.duration_minutes) is null then
      return next;
    end if;
  end loop;
end;
$$;

-- Günde en az bir uygun saat var mı? İlk uygun saatte durur.
create function public.has_available_slot(p_date date, p_duration integer) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s      public.business_settings;
  wh     public.working_hours;
  v_open timestamptz;
  v_n    integer;
  v_today date;
  i      integer;
begin
  select * into s from public.business_settings where id = 1;
  if not found then return false; end if;

  -- Ufuk dışındaki günleri saat saat denemeden ele (check_slot ile aynı sınırlar).
  v_today := (now() at time zone s.timezone)::date;
  if p_date < v_today or p_date > v_today + s.maximum_booking_horizon_days then
    return false;
  end if;

  select * into wh from public.working_hours where weekday = extract(isodow from p_date)::int;
  if not found or wh.is_closed then return false; end if;

  v_open := (p_date + wh.opens_at) at time zone s.timezone;
  v_n := floor(extract(epoch from (wh.closes_at - wh.opens_at)) / 60 / s.booking_interval_minutes)::int;

  for i in 0..v_n loop
    if public.check_slot(v_open + make_interval(mins => i * s.booking_interval_minutes), p_duration) is null then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- Genel uç noktalar artık VOLATILE: hız sayacına yazarlar. supabase-js rpc() POST kullandığı
-- için istemci tarafında değişiklik gerekmez.
create or replace function public.get_available_slots(p_date date, p_service_id uuid)
returns table (slot_start timestamptz)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.enforce_public_query_limit(1);
  return query select x.slot_start from public.available_slots_internal(p_date, p_service_id) x;
end;
$$;

create or replace function public.get_available_dates(p_service_id uuid, p_from date, p_to date)
returns table (day date)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  d          date;
  v_duration integer;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception 'invalid_range';
  end if;
  -- Uzun aralık daha pahalıdır: her başlayan 31 gün için 1 birim.
  perform public.enforce_public_query_limit(1 + (p_to - p_from) / 31);

  select duration_minutes into v_duration from public.services where id = p_service_id and is_active;
  if not found then return; end if;

  for d in select g::date from generate_series(p_from, p_to, interval '1 day') g loop
    if public.has_available_slot(d, v_duration) then
      day := d;
      return next;
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- KVKK: saklama süresi ve silme
-- -----------------------------------------------------------------------------

-- Bitişinden customer_data_retention_days gün geçmiş randevuları (iptaller dahil) ve durum
-- geçmişlerini kalıcı olarak siler; eski hız sayaçlarını temizler. Silinen randevu sayısını döner.
-- pg_cron ile günlük çalıştırılması önerilir (README).
create function public.purge_expired_customer_data() returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.private_settings;
  n integer;
begin
  select * into c from public.private_settings where id = 1;
  if not found then raise exception 'not_configured'; end if;
  delete from public.appointments
   where ends_at < now() - make_interval(days => c.customer_data_retention_days);
  get diagnostics n = row_count;
  delete from public.rate_limit_counters where window_start < now() - interval '1 day';
  return n;
end;
$$;

-- İlgili kişinin silme talebi (KVKK md. 11) için: verilen telefona ait TÜM randevuları siler.
-- Gelecekteki randevular da silinir (saat yeniden açılır). Silinen kayıt sayısını döner.
create function public.delete_customer_data(p_phone text) returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_phone text := public.normalize_tr_phone(p_phone);
  n integer;
begin
  if v_phone is null then raise exception 'invalid_phone'; end if;
  delete from public.appointments where customer_phone = v_phone;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Yetkiler
-- -----------------------------------------------------------------------------

-- Yeni fonksiyonlar varsayılan olarak PUBLIC'e açıktır; hepsini kapat.
revoke all on function public.request_client_ip()                                  from public, anon, authenticated;
revoke all on function public.rate_limit_hit(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.enforce_public_query_limit(integer)                  from public, anon, authenticated;
revoke all on function public.booking_rate_limit_hit(text)                         from public, anon, authenticated;
revoke all on function public.available_slots_internal(date, uuid)                 from public, anon, authenticated;
revoke all on function public.has_available_slot(date, integer)                    from public, anon, authenticated;
revoke all on function public.purge_expired_customer_data()                        from public, anon, authenticated;
revoke all on function public.delete_customer_data(text)                           from public, anon, authenticated;

-- Rezervasyon artık yalnızca Edge Function (service_role) üzerinden.
revoke all on function public.create_appointment(uuid, timestamptz, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_appointment(uuid, timestamptz, text, text, text, text, text) to service_role;
grant execute on function public.booking_rate_limit_hit(text)                                         to service_role;

-- purge_expired_customer_data ve delete_customer_data yalnızca SQL Editor / pg_cron (postgres) ile çalışır.
