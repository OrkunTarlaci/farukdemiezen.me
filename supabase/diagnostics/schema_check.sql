-- =============================================================================
-- ŞEMA TEŞHİSİ — YALNIZCA OKUR, HİÇBİR ŞEYİ DEĞİŞTİRMEZ
-- Supabase SQL Editor'de çalıştırılabilir. Her migration'ın bıraktığı ayırt edici nesnelerin
-- var olup olmadığını ve kritik güvenlik ayarlarını tek tabloda gösterir.
-- Sonuç sütunları: migration | kontrol | durum (TAMAM / EKSİK) | ayrıntı
-- Kişisel veri okumaz; yalnızca sayılar ve katalog bilgisi döner.
-- =============================================================================
with checks(migration, kontrol, ok, ayrinti) as (
  values
  -- 0001
  ('0001', 'admin_users tablosu',            to_regclass('public.admin_users') is not null, null::text),
  ('0001', 'appointments tablosu',           to_regclass('public.appointments') is not null, null),
  ('0001', 'çakışma kısıtı (EXCLUDE)',       exists (select 1 from pg_constraint where conname = 'appointments_no_overlap'), null),
  ('0001', 'is_admin() fonksiyonu',          to_regprocedure('public.is_admin()') is not null, null),
  ('0001', 'appointments RLS açık',          coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.appointments')), false), null),
  ('0001', 'yönetici sayısı (en az 1)',      (select count(*) from public.admin_users) >= 1, (select count(*)::text || ' yönetici' from public.admin_users)),
  -- seed
  ('seed', 'business_settings satırı',       exists (select 1 from public.business_settings where id = 1), null),
  ('seed', 'çalışma saatleri (7 gün)',       (select count(*) from public.working_hours) = 7, (select count(*)::text || ' gün' from public.working_hours)),
  ('seed', 'hizmetler',                      (select count(*) from public.services) >= 1, (select count(*)::text || ' hizmet' from public.services)),
  -- 0002
  ('0002', 'appointments Realtime yayınında', exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'), null),
  -- 0003
  ('0003', 'private_settings tablosu',       to_regclass('public.private_settings') is not null, null),
  ('0003', 'rate_limit_counters tablosu',    to_regclass('public.rate_limit_counters') is not null, null),
  ('0003', 'enforce_public_query_limit',     to_regprocedure('public.enforce_public_query_limit(integer)') is not null, null),
  ('0003', 'get_available_slots VOLATILE',   coalesce((select provolatile = 'v' from pg_proc where oid = to_regprocedure('public.get_available_slots(date,uuid)')), false), null),
  -- 0004
  ('0004', 'hizmet yazma politikası',        exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'services_admin_update'), null),
  ('0004', 'harita bağlantısı https kısıtı', exists (select 1 from pg_constraint where conname = 'business_settings_map_url_https'), null),
  -- 0005
  ('0005', 'yeni durum kısıtı',              exists (select 1 from pg_constraint where conname = 'appointments_status_valid'), null),
  ('0005', 'appointments.price_minor',       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'price_minor'), null),
  ('0005', 'yeniden planlama fonksiyonu',    to_regprocedure('public.admin_reschedule_appointment(uuid,timestamptz)') is not null, null),
  ('0005', 'check_slot (3 parametreli)',     to_regprocedure('public.check_slot(timestamptz,integer,uuid)') is not null, null),
  ('0005', 'eski check_slot kaldırılmış',    to_regprocedure('public.check_slot(timestamptz,integer)') is null, null),
  -- 0006
  ('0006', 'appointments.is_test',           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'is_test'), null),
  ('0006', 'notification_logs tablosu',      to_regclass('public.notification_logs') is not null, null),
  ('0006', 'claim_notifications',            to_regprocedure('public.claim_notifications(uuid,integer)') is not null, null),
  ('0006', 'create_appointment (8 param.)',  to_regprocedure('public.create_appointment(uuid,timestamptz,text,text,text,text,text,boolean)') is not null, null),
  ('0006', 'eski create_appointment yok',    to_regprocedure('public.create_appointment(uuid,timestamptz,text,text,text,text,text)') is null, null),
  -- 0007
  ('0007', 'maintenance_runs tablosu',       to_regclass('public.maintenance_runs') is not null, null),
  ('0007', 'run_daily_cleanup fonksiyonu',   to_regprocedure('public.run_daily_cleanup(timestamptz,text)') is not null, null),
  ('0007', 'pg_cron eklentisi etkin',        exists (select 1 from pg_extension where extname = 'pg_cron'), null),
  -- 0015
  ('0015', 'randevu aralığı 60 kısıtı',      exists (select 1 from pg_constraint where conname = 'business_settings_hourly_interval'), null),
  ('0015', 'tam saat açılış kısıtı',         exists (select 1 from pg_constraint where conname = 'working_hours_opens_on_the_hour'), null),
  ('0015', 'Pazar kapalı',                   coalesce((select is_closed from public.working_hours where weekday = 7), false), null)
),
security(migration, kontrol, ok, ayrinti) as (
  -- Güvenlik: tarayıcı rolleri rezervasyonu doğrudan yapamamalı, müşteri verisini okuyamamalı.
  select 'güvenlik', 'anon create_appointment çağıramaz',
         not coalesce(has_function_privilege('anon', p.oid, 'EXECUTE'), false), null::text
    from pg_proc p where p.oid = to_regprocedure('public.create_appointment(uuid,timestamptz,text,text,text,text,text,boolean)')
  union all
  select 'güvenlik', 'authenticated create_appointment çağıramaz',
         not coalesce(has_function_privilege('authenticated', p.oid, 'EXECUTE'), false), null
    from pg_proc p where p.oid = to_regprocedure('public.create_appointment(uuid,timestamptz,text,text,text,text,text,boolean)')
  union all
  select 'güvenlik', 'anon appointments okuyamaz', not has_table_privilege('anon', 'public.appointments', 'SELECT'), null
  union all
  select 'güvenlik', 'anon private_settings okuyamaz', not has_table_privilege('anon', 'public.private_settings', 'SELECT'), null
    where to_regclass('public.private_settings') is not null
)
select migration, kontrol, case when ok then 'TAMAM' else 'EKSİK' end as durum, ayrinti
  from (select * from checks union all select * from security) t
 order by migration, kontrol;
