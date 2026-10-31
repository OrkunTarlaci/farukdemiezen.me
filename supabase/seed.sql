-- =============================================================================
-- BAŞLANGIÇ VERİSİ — GEÇİCİ YER TUTUCULAR
-- Aşağıdaki hizmet adları, süreler ve çalışma saatleri DOĞRULANMIŞ BİLGİ DEĞİLDİR.
-- Faruk Demirezen'den gerçek değerleri alıp güncelleyin. Fiyatlar bilerek NULL bırakıldı
-- (arayüz "Fiyat için sorunuz" gösterir). Fiyat girmek için kuruş cinsinden yazın:
--   update public.services set price_minor = 35000 where name = 'Saç Kesimi';  -- 350,00 TL
-- Müşteri kaydı eklemeyin; bu dosya yalnızca yapılandırma içerir.
-- =============================================================================

insert into public.business_settings (id) values (1) on conflict (id) do nothing;

insert into public.services (name, description, duration_minutes, price_minor, sort_order) values
  ('Saç Kesimi',  'Yıkama ve şekillendirme dahil klasik saç kesimi.',       30, null, 1),
  ('Sakal Kesimi','Sakal şekillendirme ve kontur düzeltme.',                 20, null, 2),
  ('Saç + Sakal', 'Saç kesimi ile sakal şekillendirmeyi birlikte kapsar.',   50, null, 3);

-- Pazartesi–Cumartesi 10:00–19:00, Pazar kapalı (geçici)
insert into public.working_hours (weekday, is_closed, opens_at, closes_at) values
  (1, false, '10:00', '19:00'),
  (2, false, '10:00', '19:00'),
  (3, false, '10:00', '19:00'),
  (4, false, '10:00', '19:00'),
  (5, false, '10:00', '19:00'),
  (6, false, '10:00', '19:00'),
  (7, true,  '10:00', '19:00')
on conflict (weekday) do nothing;
