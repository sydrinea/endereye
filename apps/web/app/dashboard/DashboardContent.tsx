'use client'

import dynamic from 'next/dynamic'
import { useState, useTransition, useEffect } from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import Link from 'next/link'
import {
  uploadMatchesAction,
  updateEventsConfigAction,
  deleteEventAction,
  getEventMatchIdsAction,
  deleteMatchAction,
} from './actions'
import type { R2EventConfig } from '../../lib/events-config'
import { Spinner } from '../views/Spinner'
import { Tabs } from '@/components/ui/Tabs'
import { Label } from '@/components/ui/Label'
import { Pill } from '@/components/ui'
import { Surface } from '@/components/layout/Surface'
import { DashboardCard } from './DashboardCard'
import { OverridesTab } from './OverridesTab'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Spinner />
    </div>
  ),
})

interface Props {
  events: R2EventConfig[]
  initialConfigJson: string
}

type Tab = 'matches' | 'config' | 'overrides'

const TABS = [
  { label: 'Matches', value: 'matches' },
  { label: 'Events Config', value: 'config' },
  { label: 'Overrides', value: 'overrides' },
]

export function DashboardContent({ events, initialConfigJson }: Props) {
  const [tab, setTab] = useState<Tab>('matches')
  const [selectedSlug, setSelectedSlug] = useState(events[events.length - 1]?.slug ?? '')
  const [matchInput, setMatchInput] = useState('')
  const [matchIds, setMatchIds] = useState<number[]>([])
  const [configJson, setConfigJson] = useState(initialConfigJson)
  const [isPending, startTransition] = useTransition()

  const selectedEvent = events.find((e) => e.slug === selectedSlug)

  useEffect(() => {
    if (!selectedEvent) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatchIds([])
    getEventMatchIdsAction(selectedEvent.prefix).then(setMatchIds)
  }, [selectedSlug, selectedEvent])

  function refreshMatchIds() {
    if (!selectedEvent) return
    getEventMatchIdsAction(selectedEvent.prefix).then(setMatchIds)
  }

  function parseMatchIds(input: string): number[] {
    return input
      .split(/[\s,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0)
  }

  function handleMatchUpload(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedEvent) return
    const ids = parseMatchIds(matchInput)
    if (ids.length === 0) {
      alert('No valid match IDs found')
      return
    }
    startTransition(async () => {
      const res = await uploadMatchesAction(
        selectedEvent.season,
        selectedEvent.prefix,
        ids,
        selectedEvent.noBonus ?? false,
        selectedEvent.kind,
        selectedEvent.qualifyCount,
      )
      if (res.ok) {
        alert(
          `Uploaded ${res.newCount} new match${res.newCount !== 1 ? 'es' : ''}. Total: ${res.matchCount}`,
        )
        setMatchInput('')
        refreshMatchIds()
      } else {
        alert(`Error: ${res.error}`)
      }
    })
  }

  function handleDeleteMatch(matchId: number) {
    if (!selectedEvent) return
    startTransition(async () => {
      const res = await deleteMatchAction(
        selectedEvent.season,
        selectedEvent.prefix,
        matchId,
        selectedEvent.noBonus ?? false,
        selectedEvent.qualifyCount,
      )
      if (!res.ok) alert(`Error: ${res.error}`)
      else refreshMatchIds()
    })
  }

  function handleConfigSave() {
    startTransition(async () => {
      const res = await updateEventsConfigAction(configJson)
      if (!res.ok) alert(`Error: ${res.error}`)
    })
  }

  function handleDeleteEvent(slug: string, label: string) {
    if (!confirm(`Delete event "${label}"? This cannot be undone.`)) return
    startTransition(async () => {
      const res = await deleteEventAction(slug)
      if (res.ok) setConfigJson(res.configJson)
      else alert(`Error: ${res.error}`)
    })
  }

  let parsedEvents: R2EventConfig[] | null = null
  try {
    parsedEvents = JSON.parse(configJson) as R2EventConfig[]
  } catch {
    parsedEvents = null
  }

  const matchCards = matchIds.map((id, i) => ({ id, seed: i + 1 })).reverse()

  return (
    <Surface width="sm" as="main">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-zinc-100">Dashboard</h1>
          <Link
            href="/"
            className="inline-flex gap-1.5 items-center text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft size={12} /> back to site
          </Link>
        </div>

        <Tabs tabs={TABS} value={tab} onChange={(v) => setTab(v as Tab)} />

        {tab === 'matches' && (
          <div className="flex flex-col gap-6">
            <form onSubmit={handleMatchUpload} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Label>Event</Label>
                <select
                  value={selectedSlug}
                  onChange={(e) => setSelectedSlug(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
                >
                  {events
                    .sort((a, b) => (new Date(a.startDate) > new Date(b.startDate) ? 1 : -1))
                    .map((ev) => (
                      <option key={ev.slug} value={ev.slug}>
                        {ev.label} (season {ev.season})
                      </option>
                    ))}
                </select>
              </div>

              {selectedEvent && (
                <div className="flex gap-2 flex-wrap">
                  <Pill>{selectedEvent.kind}</Pill>
                  {selectedEvent.noBonus && <Pill>no bonus points</Pill>}
                  {selectedEvent.qualifyCount !== undefined && (
                    <Pill>top {selectedEvent.qualifyCount} qualify</Pill>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <Label>Match IDs</Label>
                <textarea
                  value={matchInput}
                  onChange={(e) => setMatchInput(e.target.value)}
                  placeholder={
                    'Enter match IDs separated by commas, spaces, or newlines\ne.g. 10343310, 10343320, 10343330'
                  }
                  rows={4}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 font-mono focus:outline-none focus:border-zinc-600 resize-y"
                />
                {matchInput && (
                  <span className="text-xs text-zinc-500">
                    {parseMatchIds(matchInput).length} ID
                    {parseMatchIds(matchInput).length !== 1 ? 's' : ''} parsed
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={isPending || !selectedEvent || matchInput.trim() === ''}
                className="flex items-center justify-center w-24 h-9 bg-accent/15 text-accent rounded-lg px-4 text-sm font-medium hover:bg-accent/20 disabled:opacity-40 transition-colors cursor-pointer"
              >
                {isPending ? <Spinner size={18} /> : 'Upload'}
              </button>
            </form>

            {matchCards.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label>Stored matches ({matchCards.length})</Label>
                {matchCards.map(({ id, seed }) => (
                  <DashboardCard
                    key={id}
                    left={
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-zinc-400 w-14">Seed {seed}</span>
                        <span className="font-mono text-sm text-zinc-100">{id}</span>
                      </div>
                    }
                    right={
                      <button
                        type="button"
                        onClick={() => handleDeleteMatch(id)}
                        disabled={isPending}
                        className="flex items-center justify-center rounded-lg px-2 py-2 text-must-clutch hover:bg-must-clutch/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title="Delete match"
                      >
                        <Trash2 size={14} />
                      </button>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'config' && (
          <div className="flex flex-col gap-4">
            <div
              className="rounded-xl overflow-hidden border border-zinc-800"
              style={{ height: 400 }}
            >
              <MonacoEditor
                height={400}
                language="json"
                theme="vs-dark"
                loading={
                  <div className="flex items-center justify-center h-full">
                    <Spinner />
                  </div>
                }
                value={configJson}
                onChange={(v) => setConfigJson(v ?? '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  tabSize: 2,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                }}
              />
            </div>

            <button
              onClick={handleConfigSave}
              disabled={isPending}
              className="flex items-center justify-center w-20 h-9 bg-accent/15 text-accent rounded-lg px-4 text-sm font-medium hover:bg-accent/20 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {isPending ? <Spinner size={18} /> : 'Save'}
            </button>

            {parsedEvents === null ? (
              <p className="text-red-400 text-sm">Invalid JSON — fix before saving</p>
            ) : (
              <div className="flex flex-col gap-2">
                <Label>Current events ({parsedEvents.length})</Label>
                {parsedEvents.map((ev) => (
                  <DashboardCard
                    key={ev.slug}
                    left={
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-zinc-100">{ev.label}</span>
                        <span className="text-xs text-zinc-500">
                          {ev.slug} · season {ev.season} · starts{' '}
                          {new Date(ev.startDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            timeZone: 'UTC',
                            timeZoneName: 'short',
                          })}
                        </span>
                      </div>
                    }
                    right={
                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(ev.slug, ev.label)}
                        disabled={isPending}
                        className="flex items-center justify-center rounded-lg px-2 py-2 text-must-clutch hover:bg-must-clutch/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title="Delete event"
                      >
                        <Trash2 size={14} />
                      </button>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'overrides' && <OverridesTab events={events} />}
      </div>
    </Surface>
  )
}
