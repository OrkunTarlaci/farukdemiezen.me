-- =============================================================================
-- 0009 — Yöneticinin telefonuna "yeni randevu" bildirimi (Web Push)
--
-- Yönetici panelde "Bildirimleri Aç" dediğinde tarayıcının verdiği bildirim adresi (endpoint) burada
-- saklanır. Yeni randevu gelince create-booking bu adreslere BOŞ bir bildirim gönderir; metin telefondaki
-- service worker'da sabittir. Bu yüzden tabloda ve bildirimde müşteri bilgisi yoktur.
--
-- Yetki: tablo RLS ile kapalıdır, politikası yoktur. Yazma yalnızca is_admin() denetimli iki fonksiyonla;
-- okuma yalnızca service_role (create-booking) ile. anon ve authenticated tabloya doğrudan erişemez.
--
-- Yıkıcı işlem yoktur; tek transaction. Tekrar çalıştırılması zararsızdır (IF NOT EXISTS / OR REPLACE).
-- =============================================================================

begin;

create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  endpoint   text not null unique check (char_length(endpoint) between 9 and 1000 and endpoint like 'https://%'),
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, delete on table public.push_subscriptions to service_role;

create or replace function public.admin_save_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (endpoint) values (p_endpoint)
  on conflict (endpoint) do nothing;
end;
$$;

create or replace function public.admin_delete_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

revoke all on function public.admin_save_push_subscription(text)   from public, anon;
revoke all on function public.admin_delete_push_subscription(text) from public, anon;
grant execute on function public.admin_save_push_subscription(text)   to authenticated;
grant execute on function public.admin_delete_push_subscription(text) to authenticated;

commit;
