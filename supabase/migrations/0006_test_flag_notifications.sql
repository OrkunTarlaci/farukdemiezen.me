-- =============================================================================
-- 0006 — Test randevusu işareti ve SMS bildirim kayıtları
--
-- 1) appointments.is_test: Randevunun test olup olmadığına İSTEMCİ DEĞİL sunucu karar verir.
--    create-booking, Cloudflare'in doğruladığı Turnstile hostname'i localhost ise is_test=true yazar.
--    Test kayıtları panelde işaretlenir, ciroya ve istatistiklere girmez, panelden silinebilir.
-- 2) notification_logs: Her bildirim (talep alındı, onaylandı, iptal, yeniden planlandı) randevu
--    değişikliğiyle AYNI transaction içinde kuyruğa yazılır; gönderim ayrı yapılır. SMS başarısız
--    olsa da randevu geri alınmaz. dedupe_key tekil olduğu için aynı bildirim iki kez oluşmaz.
--    Telefon numarası ve mesaj metni burada SAKLANMAZ (gönderim anında randevudan okunur).
--
-- Yıkıcı işlem yoktur; tek transaction. create_appointment'ın imzası değiştiği için eski sürüm
-- kaldırılıp yenisi oluşturulur (aynı adlı iki sürüm belirsizlik yaratırdı). Yetkiler yeniden verilir.
-- Bir kez çalıştırılmalıdır (tekrar çalıştırılırsa hata verir ve hiçbir şey değişmez).
-- =============================================================================

begin;

alter table public.appointments add column is_test boolean not null default false;

create table public.notification_logs (
  id                  bigint generated always as identity primary key,
  appointment_id      uuid not null references public.appointments (id) on delete cascade,
  kind                text not null check (kind in ('booking_received', 'confirmed', 'cancelled', 'rescheduled')),
  dedupe_key          text not null unique,
  channel             text not null default 'sms' check (channel = 'sms'),
  status              text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts            integer not null default 0,
  provider            text,
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 100),
  error_code          text check (error_code is null or char_length(error_code) <= 100),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  sent_at             timestamptz
);
create index notification_logs_appt_idx on public.notification_logs (appointment_id);
create index notification_logs_pending_idx on public.notification_logs (status) where status in ('pending', 'sending');

create trigger notification_logs_updated_at before update on public.notification_logs
  for each row execute function public.set_updated_at();

alter table public.notification_logs enable row level security;
revoke all on public.notification_logs from anon, authenticated;
grant select on public.notification_logs to authenticated;
create policy notification_logs_admin_read on public.notification_logs
  for select to authenticated using (public.is_admin());

-- Kuyruğa ekleme (iç kullanım). Aynı dedupe_key ikinci kez eklenmez.
create function public.enqueue_notification(p_appointment uuid, p_kind text, p_dedupe text) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.notification_logs (appointment_id, kind, dedupe_key)
  values (p_appointment, p_kind, p_dedupe)
  on conflict (dedupe_key) do nothing;
$$;

-- -----------------------------------------------------------------------------
-- create_appointment: p_is_test (yalnızca service_role çağırabilir; değeri Edge Function,
-- Cloudflare'in doğruladığı hostname'e göre verir). Kurallar ve kilit 0005 ile aynıdır.
-- -----------------------------------------------------------------------------
drop function public.create_appointment(uuid, timestamptz, text, text, text, text, text);

