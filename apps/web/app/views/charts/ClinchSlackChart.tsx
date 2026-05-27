'use client'

import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

export interface SlackPlayer {
  nickname: string
  color: string
}

interface Props {
  data: Array<Record<string, number | string | undefined>>
  players: SlackPlayer[]
  visibleCount: number
}

const MANY_THRESHOLD = 8

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '6px',
  color: '#f4f4f5',
  fontSize: '12px',
  padding: '8px 12px',
  minWidth: '160px',
}

const SLACK_BUCKETS: Array<{ min: number; max: number; label: string; color: string }> = [
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

type TooltipPayloadItem = {
  dataKey: string
  value: number | undefined
  color: string
  name: string
}

function AggregateTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}) {
  if (!active || !payload?.length) return null

  const avgEntry = payload.find((p) => p.dataKey === 'avg')

  const playerItems = payload
    .filter((p) => p.dataKey !== 'avg' && p.value !== undefined && p.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  type BucketEntry = { name: string; v: number }
  const bucketMap = new Map<string, BucketEntry[]>()
  for (const item of playerItems) {
    const v = item.value ?? 0
    const bucket = slackBucket(v)
    if (!bucket) continue
    if (!bucketMap.has(bucket.label)) bucketMap.set(bucket.label, [])
    bucketMap.get(bucket.label)!.push({ name: item.name, v })
  }

  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: '#a1a1aa', marginBottom: 6, fontSize: 12, fontWeight: 500 }}>{label}</p>
      {avgEntry?.value !== undefined && (
        <p style={{ color: '#f4f4f5', marginBottom: 6, fontSize: 12 }}>
          Avg:{' '}
          <span style={{ color: (avgEntry.value as number) >= 0 ? '#4ade80' : '#f87171' }}>
            {(avgEntry.value as number) >= 0 ? '+' : ''}
            {avgEntry.value} pts
          </span>
        </p>
      )}
      {SLACK_BUCKETS.map((bucket) => {
        const entries = bucketMap.get(bucket.label)
        if (!entries?.length) return null
        if (entries.length > COLLAPSE_THRESHOLD) {
          return (
            <p key={bucket.label} style={{ color: bucket.color, lineHeight: '1.6', fontSize: 12 }}>
              {entries.length} players: {bucket.label}
            </p>
          )
        }
        return entries.map(({ name, v }) => (
          <p key={name} style={{ color: bucket.color, lineHeight: '1.6', fontSize: 12 }}>
            {name}: {v >= 0 ? '+' : ''}
            {v} pts
          </p>
        ))
      })}
    </div>
  )
}

export function ClinchSlackChart({ data, players, visibleCount }: Props) {
  const withData = data.filter((d) => players.some((p) => d[p.nickname] !== undefined))

  if (withData.length === 0) {
    return (
      <p className="text-zinc-500 text-sm py-8 text-center">
        No clinch opportunities recorded yet.
      </p>
    )
  }

  const manyPlayers = visibleCount > MANY_THRESHOLD

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={300}>
        {manyPlayers ? (
          <ComposedChart data={withData} margin={{ top: 8, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} stroke="#3f3f46" />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 11 }}
              tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
              stroke="#3f3f46"
              width={40}
            />
            <Tooltip content={<AggregateTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <ReferenceLine y={0} stroke="#52525b" />
            <Bar dataKey="avg" fill="#52525b" radius={[2, 2, 0, 0]} name="Average" barSize={32} />
            {players.map((p) => (
              <Line
                key={p.nickname}
                dataKey={p.nickname}
                stroke="none"
                dot={{ r: 3, fill: p.color, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: p.color, strokeWidth: 0 }}
                legendType="none"
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        ) : (
          <BarChart
            data={withData}
            margin={{ top: 8, right: 24, left: 0, bottom: 4 }}
            barGap={2}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} stroke="#3f3f46" />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 11 }}
              tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
              stroke="#3f3f46"
              width={40}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: '#a1a1aa' }}
              itemStyle={{ color: '#f4f4f5' }}
              formatter={(value, name) => {
                const n = Number(value)
                return [`${n >= 0 ? '+' : ''}${n} pts`, String(name)]
              }}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Legend
              wrapperStyle={{
                fontSize: '11px',
                color: '#71717a',
                paddingTop: '8px',
                width: '100%',
                left: 0,
              }}
            />
            <ReferenceLine y={0} stroke="#52525b" />
            {players.map((p) => (
              <Bar key={p.nickname} dataKey={p.nickname} fill={p.color} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
      <p className="text-xs text-zinc-500">
        {manyPlayers
          ? 'Grey bars show lobby average. Dots show individual players — hover to see the full breakdown.'
          : 'Points above (+) or below (−) the score needed to guarantee survival at each cut.'}
      </p>
    </div>
  )
}
