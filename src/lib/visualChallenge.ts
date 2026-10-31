// Geçici görsel seçme testi (yalnızca geliştirme). GÜVENLİK KONTROLÜ DEĞİLDİR: tamamen tarayıcıda
// çalışır ve atlatılabilir. Sunucudaki gerçek koruma Turnstile + Edge Function + hız sınırıdır.

export type ChallengeCategory = 'scissors' | 'armchair' | 'clock' | 'coffee' | 'key' | 'umbrella' | 'brush' | 'glasses'

/** Türkçe adlar: istem metninde ("… bulunan tüm görselleri seçin") ve erişilebilir etiketlerde kullanılır. */
export const CATEGORY_LABELS: Record<ChallengeCategory, { name: string; prompt: string }> = {
  scissors: { name: 'makas', prompt: 'Makas' },
  armchair: { name: 'koltuk', prompt: 'Koltuk' },
  clock: { name: 'saat', prompt: 'Saat' },
  coffee: { name: 'fincan', prompt: 'Fincan' },
  key: { name: 'anahtar', prompt: 'Anahtar' },
  umbrella: { name: 'şemsiye', prompt: 'Şemsiye' },
  brush: { name: 'fırça', prompt: 'Fırça' },
  glasses: { name: 'gözlük', prompt: 'Gözlük' },
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ChallengeCategory[]
/** Hedef olarak sorulabilecek nesneler (berber temasıyla uyumlu olanlar). */
const TARGETS: ChallengeCategory[] = ['scissors', 'armchair', 'clock', 'brush']

export interface ChallengeTile {
  id: string
  category: ChallengeCategory
  /** Görsel çeşitlilik için küçük döndürme (derece) ve ölçek */
  rotate: number
  scale: number
}

export interface Challenge {
  target: ChallengeCategory
  tiles: ChallengeTile[]
}

export const GRID_SIZE = 9

/** [0, 1) aralığında rastgele sayı; varsayılan olarak crypto. Testlerde sabit bir üreteç verilebilir. */
export type Rng = () => number
const cryptoRng: Rng = () => {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0] / 2 ** 32
}

const pick = <T>(list: T[], rng: Rng) => list[Math.floor(rng() * list.length)]

function shuffle<T>(list: T[], rng: Rng): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 3×3 ızgara: 2–4 hedef görsel, kalanlar farklı nesneler. */
export function generateChallenge(rng: Rng = cryptoRng): Challenge {
  const target = pick(TARGETS, rng)
  const targetCount = 2 + Math.floor(rng() * 3)
  const others = CATEGORIES.filter((c) => c !== target)
  const categories = [
    ...Array.from({ length: targetCount }, () => target),
    ...Array.from({ length: GRID_SIZE - targetCount }, () => pick(others, rng)),
  ]
  const tiles = shuffle(categories, rng).map((category, i) => ({
    id: `t${i}-${Math.floor(rng() * 1e6).toString(36)}`,
    category,
    rotate: Math.round((rng() - 0.5) * 30),
    scale: 0.85 + Math.round(rng() * 25) / 100,
  }))
  return { target, tiles }
}

/** Seçim tam olarak hedef görsellerden oluşuyorsa doğrudur (eksik veya fazla seçim yanlıştır). */
export function isCorrectSelection(challenge: Challenge, selected: ReadonlySet<string>): boolean {
  const expected = challenge.tiles.filter((t) => t.category === challenge.target).map((t) => t.id)
  return expected.length === selected.size && expected.every((id) => selected.has(id))
}
