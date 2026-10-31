-- =============================================================================
-- Faruk Demirezen — Randevu sistemi: şema, RLS ve güvenli rezervasyon fonksiyonları
-- Boş bir Supabase projesinde SQL Editor'de veya `supabase db push` ile çalıştırılabilir.
--
-- Eşzamanlılık stratejisi (iki katmanlı):
--   1) create_appointment() her çağrıda pg_advisory_xact_lock alır; böylece rezervasyonlar
--      sıraya dizilir ve kontrol + ekleme aynı transaction içinde atomik olur.
--   2) appointments tablosundaki EXCLUDE (gist) kısıtı, iptal edilmemiş randevuların
--      zaman aralıklarının çakışmasını veritabanı seviyesinde reddeder. Kilitte bir hata
--      olsa bile çakışan ikinci kayıt fiziksel olarak eklenemez.
-- =============================================================================

create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- Tablolar
-- -----------------------------------------------------------------------------

-- Yönetici yetkisi yalnızca bu tabloya satır ekleyerek verilir (SQL Editor / service role).
-- Hiçbir RLS politikası bu tabloyu istemciye açmaz; yetki is_admin() ile kontrol edilir.
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.services (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 80),
  description      text check (char_length(description) <= 300),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  -- Kuruş cinsinden tam sayı (örn. 35000 = 350,00 TL). NULL = fiyat henüz belirlenmedi.
  price_minor      integer check (price_minor >= 0),
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.business_settings (
  id                             smallint primary key default 1 check (id = 1),
  business_name                  text not null default 'Faruk Demirezen',
  timezone                       text not null default 'Europe/Istanbul',
  currency                       char(3) not null default 'TRY',
  booking_interval_minutes       integer not null default 30
                                   check (booking_interval_minutes between 5 and 120),
  minimum_booking_notice_minutes integer not null default 60
                                   check (minimum_booking_notice_minutes >= 0),
  maximum_booking_horizon_days   integer not null default 30
                                   check (maximum_booking_horizon_days between 1 and 365),
  max_active_bookings_per_phone  integer not null default 3
                                   check (max_active_bookings_per_phone >= 1),
  -- Konum ve iletişim: onaylanana kadar NULL bırakın, site bu bölümleri göstermez.
  address                        text,
  contact_phone                  text,
  map_url                        text,
  updated_at                     timestamptz not null default now()
);

-- weekday: ISO gün numarası (1 = Pazartesi ... 7 = Pazar)
create table public.working_hours (
  weekday         smallint primary key check (weekday between 1 and 7),
  is_closed       boolean not null default false,
  opens_at        time not null default '10:00',
  closes_at       time not null default '19:00',
  break_starts_at time,
  break_ends_at   time,
  check (is_closed or opens_at < closes_at),
  check ((break_starts_at is null) = (break_ends_at is null)),
  check (
    break_starts_at is null
    or (break_starts_at < break_ends_at and break_starts_at >= opens_at and break_ends_at <= closes_at)
  )
);

