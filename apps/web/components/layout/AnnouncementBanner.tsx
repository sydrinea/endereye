import Link from 'next/link'

interface Props {
  label: string
  href: string
}

export function AnnouncementBanner({ label, href }: Props) {
  return (
    <div className="w-full flex justify-center px-4 pt-4 pb-16 sm:pb-0">
      <Link
        href={href}
        className="group w-full max-w-md flex items-center justify-center gap-2 px-4 py-2.5
          rounded-xl border border-indigo-900/80 bg-indigo-950/60
          text-indigo-300 hover:text-indigo-200 hover:bg-indigo-950/80
          transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
        <span className="text-sm font-mono">{label}</span>
      </Link>
    </div>
  )
}
