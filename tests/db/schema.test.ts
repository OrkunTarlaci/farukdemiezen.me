// Gerçek bir Postgres motorunda (PGlite) migration'ları çalıştırıp iş kurallarını ve
// yetkileri doğrular. Supabase'e özgü parçalar (auth şeması, roller) küçük bir taslakla
// taklit edilir; gerçek Supabase üzerinde ayrıca doğrulama yapılmalıdır (README'ye bakın).
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'

const ADMIN_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'

const sql = (f: string) => readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8')

let db: PGlite
let serviceIds: Record<string, string>

async function setup(beforeOperations?: (db: PGlite) => Promise<void>) {
  db = new PGlite({ extensions: { btree_gist } })
  await db.exec(`
    create extension if not exists btree_gist;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to anon, authenticated, service_role;
  `)
  await db.exec(sql('migrations/0001_schema.sql'))
  await db.exec(sql('migrations/0002_realtime.sql'))
  await db.exec(sql('migrations/0003_security.sql'))
  await db.exec(sql('migrations/0004_admin_management.sql'))
  await db.exec(sql('seed.sql'))
  // Canlı projedeki sıra: 0001–0004 ve seed zaten uygulandı, 0005 sonradan uygulanır.
  if (beforeOperations) await beforeOperations(db)
  await db.exec(sql('migrations/0005_operations.sql'))
  await db.exec(sql('migrations/0006_test_flag_notifications.sql'))
  await db.exec(sql('migrations/0007_daily_cleanup.sql'))
  await db.exec(sql('migrations/0008_bulk_cancel.sql'))
  await db.exec(sql('migrations/0009_push_subscriptions.sql'))
  await db.exec(sql('migrations/0010_booking_limit_after_captcha.sql'))
  await db.exec(sql('migrations/0011_security_hardening.sql'))
  await db.exec(sql('migrations/0012_trusted_devices.sql'))
  await db.exec(`
    insert into auth.users values ('${ADMIN_ID}', 'faruk@example.com'), ('${USER_ID}', 'x@example.com');
    insert into admin_users values ('${ADMIN_ID}');
  `)
  const r = await db.query<{ id: string; name: string }>('select id, name from services')
  serviceIds = Object.fromEntries(r.rows.map((x) => [x.name, x.id]))
}

/** Bugünden itibaren en az 3 gün sonraki, verilen ISO hafta gününe (1=Pzt..7=Paz) denk gelen tarih. */
function futureDate(isoWeekday: number, minDaysAhead = 3): string {
  const istanbulNow = new Date(Date.now() + 3 * 3600_000)
  for (let i = minDaysAhead; i < minDaysAhead + 14; i++) {
    const d = new Date(Date.UTC(istanbulNow.getUTCFullYear(), istanbulNow.getUTCMonth(), istanbulNow.getUTCDate() + i))
    const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
    if (wd === isoWeekday) return d.toISOString().slice(0, 10)
  }
  throw new Error('no date')
}
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00+03:00`

async function book(opts: {
  service?: string; start: string; first?: string; last?: string; phone?: string; email?: string | null; note?: string | null
}) {
  const r = await db.query<{ create_appointment: any }>(
    'select create_appointment($1,$2,$3,$4,$5,$6,$7)',
    [serviceIds[opts.service ?? 'Saç Kesimi'], opts.start, opts.first ?? 'Ali', opts.last ?? 'Yılmaz',
     opts.phone ?? '0532 111 22 33', opts.email ?? null, opts.note ?? null],
  )
  return r.rows[0].create_appointment
}
async function expectError(p: Promise<unknown>, message: string) {
  await expect(p).rejects.toThrow(message)
}
async function slotsOf(date: string, service = 'Saç Kesimi') {
  const r = await db.query<{ slot_start: string }>('select slot_start from get_available_slots($1,$2) order by 1', [date, serviceIds[service]])
  // Istanbul yerel saate çevir
  return r.rows.map((x) => new Date(new Date(x.slot_start).getTime() + 3 * 3600_000).toISOString().slice(11, 16))
}
async function asRole(role: 'anon' | 'authenticated' | 'service_role', sub: string | null, fn: () => Promise<void>) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${sub ?? ''}', false); set role ${role};`)
  try { await fn() } finally { await db.exec('reset role;') }
}

beforeEach(async () => { await setup() }, 60_000)

describe('telefon normalizasyonu', () => {
  it('Türkiye cep numaralarını +905XXXXXXXXX biçimine çevirir', async () => {
    const f = async (p: string) => (await db.query<{ v: string | null }>('select normalize_tr_phone($1) v', [p])).rows[0].v
    expect(await f('0532 111 22 33')).toBe('+905321112233')
    expect(await f('532-111-22-33')).toBe('+905321112233')
    expect(await f('+90 532 111 22 33')).toBe('+905321112233')
    expect(await f('00905321112233')).toBe('+905321112233')
    expect(await f('0212 111 22 33')).toBeNull() // sabit hat
    expect(await f('12345')).toBeNull()
    expect(await f('abc')).toBeNull()
  })
})

describe('müsait saatler', () => {
  it('30 dk hizmet için 10:00–18:30 arası 18 başlangıç üretir', async () => {
    const s = await slotsOf(futureDate(3))
    expect(s).toHaveLength(18)
    expect(s[0]).toBe('10:00')
    expect(s[s.length - 1]).toBe('18:30')
  })

  it('50 dk hizmet kapanışı aşmaz (son başlangıç 18:00)', async () => {
    const s = await slotsOf(futureDate(3), 'Saç + Sakal')
    expect(s[s.length - 1]).toBe('18:00')
    expect(s).not.toContain('18:30')
  })

  it('kapalı günde (Pazar) saat üretmez', async () => {
    expect(await slotsOf(futureDate(7))).toEqual([])
  })

  it('13:00–13:50 randevusu varken çakışan başlangıçlar listelenmez', async () => {
    const d = futureDate(3)
    await book({ service: 'Saç + Sakal', start: at(d, '13:00') })
    const s30 = await slotsOf(d, 'Saç Kesimi')
    expect(s30).not.toContain('13:00')
    expect(s30).not.toContain('13:30') // 13:30 hâlâ 13:50'ye kadar dolu
    expect(s30).toContain('12:30') // 12:30–13:00 sınırda biter, çakışmaz
    expect(s30).toContain('14:00')
    const s50 = await slotsOf(d, 'Saç + Sakal')
    expect(s50).not.toContain('12:30') // 12:30–13:20 çakışır
    expect(s50).toContain('12:00')
  })

  it('mola ve bloklu dönemleri dışlar', async () => {
    const d = futureDate(3)
    await db.exec(`update working_hours set break_starts_at='13:00', break_ends_at='14:00' where weekday=3`)
    await db.query(`insert into blocked_periods (starts_at, ends_at, reason) values ($1,$2,'izin')`, [at(d, '16:00'), at(d, '17:00')])
    const s = await slotsOf(d)
    expect(s).not.toContain('13:00')
    expect(s).not.toContain('13:30')
    expect(s).toContain('12:30')
    expect(s).toContain('14:00')
    expect(s).not.toContain('16:00')
    expect(s).not.toContain('16:30')
    expect(s).toContain('17:00')
  })

  it('tarih seçici yalnızca uygun günleri döner', async () => {
    const from = futureDate(1, 1)
    const r = await db.query<{ day: Date }>('select day from get_available_dates($1,$2,$3)', [serviceIds['Saç Kesimi'], from, new Date(Date.parse(from) + 13 * 86400_000).toISOString().slice(0, 10)])
    const days = r.rows.map((x) => new Date(x.day).getUTCDay())
    expect(days.length).toBeGreaterThan(0)
    expect(days).not.toContain(0) // Pazar yok
  })
})

describe('rezervasyon oluşturma', () => {
  it('geçerli rezervasyonu kaydeder ve referans kodu döner', async () => {
    const d = futureDate(3)
    const r = await book({ start: at(d, '10:00'), note: 'Merhaba' })
    expect(r.reference_code).toMatch(/^FD-[A-Z0-9]{6}$/)
    expect(r.status).toBe('pending')
    const row = (await db.query<any>('select customer_phone, status from appointments')).rows[0]
    expect(row.customer_phone).toBe('+905321112233')
  })

  it('aynı saati ikinci kez almayı reddeder', async () => {
    const d = futureDate(3)
    await book({ start: at(d, '10:00') })
    await expectError(book({ start: at(d, '10:00'), phone: '0533 999 88 77' }), 'slot_unavailable')
  })

  it('çalışma saati dışı, kapalı gün, hizalanmamış ve geçmiş zamanı reddeder', async () => {
    const d = futureDate(3)
    await expectError(book({ start: at(d, '09:30') }), 'slot_invalid')
    await expectError(book({ start: at(d, '19:00') }), 'slot_invalid')
    await expectError(book({ service: 'Saç + Sakal', start: at(d, '18:30') }), 'slot_invalid')
    await expectError(book({ start: at(d, '10:15') }), 'slot_invalid')
    await expectError(book({ start: at(futureDate(7), '11:00') }), 'slot_invalid')
    const past = new Date(Date.now() - 86400_000).toISOString().slice(0, 10)
    await expectError(book({ start: at(past, '11:00') }), 'too_soon')
    const far = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10)
    await expectError(book({ start: at(far, '11:00') }), 'slot_invalid')
  })

  it('geçersiz müşteri bilgilerini reddeder', async () => {
    const d = futureDate(3)
    await expectError(book({ start: at(d, '10:00'), first: '   ' }), 'invalid_name')
    await expectError(book({ start: at(d, '10:00'), phone: '0212 111 22 33' }), 'invalid_phone')
    await expectError(book({ start: at(d, '10:00'), email: 'gecersiz' }), 'invalid_email')
    await expectError(book({ start: at(d, '10:00'), note: 'x'.repeat(301) }), 'invalid_note')
    expect((await db.query('select 1 from appointments')).rows).toHaveLength(0)
  })

  it('pasif hizmeti reddeder', async () => {
    await db.exec(`update services set is_active=false where name='Sakal Kesimi'`)
    await expectError(book({ service: 'Sakal Kesimi', start: at(futureDate(3), '10:00') }), 'service_unavailable')
  })

  it('aynı telefondan aktif randevu sayısını sınırlar', async () => {
    const d = futureDate(3)
    await book({ start: at(d, '10:00') })
    await book({ start: at(d, '11:00') })
    await book({ start: at(d, '12:00') })
    await expectError(book({ start: at(d, '13:00') }), 'too_many_bookings')
  })

  it('veritabanı kısıtı, fonksiyon dışından eklenen çakışmayı da engeller', async () => {
    const d = futureDate(3)
    await book({ start: at(d, '10:00') })
    await expect(
      db.query(
        `insert into appointments (reference_code, service_id, customer_first_name, customer_last_name, customer_phone, starts_at, ends_at)
         values ('FD-TEST01', $1, 'A', 'B', '+905321112233', $2, $3)`,
        [serviceIds['Saç Kesimi'], at(d, '10:15'), at(d, '10:45')],
      ),
    ).rejects.toThrow(/appointments_no_overlap|conflicting key/)
  })
})

