// Müşteri sitesinin düzenlenebilir içeriği. Hizmetler, fiyatlar, çalışma saatleri, adres ve
// telefon BURADA DEĞİL, veritabanındaki tablolarda tutulur (bkz. supabase/seed.sql ve README).

export const siteConfig = {
  name: 'Faruk Demirezen',
  tagline: 'Erkek Kuaförü',
  // Onaylı logo dosyası eklendiğinde (örn. 'images/logo.svg') buraya yazın; null ise "FD" monogramı çizilir.
  logoUrl: null as string | null,

  hero: {
    headline: 'Temiz kesim. Düzenli sakal.',
    support: 'Saatinizi online ayırtın, sıra beklemeden gelin.',
    // Onaylı bir fotoğraf eklendiğinde buraya tam URL veya /public altındaki yolu yazın (örn. 'images/hero.jpg').
    // null ise sade bir çizim gösterilir.
    imageUrl: null as string | null,
    imageAlt: 'Berber aletleri: ustura ve tarak',
  },

  // GEÇİCİ METİN: Faruk Demirezen'in onayıyla güncellenmelidir.
  // Unvan, deneyim yılı, ödül gibi doğrulanmamış bilgiler eklemeyin.
  about: {
    title: 'Hakkında',
    paragraphs: [
      'Her randevu önceden ayrılır; acele edilmeden, tek bir müşteriye odaklanarak çalışılır.',
      'Saç ve sakal bakımında sade, temiz ve düzenli bir iş hedeflenir.',
    ],
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
