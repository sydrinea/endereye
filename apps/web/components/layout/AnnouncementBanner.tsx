import Link from 'next/link'

interface Props {
  label: string
  href: string
  variant?: 'info' | 'warning'
}

export function AnnouncementBanner({ label, href, variant = 'info' }: Props) {
  const styles =
    variant === 'warning'
      ? 'border-orange-800/60 bg-orange-950/50 text-orange-300 hover:text-orange-200 hover:bg-orange-950/70'
      : 'border-indigo-900/80 bg-indigo-950/60 text-indigo-300 hover:text-indigo-200 hover:bg-indigo-950/80'
  const dotColor = variant === 'warning' ? 'bg-orange-400' : 'bg-indigo-400'

  return (
    <Link
      href={href}
      className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 border-b ${styles} transition-colors`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
      <span className="text-sm font-mono">{label}</span>
    </Link>
  )
}
