'use client'

import { useState } from 'react'

interface Tab {
  label: string
  value: string
}

interface Props {
  tabs: Tab[]
  defaultValue?: string
  value?: string
  onChange?: (value: string) => void
}

export function Tabs({ tabs, defaultValue, value: controlledValue, onChange }: Props) {
  const [internalActive, setInternalActive] = useState(defaultValue ?? tabs[0]?.value)
  const active = controlledValue ?? internalActive

  function handleClick(v: string) {
    if (onChange) {
      onChange(v)
    } else {
      setInternalActive(v)
    }
  }

  return (
    <div className="flex gap-1 p-1 rounded-lg bg-zinc-900 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => handleClick(tab.value)}
          className={`px-4 py-1.5 rounded-md text-sm font-display transition-colors cursor-pointer ${
            active === tab.value ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
