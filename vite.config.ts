/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Site özel alan adının kökünde yayınlanır (https://www.orkuntarlaci.me/); github.io adresi oraya yönlenir.
// Bu yüzden derleme de geliştirme sunucusu da "/" kullanır. Alt yolda yayın gerekirse
// (ör. özel alan adı kaldırılırsa → "/farukdemiezen.me/") VITE_BASE_PATH ile değiştirilir.
const DEFAULT_BASE = '/'

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
    plugins: [react()],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    },
  }
})
