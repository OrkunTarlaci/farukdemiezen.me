-- =============================================================================
-- 0004 — Yönetim paneli: hizmet, çalışma saati, kapalı dönem ve ayar yönetimi
--
-- Yalnızca yönetici (admin_users + is_admin()) yazabilir. Yetki iki katmanlıdır:
--   1) Sütun düzeyinde GRANT: authenticated rolü yalnızca listelenen sütunları yazabilir
--      (ör. business_settings.timezone / currency, id, created_at yazılamaz).
--   2) RLS politikaları: satır yalnızca is_admin() doğruysa görülebilir/değiştirilebilir.
-- Değer doğrulaması mevcut CHECK kısıtlarıyla veritabanında yapılır; aşağıda eksik olanlar eklenir.
-- Rezervasyon kuralları (check_slot) ve çakışma koruması DEĞİŞMEZ; yeni ayarlar onları besler.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ek doğrulama kısıtları
-- -----------------------------------------------------------------------------
alter table public.business_settings
  add constraint business_settings_address_len   check (address is null or char_length(address) between 1 and 300),
  add constraint business_settings_phone_len     check (contact_phone is null or char_length(contact_phone) between 1 and 40),
  -- Yalnızca https bağlantıları (javascript: vb. şemalar engellenir)
  add constraint business_settings_map_url_https check (map_url is null or (map_url ~ '^https://[^[:space:]]+$' and char_length(map_url) <= 500)),
  add constraint business_settings_notice_max    check (minimum_booking_notice_minutes <= 10080),
  add constraint business_settings_phone_max     check (max_active_bookings_per_phone <= 20);

alter table public.services
  add constraint services_sort_order_range check (sort_order between 0 and 1000);

-- -----------------------------------------------------------------------------
-- Sütun düzeyinde yazma yetkileri (yalnızca authenticated; anon hiçbir şey yazamaz)
-- -----------------------------------------------------------------------------
grant insert (name, description, duration_minutes, price_minor, sort_order, is_active),
      update (name, description, duration_minutes, price_minor, sort_order, is_active)
  on public.services to authenticated;

grant update (is_closed, opens_at, closes_at, break_starts_at, break_ends_at)
  on public.working_hours to authenticated;

grant insert (starts_at, ends_at, reason), delete
  on public.blocked_periods to authenticated;

grant update (booking_interval_minutes, minimum_booking_notice_minutes, maximum_booking_horizon_days,
              max_active_bookings_per_phone, address, contact_phone, map_url)
  on public.business_settings to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: yalnızca yönetici. (Hizmet silme yoktur: geçmiş randevular hizmete bağlıdır;
-- bunun yerine pasifleştirilir.)
-- -----------------------------------------------------------------------------
create policy services_admin_insert on public.services
  for insert to authenticated with check (public.is_admin());
create policy services_admin_update on public.services
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy working_hours_admin_update on public.working_hours
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy blocked_admin_insert on public.blocked_periods
  for insert to authenticated with check (public.is_admin());
create policy blocked_admin_delete on public.blocked_periods
  for delete to authenticated using (public.is_admin());

create policy settings_admin_update on public.business_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
