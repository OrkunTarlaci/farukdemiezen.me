-- =============================================================================
-- 0015 — Saat başı randevu düzeni
--
-- Hafta içi 11:00–19:00, Cumartesi 10:00–21:00 başlangıç; Pazar kapalı.
-- closes_at son randevunun BİTİŞ sınırıdır: 20:00 ve 22:00, 50 dakikalık hizmetin de son
-- saatte alınabilmesi içindir. check_slot, get_available_slots ve Edge Function değişmez;
-- hepsi bu tablolardan okur.
--
-- Kısıtlar yarım saati kalıcı olarak engeller: check_slot başlangıcı açılıştan itibaren
-- aralığın katı olarak denetlediği için açılış tam saat + aralık 60 = yalnızca tam saat.
-- Saatler panelden değiştirilebilir kalır; açılış yalnızca tam saat olabilir.
--
-- appointments tablosuna dokunmaz. Kapalı bırakılmış bir gün açılmaz. Tek transaction,
-- tekrar çalıştırılabilir.
-- =============================================================================

begin;

update public.working_hours
   set opens_at = '11:00', closes_at = '20:00'
 where weekday between 1 and 5 and not is_closed;

update public.working_hours
   set opens_at = '10:00', closes_at = '22:00'
 where weekday = 6 and not is_closed;

update public.working_hours set is_closed = true where weekday = 7;

-- Kapalı günlerin saatleri kullanılmaz; kısıt tüm satırlara uygulandığı için tam saate indirilir.
update public.working_hours
   set opens_at = make_time(extract(hour from opens_at)::int, 0, 0)
 where is_closed and opens_at <> make_time(extract(hour from opens_at)::int, 0, 0);

update public.business_settings set booking_interval_minutes = 60 where id = 1;

-- Temiz kurulumda seed.sql varsayılanla satır ekler; kısıtla çelişmemeli.
alter table public.business_settings alter column booking_interval_minutes set default 60;

alter table public.business_settings drop constraint if exists business_settings_hourly_interval;
alter table public.business_settings
  add constraint business_settings_hourly_interval check (booking_interval_minutes = 60);

alter table public.working_hours drop constraint if exists working_hours_opens_on_the_hour;
alter table public.working_hours
  add constraint working_hours_opens_on_the_hour
  check (opens_at = make_time(extract(hour from opens_at)::int, 0, 0));

commit;
