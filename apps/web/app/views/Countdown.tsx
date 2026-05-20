'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'

interface TimeParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  past: boolean
}

function getTimeParts(target: Date): TimeParts {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, past: true }
  const s = Math.floor(diff / 1000)
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    past: false,
  }
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-display text-5xl lg:text-7xl text-zinc-100 tabular-nums">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-xs text-zinc-600 uppercase tracking-widest">{label}</span>
    </div>
  )
}

export function Countdown({ target, isOver = false }: { target: Date; isOver?: boolean }) {
  const [parts, setParts] = useState<TimeParts>(() => getTimeParts(target))

  useEffect(() => {
    if (parts.past) return
    const id = setInterval(() => {
      const next = getTimeParts(target)
      setParts(next)
    }, 1000)
    return () => clearInterval(id)
  }, [target, parts.past])

  if (parts.past) {
    return (
      <Link
        href="/live"
        className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${
          isOver
            ? 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700'
            : 'bg-accent/15 text-accent hover:bg-accent/20'
        }`}
      >
        {isOver ? 'View results' : 'View live standings'}
        <ArrowRight size={20} />
      </Link>
    )
  }

  return (
    <div className="flex items-start gap-6 lg:gap-10">
      <Unit value={parts.days} label="days" />
      <Unit value={parts.hours} label="hrs" />
      <Unit value={parts.minutes} label="min" />
      <Unit value={parts.seconds} label="sec" />
    </div>
  )
}
