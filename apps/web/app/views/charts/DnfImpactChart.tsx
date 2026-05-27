'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

export interface DnfEntry {
  nickname: string
  [seedKey: string]: string | number
}

interface Props {
  data: DnfEntry[]
  seedKeys: string[]
  seedColors: string[]
  seedLabels: Record<string, string>
}

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '6px',
  color: '#f4f4f5',
  fontSize: '12px',
  padding: '8px 12px',
}

const AVATAR_SIZE = 20
const BAR_HEIGHT = 30
const Y_AXIS_WIDTH = 152

function PlayerTick({
  x,
  y,
  payload,
}: {
  x: string | number
  y: string | number
  payload?: { value: string }
}) {
  if (!payload) return null
  const nickname = payload.value
  const px = x ?? 0
  const py = y ?? 0
  return (
    <g transform={`translate(${px},${py})`}>
      <text
        x={-(AVATAR_SIZE + 6)}
        y={4}
        textAnchor="end"
        fill="#71717a"
        fontSize={14}
        fontFamily="var(--font-minecraft)"
      >
        {nickname}
      </text>
      <image
        href={`https://mc-heads.net/avatar/${nickname}/${AVATAR_SIZE}`}
        x={-(AVATAR_SIZE + 2)}
        y={-AVATAR_SIZE / 2}
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
      />
    </g>
  )
}

export function DnfImpactChart({ data, seedKeys, seedColors, seedLabels }: Props) {
  const hasData = data.some((d) => seedKeys.some((k) => (d[k] as number) > 0))

  if (!hasData) {
    return (
      <p className="text-zinc-500 text-sm py-8 text-center">
        No DNF events recorded in completed seeds.
      </p>
    )
  }

  const chartHeight = Math.max(200, data.length * BAR_HEIGHT + 60)

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
          barCategoryGap="25%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: '#71717a', fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            stroke="#3f3f46"
          />
          <YAxis
            type="category"
            dataKey="nickname"
            width={Y_AXIS_WIDTH}
            stroke="#3f3f46"
            tick={(props) => <PlayerTick {...props} />}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: '#a1a1aa' }}
            itemStyle={{ color: '#f4f4f5' }}
            formatter={(value, name) => {
              const n = Number(value)
              const key = String(name)
              return n > 0 ? [`−${n}%`, seedLabels[key] ?? key] : null
            }}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <Legend
            formatter={(value) => seedLabels[value] ?? value}
            wrapperStyle={{ fontSize: '11px', color: '#71717a', paddingTop: '8px' }}
          />
          {seedKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="a"
              fill={seedColors[i % seedColors.length]}
              radius={i === seedKeys.length - 1 ? [0, 2, 2, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-zinc-500">
        Survival probability lost when a player DNF&apos;d each seed. Stacked bars show cumulative
        impact across multiple DNFs.
      </p>
    </div>
  )
}
