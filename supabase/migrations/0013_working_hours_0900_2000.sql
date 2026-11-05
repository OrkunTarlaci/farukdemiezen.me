-- =============================================================================
-- 0013 — Çalışma saatleri 09:00–20:00, randevu aralığı 30 dakika
--
-- Yalnızca açık günler güncellenir; kapalı gün (Pazar) açılmaz. Mevcut randevulara dokunmaz.
-- Son randevu, hizmet süresine göre check_slot'ta hesaplanır: 20:00'ı aşan başlangıç sunulmaz.
-- Sonradan panelden (Menü → Çalışma Saatleri / Ayarlar) değiştirilebilir. Tek transaction.
-- =============================================================================

begin;

update public.working_hours
   set opens_at = '09:00', closes_at = '20:00'
 where not is_closed;

update public.business_settings
   set booking_interval_minutes = 30
 where id = 1;

commit;
