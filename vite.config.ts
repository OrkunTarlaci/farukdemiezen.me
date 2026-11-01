/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages proje sayfası: https://orkuntarlaci.github.io/farukdemiezen.me/
// Üretim derlemesi varsayılan olarak bu alt yolu kullanır; geliştirme sunucusu "/" ile çalışır.
// Başka bir yol gerekirse (ör. özel alan adı → "/") VITE_BASE_PATH ile değiştirilir.
const GITHUB_PAGES_BASE = '/farukdemiezen.me/'

function normalizeBase(value: string): string {
  let base = value.trim() || '/'
  if (!base.startsWith('/')) base = `/${base}`
  if (!base.endsWith('/')) base = `${base}/`
  return base
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = normalizeBase(env.VITE_BASE_PATH || (command === 'build' ? GITHUB_PAGES_BASE : '/'))

  return {
    base,
    plugins: [react()],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    },
  }
})