describe('iptal ve yetkiler', () => {
  it('yönetici iptal edince saat yeniden açılır, kayıt silinmez', async () => {
    const d = futureDate(3)
    const r = await book({ start: at(d, '10:00') })
    const id = (await db.query<{ id: string }>('select id from appointments where reference_code=$1', [r.reference_code])).rows[0].id

    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query('select admin_set_appointment_status($1,$2)', [id, 'confirmed'])
    })
    expect((await db.query<any>('select status from appointments where id=$1', [id])).rows[0].status).toBe('confirmed')

    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query('select admin_set_appointment_status($1,$2)', [id, 'cancelled'])
      await expectError(db.query('select admin_set_appointment_status($1,$2)', [id, 'confirmed']), 'already_cancelled')
    })
    const row = (await db.query<any>('select status, cancelled_at from appointments where id=$1', [id])).rows[0]
    expect(row.status).toBe('cancelled')
    expect(row.cancelled_at).not.toBeNull()
    expect(await slotsOf(d)).toContain('10:00')
    // iptal edilen saat tekrar alınabilir
    await book({ start: at(d, '10:00'), phone: '0533 999 88 77' })
    const hist = (await db.query<any>('select old_status, new_status from appointment_status_history where appointment_id=$1 order by id', [id])).rows
    expect(hist.map((h: any) => h.new_status)).toEqual(['pending', 'confirmed', 'cancelled'])
  })

  it('yönetici olmayan kullanıcı durum değiştiremez', async () => {
    const d = futureDate(3)
    const r = await book({ start: at(d, '10:00') })
    const id = (await db.query<{ id: string }>('select id from appointments where reference_code=$1', [r.reference_code])).rows[0].id
    await asRole('authenticated', USER_ID, async () => {
      await expectError(db.query('select admin_set_appointment_status($1,$2)', [id, 'cancelled']), 'forbidden')
    })
    await asRole('anon', null, async () => {
      await expectError(db.query('select admin_set_appointment_status($1,$2)', [id, 'cancelled']), 'permission denied')
    })
  })

  it('anonim kullanıcı müşteri verisini okuyamaz, yapılandırmayı değiştiremez', async () => {
    const d = futureDate(3)
    await book({ start: at(d, '10:00') })
    await asRole('anon', null, async () => {
      await expectError(db.query('select * from appointments'), 'permission denied')
      await expectError(db.query('select * from blocked_periods'), 'permission denied')
      await expectError(db.query('select * from admin_users'), 'permission denied')
      await expectError(db.query(`update services set price_minor = 1`), 'permission denied')
      await expectError(db.query(`update working_hours set is_closed = true`), 'permission denied')
      await expectError(db.query(`insert into admin_users values ('${USER_ID}')`), 'permission denied')
      await expectError(db.query(`insert into appointments (reference_code) values ('X')`), 'permission denied')
      await expectError(db.query(`select check_slot(now(), 30)`), 'permission denied')
      // Herkese açık okuma çalışır
      expect((await db.query('select * from services')).rows.length).toBe(3)
      expect((await db.query('select * from working_hours')).rows.length).toBe(7)
      // Rezervasyon fonksiyonu anon için KAPALIDIR (yalnızca Edge Function / service_role)
      await expectError(book({ start: at(d, '11:00'), phone: '0533 999 88 77' }), 'permission denied')
    })
  })

  it('giriş yapmış ama yönetici olmayan kullanıcı randevuları göremez; yönetici görür', async () => {
    await book({ start: at(futureDate(3), '10:00') })
    await asRole('authenticated', USER_ID, async () => {
      expect((await db.query('select * from appointments')).rows).toHaveLength(0)
      await expectError(db.query(`update appointments set status='confirmed'`), 'permission denied')
    })
    await asRole('authenticated', ADMIN_ID, async () => {
      const rows = (await db.query<any>('select customer_first_name, customer_phone from appointments')).rows
      expect(rows).toHaveLength(1)
      expect(rows[0].customer_phone).toBe('+905321112233')
      await expectError(db.query(`update appointments set status='confirmed'`), 'permission denied')
    })
  })

  it('pasif hizmetler yalnızca yöneticiye görünür', async () => {
    await db.exec(`update services set is_active=false where name='Sakal Kesimi'`)
    await asRole('anon', null, async () => {
      expect((await db.query('select * from services')).rows).toHaveLength(2)
    })
    await asRole('authenticated', ADMIN_ID, async () => {
      expect((await db.query('select * from services')).rows).toHaveLength(3)
    })
  })
})

describe('CAPTCHA mimarisi: rezervasyon yalnızca service_role ile', () => {
  it('anon ve giriş yapmış kullanıcı create_appointment çağıramaz; service_role çağırabilir', async () => {
    const d = futureDate(3)
    await asRole('authenticated', USER_ID, async () => {
      await expectError(book({ start: at(d, '10:00') }), 'permission denied')
    })
    await asRole('service_role', null, async () => {
      const r = await book({ start: at(d, '10:00') })
      expect(r.reference_code).toMatch(/^FD-/)
      // Çakışma kontrolü service_role için de geçerlidir
      await expectError(book({ start: at(d, '10:00'), phone: '0533 999 88 77' }), 'slot_unavailable')
    })
  })

  it('iç fonksiyonlar ve özel tablolar istemciye kapalıdır', async () => {
    await asRole('anon', null, async () => {
      await expectError(db.query('select * from private_settings'), 'permission denied')
      await expectError(db.query('select * from rate_limit_counters'), 'permission denied')
      await expectError(db.query(`select rate_limit_hit('x','y',1,60)`), 'permission denied')
      await expectError(db.query(`select booking_rate_limit_hit('1.2.3.4')`), 'permission denied')
      await expectError(db.query('select booking_global_limit_hit()'), 'permission denied')
      await expectError(db.query('select purge_expired_customer_data()'), 'permission denied')
      await expectError(db.query(`select delete_customer_data('05321112233')`), 'permission denied')
      await expectError(db.query(`select * from available_slots_internal(current_date, gen_random_uuid())`), 'permission denied')
    })
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(db.query('select * from private_settings'), 'permission denied')
      await expectError(db.query('select purge_expired_customer_data()'), 'permission denied')
    })
  })
})

