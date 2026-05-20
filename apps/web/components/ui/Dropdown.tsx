'use client'

interface Option { label: string; value: string }

interface Props {
  options: Option[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function Dropdown({ options, value, onChange, className }: Props) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm font-serif rounded-lg px-3 py-1 focus:outline-none focus:border-zinc-500 cursor-pointer ${className ?? ''}`}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
