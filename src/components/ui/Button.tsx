import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  icon?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors duration-150 ' +
  'disabled:cursor-not-allowed disabled:opacity-45 select-none whitespace-nowrap'

const variants: Record<Variant, string> = {
  primary: 'border-accent bg-accent text-accent-fg hover:border-accent-hover hover:bg-accent-hover',
  secondary: 'border-line bg-transparent text-fg hover:border-fg/30 hover:bg-raised',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-raised hover:text-fg',
  danger: 'border-danger bg-danger text-bg hover:brightness-110',
}

const sizes = {
  sm: 'min-h-[2.25rem] px-3 text-sm',
  md: 'min-h-[2.75rem] px-4 text-sm',
  lg: 'min-h-[3rem] px-6 text-base',
}

export function Button({ variant = 'primary', loading, icon, size = 'md', className = '', children, disabled, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}
