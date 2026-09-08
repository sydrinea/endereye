'use client'

import { useState } from 'react'
import { Tabs } from '@/components/ui/Tabs'
import { EventCard } from '@/app/views/EventCard'
import type { EventConfig, EventKind } from '@/lib/events-config'

const KIND_ORDER: { kind: EventKind; label: string }[] = [
  { kind: 'lcq', label: 'LCQ' },
  { kind: 'mss', label: 'MSS' },
  { kind: 'worlds', label: 'Worlds' },
]

export function HostEvents({ events }: { events: EventConfig[] }) {
  const groups = KIND_ORDER.map(({ kind, label }) => ({
    kind,
    label,
    events: events
      .filter((e) => e.kind === kind)
      .sort((a, b) => b.startDate.getTime() - a.startDate.getTime()),
  })).filter((g) => g.events.length > 0)

  const [active, setActive] = useState<EventKind>(groups[0]?.kind ?? 'lcq')

  if (groups.length === 0) {
    return <p className="text-sm text-zinc-500">No events yet.</p>
  }

  const current = groups.find((g) => g.kind === active) ?? groups[0]

  return (
    <div className="flex flex-col gap-4">
      {groups.length > 1 && (
        <Tabs
          tabs={groups.map((g) => ({ label: `${g.label} (${g.events.length})`, value: g.kind }))}
          value={current.kind}
          onChange={(v) => setActive(v as EventKind)}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 justify-items-center sm:justify-items-stretch">
        {current.events.map((e) => (
          <EventCard key={e.slug} event={e} />
        ))}
      </div>
    </div>
  )
}
