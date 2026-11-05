/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Site özel alan adının kökünde yayınlanır (https://www.orkuntarlaci.me/); github.io adresi oraya yönlenir.
// Bu yüzden derleme de geliştirme sunucusu da "/" kullanır. Alt yolda yayın gerekirse
// (ör. özel alan adı kaldırılırsa → "/farukdemiezen.me/") VITE_BASE_PATH ile değiştirilir.
const DEFAULT_BASE = '/'

// GitHub Pages sunucu başlığı ekleyemediği için CSP meta etiketiyle verilir. Geliştirme sunucusu satır içi
// script kullandığı için yalnızca üretim derlemesine eklenir.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  'frame-src https://challenges.cloudflare.com',
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
  }
}

function normalizeBase(value: string): string {
  let base = value.trim() || '/'
  if (!base.startsWith('/')) base = `/${base}`
  if (!base.endsWith('/')) base = `${base}/`
  return base
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = normalizeBase(env.VITE_BASE_PATH || DEFAULT_BASE)

  return {
    base,
    plugins: [react(), contentSecurityPolicy()],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    },
  }
})
