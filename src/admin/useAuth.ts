import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { checkIsAdmin } from '../lib/api'
import { toAppError } from '../lib/errors'
import { getSupabase, isBackendConfigured } from '../lib/supabase'

export type AuthState =
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'signedOut' }
  | { status: 'notAdmin'; email: string }
  | { status: 'admin'; email: string }
  | { status: 'error'; message: string }

export function useAuth() {
  const [state, setState] = useState<AuthState>(isBackendConfigured ? { status: 'loading' } : { status: 'unconfigured' })

  const evaluate = useCallback(async (session: Session | null) => {
    if (!session) { setState({ status: 'signedOut' }); return }
    try {
      // Yetki SUNUCUDA doğrulanır (is_admin). Arayüz yalnızca sonucu yansıtır; asıl koruma RLS'tir.
      const ok = await checkIsAdmin()
      const email = session.user.email ?? ''
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
  }, [])

  const signOut = useCallback(async () => {
    const supabase = await getSupabase()
    if (!supabase) return
    await supabase.auth.signOut() // oturumu sonlandırır ve yerel belirteçleri siler
    setState({ status: 'signedOut' })
  }, [])

  return { state, signIn, signOut }
}
