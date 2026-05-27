'use client'

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts'

export interface SlackPlayer {
  nickname: string
  color: string
}

export interface OverlayLine {
  key: string
  color: string
}

interface Props {
  data: Array<Record<string, number | string | undefined>>
  players: SlackPlayer[]
  entityLabel?: string
  overlays?: OverlayLine[]
}

const MANY_THRESHOLD = 8

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '6px',
  padding: '8px 12px',
  minWidth: '140px',
}

const SLACK_BUCKETS = [
  { min: 20, max: Infinity, label: '+20 or more', color: '#4ade80' },
  { min: 10, max: 19, label: '+10 – +19', color: '#a3e635' },
  { min: 1, max: 9, label: '+1 – +9', color: '#facc15' },
  { min: 0, max: 0, label: 'exactly 0', color: '#71717a' },
  { min: -9, max: -1, label: '−1 – −9', color: '#fb923c' },
  { min: -19, max: -10, label: '−10 – −19', color: '#f87171' },
  { min: -Infinity, max: -20, label: '−20 or less', color: '#ef4444' },
]

function slackBucket(v: number) {
  return SLACK_BUCKETS.find((b) => v >= b.min && v <= b.max)
}

const COLLAPSE_THRESHOLD = 3

interface TrajectoryTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: readonly any[]
  label?: string | number
  entityLabel?: string
}

function TrajectoryTooltip({
  active,
  payload,
  label,
  entityLabel = 'players',
}: TrajectoryTooltipProps) {
  if (!active || !payload?.length) return null

  // Filter out nulls and sort highest slack to the top
  const items = payload
    .filter((p) => p.value !== undefined && p.value !== null)
    .sort((a, b) => (b.value as number) - (a.value as number))

  type BucketEntry = { name: string; v: number; color: string }
  const bucketMap = new Map<string, BucketEntry[]>()

  for (const item of items) {
    const v = item.value as number
    const bucket = slackBucket(v)
    if (!bucket) continue
    if (!bucketMap.has(bucket.label)) bucketMap.set(bucket.label, [])
    bucketMap.get(bucket.label)!.push({ name: item.name, v, color: item.color })
  }

  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: '#a1a1aa', marginBottom: 6, fontWeight: 500, fontSize: 12 }}>
        Seed {label} Cut
      </p>
      {SLACK_BUCKETS.map((bucket) => {
        const entries = bucketMap.get(bucket.label)
        if (!entries?.length) return null

        if (entries.length > COLLAPSE_THRESHOLD) {
          return (
            <p key={bucket.label} style={{ color: bucket.color, lineHeight: '1.6', fontSize: 12 }}>
              {entries.length} {entityLabel}: {bucket.label}
            </p>
          )
        }

        return entries.map(({ name, v, color }) => (
          <p key={name} style={{ color, lineHeight: '1.6', fontSize: 12 }}>
            {name}: {v > 0 ? '+' : ''}
            {v} pts
          </p>
        ))
      })}
    </div>
  )
}

export function ClinchSlackTrajectoryChart({
  data,
  players,
  entityLabel = 'players',
  overlays,
}: Props) {
  const hasAnyData = data.some(
    (point) => players.some((p) => p.nickname in point) || overlays?.some((o) => o.key in point),
  )

  if (!hasAnyData) {
    return (
      <p className="text-zinc-500 text-sm py-8 text-center">
        No clinch data available for the selected players.
      </p>
    )
  }

  const manyPlayers = players.length > MANY_THRESHOLD

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 8, right: 24, left: -20, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />

          <XAxis
            dataKey="seed"
            tick={{ fill: '#71717a', fontSize: 11 }}
            tickFormatter={(v) => `S${v}`}
            stroke="#3f3f46"
          />

          <YAxis
            tick={{ fill: '#71717a', fontSize: 11 }}
            tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
            stroke="#3f3f46"
          />

          <Tooltip
            content={(props) => <TrajectoryTooltip {...props} entityLabel={entityLabel} />}
            cursor={{ stroke: '#52525b', strokeDasharray: '3 3' }}
          />

          {/* Conditionally render the legend only when it's easily readable */}
          {!manyPlayers && (
            <Legend
              wrapperStyle={{
                fontSize: '11px',
                color: '#71717a',
                paddingTop: '8px',
                textAlign: 'center',
                margin: 'auto',
                width: '100%',
                left: 0,
              }}
            />
          )}

          {/* The zero line represents the exact threshold of survival */}
          <ReferenceLine y={0} stroke="#52525b" strokeWidth={2} />

          {players.map((p) => (
            <Line
              key={p.nickname}
              type="monotone"
              dataKey={p.nickname}
              stroke={p.color}
              strokeWidth={2}
              dot={{ r: 3, fill: '#18181b', strokeWidth: 2 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
              legendType={manyPlayers ? 'none' : 'line'}
            />
          ))}
          {overlays?.map((o) => (
            <Line
              key={o.key}
              type="monotone"
              dataKey={o.key}
              stroke={o.color}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
              legendType="none"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-zinc-500">
        {entityLabel === 'players'
          ? `How each player's margin of error evolved across the cuts. Lines stop when a player is
        eliminated.`
          : `How this player's margin of error evolved across the cuts. Lines stop when the player is eliminated.`}
      </p>
    </div>
  )
}
