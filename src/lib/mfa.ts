// Yönetici için iki adımlı giriş (TOTP). Sunucu tarafı denetim is_admin() içindedir (0011).
import { clearDeviceTrust, readDeviceTrust, saveDeviceTrust } from './deviceToken'
import { getSupabase } from './supabase'

async function auth() {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('not_configured')
  return supabase.auth
}

/** Hesapta iki adımlı giriş açık ama bu oturum ikinci adımı henüz geçmemişse true. */
export function needsMfaStep(level: { currentLevel: string | null; nextLevel: string | null } | null): boolean {
  return level?.nextLevel === 'aal2' && level.currentLevel !== 'aal2'
}

export async function mfaStepRequired(): Promise<boolean> {
  const { data, error } = await (await auth()).mfa.getAuthenticatorAssuranceLevel()
  if (error) throw error
  return needsMfaStep(data)
}

async function factors() {
  const { data, error } = await (await auth()).mfa.listFactors()
  if (error) throw error
  return data
}

export async function verifiedFactorId(): Promise<string | null> {
  return (await factors()).totp.find((f) => f.status === 'verified')?.id ?? null
}

/** Girişte veya kurulumda telefondaki 6 haneli kodu doğrular. */
export async function verifyCode(factorId: string, code: string): Promise<void> {
  const { error } = await (await auth()).mfa.challengeAndVerify({ factorId, code })
  if (error) throw error
}

/** Sunucu bu cihazı bugün için güvenilir sayıyorsa true. Kayıt yoksa veya süresi dolduysa cihazdaki değer silinir. */
export async function deviceIsTrusted(): Promise<boolean> {
  if (!readDeviceTrust()) return false
  const supabase = await getSupabase()
  const res = await supabase?.rpc('device_trust_expires')
  if (res?.data) return true
  if (!res?.error) clearDeviceTrust()
  return false
}

/** Kod az önce doğrulandıysa bu cihaza gün sonuna kadar güven kaydı alır. Başarısız olursa kod yine her girişte istenir. */
export async function trustThisDevice(): Promise<void> {
  const supabase = await getSupabase()
  const res = await supabase?.rpc('trust_this_device')
  const data = res?.data as { token?: string; expires_at?: string } | null | undefined
  if (data?.token && data.expires_at) saveDeviceTrust({ token: data.token, expiresAt: Date.parse(data.expires_at) })
}

/** Bu yöneticinin bütün cihazlarındaki güveni kaldırır (kayıp telefon). */
export async function revokeTrustedDevices(): Promise<void> {
  const supabase = await getSupabase()
  const res = await supabase?.rpc('revoke_trusted_devices')
  if (res?.error) throw res.error
  clearDeviceTrust()
}

/** Yeni kurulum başlatır; yarım kalmış eski kurulumları önce temizler. */
export async function startEnroll(): Promise<{ factorId: string; qrCode: string; secret: string }> {
  const a = await auth()
  for (const f of (await factors()).all.filter((x) => x.status === 'unverified')) {
    await a.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await a.mfa.enroll({ factorType: 'totp', friendlyName: 'Panel' })
  if (error) throw error
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
}

/** Kullanıcı yöneticiler listesinde mi? Yetki vermez; yalnızca iki adımlı kurulum ekranı için (0014). */
export async function isAdminMember(): Promise<boolean> {
  const supabase = await getSupabase()
  const res = await supabase?.rpc('is_admin_member')
  return res?.data === true
}
