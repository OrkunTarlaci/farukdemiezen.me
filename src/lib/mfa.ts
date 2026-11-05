// Yönetici için iki adımlı giriş (TOTP). Sunucu tarafı denetim is_admin() içindedir (0011).
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

export async function removeFactor(factorId: string): Promise<void> {
  const { error } = await (await auth()).mfa.unenroll({ factorId })
  if (error) throw error
}
