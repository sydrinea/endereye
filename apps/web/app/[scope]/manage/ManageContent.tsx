'use client'

import { useState, useTransition, useEffect } from 'react'
import { Trash2, Pencil, Plus, LogOut, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth-client'
import {
  uploadMatchesAction,
  deleteMatchAction,
  getEventMatchIdsAction,
  createEventAction,
  updateEventAction,
  deleteEventAction,
  type EventInput,
} from './actions'
import type { EventConfig, EventKind } from '@/lib/events-config'
import { Spinner } from '@/app/views/Spinner'
import { HostAvatar } from '@/app/views/HostAvatar'
import { Tabs } from '@/components/ui/Tabs'
import { Label, Breadcrumbs, Pill, DateTimeField } from '@/components/ui'
import { ManageCard } from './ManageCard'
import { OverridesTab } from './OverridesTab'
import { inputCls, pillCls, btnCls, ghostBtnCls } from './styles'

interface Props {
  handle: string
  image: string | null
  isOfficial: boolean
  currentSeason: number
  events: EventConfig[]
}

type Tab = 'events' | 'matches' | 'overrides'
const TABS = [
  { label: 'Events', value: 'events' },
  { label: 'Matches', value: 'matches' },
  { label: 'Overrides', value: 'overrides' },
]


export function ManageContent({ handle, image, isOfficial, currentSeason, events }: Props) {
  const [tab, setTab] = useState<Tab>('events')
  const router = useRouter()

  return (
    <main className="flex flex-col items-center px-6 py-8 gap-6">
      <div className="w-full max-w-4xl flex flex-col gap-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: `@${handle}`, href: `/@${handle}` },
            { label: 'Manage' },
          ]}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <HostAvatar handle={handle} image={image} />
            <div className="flex flex-col">
              <h1 className="font-display text-3xl text-zinc-100 flex items-center gap-2">
                @{handle}
                {isOfficial && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 font-sans text-xs font-medium text-accent">
                    Official
                  </span>
                )}
              </h1>
              <span className="text-sm text-zinc-500">manage console</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a href={`/@${handle}`} className={pillCls}>
              <ArrowLeft size={13} /> Profile
            </a>
            <button
              type="button"
              onClick={async () => {
                await signOut()
                router.push('/')
              }}
              className={pillCls}
            >
              <LogOut size={13} /> Log out
            </button>
          </div>
        </div>

        <Tabs tabs={TABS} value={tab} onChange={(v) => setTab(v as Tab)} />

        {tab === 'events' && (
          <EventsTab
            handle={handle}
            isOfficial={isOfficial}
            currentSeason={currentSeason}
            events={events}
          />
        )}
        {tab === 'matches' && <MatchesTab handle={handle} events={events} />}
        {tab === 'overrides' && <OverridesTab handle={handle} events={events} />}
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Events tab — CRUD over the D1 rows
// ---------------------------------------------------------------------------

