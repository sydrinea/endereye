interface Props {
  label: string
  detail?: string
}

export function CutBanner({ label, detail }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 px-4 py-2 rounded-xl border border-must-clutch/30 bg-must-clutch/5">
      <span className="inline-flex items-center gap-2 text-must-clutch text-sm font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-must-clutch shrink-0" />
        {label}
      </span>
      {detail && (
        <span className="text-must-clutch/60 text-xs pl-3.5 sm:pl-0">{detail}</span>
      )}
    </div>
  )
}
