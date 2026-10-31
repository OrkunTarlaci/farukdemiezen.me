-- =============================================================================
-- 0005 — Günlük işletme: tamamlandı / gelmedi durumları, randevu anındaki fiyat kaydı,
--        yeniden planlama, işletme adı düzenleme ve başlangıç fiyatları
--
-- Yıkıcı işlem YOKTUR: tablo silinmez, veri silinmez. Tek bir transaction içinde çalışır;
-- bir adım başarısız olursa hiçbir değişiklik uygulanmaz. Birden fazla kez çalıştırılması
-- güvenli DEĞİLDİR (sütun/fonksiyon zaten varsa hata verir ve hiçbir şey değişmez).
--
-- Çakışma koruması (advisory lock + EXCLUDE kısıtı) ve check_slot kuralları korunur;
-- check_slot'a yalnızca yeniden planlamada randevunun kendisini yok saymak için isteğe bağlı
-- bir parametre eklenir.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Yeni durumlar: completed (tamamlandı), no_show (gelmedi)
-- -----------------------------------------------------------------------------
do $$
declare
  c text;
begin
  -- 0001'deki sütun kısıtını (adı ortama göre değişebilir) tanımına göre bulup kaldır.
  for c in
    select conname from pg_constraint
     where conrelid = 'public.appointments'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%pending%confirmed%cancelled%'
       and pg_get_constraintdef(oid) not like '%cancelled_at%'
  loop
    execute format('alter table public.appointments drop constraint %I', c);
  end loop;
end;
$$;

alter table public.appointments
  add constraint appointments_status_valid
  check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show'));

-- -----------------------------------------------------------------------------
-- 2) Randevu anındaki hizmet adı ve fiyatı (sonradan fiyat değişse de geçmiş doğru kalır)
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column service_name text    check (service_name is null or char_length(service_name) between 1 and 80),
  add column price_minor  integer check (price_minor is null or price_minor >= 0);

-- Mevcut kayıtlar için yalnızca hizmet adı doldurulur. Fiyat doldurulmaz: o anki fiyat
-- bilinmediği için tahmin edilmez (eski kayıtların fiyatı NULL kalır).
update public.appointments a
   set service_name = s.name
  from public.services s
 where s.id = a.service_id and a.service_name is null;

-- -----------------------------------------------------------------------------
-- 3) check_slot: yeniden planlamada randevunun kendisini çakışma sayma
--    (İmza değiştiği için eski sürüm kaldırılır; aynı adlı iki sürüm belirsizlik yaratırdı.)
-- -----------------------------------------------------------------------------
drop function public.check_slot(timestamptz, integer);

create function public.check_slot(p_start timestamptz, p_duration integer, p_exclude uuid default null) returns text
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
      and (p_exclude is null or a.id <> p_exclude)
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_start, v_end, '[)')
  ) then
    return 'conflict';
  end if;

  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) create_appointment: hizmet adı ve fiyatı SUNUCUDA, hizmet tablosundan kaydedilir
