// Edge Function'lar için ortak HTTP yardımcıları (Deno'ya özgü kod yok).

export function parseList(v: string | undefined | null): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/** allowed boşsa tüm kökenlere izin verilir; doluysa yalnızca listedekilere. */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const allowOrigin = allowed.length === 0 ? '*' : origin && allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function originAllowed(origin: string | null, allowed: string[]): boolean {
  return allowed.length === 0 || (origin !== null && allowed.includes(origin))
}
