// Portfolyo demosu: Supabase'siz, örnek verili, şifresiz ve salt-okunur yönetim paneli.
// Gerçek siteyi etkilemez. Derleme: npx vite build --config vite.demo.config.ts
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { fileURLToPath } from 'node:url'
import tailwindConfig from './tailwind.config.js'

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/')
const SWAPS: Record<string, string> = {
  'src/lib/api.ts': 'demo/api.ts',
  'src/lib/supabase.ts': 'demo/supabase.ts',
  'src/admin/useAuth.ts': 'demo/useAuth.ts',
  'src/components/booking/SecurityCheck.tsx': 'demo/SecurityCheck.tsx',
}

function demoSwaps(): Plugin {
  return {
    name: 'demo-swaps',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || importer.replace(/\\/g, '/').startsWith(`${root}demo/`)) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved) return null
      const rel = resolved.id.replace(/\\/g, '/').replace(root, '')
      return SWAPS[rel] ? `${root}${SWAPS[rel]}` : null
    },
    transformIndexHtml: (html) => html.replace('/src/main.tsx', '/demo/main.tsx'),
  }
}

export default defineConfig({
  base: './',
  plugins: [demoSwaps(), react()],
  css: {
    postcss: {
      plugins: [tailwind({ ...tailwindConfig, content: [...tailwindConfig.content, './demo/**/*.{ts,tsx}'] }), autoprefixer()],
    },
  },
  build: {
    outDir: process.env.DEMO_OUT_DIR ?? 'dist-demo',
    emptyOutDir: true,
  },
})
