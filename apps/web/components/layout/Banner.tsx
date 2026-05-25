import { Info } from 'lucide-react'

interface Props {
  label: string
  detail?: string
  variant?: 'info' | 'danger'
  showDot?: boolean
}

const styles = {
  info: {
    container: 'border-indigo-900/80 bg-indigo-950/60',
    label: 'text-indigo-300',
    dot: 'bg-indigo-300',
    detail: 'text-indigo-300',
  },
  danger: {
    container: 'border-must-clutch/30 bg-must-clutch/5',
    label: 'text-must-clutch',
    dot: 'bg-must-clutch',
    detail: 'text-must-clutch/60',
  },
}

export function Banner({ label, detail, variant = 'info', showDot = true }: Props) {
  const style = styles[variant]

  // When showDot is false, only show detail without label
  if (!showDot) {
    return (
      <div
        className={`flex flex-col lg:flex-row lg:items-center lg:justify-between gap-0.5 px-4 py-2 rounded-xl border ${style.container}`}
      >
        {detail && <span className={`text-xs ${style.detail}`}>{detail}</span>}
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col lg:flex-row lg:items-center lg:justify-between gap-0.5 px-4 py-2 rounded-xl border ${style.container}`}
    >
      <span className={`inline-flex items-center gap-2 text-sm font-mono ${style.label}`}>
        {variant === 'info' ? (
          <Info className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`} />
        )}
        {label}
      </span>
      {detail && (
        <span
          className={`text-xs lg:pl-0 ${variant === 'info' ? 'pl-5.5' : 'pl-3.5'} ${style.detail}`}
        >
          {detail}
        </span>
      )}
    </div>
  )
}
