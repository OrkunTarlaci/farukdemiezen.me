-- Yeni yönetici ekler. Migration değildir; gerektiğinde SQL Editor'de elle çalıştırılır.
-- E-posta adresi depoya yazılmasın diye yer tutucu kullanılır: YENI_YONETICI_EPOSTA yerine adresi yazın.
--
-- Önce: Dashboard → Authentication → Users → Invite user ile davet edin. Kullanıcı kendi parolasını belirler.
-- Bu betik parola oluşturmaz, kullanıcı oluşturmaz, mevcut yöneticileri değiştirmez, kimseyi silmez.
do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower('YENI_YONETICI_EPOSTA');
  if v_id is null then
    raise exception 'Bu e-postayla Supabase Auth kullanıcısı yok. Önce davet gönderin.';
  end if;
  insert into public.admin_users (user_id) values (v_id) on conflict (user_id) do nothing;
end;
$$;
