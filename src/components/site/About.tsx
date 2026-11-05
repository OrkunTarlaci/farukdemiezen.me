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
    <section id="hakkinda" aria-labelledby="hakkinda-baslik" className="border-b border-line bg-surface/60 py-16 md:py-28">
      <div className="container-page">
        <p className="text-base font-medium text-accent sm:text-lg">{name}</p>
        <h2 id="hakkinda-baslik" className="mt-2 text-[2.75rem] font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">{about.headline}</h2>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-fg/85 sm:mt-7 sm:text-2xl sm:leading-relaxed">{about.intro}</p>

        <div className="mt-10 grid gap-10 md:mt-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start md:gap-16">
          {photo && (
            <div className="md:sticky md:top-24">
              <figure className="overflow-hidden rounded-2xl bg-raised">
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
              <div className="mt-5"><SocialLinks contactPhone={contactPhone} iconsOnly /></div>
            </div>
          )}

          <div>
            <p className="flex items-baseline gap-3">
              <span className="text-7xl font-semibold leading-none tracking-tight text-accent sm:text-8xl">{about.years}</span>
              <span className="text-lg text-fg sm:text-xl">yıllık mesleki deneyim</span>
            </p>

            <dl className="mt-8 divide-y divide-line border-y border-line sm:mt-10">
              {about.focus.map((f) => (
                <div key={f.title} className="py-5 sm:grid sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6 sm:py-6">
                  <dt className="text-lg font-semibold text-fg">{f.title}</dt>
                  <dd className="mt-1 text-base leading-relaxed text-fg/80 sm:mt-0 sm:text-lg">{f.text}</dd>
                </div>
              ))}
            </dl>

            {story.length > 0 && (
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
            )}

            {about.quote && (
              <blockquote className="mt-10 text-2xl font-medium tracking-tight text-fg sm:text-3xl">
                {about.quote}
                <footer className="mt-2 text-sm font-normal tracking-normal text-muted">{about.quoteBy ?? name}</footer>
              </blockquote>
            )}

            {!photo && <div className="mt-8"><SocialLinks contactPhone={contactPhone} iconsOnly /></div>}
          </div>
        </div>
      </div>
    </section>
  )
}
