// Supabase Edge Function (Deno): Turnstile doğrulamalı rezervasyon.
// Gizli değerler yalnızca Supabase Function Secrets'tan okunur; ön yüzde hiçbiri yoktur.
//   TURNSTILE_SECRET_KEY        — Cloudflare Turnstile gizli anahtarı (zorunlu)
//   ALLOWED_ORIGINS             — örn. "https://farukdemirezen.me,http://localhost:5173" (virgülle ayrılmış, önerilir)
//   TURNSTILE_ALLOWED_HOSTNAMES — örn. "farukdemirezen.me,localhost" (virgülle ayrılmış, önerilir)
//   TEST_HOSTNAMES              — isteğe bağlı; varsayılan "localhost,127.0.0.1". Bu hostname'lerden
//                                  gelen rezervasyonlar test olarak işaretlenir.
//   SMS_PROVIDER                — isteğe bağlı; şimdilik "none" (SMS gönderilmez, kuyrukta "atlandı" görünür)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Supabase tarafından otomatik sağlanır
// Dağıtım: supabase functions deploy create-booking --no-verify-jwt  (README, bölüm 4)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseList } from '../_shared/http.ts'
import { createNotificationDeps, selectProvider } from '../_shared/notificationDeps.ts'
import { processNotifications } from '../_shared/notifications.ts'
import { DEFAULT_TEST_HOSTNAMES, handleRequest, verifyTurnstileWithCloudflare } from './handler.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const secret = Deno.env.get('TURNSTILE_SECRET_KEY') ?? ''
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})
const notificationDeps = createNotificationDeps(admin, selectProvider(Deno.env.get('SMS_PROVIDER')))
const testHostnames = parseList(Deno.env.get('TEST_HOSTNAMES'))

Deno.serve((req) =>
  handleRequest(req, {
    captchaConfigured: secret !== '',
    verifyTurnstile: (token, ip) => verifyTurnstileWithCloudflare(secret, token, ip),
    bookingRateLimitHit: async (ip) => {
      const { data, error } = await admin.rpc('booking_rate_limit_hit', { p_client_ip: ip })
      if (error) throw error
      return data === true
    },
    createAppointment: async (args) => {
      const { data, error } = await admin.rpc('create_appointment', args)
      return { data, error: error ? { message: error.message } : null }
    },
    allowedOrigins: parseList(Deno.env.get('ALLOWED_ORIGINS')),
    allowedHostnames: parseList(Deno.env.get('TURNSTILE_ALLOWED_HOSTNAMES')),
    testHostnames: testHostnames.length ? testHostnames : DEFAULT_TEST_HOSTNAMES,
    // SMS, yanıtı geciktirmemek için arka planda gönderilir; hatası randevuyu etkilemez.
    afterBooking: async (appointmentId) => {
      const job = processNotifications(notificationDeps, appointmentId).catch(() => undefined)
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job)
      else await job
    },
    // Kişisel veri içermez: yalnızca durum kodu ve hata kodu (Supabase → Edge Functions → Logs).
    log: ({ status, code }) => console.log(JSON.stringify({ fn: 'create-booking', status, code })),
  }),
)
