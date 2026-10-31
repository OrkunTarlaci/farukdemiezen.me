/**
 * Türkiye cep numarası normalizasyonu. Sunucudaki normalize_tr_phone() ile aynı kuralları uygular
 * (sunucu yetkili kaynaktır; burası yalnızca anında geri bildirim içindir).
 * Başarılıysa "+905XXXXXXXXX" döner, geçersizse null.
 */
export function normalizeTrPhone(input: string): string | null {
  let d = input.replace(/\D/g, '')
  if (/^00905\d{9}$/.test(d)) d = d.slice(2)
  if (/^905\d{9}$/.test(d)) return `+${d}`
  if (/^05\d{9}$/.test(d)) return `+9${d}`
  if (/^5\d{9}$/.test(d)) return `+90${d}`
  return null
}

/** "+905321112233" -> "0532 111 22 33" (okunması ve kopyalanması kolay biçim) */
export function formatTrPhone(e164: string): string {
  const m = /^\+90(5\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164)
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164
}
