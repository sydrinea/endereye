'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const pad = (n: number) => String(n).padStart(2, '0')
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

/**
 * Custom date + time picker. Works entirely in the viewer's local time — `value`
 * is an absolute `Date`, rendered and edited as local; the caller converts to
 * UTC (`.toISOString()`) at the boundary.
 */
export function DateTimeField({
  value,
  onChange,
  disabled,
}: {
  value: Date
  onChange: (d: Date) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState({ year: value.getFullYear(), month: value.getMonth() })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    if (!open) setView({ year: value.getFullYear(), month: value.getMonth() })
    setOpen((o) => !o)
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const label = value.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  function setDatePart(day: number) {
    onChange(
      new Date(view.year, view.month, day, value.getHours(), value.getMinutes()),
    )
  }
  function setTimePart(hours: number, minutes: number) {
    onChange(new Date(value.getFullYear(), value.getMonth(), value.getDate(), hours, minutes))
  }
  function shiftMonth(delta: number) {
    const d = new Date(view.year, view.month + delta, 1)
    setView({ year: d.getFullYear(), month: d.getMonth() })
  }

  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const today = new Date()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 transition-colors hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span suppressHydrationWarning>{label}</span>
        <CalendarDays size={14} className="shrink-0 text-zinc-500" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-zinc-800 bg-zinc-950 p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-zinc-200">
              {MONTHS[view.month]} {view.year}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="py-1 text-xs text-zinc-600">
                {d}
              </span>
            ))}
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const cellDate = new Date(view.year, view.month, day)
              const isSelected = sameDay(cellDate, value)
              const isToday = sameDay(cellDate, today)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setDatePart(day)}
                  className={`cursor-pointer rounded-md py-1 text-sm transition-colors ${
                    isSelected
                      ? 'bg-accent/15 text-accent'
                      : isToday
                        ? 'text-zinc-100 ring-1 ring-inset ring-zinc-700'
                        : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-zinc-800 pt-3">
            <span className="text-xs text-zinc-500">Time</span>
            <div className="flex items-center gap-1">
              <TimeInput
                value={value.getHours()}
                max={23}
                onChange={(h) => setTimePart(h, value.getMinutes())}
              />
              <span className="text-zinc-600">:</span>
              <TimeInput
                value={value.getMinutes()}
                max={59}
                onChange={(m) => setTimePart(value.getHours(), m)}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(new Date())}
              className="ml-auto inline-flex h-8 cursor-pointer items-center rounded-md border border-zinc-800 px-2.5 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
            >
              Now
            </button>
          </div>

          <p className="mt-2 text-[11px] text-zinc-600" suppressHydrationWarning>
            {tz}
          </p>
        </div>
      )}
    </div>
  )
}

function TimeInput({
  value,
  max,
  onChange,
}: {
  value: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      value={pad(value)}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (!Number.isNaN(n)) onChange(Math.max(0, Math.min(max, n)))
      }}
      className="w-11 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-center font-mono text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
    />
  )
}
