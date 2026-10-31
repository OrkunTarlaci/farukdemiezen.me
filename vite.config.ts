/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages base path.
// Proje sayfası (https://<kullanici>.github.io/<repo>/) için VITE_BASE_PATH=/<repo>/ olmalıdır.
// Özel alan adı veya <kullanici>.github.io kök deposu için VITE_BASE_PATH=/ kullanın.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  let base = env.VITE_BASE_PATH || '/'
  if (!base.startsWith('/')) base = `/${base}`
  if (!base.endsWith('/')) base = `${base}/`

  return {
    base,
    plugins: [react()],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    },
  }
})