describe('anonim sorgu hız sınırı', () => {
  const setIp = (ip: string | null) =>
    db.query(`select set_config('request.headers', $1, false)`, [ip ? JSON.stringify({ 'x-forwarded-for': `${ip}, 10.0.0.1` }) : ''])
  const slotsAsAnon = async (date: string) => {
    let n = 0
    await asRole('anon', null, async () => {
      n = (await db.query('select * from get_available_slots($1,$2)', [date, serviceIds['Saç Kesimi']])).rows.length
    })
    return n
  }

  it('IP başına sınırı uygular, diğer IP etkilenmez, reddedilen istek sayılmaz', async () => {
    await db.exec('update private_settings set public_queries_per_ip_per_minute = 3')
    const d = futureDate(3)
    await setIp('203.0.113.7')
    for (let i = 0; i < 3; i++) expect(await slotsAsAnon(d)).toBe(18)
    await expectError(slotsAsAnon(d), 'rate_limited')
    await expectError(slotsAsAnon(d), 'rate_limited')
    await setIp('198.51.100.9')
    expect(await slotsAsAnon(d)).toBe(18)
    const hits = (await db.query<{ hits: number }>(`select hits from rate_limit_counters where bucket='public_query_ip' order by hits desc`)).rows
    expect(hits.map((h) => h.hits)).toEqual([3, 1])
  })

  it('genel sınır farklı IP adreslerinden gelen toplu istekleri de durdurur', async () => {
    await db.exec('update private_settings set public_queries_global_per_minute = 2')
    const d = futureDate(3)
    await setIp('203.0.113.1'); await slotsAsAnon(d)
    await setIp('203.0.113.2'); await slotsAsAnon(d)
    await setIp('203.0.113.3')
    await expectError(slotsAsAnon(d), 'rate_limited')
  })

  it('ham IP saklanmaz, yalnızca tuzlanmış özet tutulur', async () => {
    await setIp('203.0.113.7')
    await slotsAsAnon(futureDate(3))
    const rows = (await db.query<{ key_hash: string }>('select key_hash from rate_limit_counters')).rows
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.key_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(r.key_hash).not.toContain('203.0.113.7')
    }
  })

  it('uzun tarih aralığı daha fazla birim harcar; 92 günden uzun aralık reddedilir', async () => {
    await db.exec('update private_settings set public_queries_per_ip_per_minute = 3')
    await setIp('203.0.113.7')
    const from = futureDate(1, 1)
    const to = new Date(Date.parse(from) + 62 * 86400_000).toISOString().slice(0, 10)
    await asRole('anon', null, async () => {
      await db.query('select * from get_available_dates($1,$2,$3)', [serviceIds['Saç Kesimi'], from, to]) // 3 birim
      await expectError(db.query('select * from get_available_dates($1,$2,$3)', [serviceIds['Saç Kesimi'], from, from]), 'rate_limited')
      const tooFar = new Date(Date.parse(from) + 93 * 86400_000).toISOString().slice(0, 10)
      await expectError(db.query('select * from get_available_dates($1,$2,$3)', [serviceIds['Saç Kesimi'], from, tooFar]), 'invalid_range')
    })
  })

  it('rezervasyon denemesi sınırı IP başına çalışır', async () => {
    await db.exec('update private_settings set bookings_per_ip_per_hour = 2')
    await asRole('service_role', null, async () => {
      const hit = async (ip: string) =>
        (await db.query<{ ok: boolean }>('select booking_rate_limit_hit($1) ok', [ip])).rows[0].ok
      expect(await hit('203.0.113.7')).toBe(true)
      expect(await hit('203.0.113.7')).toBe(true)
      expect(await hit('203.0.113.7')).toBe(false)
      expect(await hit('198.51.100.9')).toBe(true)
    })
  })

  it('IP denemeleri genel sayacı doldurmaz; genel sınır ayrı sayılır (0010)', async () => {
    await db.exec('update private_settings set bookings_per_ip_per_hour = 10, bookings_global_per_hour = 3')
    await asRole('service_role', null, async () => {
      const hit = async (ip: string) =>
        (await db.query<{ ok: boolean }>('select booking_rate_limit_hit($1) ok', [ip])).rows[0].ok
      const global = async () =>
        (await db.query<{ ok: boolean }>('select booking_global_limit_hit() ok')).rows[0].ok
      for (let i = 1; i <= 6; i++) for (let k = 0; k < 10; k++) await hit(`198.51.100.${i}`)
      expect(await hit('203.0.113.77')).toBe(true) // gerçek müşteri kilitlenmez
      expect([await global(), await global(), await global(), await global()]).toEqual([true, true, true, false])
    })
  })

  it('authenticated genel sayacı çağıramaz', async () => {
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(db.query('select booking_global_limit_hit()'), 'permission denied')
    })
  })
})

describe('müsait günler (erken çıkışlı hesap)', () => {
  it('get_available_dates, get_available_slots ile aynı günleri verir; tamamen bloklu gün çıkar', async () => {
    const from = futureDate(1, 1)
    const to = new Date(Date.parse(from) + 9 * 86400_000).toISOString().slice(0, 10)
    const blockedDay = futureDate(3, 1)
    await db.query(`insert into blocked_periods (starts_at, ends_at) values ($1,$2)`, [at(blockedDay, '00:00'), at(blockedDay, '23:59')])
    const dates = (await db.query<{ day: Date }>('select day from get_available_dates($1,$2,$3)', [serviceIds['Saç Kesimi'], from, to]))
      .rows.map((r) => new Date(r.day).toISOString().slice(0, 10))
    const expected: string[] = []
    for (let i = 0; i <= 9; i++) {
      const d = new Date(Date.parse(from) + i * 86400_000).toISOString().slice(0, 10)
      if ((await slotsOf(d)).length > 0) expected.push(d)
    }
    expect(dates).toEqual(expected)
    expect(dates).not.toContain(blockedDay)
  })
})

describe('KVKK: saklama süresi ve silme', () => {
  async function insertPast(daysAgo: number, phone = '+905321112233') {
    const start = new Date(Date.now() - daysAgo * 86400_000)
    const end = new Date(start.getTime() + 30 * 60000)
    await db.query(
      `insert into appointments (reference_code, service_id, customer_first_name, customer_last_name, customer_phone, starts_at, ends_at)
       values ($1, $2, 'Eski', 'Kayıt', $3, $4, $5)`,
      [`FD-OLD${daysAgo}`, serviceIds['Saç Kesimi'], phone, start.toISOString(), end.toISOString()],
    )
  }

  it('saklama süresi dolan randevuları ve geçmişlerini siler, diğerlerine dokunmaz', async () => {
    await db.exec('update private_settings set customer_data_retention_days = 30')
    await insertPast(40)
    await insertPast(10)
    await book({ start: at(futureDate(3), '10:00') })
    const n = (await db.query<{ n: number }>('select purge_expired_customer_data() n')).rows[0].n
    expect(n).toBe(1)
    const left = (await db.query<{ reference_code: string }>('select reference_code from appointments order by starts_at')).rows
    expect(left).toHaveLength(2)
    expect(left.map((r) => r.reference_code)).not.toContain('FD-OLD40')
    const orphan = (await db.query('select 1 from appointment_status_history h left join appointments a on a.id = h.appointment_id where a.id is null')).rows
    expect(orphan).toHaveLength(0)
  })

  it('silme talebinde telefon hangi biçimde yazılırsa yazılsın o kişinin tüm kayıtlarını siler', async () => {
    await insertPast(5)
    await book({ start: at(futureDate(3), '10:00') })
    await book({ start: at(futureDate(3), '11:00'), phone: '0533 999 88 77' })
    const n = (await db.query<{ n: number }>(`select delete_customer_data('+90 (532) 111 22 33') n`)).rows[0].n
    expect(n).toBe(2)
    const phones = (await db.query<{ customer_phone: string }>('select customer_phone from appointments')).rows
    expect(phones).toEqual([{ customer_phone: '+905339998877' }])
    await expectError(db.query(`select delete_customer_data('abc')`), 'invalid_phone')
  })
})

describe('yönetim paneli yazma yetkileri (0004)', () => {
  const svcInsert = `insert into services (name, duration_minutes, price_minor, sort_order) values ('Çocuk Kesimi', 25, 30000, 4)`

  it('yönetici hizmet ekler ve düzenler; değişiklik müsait saatlere yansır', async () => {
    const d = futureDate(3)
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query(svcInsert)
      await db.query(`update services set duration_minutes = 60 where name = 'Saç Kesimi'`)
      await db.query(`update services set is_active = false where name = 'Sakal Kesimi'`)
    })
    expect((await db.query(`select 1 from services where name = 'Çocuk Kesimi'`)).rows).toHaveLength(1)
    // 60 dk hizmet 19:00 kapanışta son başlangıç 18:00 olur
    const s = await slotsOf(d, 'Saç Kesimi')
    expect(s[s.length - 1]).toBe('18:00')
    // Pasif hizmet için saat üretilmez ve rezervasyon reddedilir
    expect(await slotsOf(d, 'Sakal Kesimi')).toEqual([])
    await expectError(book({ service: 'Sakal Kesimi', start: at(d, '10:00') }), 'service_unavailable')
  })

  it('yönetici olmayan kullanıcı ve anon hizmet ekleyemez veya değiştiremez', async () => {
    await asRole('authenticated', USER_ID, async () => {
      await expectError(db.query(svcInsert), 'row-level security')
      const r = await db.query(`update services set price_minor = 1 where name = 'Saç Kesimi'`)
      expect(r.affectedRows).toBe(0) // RLS satırı gizler
    })
    await asRole('anon', null, async () => {
      await expectError(db.query(svcInsert), 'permission denied')
      await expectError(db.query(`update services set price_minor = 1`), 'permission denied')
      await expectError(db.query(`update business_settings set address = 'x'`), 'permission denied')
      await expectError(db.query(`delete from blocked_periods`), 'permission denied')
    })
    expect((await db.query<{ price_minor: number | null }>(`select price_minor from services where name = 'Saç Kesimi'`)).rows[0].price_minor).toBe(70000)
  })

  it('yönetici bile izin verilmeyen sütunları yazamaz ve hizmet silemez', async () => {
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(db.query(`update business_settings set timezone = 'UTC'`), 'permission denied')
      await expectError(db.query(`update business_settings set currency = 'USD'`), 'permission denied')
      await expectError(db.query(`update services set id = gen_random_uuid()`), 'permission denied')
      await expectError(db.query(`delete from services`), 'permission denied')
      await expectError(db.query(`update working_hours set weekday = 8 where weekday = 1`), 'permission denied')
    })
  })

  it('geçersiz değerler veritabanında reddedilir', async () => {
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(db.query(`update services set price_minor = -1 where name = 'Saç Kesimi'`), 'check constraint')
      await expectError(db.query(`update services set duration_minutes = 0 where name = 'Saç Kesimi'`), 'check constraint')
      await expectError(db.query(`update services set name = '' where name = 'Saç Kesimi'`), 'check constraint')
      await expectError(db.query(`update business_settings set map_url = 'javascript:alert(1)'`), 'check constraint')
      await expectError(db.query(`update business_settings set booking_interval_minutes = 0`), 'check constraint')
      await expectError(db.query(`update business_settings set maximum_booking_horizon_days = 400`), 'check constraint')
      await expectError(db.query(`update working_hours set opens_at = '20:00', closes_at = '10:00' where weekday = 1`), 'check constraint')
      await expectError(db.query(`update working_hours set break_starts_at = '13:00' where weekday = 1`), 'check constraint')
      await expectError(db.query(`insert into blocked_periods (starts_at, ends_at) values (now(), now() - interval '1 hour')`), 'check constraint')
      // Geçerli https bağlantısı kabul edilir
      await db.query(`update business_settings set map_url = 'https://maps.google.com/?q=x'`)
    })
  })

  it('çalışma saati ve kapalı dönem değişiklikleri rezervasyon motoruna yansır', async () => {
    const d = futureDate(3) // Çarşamba
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query(`update working_hours set break_starts_at = '13:00', break_ends_at = '14:00' where weekday = 3`)
    })
    let s = await slotsOf(d)
    expect(s).not.toContain('13:00')
    expect(s).toContain('14:00')

    let blockId = ''
    await asRole('authenticated', ADMIN_ID, async () => {
      blockId = (await db.query<{ id: string }>(
        `insert into blocked_periods (starts_at, ends_at, reason) values ($1, $2, 'İzin') returning id`,
        [at(d, '00:00'), at(d, '23:59')],
      )).rows[0].id
    })
    expect(await slotsOf(d)).toEqual([])
    await expectError(book({ start: at(d, '10:00') }), 'slot_unavailable')

    await asRole('authenticated', USER_ID, async () => {
      expect((await db.query(`delete from blocked_periods where id = $1`, [blockId])).affectedRows).toBe(0)
    })
    await asRole('authenticated', ADMIN_ID, async () => {
      expect((await db.query(`delete from blocked_periods where id = $1`, [blockId])).affectedRows).toBe(1)
      await db.query(`update working_hours set is_closed = true where weekday = 3`)
    })
    expect(await slotsOf(d)).toEqual([])
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query(`update working_hours set is_closed = false where weekday = 3`)
    })
    s = await slotsOf(d)
    expect(s.length).toBeGreaterThan(0)
  })

  it('rezervasyon kuralı ayarları sunucu kurallarını değiştirir', async () => {
    const d = futureDate(3)
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query(`update business_settings set booking_interval_minutes = 60, max_active_bookings_per_phone = 1`)
    })
    const s = await slotsOf(d)
    expect(s[0]).toBe('10:00')
    expect(s).not.toContain('10:30')
    await expectError(book({ start: at(d, '10:30') }), 'slot_invalid')
    await book({ start: at(d, '11:00') })
    await expectError(book({ start: at(d, '12:00') }), 'too_many_bookings')
  })
})

