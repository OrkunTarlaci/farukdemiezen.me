import { Camera, MessageCircle } from 'lucide-react'
import { siteConfig } from '../../config/site'
import { businessWhatsAppLink } from '../../lib/cancelMessages'

const link = 'inline-flex min-h-[2.75rem] items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-fg transition-colors hover:bg-raised'
const isHttps = (url: string | null): url is string => Boolean(url && /^https:\/\//.test(url))

/** WhatsApp ve Instagram bağlantıları. Adresi girilmemiş olan görünmez (src/config/site.ts → social). */
export function SocialLinks({ contactPhone }: { contactPhone?: string | null }) {
  const { instagramUrl, whatsappUrl } = siteConfig.social
  const whatsapp = isHttps(whatsappUrl) ? whatsappUrl : businessWhatsAppLink(contactPhone, '')?.replace(/\?text=$/, '')
  if (!whatsapp && !isHttps(instagramUrl)) return null
  return (
    <div className="flex flex-wrap gap-2">
      {whatsapp && (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={link}>
          <MessageCircle className="h-4 w-4 text-success" aria-hidden /> WhatsApp
        </a>
      )}
      {isHttps(instagramUrl) && (
        <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className={link}>
          <Camera className="h-4 w-4 text-accent" aria-hidden /> Instagram
        </a>
      )}
    </div>
  )
}
