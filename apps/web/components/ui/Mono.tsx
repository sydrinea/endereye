interface Props {
  children: React.ReactNode
  className?: string
}

export function Mono({ children, className }: Props) {
  return <span className={`font-mono tabular-nums ${className ?? ''}`}>{children}</span>
}
