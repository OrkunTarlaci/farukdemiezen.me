import { useState } from 'react'
import { BookingFlow } from '../components/booking/BookingFlow'
import { About } from '../components/site/About'
import { Footer } from '../components/site/Footer'
import { Header } from '../components/site/Header'
import { Hero } from '../components/site/Hero'
import { Location } from '../components/site/Location'
import { Services } from '../components/site/Services'
import { ErrorPanel, Notice, Spinner } from '../components/ui/feedback'
import { scrollToId } from '../lib/nav'
import { loadSiteData } from '../lib/siteData'
import { useAsync } from '../lib/useAsync'

export function HomePage() {
  const site = useAsync(loadSiteData, [])
  const [preselect, setPreselect] = useState<{ serviceId: string; nonce: number } | null>(null)
  const data = site.data

  const bookService = (serviceId: string) => {
    setPreselect({ serviceId, nonce: Date.now() })
    scrollToId('randevu')
  }

  return (
    <>
      <a href="#/" onClick={(e) => { e.preventDefault(); scrollToId('icerik') }}
         className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">
        İçeriğe geç
      </a>
      <Header showLocation={Boolean(data?.settings.address)} />
      <main id="icerik" tabIndex={-1} className="outline-none">
        <Hero settings={data?.settings} workingHours={data?.workingHours} />
        <Services
          services={data?.services}
          settings={data?.settings}
          loading={site.loading}
          error={site.error?.message ?? null}
          onRetry={site.reload}
          onBook={bookService}
        />

        <section id="randevu" aria-labelledby="randevu-baslik" className="section border-b border-line">
          <div className="container-page">
            <div className="mb-8 max-w-xl">
              <p className="eyebrow mb-3">Randevu</p>
              <h2 id="randevu-baslik" className="section-title">Randevunuzu ayırtın</h2>
              <p className="mt-2 text-sm text-muted">Birkaç adımda tamamlanır. Randevunuz yalnızca sistem kaydı onayladığında oluşur.</p>
            </div>
            {site.loading && <Spinner label="Randevu sistemi hazırlanıyor…" />}
            {site.error && <ErrorPanel message={site.error.message} onRetry={site.reload} />}
            {data?.preview && (
              <Notice>
                <strong>Geliştirme önizlemesi.</strong> Supabase bağlı değil, bu yüzden randevu alınamaz ve gösterilen
                hizmetler örnek veridir. Gerçek arka ucu bağlamak için <code>.env</code> dosyasını doldurun (README).
              </Notice>
            )}
            {data && !data.preview && <BookingFlow site={data} preselect={preselect} />}
          </div>
        </section>

        <About />
        {data && <Location settings={data.settings} />}
      </main>
      <Footer settings={data?.settings} workingHours={data?.workingHours} />
    </>
  )
}
