import { AlertTriangle, ArrowRight, ChevronRight, Clock, RotateCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorPanel, Spinner } from '../../components/ui/feedback'
import { fetchAppointmentsInRange, setAppointmentStatus, triggerNotifications } from '../../lib/api'
import { toAppError } from '../../lib/errors'
import { appointmentIssues } from '../../lib/schedule'
import { summarizeAppointments } from '../../lib/stats'
import { addDays, dateOfInstant, formatDateLong, formatDateShort, timeOfInstant } from '../../lib/time'
import { useIstanbulToday } from '../../lib/useToday'
import type { AppointmentRow } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { useLiveAppointments } from '../../lib/useLiveAppointments'
import { AppointmentDialog } from '../AppointmentDialog'
import { MoneyStat, PageHeader, StatCard } from '../AdminLayout'
import { ContactActions } from '../ContactActions'
import { STATUS_LABELS, STATUS_TEXT, StatusBadge, TestBadge } from '../StatusBadge'

const UPCOMING_DAYS = 30

function RowButton({ a, onOpen, showDate, hideStatus }: { a: AppointmentRow; onOpen: () => void; showDate?: boolean; hideStatus?: boolean }) {
  return (
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[3.25rem] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-raised"
      >
        <span className={`${showDate ? 'w-20' : 'w-12'} shrink-0 tabular-nums text-muted sm:w-24`}>
          {showDate && <span className="block text-xs text-subtle">{formatDateShort(dateOfInstant(a.starts_at)).split(' ').slice(0, 2).join(' ')}</span>}
          <span className="font-mono text-fg">{timeOfInstant(a.starts_at)}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-medium text-fg">
            <span className="truncate">{a.customer_first_name} {a.customer_last_name}</span>{a.is_test && <TestBadge />}
          </span>
          <span className="block truncate text-xs text-muted">
            {!hideStatus && <span className={`sm:hidden ${STATUS_TEXT[a.status]}`}>{STATUS_LABELS[a.status]} · </span>}
            {a.service_name ?? a.services?.name ?? 'Hizmet'}
          </span>
        </span>
        {!hideStatus && <span className="hidden sm:block"><StatusBadge status={a.status} /></span>}
        <ChevronRight className="h-4 w-4 shrink-0 text-subtle sm:hidden" aria-hidden />
      </button>
  )
}

function Row(props: { a: AppointmentRow; onOpen: () => void; showDate?: boolean }) {
  return <li><RowButton {...props} /></li>
}

/** Onay bekleyen talep: açmadan tek dokunuşla onaylanır; "Reddet" iptal kutusu açık pencereyi getirir. */
function PendingRow({ a, onOpen, onApprove, onReject, approving, disabled }: {
  a: AppointmentRow; onOpen: () => void; onApprove: () => void; onReject: () => void; approving: boolean; disabled: boolean
}) {
  return (
    <li className="border-b border-line pb-3 pt-1 last:border-b-0 last:pb-0">
      <RowButton a={a} showDate hideStatus onOpen={onOpen} />
      <div className="mt-1 grid grid-cols-2 gap-2 px-3">
        <Button loading={approving} disabled={disabled} onClick={onApprove}>Onayla</Button>
        <Button variant="secondary" disabled={disabled} onClick={onReject}>Reddet</Button>
      </div>
    </li>
  )
}

