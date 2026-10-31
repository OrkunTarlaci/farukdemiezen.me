import type { SupabaseClient } from '@supabase/supabase-js'

// Yalnızca GENEL değerler kullanılır. service_role anahtarı ve Turnstile gizli anahtarı ASLA burada olmamalıdır.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Gerçek bir arka uç yapılandırılmış mı? (.env.example'daki yer tutucular sayılmaz) */
export const isBackendConfigured = Boolean(
  url && anonKey && !url.includes('YOUR-PROJECT') && !anonKey.startsWith('YOUR-'),
)

/** Cloudflare Turnstile site anahtarı (GENEL). Gizli anahtar yalnızca Edge Function'dadır. */
const rawSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim()
export const turnstileSiteKey = rawSiteKey && !rawSiteKey.startsWith('YOUR-') ? rawSiteKey : null

let clientPromise: Promise<SupabaseClient> | null = null

/**
 * Supabase istemcisi. Kütüphane (~150 kB) ayrı bir parçada, ilk ihtiyaçta yüklenir; böylece sayfanın
 * ilk çizimi onu beklemez. Arka uç yapılandırılmamışsa null döner.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isBackendConfigured) return Promise.resolve(null)
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    }),
  )
  return clientPromise
}
