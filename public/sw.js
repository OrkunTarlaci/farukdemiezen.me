// Yalnızca bildirim içindir: sayfa isteklerine karışmaz, hiçbir şeyi önbelleğe almaz.
// Bildirim sunucudan boş gelir; metin burada sabittir, bu yüzden müşteri bilgisi içermez.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  event.waitUntil(self.registration.showNotification('Yeni randevu', {
    body: 'Yeni randevunuz var, sistemden onaylayın.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: new URL('./#/admin', self.registration.scope).href },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? self.registration.scope
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = open.find((c) => c.url.startsWith(self.registration.scope))
    if (client) {
      await client.focus()
      if ('navigate' in client) await client.navigate(url)
    } else {
      await self.clients.openWindow(url)
    }
  })())
})