describe('fiyatlar ve randevu anındaki fiyat kaydı (0005)', () => {
  const priceOf = async (name: string) =>
    (await db.query<{ price_minor: number | null }>('select price_minor from services where name = $1', [name])).rows[0].price_minor

  it('başlangıç fiyatları kuruş cinsinden kayıtlıdır (700 / 500 / 900 TL)', async () => {
    expect(await priceOf('Saç Kesimi')).toBe(70000)
    expect(await priceOf('Sakal Kesimi')).toBe(50000)
    expect(await priceOf('Saç + Sakal')).toBe(90000)
    expect((await db.query('select 1 from services')).rows).toHaveLength(3)
  })

  it('0005 yalnızca boş fiyatları doldurur, panelden girilmiş fiyatın üzerine yazmaz, kopya oluşturmaz', async () => {
    await setup(async (d) => {
      await d.exec(`update services set price_minor = null; update services set price_minor = 75000 where name = 'Saç Kesimi'`)
    })
    expect(await priceOf('Saç Kesimi')).toBe(75000)
    expect(await priceOf('Sakal Kesimi')).toBe(50000)
    expect(await priceOf('Saç + Sakal')).toBe(90000)
    // seed tekrar çalıştırılsa da hizmet çoğalmaz
    await db.exec(sql('seed.sql'))
    expect((await db.query('select 1 from services')).rows).toHaveLength(3)
  })

  it('rezervasyon hizmet adını ve fiyatı sunucuda kaydeder; sonraki fiyat değişikliği geçmişi değiştirmez', async () => {
    const d = futureDate(3)
    const r = await book({ start: at(d, '10:00') })
    expect(r.price_minor).toBe(70000)
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query(`update services set price_minor = 75000, name = 'Saç Kesimi (Yeni)' where name = 'Saç Kesimi'`)
    })
    const row = (await db.query<{ service_name: string; price_minor: number }>(
      'select service_name, price_minor from appointments where reference_code = $1', [r.reference_code],
    )).rows[0]
    expect(row).toEqual({ service_name: 'Saç Kesimi', price_minor: 70000 })
    // Yeni rezervasyon yeni fiyatı ve adı alır (serviceIds eski ada göre tutulur; kimlik aynıdır)
    const r2 = await book({ service: 'Saç Kesimi', start: at(d, '11:00'), phone: '0533 999 88 77' })
    expect(r2.price_minor).toBe(75000)
    expect(r2.service_name).toBe('Saç Kesimi (Yeni)')
  })

  it('yönetici işletme adını değiştirebilir, boş ad reddedilir', async () => {
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query(`update business_settings set business_name = 'Faruk Demirezen Kuaför'`)
      await expectError(db.query(`update business_settings set business_name = '   '`), 'check constraint')
    })
    await asRole('authenticated', USER_ID, async () => {
      expect((await db.query(`update business_settings set business_name = 'x'`)).affectedRows).toBe(0)
    })
    expect((await db.query<{ business_name: string }>('select business_name from business_settings')).rows[0].business_name).toBe('Faruk Demirezen Kuaför')
  })
})

describe('randevu durumları: tamamlandı ve gelmedi (0005)', () => {
  async function insertPastAppointment() {
    const start = new Date(Date.now() - 2 * 3600_000)
    const end = new Date(start.getTime() + 30 * 60000)
    return (await db.query<{ id: string }>(
      `insert into appointments (reference_code, service_id, service_name, price_minor, customer_first_name, customer_last_name, customer_phone, starts_at, ends_at, status)
       values ('FD-PAST01', $1, 'Saç Kesimi', 70000, 'Ali', 'Yılmaz', '+905321112233', $2, $3, 'confirmed') returning id`,
      [serviceIds['Saç Kesimi'], start.toISOString(), end.toISOString()],
    )).rows[0].id
  }
  const setStatus = (id: string, status: string) => db.query('select admin_set_appointment_status($1,$2)', [id, status])
  const statusOf = async (id: string) => (await db.query<{ status: string }>('select status from appointments where id=$1', [id])).rows[0].status

  it('saati gelmiş randevu tamamlandı veya gelmedi olarak işaretlenir ve geçmişe kaydedilir', async () => {
    const id = await insertPastAppointment()
    await asRole('authenticated', ADMIN_ID, async () => {
      await setStatus(id, 'completed')
      await setStatus(id, 'no_show') // düzeltme
      await setStatus(id, 'completed')
    })
    expect(await statusOf(id)).toBe('completed')
    const hist = (await db.query<{ new_status: string }>('select new_status from appointment_status_history where appointment_id=$1 order by id', [id])).rows
    expect(hist.map((h) => h.new_status)).toEqual(['confirmed', 'completed', 'no_show', 'completed'])
  })

  it('geçersiz geçişleri reddeder', async () => {
    const past = await insertPastAppointment()
    const future = (await db.query<{ id: string }>('select id from appointments where reference_code=$1', [(await book({ start: at(futureDate(3), '10:00') })).reference_code])).rows[0].id
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(setStatus(future, 'completed'), 'not_started')
      await expectError(setStatus(future, 'no_show'), 'not_started')
      await expectError(setStatus(future, 'archived'), 'invalid_status')
      await setStatus(past, 'completed')
      await expectError(setStatus(past, 'cancelled'), 'invalid_transition')
      await expectError(setStatus(past, 'confirmed'), 'invalid_transition')
      await setStatus(future, 'confirmed')
      await setStatus(future, 'confirmed') // tekrar onaylamak zararsızdır
      await setStatus(future, 'cancelled')
      await expectError(setStatus(future, 'confirmed'), 'already_cancelled')
    })
    await asRole('authenticated', USER_ID, async () => {
      await expectError(setStatus(past, 'no_show'), 'forbidden')
    })
  })

  it('tamamlanan randevu telefon başına aktif randevu sınırına sayılmaz', async () => {
    await db.exec('update business_settings set max_active_bookings_per_phone = 1')
    await insertPastAppointment()
    await book({ start: at(futureDate(3), '10:00') })
    await expectError(book({ start: at(futureDate(3), '11:00') }), 'too_many_bookings')
  })
})

