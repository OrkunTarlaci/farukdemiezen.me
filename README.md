# Faruk Demirezen — Randevu Sistemi

Müşteriler için sade bir berber sitesi ve online randevu akışı; Faruk Demirezen için günlük randevuları gösteren özel bir yönetim paneli.

- **Ön yüz:** React + TypeScript + Vite + Tailwind CSS, Lucide ikonları, React Hook Form + Zod. GitHub Pages'te barındırılır. Koyu, sade bir tema kullanılır; renkler `src/index.css` içindeki tasarım token'larından gelir.
- **Arka uç:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions). Tüm yazma işlemleri veritabanındaki güvenli fonksiyonlarla yapılır.
- **Bot koruması:** Cloudflare Turnstile. Rezervasyon yalnızca `create-booking` Edge Function'ı üzerinden yapılır; bu fonksiyon CAPTCHA sonucunu Cloudflare'de doğrulamadan veritabanına gitmez.
- **Adresler:** müşteri sitesi `…/#/`, yönetim paneli `…/#/admin`. (Hash tabanlı yönlendirme kullanılır; GitHub Pages'te sayfa yenilemede 404 sorunu yaşanmaz.)

> Bu depo yalnızca kodu içerir. Canlı bir Supabase projesi **bağlanmamış**, Edge Function **dağıtılmamış**, Turnstile pencere öğesi **oluşturulmamış**, site **yayınlanmamış** ve yönetici hesabı **oluşturulmamıştır**. Hiçbir canlı test yapılmamıştır. Aşağıdaki adımlar bunun nasıl yapılacağını anlatır; yapmanız gerekenlerin kısa listesi **bölüm 6**'dadır.

---

## 1. Yerelde çalıştırma

Gereksinim: Node.js 20 veya üzeri.

```bash
npm ci
cp .env.example .env     # değerleri doldurun (bkz. bölüm 2 ve 3)
npm run dev              # http://localhost:5173
npm test                 # tüm testler
npm run build            # üretim derlemesi (dist/)
```

- `.env` doldurulmadan `npm run dev` çalıştırılırsa site **geliştirme önizlemesi** modunda açılır: örnek hizmetler gösterilir, randevu alınamaz ve bu açıkça belirtilir. Önizleme verisi üretim derlemesine girmez.
- Yerelde Turnstile için Cloudflare'in her zaman geçen **test site anahtarı** kullanılabilir: `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA`. Bu anahtarla üretilen token'ı yalnızca test gizli anahtarı (`1x0000000000000000000000000000000AA`) kabul eder; canlı Edge Function'da gerçek gizli anahtar varken yerelden randevu oluşturulamaz (beklenen davranış).
- Randevu kaydı Edge Function gerektirir. Yerelde uçtan uca denemek için ya canlı projeye dağıtılmış fonksiyonu kullanın ya da Supabase CLI ile yerel yığını çalıştırın (`supabase start`, `supabase functions serve create-booking --no-verify-jwt --env-file <dosya>`). Yerel yığın bu depoda denenmedi.

## 2. Supabase kurulumu

1. [supabase.com](https://supabase.com) üzerinde yeni bir proje oluşturun.
2. **SQL Editor**'de sırayla şu dosyaların içeriğini çalıştırın:
   1. `supabase/migrations/0001_schema.sql` — tablolar, kısıtlar, RLS, rezervasyon fonksiyonları
   2. `supabase/migrations/0002_realtime.sql` — yöneticinin yeni randevuları canlı görmesi
   3. `supabase/migrations/0003_security.sql` — rezervasyonu Edge Function'a kapatma, hız sınırı, performans, KVKK saklama/silme
   4. `supabase/migrations/0004_admin_management.sql` — yönetim panelinden hizmet, çalışma saati, kapalı dönem ve ayar düzenleme (yalnızca yönetici)
   5. `supabase/seed.sql` — başlangıç hizmetleri (700 / 500 / 900 TL) ve **geçici** çalışma saatleri; tekrar çalıştırılırsa hizmet çoğalmaz
   6. `supabase/migrations/0005_operations.sql` — "tamamlandı" / "gelmedi" durumları, randevu anındaki fiyat kaydı, yeniden planlama, işletme adı düzenleme, başlangıç fiyatları
   7. `supabase/migrations/0006_test_flag_notifications.sql` — test randevusu işareti (`is_test`), SMS bildirim kuyruğu (`notification_logs`), test randevusunu panelden silme
   8. `supabase/migrations/0007_daily_cleanup.sql` — her gece 00:00 (İstanbul) önceki günlerin randevularını silen günlük temizlik ve zamanlayıcısı (aşağıda "Günlük veri temizliği")
   9. `supabase/migrations/0008_bulk_cancel.sql` — toplu iptal: iptal nedeni ve "WhatsApp açıldı" durumu randevu satırında saklanır, böylece her cihazda aynı görünür. Yalnızca sütun ve yönetici fonksiyonu ekler; tekrar çalıştırılması zararsızdır.

   > **0006, 0005'ten sonra bir kez çalıştırılır.** Tek transaction'dır, veri silmez. Uygulama kodu 0006'ya bağlıdır: çalıştırılmadan yönetim panelindeki randevu listeleri hata verir.

   > **0001–0004 ve seed'i zaten çalıştırdıysanız yalnızca `0005_operations.sql` dosyasını bir kez çalıştırın.** Tek transaction'dır; hata olursa hiçbir şey değişmez. Veri silmez. Yalnızca fiyatı boş (NULL) olan "Saç Kesimi", "Sakal Kesimi", "Saç + Sakal" kayıtlarına 700 / 500 / 900 TL yazar; panelden girilmiş fiyatın üzerine yazmaz. **Uygulama kodu 0005'e bağlıdır:** çalıştırılmadan yönetim panelindeki randevu listeleri ve ayar kaydı hata verir.

   > `0001` daha önce çalıştırıldıysa ve sonradan `search_path` satırları değiştiyse (`public, pg_temp`), bu değişiklik mevcut veritabanına kendiliğinden yansımaz. Temiz bir projede sıfırdan kurmak en kolayıdır.
3. **Project Settings → API** sayfasından şunları alıp `.env` dosyasına yazın:
   - `VITE_SUPABASE_URL` → Project URL
   - `VITE_SUPABASE_ANON_KEY` → `anon` / publishable anahtar
   - **`service_role` / secret anahtarı hiçbir yere, özellikle ön yüze, koymayın.** Edge Function bu anahtarı Supabase'in kendi ortam değişkeninden otomatik alır.
4. **Authentication → Providers → Email** bölümünde **"Allow new users to sign up"** seçeneğini **kapatın**. (Kayıt açık olsa bile yeni kullanıcılar yönetici olamaz; yine de kapatmak doğrusudur.)
5. Edge Function'ı dağıtın (bölüm 4).
6. KVKK otomatik silme işini kurun (aşağıda).

### Yönetici hesabını oluşturma

1. **Authentication → Users → Add user → Create new user**: Faruk'un e-postası ve güçlü bir parola; "Auto Confirm User" işaretli olsun.
2. SQL Editor'de yetkiyi verin (e-postayı değiştirin):

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'faruk@ornek.com';
   ```

Yetki yalnızca `admin_users` tablosundaki satırla verilir. Bu tablo istemciye hiçbir şekilde açık değildir; ön yüzden yönetici eklenemez.

### Gerçek bilgileri girme (önemli)

`seed.sql` içindeki hizmet adları, süreler ve çalışma saatleri **doğrulanmamış yer tutuculardır**; fiyatlar bilerek boştur ("Fiyat için sorunuz" görünür). Gerçek değerleri **yönetim panelinden** (`/#/admin` → Hizmetler, Çalışma Saatleri, Ayarlar) girebilirsiniz. Aynı işlemler SQL Editor'den de yapılabilir:

```sql
-- Fiyat (kuruş cinsinden: 35000 = 350,00 TL)
update public.services set price_minor = 35000 where name = 'Saç Kesimi';

-- Hizmet ekle / süre değiştir / gizle
insert into public.services (name, description, duration_minutes, price_minor, sort_order)
values ('Çocuk Kesimi', null, 25, 30000, 4);
update public.services set duration_minutes = 40 where name = 'Saç + Sakal';
update public.services set is_active = false where name = 'Sakal Kesimi';

-- Çalışma saatleri (weekday: 1=Pazartesi … 7=Pazar), mola dahil
update public.working_hours set opens_at = '09:00', closes_at = '20:00',
  break_starts_at = '13:00', break_ends_at = '14:00' where weekday between 1 and 5;
update public.working_hours set is_closed = true where weekday = 7;

-- Randevu aralığı, minimum bildirim süresi, kaç gün ilerisine randevu alınabileceği
update public.business_settings
   set booking_interval_minutes = 30, minimum_booking_notice_minutes = 60, maximum_booking_horizon_days = 30;

-- Adres ve telefon (doldurulana kadar site bu bölümleri göstermez)
update public.business_settings
   set address = E'Örnek Mah. Örnek Sk. No:1\nİstanbul', contact_phone = '0212 000 00 00',
       map_url = 'https://maps.google.com/?q=...';

-- Tatil / izin (Istanbul saatiyle)
insert into public.blocked_periods (starts_at, ends_at, reason)
values ('2026-11-10 00:00+03', '2026-11-11 00:00+03', 'İzin');
```

Sitedeki "Hakkında" metni, hero başlığı, "Erkek Kuaförü" alt başlığı ve logo `src/config/site.ts` içindedir. Logo dosyası yoksa sade bir "FD" monogramı çizilir; onaylı logo için dosyayı `public/images/` altına koyup `siteConfig.logoUrl` alanına yolunu yazın. Tasarım görselindeki "Galeri" bölümü, örnek fiyatlar ve konum bilgisi gerçek içerik olmadığı için eklenmedi. "Hakkında" metni **geçicidir**, onaylı içerikle değiştirilmelidir. Hero görseli için onaylı bir fotoğraf kullanacaksanız dosyayı `public/images/` altına koyup `siteConfig.hero.imageUrl` alanına yolunu yazın; boş bırakılırsa sade bir çizim gösterilir.

### Hız sınırları

Varsayılanlar `private_settings` tablosundadır (istemciye kapalı):

| Ayar | Varsayılan | Anlamı |
|---|---|---|
| `public_queries_per_ip_per_minute` | 60 | Bir IP'nin dakikada yapabileceği takvim sorgusu birimi |
| `public_queries_global_per_minute` | 1500 | Tüm ziyaretçilerin toplam takvim sorgusu birimi |
| `bookings_per_ip_per_hour` | 10 | Bir IP'nin saatte deneyebileceği rezervasyon |
| `bookings_global_per_hour` | 60 | Toplam rezervasyon denemesi |

`get_available_slots` 1 birim, `get_available_dates` her başlayan 31 gün için 1 birim harcar (30 günlük takvim = 1 birim). Sınır aşılırsa ziyaretçi "Kısa sürede çok fazla istek gönderildi" mesajını görür. Değiştirmek için:

```sql
update public.private_settings set public_queries_per_ip_per_minute = 90;
```

### Günlük veri temizliği (0007)

Randevular ve içindeki müşteri bilgileri (ad, soyad, telefon, e-posta, not) **yalnızca randevu günü boyunca** tutulur. Her gece **00:00'da (Europe/Istanbul)**, başlangıcı o günden önce olan tüm randevular kalıcı olarak silinir; bağlı durum geçmişi ve SMS kayıtları da birlikte silinir (cascade). Arşiv tutulmaz.

- **Silinmeyenler:** bugünün ve sonraki günlerin randevuları, hizmetler, fiyatlar, çalışma saatleri, kapalı dönemler, işletme ayarları, yönetici hesapları.
- **Nasıl çalışır:** `public.run_daily_cleanup()` (yalnızca veritabanı sahibi çağırabilir) işletme gününün başlangıcını `business_settings.timezone` ile hesaplar ve ondan önceki randevuları siler. pg_cron her saat başı çalıştırır; yalnızca 00:00 İstanbul çalışması bir şey siler, diğerleri hiçbir şey yapmaz. Zamanlayıcı bir gün çalışmazsa sonraki çalışma kaçırılan günleri de siler. Fonksiyon tekrar çalıştırılmaya karşı güvenlidir ve rezervasyonla aynı kilidi kullanır.
- **Kayıt:** Her çalışma `maintenance_runs` tablosuna yalnızca zaman, kesim anı ve silinen sayıyı yazar (kişisel veri yok; 30 gün tutulur). Postgres günlüğüne de yalnızca sayılar yazılır.
- **Panel:** Ayarlar → "Günlük veri temizliği" kartı zamanlayıcının kurulu olup olmadığını ve son çalışmayı gösterir; "Şimdi çalıştır" ile elle tetiklenebilir (onay sorulur).

**Zamanlayıcıyı kurma (bir kez):**

1. Supabase → **Database → Extensions** (veya **Integrations → Cron**) → `pg_cron`'u etkinleştirin.
2. `0007_daily_cleanup.sql` dosyasını SQL Editor'de çalıştırın. pg_cron etkinse iş kendiliğinden oluşturulur. 0007'yi pg_cron'dan önce çalıştırdıysanız işi şu komutla oluşturun (tekrar çalıştırılması güvenlidir, aynı adlı işi günceller):

   ```sql
   select cron.schedule('daily-appointment-cleanup', '0 * * * *', 'select public.run_daily_cleanup()');
   ```

3. Doğrulama: `select jobname, schedule, active from cron.job;` sorgusunda `daily-appointment-cleanup` görünmeli; panelde Ayarlar → "Günlük veri temizliği" kartı yeşil olmalı (ilk saat başından sonra "son çalışma" dolar).

**Yedekler ve günlükler:** Veritabanından silinen veriler, Supabase'in yedeklerinde (plana göre; ör. ücretli planlarda günlük yedekler belirli bir süre tutulur) ve sağlayıcı günlüklerinde o sürelerin sonuna kadar kalabilir. Silme bu kopyaları hemen yok etmez; güncel süreleri Supabase planınızın belgelerinden doğrulayın.

Eski `purge_expired_customer_data()` (gün sayısına göre silme) yerinde durur ama artık gerekmez; daha önce `kvkk-purge` adıyla zamanladıysanız kalabilir, zararı yoktur.

Silme talepleri için bkz. **[docs/KVKK.md](docs/KVKK.md)**.

## 3. Cloudflare Turnstile kurulumu

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile → Add widget** (ücretsiz Cloudflare hesabı yeterlidir; alan adınızın Cloudflare'de olması gerekmez).
2. **Hostname**: sitenin yayınlanacağı alan adı, örn. `kullanici.github.io` (özel alan adı kullanıyorsanız o).
3. **Widget mode**: *Managed* (önerilir).
4. Oluşan iki değeri alın:
   - **Site Key** (genel) → GitHub Actions değişkeni `VITE_TURNSTILE_SITE_KEY` ve yerel `.env`
   - **Secret Key** (gizli) → **yalnızca** Supabase Function Secrets'a `TURNSTILE_SECRET_KEY` olarak (bölüm 4). Ön yüze, `.env`'e, GitHub'a veya depoya koymayın.

**Turnstile yokken ne olur?** `VITE_TURNSTILE_SITE_KEY` tanımlı değilse:
- **Geliştirme sunucusunda** (`npm run dev`) onay ekranında geçici bir "görselleri seç" testi gösterilir. Bu yalnızca arayüzü denemek içindir, gerçek bir CAPTCHA değildir ve sunucuya güvenlik belgesi göndermez; sunucu rezervasyonu reddeder ve kullanıcıya bu açıkça söylenir. Kod üretim derlemesine hiç girmez (`src/components/booking/VisualChallenge.tsx`, `src/lib/verification.ts`).
- **Üretimde** geçici test gösterilmez; "güvenlik doğrulaması yapılandırılmamış" mesajı çıkar ve randevu alınamaz.
- Yerelde gerçek bir randevuyu uçtan uca denemek için Cloudflare'in test anahtarlarını kullanın (site: `1x00000000000000000000AA`, gizli: `1x0000000000000000000000000000000AA`) ve Edge Function'ı dağıtın. Site anahtarı tanımlanınca geçici test kendiliğinden devreden çıkar ve gerçek Turnstile gelir.

Ön yüz pencere öğesini `action: 'booking'` ile oluşturur; Edge Function `success`, `action` ve (tanımlıysa) `hostname` alanlarını denetler. Turnstile token'ı tek kullanımlıktır; her gönderim denemesinden sonra pencere öğesi yeni token ister.

## 4. Edge Function dağıtımı (`create-booking`)

Fonksiyon `supabase/functions/create-booking/` altındadır:

- `handler.ts` — çalışma ortamından bağımsız mantık (Vitest ile test edilir)
- `index.ts` — Deno giriş noktası

Akış: köken ve yöntem denetimi → girdi doğrulama → IP başına rezervasyon sınırı → Turnstile doğrulaması → `create_appointment` (service_role ile). Turnstile doğrulanmazsa veritabanına gidilmez. `create_appointment` 0003 migration'ı ile `anon`/`authenticated` rollerine kapatıldığı için fonksiyonu atlayan doğrudan bir istek de randevu oluşturamaz.

### Test randevuları (gerçek kayıt, gerçek doğrulama)

Yerel geliştirme sunucusundan (`http://localhost:5173`) **gerçek Turnstile** ile yapılan rezervasyonlar veritabanına gerçekten yazılır ve sunucu tarafından **test** olarak işaretlenir. Karar istemciden gelmez: Cloudflare'in doğruladığı Turnstile `hostname` değeri `localhost` veya `127.0.0.1` ise `create-booking` kaydı `is_test = true` yazar. Test kayıtları panelde "Test" etiketiyle görünür, ciroya ve sayılara girmez, randevu penceresinden silinebilir; müşteri ekranında "Test randevusu kaydedildi" yazar.

Bunun için Turnstile widget'ının hostname listesine `localhost` eklenmelidir. **Siteyi gerçek müşterilere açtıktan sonra** `localhost`'u hem Cloudflare'deki hostname listesinden hem `TURNSTILE_ALLOWED_HOSTNAMES` secret'ından kaldırın.

Cloudflare'in test anahtarları (`1x000…AA`) da kullanılabilir ama gizli test anahtarı her test token'ını geçerli sayar; yani gerçek bir doğrulama yapılmaz ve yanıttaki hostname'e güvenilemez. Bu yüzden gerçek anahtarlar + `localhost` önerilir. Test anahtarları canlıda asla kullanılmamalıdır.

### Gizli değerler (Function Secrets)

**Dashboard → Edge Functions → Secrets** (veya CLI ile `supabase secrets set …`):

| Ad | Değer | Zorunlu |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile Secret Key | **Evet** — yoksa fonksiyon tüm rezervasyonları reddeder |
| `ALLOWED_ORIGINS` | Site kökeni, örn. `https://kullanici.github.io` (virgülle birden fazla) | Önerilir — boşsa tüm kökenlere izin verilir |
| `TURNSTILE_ALLOWED_HOSTNAMES` | Turnstile hostname'leri, örn. `farukdemirezen.me,localhost` | Önerilir — boşsa hostname denetlenmez |
| `TEST_HOSTNAMES` | *(isteğe bağlı)* varsayılan `localhost,127.0.0.1` | Bu hostname'lerden gelen rezervasyonlar test sayılır |
| `SMS_PROVIDER` | *(isteğe bağlı)* şimdilik `none` | Sağlayıcı seçilene kadar SMS gönderilmez; kuyrukta "Gönderilmedi" görünür |

`SUPABASE_URL` ve Supabase anahtarları otomatik sağlanır; elle girmeyin. Fonksiyonlar önce yeni anahtar sistemini (`SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS`), yoksa eski anahtarları (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) kullanır; Supabase eski anahtarları kullanımdan kaldırsa da çalışmaya devam eder. Hiçbiri bulunamazsa fonksiyon `server_not_configured` hatası döner ve Logs'a nedenini yazar (anahtarın kendisi yazılmaz).

### Telefon bildirimi (yeni randevu)

Yeni randevu gelince yöneticinin telefonuna "Yeni randevunuz var, sistemden onaylayın." bildirimi gider. Ücretsizdir (Web Push). Bildirim boş gönderilir, metin `public/sw.js` içindedir; müşteri bilgisi bildirim servislerine gitmez.

1. `supabase/migrations/0009_push_subscriptions.sql` dosyasını SQL Editor'de çalıştırın.
2. `VAPID_KEYS` adlı secret'ı ekleyin. Değer `node scripts/generate-vapid.mjs` ile üretilen `.env.vapid.local` dosyasındadır (git'e girmez). Açık anahtar `src/config/site.ts` → `push.vapidPublicKey` alanındadır; ikisi aynı çiftten olmalıdır.
3. `create-booking` fonksiyonunu yeniden dağıtın.
4. Telefonda panelde **Bildirimleri Aç**'a basın. iPhone'da önce paneli ana ekrana ekleyin.

`VAPID_KEYS` yoksa veya tablo kurulmamışsa bildirim atlanır; randevu kaydı etkilenmez.

### Dağıtım — A) Supabase Dashboard ile (CLI gerekmez)

Dashboard editörü fonksiyon klasörü dışındaki dosyaları (`_shared/`) göremediği için kaynak dosyalar doğrudan yapıştırılamaz. Bunun yerine kaynaktan otomatik üretilen tek dosyalık paket kullanılır:

```bash
npm run bundle:functions
```

Bu komut `supabase/functions-dashboard/create-booking.ts` ve `send-notifications.ts` dosyalarını üretir (mantık değiştirilmez; yalnızca yerel dosyalar birleştirilir, gizli değer içermez). Fonksiyon kodu değiştiğinde komutu yeniden çalıştırıp yeniden yapıştırın.

1. Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Fonksiyon adını tam olarak `create-booking` yazın; `index.ts` içeriğini silip `supabase/functions-dashboard/create-booking.ts` dosyasının **tamamını** yapıştırın → **Deploy**.
3. Fonksiyonun ayarlarında JWT doğrulamasını (**Verify JWT / Enforce JWT verification**) **kapatın** (CLI'daki `--no-verify-jwt` karşılığı).
4. Aynısını `send-notifications` adıyla ve `send-notifications.ts` dosyasıyla yapın.

### Dağıtım — B) Supabase CLI ile

[Supabase CLI](https://supabase.com/docs/guides/cli) ile:

```bash
supabase login
```

```bash
supabase link --project-ref <proje-ref>
```

```bash
supabase functions deploy create-booking --no-verify-jwt
```

```bash
supabase functions deploy send-notifications --no-verify-jwt
```

`--no-verify-jwt` gereklidir: `create-booking`'i giriş yapmamış ziyaretçiler çağırır; `send-notifications` ise yönetici oturumunu kendi içinde (`is_admin()`) doğrular. ayrıca yeni "publishable" anahtarlar JWT değildir. `create-booking`'in koruması Turnstile, köken denetimi ve hız sınırıdır.

**"Sunucuya ulaşılamadı" / "Randevu servisine ulaşılamıyor" hatası:** Fonksiyon dağıtılmamışsa Supabase ön isteğe (OPTIONS) `404 NOT_FOUND` döner; tarayıcı bunu CORS hatası sayar ve istek ağ hatasıyla düşer. Geliştirme sunucusunda tarayıcı konsolunda `[geliştirme teşhisi]` satırı nedeni yazar (kişisel veri yazılmaz). Sunucu tarafı kayıtları: Supabase → Edge Functions → create-booking → Logs (yalnızca durum ve hata kodu).

### Canlıda kontrol (bir kez)

1. Sitede bir randevu alın; `/#/admin`'de görün; iptal edin.
2. IP başlığının doğru okunduğunu doğrulayın: iki farklı ağdan (örn. Wi-Fi ve mobil veri) takvimi açtıktan sonra SQL Editor'de

   ```sql
   select bucket, count(distinct key_hash) from public.rate_limit_counters group by bucket;
   ```

   `public_query_ip` için **2** görmelisiniz. **1** görüyorsanız IP okunamıyor ve tüm ziyaretçiler tek kovayı paylaşıyor demektir; bu durumda `public_queries_per_ip_per_minute` değerini artırın ve bana/geliştiriciye bildirin (`request_client_ip()` başlık sırası: `cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`).

## 5. GitHub Pages'e dağıtım

1. Depoyu GitHub'a gönderin (`main` dalı).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables** sekmesinde şu **değişkenleri** ekleyin:

   | Ad | Değer | Not |
   |---|---|---|
   | `VITE_SUPABASE_URL` | Supabase Project URL | Genel değer |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable anahtar | Genel değer (RLS korur) |
   | `VITE_TURNSTILE_SITE_KEY` | Turnstile **Site Key** | Genel değer |
   | `VITE_BASE_PATH` | *(isteğe bağlı)* | Boşsa `/` kullanılır (özel alan adı kökü). Özel alan adı yoksa `/<repo-adı>/` yapın |

   Bu değerler derlenmiş JavaScript'e gömülür ve tarayıcıda herkes tarafından görülebilir; bu yüzden **gizli bilgi değildir**. GitHub'a hiçbir gizli değer (secret) girilmez; Turnstile gizli anahtarı ve service_role anahtarı yalnızca Supabase'te durur.
4. `main` dalına her push'ta `.github/workflows/deploy.yml` önce bu üç değişkenin tanımlı olduğunu denetler (eksikse derleme durur, test anahtarı kullanılıyorsa uyarı verir), sonra testleri çalıştırır, siteyi derler ve yayınlar.
5. Adresler: `https://<kullanici>.github.io/<repo-adı>/` ve yönetim paneli `https://<kullanici>.github.io/<repo-adı>/#/admin`.

**Özel alan adı:** site şu an `https://www.orkuntarlaci.me/` kökünde yayınlanıyor; varsayılan yol bu yüzden `/`. Alan adını değiştirirken Pages ayarlarından yenisini bağlayın ve aynı alan adını Turnstile hostname'ine, `ALLOWED_ORIGINS` ve `TURNSTILE_ALLOWED_HOSTNAMES` secret'larına ekleyin.

## 5b. Yönetim paneli (`/#/admin`)

Yalnızca `admin_users` tablosundaki hesap girebilir. Tüm işlemler veritabanında yetki denetiminden geçer; arayüz hiçbir işlemi sunucu onaylamadan "başarılı" göstermez.

| Bölüm | Ne yapar | Veri kaynağı |
|---|---|---|
| **Genel Bakış** | Bugünkü randevu, onay bekleyen talep, onaylı, tamamlanan, iptal sayıları; bugünkü beklenen ve gerçekleşen ciro; sıradaki randevu; onay bekleyen talepler; sonucu işaretlenmemiş randevular (son 7 gün). | `appointments` |
| **Günlük Randevular** | Seçili günün özeti ve ciro, dikkat gerektiren randevular, müsait aralıklar, mola ve kapalı dönemlerle birlikte kronolojik çizelge. Ayrıntı penceresinden: onayla, reddet/iptal et, yeniden planla, tamamlandı, gelmedi. Realtime + 30 sn yoklama ile güncellenir. | `appointments`, `blocked_periods`, `admin_set_appointment_status`, `admin_reschedule_appointment` |
| **Takvim** | Pazartesi–Pazar haftalık görünüm; her günün çalışma saati, kapalı dönemleri ve randevuları. | aynı |
| **Ara ve Filtrele** | En fazla 92 günlük aralıkta durum ve hizmete göre filtre; ad, telefon (her biçimde) veya referans koduyla arama. | `appointments` |
| **Hizmetler** | Her satırda **hızlı fiyat düzenleme** (tutarı yaz → Kaydet). Hizmet ekleme; ad, açıklama, süre, fiyat ve sıra düzenleme; etkinleştirme/pasifleştirme. Silme yoktur (geçmiş randevular hizmete bağlıdır). | `services` |
| **Çalışma Saatleri** | Her gün için açık/kapalı, açılış/kapanış, mola. Tatil ve izin gibi kapalı dönem ekleme/silme. | `working_hours`, `blocked_periods` |
| **Ayarlar** | İşletme adı; randevu aralığı, en az bildirim süresi, en fazla kaç gün ilerisi, telefon başına aktif randevu; adres, telefon, harita bağlantısı. | `business_settings` |

"Dikkat gerektiriyor" uyarısı, aktif bir randevu güncel ayarlarla çeliştiğinde çıkar: kapalı güne, çalışma saati dışına, molaya veya kapalı döneme denk gelmesi ya da saati geçtiği hâlde onay bekliyor olması. Randevular kendiliğinden değiştirilmez veya iptal edilmez.

**Fiyatlar nasıl çalışır:** Fiyat veritabanında kuruş olarak tutulur (`price_minor`, 70000 = 700 TL) ve her yerde "700 TL" biçiminde gösterilir. Panelden kaydedilen fiyat hemen veritabanına yazılır; müşteri sitesi hizmetleri her açılışta veritabanından okur, bu yüzden sayfa yenilendiğinde yeni fiyat görünür (kod değişikliği, yeniden yayın veya sunucu yeniden başlatma gerekmez). Rezervasyon sırasında fiyat ve hizmet adı **sunucuda** hizmet tablosundan alınıp randevuya kaydedilir; istemcinin gönderdiği fiyat kullanılmaz. Sonradan fiyat değişse de geçmiş randevuların fiyatı ve ciro hesapları doğru kalır.

**Durumlar:** onay bekliyor → onaylandı / iptal; saati gelen randevu → tamamlandı / gelmedi (ikisi arasında düzeltme yapılabilir). İptal kalıcıdır. Geçişler sunucuda denetlenir (ör. saati gelmemiş randevu "tamamlandı" yapılamaz).

**Yeniden planlama:** Müşteriyle aynı kurallar geçerlidir (çalışma saati, mola, kapalı dönem, aralık, en az bildirim süresi); randevunun süresi korunur. Bildirim süresinden daha yakın bir saate panelden taşınamaz.

Bilinçli olarak **eklenmeyenler**: ödeme/gerçek tahsilat takibi (ciro, randevu fiyatlarından hesaplanan tahmindir), grafikler, aylık takvim, müşteriye SMS/e-posta bildirimi, müşterinin randevu durumunu sorgulayacağı sayfa, KVKK silme ekranı, hız sınırı ve saklama süresi ayarı (bu ikisi güvenlik nedeniyle yalnızca SQL Editor'den).


### SMS bildirimleri

Randevu talebi alındığında, onaylandığında, iptal edildiğinde ve yeniden planlandığında müşteriye bilgilendirme SMS'i gönderilecek şekilde altyapı hazırdır:

- Bildirim, randevu değişikliğiyle **aynı veritabanı işleminde** `notification_logs` kuyruğuna yazılır; randevu kaydedilmeden bildirim oluşmaz.
- Gönderim sunucuda yapılır (`create-booking` kayıttan sonra arka planda, `send-notifications` yönetici işleminden sonra). SMS başarısız olsa da randevu geri alınmaz ve durumu değişmez.
- Aynı bildirim iki kez oluşmaz (tekil `dedupe_key`) ve iki kez gönderilmez ("sending" kilidi). Gönderilmiş SMS yeniden gönderilemez; başarısız veya atlanmış olan randevu penceresindeki "Yeniden gönder" ile tekrar denenir.
- Telefon numarası ve mesaj metni kuyrukta ve loglarda saklanmaz.
- Yönetici, randevu penceresindeki "SMS bildirimleri" bölümünde her bildirimin durumunu (Sırada / Gönderildi / Başarısız / Gönderilmedi) ve Ayarlar'da sağlayıcının yapılandırılıp yapılandırılmadığını görür (anahtar gösterilmez).

**Şu anki durum:** SMS sağlayıcısı seçilmedi (`SMS_PROVIDER=none`). Bildirimler kuyruğa yazılır ve "Gönderilmedi — SMS sağlayıcısı henüz yapılandırılmadı" olarak görünür; **hiçbir SMS gönderilmez**. Sağlayıcı onaylandıktan sonra adaptörü eklenecek ve gizli anahtarları yalnızca Supabase Function Secrets'a girilecektir.

## 6. Sizden gerekenler (kontrol listesi)

### Cloudflare

- [ ] Turnstile widget oluşturun; hostname olarak site alan adını girin (bölüm 3).
- [ ] Site Key'i GitHub değişkenine, Secret Key'i Supabase secret'ına girin (aşağıda).

### Supabase

- [ ] Proje oluşturun; SQL Editor'de `0001`, `0002`, `0003`, `0004`, `seed.sql`, `0005` ve `0006`'yı sırayla çalıştırın (öncekiler zaten yapıldıysa yalnızca eksik olanları).
- [ ] E-posta ile yeni kayıtları kapatın; yönetici hesabını oluşturup `admin_users`'a ekleyin.
- [ ] Function Secrets: `TURNSTILE_SECRET_KEY`, `ALLOWED_ORIGINS`, `TURNSTILE_ALLOWED_HOSTNAMES`.
- [ ] `supabase functions deploy create-booking --no-verify-jwt` ve `supabase functions deploy send-notifications --no-verify-jwt`.
- [ ] `pg_cron`'u etkinleştirip KVKK silme işini zamanlayın.
- [ ] Yönetim panelinden gerçek hizmet, fiyat, çalışma saati, adres ve telefon bilgilerini girin.
- [ ] Bölüm 4'teki "Canlıda kontrol" adımlarını yapın.

### GitHub

- [ ] Pages kaynağını "GitHub Actions" yapın.
- [ ] Actions **Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY` (isteğe bağlı `VITE_BASE_PATH`).

### KVKK (gerçek müşteri verisi toplanmadan önce)

- [ ] [docs/KVKK.md](docs/KVKK.md) kontrol listesini tamamlayın: veri sorumlusu bilgileri, hukukçu incelemesi, yurt dışına aktarım, saklama süresi kararı, VERBİS durumu.
- [ ] Hukuki onaydan sonra `src/config/site.ts` → `privacy.approved: true`.

## 7. Güvenlik modeli

| Kim | Ne yapabilir |
|---|---|
| Herkes (anon) | Aktif hizmetleri, çalışma saatlerini ve herkese açık ayarları okur; müsait saatleri sorgular (`get_available_slots`, `get_available_dates`, hız sınırlı). Rezervasyonu yalnızca Turnstile'dan geçerek `create-booking` Edge Function'ı üzerinden yapar. **Müşteri verisini okuyamaz, hiçbir tabloya doğrudan yazamaz, `create_appointment`'ı doğrudan çağıramaz.** |
| Giriş yapmış ama yönetici olmayan | Anon ile aynı. Randevuları göremez. |
| Yönetici | Randevuları, bloklu dönemleri ve durum geçmişini okur; `admin_set_appointment_status` ile onaylar/iptal eder; hizmet, çalışma saati, kapalı dönem ve ayarları düzenler (0004). |
| Edge Function (service_role) | Rezervasyon için yalnızca `booking_rate_limit_hit` (IP, Turnstile'dan önce), `booking_global_limit_hit` (genel, Turnstile'dan sonra) ve `create_appointment`'ı çağırır. |
| SQL Editor / pg_cron (veritabanı sahibi) | Günlük temizlik (`run_daily_cleanup`) ve KVKK silme fonksiyonları (`delete_customer_data`, eski `purge_expired_customer_data`). Yönetici panelden yalnızca `admin_run_cleanup()` ile bugünden öncesini silebilir. |

- Tüm tablolarda RLS açıktır; istemci rollerinin tablo yetkileri önce tamamen kaldırılır, sonra yalnızca gerekenler verilir. `private_settings` ve `rate_limit_counters` istemciye tamamen kapalıdır.
- Yazma yolları: `create_appointment` (yalnızca service_role, kendi içinde doğrulama yapar), `admin_set_appointment_status` (içeride `is_admin()` denetler), hız sayacı (yalnızca güvenli fonksiyonların içinden) ve 0004 ile gelen yönetici yazmaları.
- 0005 ile gelen `admin_set_appointment_status`, `admin_available_slots` ve `admin_reschedule_appointment` fonksiyonları içeride `is_admin()` denetler; anonim rol bunları çağıramaz. Yeniden planlama, rezervasyonla aynı advisory lock'u ve `check_slot` kurallarını kullanır; EXCLUDE kısıtı son güvencedir.
- Yönetici yazmaları iki katmanlıdır: `authenticated` rolüne **yalnızca belirli sütunlar** için yazma yetkisi verilir (ör. `timezone`, `currency`, `id` yazılamaz; hizmet silinemez) ve RLS politikaları satırı yalnızca `is_admin()` doğruysa açar. Değerler CHECK kısıtlarıyla doğrulanır (negatif fiyat, 5 dakikadan kısa süre, ters çalışma saati, `https://` olmayan harita bağlantısı reddedilir).
- Hız sınırı IP adresini **saklamaz**; tuzlanmış SHA-256 özeti en fazla ~1 gün tutulur. Reddedilen istek sayaca eklenmez (transaction geri alınır).
- Yönetici arayüzünün gizlenmesi güvenlik önlemi sayılmaz; koruma veritabanındadır.
- **Yeni migration yazarken:** Supabase'in varsayılan yetkileri `public` şemasındaki yeni tablo ve fonksiyonları otomatik olarak `anon`/`authenticated` rollerine açar. Her yeni nesne için yetkiyi açıkça kaldırın (`revoke all on ... from anon, authenticated;`, fonksiyonlar için `from public` da) ve yalnızca gerekeni yeniden verin. `security definer` fonksiyonlarda `set search_path = public, pg_temp` kullanın.
- İptal kalıcıdır (`cancelled_at` tutulur, `appointment_status_history` kimin ne zaman değiştirdiğini kaydeder). İptal edilen randevu geri açılmaz. Kayıtlar KVKK saklama süresi dolunca kalıcı olarak silinir.
- Not alanı React ile düz metin olarak gösterilir (HTML olarak yorumlanmaz).

### Çakışma önleme (eşzamanlılık stratejisi)

İki katmanlıdır ve 0003 ile değişmemiştir:

1. `create_appointment` her çağrıda `pg_advisory_xact_lock` alır; böylece kontrol + ekleme tek transaction içinde sıraya dizilir.
2. `appointments` tablosundaki `EXCLUDE USING gist` kısıtı, iptal edilmemiş randevuların zaman aralıklarının (`[başlangıç, bitiş)`) çakışmasını veritabanı seviyesinde reddeder. Kilit atlansa bile çakışan kayıt eklenemez.

Tüm saat kuralları tek bir SQL fonksiyonunda (`check_slot`) toplanır; müsait saat listesi, müsait gün hesabı ve rezervasyon aynı fonksiyonu kullanır. `get_available_dates` her gün için ilk uygun saatte durur (önceden günün bütün saatlerini hesaplıyordu).

## 8. Testler

`npm test` üç grup çalıştırır:

- `src/lib/*.test.ts` — Istanbul saat dilimi ve gece yarısı sınırları, Türkçe tarih biçimi, telefon normalizasyonu, müşteri ve yönetici form doğrulamaları (fiyat dönüşümü, çalışma saati, kapalı dönem, ayarlar), yönetici gün çizelgesi ve randevu uyarıları, çalışma saati özeti, randevu araması, Edge Function hata eşlemesi, KVKK saklama süresinin site metniyle veritabanı arasında tutarlılığı.
- `tests/db/schema.test.ts` — migration'ları **gerçek bir PostgreSQL motorunda (PGlite)** çalıştırır: müsait saat/gün üretimi, çakışma reddi, kural reddleri, telefon başına sınır, iptal, yetkiler ve RLS; ayrıca `create_appointment`'ın yalnızca service_role'e açık olması, IP başına ve genel hız sınırı, IP'nin özetlenerek saklanması, uzun tarih aralığının maliyeti, `get_available_dates` ile `get_available_slots` sonuçlarının tutarlılığı, KVKK silme fonksiyonları; 0004 için yönetici yazma yetkileri, yönetici olmayan ve anonim kullanıcının yazamaması, izin verilmeyen sütunlar, CHECK kısıtları ve panel değişikliklerinin müsait saatlere yansıması; 0005 için başlangıç fiyatları, 0005'in panelden girilmiş fiyatın üzerine yazmaması ve hizmet çoğaltmaması, randevu anındaki fiyat kaydı, tamamlandı/gelmedi geçişleri ve geçmiş kaydı, geçersiz geçişlerin reddi, yeniden planlamada çakışma/kural denetimi ve yetkiler.
- `tests/functions/create-booking.test.ts` — Edge Function mantığı: Turnstile başarısız / yanlış action / yanlış hostname / Cloudflare'e ulaşılamıyor / gizli anahtar yok durumlarında `create_appointment`'ın **hiç çağrılmadığı**, hız sınırı, CORS ve köken denetimi, girdi doğrulama, hata kodlarının sızdırılmaması, siteverify isteğinin biçimi.

**Doğrulanmayanlar (canlı projede sizin kontrol etmeniz gerekenler):**

- Hiçbir test gerçek Supabase, gerçek Cloudflare veya Deno çalışma ortamına karşı yapılmadı. Veritabanı testleri `auth` şeması ve roller taklit edilerek PGlite üzerinde; Edge Function testleri Cloudflare ve Supabase taklit edilerek Node üzerinde çalışır. `index.ts` (Deno giriş noktası) hiç çalıştırılmadı.
- Supabase'in `request.headers` içinde hangi IP başlığını ilettiği doğrulanmadı (bölüm 4, "Canlıda kontrol").
- Turnstile pencere öğesinin tarayıcıda görünümü ve token akışı gerçek anahtarla denenmedi.
- İki isteğin **gerçekten aynı anda** geldiği yük testi yapılmadı (PGlite tek bağlantılıdır). Çakışmanın engellendiği, fonksiyon dışından yapılan doğrudan INSERT ile veritabanı kısıtı üzerinden doğrulandı.
- Realtime yenileme ve tarayıcıda uçtan uca akış gerçek bir arka uçla denenmedi. Ana sayfa, gizlilik penceresi, yönetici giriş ekranı ve sunucuya ulaşılamadığında görünen hata durumları geliştirme sunucusunda masaüstü ve 375 px mobil genişlikte görsel olarak kontrol edildi (yatay taşma ve konsol hatası yok). **Randevu adımları ve yönetim paneli sayfaları gerçek veriyle hiç görülmedi**; bunlar ancak bağlı bir Supabase projesiyle görülebilir.
- Ekran okuyucu ve klavye testleri elle yapılmadı (yalnızca gizlilik penceresinin Esc ile kapanması denendi); erişilebilirlik WCAG 2.2 AA hedefiyle tasarlandı ama resmi denetimden geçmedi.
- KVKK metinleri hukuki incelemeden geçmedi.

## 9. Bilinen sınırlar

- Turnstile ve hız sınırları otomatik saldırıları zorlaştırır ama tamamen engellemez; elle yapılan kötüye kullanıma karşı telefon başına aktif randevu sınırı (varsayılan 3) ve yöneticinin iptal yetkisi vardır.
- Turnstile betiği bazı reklam/izleme engelleyicilerde yüklenmeyebilir; bu durumda ziyaretçi açık bir hata mesajı ve telefonla iletişim önerisi görür.
- E-posta/SMS bildirimi yoktur; müşteri referans kodunu ekranda görür, değişiklik ve iptali telefonla yapar.
- Yönetim panelinde yeniden zamanlama ve KVKK silme ekranı yoktur; bunlar SQL ile yapılır (docs/KVKK.md).
- İlk yüklenen JavaScript ~245 kB (gzip ~79 kB; önceden 580 kB / 173 kB). Supabase istemcisi (~228 kB) ve form/doğrulama kütüphaneleri (~126 kB) ayrı parçalarda, ihtiyaç anında yüklenir; yönetim paneli sayfaları da ayrı parçalardır.

## Proje yapısı

```
supabase/migrations/            Şema, RLS, rezervasyon, hız sınırı, KVKK, yönetici yetkileri, durumlar/yeniden planlama (0001–0005)
supabase/functions/create-booking/  Turnstile doğrulamalı rezervasyon Edge Function'ı
supabase/seed.sql               Geçici başlangıç verisi
src/lib/                        Saat/tarih, telefon, doğrulama, gün çizelgesi, API, hata eşleme
src/components/                 site/ (başlık, hero, hizmetler, aydınlatma metni…), booking/ (5 adım, Turnstile), ui/ (düğme, alan, pencere, logo)
src/admin/                      Giriş, yerleşim, randevu ayrıntı penceresi; pages/ (Genel Bakış, Günlük Randevular, Takvim, Ara, Hizmetler, Çalışma Saatleri, Ayarlar)
src/config/site.ts              Düzenlenebilir site metinleri, KVKK veri sorumlusu bilgileri
docs/KVKK.md                    KVKK kontrol listesi, saklama ve silme politikası (taslak)
tests/db/                       Gerçek Postgres (PGlite) üzerinde veritabanı testleri
tests/functions/                Edge Function mantık testleri
.github/workflows/              GitHub Pages dağıtımı
```
