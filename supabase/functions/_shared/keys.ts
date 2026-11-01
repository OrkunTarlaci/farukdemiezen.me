// Supabase'in Edge Function'lara otomatik verdiği API anahtarlarını seçer (Deno'ya özgü kod yok).
//
// Yeni anahtar sistemi: SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS — her biri adı → anahtar
// eşlemesi olan bir JSON nesnesidir (ör. {"default":"sb_secret_..."}). Eski sistem:
// SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (JWT). Supabase eski anahtarları kullanımdan kaldıracağı
// için önce yenisi okunur, yoksa eskisine dönülür. Anahtarların kendisi hiçbir zaman loglanmaz.

export type EnvGet = (name: string) => string | undefined

function fromJsonDict(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const dict = JSON.parse(raw) as Record<string, unknown>
    if (!dict || typeof dict !== 'object') return null
    const preferred = dict.default
    if (typeof preferred === 'string' && preferred.trim()) return preferred.trim()
    const first = Object.values(dict).find((v): v is string => typeof v === 'string' && v.trim() !== '')
    return first?.trim() ?? null
  } catch {
    return null
  }
}

function plain(raw: string | undefined): string | null {
  const v = raw?.trim()
  return v ? v : null
}

/**
 * Sunucu tarafı (RLS'i aşan) anahtar: yalnızca Edge Function içinde kullanılır, tarayıcıya asla gitmez.
 * Kaynak: SUPABASE_SECRET_KEYS (yeni) → SUPABASE_SERVICE_ROLE_KEY (eski).
 */
export function resolveServerKey(env: EnvGet): { key: string; source: 'secret_keys' | 'service_role' } | null {
  const fresh = fromJsonDict(env('SUPABASE_SECRET_KEYS'))
  if (fresh) return { key: fresh, source: 'secret_keys' }
  const legacy = plain(env('SUPABASE_SERVICE_ROLE_KEY'))
  if (legacy) return { key: legacy, source: 'service_role' }
  return null
}

/**
 * Genel (RLS'e tabi) anahtar: kullanıcının kendi oturumuyla sorgu yapmak için.
 * Kaynak: SUPABASE_PUBLISHABLE_KEYS (yeni) → SUPABASE_ANON_KEY (eski).
 */
export function resolvePublicKey(env: EnvGet): { key: string; source: 'publishable_keys' | 'anon' } | null {
  const fresh = fromJsonDict(env('SUPABASE_PUBLISHABLE_KEYS'))
  if (fresh) return { key: fresh, source: 'publishable_keys' }
  const legacy = plain(env('SUPABASE_ANON_KEY'))
  if (legacy) return { key: legacy, source: 'anon' }
  return null
}