describe('yeniden planlama (0005)', () => {
  const idOf = async (code: string) => (await db.query<{ id: string }>('select id from appointments where reference_code=$1', [code])).rows[0].id
  const adminSlots = async (id: string, date: string) => {
    let out: string[] = []
    await asRole('authenticated', ADMIN_ID, async () => {
      const r = await db.query<{ slot_start: string }>('select slot_start from admin_available_slots($1,$2) order by 1', [id, date])
      out = r.rows.map((x) => new Date(new Date(x.slot_start).getTime() + 3 * 3600_000).toISOString().slice(11, 16))
    })
    return out
  }

  it('randevunun kendi saatini müsait sayar, diğer randevuları ve kuralları dikkate alır', async () => {
    const d = futureDate(3)
    const a = await idOf((await book({ start: at(d, '10:00') })).reference_code)
    await book({ start: at(d, '11:00'), phone: '0533 999 88 77' })
    const s = await adminSlots(a, d)
    expect(s).toContain('10:00')
    expect(s).not.toContain('11:00')
    expect(s).toContain('12:00')
  })

  it('çakışmaya, kurala aykırı saate ve iptal edilmiş randevuya izin vermez; geçerli saate taşır', async () => {
    const d = futureDate(3)
    const a = await idOf((await book({ start: at(d, '10:00') })).reference_code)
    await book({ start: at(d, '11:00'), phone: '0533 999 88 77' })
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(db.query('select admin_reschedule_appointment($1,$2)', [a, at(d, '11:00')]), 'slot_unavailable')
      await expectError(db.query('select admin_reschedule_appointment($1,$2)', [a, at(d, '10:15')]), 'slot_invalid')
      await expectError(db.query('select admin_reschedule_appointment($1,$2)', [a, at(futureDate(7), '11:00')]), 'slot_invalid')
      await db.query('select admin_reschedule_appointment($1,$2)', [a, at(d, '12:00')])
    })
    const row = (await db.query<{ starts_at: Date; ends_at: Date }>('select starts_at, ends_at from appointments where id=$1', [a])).rows[0]
    expect(new Date(row.starts_at).toISOString()).toBe(new Date(at(d, '12:00')).toISOString())
    expect(new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()).toBe(30 * 60000)
    // Eski saat müşterilere yeniden açılır
    expect(await slotsOf(d)).toContain('10:00')
    expect(await slotsOf(d)).not.toContain('12:00')

    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query('select admin_set_appointment_status($1,$2)', [a, 'cancelled'])
      await expectError(db.query('select admin_reschedule_appointment($1,$2)', [a, at(d, '14:00')]), 'invalid_transition')
    })
  })

  it('yönetici olmayan ve anonim kullanıcı yeniden planlayamaz', async () => {
    const d = futureDate(3)
    const a = await idOf((await book({ start: at(d, '10:00') })).reference_code)
    await asRole('authenticated', USER_ID, async () => {
      await expectError(db.query('select admin_reschedule_appointment($1,$2)', [a, at(d, '12:00')]), 'forbidden')
      await expectError(db.query('select * from admin_available_slots($1,$2)', [a, d]), 'forbidden')
    })
    await asRole('anon', null, async () => {
      await expectError(db.query('select admin_reschedule_appointment($1,$2)', [a, at(d, '12:00')]), 'permission denied')
      await expectError(db.query(`select check_slot(now(), 30, null)`), 'permission denied')
    })
  })
})

describe('eşzamanlı rezervasyon', () => {
  it('aynı saate aynı anda gelen iki istekten yalnızca biri başarılı olur', async () => {
    // Not: PGlite tek bağlantılıdır; istekler veritabanında sıraya girer. Gerçek paralellik canlıda
    // advisory lock + EXCLUDE kısıtıyla sağlanır (bkz. "veritabanı kısıtı ... çakışmayı da engeller").
    const d = futureDate(3)
    const results = await Promise.allSettled([
      book({ start: at(d, '10:00') }),
      book({ start: at(d, '10:00'), phone: '0533 999 88 77' }),
      book({ service: 'Saç + Sakal', start: at(d, '10:00'), phone: '0534 111 22 33' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    for (const r of rejected) expect(String(r.reason)).toMatch(/slot_unavailable/)
    expect((await db.query(`select 1 from appointments where status <> 'cancelled'`)).rows).toHaveLength(1)
  })
})

describe('test randevusu ve bildirim kuyruğu (0006)', () => {
  const idOf = async (code: string) => (await db.query<{ id: string }>('select id from appointments where reference_code=$1', [code])).rows[0].id
  const logs = async (id: string) =>
    (await db.query<{ kind: string; status: string }>('select kind, status from notification_logs where appointment_id=$1 order by id', [id])).rows
  const bookTest = async (start: string) => {
    const r = await db.query<{ create_appointment: any }>(
      'select create_appointment($1,$2,$3,$4,$5,null,null,true)',
      [serviceIds['Saç Kesimi'], start, 'Test', 'Kişi', '0532 111 22 33'],
    )
    return r.rows[0].create_appointment
  }

  it('rezervasyon "talep alındı" bildirimini aynı işlemde kuyruğa ekler; test işaretini sunucu belirler', async () => {
    const d = futureDate(3)
    const r = await book({ start: at(d, '10:00') })
    expect(r.is_test).toBe(false)
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await logs(r.id)).toEqual([{ kind: 'booking_received', status: 'pending' }])
    const t = await bookTest(at(d, '11:00'))
    expect(t.is_test).toBe(true)
    expect((await db.query<{ is_test: boolean }>('select is_test from appointments where id=$1', [t.id])).rows[0].is_test).toBe(true)
  })

  it('onay ve iptal bildirim üretir, tekrar onay yinelenen bildirim üretmez, tamamlandı üretmez', async () => {
    const d = futureDate(3)
    const id = await idOf((await book({ start: at(d, '10:00') })).reference_code)
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query('select admin_set_appointment_status($1,$2)', [id, 'confirmed'])
      await db.query('select admin_set_appointment_status($1,$2)', [id, 'confirmed'])
      await db.query('select admin_set_appointment_status($1,$2)', [id, 'cancelled'])
    })
    expect((await logs(id)).map((l) => l.kind)).toEqual(['booking_received', 'confirmed', 'cancelled'])
  })

  it('her yeniden planlama ayrı bildirim üretir', async () => {
    const d = futureDate(3)
    const id = await idOf((await book({ start: at(d, '10:00') })).reference_code)
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query('select admin_reschedule_appointment($1,$2)', [id, at(d, '12:00')])
      await db.query('select admin_reschedule_appointment($1,$2)', [id, at(d, '14:00')])
    })
    expect((await logs(id)).map((l) => l.kind)).toEqual(['booking_received', 'rescheduled', 'rescheduled'])
  })

  it('gönderim kaydı iki kez alınamaz; gönderilen tekrar kuyruğa alınamaz; başarısız olan yeniden denenebilir', async () => {
    const d = futureDate(3)
    const r = await book({ start: at(d, '10:00') })
    let claimed: { id: number }[] = []
    await asRole('service_role', null, async () => {
      claimed = (await db.query<{ id: number }>('select id from claim_notifications($1)', [r.id])).rows
      expect(claimed).toHaveLength(1)
      expect((await db.query('select id from claim_notifications($1)', [r.id])).rows).toHaveLength(0)
      await db.query(`select finish_notification($1,'failed','test',null,'timeout')`, [claimed[0].id])
    })
    expect(await logs(r.id)).toEqual([{ kind: 'booking_received', status: 'failed' }])
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query('select admin_requeue_notification($1)', [claimed[0].id])
    })
    await asRole('service_role', null, async () => {
      const again = (await db.query<{ id: number; attempts: number }>('select id, attempts from claim_notifications($1)', [r.id])).rows
      expect(again[0].attempts).toBe(2)
      await db.query(`select finish_notification($1,'sent','test','MSG-1',null)`, [again[0].id])
    })
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(db.query('select admin_requeue_notification($1)', [claimed[0].id]), 'invalid_transition')
    })
    expect(await logs(r.id)).toEqual([{ kind: 'booking_received', status: 'sent' }])
  })

  it('bildirim kayıtlarını yalnızca yönetici okur; kuyruk fonksiyonları istemciye kapalıdır', async () => {
    const r = await book({ start: at(futureDate(3), '10:00') })
    await asRole('authenticated', ADMIN_ID, async () => {
      expect((await db.query('select * from notification_logs')).rows).toHaveLength(1)
      await expectError(db.query('select * from claim_notifications(null)'), 'permission denied')
    })
    await asRole('authenticated', USER_ID, async () => {
      expect((await db.query('select * from notification_logs')).rows).toHaveLength(0)
      await expectError(db.query('select admin_requeue_notification(1)'), 'forbidden')
      await expectError(db.query(`select enqueue_notification($1,'confirmed','x')`, [r.id]), 'permission denied')
    })
    await asRole('anon', null, async () => {
      await expectError(db.query('select * from notification_logs'), 'permission denied')
      await expectError(db.query(`select finish_notification(1,'sent','x')`), 'permission denied')
      await expectError(
        db.query('select create_appointment($1,$2,$3,$4,$5,null,null,true)', [serviceIds['Saç Kesimi'], at(futureDate(3), '12:00'), 'A', 'B', '0532 111 22 33']),
        'permission denied',
      )
    })
  })

  it('yönetici yalnızca test randevusunu silebilir; bildirim kayıtları da silinir', async () => {
    const d = futureDate(3)
    const real = await book({ start: at(d, '10:00') })
    const test = await bookTest(at(d, '11:00'))
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(db.query('select admin_delete_test_appointment($1)', [real.id]), 'not_test')
      await db.query('select admin_delete_test_appointment($1)', [test.id])
    })
    await asRole('authenticated', USER_ID, async () => {
      await expectError(db.query('select admin_delete_test_appointment($1)', [real.id]), 'forbidden')
    })
    expect((await db.query('select 1 from appointments where id=$1', [test.id])).rows).toHaveLength(0)
    expect((await db.query('select 1 from notification_logs where appointment_id=$1', [test.id])).rows).toHaveLength(0)
    expect((await db.query('select 1 from appointments where id=$1', [real.id])).rows).toHaveLength(1)
  })
})

describe('şema teşhis sorgusu (supabase/diagnostics/schema_check.sql)', () => {
  it('tüm migration\'lar uygulanmış veritabanında her kontrol TAMAM döner (Realtime yayını PGlite\'ta yok)', async () => {
    const rows = (await db.query<{ migration: string; kontrol: string; durum: string }>(sql('diagnostics/schema_check.sql'))).rows
    expect(rows.length).toBeGreaterThan(25)
    const missing = rows.filter((r) => r.durum !== 'TAMAM').map((r) => `${r.migration}: ${r.kontrol}`)
    expect(missing).toEqual(['0002: appointments Realtime yayınında', '0007: pg_cron eklentisi etkin'])
  })

  it('veritabanında hiçbir şeyi değiştirmez', async () => {
    const before = (await db.query<{ n: number }>('select count(*)::int n from appointments')).rows[0].n
    await db.query(sql('diagnostics/schema_check.sql'))
    expect((await db.query<{ n: number }>('select count(*)::int n from appointments')).rows[0].n).toBe(before)
  })
})

