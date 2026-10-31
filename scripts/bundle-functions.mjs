// Edge Function'ları Supabase Dashboard editörüne yapıştırılabilir TEK dosyaya paketler.
// Kaynak: supabase/functions/<ad>/index.ts (+ handler.ts ve _shared/*). Mantık değiştirilmez;
// yalnızca yerel içe aktarmalar birleştirilir. npm:@supabase/supabase-js@2 dışarıda bırakılır
// (Supabase çalışma ortamı onu kendisi yükler).
//
// Kullanım:  npm run bundle:functions
// Çıktı:     supabase/functions-dashboard/create-booking.ts, send-notifications.ts
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const functions = ['create-booking', 'send-notifications']
const outDir = 'supabase/functions-dashboard'
mkdirSync(outDir, { recursive: true })

for (const name of functions) {
  const result = await build({
    entryPoints: [`supabase/functions/${name}/index.ts`],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['npm:*'],
    write: false,
    legalComments: 'none',
    charset: 'utf8',
  })
  const code = result.outputFiles[0].text
  const header =
    `// OTOMATİK ÜRETİLDİ — ELLE DÜZENLEMEYİN. Kaynak: supabase/functions/${name}/ (npm run bundle:functions)\n` +
    `// Supabase Dashboard → Edge Functions → "${name}" → index.ts içine bu dosyanın TAMAMINI yapıştırın.\n` +
    `// Gizli değerler bu dosyada YOKTUR; Edge Functions → Secrets bölümünden okunur.\n`
  const path = `${outDir}/${name}.ts`
  writeFileSync(path, header + code)
  const imports = [...code.matchAll(/^import .* from ["']([^"']+)["']/gm)].map((m) => m[1])
  const bad = imports.filter((s) => !s.startsWith('npm:'))
  if (bad.length) throw new Error(`${name}: çözülmemiş yerel içe aktarma: ${bad.join(', ')}`)
  console.log(`${path}  (${Buffer.byteLength(readFileSync(path))} bayt; dış içe aktarmalar: ${imports.join(', ') || 'yok'})`)
}
