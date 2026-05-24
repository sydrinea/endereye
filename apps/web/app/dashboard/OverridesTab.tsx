/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useState, useTransition, useEffect } from 'react'
import { ArrowLeft, Pencil } from 'lucide-react'
import { getEventDataForOverridesAction, saveOverridesAction } from './actions'
import type { EventOverrideData } from './actions'
import type { R2EventConfig } from '../../lib/events-config'
import { Label } from '@/components/ui/Label'
import { Spinner } from '../views/Spinner'
import { DashboardCard } from './DashboardCard'

interface Props {
  events: R2EventConfig[]
}

type View = { kind: 'seeds' } | { kind: 'editor'; seedIndex: number }

export function OverridesTab({ events }: Props) {
  const [selectedSlug, setSelectedSlug] = useState(events[events.length - 1]?.slug ?? '')
  const [eventData, setEventData] = useState<EventOverrideData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'seeds' })
  const [isPending, startTransition] = useTransition()

  const selectedEvent = events.find((e) => e.slug === selectedSlug)

  useEffect(() => {
    if (!selectedEvent) return
    setEventData(null)
    setLoadError(null)
    setView({ kind: 'seeds' })
    getEventDataForOverridesAction(selectedEvent.prefix).then((result) => {
      if ('error' in result) setLoadError(result.error)
      else setEventData(result)
    })
  }, [selectedSlug, selectedEvent])

  const seedCount = eventData
    ? Math.max(...eventData.players.map((p) => p.seedScores.length), 0)
    : 0

  const availableSeeds = Array.from({ length: seedCount }, (_, i) => i).filter((i) =>
    eventData?.players.some((p) => p.seedScores[i] !== null),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Label>Event</Label>
        <select
          value={selectedSlug}
          onChange={(e) => {
            setSelectedSlug(e.target.value)
            setView({ kind: 'seeds' })
          }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
        >
          {events.map((ev) => (
            <option key={ev.slug} value={ev.slug}>
              {ev.label} (season {ev.season})
            </option>
          ))}
        </select>
      </div>

      {loadError && <p className="text-red-400 text-sm">{loadError}</p>}

      {!eventData && !loadError && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {eventData && view.kind === 'seeds' && (
        <SeedSelector
          availableSeeds={availableSeeds}
          overrides={eventData.overrides}
          onSelect={(seedIndex) => setView({ kind: 'editor', seedIndex })}
        />
      )}

      {eventData && view.kind === 'editor' && selectedEvent && (
        <SeedEditor
          seedIndex={view.seedIndex}
          eventData={eventData}
          event={selectedEvent}
          isPending={isPending}
          startTransition={startTransition}
          onBack={() => setView({ kind: 'seeds' })}
          onSaved={(updated) =>
            setEventData((prev) => (prev ? { ...prev, overrides: updated } : prev))
          }
        />
      )}
    </div>
  )
}

function SeedSelector({
  availableSeeds,
  overrides,
  onSelect,
}: {
  availableSeeds: number[]
  overrides: EventOverrideData['overrides']
  onSelect: (seedIndex: number) => void
}) {
  if (availableSeeds.length === 0) {
    return <p className="text-sm text-zinc-500">No seeds uploaded for this event yet.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Seeds</Label>
      {availableSeeds.map((seedIndex) => {
        const overrideCount = Object.values(overrides).filter(
          (playerOverrides) => playerOverrides[String(seedIndex)] !== undefined,
        ).length
        return (
          <DashboardCard
            key={seedIndex}
            left={
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-zinc-100">Seed {seedIndex + 1}</span>
                {overrideCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <Pencil size={10} />
                    {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            }
            right={
              <button
                type="button"
                onClick={() => onSelect(seedIndex)}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer px-2 py-1"
              >
                Edit
              </button>
            }
          />
        )
      })}
    </div>
  )
}

function SeedEditor({
  seedIndex,
  eventData,
  event,
  isPending,
  startTransition,
  onBack,
  onSaved,
}: {
  seedIndex: number
  eventData: EventOverrideData
  event: R2EventConfig
  isPending: boolean
  startTransition: (fn: () => void) => void
  onBack: () => void
  onSaved: (updated: EventOverrideData['overrides']) => void
}) {
  const seedKey = String(seedIndex)

  // local state: uuid → input value (string for controlled input)
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const p of eventData.players) {
      const existing = eventData.overrides[p.uuid]?.[seedKey]
      const original = p.seedScores[seedIndex]
      if (original === null) continue
      init[p.uuid] = existing !== undefined ? String(existing) : String(original)
    }
    return init
  })

  const relevantPlayers = eventData.players.filter((p) => p.seedScores[seedIndex] !== null)

  function handleSave() {
    startTransition(async () => {
      // Build new overrides: start from existing, update this seed's entries
      const next = { ...eventData.overrides }
      for (const p of relevantPlayers) {
        const original = p.seedScores[seedIndex]!
        const inputVal = Number(inputs[p.uuid])
        if (isNaN(inputVal)) continue
        if (inputVal === original) {
          // Clear override for this seed
          if (next[p.uuid]) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [seedKey]: _, ...rest } = next[p.uuid]
            if (Object.keys(rest).length === 0) {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { [p.uuid]: __, ...players } = next
              Object.assign(next, players)
              delete next[p.uuid]
            } else {
              next[p.uuid] = rest
            }
          }
        } else {
          next[p.uuid] = { ...(next[p.uuid] ?? {}), [seedKey]: inputVal }
        }
      }
      const res = await saveOverridesAction(event.prefix, event.season, next)
      if (res.ok) {
        onSaved(next)
        alert('Overrides saved.')
      } else {
        alert(`Error: ${res.error}`)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors w-fit cursor-pointer"
      >
        <ArrowLeft size={14} />
        Back to seeds
      </button>

      <h2 className="font-display text-lg text-zinc-100">Seed {seedIndex + 1} — Point Overrides</h2>

      <div className="flex flex-col gap-0">
        <div className="grid grid-cols-[1fr_6rem_6rem] gap-2 px-1 pb-1">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Player</span>
          <span className="text-xs text-zinc-500 uppercase tracking-wider text-right">
            Original
          </span>
          <span className="text-xs text-zinc-500 uppercase tracking-wider text-right">
            Override
          </span>
        </div>
        {relevantPlayers.map((p) => {
          const original = p.seedScores[seedIndex]!
          const currentInput = inputs[p.uuid] ?? String(original)
          const isOverridden = Number(currentInput) !== original && !isNaN(Number(currentInput))
          return (
            <div
              key={p.uuid}
              className="grid grid-cols-[1fr_6rem_6rem] gap-2 items-center bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 mb-2"
            >
              <span className="text-sm text-zinc-100">{p.nickname}</span>
              <span
                className={`text-sm text-right font-mono ${isOverridden ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}
              >
                {original}
              </span>
              <input
                type="number"
                min={0}
                max={24}
                value={currentInput}
                onChange={(e) => setInputs((prev) => ({ ...prev, [p.uuid]: e.target.value }))}
                className={`text-sm text-right font-mono rounded-lg px-2 py-1 border focus:outline-none focus:border-zinc-500 w-full ${
                  isOverridden
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              />
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="flex items-center justify-center w-20 h-9 bg-accent/15 text-accent rounded-lg px-4 text-sm font-medium hover:bg-accent/20 disabled:opacity-40 transition-colors cursor-pointer"
      >
        {isPending ? <Spinner size={18} /> : 'Save'}
      </button>
    </div>
  )
}
