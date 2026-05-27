import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

type Crumb = { label: string; href?: string }

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1 text-sm text-zinc-500">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-zinc-700" />}
            {item.href ? (
              <Link href={item.href} className="hover:text-zinc-300 transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className="text-zinc-400">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
