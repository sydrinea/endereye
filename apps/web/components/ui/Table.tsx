export function Table({
  children,
  cols = '4rem 1fr 7rem 16rem',
}: {
  children: React.ReactNode
  cols?: string
}) {
  return (
    <div
      className="flex flex-col gap-1.5"
      style={{ '--table-cols': cols } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="hidden lg:grid items-center gap-4 grid-cols-(--table-cols) rounded-lg px-4 py-3.5 bg-zinc-950 border border-zinc-700/60"
    >
      {children}
    </div>
  )
}

export function TableHeaderCell({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`font-display text-sm text-zinc-400 ${className ?? ''}`}>{children}</div>
  )
}

export function TableRow({
  children,
  accentColor,
  className,
}: {
  children: React.ReactNode
  accentColor?: string
  className?: string
}) {
  return (
    <div
      className={`row-card grid items-center gap-4 rounded-lg px-4 py-3.5 backdrop-blur-sm grid-cols-[1fr] lg:grid-cols-(--table-cols) ${className ?? ''}`}
      style={accentColor ? { '--accent': accentColor } as React.CSSProperties : undefined}
    >
      {children}
    </div>
  )
}

export function TableCell({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return <div className={className}>{children}</div>
}
