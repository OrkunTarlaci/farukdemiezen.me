-- =============================================================================
-- 0008 — Toplu iptal: iptal nedeni ve WhatsApp bildirim durumu veritabanında
--
-- Toplu iptalin sonucu (hangi randevular, hangi nedenle iptal edildi, müşteriye WhatsApp sohbeti
-- açıldı mı) daha önce yalnızca tarayıcı belleğindeydi; başka cihazdan görünmüyordu. Bu migration
-- iki sütun ve iki yönetici fonksiyonu ekler. Yeni tablo yoktur.
--
--   appointments.cancellation_reason      — yöneticinin yazdığı neden (müşteri mesajında kullanılır)
--   appointments.cancel_notice_opened_at  — yönetici o müşteri için WhatsApp sohbetini açtı mı
--   admin_bulk_cancel(ids, reason)        — tek işlemde, randevu başına sonuçla iptal
--   admin_mark_cancel_notice(id)          — "WhatsApp açıldı" işareti (tekrar çağrılırsa ilk zaman korunur)
--
-- Yetki: ikisi de yalnızca is_admin() ile (oturumdaki kullanıcı admin_users'ta olmalı). anon çağıramaz.
-- Sütunlar appointments satırındadır: mevcut RLS (yalnızca yönetici okur) ve günlük temizlik
-- (geçmiş günler silinir) aynen geçerlidir.
--
-- Yıkıcı işlem yoktur; tek transaction. Tekrar çalıştırılması zararsızdır (IF NOT EXISTS / OR REPLACE).
-- =============================================================================

begin;

alter table public.appointments add column if not exists cancellation_reason text;
alter table public.appointments add column if not exists cancel_notice_opened_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_cancellation_reason_len') then
    alter table public.appointments
      add constraint appointments_cancellation_reason_len
      check (cancellation_reason is null or char_length(cancellation_reason) between 1 and 300);
  end if;
end;
$$;

-- Randevu başına sonuç döner: [{id, ok, code?}]. Biri uygun değilse (zaten iptal, tamamlanmış,
-- bulunamadı) atlanır, diğerleri iptal edilir. Satırlar kilitlenir: aynı anda iki cihazdan çalışsa
-- bile bir randevu yalnızca bir kez iptal edilir (ikincisi already_cancelled alır).
create or replace function public.admin_bulk_cancel(p_ids uuid[], p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reason text := nullif(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), '');
  v_id     uuid;
  a        public.appointments;
  v_out    jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason is null then raise exception 'reason_required'; end if;
  if char_length(v_reason) > 300 then raise exception 'reason_too_long'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'nothing_selected'; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many'; end if;

  foreach v_id in array (select array_agg(distinct x) from unnest(p_ids) x) loop
    select * into a from public.appointments where id = v_id for update;
    if not found then
      v_out := v_out || jsonb_build_object('id', v_id, 'ok', false, 'code', 'not_found');
    elsif a.status = 'cancelled' then
      v_out := v_out || jsonb_build_object('id', v_id, 'ok', false, 'code', 'already_cancelled');
    elsif a.status not in ('pending', 'confirmed') then
      v_out := v_out || jsonb_build_object('id', v_id, 'ok', false, 'code', 'invalid_transition');
    else
      update public.appointments
         set status = 'cancelled', cancelled_at = now(),
             cancellation_reason = v_reason, cancel_notice_opened_at = null
       where id = v_id;
      v_out := v_out || jsonb_build_object('id', v_id, 'ok', true);
    end if;
  end loop;

  return v_out;
end;
$$;

create or replace function public.admin_mark_cancel_notice(p_id uuid) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.appointments
     set cancel_notice_opened_at = coalesce(cancel_notice_opened_at, now())
   where id = p_id and status = 'cancelled' and cancellation_reason is not null
  returning cancel_notice_opened_at into v_at;
  if v_at is null then raise exception 'not_found'; end if;
  return v_at;
end;
$$;

revoke all on function public.admin_bulk_cancel(uuid[], text)  from public, anon;
revoke all on function public.admin_mark_cancel_notice(uuid)   from public, anon;
grant execute on function public.admin_bulk_cancel(uuid[], text) to authenticated;
grant execute on function public.admin_mark_cancel_notice(uuid)  to authenticated;

commit;
