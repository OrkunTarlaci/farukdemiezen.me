// Supabase Edge Function (Deno): yönetici tetiklemeli SMS kuyruğu işleme.
// Dağıtım: supabase functions deploy send-notifications --no-verify-jwt
// (Kimlik doğrulama fonksiyonun içinde yapılır: oturum + is_admin().)
//   SMS_PROVIDER, ALLOWED_ORIGINS — Function Secrets
//   SUPABASE_URL ve anahtarlar — Supabase otomatik sağlar:
//     sunucu anahtarı: SUPABASE_SECRET_KEYS (yeni) → SUPABASE_SERVICE_ROLE_KEY (eski)
//     genel anahtar:   SUPABASE_PUBLISHABLE_KEYS (yeni) → SUPABASE_ANON_KEY (eski)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { misconfiguredResponse, parseList } from '../_shared/http.ts'
import { resolvePublicKey, resolveServerKey } from '../_shared/keys.ts'
import { createNotificationDeps, selectProvider } from '../_shared/notificationDeps.ts'
import { processNotifications } from '../_shared/notifications.ts'
import { handleSendRequest } from './handler.ts'

const env = (name: string) => Deno.env.get(name)
const url = env('SUPABASE_URL') ?? ''
const serverKey = resolveServerKey(env)
const publicKey = resolvePublicKey(env)
const allowedOrigins = parseList(env('ALLOWED_ORIGINS'))
const log = (event: Record<string, unknown>) => console.log(JSON.stringify({ fn: 'send-notifications', ...event }))

if (!url || !serverKey || !publicKey) {
  log({ status: 503, code: 'server_not_configured', hint: 'SUPABASE_URL veya Supabase anahtarları bulunamadı' })
  Deno.serve((req) => misconfiguredResponse(req, allowedOrigins, 'server_not_configured'))
} else {
  log({ status: 0, code: 'started', key_source: serverKey.source, public_key_source: publicKey.source })
  const admin = createClient(url, serverKey.key, { auth: { persistSession: false, autoRefreshToken: false } })
  const provider = selectProvider(env('SMS_PROVIDER'))
  const deps = createNotificationDeps(admin, provider)

  Deno.serve((req) =>
    handleSendRequest(req, {
      provider,
      allowedOrigins,
      isAdmin: async (authorization) => {
        if (!authorization?.startsWith('Bearer ')) return false
        // Kullanıcının kendi oturumuyla is_admin() çağrılır; yetki veritabanında doğrulanır.
        const asUser = createClient(url, publicKey.key, {
          global: { headers: { Authorization: authorization } },
          auth: { persistSession: false, autoRefreshToken: false },
        })
        const { data, error } = await asUser.rpc('is_admin')
        return !error && data === true
      },
      process: (appointmentId) => processNotifications(deps, appointmentId),
    }),
  )
}
