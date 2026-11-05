// Telefon bildirimi için VAPID anahtar çifti üretir.
// Gizli anahtar yalnızca .env.vapid.local dosyasına yazılır (git'e girmez), ekrana yazdırılmaz.
// Açık anahtar gizli değildir: src/config/site.ts → push.vapidPublicKey alanına yazılır.
//
// Kullanım:  node scripts/generate-vapid.mjs
import { existsSync, writeFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'

const file = '.env.vapid.local'
if (existsSync(file)) {
  console.error(`${file} zaten var. Eski anahtarın üzerine yazılmadı.`)
  process.exit(1)
}

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const jwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey)
const publicKey = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')

writeFileSync(file, `VAPID_KEYS=${publicKey}.${jwk.d}\n`)
console.log(publicKey)
