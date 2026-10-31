// Rezervasyon öncesi güvenlik doğrulamasının hangi biçimde yapılacağını belirler.
//
//   turnstile   — Gerçek doğrulama. Cloudflare Turnstile token'ı üretilir ve create-booking Edge Function'ı
//                 onu Cloudflare'de doğrular. Randevu YALNIZCA bu modda oluşturulabilir.
//   dev-visual  — Yalnızca geliştirme sunucusunda (npm run dev) ve Turnstile site anahtarı yokken.
//                 Görsel seçme testi arayüzü denemek içindir; sunucuya hiçbir güvenlik belgesi göndermez,
//                 bu yüzden sunucu rezervasyonu reddeder. Üretim derlemesine hiç dahil edilmez.
//   unavailable — Üretimde Turnstile yapılandırılmamışsa. Kullanıcıya dürüstçe rezervasyonun şu an
//                 yapılamadığı söylenir; doğrulama taklit edilmez.
//
// Turnstile eklendiğinde (VITE_TURNSTILE_SITE_KEY) mod kendiliğinden "turnstile" olur; geçici arayüz devreden çıkar.

export type VerificationMode = 'turnstile' | 'dev-visual' | 'unavailable'

export function resolveVerificationMode(siteKey: string | null, isDev: boolean): VerificationMode {
  if (siteKey) return 'turnstile'
  return isDev ? 'dev-visual' : 'unavailable'
}

/**
 * Doğrulamanın sonucu. Yalnızca "token" türü sunucuya gönderilecek bir güvenlik belgesi taşır;
 * "local" yalnızca tarayıcıda geçilmiş geçici testtir ve hiçbir yetki sağlamaz.
 */
export type VerificationResult = { kind: 'token'; token: string } | { kind: 'local' }

/** Sunucuya gönderilecek captcha token'ı. Geçici testte boş döner (sunucu "captcha_required" ile reddeder). */
export function captchaTokenFor(result: VerificationResult): string {
  return result.kind === 'token' ? result.token : ''
}
