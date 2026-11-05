import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Telefonda ekranın altından açılır (yönetim paneli). Masaüstünde normal pencere kalır. */
  sheet?: boolean
}

/**
 * Yerel <dialog> öğesi: odak tuzağı, Esc ile kapanma ve arka plan erişilemezliği tarayıcı tarafından sağlanır.
 * Açılışta odak başlığa, kapanışta tetikleyen öğeye döner.
 */
export function Dialog({ open, onClose, title, children, sheet = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className={`m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-line bg-surface p-0 text-fg shadow-card ${sheet ? 'sheet-rise max-lg:mb-0 max-lg:w-full max-lg:max-w-none max-lg:rounded-b-none max-lg:rounded-t-2xl max-lg:border-x-0 max-lg:border-b-0' : ''}`}
    >
      {open && (
        <div className={`max-h-[85vh] overflow-y-auto p-5 sm:p-6 ${sheet ? 'max-lg:max-h-[90dvh] max-lg:pb-[calc(1.25rem+env(safe-area-inset-bottom))]' : ''}`}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg sm:text-xl">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-fg"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
