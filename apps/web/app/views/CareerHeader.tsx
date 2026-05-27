import { Breadcrumbs, PlayerAvatar } from '@/components/ui'
import type { CareerContext } from '@/lib/career-data'

export function CareerHeader({ career }: { career: CareerContext }) {
  return (
    <div className="text-zinc-400">
        <div className="flex flex-col gap-4">
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/' },
              { label: 'Players', href: '/players' },
              { label: career.nickname },
            ]}
          />
          <div className="flex items-center gap-4">
            <PlayerAvatar nickname={career.nickname} size="lg" />
            <div>
              <h1 className="font-display text-3xl text-zinc-100">{career.nickname}</h1>
              {career.country && <p className="text-sm text-zinc-500 mt-0.5">{career.country}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {career.events.map((e) => (
              <div
                key={e.label}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-zinc-800 bg-zinc-900"
                style={{ color: e.color }}
              >
                {e.label}
              </div>
            ))}
          </div>
        </div>
      </div>
  )
}