-- Tatil, izin veya özel kapalı zamanlar (SQL Editor'den eklenir).
create table public.blocked_periods (
  id         uuid primary key default gen_random_uuid(),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index blocked_periods_range_idx
  on public.blocked_periods using gist (tstzrange(starts_at, ends_at, '[)'));

create table public.appointments (
  id                  uuid primary key default gen_random_uuid(),
  reference_code      text not null unique,
  service_id          uuid not null references public.services (id) on delete restrict,
  customer_first_name text not null check (char_length(customer_first_name) between 1 and 60),
  customer_last_name  text not null check (char_length(customer_last_name) between 1 and 60),
  -- Normalize edilmiş E.164 Türkiye cep numarası: +905XXXXXXXXX
  customer_phone      text not null check (customer_phone ~ '^\+905[0-9]{9}$'),
  customer_email      text check (char_length(customer_email) <= 254),
  customer_note       text check (char_length(customer_note) <= 300),
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  status              text not null default 'pending'
                        check (status in ('pending', 'confirmed', 'cancelled')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  cancelled_at        timestamptz,
  check (ends_at > starts_at),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  -- Veritabanı seviyesinde çakışma koruması: iptal edilmemiş randevular çakışamaz.
  constraint appointments_no_overlap
    exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
    where (status <> 'cancelled')
);
create index appointments_starts_at_idx on public.appointments (starts_at);
create index appointments_phone_idx on public.appointments (customer_phone);

-- Durum geçmişi (kim, ne zaman, hangi durumdan hangisine)
create table public.appointment_status_history (
  id             bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  old_status     text,
  new_status     text not null,
  changed_by     uuid,
  changed_at     timestamptz not null default now()
);
create index appointment_status_history_appt_idx
  on public.appointment_status_history (appointment_id);

-- -----------------------------------------------------------------------------
-- Tetikleyiciler
-- -----------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();
create trigger business_settings_updated_at before update on public.business_settings
  for each row execute function public.set_updated_at();

create function public.log_appointment_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_status_history (appointment_id, old_status, new_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.appointment_status_history (appointment_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return null;
end;
$$;

create trigger appointments_status_history
  after insert or update of status on public.appointments
  for each row execute function public.log_appointment_status();

-- -----------------------------------------------------------------------------
-- Yardımcı fonksiyonlar
-- -----------------------------------------------------------------------------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- Türkiye cep numarasını +905XXXXXXXXX biçimine normalize eder; geçersizse NULL döner.
create function public.normalize_tr_phone(p text) returns text
language plpgsql immutable as $$
declare
  d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '[^0-9]', '', 'g');
  if d ~ '^00905[0-9]{9}$' then d := substr(d, 3); end if;          -- 00905XXXXXXXXX
  if d ~ '^905[0-9]{9}$' then return '+' || d; end if;                -- 905XXXXXXXXX
  if d ~ '^05[0-9]{9}$'  then return '+9' || d; end if;               -- 05XXXXXXXXX
  if d ~ '^5[0-9]{9}$'   then return '+90' || d; end if;              -- 5XXXXXXXXX
  return null;
end;
$$;

create function public.generate_reference_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- karışabilen karakterler yok
  code text;
  i int;
begin
  loop
    code := 'FD-';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.appointments where reference_code = code);
  end loop;
  return code;
end;
$$;

-- Bir başlangıç zamanının rezerve edilebilir olup olmadığını denetler.
-- Uygunsa NULL, değilse neden kodunu döner. Tüm kuralların TEK kaynağıdır:
-- hem get_available_slots hem create_appointment bunu kullanır.
create function public.check_slot(p_start timestamptz, p_duration integer) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s       public.business_settings;
  wh      public.working_hours;
  v_end   timestamptz;
  l_start timestamp;
  l_end   timestamp;
begin
  select * into s from public.business_settings where id = 1;
  if not found then return 'not_configured'; end if;

  v_end   := p_start + make_interval(mins => p_duration);
  l_start := p_start at time zone s.timezone;
  l_end   := v_end at time zone s.timezone;

  if p_start < now() + make_interval(mins => s.minimum_booking_notice_minutes) then
    return 'too_soon';
  end if;
  if l_start::date > (now() at time zone s.timezone)::date + s.maximum_booking_horizon_days then
    return 'too_far';
  end if;

  select * into wh from public.working_hours where weekday = extract(isodow from l_start)::int;
  if not found or wh.is_closed then return 'closed'; end if;

  if l_end::date <> l_start::date
     or l_start::time < wh.opens_at
     or l_end::time > wh.closes_at then
    return 'outside_hours';
  end if;

  if mod(extract(epoch from (l_start::time - wh.opens_at))::numeric,
         (s.booking_interval_minutes * 60)::numeric) <> 0 then
    return 'misaligned';
  end if;

  if wh.break_starts_at is not null
     and l_start::time < wh.break_ends_at
     and l_end::time > wh.break_starts_at then
    return 'break';
  end if;

  if exists (
    select 1 from public.blocked_periods b
    where tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_start, v_end, '[)')
  ) then
    return 'blocked';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.status <> 'cancelled'
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_start, v_end, '[)')
  ) then
    return 'conflict';
  end if;

  return null;
end;
$$;

-- Seçilen gün ve hizmet için gerçekten alınabilir başlangıç saatleri.
-- Müşteri bilgisi içermez; herkese açıktır.
create function public.get_available_slots(p_date date, p_service_id uuid)
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

