// Arka uçtan gelen hata kodlarını Türkçe, kullanıcıya uygun mesajlara çevirir.
// Ham veritabanı/SQL hataları kullanıcıya ASLA gösterilmez.

export class AppError extends Error {
  readonly code: string
  constructor(code: string, message?: string) {
    super(message ?? MESSAGES[code] ?? MESSAGES.unknown)
    this.code = code
  }
}

const MESSAGES: Record<string, string> = {
  slot_unavailable: 'Seçtiğiniz saat az önce başka bir müşteri tarafından alındı. Lütfen başka bir saat seçin.',
  slot_invalid: 'Seçtiğiniz saat randevu için uygun değil. Lütfen başka bir saat seçin.',
  too_soon: 'Bu saat için artık randevu alınamıyor. Lütfen daha ileri bir saat seçin.',
  service_unavailable: 'Seçtiğiniz hizmet şu anda sunulmuyor. Lütfen başka bir hizmet seçin.',
  invalid_name: 'Ad ve soyad 1–60 karakter arasında olmalıdır.',
  invalid_phone: 'Geçerli bir cep telefonu numarası girin (örn. 0532 123 45 67).',
  invalid_email: 'Geçerli bir e-posta adresi girin.',
  invalid_note: 'Not en fazla 300 karakter olabilir.',
  too_many_bookings: 'Bu telefon numarasıyla zaten çok sayıda aktif randevu var. Yeni randevu için lütfen bizimle iletişime geçin.',
  not_configured: 'Randevu sistemi şu anda yapılandırılmamış. Lütfen daha sonra tekrar deneyin.',
  network: 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
  session_expired: 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.',
  forbidden: 'Bu işlem için yetkiniz yok.',
  already_cancelled: 'Bu randevu zaten iptal edilmiş.',
  not_found: 'Randevu bulunamadı.',
  invalid_credentials: 'E-posta veya parola hatalı.',
  captcha_required: 'Lütfen güvenlik doğrulamasını tamamlayın.',
  captcha_failed: 'Güvenlik doğrulaması geçersiz veya süresi dolmuş. Lütfen doğrulamayı yeniden tamamlayıp tekrar deneyin.',
  captcha_unavailable: 'Güvenlik doğrulaması şu anda yapılamıyor. Lütfen birkaç dakika sonra tekrar deneyin.',
  captcha_not_configured: 'Güvenlik doğrulaması yapılandırılmamış; şu anda online randevu alınamıyor. Lütfen telefonla iletişime geçin.',
  captcha_load_failed: 'Güvenlik doğrulaması yüklenemedi. Reklam/izleme engelleyiciyi kapatıp sayfayı yenileyin veya telefonla iletişime geçin.',
  rate_limited: 'Kısa sürede çok fazla istek gönderildi. Lütfen birkaç dakika bekleyip tekrar deneyin.',
  invalid_range: 'Tarih aralığı geçersiz. Lütfen sayfayı yenileyin.',
  invalid_request: 'Gönderilen bilgiler geçersiz. Lütfen sayfayı yenileyip tekrar deneyin.',
  invalid_input: 'Girilen değerler geçersiz. Lütfen alanları kontrol edip tekrar deneyin.',
  not_found_or_forbidden: 'Kayıt bulunamadı veya bu işlem için yetkiniz yok. Sayfayı yenileyip tekrar deneyin.',
  invalid_status: 'Geçersiz randevu durumu.',
  try_again: 'Bir sorun oluştu. Lütfen tekrar deneyin.',
  unknown: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
}

/** Müşterinin başka bir saat seçmesi gereken hatalar. */
export const SLOT_ERROR_CODES = new Set(['slot_unavailable', 'slot_invalid', 'too_soon'])

interface MaybeSupabaseError { message?: string; code?: string; status?: number }

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  const e = (err ?? {}) as MaybeSupabaseError
  const msg = (e.message ?? '').trim()

  if (Object.prototype.hasOwnProperty.call(MESSAGES, msg)) return new AppError(msg)
  if (e.status === 401 || /jwt|token.*expired|not authenticated/i.test(msg)) return new AppError('session_expired')
  if (e.code === '42501' || e.status === 403 || /permission denied|forbidden/i.test(msg)) return new AppError('forbidden')
  if (/failed to fetch|networkerror|network request failed|load failed|fetcherror/i.test(msg) || e.status === 0) {
    return new AppError('network')
  }
  if (/invalid login credentials/i.test(msg)) return new AppError('invalid_credentials')
  return new AppError('unknown')
}
