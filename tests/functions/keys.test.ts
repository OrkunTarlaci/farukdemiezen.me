// Edge Function anahtar seçimi: yeni (sb_secret_/sb_publishable_) ve eski (JWT) değişkenler.
import { describe, expect, it } from 'vitest'
import { resolvePublicKey, resolveServerKey } from '../../supabase/functions/_shared/keys.ts'

const env = (vars: Record<string, string>) => (name: string) => vars[name]

describe('sunucu anahtarı', () => {
  it('önce yeni SUPABASE_SECRET_KEYS içindeki "default" anahtarı kullanır', () => {
    const r = resolveServerKey(env({
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_yeni', diger: 'sb_secret_x' }),
      SUPABASE_SERVICE_ROLE_KEY: 'eski-jwt',
    }))
    expect(r).toEqual({ key: 'sb_secret_yeni', source: 'secret_keys' })
  })
  it('"default" yoksa sözlükteki ilk anahtarı kullanır', () => {
    expect(resolveServerKey(env({ SUPABASE_SECRET_KEYS: JSON.stringify({ ana: 'sb_secret_a' }) }))?.key).toBe('sb_secret_a')
  })
  it('yeni değişken yoksa, boşsa veya bozuksa eski SUPABASE_SERVICE_ROLE_KEY anahtarına döner', () => {
    for (const fresh of [undefined, '', '{}', 'bozuk-json', JSON.stringify({ default: '' })]) {
      const vars: Record<string, string> = { SUPABASE_SERVICE_ROLE_KEY: 'eski-jwt' }
      if (fresh !== undefined) vars.SUPABASE_SECRET_KEYS = fresh
      expect(resolveServerKey(env(vars))).toEqual({ key: 'eski-jwt', source: 'service_role' })
    }
  })
  it('hiçbiri yoksa null döner (fonksiyon açık bir yapılandırma hatası verir)', () => {
    expect(resolveServerKey(env({}))).toBeNull()
  })
})

describe('genel anahtar', () => {
  it('önce SUPABASE_PUBLISHABLE_KEYS, yoksa SUPABASE_ANON_KEY', () => {
    expect(resolvePublicKey(env({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_y' }), SUPABASE_ANON_KEY: 'eski' })))
      .toEqual({ key: 'sb_publishable_y', source: 'publishable_keys' })
    expect(resolvePublicKey(env({ SUPABASE_ANON_KEY: 'eski' }))).toEqual({ key: 'eski', source: 'anon' })
    expect(resolvePublicKey(env({}))).toBeNull()
  })
})
