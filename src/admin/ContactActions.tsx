import { MessageCircle, Phone } from 'lucide-react'
import { whatsAppLink } from '../lib/bulkCancel'

const link = 'inline-flex min-h-[2.75rem] flex-1 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-fg transition-colors hover:bg-raised'

/** Müşteriye tek dokunuşla ulaşma: telefonla arama ve WhatsApp sohbeti. */
export function ContactActions({ phone }: { phone: string }) {
  const wa = whatsAppLink(phone, '')
  return (
    <div className="flex gap-2">
      <a href={`tel:${phone}`} className={link}><Phone className="h-4 w-4 text-muted" aria-hidden /> Ara</a>
      {wa && (
        <a href={wa.replace(/\?text=$/, '')} target="_blank" rel="noopener noreferrer" className={link}>
          <MessageCircle className="h-4 w-4 text-success" aria-hidden /> WhatsApp
        </a>
      )}
    </div>
  )
}
