'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface Option {
  label: string
  value: string
}

interface Props {
  options: Option[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function Dropdown({ options, value, onChange, className }: Props) {
  const [open, setOpen] = useState(false)
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

  const selected = options.find((o) => o.value === value)

  function select(v: string) {
    onChange(v)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm font-serif rounded-lg px-3 py-1 focus:outline-none hover:border-zinc-500 transition-colors cursor-pointer"
      >
        {selected?.label ?? '—'}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-10 w-max bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden">
          <div className="overflow-y-auto overscroll-contain max-h-64">
            {options.map((o) => {
              const active = o.value === value
              return (
                <button
                  key={o.value}
                  onClick={() => select(o.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${active ? 'bg-zinc-900 hover:bg-zinc-800/30' : 'hover:bg-zinc-800/30'}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-zinc-400' : ''}`}
                  />
                  <span
                    className={`text-sm font-serif ${active ? 'text-zinc-200' : 'text-zinc-500'}`}
                  >
                    {o.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
