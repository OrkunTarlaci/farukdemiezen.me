/** HashRouter kullanıldığı için sayfa içi bağlantılar href="#..." yerine kaydırma ile çalışır. */
export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  // Klavye ve ekran okuyucu kullanıcıları için odağı bölüme taşı
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}
