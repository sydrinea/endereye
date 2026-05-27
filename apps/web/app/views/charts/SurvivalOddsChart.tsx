'use client'

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Legend,
} from 'recharts'

export interface SurvivalPlayer {
  nickname: string
  color: string
}

export interface OverlayLine {
  key: string
  color: string
}

interface Props {
  data: Array<Record<string, number>>
  players: SurvivalPlayer[]
  cutSeeds: number[]
  entityLabel?: string
  overlays?: OverlayLine[]
}

const MANY_THRESHOLD = 8

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '6px',
  padding: '8px 12px',
  minWidth: '160px',
}

const BUCKETS: Array<{ min: number; max: number; label: string; color: string }> = [
  { min: 95, max: 100, label: '95–100%', color: '#4ade80' },
  { min: 75, max: 94, label: '75–94%', color: '#a3e635' },
  { min: 45, max: 74, label: '45–74%', color: '#facc15' },
  { min: 15, max: 44, label: '15–44%', color: '#fb923c' },
  { min: 1, max: 14, label: '1–14%', color: '#f87171' },
  { min: 0, max: 0, label: '0%', color: '#52525b' },
]

// Tiers used for the banded view — mirrors BUCKETS but drives band logic
const TIER_CONFIG = [
  { key: 't5', minPct: 95, maxPct: 100, color: '#4ade80' },
  { key: 't4', minPct: 75, maxPct: 94, color: '#a3e635' },
  { key: 't3', minPct: 45, maxPct: 74, color: '#facc15' },
  { key: 't2', minPct: 15, maxPct: 44, color: '#fb923c' },
  { key: 't1', minPct: 1, maxPct: 14, color: '#f87171' },
] as const

const TIER_KEYS = new Set(TIER_CONFIG.map((t) => t.key))

type TooltipPayloadItem = {
  dataKey: string
  value: number | undefined
  name: string
  color?: string
}

function SurvivalTooltip({
  active,
  payload,
  label,
  collapseThreshold = 3,
  entityLabel = 'players',
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: number
  collapseThreshold?: number
  entityLabel?: string
}) {
  if (!active || !payload?.length) return null

  const items = payload
    .filter((p) => !TIER_KEYS.has(p.dataKey as never) && p.value !== undefined)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  type BucketEntry = { name: string; pct: number; color?: string }
  const bucketMap = new Map<string, BucketEntry[]>()

  for (const item of items) {
    const pct = item.value ?? 0
    const bucket = BUCKETS.find((b) => pct >= b.min && pct <= b.max)
    if (!bucket) continue
    if (!bucketMap.has(bucket.label)) bucketMap.set(bucket.label, [])
    bucketMap.get(bucket.label)!.push({ name: item.name, pct, color: item.color })
  }

  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: '#a1a1aa', marginBottom: 6, fontWeight: 500, fontSize: 12 }}>
        After Seed {label}
      </p>
      {BUCKETS.map((bucket) => {
        const entries = bucketMap.get(bucket.label)
        if (!entries?.length) return null
        if (entries.length > collapseThreshold) {
          return (
            <p key={bucket.label} style={{ color: bucket.color, lineHeight: '1.6', fontSize: 12 }}>
              {entries.length} {entityLabel}: {bucket.label}
            </p>
          )
        }
        return entries.map(({ name, pct, color }) => (
          <p key={name} style={{ color: color ?? bucket.color, lineHeight: '1.6', fontSize: 12 }}>
            {name}: {pct}%
          </p>
        ))
      })}
    </div>
  )
}

// Enrich data points with tier median values (keyed as t1–t5)
function computeEnrichedData(
  data: Array<Record<string, number>>,
  players: SurvivalPlayer[],
): Array<Record<string, number>> {
  return data.map((point) => {
    const result: Record<string, number> = { ...point }
    for (const tier of TIER_CONFIG) {
      const probs = players
        .map((p) => point[p.nickname])
        .filter((v): v is number => v !== undefined && v >= tier.minPct && v <= tier.maxPct)
      if (probs.length > 0) {
        probs.sort((a, b) => a - b)
        result[tier.key] = probs[Math.floor(probs.length / 2)]
      }
    }
    return result
  })
}