-- Tarih seçici için: aralıktaki en az bir uygun saati olan günler.
create function public.get_available_dates(p_service_id uuid, p_from date, p_to date)
returns table (day date)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d date;
begin
  if p_to < p_from or p_to - p_from > 92 then
    raise exception 'invalid_range';
  end if;
  for d in select g::date from generate_series(p_from, p_to, interval '1 day') g loop
    if exists (select 1 from public.get_available_slots(d, p_service_id)) then
      day := d;
      return next;
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Güvenli rezervasyon oluşturma (müşteri akışının TEK yazma yolu)
-- Hata kodları RAISE EXCEPTION mesajı olarak döner; arayüz bunları Türkçe karşılıklarına çevirir.
-- -----------------------------------------------------------------------------
create function public.create_appointment(
  p_service_id uuid,
  p_starts_at  timestamptz,
  p_first_name text,
  p_last_name  text,
  p_phone      text,
  p_email      text default null,
  p_note       text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  svc      public.services;
  s        public.business_settings;
  v_first  text := btrim(coalesce(p_first_name, ''));
  v_last   text := btrim(coalesce(p_last_name, ''));
  v_phone  text := public.normalize_tr_phone(p_phone);
  v_email  text := nullif(btrim(coalesce(p_email, '')), '');
  v_note   text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  v_end    timestamptz;
  v_reason text;
  v_code   text;
  v_id     uuid;
  v_active integer;
  attempt  integer;
begin
  if char_length(v_first) not between 1 and 60 or char_length(v_last) not between 1 and 60 then
    raise exception 'invalid_name';
  end if;
  if v_phone is null then raise exception 'invalid_phone'; end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'invalid_email';
  end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'invalid_note'; end if;
  if p_starts_at is null then raise exception 'slot_invalid'; end if;

  -- Rezervasyonları sıraya diz: kontrol + ekleme atomik olur.
  perform pg_advisory_xact_lock(727001);

  select * into svc from public.services where id = p_service_id and is_active;
  if not found then raise exception 'service_unavailable'; end if;
  select * into s from public.business_settings where id = 1;
  if not found then raise exception 'not_configured'; end if;

  v_reason := public.check_slot(p_starts_at, svc.duration_minutes);
  if v_reason is not null then
    if v_reason in ('conflict', 'blocked', 'break') then
      raise exception 'slot_unavailable';
    elsif v_reason = 'too_soon' then
      raise exception 'too_soon';
    elsif v_reason = 'not_configured' then
      raise exception 'not_configured';
    else
      raise exception 'slot_invalid';
    end if;
  end if;

  select count(*) into v_active from public.appointments
   where customer_phone = v_phone and status <> 'cancelled' and starts_at > now();
  if v_active >= s.max_active_bookings_per_phone then
    raise exception 'too_many_bookings';
  end if;

  v_end := p_starts_at + make_interval(mins => svc.duration_minutes);

  for attempt in 1..5 loop
    v_code := public.generate_reference_code();
    begin
      insert into public.appointments (
        reference_code, service_id, customer_first_name, customer_last_name,
        customer_phone, customer_email, customer_note, starts_at, ends_at
      ) values (
        v_code, svc.id, v_first, v_last, v_phone, v_email, v_note, p_starts_at, v_end
      ) returning id into v_id;
      exit;
    exception
      when exclusion_violation then
        raise exception 'slot_unavailable';
      when unique_violation then
        if attempt = 5 then raise exception 'try_again'; end if;
    end;
  end loop;

  return jsonb_build_object(
    'reference_code', v_code,
    'starts_at', p_starts_at,
    'ends_at', v_end,
    'service_name', svc.name,
    'duration_minutes', svc.duration_minutes,
    'price_minor', svc.price_minor,
    'status', 'pending'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Yönetici: durum değiştirme (onayla / iptal et). Yetki sunucuda kontrol edilir.
-- İptal kalıcıdır (kayıt silinmez, cancelled_at tutulur); iptal edilen randevu geri açılmaz,
-- çünkü o saat başkasına verilmiş olabilir.
-- -----------------------------------------------------------------------------
create function public.admin_set_appointment_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.appointments;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('confirmed', 'cancelled') then
    raise exception 'invalid_status';
  end if;

  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if a.status = 'cancelled' then raise exception 'already_cancelled'; end if;

  update public.appointments
     set status = p_status,
         cancelled_at = case when p_status = 'cancelled' then now() else null end
   where id = p_id;

  return jsonb_build_object('id', p_id, 'status', p_status);
end;
$$;

-- -----------------------------------------------------------------------------
-- Yetkiler ve Row Level Security
-- -----------------------------------------------------------------------------

alter table public.admin_users                enable row level security;
alter table public.services                   enable row level security;
alter table public.business_settings          enable row level security;
alter table public.working_hours              enable row level security;
alter table public.blocked_periods            enable row level security;
alter table public.appointments               enable row level security;
alter table public.appointment_status_history enable row level security;

-- Önce her şeyi kapat; sonra yalnızca gerekenleri aç.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.services, public.business_settings, public.working_hours to anon, authenticated;
grant select on public.appointments, public.blocked_periods, public.appointment_status_history to authenticated;

-- Genel okuma: yalnızca aktif hizmetler (yönetici hepsini görür) ve herkese açık yapılandırma.
create policy services_read on public.services
  for select to anon, authenticated using (is_active or public.is_admin());
create policy settings_read on public.business_settings
  for select to anon, authenticated using (true);
create policy working_hours_read on public.working_hours
  for select to anon, authenticated using (true);

-- Müşteri verisi: yalnızca yönetici okuyabilir. Hiçbir rol için INSERT/UPDATE/DELETE politikası
-- yoktur; yazma işlemleri yalnızca yukarıdaki security definer fonksiyonlarıyla yapılır.
create policy appointments_admin_read on public.appointments
  for select to authenticated using (public.is_admin());
create policy blocked_admin_read on public.blocked_periods
  for select to authenticated using (public.is_admin());
create policy history_admin_read on public.appointment_status_history
  for select to authenticated using (public.is_admin());

-- Fonksiyon yetkileri
grant execute on function public.is_admin()                                         to anon, authenticated;
grant execute on function public.get_available_slots(date, uuid)                    to anon, authenticated;
grant execute on function public.get_available_dates(uuid, date, date)              to anon, authenticated;
grant execute on function public.create_appointment(uuid, timestamptz, text, text, text, text, text)
                                                                                    to anon, authenticated;
grant execute on function public.admin_set_appointment_status(uuid, text)           to authenticated;
-- check_slot, normalize_tr_phone, generate_reference_code ve tetikleyici fonksiyonları
-- istemciye AÇILMAZ (yalnızca fonksiyon sahibi çağırabilir).
