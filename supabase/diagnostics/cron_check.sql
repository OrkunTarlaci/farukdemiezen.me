-- =============================================================================
-- ZAMANLAYICI TEŞHİSİ (pg_cron / günlük temizlik) — YALNIZCA OKUR
-- Hiçbir fonksiyonu çalıştırmaz, hiçbir kaydı değiştirmez veya silmez. Kişisel veri okumaz.
-- Supabase SQL Editor yalnızca son sorgunun sonucunu gösterdiği için tek tablo döner:
--   kontrol | değer
-- pg_cron etkin olmalıdır (cron şeması yoksa sorgu hata verir; o durumda pg_cron kurulu değildir).
-- =============================================================================
with j as (
  select jobid, schedule, command, database, username, active
    from cron.job
   where jobname = 'daily-appointment-cleanup'
)
select kontrol, deger from (
  values
  (1,  'Şu an (UTC)',                         now()::text),
  (2,  'Şu an (İstanbul)',                    (now() at time zone 'Europe/Istanbul')::text),
  (3,  'Bir sonraki saat başı (UTC)',         date_trunc('hour', now() + interval '1 hour')::text),
  (4,  'pg_cron sürümü',                      (select extversion from pg_extension where extname = 'pg_cron')),
  (5,  'Bu veritabanı',                       current_database()),
  (6,  'cron.database_name (işlerin çalıştığı veritabanı)', coalesce(current_setting('cron.database_name', true), '(okunamadı)')),
  (7,  'cron.log_run (çalışma kaydı tutulur mu)', coalesce(current_setting('cron.log_run', true), '(okunamadı)')),
  (8,  'cron.timezone',                       coalesce(current_setting('cron.timezone', true), '(ayar yok → GMT/UTC)')),
  (9,  'pg_cron arka plan süreci',            (select coalesce(string_agg(backend_type || ' · başladı ' || backend_start::text, '; '), 'BULUNAMADI')
                                                 from pg_stat_activity where backend_type ilike '%cron%' or application_name ilike '%pg_cron%')),
  (10, 'İş: jobid / etkin',                   (select jobid::text || ' / ' || active::text from j)),
  (11, 'İş: zamanlama',                       (select schedule from j)),
  (12, 'İş: komut',                           (select command from j)),
  (13, 'İş: veritabanı',                      (select database from j)),
  (14, 'İş: çalıştıran rol',                  (select username from j)),
  (15, 'İş rolü run_daily_cleanup çalıştırabilir mi',
                                              (select has_function_privilege(username, 'public.run_daily_cleanup(timestamptz,text)', 'EXECUTE')::text from j)),
  (16, 'run_daily_cleanup fonksiyonu var mı', (to_regprocedure('public.run_daily_cleanup(timestamptz,text)') is not null)::text),
  (17, 'Bu işin çalışma kaydı sayısı',        (select count(*)::text from cron.job_run_details d, j where d.jobid = j.jobid)),
  (18, 'Bu işin son çalışması',               (select max(d.start_time)::text from cron.job_run_details d, j where d.jobid = j.jobid)),
  (19, 'Bu işin son durumu / mesajı',         (select d.status || ' / ' || left(coalesce(d.return_message, ''), 200)
                                                 from cron.job_run_details d, j where d.jobid = j.jobid order by d.start_time desc limit 1)),
  (20, 'Tüm işlerin çalışma kaydı sayısı',    (select count(*)::text from cron.job_run_details)),
  (21, 'maintenance_runs kayıt sayısı',       (select count(*)::text from public.maintenance_runs)),
  (22, 'maintenance_runs son çalışma',        (select max(ran_at)::text from public.maintenance_runs))
) as t(sira, kontrol, deger)
order by sira;

-- İSTEĞE BAĞLI, AYRI ÇALIŞTIRIN: işin komutunun geçerli olduğunu ÇALIŞTIRMADAN doğrular.
-- EXPLAIN (ANALYZE olmadan) yalnızca sorgu planını üretir; fonksiyon çağrılmaz, hiçbir şey silinmez.
-- explain select public.run_daily_cleanup();
