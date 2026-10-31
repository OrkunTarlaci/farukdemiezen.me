import { MapPin, Phone } from 'lucide-react'
import type { BusinessSettings } from '../../lib/types'

/** Adres yalnızca veritabanında girilmişse gösterilir; tahmin edilmez. */
export function Location({ settings }: { settings: BusinessSettings }) {
  if (!settings.address) return null
  const safeMapUrl = settings.map_url && /^https:\/\//.test(settings.map_url) ? settings.map_url : null
  return (
    <section id="konum" aria-labelledby="konum-baslik" className="section border-b border-line">
      <div className="container-page grid gap-8 md:grid-cols-[1fr_1.4fr] md:gap-16">
        <div>
          <p className="eyebrow mb-3">Konum</p>
          <h2 id="konum-baslik" className="section-title">Bizi bulun</h2>
        </div>
        <div className="card space-y-4 p-5 text-base sm:p-6">
          <p className="flex items-start gap-3">
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-accent" aria-hidden />
            <span className="whitespace-pre-line">{settings.address}</span>
          </p>
          {settings.contact_phone && (
            <p className="flex items-center gap-3">
              <Phone className="h-5 w-5 shrink-0 text-accent" aria-hidden />
              <a href={`tel:${settings.contact_phone.replace(/[^+\d]/g, '')}`} className="underline underline-offset-4 hover:text-accent">
                {settings.contact_phone}
              </a>
            </p>
          )}
          {safeMapUrl && (
            <a href={safeMapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[2.75rem] items-center text-sm font-medium text-accent underline underline-offset-4">
              Yol tarifi al
            </a>
          )}
        </div>
      </div>
    </section>
  )
}
