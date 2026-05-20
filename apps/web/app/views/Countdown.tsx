'use client'

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

export function Countdown({ target }: { target: Date }) {
  const [parts, setParts] = useState<TimeParts>(() => getTimeParts(target))

  useEffect(() => {
    const id = setInterval(() => setParts(getTimeParts(target)), 1000)
    return () => clearInterval(id)
  }, [target])

  if (parts.past) {
    return <p className="text-zinc-500 text-lg">Starting soon…</p>
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
