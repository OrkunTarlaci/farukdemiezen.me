import { siteConfig } from '../../config/site'

export function About({ businessName }: { businessName?: string }) {
  const { about } = siteConfig
  return (
    <section id="hakkinda" aria-labelledby="hakkinda-baslik" className="section border-b border-line bg-surface/60">
      <div className="container-page grid gap-6 md:grid-cols-[1fr_1.4fr] md:gap-16">
        <div>
          <p className="eyebrow mb-3">{about.title}</p>
          <h2 id="hakkinda-baslik" className="section-title">{businessName || siteConfig.name}</h2>
          <p className="mt-1 text-sm uppercase tracking-[0.24em] text-muted">{siteConfig.tagline}</p>
        </div>
        <div className="space-y-4 text-base leading-relaxed text-fg/85 sm:text-lg">
          {about.paragraphs.map((p) => <p key={p}>{p}</p>)}
        </div>
      </div>
    </section>
  )
}
