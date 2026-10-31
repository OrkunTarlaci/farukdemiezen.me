# KVKK — Gerçek müşteri verisi toplanmadan önce

> **Önemli:** Bu belge ve sitedeki aydınlatma metni **taslaktır**. Hiçbiri bir hukukçu tarafından incelenmemiştir ve KVKK'ya uygun oldukları **doğrulanmamıştır**. Aşağıdaki maddeler teknik ekibin belirleyebildiği konulardır; hukuki karar yerine geçmez.

## 1. Canlıya çıkmadan önce tamamlanması gerekenler

| # | Konu | Durum | Kim |
|---|---|---|---|
| 1 | **Veri sorumlusu bilgileri** `src/config/site.ts` → `privacy.dataController` (ad/unvan, adres, başvuru e-postası/telefonu) | ⬜ Boş | İşletme |
| 2 | **Aydınlatma metni** (`src/components/site/PrivacyNotice.tsx`) hukukçu tarafından gözden geçirilmeli: hukuki sebepler (md. 5/2-c, 5/2-f), amaçlar, aktarım bölümü | ⬜ Taslak | Hukukçu |
| 3 | **Yurt dışına aktarım (md. 9):** Supabase, Cloudflare, GitHub ve Google Fonts sunucuları yurt dışında olabilir. Hangi aktarım aracının (ör. standart sözleşme ve Kurul'a bildirim) gerektiği belirlenmeli | ⬜ Belirlenmedi | Hukukçu |
| 4 | **Saklama süresi:** öneri 180 gün (aşağıda). Kabul edilen süre hem veritabanına hem `site.ts`'e yazılmalı | ⬜ Öneri | İşletme + hukukçu |
| 5 | **Otomatik silme işi** (pg_cron) kurulmalı (README, bölüm 2) | ⬜ Kurulmadı | Kurulumu yapan |
| 6 | **VERBİS:** işletmenin kayıt yükümlülüğünden muaf olup olmadığı kontrol edilmeli | ⬜ Kontrol edilmedi | Hukukçu / mali müşavir |
| 7 | **Veri işleyen sözleşmeleri:** Supabase ve Cloudflare'in veri işleme sözleşmeleri (DPA) incelenmeli | ⬜ İncelenmedi | İşletme |
| 8 | **Başvuru süreci:** md. 11 başvurularının en geç 30 gün içinde yanıtlanacağı bir iç süreç tanımlanmalı (aşağıda teknik adımlar) | ⬜ | İşletme |
| 9 | Onaydan sonra `site.ts` içinde `privacy.approved: true` yapılmalı (sitedeki "taslak" uyarısı kalkar) | ⬜ | Kurulumu yapan |

## 2. İşlenen veriler (teknik envanter)

| Veri | Nerede | Neden | Ne kadar süre |
|---|---|---|---|
| Ad, soyad, cep telefonu | `appointments` | Randevu, iletişim | Saklama süresi (öneri 180 gün, randevu bitişinden itibaren) |
| E-posta, not (isteğe bağlı) | `appointments` | İletişim, müşterinin talebi | Aynı |
| Randevu durum geçmişi (kimin, ne zaman değiştirdiği) | `appointment_status_history` | Denetim izi | Randevuyla birlikte silinir (cascade) |
| IP adresi | **Saklanmaz.** Yalnızca tuzlanmış SHA-256 özeti, `rate_limit_counters` | Hız sınırı / kötüye kullanımı önleme | En fazla ~1 gün |
| Turnstile sinyalleri | Cloudflare | Bot doğrulaması | Cloudflare'in politikası |
| Yönetici e-postası, oturum | Supabase Auth | Yönetici girişi | Hesap var olduğu sürece |

Site çerez veya analitik aracı kullanmaz. Supabase oturumu yalnızca yönetici için tarayıcıda (localStorage) tutulur. Google Fonts yazı tipleri Google sunucularından yüklenir (ziyaretçinin IP adresi Google'a gider); bu istenmiyorsa yazı tipleri `public/` altına alınıp yerelden sunulabilir.

## 2b. SMS bildirimleri

- **Amaç:** Yalnızca randevu bilgilendirmesi (talep alındı, onaylandı, iptal edildi, yeniden planlandı). Pazarlama veya kampanya içeriği gönderilmez; bu tür bir içerik eklenirse İYS (İleti Yönetim Sistemi) kaydı ve açık rıza ayrıca gerekir.
- **Öngörülen hukuki sebep (taslak):** sözleşmenin kurulması veya ifasıyla doğrudan ilgili olma (KVKK md. 5/2-c). Hukukçu ile teyit edilmelidir.
- **Aktarım:** Telefon numarası ve randevu bilgisi SMS sağlayıcısına iletilir. Sağlayıcı seçildiğinde aydınlatma metnine adı yazılmalı ve veri işleyen sözleşmesi incelenmelidir.
- **Saklama:** `notification_logs` telefon numarası veya mesaj metni içermez; randevu silinince bildirim kayıtları da silinir (cascade).
- **Gönderen başlığı:** Türkiye'de SMS gönderen başlığı (ör. "FDEMIREZEN") sağlayıcı üzerinden onaylatılır; genellikle işletme belgeleri istenir.

## 3. Saklama süresi (öneri)

- **Öneri: randevu bitişinden itibaren 180 gün.** Gerekçe: olası itiraz/şikâyet ve tekrar randevu kolaylığı için makul bir süre. Bu süre **hukuki bir zorunluluğa dayanarak belirlenmemiştir**; vergi veya başka bir mevzuat daha uzun ya da daha kısa saklamayı gerektirebilir. Hukukçu ile teyit edin.
- İptal edilen randevular da aynı kurala tabidir.
- Uygulama: `public.purge_expired_customer_data()` süresi dolan randevuları ve geçmişlerini **kalıcı olarak siler**. Günlük çalıştırılmalıdır (pg_cron, README).
- Süreyi değiştirmek:

  ```sql
  update public.private_settings set customer_data_retention_days = 180;
  ```

  Ardından `src/config/site.ts` → `privacy.retentionDays` değerini aynı sayıya ayarlayın (aydınlatma metninde görünür).

## 4. Silme ve diğer başvurular (md. 11)

Kimlik doğrulaması (başvuranın numaranın sahibi olduğundan emin olmak) işletmenin sorumluluğundadır; örneğin ilgili numarayı geri arayarak.

```sql
-- Kişiye ait kayıtları görme (bilgi talebi)
select reference_code, starts_at, status, customer_email, customer_note
  from public.appointments where customer_phone = public.normalize_tr_phone('0532 111 22 33');

-- Düzeltme
update public.appointments set customer_last_name = 'Doğru Soyad'
 where customer_phone = public.normalize_tr_phone('0532 111 22 33');

-- Silme: o telefona ait TÜM randevular (gelecektekiler dahil) kalıcı olarak silinir
select public.delete_customer_data('0532 111 22 33');
```

Bu fonksiyonlar yalnızca Supabase SQL Editor'den (veritabanı sahibi olarak) çalışır; ön yüzden veya API'den çağrılamaz. Supabase'in otomatik yedeklerinde silinen veri, yedek saklama süresi dolana kadar kalabilir; bu durum aydınlatma metninde belirtilmeli mi, hukukçuya sorun.

## 5. Teknik güvenlik önlemleri (mevcut)

- Müşteri verisini yalnızca `admin_users` tablosundaki yönetici okuyabilir (RLS). Anonim kullanıcı hiçbir müşteri verisini okuyamaz.
- Rezervasyon yalnızca Cloudflare Turnstile doğrulamasından sonra, sunucu tarafındaki Edge Function üzerinden yapılabilir.
- Anonim takvim sorgularında ve rezervasyon denemelerinde IP başına ve genel hız sınırı vardır.
- Gizli anahtarlar (service_role, Turnstile gizli anahtarı) yalnızca Supabase Function Secrets'ta durur; ön yüzde yoktur.
- Bağlantılar HTTPS üzerindendir (GitHub Pages ve Supabase).
