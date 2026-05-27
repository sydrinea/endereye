import Link from 'next/link'
import Ranked from '@/components/icons/Ranked'
import { ExternalLink, Heart } from 'lucide-react'

export function Footer() {
  return (
    <footer className="mt-16 border-t border-zinc-800 bg-zinc-900">
      <div className="mx-auto max-w-5xl px-6 py-12 flex flex-col gap-8">
        <div className="flex flex-col items-start gap-3">
          <Ranked size={80} />
          <span className="font-display text-3xl text-zinc-100">endereye</span>
          <p className="text-sm text-zinc-500">
            survival analytics for MCSR Ranked LCQ and MSS events
          </p>
        </div>

        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between text-sm text-zinc-500">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/method" className="hover:text-zinc-300 transition-colors">
                Methodology
              </Link>
              <Link href="/players" className="hover:text-zinc-300 transition-colors">
                Players
              </Link>
              <Link href="/finalists" className="hover:text-zinc-300 transition-colors">
                Finalists
              </Link>
            </div>
            <div className="group flex items-center gap-1 cursor-pointer w-fit">
              <a
                href="https://mcsrranked.com"
                target="_blank"
                rel="noopener noreferrer"
                className="group-hover:text-zinc-300 transition-colors"
              >
                mcsrranked.com
              </a>
              <ExternalLink size={12} className="group-hover:text-zinc-300 transition-colors" />
            </div>
          </div>

          <div className="flex flex-col gap-3 text-zinc-600 md:items-end">
            <span>not affiliated with MCSR Ranked</span>
            <span className="flex items-center gap-1">
              made with <Heart size={12} fill="currentColor" /> by sydrinea
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