function EventsTab({ handle, isOfficial, currentSeason, events }: Omit<Props, 'image'>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)

  const sorted = [...events].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) alert(`Error: ${res.error}`)
      else {
        after?.()
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <EventForm
          currentSeason={currentSeason}
          isOfficial={isOfficial}
          submitLabel="Create"
          disabled={isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(input) =>
            run(
              () => createEventAction(handle, input),
              () => setCreating(false),
            )
          }
        />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className={`${pillCls} w-fit`}>
          <Plus size={14} /> New event
        </button>
      )}

      {sorted.length === 0 && !creating && <p className="text-sm text-zinc-500">No events yet.</p>}

      <div className="flex flex-col gap-2">
        {sorted.map((ev) => (
          <div key={ev.slug} className="flex flex-col gap-2">
            <ManageCard
              left={
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                    {ev.label}
                    {ev.published === false && <Pill>unlisted</Pill>}
                  </span>
                  <span className="text-xs text-zinc-500" suppressHydrationWarning>
                    {ev.slug} · {ev.kind} S{ev.season} ·{' '}
                    {ev.startDate.toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              }
              right={
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingSlug(editingSlug === ev.slug ? null : ev.slug)}
                    disabled={isPending}
                    className="flex items-center justify-center rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete "${ev.label}"? This cannot be undone.`))
                        run(() => deleteEventAction(handle, ev.slug))
                    }}
                    disabled={isPending}
                    className="flex items-center justify-center rounded-lg p-2 text-must-clutch hover:bg-must-clutch/10 disabled:opacity-40 transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              }
            />
            {editingSlug === ev.slug && (
              <EventForm
                currentSeason={currentSeason}
                isOfficial={isOfficial}
                initial={ev}
                submitLabel="Save"
                disabled={isPending}
                onCancel={() => setEditingSlug(null)}
                onSubmit={(input) =>
                  run(
                    () => updateEventAction(handle, ev.slug, input),
                    () => setEditingSlug(null),
                  )
                }
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Radio group styled like the text inputs — green accent on the selected option. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            value === o.value
              ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
              : 'border-zinc-800 bg-zinc-900 text-zinc-500 not-disabled:hover:border-zinc-700 not-disabled:hover:text-zinc-300 not-disabled:cursor-pointer'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function EventForm({
  isOfficial,
  initial,
  currentSeason,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
}: {
  isOfficial: boolean
  initial?: EventConfig
  currentSeason: number
  submitLabel: string
  disabled: boolean
  onSubmit: (input: EventInput) => void
  onCancel: () => void
}) {
  const isEdit = !!initial
  const [label, setLabel] = useState(initial?.label ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [season, setSeason] = useState(String(initial?.season ?? currentSeason))
  const [startDate, setStartDate] = useState<Date>(initial?.startDate ?? new Date())
  const [qualifyCount, setQualifyCount] = useState(String(initial?.qualifyCount ?? 4))
  const [noBonus, setNoBonus] = useState(initial?.noBonus ?? !isOfficial)
  const [published, setPublished] = useState(initial?.published ?? true)
  const [kind, setKind] = useState<EventKind>(initial?.kind ?? 'mss')
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      slug,
      label,
      season: Number(season),
      startDate: startDate.toISOString(),
      qualifyCount: qualifyCount.trim() === '' ? null : Number(qualifyCount),
      noBonus,
      published,
      kind,
      ...(isOfficial ? { endpoint: endpoint.trim() || null } : {}),
    })
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 col-span-2">
          <Label>Label</Label>
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Slug</Label>
          <input
            className={inputCls}
            value={slug}
            disabled={isEdit}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="spring-invitational"
          />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Season</Label>
          <input
            type="number"
            className={inputCls}
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1">
          <Label>Start</Label>
          <DateTimeField value={startDate} onChange={setStartDate} />
        </div>
        <label className="flex flex-col gap-1">
          <Label>Qualify count</Label>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={qualifyCount}
            onChange={(e) => setQualifyCount(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1">
          <Label>Kind</Label>
          <Segmented
            options={
              isOfficial
                ? [
                    { label: 'lcq', value: 'lcq' },
                    { label: 'mss', value: 'mss' },
                    { label: 'worlds', value: 'worlds' },
                  ]
                : [
                    { label: 'lcq', value: 'lcq' },
                    { label: 'mss', value: 'mss' },
                  ]
            }
            value={kind}
            onChange={setKind}
            disabled={isEdit}
          />
        </div>
        {isOfficial && (
          <label className="flex flex-col gap-1 col-span-2">
            <Label>Autofetch endpoint</Label>
            <input
              className={inputCls}
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="tourneys/qualifiers_s11"
            />
          </label>
        )}
        <div className="flex flex-col gap-1">
          <Label>Bonus points</Label>
          <Segmented
            options={[
              { label: 'On', value: 'on' },
              { label: 'Off', value: 'off' },
            ]}
            value={noBonus ? 'off' : 'on'}
            onChange={(v) => setNoBonus(v === 'off')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Visibility</Label>
          <Segmented
            options={[
              { label: 'Public', value: 'public' },
              { label: 'Unlisted', value: 'unlisted' },
            ]}
            value={published ? 'public' : 'unlisted'}
            onChange={(v) => setPublished(v === 'public')}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={disabled} className={btnCls}>
          {disabled ? <Spinner size={18} /> : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={ghostBtnCls}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Matches tab
// ---------------------------------------------------------------------------

function MatchesTab({ handle, events }: { handle: string; events: EventConfig[] }) {
  const [selectedSlug, setSelectedSlug] = useState(events[events.length - 1]?.slug ?? '')
  const [matchInput, setMatchInput] = useState('')
  const [matchIds, setMatchIds] = useState<number[]>([])
  const [isPending, startTransition] = useTransition()

  const selectedEvent = events.find((e) => e.slug === selectedSlug)

  useEffect(() => {
    if (!selectedEvent) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatchIds([])
    getEventMatchIdsAction(handle, selectedEvent.slug).then(setMatchIds)
  }, [handle, selectedSlug, selectedEvent])

  function refresh() {
    if (selectedEvent) getEventMatchIdsAction(handle, selectedEvent.slug).then(setMatchIds)
  }

  function parseIds(input: string): number[] {
    return input
      .split(/[\s,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0)
  }

  function upload(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedEvent) return
    const ids = parseIds(matchInput)
    if (ids.length === 0) return alert('No valid match IDs found')
    startTransition(async () => {
      const res = await uploadMatchesAction(handle, selectedEvent.slug, ids)
      if (res.ok) {
        alert(`Uploaded ${res.newCount} new. Total: ${res.matchCount}`)
        setMatchInput('')
        refresh()
      } else alert(`Error: ${res.error}`)
    })
  }

  function removeMatch(matchId: number) {
    if (!selectedEvent) return
    startTransition(async () => {
      const res = await deleteMatchAction(handle, selectedEvent.slug, matchId)
      if (!res.ok) alert(`Error: ${res.error}`)
      else refresh()
    })
  }

  const matchCards = matchIds.map((id, i) => ({ id, seed: i + 1 })).reverse()

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={upload} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label>Event</Label>
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className={inputCls}
          >
            {events.map((ev) => (
              <option key={ev.slug} value={ev.slug}>
                {ev.label} (S{ev.season})
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
            placeholder={'Match IDs, separated by commas / spaces / newlines'}
            rows={4}
            className={`${inputCls} font-mono resize-y`}
          />
          {matchInput && (
            <span className="text-xs text-zinc-500">{parseIds(matchInput).length} parsed</span>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending || !selectedEvent || matchInput.trim() === ''}
          className={`${btnCls} w-24`}
        >
          {isPending ? <Spinner size={18} /> : 'Upload'}
        </button>
      </form>

      {matchCards.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Stored matches ({matchCards.length})</Label>
          {matchCards.map(({ id, seed }) => (
            <ManageCard
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
                  onClick={() => removeMatch(id)}
                  disabled={isPending}
                  className="flex items-center justify-center rounded-lg p-2 text-must-clutch hover:bg-must-clutch/10 disabled:opacity-40 transition-colors cursor-pointer"
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
  )
}
