-- =============================================================================
-- 0010 — Genel rezervasyon sayacı CAPTCHA'dan sonra sayılır
--
-- Önceden booking_rate_limit_hit hem IP sayacını hem genel sayacı Turnstile'dan ÖNCE artırıyordu.
-- Geçersiz CAPTCHA'lı istekler genel sınırı doldurup herkesin randevu almasını engelleyebiliyordu.
--
--   booking_rate_limit_hit(ip)   — yalnızca IP başına sınır (Turnstile'dan önce)
--   booking_global_limit_hit()   — genel sınır (Turnstile başarılı olduktan sonra)
--
-- Sıra: önce bu migration, sonra create-booking dağıtımı. Eski fonksiyon bu migration ile de çalışır.
-- Yıkıcı işlem yoktur; tek transaction. Tekrar çalıştırılması zararsızdır (OR REPLACE).
-- =============================================================================

begin;

create or replace function public.booking_rate_limit_hit(p_client_ip text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.private_settings;
begin
  select * into c from public.private_settings where id = 1;
  if not found then return true; end if;
  return public.rate_limit_hit('booking_ip', coalesce(nullif(btrim(p_client_ip), ''), 'unknown'),
                               c.bookings_per_ip_per_hour, 3600);
end;
$$;

create or replace function public.booking_global_limit_hit() returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.private_settings;
begin
  select * into c from public.private_settings where id = 1;
  if not found then return true; end if;
  return public.rate_limit_hit('booking_global', 'all', c.bookings_global_per_hour, 3600);
end;
$$;

revoke all on function public.booking_global_limit_hit() from public, anon, authenticated;
grant execute on function public.booking_global_limit_hit() to service_role;

commit;
