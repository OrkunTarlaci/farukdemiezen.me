import { useCallback, useEffect, useRef, useState } from 'react'
import { toAppError, type AppError } from './errors'

export interface AsyncState<T> {
  data: T | undefined
  error: AppError | null
  loading: boolean
  reload: () => void
  /** Ekrandaki veriyi yükleniyor göstermeden tazeler; hata olursa mevcut veri kalır. */
  refresh: () => void
}

/**
 * Basit veri yükleyici. Bağımlılıklar değişince yeniden yükler ve eski (geç dönen) yanıtları yok sayar;
 * böylece ekranda hiçbir zaman başka bir isteğin verisi görünmez. Hata durumunda veri BOŞ listeyle
 * değiştirilmez: hata ayrı döner.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], enabled = true): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<AppError | null>(null)
  const [loading, setLoading] = useState(enabled)
  const run = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const load = useCallback(() => {
    const id = ++run.current
    setLoading(true)
    setError(null)
    fnRef.current().then(
      (d) => { if (id === run.current) { setData(d); setLoading(false) } },
      (e) => { if (id === run.current) { setError(toAppError(e)); setLoading(false) } },
    )
  }, [])

  const refresh = useCallback(() => {
    const id = ++run.current
    fnRef.current().then((d) => { if (id === run.current) { setData(d); setLoading(false) } }, () => { if (id === run.current) setLoading(false) })
  }, [])

  useEffect(() => {
    if (!enabled) { run.current++; setLoading(false); return }
    setData(undefined)
    load()
    return () => { run.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  return { data, error, loading, reload: load, refresh }
}
