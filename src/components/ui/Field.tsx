import type { ReactNode } from 'react'

interface FieldControlProps {
  id: string
  'aria-invalid': boolean
  'aria-describedby': string | undefined
}

interface Props {
  id: string
  label: string
  required?: boolean
  optionalLabel?: boolean
  hint?: string
  error?: string
  children: (props: FieldControlProps) => ReactNode
}

/** Etiket, ipucu ve hata mesajını girdiye erişilebilir biçimde bağlar. */
export function Field({ id, label, required, optionalLabel, hint, error, children }: Props) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
        {required && <span className="text-accent" aria-hidden> *</span>}
        {optionalLabel && <span className="font-normal text-muted"> (isteğe bağlı)</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && <p id={hintId} className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export const inputClass =
  'block min-h-[2.75rem] w-full rounded-lg border border-line bg-bg px-3 py-2 text-base text-fg placeholder:text-subtle ' +
  'transition-colors hover:border-fg/30 focus-visible:border-accent aria-[invalid=true]:border-danger sm:text-sm'

export const selectClass = `${inputClass} appearance-auto pr-8`
