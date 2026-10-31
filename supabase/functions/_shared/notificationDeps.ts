// Deno tarafı: bildirim kuyruğunu service_role istemcisiyle işleyen bağımlılıklar ve sağlayıcı seçimi.
// Gizli değerler yalnızca Supabase Function Secrets'tan okunur.
//   SMS_PROVIDER — şimdilik yalnızca "none" (gönderim yok). Sağlayıcı onaylanınca buraya eklenecek.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { disabledProvider, type NotificationDeps, type QueuedNotification, type SmsProvider } from './notifications.ts'

export function selectProvider(name: string | undefined): SmsProvider {
  switch ((name ?? 'none').toLowerCase()) {
    // Sağlayıcı seçimi için işletmenin onayı bekleniyor (README, "SMS bildirimleri").
    default:
      return disabledProvider
  }
}

export function createNotificationDeps(admin: SupabaseClient, provider: SmsProvider): NotificationDeps {
  return {
    provider,
    claim: async (appointmentId) => {
      const { data, error } = await admin.rpc('claim_notifications', { p_appointment: appointmentId, p_limit: 20 })
      if (error) throw new Error('claim_failed')
      return (data ?? []) as QueuedNotification[]
    },
    load: async (appointmentId) => {
      const [{ data: a }, { data: s }] = await Promise.all([
        admin.from('appointments')
          .select('customer_phone, service_name, starts_at, price_minor, reference_code, services(name)')
          .eq('id', appointmentId).maybeSingle(),
        admin.from('business_settings').select('business_name, contact_phone').eq('id', 1).maybeSingle(),
      ])
      if (!a) return null
      const row = a as unknown as {
        customer_phone: string; service_name: string | null; starts_at: string; price_minor: number | null
        reference_code: string; services: { name: string } | null
      }
      return {
        phone: row.customer_phone,
        data: {
          businessName: (s as { business_name?: string } | null)?.business_name ?? 'Randevu',
          contactPhone: (s as { contact_phone?: string | null } | null)?.contact_phone ?? null,
          serviceName: row.service_name ?? row.services?.name ?? 'Hizmet',
          startsAt: row.starts_at,
          priceMinor: row.price_minor,
          referenceCode: row.reference_code,
        },
      }
    },
    finish: async (id, status, providerName, messageId, error) => {
      await admin.rpc('finish_notification', {
        p_id: id, p_status: status, p_provider: providerName, p_message_id: messageId, p_error: error,
      })
    },
  }
}
