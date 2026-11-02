import { CheckCircle2, Clock, MessageCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { siteConfig } from '../../config/site'
import { businessWhatsAppLink, customerCancelRequestMessage } from '../../lib/cancelMessages'
import { dateOfInstant, formatDateLong, formatDuration, formatPrice, timeOfInstant } from '../../lib/time'
import type { BookingResult, BusinessSettings } from '../../lib/types'
import { Button } from '../ui/Button'

interface Props {
  result: BookingResult
  settings: BusinessSettings
  onNew: () => void
}

/** Yalnızca sunucu kaydı döndürdüğünde gösterilir; durum sunucunun döndürdüğü değerdir. */
export function Success({ result, settings, onNew }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const price = formatPrice(result.price_minor, settings.currency)
  const pending = result.status === 'pending'
  const isTest = result.is_test === true
  const ownerName = siteConfig.name.split(' ')[0]
  const cancelLink = businessWhatsAppLink(
    settings.contact_phone,
    customerCancelRequestMessage(ownerName, result.starts_at, result.reference_code),
  )
  const rows: [string, string][] = [
    ['Hizmet', result.service_name],
    ['Tarih', formatDateLong(dateOfInstant(result.starts_at))],
    ['Saat', timeOfInstant(result.starts_at)],
    ['Süre', formatDuration(result.duration_minutes)],
    ['Fiyat', price ?? 'Fiyat için sorunuz'],
  ]
  return (
    <div ref={ref} tabIndex={-1} role="status" className="card mx-auto max-w-xl p-5 outline-none sm:p-8">
      <p className="flex items-center gap-2 text-success">
        <CheckCircle2 className="h-6 w-6" aria-hidden />
        <span className="text-lg font-semibold">{isTest ? 'Test randevusu kaydedildi' : 'Randevu talebiniz kaydedildi'}</span>
      </p>
      {isTest && (
        <p role="note" className="mt-2 rounded-lg border border-dashed border-fg/30 p-3 text-sm text-muted">
          Bu kayıt yerel geliştirme ortamından (localhost) oluşturulduğu için sunucu tarafından <strong className="text-fg">test</strong> olarak
          işaretlendi. Yönetim panelinde “Test” etiketiyle görünür, ciroya girmez ve panelden silinebilir. Gerçek bir randevu değildir.
        </p>
      )}
      {pending && (
        <p className="mt-2 flex items-start gap-2 text-sm text-muted">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          Durum: onay bekliyor. Saatiniz sizin için ayrıldı; işletme randevuyu onaylayacaktır.
        </p>
      )}

      <div className="mt-5 rounded-lg border border-accent/50 bg-accent/[0.07] p-4">
        <p className="eyebrow">Randevu referansı</p>
        <p className="mt-1 select-all font-mono text-2xl tracking-wider text-fg">{result.reference_code}</p>
      </div>

      <dl className="mt-5 overflow-hidden rounded-lg border border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-4 border-b border-line px-4 py-3 text-sm last:border-b-0">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium text-fg">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-sm text-muted">
        Referans kodunuzu saklayın. Değişiklik veya iptal için
        {settings.contact_phone ? ` ${settings.contact_phone} numarasından` : ''} bizimle iletişime geçin.
        {cancelLink && ' Gelemeyecekseniz aşağıdaki düğmeyle WhatsApp’tan hazır iptal mesajı gönderebilirsiniz.'}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        {cancelLink && (
          <a href={cancelLink} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-fg hover:bg-raised">
            <MessageCircle className="h-4 w-4 text-success" aria-hidden />
            WhatsApp’tan iptal et
          </a>
        )}
        <Button variant="secondary" onClick={onNew}>Yeni randevu al</Button>
      </div>
    </div>
  )
}
