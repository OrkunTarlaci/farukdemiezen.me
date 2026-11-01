-- =============================================================================
-- 0007 — Günlük randevu temizliği (veri en aza indirme)
--
-- Randevular ve içindeki kişisel veriler (ad, soyad, telefon, e-posta, not) yalnızca ilgili gün
-- boyunca tutulur. İşletme saat diliminde (business_settings.timezone = Europe/Istanbul) her gün
-- 00:00'da, başlangıcı o günden ÖNCE olan tüm randevular kalıcı olarak silinir. Normal günlük
-- çalışmada bu tam olarak "önceki takvim günü"dür; zamanlayıcı bir gün çalışmazsa, sonraki
-- çalışma kaçırılan günleri de siler (kişisel veri süresiz kalmaz).
--
-- Müşteri bilgileri ayrı bir tabloda değil, appointments satırının içindedir. Randevuya bağlı
-- durum geçmişi (appointment_status_history) ve SMS kayıtları (notification_logs) ON DELETE
-- CASCADE ile birlikte silinir. Hizmetler, fiyatlar, çalışma saatleri, kapalı dönemler, ayarlar
-- ve yönetici hesapları SİLİNMEZ. Arşiv tablosu oluşturulmaz.
--
-- Zamanlama: pg_cron her saat başı çalıştırır ('0 * * * *', UTC). Fonksiyon idempotenttir; yalnızca
-- İstanbul gün başlangıcından önceki kayıtları siler. Böylece 00:00 İstanbul (21:00 UTC) çalışması
-- silmeyi yapar, diğer saatler hiçbir şey silmez; yaz saati uygulaması olsa bile gün sınırı
-- veritabanının saat dilimi kurallarıyla doğru hesaplanır.
--
-- Yıkıcı şema işlemi yoktur; tek transaction. pg_cron etkin değilse iş oluşturulmaz (NOTICE verir)
-- ve panelde "zamanlayıcı kurulu değil" uyarısı görünür. Bir kez çalıştırılmalıdır.
-- =============================================================================

begin;

-- Operasyon kaydı: kişisel veri içermez (yalnızca zaman, kesim anı ve sayılar). 30 günden eski
-- kayıtlar her çalışmada temizlenir.
create table public.maintenance_runs (
  id                      bigint generated always as identity primary key,
  job                     text not null check (job = 'daily_appointment_cleanup'),
  ran_at                  timestamptz not null default now(),
  cutoff                  timestamptz not null,
  deleted_appointments    integer not null check (deleted_appointments >= 0),
  deleted_rate_limit_rows integer not null default 0 check (deleted_rate_limit_rows >= 0),
  trigger                 text not null check (trigger in ('scheduler', 'manual'))
);
create index maintenance_runs_job_idx on public.maintenance_runs (job, ran_at desc);

alter table public.maintenance_runs enable row level security;
revoke all on public.maintenance_runs from anon, authenticated;

-- İşletme gününün başlangıcı (business_settings.timezone'a göre 00:00). Yaz saati geçişlerinde de
-- doğrudur: yerel gün kesilir, sonra aynı saat dilimiyle tekrar mutlak zamana çevrilir.
create function public.business_day_start(p_at timestamptz) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select date_trunc('day', p_at at time zone s.timezone) at time zone s.timezone
    from public.business_settings s
   where s.id = 1;
$$;

-- Asıl temizlik. Yalnızca veritabanı sahibi (SQL Editor / pg_cron) çağırabilir.
-- p_now yalnızca test ve elle çalıştırma içindir; zamanlayıcı varsayılanı (sunucu saati) kullanır.
create function public.run_daily_cleanup(p_now timestamptz default now(), p_trigger text default 'scheduler')
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cutoff  timestamptz;
  v_appts   integer;
  v_rl      integer;
begin
  if p_trigger is null or p_trigger not in ('scheduler', 'manual') then
    raise exception 'invalid_trigger';
  end if;
  v_cutoff := public.business_day_start(coalesce(p_now, now()));
  if v_cutoff is null then
    raise exception 'not_configured';
  end if;

  -- Rezervasyon ve yeniden planlamayla aynı kilit: temizlik sırasında yeni kayıt araya girmez.
  perform pg_advisory_xact_lock(727001);

  delete from public.appointments where starts_at < v_cutoff;
  get diagnostics v_appts = row_count;

  -- IP özetleri (kişisel veri sayılabilir) en fazla 1 gün tutulur.
  delete from public.rate_limit_counters where window_start < coalesce(p_now, now()) - interval '1 day';
  get diagnostics v_rl = row_count;

  insert into public.maintenance_runs (job, cutoff, deleted_appointments, deleted_rate_limit_rows, trigger)
  values ('daily_appointment_cleanup', v_cutoff, v_appts, v_rl, p_trigger);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';

  -- Postgres günlüğüne yalnızca sayılar yazılır; isim, telefon veya randevu ayrıntısı yazılmaz.
  raise log 'daily_appointment_cleanup cutoff=% deleted_appointments=% deleted_rate_limit_rows=%', v_cutoff, v_appts, v_rl;

  return jsonb_build_object('cutoff', v_cutoff, 'deleted_appointments', v_appts, 'deleted_rate_limit_rows', v_rl);
end;
$$;

-- Yönetici: zamanlayıcının ve son çalışmanın durumu (kişisel veri yok).
--   scheduler: 'scheduled' | 'inactive' | 'not_scheduled' | 'not_installed'
create function public.admin_cleanup_status() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_scheduler text := 'not_installed';
  v_schedule  text;
  v_active    boolean;
  r           public.maintenance_runs;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if to_regclass('cron.job') is not null then
    execute 'select schedule, active from cron.job where jobname = $1 limit 1'
       into v_schedule, v_active using 'daily-appointment-cleanup';
    v_scheduler := case when v_schedule is null then 'not_scheduled' when v_active then 'scheduled' else 'inactive' end;
  end if;

  select * into r from public.maintenance_runs
   where job = 'daily_appointment_cleanup' order by ran_at desc limit 1;

  return jsonb_build_object(
    'scheduler', v_scheduler,
    'schedule', v_schedule,
    'last_run_at', r.ran_at,
    'last_trigger', r.trigger,
    'last_deleted_appointments', r.deleted_appointments,
    'current_day_start', public.business_day_start(now())
  );
end;
$$;

-- Yönetici: temizliği hemen çalıştırır (zamanlayıcıyı doğrulamak veya kaçırılan bir günü telafi
-- etmek için). Yalnızca bugünden önceki randevuları siler; bugünü ve geleceği korur.
create function public.admin_run_cleanup() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.run_daily_cleanup(now(), 'manual');
end;
$$;

revoke all on function public.business_day_start(timestamptz)   from public, anon, authenticated;
revoke all on function public.run_daily_cleanup(timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_cleanup_status()            from public, anon;
revoke all on function public.admin_run_cleanup()               from public, anon;
grant execute on function public.admin_cleanup_status()         to authenticated;
grant execute on function public.admin_run_cleanup()            to authenticated;

-- Zamanlayıcı: pg_cron etkinse işi oluşturur veya günceller (aynı adla tekrar çağrılması güvenlidir).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('daily-appointment-cleanup', '0 * * * *', 'select public.run_daily_cleanup()');
    raise notice 'daily-appointment-cleanup zamanlandı (her saat başı; silme 00:00 Europe/Istanbul çalışmasında olur).';
  else
    raise notice 'pg_cron etkin değil: günlük temizlik ZAMANLANMADI. Database → Extensions → pg_cron etkinleştirip README''deki zamanlama komutunu çalıştırın.';
  end if;
end;
$$;

commit;