--    (istemcinin gönderdiği fiyat/süre hiçbir zaman kullanılmaz). Gövde 0001 ile aynıdır.
--    CREATE OR REPLACE mevcut yetkileri korur (0003: yalnızca service_role).
-- -----------------------------------------------------------------------------
create or replace function public.create_appointment(
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
   where customer_phone = v_phone and status in ('pending', 'confirmed') and starts_at > now();
  if v_active >= s.max_active_bookings_per_phone then
    raise exception 'too_many_bookings';
  end if;

  v_end := p_starts_at + make_interval(mins => svc.duration_minutes);

  for attempt in 1..5 loop
    v_code := public.generate_reference_code();
    begin
      insert into public.appointments (
        reference_code, service_id, service_name, price_minor, customer_first_name, customer_last_name,
        customer_phone, customer_email, customer_note, starts_at, ends_at
      ) values (
        v_code, svc.id, svc.name, svc.price_minor, v_first, v_last, v_phone, v_email, v_note, p_starts_at, v_end
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
-- 5) Durum değiştirme: izinli geçişler
--    pending   → confirmed | cancelled | completed* | no_show*
--    confirmed → cancelled | completed* | no_show*
--    completed ↔ no_show (düzeltme)          * yalnızca randevu saati geldiyse
--    cancelled → (son durum; değiştirilemez)
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_appointment_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.appointments;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('confirmed', 'cancelled', 'completed', 'no_show') then
    raise exception 'invalid_status';
  end if;

  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if a.status = 'cancelled' then raise exception 'already_cancelled'; end if;
  if a.status = p_status then
    return jsonb_build_object('id', p_id, 'status', p_status);
  end if;

  if p_status = 'confirmed' and a.status <> 'pending' then
    raise exception 'invalid_transition';
  end if;
  if p_status = 'cancelled' and a.status in ('completed', 'no_show') then
    raise exception 'invalid_transition';
  end if;
  if p_status in ('completed', 'no_show') and a.starts_at > now() then
    raise exception 'not_started';
  end if;

  update public.appointments
     set status = p_status,
         cancelled_at = case when p_status = 'cancelled' then now() else null end
   where id = p_id;

  return jsonb_build_object('id', p_id, 'status', p_status);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Yeniden planlama (yalnızca yönetici). Müşteriyle aynı kurallar uygulanır
--    (çalışma saati, mola, kapalı dönem, aralık, en az bildirim süresi, ufuk); randevunun
--    kendisi çakışma sayılmaz. Süre korunur. EXCLUDE kısıtı son güvencedir.
-- -----------------------------------------------------------------------------
create function public.admin_available_slots(p_id uuid, p_date date)
returns table (slot_start timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  a          public.appointments;
  s          public.business_settings;
  wh         public.working_hours;
  v_duration integer;
  v_open     timestamptz;
  v_n        integer;
  i          integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into a from public.appointments where id = p_id;
  if not found then raise exception 'not_found'; end if;
  select * into s from public.business_settings where id = 1;
  if not found then return; end if;
  select * into wh from public.working_hours where weekday = extract(isodow from p_date)::int;
  if not found or wh.is_closed then return; end if;

  v_duration := round(extract(epoch from (a.ends_at - a.starts_at)) / 60)::int;
  v_open := (p_date + wh.opens_at) at time zone s.timezone;
  v_n := floor(extract(epoch from (wh.closes_at - wh.opens_at)) / 60 / s.booking_interval_minutes)::int;

  for i in 0..v_n loop
    slot_start := v_open + make_interval(mins => i * s.booking_interval_minutes);
    if public.check_slot(slot_start, v_duration, a.id) is null then
      return next;
    end if;
  end loop;
end;
$$;

create function public.admin_reschedule_appointment(p_id uuid, p_starts_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a          public.appointments;
  v_duration integer;
  v_reason   text;
  v_end      timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_starts_at is null then raise exception 'slot_invalid'; end if;

  perform pg_advisory_xact_lock(727001);

  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if a.status not in ('pending', 'confirmed') then raise exception 'invalid_transition'; end if;

  v_duration := round(extract(epoch from (a.ends_at - a.starts_at)) / 60)::int;
  v_reason := public.check_slot(p_starts_at, v_duration, a.id);
  if v_reason is not null then
    if v_reason in ('conflict', 'blocked', 'break') then raise exception 'slot_unavailable';
    elsif v_reason = 'too_soon' then raise exception 'too_soon';
    else raise exception 'slot_invalid';
    end if;
  end if;

  v_end := p_starts_at + make_interval(mins => v_duration);
  begin
    update public.appointments set starts_at = p_starts_at, ends_at = v_end where id = p_id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;

  return jsonb_build_object('id', p_id, 'starts_at', p_starts_at, 'ends_at', v_end);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) İşletme adı panelden düzenlenebilir
-- -----------------------------------------------------------------------------
alter table public.business_settings
  add constraint business_settings_name_len check (char_length(btrim(business_name)) between 1 and 80);
grant update (business_name) on public.business_settings to authenticated;

-- -----------------------------------------------------------------------------
-- 8) Başlangıç fiyatları (kuruş). Yalnızca fiyatı henüz girilmemiş (NULL) kayıtları günceller;
--    panelden girilmiş bir fiyatın üzerine YAZMAZ ve yeni hizmet oluşturmaz.
-- -----------------------------------------------------------------------------
update public.services set price_minor = 70000 where name = 'Saç Kesimi'   and price_minor is null;
update public.services set price_minor = 50000 where name = 'Sakal Kesimi' and price_minor is null;
update public.services set price_minor = 90000 where name = 'Saç + Sakal'  and price_minor is null;

-- -----------------------------------------------------------------------------
-- Yetkiler
-- -----------------------------------------------------------------------------
revoke all on function public.check_slot(timestamptz, integer, uuid)                from public, anon, authenticated;
revoke all on function public.admin_available_slots(uuid, date)                    from public, anon;
revoke all on function public.admin_reschedule_appointment(uuid, timestamptz)      from public, anon;
grant execute on function public.admin_available_slots(uuid, date)                 to authenticated;
grant execute on function public.admin_reschedule_appointment(uuid, timestamptz)   to authenticated;

commit;
