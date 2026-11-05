// Supabase davet ve parola sıfırlama bağlantıları sayfayı "#access_token=...&type=invite" ile açar. Site
// HashRouter kullandığı için bu değer rota sanılır; burada okunur ve adres çubuğundan hemen silinir.
export type AuthLink =
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'error' }

export function parseAuthHash(hash: string): AuthLink | null {
  if (!hash.startsWith('#') || hash.startsWith('#/')) return null
  const p = new URLSearchParams(hash.slice(1))
  if (p.get('error') || p.get('error_code')) return { kind: 'error' }
  const accessToken = p.get('access_token')
  const refreshToken = p.get('refresh_token')
  const type = p.get('type')
  if (!accessToken || !refreshToken || (type !== 'invite' && type !== 'recovery')) return null
  return { kind: 'session', accessToken, refreshToken }
}

let pending: AuthLink | null = null

/** Router çalışmadan önce çağrılır. Bağlantı varsa saklar ve adresi panele çevirir. */
export function captureAuthLink(): void {
  pending = parseAuthHash(window.location.hash)
  if (pending) window.history.replaceState(null, '', `${window.location.pathname}#/admin`)
}

export function takeAuthLink(): AuthLink | null {
  const link = pending
  pending = null
  return link
}
