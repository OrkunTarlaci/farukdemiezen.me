// Müşteri sitesinin düzenlenebilir içeriği. Hizmetler, fiyatlar, çalışma saatleri, adres ve
// telefon BURADA DEĞİL, veritabanındaki tablolarda tutulur (bkz. supabase/seed.sql ve README).

export const siteConfig = {
  name: 'Faruk Demirezen',
  tagline: 'Erkek Kuaförü',
  // Onaylı logo dosyası eklendiğinde (örn. 'images/logo.svg') buraya yazın; null ise "FD" monogramı çizilir.
  logoUrl: null as string | null,

  // Sosyal medya. Tam bağlantıyı tırnak içine yazın, örn. 'https://www.instagram.com/kullaniciadi/'.
  // null ise görünmez. whatsappUrl boşsa panelde Ayarlar > Telefon alanındaki cep numarası kullanılır.
  social: {
    instagramUrl: null as string | null,
    whatsappUrl: null as string | null,
  },

  // Telefon bildirimi. Açık anahtar gizli değildir; gizli olan VAPID_KEYS yalnızca Supabase Secrets'tadır.
  push: {
    vapidPublicKey: 'BKOvvUaHv6AQOJ7e9fTdmDEfQy5x0veeBQsg5AHb-CP9Ode16n6G9cPuUsdSgpDLhPVKV0Ck2i0asJsMjRDrpDU' as string | null,
  },

  hero: {
    headline: 'Temiz kesim. Düzenli sakal.',
    support: 'Saatinizi online ayırtın, sıra beklemeden gelin.',
    // Onaylı bir fotoğraf eklendiğinde buraya tam URL veya /public altındaki yolu yazın (örn. 'images/hero.jpg').
    // null ise sade bir çizim gösterilir.
    imageUrl: null as string | null,
    imageAlt: 'Berber amblemi: berber direği, makas ve ustura',
  },

  // "Faruk Demirezen kimdir" bölümü. METİNLER FARUK BEY'İN KENDİ ANLATIMIYLA DOLDURULACAK.
  // Unvan, deneyim yılı, ödül gibi doğrulanmamış bilgiler eklemeyin.
  // Bir alan null ise canlı sitede o kısım hiç görünmez; geliştirme önizlemesinde (npm run dev)
  // kesikli çerçeveli bir "Doldurulacak" kutusu olarak görünür, böylece nereye ne yazılacağı görülür.
  about: {
    title: 'Hakkında',
    // Fotoğraf: public/images altındaki dosya. null yapılırsa fotoğraf gösterilmez.
    photoUrl: 'images/faruk-demirezen.jpg' as string | null,
    photoAlt: 'Faruk Demirezen, siyah balıkçı yaka kazak ve kadife mont giymiş, kameraya bakıyor',
    // Başlığın altındaki tek cümlelik tanıtım. Örn. "Kendini tanıtan bir cümle."
    intro: '13 yıldır bu işte.' as string | null,
    // Hikâye bölümleri. Başlıklar değiştirilebilir, bölüm eklenip çıkarılabilir.
    // text: bir veya birkaç paragraf (her paragraf dizide ayrı bir metin).
    story: [
      {
        title: 'Kimdir',
        hint: 'Nereli, nerede yetişti, kısaca kendini nasıl anlatır.',
        text: null as string[] | null,
      },
      {
        title: 'Bu mesleğe nasıl başladı',
        hint: 'Berberliğe ilk ne zaman, nasıl ve kimin yanında başladı; ilk dükkânı.',
        text: null as string[] | null,
      },
      {
        title: 'Neden bu işi yapıyor',
        hint: 'Bu mesleği neden seviyor, işin hangi yanı onun için önemli.',
        text: null as string[] | null,
      },
      {
        title: 'Çalışma anlayışı',
        hint: 'Müşteriye nasıl yaklaşır, işinde neye dikkat eder.',
        text: [
          'Berberlik bizim için yalnızca saç kesiminden ibaret değil; özen, dikkat ve emeğin bir araya geldiği bir meslek.',
          'The Man’s Barber Shop olarak amacımız, her müşterimizin tarzına, beklentilerine ve kişisel tercihine uygun hizmet sunmak. Klasik kesimlerden modern saç stillerine kadar her uygulamada detaylara önem veriyor, işimizi özenle ve titizlikle yapıyoruz.',
          'Bizim için önemli olan yalnızca iyi bir görünüm oluşturmak değil, müşterilerimizin kendilerini iyi hissetmelerini sağlamak.',
        ] as string[] | null,
      },
    ],
    // İsteğe bağlı kısa alıntı ve altında görünecek ad (null ise işletme adı yazılır).
    quote: 'Style is discipline.' as string | null,
    quoteBy: 'The Man’s Barber Shop' as string | null,
  },

  // KVKK AYDINLATMA METNİ — TASLAK. Hukuki incelemeden geçmemiştir; uygunluğu doğrulanmamıştır.
  // docs/KVKK.md'deki kontrol listesi tamamlanıp bir hukukçu onaylamadan gerçek müşteri verisi
  // toplanmamalıdır. Onaydan sonra `approved: true` yapın (sitedeki "taslak" uyarısı kalkar).
  privacy: {
    approved: false,
    // Veri sorumlusu bilgileri (KVKK md. 10/1-a). Doldurulana kadar sitede "eklenmedi" görünür.
    dataController: {
      name: null as string | null, // örn. 'Faruk Demirezen' (şahıs işletmesi unvanı)
      address: null as string | null,
      email: null as string | null, // başvurular için
      phone: null as string | null,
    },
    // Saklama: randevular ve müşteri bilgileri, randevu gününü izleyen gece 00:00'da (İstanbul)
    // silinir (supabase/migrations/0007_daily_cleanup.sql). Bu metin o davranışla aynı tutulmalıdır.
    retentionText:
      'Randevu kaydınız ve içindeki bilgiler (ad, soyad, telefon, e-posta, not) yalnızca randevu günü boyunca tutulur; randevu gününü izleyen gece saat 00.00’da (Türkiye saati) otomatik olarak kalıcı biçimde silinir. Silme talebinde bulunursanız kaydınız beklenmeden silinir.',
    summary:
      'Randevu için verdiğiniz ad, soyad, telefon ve (varsa) e-posta ile not bilgileri randevunuzu yönetmek için işlenir.',
  },
}
