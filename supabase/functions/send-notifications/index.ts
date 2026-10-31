// Supabase Edge Function (Deno): yönetici tetiklemeli SMS kuyruğu işleme.
// Dağıtım: supabase functions deploy send-notifications --no-verify-jwt
// (Kimlik doğrulama fonksiyonun içinde yapılır: oturum + is_admin().)
//   SMS_PROVIDER, ALLOWED_ORIGINS — Function Secrets
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — Supabase otomatik sağlar
import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseList } from '../_shared/http.ts'
import { createNotificationDeps, selectProvider } from '../_shared/notificationDeps.ts'
import { processNotifications } from '../_shared/notifications.ts'
import { handleSendRequest } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})
const provider = selectProvider(Deno.env.get('SMS_PROVIDER'))
const deps = createNotificationDeps(admin, provider)

Deno.serve((req) =>
  handleSendRequest(req, {
    provider,
    allowedOrigins: parseList(Deno.env.get('ALLOWED_ORIGINS')),
    isAdmin: async (authorization) => {
      if (!authorization?.startsWith('Bearer ')) return false
      // Kullanıcının kendi oturumuyla is_admin() çağrılır; yetki veritabanında doğrulanır.
      const asUser = createClient(url, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data, error } = await asUser.rpc('is_admin')
      return !error && data === true
    },
    process: (appointmentId) => processNotifications(deps, appointmentId),
  }),
)
