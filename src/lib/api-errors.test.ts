import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { siteConfig } from '../config/site'
import { toFunctionError } from './api'

const httpError = (status: number, body: string) => new FunctionsHttpError(new Response(body, { status }))

describe('Edge Function hata eşlemesi', () => {
  it('sunucunun hata kodunu Türkçe mesaja çevirir', async () => {
    const e = await toFunctionError(httpError(403, JSON.stringify({ error: 'captcha_failed' })))
    expect(e.code).toBe('captcha_failed')
    expect(e.message).toMatch(/Güvenlik doğrulaması/)
    expect((await toFunctionError(httpError(429, JSON.stringify({ error: 'rate_limited' })))).code).toBe('rate_limited')
    expect((await toFunctionError(httpError(409, JSON.stringify({ error: 'slot_unavailable' })))).code).toBe('slot_unavailable')
  })

  it('bilinmeyen veya JSON olmayan gövdeyi ham göstermeden genel hataya çevirir', async () => {
    expect((await toFunctionError(httpError(500, JSON.stringify({ error: 'relation x does not exist' })))).code).toBe('unknown')
    expect((await toFunctionError(httpError(502, '<html>Bad gateway</html>'))).code).toBe('try_again')
  })

  it('fonksiyona ulaşılamamasını (dağıtılmamış fonksiyon / CORS ön isteği 404) genel ağ hatasından ayırır', async () => {
    // Dağıtılmamış fonksiyonda Supabase OPTIONS isteğine 404 döner; tarayıcı fetch'i ağ hatasıyla düşürür.
    const e = await toFunctionError(new FunctionsFetchError(new TypeError('Failed to fetch')))
    expect(e.code).toBe('booking_service_unreachable')
    expect(e.message).toMatch(/Randevu servisine/)
  })
})

describe('KVKK yapılandırması', () => {
  it('aydınlatma metnindeki saklama kuralı günlük temizlik migration dosyasıyla tutarlıdır', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/0007_daily_cleanup.sql', import.meta.url), 'utf8')
    // Veritabanı: işletme gün başlangıcından önceki tüm randevular silinir
    expect(sql).toMatch(/delete from public\.appointments where starts_at < v_cutoff/)
    // Metin: aynı kuralı (gece 00:00'da silinme) söyler
    expect(siteConfig.privacy.retentionText).toContain('00.00')
    expect(siteConfig.privacy.retentionText).toContain('kalıcı biçimde silinir')
  })

  it('hukuki onay verilmeden metin onaylı işaretlenmemiştir', () => {
    expect(siteConfig.privacy.approved).toBe(false)
  })
})
