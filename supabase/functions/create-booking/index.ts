// Supabase Edge Function (Deno): Turnstile doğrulamalı rezervasyon.
// Gizli değerler yalnızca Supabase Function Secrets'tan okunur; ön yüzde hiçbiri yoktur.
//   TURNSTILE_SECRET_KEY        — Cloudflare Turnstile gizli anahtarı (zorunlu)
//   ALLOWED_ORIGINS             — örn. "https://www.orkuntarlaci.me" (virgülle ayrılmış, zorunlu)
//   TURNSTILE_ALLOWED_HOSTNAMES — örn. "orkuntarlaci.me,www.orkuntarlaci.me" (virgülle ayrılmış, zorunlu)
//   TEST_HOSTNAMES              — isteğe bağlı; varsayılan "localhost,127.0.0.1". Bu hostname'lerden
//                                  gelen rezervasyonlar test olarak işaretlenir.
//   SMS_PROVIDER                — isteğe bağlı; şimdilik "none" (SMS gönderilmez, kuyrukta "atlandı" görünür)
//   VAPID_KEYS                  — isteğe bağlı; "<açık>.<gizli>" (scripts/generate-vapid.mjs). Yoksa telefon bildirimi gönderilmez
//   SUPABASE_URL ve sunucu anahtarı — Supabase tarafından otomatik sağlanır: önce SUPABASE_SECRET_KEYS
//                                  (yeni), yoksa SUPABASE_SERVICE_ROLE_KEY (eski). Elle girilmez.
// Dağıtım: supabase functions deploy create-booking --no-verify-jwt  (README, bölüm 4)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { misconfiguredResponse, parseList } from '../_shared/http.ts'
import { resolveServerKey } from '../_shared/keys.ts'
import { createNotificationDeps, selectProvider } from '../_shared/notificationDeps.ts'
import { processNotifications } from '../_shared/notifications.ts'
import { notifyNewBooking, parseVapidKeys } from '../_shared/push.ts'
import { DEFAULT_TEST_HOSTNAMES, handleRequest, verifyTurnstileWithCloudflare } from './handler.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const env = (name: string) => Deno.env.get(name)
const url = env('SUPABASE_URL') ?? ''
const serverKey = resolveServerKey(env)
const allowedOrigins = parseList(env('ALLOWED_ORIGINS'))
const allowedHostnames = parseList(env('TURNSTILE_ALLOWED_HOSTNAMES'))
// Kişisel veri veya anahtar içermez: yalnızca durum kodu ve hata kodu (Supabase → Edge Functions → Logs).
const log = (event: Record<string, unknown>) => console.log(JSON.stringify({ fn: 'create-booking', ...event }))

if (!url || !serverKey) {
  log({ status: 503, code: 'server_not_configured', hint: 'SUPABASE_URL veya sunucu anahtarı (SUPABASE_SECRET_KEYS / SUPABASE_SERVICE_ROLE_KEY) bulunamadı' })
  Deno.serve((req) => misconfiguredResponse(req, allowedOrigins, 'server_not_configured'))
} else if (allowedOrigins.length === 0 || allowedHostnames.length === 0) {
  // Boş liste "herkese açık" anlamına gelmesin: secret silinirse koruma sessizce kalkmaz.
  log({ status: 503, code: 'server_not_configured', hint: 'ALLOWED_ORIGINS veya TURNSTILE_ALLOWED_HOSTNAMES tanımlı değil' })
  Deno.serve((req) => misconfiguredResponse(req, allowedOrigins, 'server_not_configured'))
} else {
  log({ status: 0, code: 'started', key_source: serverKey.source })
  const secret = env('TURNSTILE_SECRET_KEY') ?? ''
  const admin = createClient(url, serverKey.key, { auth: { persistSession: false, autoRefreshToken: false } })
  const notificationDeps = createNotificationDeps(admin, selectProvider(env('SMS_PROVIDER')))
  const testHostnames = parseList(env('TEST_HOSTNAMES'))
  const pushKeys = parseVapidKeys(env('VAPID_KEYS'))
  // Yöneticinin telefonuna bildirim. Tablo yoksa veya gönderim başarısızsa randevu etkilenmez.
  const pushNewBooking = async () => {
    if (!pushKeys) return
    const summary = await notifyNewBooking({
      keys: pushKeys,
      listEndpoints: async () => {
        const { data, error } = await admin.from('push_subscriptions').select('endpoint')
        if (error) throw error
        return (data ?? []).map((r: { endpoint: string }) => r.endpoint)
      },
      removeEndpoint: async (endpoint) => { await admin.from('push_subscriptions').delete().eq('endpoint', endpoint) },
    })
    log({ status: 0, code: 'push', ...summary })
  }

  Deno.serve((req) =>
    handleRequest(req, {
      captchaConfigured: secret !== '',
      verifyTurnstile: (token, ip) => verifyTurnstileWithCloudflare(secret, token, ip),
      bookingRateLimitHit: async (ip) => {
        const { data, error } = await admin.rpc('booking_rate_limit_hit', { p_client_ip: ip })
        if (error) throw error
        return data === true
      },
      bookingGlobalLimitHit: async () => {
        const { data, error } = await admin.rpc('booking_global_limit_hit')
        if (error) throw error
        return data === true
      },
      createAppointment: async (args) => {
        const { data, error } = await admin.rpc('create_appointment', args)
        return { data, error: error ? { message: error.message } : null }
      },
      allowedOrigins,
      allowedHostnames,
      testHostnames: testHostnames.length ? testHostnames : DEFAULT_TEST_HOSTNAMES,
      // SMS ve telefon bildirimi, yanıtı geciktirmemek için arka planda gönderilir; hataları randevuyu etkilemez.
      afterBooking: async (appointmentId) => {
        const job = Promise.all([
          processNotifications(notificationDeps, appointmentId).catch(() => undefined),
          pushNewBooking().catch(() => log({ status: 0, code: 'push_failed' })),
        ])
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job)
        else await job
      },
      log: ({ status, code }) => log({ status, code }),
    }),
  )
}
