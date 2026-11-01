// Ön yüze ve depoya gizli Supabase anahtarı girmediğini doğrular.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — düz JavaScript betiği (tip bildirimi yok)
import { findSecrets, scan } from '../../scripts/check-secrets.mjs'

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const p = (rel: string) => join(root, rel)

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) listFiles(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

// Tarayıcıya gömülmesine izin verilen ortam değişkenleri (hepsi GENEL değerlerdir)
const ALLOWED_ENV = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_TURNSTILE_SITE_KEY', 'VITE_BASE_PATH', 'DEV', 'PROD', 'MODE', 'BASE_URL'])

describe('gizli anahtar denetimi', () => {
  it('denetleyici sb_secret_ anahtarını ve service_role JWT\'sini tanır, publishable anahtarı tanımaz', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const jwt = (role: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role })}.abcdefghijklmnop`
    // Sahte örnek; gerçek anahtar değildir. Taramaya takılmasın diye parça parça oluşturulur.
    const fakeSecret = ['sb', 'secret', 'abcdefghijklmnop'].join('_')
    expect(findSecrets(`const k = "${fakeSecret}"`)).toEqual(['sb_secret_ anahtarı'])
    expect(findSecrets(`const k = "${jwt('service_role')}"`)).toEqual(['service_role JWT'])
    expect(findSecrets(`const k = "${jwt('anon')}"`)).toEqual([])
    expect(findSecrets(`const k = "sb_publishable_abcdefghijklmnop"`)).toEqual([])
  })

  it('ön yüz kaynağı, yayınlanan dosyalar ve workflow gizli anahtar içermez', () => {
    const targets = ['src', 'public', 'index.html', '.env.example', '.github', 'supabase/functions-dashboard', 'scripts'].map(p)
    expect(scan(targets)).toEqual([])
  })

  it('üretim derlemesi (dist) varsa gizli anahtar içermez', () => {
    if (!existsSync(p('dist'))) return // derleme yoksa workflow adımı denetler
    expect(scan([p('dist')])).toEqual([])
  })

  it('ön yüz yalnızca genel ortam değişkenlerini okur (service_role / secret adlı değişken yok)', () => {
    const used = new Set<string>()
    for (const file of listFiles(p('src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/import\.meta\.env\.([A-Z_]+)/g)) used.add(m[1])
    }
    const unexpected = [...used].filter((n) => !ALLOWED_ENV.has(n))
    expect(unexpected).toEqual([])
  })

  it('.env ve derleme çıktıları Git dışında tutulur', () => {
    const lines = readFileSync(p('.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim())
    for (const required of ['node_modules', 'dist', '.env', '.env.*']) expect(lines).toContain(required)
  })
})
