'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

export interface SwingPoint {
  seed: number
  avgSwing: number
}

interface Props {
  data: SwingPoint[]
}

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '6px',
  color: '#f4f4f5',
  fontSize: '12px',
  padding: '8px 12px',
}

function barColor(avgSwing: number): string {
  if (avgSwing >= 20) return '#f87171'  // red-400 — very chaotic
  if (avgSwing >= 15) return '#fb923c'  // orange-400
  if (avgSwing >= 10) return '#facc15'  // yellow-400
  return '#4ade80'                      // green-400 — stable
}

export function SeedSwingChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-zinc-500 text-sm py-8 text-center">
        Not enough seeds completed to show swings.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 4 }} barCategoryGap="35%">
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="seed"
            tick={{ fill: '#71717a', fontSize: 11 }}
            tickFormatter={(v) => `Seed ${v}`}
            stroke="#3f3f46"
          />
          <YAxis
            tick={{ fill: '#71717a', fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            stroke="#3f3f46"
            width={40}
            label={{ value: '% of field', angle: -90, position: 'insideLeft', fill: '#52525b', fontSize: 10, dy: 44 }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: '#a1a1aa' }}
            itemStyle={{ color: '#f4f4f5' }}
            formatter={(value) => [`${Number(value).toFixed(1)}% of field`, 'Avg rank shift']}
            labelFormatter={(label) => `Seed ${label}`}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <Bar dataKey="avgSwing" radius={[3, 3, 0, 0]}>
            {data.map((entry) => (
              <Cell key={`cell-${entry.seed}`} fill={barColor(entry.avgSwing)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-zinc-600">
        Average rank change as a percentage of the alive lobby size, so bars are comparable across seeds even as players get eliminated.
      </p>
    </div>
  )
}
