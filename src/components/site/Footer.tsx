import { siteConfig } from '../../config/site'
import { summarizeWorkingHours } from '../../lib/hours'
import { scrollToId } from '../../lib/nav'
import type { BusinessSettings, WorkingHours } from '../../lib/types'
import { Logo } from '../ui/Logo'
import { PrivacyLink } from './PrivacyNotice'
import { SocialLinks } from './SocialLinks'

interface Props {
  settings: BusinessSettings | undefined
  workingHours: WorkingHours[] | undefined
}

/** İletişim bilgileri yalnızca veritabanında girilmişse gösterilir; uydurulmaz. */
export function Footer({ settings, workingHours }: Props) {
  const link = 'inline-flex min-h-[2.25rem] items-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline'
  const hours = workingHours && workingHours.length > 0 ? summarizeWorkingHours(workingHours) : null
  return (
    <footer className="pb-8 pt-12">
      <div className="container-page grid gap-10 md:grid-cols-[1.3fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo className="h-12" />
          <p className="mt-4 text-xs leading-relaxed text-muted">{siteConfig.privacy.summary}</p>
        </div>

        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">İletişim</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            {settings?.contact_phone && (
              <li>
                <a className={link} href={`tel:${settings.contact_phone.replace(/[^+\d]/g, '')}`}>{settings.contact_phone}</a>
              </li>
            )}
            {settings?.address && <li className="whitespace-pre-line">{settings.address}</li>}
            {hours?.map((h) => <li key={h.days}><span className="text-fg/85">{h.days}</span> · {h.hours}</li>)}
            {!settings?.contact_phone && !settings?.address && !hours && <li>Bilgiler yakında eklenecek.</li>}
          </ul>
          <div className="mt-3"><SocialLinks contactPhone={settings?.contact_phone} /></div>
        </div>

        <nav aria-label="Alt menü">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Bağlantılar</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 md:grid-cols-1">
            {[['hizmetler', 'Hizmetler'], ['randevu', 'Randevu Al'], ['hakkinda', 'Hakkında']].map(([id, label]) => (
              <li key={id}>
                <a href="#/" className={link} onClick={(e) => { e.preventDefault(); scrollToId(id) }}>{label}</a>
              </li>
            ))}
            <li><PrivacyLink className={link} label="KVKK aydınlatma metni" /></li>
          </ul>
        </nav>
      </div>
      <div className="container-page mt-10 border-t border-line pt-5 text-xs text-subtle">
        © {new Date().getFullYear()} farukdemirezen.me - Orkun Tarlacı
      </div>
    </footer>
  )
}