describe('toplu iptal (0008)', () => {
  const idOf = async (code: string) =>
    (await db.query<{ id: string }>('select id from appointments where reference_code=$1', [code])).rows[0].id
  const bulk = async (ids: string[], reason: string | null) =>
    (await db.query<{ r: any }>('select admin_bulk_cancel($1::uuid[], $2) r', [ids, reason])).rows[0].r

  it('iptali, nedeni ve durum geçmişini veritabanına yazar; uygun olmayanları atlar', async () => {
    const d = futureDate(3)
    const a = await idOf((await book({ start: at(d, '15:00') })).reference_code)
    const b = await idOf((await book({ start: at(d, '16:00'), phone: '0533 222 33 44' })).reference_code)
    const c = await idOf((await book({ start: at(d, '17:00'), phone: '0533 222 33 45' })).reference_code)
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query('select admin_set_appointment_status($1,$2)', [c, 'cancelled'])
      const out = await bulk([a, b, c, a], '  Acil   hastane ziyareti ')
      expect(out).toHaveLength(3) // tekrarlanan kimlik bir kez işlenir
      expect(out.filter((r: any) => !r.ok)).toEqual([{ id: c, ok: false, code: 'already_cancelled' }])
      expect(out.filter((r: any) => r.ok).map((r: any) => r.id).sort()).toEqual([a, b].sort())
    })
    const rows = (await db.query<any>(
      'select id, status, cancelled_at, cancellation_reason, cancel_notice_opened_at from appointments where id = any($1::uuid[]) order by starts_at', [[a, b, c]],
    )).rows
    expect(rows.map((r: any) => [r.status, r.cancellation_reason])).toEqual([
      ['cancelled', 'Acil hastane ziyareti'], ['cancelled', 'Acil hastane ziyareti'], ['cancelled', null],
    ])
    expect(rows.every((r: any) => r.cancelled_at && r.cancel_notice_opened_at === null)).toBe(true)
    const hist = (await db.query<any>('select new_status from appointment_status_history where appointment_id=$1 order by id', [a])).rows
    expect(hist.map((h: any) => h.new_status)).toEqual(['pending', 'cancelled'])
    expect(await slotsOf(d)).toContain('15:00') // iptal edilen saat yeniden açılır
  })

  it('ikinci çalıştırma (ör. başka cihazdan) aynı randevuyu tekrar iptal etmez, nedeni değiştirmez', async () => {
    const a = await idOf((await book({ start: at(futureDate(3), '15:00') })).reference_code)
    await asRole('authenticated', ADMIN_ID, async () => {
      await bulk([a], 'İlk neden')
      expect(await bulk([a], 'İkinci neden')).toEqual([{ id: a, ok: false, code: 'already_cancelled' }])
    })
    expect((await db.query<any>('select cancellation_reason from appointments where id=$1', [a])).rows[0].cancellation_reason).toBe('İlk neden')
  })

  it('neden zorunludur; tamamlanmış randevu iptal edilmez', async () => {
    const a = await idOf((await book({ start: at(futureDate(3), '15:00') })).reference_code)
    await db.query(`update appointments set status='completed' where id=$1`, [a])
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(bulk([a], '   '), 'reason_required')
      await expectError(bulk([], 'x'), 'nothing_selected')
      expect(await bulk([a], 'x')).toEqual([{ id: a, ok: false, code: 'invalid_transition' }])
    })
  })

  it('"WhatsApp açıldı" işareti kalıcıdır ve ilk zaman korunur', async () => {
    const a = await idOf((await book({ start: at(futureDate(3), '15:00') })).reference_code)
    let first: string
    await asRole('authenticated', ADMIN_ID, async () => {
      await bulk([a], 'Neden')
      first = (await db.query<any>('select admin_mark_cancel_notice($1) v', [a])).rows[0].v
      const again = (await db.query<any>('select admin_mark_cancel_notice($1) v', [a])).rows[0].v
      expect(String(again)).toBe(String(first))
    })
    expect((await db.query<any>('select cancel_notice_opened_at from appointments where id=$1', [a])).rows[0].cancel_notice_opened_at).not.toBeNull()
  })

  it('yönetici olmayan ve anonim kullanıcı çağıramaz', async () => {
    const a = await idOf((await book({ start: at(futureDate(3), '15:00') })).reference_code)
    await asRole('authenticated', USER_ID, async () => {
      await expectError(bulk([a], 'x'), 'forbidden')
      await expectError(db.query('select admin_mark_cancel_notice($1)', [a]), 'forbidden')
    })
    await asRole('anon', null, async () => {
      await expectError(bulk([a], 'x'), 'permission denied')
      await expectError(db.query('select admin_mark_cancel_notice($1)', [a]), 'permission denied')
    })
    expect((await db.query<any>('select status from appointments where id=$1', [a])).rows[0].status).toBe('pending')
  })

  it('migration tekrar çalıştırılırsa veri bozulmaz', async () => {
    const a = await idOf((await book({ start: at(futureDate(3), '15:00') })).reference_code)
    await asRole('authenticated', ADMIN_ID, async () => { await bulk([a], 'Neden') })
    await db.exec(sql('migrations/0008_bulk_cancel.sql'))
    expect((await db.query<any>('select cancellation_reason from appointments where id=$1', [a])).rows[0].cancellation_reason).toBe('Neden')
  })
})

describe('telefon bildirimi kayıtları (0009)', () => {
  const END = 'https://fcm.googleapis.com/fcm/send/cihaz-1'
  const count = async () => (await db.query<{ n: number }>('select count(*)::int n from push_subscriptions')).rows[0].n

  it('yönetici kaydeder, aynı cihaz iki kez yazılmaz, silebilir', async () => {
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query('select admin_save_push_subscription($1)', [END])
      await db.query('select admin_save_push_subscription($1)', [END])
    })
    expect(await count()).toBe(1)
    await asRole('authenticated', ADMIN_ID, async () => { await db.query('select admin_delete_push_subscription($1)', [END]) })
    expect(await count()).toBe(0)
  })

  it('anonim ve yönetici olmayan kullanıcı yazamaz; tabloyu kimse doğrudan okuyamaz', async () => {
    await asRole('anon', null, async () => {
      await expect(db.query('select admin_save_push_subscription($1)', [END])).rejects.toThrow()
      await expect(db.query('select * from push_subscriptions')).rejects.toThrow()
    })
    await asRole('authenticated', ADMIN_ID, async () => {
      await expect(db.query('select * from push_subscriptions')).rejects.toThrow()
    })
    await asRole('authenticated', '00000000-0000-0000-0000-00000000dead', async () => {
      await expect(db.query('select admin_save_push_subscription($1)', [END])).rejects.toThrow()
    })
    expect(await count()).toBe(0)
  })

  it('https olmayan adresi reddeder; service_role okur ve siler', async () => {
    await asRole('authenticated', ADMIN_ID, async () => {
      await expect(db.query('select admin_save_push_subscription($1)', ['http://push.test/x'])).rejects.toThrow()
      await db.query('select admin_save_push_subscription($1)', [END])
    })
    await asRole('service_role', null, async () => {
      expect((await db.query('select endpoint from push_subscriptions')).rows).toHaveLength(1)
      await db.query('delete from push_subscriptions where endpoint=$1', [END])
    })
    expect(await count()).toBe(0)
  })
})

