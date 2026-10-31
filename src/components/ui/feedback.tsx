import { AlertTriangle, CheckCircle2, Loader2, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

export function Spinner({ label = 'Yükleniyor…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger/[0.08] p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-danger">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} icon={<RotateCw className="h-4 w-4" aria-hidden />}>
          Tekrar dene
        </Button>
      )}
    </div>
  )
}

/** Sunucunun onayladığı bir işlemden sonra gösterilir. */
export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-success/35 bg-success/[0.08] p-3 text-sm text-success">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="rounded-lg border border-warning/40 bg-warning/[0.08] p-4 text-sm text-fg">
      {children}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{children}</p>
}
