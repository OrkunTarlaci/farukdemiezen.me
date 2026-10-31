-- =============================================================================
-- BAŞLANGIÇ VERİSİ — GEÇİCİ YER TUTUCULAR
-- Hizmetler ve fiyatlar işletmenin bildirdiği başlangıç değerleridir; çalışma saatleri
-- GEÇİCİDİR. Tümü yönetim panelinden değiştirilebilir.
-- Müşteri kaydı eklemeyin; bu dosya yalnızca yapılandırma içerir.
-- =============================================================================

insert into public.business_settings (id) values (1) on conflict (id) do nothing;

-- Aynı adlı hizmet zaten varsa eklenmez (dosya tekrar çalıştırılabilir). Fiyatlar kuruş cinsindendir:
-- 70000 = 700 TL. Sonraki değişiklikler yönetim panelinden (Hizmetler) yapılır.
insert into public.services (name, description, duration_minutes, price_minor, sort_order)
select v.name, v.description, v.duration_minutes, v.price_minor, v.sort_order
  from (values
    ('Saç Kesimi',   'Yıkama ve şekillendirme dahil klasik saç kesimi.',     30, 70000, 1),
    ('Sakal Kesimi', 'Sakal şekillendirme ve kontur düzeltme.',               20, 50000, 2),
    ('Saç + Sakal',  'Saç kesimi ile sakal şekillendirmeyi birlikte kapsar.', 50, 90000, 3)
  ) as v(name, description, duration_minutes, price_minor, sort_order)
 where not exists (select 1 from public.services s where s.name = v.name);

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
