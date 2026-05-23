export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded text-xs font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
      {children}
    </span>
  )
}
