'use client'

import type { EventPlayer } from '@endereye/core'
import { PlayerCard } from './PlayerCard'

export function PlayersPanel({
  players,
  filteredNicknames,
}: {
  players: EventPlayer[]
  filteredNicknames: string[]
}) {
  const filterSet = filteredNicknames.length > 0 ? new Set(filteredNicknames) : null
  const visible = (filterSet ? players.filter((p) => filterSet.has(p.nickname)) : players)
    .slice()
    .sort((a, b) => a.nickname.localeCompare(b.nickname, undefined, { numeric: true, sensitivity: 'base' }))

  if (visible.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-8 text-center">No players match the current filter.</p>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 pb-8">
      {visible.map((p) => (
        <PlayerCard key={p.uuid} uuid={p.uuid} nickname={p.nickname} />
      ))}
    </div>
  )
}
