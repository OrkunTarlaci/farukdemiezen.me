import { siteConfig } from '../../config/site'
import { SocialLinks } from './SocialLinks'

/** Metni henüz yazılmamış alan: yalnızca geliştirme önizlemesinde, nereye ne yazılacağını gösterir. */
function Placeholder({ label, hint }: { label: string; hint?: string }) {
  if (!import.meta.env.DEV) return null
  return (
    <div className="rounded-lg border border-dashed border-accent/50 p-4 text-sm text-muted">
      <p className="font-medium text-accent">Doldurulacak: {label}</p>
      {hint && <p className="mt-1">{hint}</p>}
      <p className="mt-1 text-xs text-subtle">src/config/site.ts → about</p>
    </div>
  )
}

export function About({ businessName, contactPhone }: { businessName?: string; contactPhone?: string | null }) {
  const { about } = siteConfig
  const name = businessName || siteConfig.name
  const photo = about.photoUrl
    ? (about.photoUrl.startsWith('http') ? about.photoUrl : `${import.meta.env.BASE_URL}${about.photoUrl.replace(/^\//, '')}`)
    : null
  // Canlı sitede yalnızca metni yazılmış bölümler görünür.
  const story = about.story.filter((s) => (s.text && s.text.length > 0) || import.meta.env.DEV)

  return (
    <section id="hakkinda" aria-labelledby="hakkinda-baslik" className="section border-b border-line bg-surface/60">
      <div className="container-page grid gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] md:gap-16">
        <div>
          {photo && (
            <figure className="overflow-hidden rounded-xl border border-line bg-raised md:sticky md:top-24">
              <img
                src={photo}
                alt={about.photoAlt}
                width={1254}
                height={1254}
                loading="lazy"
                decoding="async"
                className="aspect-[4/5] w-full object-cover object-[50%_30%]"
              />
            </figure>
          )}
        </div>

        <div>
          <p className="eyebrow mb-3">{about.title}</p>
          <h2 id="hakkinda-baslik" className="section-title">{name}</h2>
          <p className="mt-1 text-sm uppercase tracking-[0.24em] text-muted">{siteConfig.tagline}</p>

          {about.intro
            ? <p className="mt-6 text-lg leading-relaxed text-fg sm:text-xl">{about.intro}</p>
            : <div className="mt-6"><Placeholder label="Tek cümlelik tanıtım (intro)" hint="Başlığın altında görünecek kısa tanıtım." /></div>}

          <div className="mt-8 space-y-8">
            {story.map((s) => (
              <div key={s.title}>
                <h3 className="text-lg sm:text-xl">{s.title}</h3>
                {s.text && s.text.length > 0
                  ? <div className="mt-2 space-y-3 text-base leading-relaxed text-fg/85 sm:text-lg">{s.text.map((p) => <p key={p}>{p}</p>)}</div>
                  : <div className="mt-2"><Placeholder label={s.title} hint={s.hint} /></div>}
              </div>
            ))}
          </div>

          <div className="mt-8"><SocialLinks contactPhone={contactPhone} /></div>

          {about.quote
            ? <blockquote className="mt-10 border-l-2 border-accent pl-4 text-lg italic text-fg sm:text-xl">“{about.quote}”<footer className="mt-2 text-sm not-italic text-muted">{about.quoteBy ?? name}</footer></blockquote>
            : <div className="mt-10"><Placeholder label="Alıntı (isteğe bağlı)" hint="Faruk Bey'in işi hakkında kendi sözü, tek cümle." /></div>}
        </div>
      </div>
    </section>
  )
}
