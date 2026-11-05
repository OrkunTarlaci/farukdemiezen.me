// send-notifications Edge Function mantığı (Deno'ya özgü kod yok; Vitest ile test edilir).
// Yalnızca yönetici çağırabilir: panelde durum değişikliği veya "yeniden gönder" sonrası kuyruğu işler
// ve sağlayıcının yapılandırma durumunu (anahtar GÖSTERMEDEN) döndürür.
import { corsHeaders, originAllowed } from '../_shared/http.ts'
import type { ProcessSummary } from '../_shared/notifications.ts'

export interface SendDeps {
  /** Authorization başlığındaki oturumun yönetici olup olmadığını sunucuda doğrular. */
  isAdmin: (authorization: string | null, deviceToken: string | null) => Promise<boolean>
  process: (appointmentId: string | null) => Promise<ProcessSummary>
  provider: { name: string; configured: boolean }
  allowedOrigins: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleSendRequest(req: Request, deps: SendDeps): Promise<Response> {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin, deps.allowedOrigins)
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'invalid_request' })
  if (!originAllowed(origin, deps.allowedOrigins)) return json(403, { error: 'forbidden' })

  let admin = false
  try { admin = await deps.isAdmin(req.headers.get('authorization'), req.headers.get('x-device-token')) } catch { admin = false }
  if (!admin) return json(403, { error: 'forbidden' })

  let body: { appointmentId?: unknown; statusOnly?: unknown } = {}
  try { body = JSON.parse((await req.text()) || '{}') } catch { return json(400, { error: 'invalid_request' }) }

  const provider = { name: deps.provider.name, configured: deps.provider.configured }
  if (body.statusOnly === true) return json(200, { provider })

  const appointmentId = typeof body.appointmentId === 'string' && UUID_RE.test(body.appointmentId) ? body.appointmentId : null
  if (body.appointmentId !== undefined && appointmentId === null) return json(400, { error: 'invalid_request' })

  try {
    const summary = await deps.process(appointmentId)
    return json(200, { provider, summary })
  } catch {
    return json(503, { error: 'try_again' })
  }
}
