'use client'

import { useState } from 'react'

interface Tab {
  label: string
  value: string
}

interface Props {
  tabs: Tab[]
  defaultValue?: string
}

export function Tabs({ tabs, defaultValue }: Props) {
  const [active, setActive] = useState(defaultValue ?? tabs[0]?.value)
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-zinc-900 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => setActive(tab.value)}
          className={`px-4 py-1.5 rounded-md text-sm font-display transition-colors ${
            active === tab.value ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
