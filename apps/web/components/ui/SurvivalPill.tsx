type PillProps = { type: 'needs'; rank: number } | { type: 'to-cut'; deficit: number }

export function SurvivalPill(props: PillProps) {
  if (props.type === 'needs') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-mono bg-coin-flip/10 text-coin-flip border border-coin-flip/30">
        Needs #{props.rank}
      </span>
    )
  }

  return (
    <span className="px-2 py-0.5 rounded text-xs font-mono bg-must-clutch/10 text-must-clutch border border-must-clutch/30">
      −{props.deficit} to cut
    </span>
  )
}
