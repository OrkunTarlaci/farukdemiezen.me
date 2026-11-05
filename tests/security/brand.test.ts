import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
const pngSize = (f: string) => {
  const b = readFileSync(new URL(`../../public/${f}`, import.meta.url))
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

describe('marka dosyaları', () => {
  it('ikonlar istenen boyutlarda ve kare', () => {
    for (const [f, s] of [['icons/favicon-16.png', 16], ['icons/favicon-32.png', 32], ['icons/favicon-48.png', 48], ['icons/apple-touch-icon.png', 180],
      ['icons/icon-192.png', 192], ['icons/icon-512.png', 512], ['icons/maskable-512.png', 512], ['icons/badge-96.png', 96]] as const) {
      expect(pngSize(f)).toEqual([s, s])
    }
  })

  it('favicon ve amblemde yazı yok; SVG dosyaları yazı tipine bağlı değil', () => {
    for (const f of ['public/favicon.svg', 'public/brand/emblem.svg', 'public/brand/logo-horizontal.svg']) {
      expect(read(f)).not.toMatch(/<text|font-family/)
    }
  })

  it('manifest, sayfa ve bildirim yeni ikonları kullanır', () => {
    const icons = JSON.parse(read('public/manifest.webmanifest')).icons as { src: string; purpose: string }[]
    for (const i of icons) expect(existsSync(new URL(`../../public/${i.src}`, import.meta.url))).toBe(true)
    expect(icons.some((i) => i.purpose === 'maskable' && i.src.includes('maskable'))).toBe(true)
    const html = read('index.html')
    for (const s of ['favicon.svg', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png']) expect(html).toContain(s)
    expect(read('public/sw.js')).toContain('icons/badge-96.png')
  })

  it('eski logo dosyaları ve FD monogramı kalmadı', () => {
    expect(existsSync(new URL('../../public/logo.svg', import.meta.url))).toBe(false)
    expect(existsSync(new URL('../../public/images/logo-512.png', import.meta.url))).toBe(false)
    expect(existsSync(new URL('../../src/components/ui/Emblem.tsx', import.meta.url))).toBe(false)
    expect(read('src/components/ui/Logo.tsx')).not.toMatch(/>\s*FD\s*</)
  })
})
