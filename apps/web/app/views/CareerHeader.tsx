import Link from 'next/link'
import { PlayerAvatar } from '@/components/ui'
import { Surface } from '@/components/layout'
import type { CareerContext } from '@/lib/career-data'
import { BackButton } from './BackButton'

export function CareerHeader({ career }: { career: CareerContext }) {
  return (
    <>
      <div className="w-full px-4 lg:px-8 pt-4">
        <BackButton />
      </div>
      <Surface width="xl">
        <div className="flex flex-col gap-4 pt-4 pb-4">
          <div className="flex items-center gap-4">
            <PlayerAvatar nickname={career.nickname} size="lg" />
            <div>
              <h1 className="font-display text-3xl text-zinc-100">{career.nickname}</h1>
              {career.country && <p className="text-sm text-zinc-500 mt-0.5">{career.country}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {career.events.map((e) => (
              <Link
                key={e.label}
                href={e.path}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-zinc-800 bg-zinc-900 hover:border-zinc-700 transition-colors"
                style={{ color: e.color }}
              >
                {e.label}
              </Link>
            ))}
          </div>
        </div>
      </Surface>
    </>
  )
}
