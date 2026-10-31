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

async function setup() {
  db = new PGlite({ extensions: { btree_gist } })
  await db.exec(`
    create extension if not exists btree_gist;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to anon, authenticated, service_role;
  `)
  await db.exec(sql('migrations/0001_schema.sql'))
  await db.exec(sql('migrations/0002_realtime.sql'))
  await db.exec(sql('migrations/0003_security.sql'))
  await db.exec(sql('migrations/0004_admin_management.sql'))
  await db.exec(sql('seed.sql'))
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
    expect((await db.query<{ price_minor: number | null }>(`select price_minor from services where name = 'Saç Kesimi'`)).rows[0].price_minor).toBeNull()
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