create function public.create_appointment(
  p_service_id uuid,
  p_starts_at  timestamptz,
  p_first_name text,
  p_last_name  text,
  p_phone      text,
  p_email      text default null,
  p_note       text default null,
  p_is_test    boolean default false
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
        customer_phone, customer_email, customer_note, starts_at, ends_at, is_test
      ) values (
        v_code, svc.id, svc.name, svc.price_minor, v_first, v_last, v_phone, v_email, v_note, p_starts_at, v_end,
        coalesce(p_is_test, false)
      ) returning id into v_id;
      exit;
    exception
      when exclusion_violation then
        raise exception 'slot_unavailable';
      when unique_violation then
        if attempt = 5 then raise exception 'try_again'; end if;
    end;
  end loop;

  perform public.enqueue_notification(v_id, 'booking_received', v_id::text || ':booking_received');

  return jsonb_build_object(
    'id', v_id,
    'reference_code', v_code,
    'starts_at', p_starts_at,
    'ends_at', v_end,
    'service_name', svc.name,
    'duration_minutes', svc.duration_minutes,
    'price_minor', svc.price_minor,
    'status', 'pending',
    'is_test', coalesce(p_is_test, false)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Durum değiştirme: 0005 ile aynı kurallar + onay/iptal bildirimini aynı transaction'da kuyruğa ekler.
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

  if p_status in ('confirmed', 'cancelled') then
    perform public.enqueue_notification(p_id, p_status, p_id::text || ':' || p_status);
  end if;

  return jsonb_build_object('id', p_id, 'status', p_status);
end;
$$;

-- -----------------------------------------------------------------------------
-- Yeniden planlama: 0005 ile aynı + yeni saat için bildirim (her yeni saat ayrı bildirimdir).
-- -----------------------------------------------------------------------------
create or replace function public.admin_reschedule_appointment(p_id uuid, p_starts_at timestamptz) returns jsonb
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

  perform public.enqueue_notification(
    p_id, 'rescheduled', p_id::text || ':rescheduled:' || extract(epoch from p_starts_at)::bigint::text
  );

  return jsonb_build_object('id', p_id, 'starts_at', p_starts_at, 'ends_at', v_end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Gönderim (yalnızca send-notifications / create-booking Edge Function'ları, service_role):
-- claim → gönder → finish. "sending" durumundaki kayıt başka bir işlem tarafından alınamaz;
-- 10 dakikadan uzun süre "sending"de kalan kayıt (çöken gönderim) yeniden alınabilir.
-- -----------------------------------------------------------------------------
create function public.claim_notifications(p_appointment uuid default null, p_limit integer default 20)
returns setof public.notification_logs
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  update public.notification_logs n
     set status = 'sending', attempts = n.attempts + 1
   where n.id in (
     select l.id from public.notification_logs l
      where (l.status = 'pending' or (l.status = 'sending' and l.updated_at < now() - interval '10 minutes'))
        and (p_appointment is null or l.appointment_id = p_appointment)
      order by l.id
      limit greatest(1, least(coalesce(p_limit, 20), 100))
      for update skip locked
   )
  returning n.*;
end;
$$;

create function public.finish_notification(
  p_id bigint, p_status text, p_provider text, p_message_id text default null, p_error text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_status not in ('sent', 'failed', 'skipped') then raise exception 'invalid_status'; end if;
  update public.notification_logs
     set status = p_status,
         provider = left(p_provider, 40),
         provider_message_id = left(p_message_id, 100),
         error_code = left(p_error, 100),
         sent_at = case when p_status = 'sent' then now() else null end
   where id = p_id and status = 'sending';
end;
$$;

-- Yönetici: başarısız veya atlanmış bildirimi yeniden kuyruğa al. Gönderilmiş olan tekrar
-- kuyruğa alınamaz (müşteriye yinelenen SMS gitmesini önler).
create function public.admin_requeue_notification(p_id bigint) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_appt uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.notification_logs
     set status = 'pending', error_code = null
   where id = p_id and status in ('failed', 'skipped')
  returning appointment_id into v_appt;
  if v_appt is null then raise exception 'invalid_transition'; end if;
  return v_appt;
end;
$$;

-- Yönetici: yalnızca TEST randevusunu (ve bildirim kayıtlarını) kalıcı olarak siler.
create function public.admin_delete_test_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.appointments where id = p_id and is_test;
  if not found then raise exception 'not_test'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Yetkiler
-- -----------------------------------------------------------------------------
revoke all on function public.enqueue_notification(uuid, text, text)                               from public, anon, authenticated;
revoke all on function public.create_appointment(uuid, timestamptz, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.claim_notifications(uuid, integer)                                   from public, anon, authenticated;
revoke all on function public.finish_notification(bigint, text, text, text, text)                  from public, anon, authenticated;
revoke all on function public.admin_requeue_notification(bigint)                                   from public, anon;
revoke all on function public.admin_delete_test_appointment(uuid)                                  from public, anon;

grant execute on function public.create_appointment(uuid, timestamptz, text, text, text, text, text, boolean) to service_role;
grant execute on function public.claim_notifications(uuid, integer)                                   to service_role;
grant execute on function public.finish_notification(bigint, text, text, text, text)                  to service_role;
grant execute on function public.admin_requeue_notification(bigint)                                   to authenticated;
grant execute on function public.admin_delete_test_appointment(uuid)                                  to authenticated;

commit;
