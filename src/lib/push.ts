// Yöneticinin telefonuna "yeni randevu" bildirimi: izin alma ve cihazı kaydetme.
// Gönderim sunucuda (supabase/functions/_shared/push.ts), bildirim metni public/sw.js içindedir.
import { siteConfig } from '../config/site'
import { deletePushSubscription, savePushSubscription } from './api'

export type PushState = 'unsupported' | 'install_first' | 'denied' | 'off' | 'on'

const swUrl = () => `${import.meta.env.BASE_URL}sw.js`

/** iPhone ve iPad'de bildirim yalnızca ana ekrana eklenmiş uygulamada çalışır. */
export function needsInstallFirst(userAgent: string, touchPoints: number, standalone: boolean): boolean {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)
  return ios && !standalone
}

/** Base64url açık anahtarı tarayıcının istediği bayt dizisine çevirir. */
export function decodeKey(key: string): Uint8Array<ArrayBuffer> {
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  return (await registration?.pushManager.getSubscription()) ?? null
}

export async function getPushState(): Promise<PushState> {
  const standalone = window.matchMedia('(display-mode: standalone)').matches
  if (needsInstallFirst(navigator.userAgent, navigator.maxTouchPoints, standalone)) return 'install_first'
  if (!siteConfig.push.vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return (await currentSubscription()) ? 'on' : 'off'
}

/** İzin ister, cihazı kaydeder. Sunucuya yazılamazsa tarayıcıdaki kaydı geri alır. */
export async function enablePush(): Promise<PushState> {
  if ((await Notification.requestPermission()) !== 'granted') return getPushState()
  const registration = await navigator.serviceWorker.register(swUrl())
  await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeKey(siteConfig.push.vapidPublicKey ?? ''),
  })
  try {
    await savePushSubscription(subscription.endpoint)
  } catch (e) {
    await subscription.unsubscribe()
    throw e
  }
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription()
  if (subscription) {
    await deletePushSubscription(subscription.endpoint)
    await subscription.unsubscribe()
  }
  return getPushState()
}

/** Telefonun bildirimi gösterebildiğini denemek için, sunucuya gitmeden yerel bildirim. */
export async function showTestNotification(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification('Deneme bildirimi', {
    body: 'Bildirimler çalışıyor. Yeni randevu gelince böyle görünecek.',
    icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
  })
}
