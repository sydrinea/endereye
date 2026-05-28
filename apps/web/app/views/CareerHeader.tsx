'use client'

import { Breadcrumbs, PlayerAvatar } from '@/components/ui'
import type { CareerContext } from '@/lib/career-data'
import { Expand } from 'lucide-react'
import { useCareerModal } from './CareerModal'

export function CareerHeader({ career }: { career: CareerContext }) {
  const inModal = useCareerModal()
  return (
    <div className="text-zinc-400">
        <div className="flex flex-col gap-4">
          {inModal && (
            <button
              onClick={() => { window.location.href = `/players/${career.nickname}` }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Open full page"
            >
              <Expand size={16} />
            </button>
          )}
          {!inModal && <Breadcrumbs
            items={[
              { label: 'Home', href: '/' },
              { label: 'Players', href: '/players' },
              { label: career.nickname },
            ]}
          />}
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
