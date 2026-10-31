// Supabase Edge Function (Deno): Turnstile doğrulamalı rezervasyon.
// Gizli değerler yalnızca Supabase Function Secrets'tan okunur; ön yüzde hiçbiri yoktur.
//   TURNSTILE_SECRET_KEY       — Cloudflare Turnstile gizli anahtarı (zorunlu)
//   ALLOWED_ORIGINS            — örn. "https://kullanici.github.io" (virgülle ayrılmış, önerilir)
//   TURNSTILE_ALLOWED_HOSTNAMES — örn. "kullanici.github.io" (virgülle ayrılmış, önerilir)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Supabase tarafından otomatik sağlanır
// Dağıtım: supabase functions deploy create-booking --no-verify-jwt  (README, bölüm 3)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleRequest, parseList, verifyTurnstileWithCloudflare } from './handler.ts'

const secret = Deno.env.get('TURNSTILE_SECRET_KEY') ?? ''
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})

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
  }),
)