// Players 2+ tiers above the majority tier at any seed
function findOutliers(data: Array<Record<string, number>>, players: SurvivalPlayer[]): Set<string> {
  const outliers = new Set<string>()
  for (const point of data) {
    let maxCount = 0
    let majorityIdx = TIER_CONFIG.length - 1
    TIER_CONFIG.forEach((tier, idx) => {
      const count = players.filter((p) => {
        const v = point[p.nickname]
        return v !== undefined && v >= tier.minPct && v <= tier.maxPct
      }).length
      if (count > maxCount) {
        maxCount = count
        majorityIdx = idx
      }
    })
    for (const p of players) {
      const v = point[p.nickname]
      if (v === undefined) continue
      const pIdx = TIER_CONFIG.findIndex((t) => v >= t.minPct && v <= t.maxPct)
      if (pIdx !== -1 && majorityIdx - pIdx >= 2) outliers.add(p.nickname)
    }
  }
  return outliers
}

export function SurvivalOddsChart({
  data,
  players,
  cutSeeds,
  entityLabel = 'players',
  overlays,
}: Props) {
  if (data.length < 2 || players.length === 0) {
    return (
      <p className="text-zinc-500 text-sm py-8 text-center">
        Not enough seeds completed to show trajectory.
      </p>
    )
  }

  const manyPlayers = players.length > MANY_THRESHOLD

  const enrichedData = manyPlayers ? computeEnrichedData(data, players) : data
  const outlierSet = manyPlayers ? findOutliers(data, players) : null
  const outlierPlayers = manyPlayers ? players.filter((p) => outlierSet!.has(p.nickname)) : null

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
      <XAxis
        dataKey="seed"
        tick={{ fill: '#71717a', fontSize: 11 }}
        tickFormatter={(v) => `S${v}`}
        stroke="#3f3f46"
      />
      <YAxis
        tick={{ fill: '#71717a', fontSize: 11 }}
        tickFormatter={(v) => `${v}%`}
        domain={[0, 100]}
        stroke="#3f3f46"
        width={40}
      />
      {cutSeeds.map((s) => (
        <ReferenceLine
          key={s}
          x={s}
          stroke="#52525b"
          strokeDasharray="4 2"
          label={{ value: 'CUT', fill: '#52525b', fontSize: 9, position: 'insideTopRight' }}
        />
      ))}
    </>
  )

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={enrichedData} margin={{ top: 8, right: 24, left: 0, bottom: 4 }}>
        {axes}

        {manyPlayers ? (
          <>
            {/* Subtle tier background zones */}
            {TIER_CONFIG.map((tier) => (
              <ReferenceArea
                key={tier.key}
                y1={tier.minPct}
                y2={tier.maxPct}
                fill={tier.color}
                fillOpacity={0.03}
                strokeOpacity={0}
              />
            ))}

            {/* Tier mean lines — the "pack" */}
            {TIER_CONFIG.map((tier) => (
              <Line
                key={`tier-${tier.key}`}
                type="monotone"
                dataKey={tier.key}
                stroke={tier.color}
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={false}
                activeDot={false}
                connectNulls={false}
                legendType="none"
                isAnimationActive={false}
              />
            ))}

            {/* Outlier players splitting from the pack */}
            {outlierPlayers!.map((p) => (
              <Line
                key={p.nickname}
                type="monotone"
                dataKey={p.nickname}
                stroke={p.color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                legendType="none"
                isAnimationActive={false}
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
                activeDot={{ r: 4 }}
                connectNulls={false}
                legendType="none"
                isAnimationActive={false}
              />
            ))}
            <Tooltip
              content={<SurvivalTooltip collapseThreshold={3} entityLabel={entityLabel} />}
              cursor={{ stroke: '#52525b' }}
            />
          </>
        ) : (
          <>
            <Legend
              wrapperStyle={{
                fontSize: '11px',
                color: '#71717a',
                paddingTop: '8px',
                width: '100%',
                left: 0,
              }}
            />
            {players.map((p) => (
              <Line
                key={p.nickname}
                type="monotone"
                dataKey={p.nickname}
                stroke={p.color}
                strokeWidth={1.5}
                dot
                activeDot={{ r: 4 }}
                connectNulls={false}
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
                activeDot={{ r: 4 }}
                connectNulls={false}
                legendType="none"
                isAnimationActive={false}
              />
            ))}
            <Tooltip
              content={<SurvivalTooltip collapseThreshold={Infinity} entityLabel={entityLabel} />}
              cursor={{ stroke: '#52525b' }}
            />
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
