'use client'

import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { Pill } from './Pill'

interface Props {
  players: string[]
  selected: string[]
  onAdd: (nick: string) => void
  onRemove: (nick: string) => void
}

export function PlayerFilter({ players, selected, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const selectedSet = new Set(selected)
  const filtered = players.filter(
    (p) => query.length === 0 || p.toLowerCase().includes(query.toLowerCase()),
  )
  const selectedVisible = filtered.filter((p) => selectedSet.has(p))
  const unselectedVisible = filtered.filter((p) => !selectedSet.has(p))

  function toggle(nick: string) {
    if (selectedSet.has(nick)) onRemove(nick)
    else onAdd(nick)
  }

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm font-serif rounded-lg px-3 py-1 focus:outline-none hover:border-zinc-500 transition-colors cursor-pointer"
        >
          Filter
          <ChevronDown size={12} />
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 z-10 w-52 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden">
            <div className="px-2 pt-2 pb-1.5 border-b border-zinc-800">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
              />
            </div>
            <div className="overflow-y-auto overscroll-contain max-h-52">
              {selectedVisible.map((nick) => (
                <button
                  key={nick}
                  onClick={() => toggle(nick)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left bg-zinc-900 hover:bg-zinc-800/30 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                  <span className="text-sm font-mono text-zinc-200">{nick}</span>
                </button>
              ))}
              {selectedVisible.length > 0 && unselectedVisible.length > 0 && (
                <div className="border-t border-zinc-800 my-0.5" />
              )}
              {unselectedVisible.map((nick) => (
                <button
                  key={nick}
                  onClick={() => toggle(nick)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-zinc-800/30 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" />
                  <span className="text-sm font-mono text-zinc-500">{nick}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected.length > 0 && <span className="w-px h-4 bg-zinc-700 self-center shrink-0" />}

      {selected.map((nick) => (
        <div key={nick} className="flex items-center gap-1">
          <Pill>{nick}</Pill>
          <button
            onClick={() => onRemove(nick)}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
            aria-label={`Remove ${nick} from filter`}
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  )
}
