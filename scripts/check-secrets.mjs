// Tarayıcıya veya depoya gidecek dosyalarda gizli Supabase anahtarı olmadığını denetler.
//   - sb_secret_… biçimindeki yeni gizli anahtarlar
//   - rolü service_role olan JWT'ler (eski service_role anahtarı)
// Kullanım: node scripts/check-secrets.mjs [klasör veya dosya ...]   (varsayılan: dist)
// Bulursa anahtarın kendisini YAZDIRMAZ; yalnızca dosya adını ve türünü yazar ve 1 ile çıkar.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SKIP = new Set(['node_modules', '.git'])
const TEXT = /\.(js|mjs|cjs|ts|tsx|jsx|html|css|json|map|svg|txt|md|yml|yaml|sql|example)$/i

export function findSecrets(text) {
  const found = []
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) found.push('sb_secret_ anahtarı')
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
      if (payload && payload.role === 'service_role') found.push('service_role JWT')
    } catch { /* JWT değil */ }
  }
  return found
}

function* walk(path) {
  if (!existsSync(path)) return
  const st = statSync(path)
  if (st.isFile()) { yield path; return }
  for (const name of readdirSync(path)) {
    if (SKIP.has(name)) continue
    yield* walk(join(path, name))
  }
}

export function scan(paths) {
  const hits = []
  for (const root of paths) {
    for (const file of walk(root)) {
      if (!TEXT.test(file)) continue
      for (const kind of findSecrets(readFileSync(file, 'utf8'))) hits.push({ file, kind })
    }
  }
  return hits
}

// Doğrudan çalıştırıldığında (node scripts/check-secrets.mjs …); testten içe aktarıldığında çalışmaz.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/check-secrets.mjs')) {
  const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['dist']
  const hits = scan(targets)
  if (hits.length) {
    for (const h of hits) console.error(`GİZLİ ANAHTAR BULUNDU: ${h.file} (${h.kind})`)
    process.exit(1)
  }
  console.log(`Gizli anahtar bulunmadı: ${targets.join(', ')}`)
}
