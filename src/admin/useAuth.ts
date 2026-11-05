import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { checkIsAdmin } from '../lib/api'
import { takeAuthLink } from '../lib/authLink'
import { toAppError } from '../lib/errors'
import { isIdleExpired, readActivity, touchActivity } from '../lib/idle'
import { clearDeviceTrust, readDeviceTrust } from '../lib/deviceToken'
import { deviceIsTrusted, isAdminMember, mfaStepRequired, trustThisDevice, verifiedFactorId, verifyCode } from '../lib/mfa'
import { getSupabase, isBackendConfigured } from '../lib/supabase'

export type AuthState =
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'signedOut' }
  | { status: 'mfa'; email: string }
  | { status: 'mfaSetup'; email: string }
  | { status: 'setPassword' }
  | { status: 'notAdmin'; email: string }
  | { status: 'admin'; email: string }
  | { status: 'error'; message: string }

export function useAuth() {
  const [state, setState] = useState<AuthState>(isBackendConfigured ? { status: 'loading' } : { status: 'unconfigured' })

  // Davet veya sıfırlama bağlantısıyla gelindiyse önce parola belirlenir.
  const settingPassword = useRef(false)

  const evaluate = useCallback(async (session: Session | null) => {
    if (settingPassword.current) { setState({ status: 'setPassword' }); return }
    if (!session) { setState({ status: 'signedOut' }); return }
    try {
      const email = session.user.email ?? ''
      // Güvenilir cihaz kararı sunucunundur; cihazdaki değer tek başına yeterli değildir.
      if ((await mfaStepRequired()) && !(await deviceIsTrusted())) { setState({ status: 'mfa', email }); return }
      // Yetki SUNUCUDA doğrulanır (is_admin). Arayüz yalnızca sonucu yansıtır; asıl koruma RLS'tir.
      const ok = await checkIsAdmin()
      // Yönetici ama iki adımlı giriş kurulmamış: kilitlenmez, panelden önce kurulum açılır.
      if (!ok && (await isAdminMember()) && !(await verifiedFactorId())) { setState({ status: 'mfaSetup', email }); return }
      setState(ok ? { status: 'admin', email } : { status: 'notAdmin', email })
    } catch (e) {
      const err = toAppError(e)
      if (err.code === 'session_expired') setState({ status: 'signedOut' })
      else setState({ status: 'error', message: err.message })
    }
  }, [])

  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let cancelled = false
    void getSupabase().then((supabase) => {
      if (!supabase || cancelled) return
      const link = takeAuthLink()
      if (link?.kind === 'error') {
        setState({ status: 'error', message: 'Bu bağlantının süresi dolmuş veya daha önce kullanılmış. Yeni bağlantı isteyin.' })
        return
      }
      if (link) {
        settingPassword.current = true
        void supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken }).then(({ error }) => {
          if (error) {
            settingPassword.current = false
            setState({ status: 'error', message: 'Bu bağlantının süresi dolmuş veya daha önce kullanılmış. Yeni bağlantı isteyin.' })
          }
        })
      }
      // INITIAL_SESSION, SIGNED_IN, SIGNED_OUT olayları buradan gelir.
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED') return
        // Callback içinde doğrudan Supabase çağrısı yapmak kilitlenmeye yol açabilir; erteleyin.
        setTimeout(() => { void evaluate(session) }, 0)
      })
      unsubscribe = () => data.subscription.unsubscribe()
    })
    return () => { cancelled = true; unsubscribe?.() }
  }, [evaluate])

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = await getSupabase()
    if (!supabase) throw toAppError({ message: 'not_configured' })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw toAppError(error)
    touchActivity()
  }, [])

  const verifyMfa = useCallback(async (code: string) => {
    const factorId = await verifiedFactorId()
    if (!factorId) throw new Error('no_factor')
    await verifyCode(factorId, code)
    await trustThisDevice().catch(() => undefined)
    touchActivity()
    const supabase = await getSupabase()
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
    await evaluate(data.session)
  }, [evaluate])

  const recheck = useCallback(async () => {
    const supabase = await getSupabase()
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
    await evaluate(data.session)
  }, [evaluate])

  const setPassword = useCallback(async (password: string) => {
    const supabase = await getSupabase()
    const res = await supabase?.auth.updateUser({ password })
    if (!res || res.error) throw res?.error ?? new Error('not_configured')
    settingPassword.current = false
    touchActivity()
    await recheck()
  }, [recheck])

  /** Oturum kapanır; bu cihazın bildirimi ve güvenilir cihaz kaydı sürer. Bildirim Ayarlar'dan kapatılır. */
  const signOut = useCallback(async () => {
    const supabase = await getSupabase()
    if (!supabase) return
    await supabase.auth.signOut() // oturumu sonlandırır ve yerel belirteçleri siler
    setState({ status: 'signedOut' })
  }, [])

  // Uzun süre işlem yoksa oturumu kapatır.
  const isAdmin = state.status === 'admin'
  useEffect(() => {
    if (!isAdmin) return
    const check = () => {
      if (isIdleExpired(readActivity(), Date.now())) { void signOut(); return }
      // Gece yarısı geçtiyse: aal2 oturum devam eder, cihaz güveniyle gelen oturum kod ekranına düşer.
      // Boş liste gösterilmesin diye sunucu yanıtı beklenmeden yeniden değerlendirilir.
      const trust = readDeviceTrust()
      if (trust && Date.now() >= trust.expiresAt) {
        clearDeviceTrust()
        void getSupabase().then((s) => s?.auth.getSession()).then((r) => evaluate(r?.data.session ?? null))
      }
    }
    let last = 0
    const activity = () => {
      const now = Date.now()
      if (now - last > 60_000) { last = now; check(); touchActivity(now) }
    }
    check()
    if (readActivity() === null) touchActivity()
    const timer = setInterval(check, 60_000)
    window.addEventListener('pointerdown', activity)
    window.addEventListener('keydown', activity)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pointerdown', activity)
      window.removeEventListener('keydown', activity)
      document.removeEventListener('visibilitychange', check)
    }
  }, [isAdmin, signOut, evaluate])

  return { state, signIn, signOut, verifyMfa, setPassword, recheck }
}
