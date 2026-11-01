import { useState } from 'react'
import { siteConfig } from '../../config/site'
import { Dialog } from '../ui/Dialog'

// KVKK aydınlatma metni (TASLAK). İçerik hukuki incelemeden geçmemiştir; bkz. docs/KVKK.md.
// Metin düz metin olarak üretilir; veri sorumlusu bilgileri src/config/site.ts'ten gelir.

const MISSING = 'henüz eklenmedi'

function sections(): { title: string; body: string[] }[] {
  const p = siteConfig.privacy
  const dc = p.dataController
  const contact = [dc.email, dc.phone].filter(Boolean).join(' / ') || MISSING
  return [
    {
      title: 'Veri sorumlusu',
      body: [`${dc.name ?? `Ad/unvan ${MISSING}`}${dc.address ? `, ${dc.address}` : ''}`, `İletişim: ${contact}`],
    },
    {
      title: 'İşlenen kişisel veriler',
      body: [
        'Randevu formu: ad, soyad, cep telefonu; isteğe bağlı olarak e-posta adresi ve not.',
        'Randevu bilgileri: hizmet, tarih ve saat, durum (onay/iptal) ve bu değişikliklerin zamanı.',
        'Güvenlik: kötüye kullanımı önlemek için IP adresiniz kısa süreli işlenir; ham IP saklanmaz, yalnızca geri döndürülemez özeti en fazla 1 gün tutulur. Bot doğrulaması için Cloudflare Turnstile tarayıcı ve cihaz sinyallerini işler.',
      ],
    },
    {
      title: 'İşleme amaçları',
      body: [
        'Randevunuzu oluşturmak ve yönetmek, gerektiğinde değişiklik veya iptal için sizinle iletişime geçmek, günlük randevu çizelgesini düzenlemek, sistemi kötüye kullanıma karşı korumak.',
        'Randevu bilgilendirmesi: telefon numaranıza randevu talebinizin alındığı, onaylandığı, iptal edildiği veya saatinin değiştiği bilgisi SMS ile gönderilebilir. Bu mesajlar pazarlama/kampanya içermez.',
      ],
    },
    {
      title: 'Hukuki sebep ve toplama yöntemi',
      body: [
        'Veriler bu internet sitesindeki randevu formu aracılığıyla elektronik ortamda toplanır. Öngörülen hukuki sebepler: bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması (KVKK md. 5/2-c) ve sistem güvenliği için veri sorumlusunun meşru menfaati (md. 5/2-f). (Taslak: hukukçu tarafından teyit edilmelidir.)',
      ],
    },
    {
      title: 'Aktarım ve hizmet sağlayıcılar',
      body: [
        'Veriler pazarlama amacıyla kimseyle paylaşılmaz. Sitenin çalışması için şu hizmet sağlayıcılar kullanılır ve sunucuları yurt dışında olabilir: Supabase (veritabanı ve kimlik doğrulama), Cloudflare (Turnstile bot doğrulaması), GitHub (site barındırma), Google Fonts (yazı tipleri). SMS bildirimleri için telefon numaranız ve randevu bilgileriniz bir SMS hizmet sağlayıcısına iletilir (sağlayıcı seçildiğinde burada adı belirtilecektir).',
      ],
    },
    {
      title: 'Saklama süresi',
      body: [
        p.retentionText,
        'Not: Veritabanından silinen veriler, hizmet sağlayıcının yedeklerinde ve sistem günlüklerinde sağlayıcının saklama süresi boyunca bir süre daha kalabilir.',
      ],
    },
    {
      title: 'Haklarınız (KVKK md. 11)',
      body: [
        'Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini, silinmesini veya yok edilmesini isteme, bu işlemlerin aktarılan kişilere bildirilmesini isteme, otomatik analiz sonucu aleyhinize bir sonuca itiraz etme ve zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.',
        `Başvurularınızı yukarıdaki iletişim bilgileriyle iletebilirsiniz (${contact}).`,
      ],
    },
  ]
}

export function PrivacyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni">
      {!siteConfig.privacy.approved && (
        <p role="note" className="mb-4 rounded-lg border border-warning/40 bg-warning/[0.08] p-3 text-xs text-fg">
          Bu metin taslaktır; hukuki incelemesi henüz tamamlanmamıştır.
        </p>
      )}
      <div className="space-y-4 text-sm">
        {sections().map((s) => (
          <section key={s.title}>
            <h3 className="text-sm font-semibold">{s.title}</h3>
            {s.body.map((b) => <p key={b} className="mt-1 leading-relaxed text-muted">{b}</p>)}
          </section>
        ))}
      </div>
    </Dialog>
  )
}

/** Aydınlatma metnini açan bağlantı-buton (kendi diyaloğunu yönetir). */
export function PrivacyLink({ className, label = 'Aydınlatma metni' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className ?? 'text-fg underline underline-offset-4 hover:text-accent'} onClick={() => setOpen(true)}>
        {label}
      </button>
      <PrivacyDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
