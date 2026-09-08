import type { ReactNode } from 'react'

interface Props {
  left: ReactNode
  right: ReactNode
}

export function ManageCard({ left, right }: Props) {
  return (
    <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
      {left}
      {right}
    </div>
  )
}
