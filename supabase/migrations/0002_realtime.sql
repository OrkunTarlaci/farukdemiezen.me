-- Canlı güncelleme: yönetici panelinin yeni randevuları yenilemeden görmesi için.
-- Realtime, RLS'e uyar; yalnızca yönetici oturumu bu değişiklikleri alır.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
     ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end;
$$;
