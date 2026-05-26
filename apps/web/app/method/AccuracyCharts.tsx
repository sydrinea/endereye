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
  ComposedChart,
  Line,
} from 'recharts'
import type { CALIBRATION_DATA, SCENARIO_PATH_DATA } from '@/lib/backtest-results'

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: 12,
}

const AXIS_PROPS = {
  tick: { fill: '#71717a', fontSize: 11 },
  stroke: '#3f3f46',
}

function CalibrationTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const predicted = payload.find((p) => p.name === 'Predicted')?.value
  const actual = payload.find((p) => p.name === 'Actual')?.value
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: '#a1a1aa', marginBottom: 4 }}>{label}</p>
      {predicted !== undefined && <p style={{ color: '#71717a' }}>Predicted: {predicted}%</p>}
      {actual !== undefined && <p style={{ color: '#60a5fa' }}>Actual: {actual}%</p>}
    </div>
  )
}

export function CalibrationChart({ data }: { data: typeof CALIBRATION_DATA }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="range" {...AXIS_PROPS} tick={{ fill: '#71717a', fontSize: 10 }} />
        <YAxis {...AXIS_PROPS} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={40} />
        <Tooltip content={<CalibrationTooltip />} cursor={false} />

        <Bar dataKey="predicted" name="Predicted" fill="#3f3f46" radius={[2, 2, 0, 0]} />
        <Bar dataKey="actual" name="Actual" radius={[2, 2, 0, 0]}>
          {data.map((d, i) => {
            const diff = d.actual - d.predicted
            const color = Math.abs(diff) <= 5 ? '#60a5fa' : diff > 0 ? '#4ade80' : '#f87171'
            return <Cell key={i} fill={color} />
          })}
        </Bar>

        <Line
          type="linear"
          dataKey="predicted"
          name="Perfect Calibration"
          stroke="#71717a"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          activeDot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function ScenarioTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: '#a1a1aa', marginBottom: 4 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color === '#3f3f46' ? '#71717a' : p.color }}>
          {p.name}: {p.value.toFixed(1)}%
        </p>
      ))}
    </div>
  )
}

export function ScenarioPathChart({ data }: { data: typeof SCENARIO_PATH_DATA }) {
  const chartData = [
    {
      label: 'Threat Paths',
      'Hit rate': data.threat.hitRate,
      'Random chance': data.threat.baseline,
      n: data.threat.n,
    },
    {
      label: 'Survival Paths',
      'Hit rate': data.survival.hitRate,
      'Random chance': data.survival.baseline,
      n: data.survival.n,
    },
  ]

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={40} />
        <Tooltip content={<ScenarioTooltip />} cursor={{ fill: '#27272a' }} />
        <Bar dataKey="Random chance" fill="#3f3f46" radius={[2, 2, 0, 0]} />
        <Bar dataKey="Hit rate" fill="#60a5fa" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