/** Bugünün özeti, sıradaki randevu, onay bekleyen talepler ve sonucu işaretlenmemiş randevular. */
export function OverviewPage() {
  const today = useIstanbulToday()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Önceki günler her gece silindiği için bugünden başlanır.
  const data = useAsync(() => fetchAppointmentsInRange(today, addDays(today, UPCOMING_DAYS)), [today])
  useLiveAppointments(data.reload) // başka cihazdaki değişiklikler (ör. telefondan iptal)

  const view = useMemo(() => {
    const list = data.data ?? []
    const now = Date.now()
    const todays = list.filter((a) => dateOfInstant(a.starts_at) === today)
    const future = list.filter((a) => new Date(a.starts_at).getTime() > now && (a.status === 'pending' || a.status === 'confirmed'))
    return {
      todays,
      summary: summarizeAppointments(todays),
      next: future[0] ?? null,
      pending: future.filter((a) => a.status === 'pending'),
      upcomingCount: future.length,
      // Bugün: saati geçmiş ama sonucu işaretlenmemiş / hâlâ onay bekleyen (gece yarısı silinmeden önce)
      unresolved: list.filter((a) => appointmentIssues(a, undefined, []).some((i) => i === 'pending_past' || i === 'unresolved_past')),
    }
  }, [data.data, today])

  const selected = data.data?.find((a) => a.id === selectedId) ?? null
  const open = (id: string, reject = false) => { setRejecting(reject); setSelectedId(id) }

  async function approve(id: string) {
    if (approvingId) return
    setApprovingId(id); setActionError(null)
    try {
      await setAppointmentStatus(id, 'confirmed')
      // SMS sonucu randevu penceresinde görünür; başarısız olması onayı geri almaz.
      void triggerNotifications(id).catch(() => {})
    } catch (e) {
      setActionError(toAppError(e).message)
    } finally {
      setApprovingId(null)
      data.reload()
    }
  }

  return (
    <div>
      <PageHeader
        title="Ana Sayfa"
        description={formatDateLong(today)}
        actions={<Button variant="secondary" size="sm" onClick={data.reload} aria-label="Yenile" icon={<RotateCw className={`h-4 w-4 ${data.loading ? 'animate-spin' : ''}`} aria-hidden />} />}
      />

      {data.error && <div className="mb-4"><ErrorPanel message={data.error.message} onRetry={data.reload} /></div>}
      {!data.data && data.loading && <Spinner label="Özet yükleniyor…" />}

      {actionError && <div className="mb-4"><ErrorPanel message={actionError} /></div>}

      {data.data && (
        // Telefonda sıra işe göredir: önce bekleyen talepler, sayılar en altta.
        <div className="flex flex-col lg:block">
          <div className="order-last mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:order-none lg:mb-6 lg:mt-0">
            <StatCard label="Bugünkü randevu" value={view.summary.active} />
            <StatCard label="Onay bekleyen" value={view.pending.length} tone="warning" />
            <MoneyStat earnedMinor={view.summary.realizedMinor} allMinor={view.summary.expectedMinor} unknownPrice={view.summary.unknownPrice} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <section className="card p-4 sm:p-5" aria-labelledby="siradaki">
              <h2 id="siradaki" className="flex items-center gap-2 text-sm text-muted"><Clock className="h-4 w-4 text-accent" aria-hidden /> Sıradaki randevu</h2>
              {view.next ? (
                <>
                  <button type="button" onClick={() => open(view.next!.id)} className="mt-3 block w-full rounded-lg text-left hover:bg-raised/50">
                    <p className="text-3xl font-semibold tabular-nums text-fg">{timeOfInstant(view.next.starts_at)}</p>
                    <p className="text-sm text-muted">{formatDateLong(dateOfInstant(view.next.starts_at))}</p>
                    <p className="mt-3 text-lg font-medium text-fg">{view.next.customer_first_name} {view.next.customer_last_name}</p>
                    <p className="text-sm text-muted">{view.next.service_name ?? view.next.services?.name}</p>
                    <div className="mt-3"><StatusBadge status={view.next.status} /></div>
                  </button>
                  <div className="mt-3"><ContactActions phone={view.next.customer_phone} /></div>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted">Önümüzdeki {UPCOMING_DAYS} gün için randevu yok.</p>
              )}
              <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Önümüzdeki {UPCOMING_DAYS} günde {view.upcomingCount} randevu var.</p>
            </section>

            <section className={`card order-first p-4 sm:p-5 lg:order-none ${view.pending.length === 0 ? 'hidden lg:block' : ''}`} aria-labelledby="bekleyen">
              <div className="flex items-center justify-between gap-3">
                <h2 id="bekleyen" className="text-base font-semibold text-fg lg:text-sm lg:font-normal lg:text-muted">
                  Onay bekleyen talepler{view.pending.length > 0 && <span className="text-warning"> ({view.pending.length})</span>}
                </h2>
              </div>
              {view.pending.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Bekleyen talep yok.</p>
              ) : (
                <ul className="-mx-3 mt-2 space-y-2">
                  {view.pending.slice(0, 8).map((a) => (
                    <PendingRow
                      key={a.id}
                      a={a}
                      approving={approvingId === a.id}
                      disabled={approvingId !== null}
                      onOpen={() => open(a.id)}
                      onApprove={() => { void approve(a.id) }}
                      onReject={() => open(a.id, true)}
                    />
                  ))}
                </ul>
              )}
              {view.pending.length > 8 && <p className="mt-2 text-xs text-subtle">+{view.pending.length - 8} talep daha (Müşteri Ara sayfasında).</p>}
            </section>
          </div>

          {view.unresolved.length > 0 && (
            <section className="card mt-4 border-warning/40 p-5" aria-labelledby="sonuc">
              <h2 id="sonuc" className="flex items-center gap-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" aria-hidden /> Saati geçen randevular
              </h2>
              <p className="mt-1 text-xs text-muted">Müşteriye dokunun: geldiyse “Tamamlandı”, gelmediyse “Gelmedi” seçin.</p>
              <ul className="-mx-3 mt-2">{view.unresolved.map((a) => <Row key={a.id} a={a} showDate onOpen={() => open(a.id)} />)}</ul>
            </section>
          )}

          <section className="mt-4" aria-labelledby="bugun">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="bugun" className="text-base">Bugünün randevuları</h2>
              <Link to="/admin/gun" className="inline-flex min-h-[2.5rem] items-center gap-1 text-xs text-accent hover:underline">
                Tüm saatler <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            {view.todays.length === 0 ? (
              <EmptyState>Bugün için randevu yok.</EmptyState>
            ) : (
              <ul className="card p-2">{view.todays.map((a) => <Row key={a.id} a={a} onOpen={() => open(a.id)} />)}</ul>
            )}
          </section>
        </div>
      )}

      <AppointmentDialog appointment={selected} startCancel={rejecting} onClose={() => setSelectedId(null)} onChanged={data.reload} />
    </div>
  )
}
