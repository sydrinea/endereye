interface Props {
  children: React.ReactNode
  className?: string
}

export function Label({ children, className }: Props) {
  return (
    <span className={`text-xs uppercase tracking-widest text-zinc-500 ${className ?? ''}`}>
      {children}
    </span>
  )
}
