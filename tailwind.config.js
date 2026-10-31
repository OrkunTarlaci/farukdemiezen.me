/** @type {import('tailwindcss').Config} */

// Renkler src/index.css içindeki CSS değişkenlerinden gelir (tek kaynak); opaklık
// yardımcıları (ör. border-fg/10) bu sayede çalışır.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        raised: v('raised'),
        fg: v('fg'),
        muted: v('muted'),
        subtle: v('subtle'),
        line: v('line'),
        accent: { DEFAULT: v('accent'), hover: v('accent-hover'), fg: v('accent-fg') },
        success: v('success'),
        warning: v('warning'),
        danger: v('danger'),
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '6px', md: '6px', lg: '8px', xl: '12px' },
      letterSpacing: { brand: '0.32em' },
      boxShadow: {
        card: '0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 12px 32px -16px rgb(0 0 0 / 0.6)',
      },
    },
  },
  plugins: [],
}
