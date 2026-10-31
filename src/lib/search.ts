import { normalizeTrPhone } from './phone'
import type { AppointmentRow } from './types'

/** Ad, soyad, telefon (her biçimde) veya referans koduyla eşleşme. Arama tarayıcıda, yüklenen aralıkta yapılır. */
export function matchesQuery(a: AppointmentRow, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('tr-TR')
  if (!q) return true
  const name = `${a.customer_first_name} ${a.customer_last_name}`.toLocaleLowerCase('tr-TR')
  if (name.includes(q) || a.reference_code.toLocaleLowerCase('tr-TR').includes(q)) return true
  const digits = q.replace(/\D/g, '')
  if (digits.length >= 3) {
    const phone = normalizeTrPhone(q)
    if (phone) return a.customer_phone === phone
    return a.customer_phone.replace(/\D/g, '').includes(digits)
  }
  return false
}