describe('güvenlik sertleştirmesi (0011)', () => {
  const adminCheck = async (aal: string) => {
    await db.exec(`select set_config('request.jwt.claims', '{"aal":"${aal}"}', false)`)
    let ok = false
    await asRole('authenticated', ADMIN_ID, async () => { ok = (await db.query<{ a: boolean }>('select is_admin() a')).rows[0].a })
    await db.exec(`select set_config('request.jwt.claims', '', false)`)
    return ok
  }

  it('iki adımlı giriş açık değilse yönetici etkilenmez; açıksa aal2 ister', async () => {
    expect(await adminCheck('aal1')).toBe(true)
    await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'unverified')`, [ADMIN_ID])
    expect(await adminCheck('aal1')).toBe(true) // yarım kalmış kurulum kilitlemez
    await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [ADMIN_ID])
    expect(await adminCheck('aal1')).toBe(false)
    expect(await adminCheck('aal2')).toBe(true)
  })

  it('aal1 oturum, iki adımlı giriş açıkken müşteri verisini okuyamaz', async () => {
    await book({ start: at(futureDate(3), '15:00') })
    await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [ADMIN_ID])
    await db.exec(`select set_config('request.jwt.claims', '{"aal":"aal1"}', false)`)
    await asRole('authenticated', ADMIN_ID, async () => {
      expect((await db.query('select * from appointments')).rows).toHaveLength(0)
    })
    await db.exec(`select set_config('request.jwt.claims', '', false)`)
  })

  it('normal kullanıcı aal2 ile de yönetici olamaz', async () => {
    await db.exec(`select set_config('request.jwt.claims', '{"aal":"aal2"}', false)`)
    await asRole('authenticated', USER_ID, async () => {
      expect((await db.query<{ a: boolean }>('select is_admin() a')).rows[0].a).toBe(false)
    })
    await db.exec(`select set_config('request.jwt.claims', '', false)`)
  })

  it('IP başına günlük sınır uygulanır, ayar satırı yoksa kapalı kalır', async () => {
    await db.exec('update private_settings set bookings_per_ip_per_hour = 100, bookings_per_ip_per_day = 2')
    await asRole('service_role', null, async () => {
      const hit = async () => (await db.query<{ ok: boolean }>(`select booking_rate_limit_hit('203.0.113.9') ok`)).rows[0].ok
      expect([await hit(), await hit(), await hit()]).toEqual([true, true, false])
    })
    await db.exec('delete from private_settings')
    await asRole('service_role', null, async () => {
      expect((await db.query<{ ok: boolean }>(`select booking_rate_limit_hit('198.51.100.1') ok`)).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>('select booking_global_limit_hit() ok')).rows[0].ok).toBe(false)
    })
  })

  it('takvim genel sınırı yükseltildi', async () => {
    expect((await db.query<any>('select public_queries_global_per_minute n from private_settings')).rows[0].n).toBeGreaterThanOrEqual(10000)
  })

  it('push yalnızca bilinen servisleri kabul eder ve yöneticiye bağlanır', async () => {
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(db.query(`select admin_save_push_subscription('https://169.254.169.254/x')`), 'invalid_endpoint')
      await expectError(db.query(`select admin_save_push_subscription('https://fcm.googleapis.com.kotu.test/x')`), 'invalid_endpoint')
      await db.query(`select admin_save_push_subscription('https://web.push.apple.com/abc')`)
    })
    const rows = (await db.query<any>('select user_id from push_subscriptions')).rows
    expect(rows).toEqual([{ user_id: ADMIN_ID }])
    await db.query('delete from admin_users where user_id=$1', [ADMIN_ID])
    expect((await db.query('select * from push_subscriptions')).rows).toHaveLength(0)
  })

  it('yönetici değişikliklerini kaydeder; kayıtları istemci okuyamaz', async () => {
    await asRole('authenticated', ADMIN_ID, async () => {
      await db.query(`update services set price_minor = 12345 where name = 'Saç Kesimi'`)
    })
    const log = (await db.query<any>(`select actor, table_name, action, new_data from admin_audit_log where table_name='services'`)).rows
    expect(log).toHaveLength(1)
    expect(log[0].actor).toBe(ADMIN_ID)
    expect(log[0].new_data.price_minor).toBe(12345)
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(db.query('select * from admin_audit_log'), 'permission denied')
    })
    await asRole('anon', null, async () => {
      await expectError(db.query('select * from admin_audit_log'), 'permission denied')
    })
  })

  it('referans kodu biçimi korunur; migration tekrar çalışabilir', async () => {
    expect((await book({ start: at(futureDate(3), '15:00') })).reference_code).toMatch(/^FD-[A-Z2-9]{6}$/)
    await db.exec(sql('migrations/0011_security_hardening.sql'))
    expect((await db.query<any>('select bookings_per_ip_per_day n from private_settings')).rows[0].n).toBe(30)
  })
})

describe('güvenilir cihaz (0012)', () => {
  const now = () => Math.floor(Date.now() / 1000)
  const claims = (aal: string, totpAt?: number) =>
    JSON.stringify({ aal, amr: totpAt ? [{ method: 'totp', timestamp: totpAt }, { method: 'password', timestamp: totpAt }] : [{ method: 'password', timestamp: now() }] })
  const session = async (jwt: string, token: string | null) => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [jwt])
    await db.query(`select set_config('request.headers', $1, false)`, [token ? JSON.stringify({ 'x-device-token': token }) : ''])
  }
  const clear = () => session('', null)
  const isAdminAs = async (user: string, jwt: string, token: string | null) => {
    await session(jwt, token)
    let ok = false
    await asRole('authenticated', user, async () => { ok = (await db.query<{ a: boolean }>('select is_admin() a')).rows[0].a })
    await clear()
    return ok
  }
  const enrollAdmin = () => db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [ADMIN_ID])
  const trust = async (user = ADMIN_ID, totpAt = now()) => {
    await session(claims('aal2', totpAt), null)
    let out: any
    await asRole('authenticated', user, async () => { out = (await db.query<{ r: any }>('select trust_this_device() r')).rows[0].r })
    await clear()
    return out as { token: string; expires_at: string }
  }

  it('iki adımlı giriş açıkken: kod yoksa yönetici değil, güvenilir cihazda parola oturumu yönetici', async () => {
    await enrollAdmin()
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), null)).toBe(false)
    const t = await trust()
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), t.token)).toBe(true) // çıkış + parola girişi
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), null)).toBe(false) // başka cihaz
  })

  it('uydurma veya başka kullanıcının kaydı işe yaramaz; normal kullanıcı yönetici olamaz', async () => {
    await enrollAdmin()
    const t = await trust()
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), 'mfa-tamamlandi')).toBe(false)
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), t.token + 'x')).toBe(false)
    expect(await isAdminAs(USER_ID, claims('aal1'), t.token)).toBe(false)
    expect(await isAdminAs(USER_ID, claims('aal2', now()), t.token)).toBe(false)
  })

  it('her cihaz kendi kaydını alır; biri silinmeden diğeri çalışır', async () => {
    await enrollAdmin()
    const a = await trust()
    const b = await trust()
    expect(a.token).not.toBe(b.token)
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), a.token)).toBe(true)
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), b.token)).toBe(true)
    expect((await db.query<any>('select token_hash from trusted_devices')).rows.some((r: any) => r.token_hash === a.token)).toBe(false) // ham değer saklanmaz
  })

  it('süresi dolunca kod yeniden gerekir ve yeni kayıt alınır', async () => {
    await enrollAdmin()
    const t = await trust()
    await db.exec(`update trusted_devices set expires_at = now() - interval '1 second'`)
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), t.token)).toBe(false)
    const fresh = await trust()
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), fresh.token)).toBe(true)
    expect((await db.query('select * from trusted_devices')).rows).toHaveLength(1) // süresi dolan silindi
  })

  it('kayıt yalnızca az önce kod girmiş aal2 ile alınır', async () => {
    await enrollAdmin()
    const call = async (jwt: string, user = ADMIN_ID) => {
      await session(jwt, null)
      let err = ''
      await asRole('authenticated', user, async () => { try { await db.query('select trust_this_device()') } catch (e) { err = (e as Error).message } })
      await clear()
      return err
    }
    expect(await call(claims('aal1'))).toBe('forbidden') // istemci aal2 iddia edemez
    expect(await call(JSON.stringify({ aal: 'aal2', amr: [{ method: 'password', timestamp: now() }] }))).toBe('mfa_not_fresh')
    expect(await call(claims('aal2', now() - 600))).toBe('mfa_not_fresh') // gece yarısını geçen eski aal2 oturumu
    expect(await call(claims('aal2', now()), USER_ID)).toBe('forbidden')
    await expectError(asRole('anon', null, async () => { await db.query('select trust_this_device()') }), 'permission denied')
  })

  it('aal2 oturum etkilenmez; cihaz güveniyle müşteri verisi okunur, cihazsız okunmaz', async () => {
    await book({ start: at(futureDate(3), '15:00') })
    await enrollAdmin()
    expect(await isAdminAs(ADMIN_ID, claims('aal2', now()), null)).toBe(true)
    const t = await trust()
    const rows = async (token: string | null) => {
      await session(claims('aal1'), token)
      let n = -1
      await asRole('authenticated', ADMIN_ID, async () => { n = (await db.query('select * from appointments')).rows.length })
      await clear()
      return n
    }
    expect(await rows(t.token)).toBe(1)
    expect(await rows(null)).toBe(0)
  })

  it('gün sonu İstanbul saatine göre hesaplanır', async () => {
    const next = async (at: string) => new Date((await db.query<{ m: string }>('select next_istanbul_midnight($1) m', [at])).rows[0].m).toISOString()
    expect(await next('2026-11-05T15:00:00+03:00')).toBe('2026-11-05T21:00:00.000Z') // 6 Kasım 00.00 İstanbul
    expect(await next('2026-11-05T23:59:59+03:00')).toBe('2026-11-05T21:00:00.000Z')
    expect(await next('2026-11-06T00:00:00+03:00')).toBe('2026-11-06T21:00:00.000Z')
    expect(await next('2026-11-05T22:30:00Z')).toBe('2026-11-06T21:00:00.000Z') // UTC'de 5 Kasım, İstanbul'da 6 Kasım
  })

  it('cihazları sıfırlama hepsini geçersiz kılar; tabloyu kimse doğrudan okuyamaz', async () => {
    await enrollAdmin()
    const t = await trust()
    await session(claims('aal2', now()), null)
    await asRole('authenticated', ADMIN_ID, async () => {
      await expectError(db.query('select * from trusted_devices'), 'permission denied')
      await db.query('select revoke_trusted_devices()')
    })
    await clear()
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), t.token)).toBe(false)
    await asRole('anon', null, async () => {
      await expectError(db.query('select * from trusted_devices'), 'permission denied')
      await expectError(db.query('select device_trust_expires()'), 'permission denied')
      await expectError(db.query('select revoke_trusted_devices()'), 'permission denied')
    })
  })

  it('iki adımlı giriş açmamış yönetici kilitlenmez; migration tekrar çalışır', async () => {
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), null)).toBe(true)
    await db.exec(sql('migrations/0012_trusted_devices.sql'))
    expect(await isAdminAs(ADMIN_ID, claims('aal1'), null)).toBe(true)
  })
})

describe('günlük randevu temizliği (0007)', () => {
  // Sabit "şimdi": 15 Haziran 2030 09:00 İstanbul. Testler gerçek saatten bağımsızdır.
  const NOW = '2030-06-15T09:00:00+03:00'
  const insertAt = async (code: string, start: string, minutes = 30, phone = '+905321112233') => {
    const end = new Date(new Date(start).getTime() + minutes * 60000).toISOString()
    return (await db.query<{ id: string }>(
      `insert into appointments (reference_code, service_id, service_name, price_minor, customer_first_name, customer_last_name, customer_phone, starts_at, ends_at)
       values ($1, $2, 'Saç Kesimi', 70000, 'Ad', 'Soyad', $3, $4, $5) returning id`,
      [code, serviceIds['Saç Kesimi'], phone, start, end],
    )).rows[0].id
  }
  const codes = async () => (await db.query<{ reference_code: string }>('select reference_code from appointments order by starts_at')).rows.map((r) => r.reference_code)
  const cleanup = async (now = NOW) => (await db.query<{ r: any }>(`select run_daily_cleanup($1, 'scheduler') r`, [now])).rows[0].r

  it('önceki İstanbul gününü siler; bugünü (00:00 dahil) ve geleceği korur', async () => {
    await insertAt('FD-OLD003', '2030-06-12T15:00:00+03:00')
    await insertAt('FD-YEST01', '2030-06-14T15:00:00+03:00')
    await insertAt('FD-YEST02', '2030-06-14T23:30:00+03:00') // gece yarısına taşan dünkü randevu
    await insertAt('FD-TODAY0', '2030-06-15T00:00:00+03:00') // tam sınır: bugün
    await insertAt('FD-TODAY1', '2030-06-15T08:00:00+03:00') // bugün, saati geçmiş ama bugün
    await insertAt('FD-TODAY2', '2030-06-15T18:00:00+03:00')
    await insertAt('FD-TOMORR', '2030-06-16T10:00:00+03:00')
    const r = await cleanup()
    expect(r.deleted_appointments).toBe(3)
    expect(new Date(r.cutoff).toISOString()).toBe('2030-06-14T21:00:00.000Z') // 15 Haziran 00:00 İstanbul
    expect(await codes()).toEqual(['FD-TODAY0', 'FD-TODAY1', 'FD-TODAY2', 'FD-TOMORR'])
  })

  it('yalnızca silinen randevunun durum geçmişini ve SMS kayıtlarını siler; kalanlarınkine dokunmaz', async () => {
    const old = await insertAt('FD-YEST01', '2030-06-14T15:00:00+03:00')
    const keep = await insertAt('FD-TOMORR', '2030-06-16T10:00:00+03:00', 30, '+905339998877')
    await db.query(`insert into notification_logs (appointment_id, kind, dedupe_key) values ($1::uuid,'booking_received',$1::uuid::text || ':b'), ($2::uuid,'booking_received',$2::uuid::text || ':b')`, [old, keep])
    await cleanup()
    const hist = (await db.query<{ appointment_id: string }>('select distinct appointment_id from appointment_status_history')).rows.map((r) => r.appointment_id)
    const logs = (await db.query<{ appointment_id: string }>('select appointment_id from notification_logs')).rows.map((r) => r.appointment_id)
    expect(hist).toEqual([keep])
    expect(logs).toEqual([keep])
  })

  it('kalıcı işletme verilerini korur ve tekrar çalıştırılması güvenlidir', async () => {
    await db.query(`insert into blocked_periods (starts_at, ends_at, reason) values ('2030-06-01T00:00:00+03:00','2030-06-02T00:00:00+03:00','Geçmiş izin')`)
    const count = async () => (await db.query<{ s: number; w: number; b: number; bp: number; a: number }>(
      `select (select count(*)::int from services) s, (select count(*)::int from working_hours) w,
              (select count(*)::int from business_settings) b, (select count(*)::int from blocked_periods) bp,
              (select count(*)::int from admin_users) a`)).rows[0]
    const before = await count()
    await insertAt('FD-YEST01', '2030-06-14T15:00:00+03:00')
    expect((await cleanup()).deleted_appointments).toBe(1)
    expect((await cleanup()).deleted_appointments).toBe(0) // tekrar: hiçbir şey silinmez
    expect(await count()).toEqual(before)
    const runs = (await db.query<{ trigger: string; deleted_appointments: number }>('select trigger, deleted_appointments from maintenance_runs order by id')).rows
    expect(runs).toEqual([{ trigger: 'scheduler', deleted_appointments: 1 }, { trigger: 'scheduler', deleted_appointments: 0 }])
  })

  it('gün sınırını saat dilimine göre hesaplar (İstanbul ve yaz saati uygulayan bir bölge)', async () => {
    const start = async (at: string) => new Date((await db.query<{ s: string }>('select business_day_start($1) s', [at])).rows[0].s).toISOString()
    expect(await start('2026-11-01T20:59:00Z')).toBe('2026-10-31T21:00:00.000Z') // 1 Kasım 23:59 İstanbul
    expect(await start('2026-11-01T21:00:00Z')).toBe('2026-11-01T21:00:00.000Z') // 2 Kasım 00:00 İstanbul
    await db.exec(`update business_settings set timezone = 'Europe/Berlin'`)
    expect(await start('2026-03-29T10:00:00Z')).toBe('2026-03-28T23:00:00.000Z') // yaz saatine geçiş günü (CET 00:00)
    expect(await start('2026-10-25T12:00:00Z')).toBe('2026-10-24T22:00:00.000Z') // yaz saatinden çıkış günü (CEST 00:00)
  })

  it('eksik yapılandırmayı ve geçersiz tetikleyiciyi açıkça bildirir; zamanlayıcı durumunu raporlar', async () => {
    await expectError(db.query(`select run_daily_cleanup(now(), 'cron?')`), 'invalid_trigger')
    await asRole('authenticated', ADMIN_ID, async () => {
      const s = (await db.query<{ s: any }>('select admin_cleanup_status() s')).rows[0].s
      expect(s.scheduler).toBe('not_installed') // PGlite'ta pg_cron yok
      expect(s.last_run_at).toBeNull()
    })
    await db.exec('delete from business_settings')
    await expectError(cleanup(), 'not_configured')
  })

  it('yalnızca yönetici elle çalıştırabilir ve durumu görebilir; istemciler temizlik fonksiyonuna ve kayıtlarına erişemez', async () => {
    await asRole('authenticated', ADMIN_ID, async () => {
      const r = (await db.query<{ r: any }>('select admin_run_cleanup() r')).rows[0].r
      expect(r.deleted_appointments).toBe(0)
      const s = (await db.query<{ s: any }>('select admin_cleanup_status() s')).rows[0].s
      expect(s.last_trigger).toBe('manual')
      await expectError(db.query(`select run_daily_cleanup()`), 'permission denied')
      await expectError(db.query('select * from maintenance_runs'), 'permission denied')
    })
    await asRole('authenticated', USER_ID, async () => {
      await expectError(db.query('select admin_run_cleanup()'), 'forbidden')
      await expectError(db.query('select admin_cleanup_status()'), 'forbidden')
    })
    await asRole('anon', null, async () => {
      await expectError(db.query('select admin_run_cleanup()'), 'permission denied')
      await expectError(db.query(`select run_daily_cleanup()`), 'permission denied')
      await expectError(db.query(`select business_day_start(now())`), 'permission denied')
      await expectError(db.query(`delete from appointments`), 'permission denied')
      await expectError(db.query(`update appointments set status = 'cancelled'`), 'permission denied')
    })
  })
})

describe('aynı gün randevu (gerçek sunucu saatiyle)', () => {
  // Bugünü 00:00–23:55 açık, 5 dk aralıklı ve bildirim süresiz yapar; gerçek now() ile denenir.
  async function openToday() {
    const ist = new Date(Date.now() + 3 * 3600_000) // Türkiye sabit UTC+3
    const wd = ist.getUTCDay() === 0 ? 7 : ist.getUTCDay()
    await db.query(`update working_hours set is_closed = false, opens_at = '00:00', closes_at = '23:55', break_starts_at = null, break_ends_at = null where weekday = $1`, [wd])
    await db.exec('update business_settings set booking_interval_minutes = 5, minimum_booking_notice_minutes = 0')
    const date = ist.toISOString().slice(0, 10)
    const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    return { date, minutes, hhmm }
  }

  it('bugün, şu andan sonraki geçerli bir saate randevu alınabilir ve o saat listede görünür', async (ctx) => {
    const { date, minutes, hhmm } = await openToday()
    const next = Math.ceil((minutes + 10) / 5) * 5
    if (next + 30 > 23 * 60 + 55) ctx.skip() // gece yarısına çok yakın: bugün için yer kalmadı
    expect(await slotsOf(date)).toContain(hhmm(next))
    const r = await book({ start: at(date, hhmm(next)) })
    expect(r.reference_code).toMatch(/^FD-/)
  })

  it('bugünün geçmiş saati reddedilir ve listede gösterilmez (istek elle değiştirilse bile)', async (ctx) => {
    const { date, minutes, hhmm } = await openToday()
    const prev = Math.floor((minutes - 10) / 5) * 5
    if (prev < 0) ctx.skip() // gece yarısından hemen sonra: bugünün geçmiş saati yok
    expect(await slotsOf(date)).not.toContain(hhmm(prev))
    await expectError(book({ start: at(date, hhmm(prev)) }), 'too_soon')
  })

  it('bugün, müsait saat kaldığı sürece tarih seçicide seçilebilir', async (ctx) => {
    const { date, minutes } = await openToday()
    if (minutes + 40 > 23 * 60 + 55) ctx.skip()
    const r = await db.query<{ day: Date }>('select day from get_available_dates($1,$2,$2)', [serviceIds['Saç Kesimi'], date])
    expect(r.rows.map((x) => new Date(x.day).toISOString().slice(0, 10))).toEqual([date])
  })
})
