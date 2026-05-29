import { getR2Object, putR2Object } from './r2'

export interface R2EventConfig {
  slug: string
  label: string
  kind: 'lcq' | 'worlds' | 'mss'
  season: number
  prefix: string // R2 key prefix, e.g. "lcq/10" or "worlds/2026"
  startDate: string // ISO string
  path: string
  endpoint?: string // MCSR Ranked API endpoint for api-only sync mode
  qualifyCount?: number
  noBonus?: boolean
  published?: boolean // absent treated as true; set false to hide in production
}

export interface EventConfig {
  slug: string
  label: string
  kind: 'lcq' | 'worlds' | 'mss'
  season: number
  prefix: string
  startDate: Date
  path: string
  endpoint?: string
  qualifyCount?: number
  noBonus?: boolean
  published?: boolean
}

function toEventConfig(r2: R2EventConfig): EventConfig {
  return { ...r2, startDate: new Date(r2.startDate) }
}

const CONFIG_KEY = 'config/events.json'

export async function getR2EventsConfig(): Promise<R2EventConfig[] | null> {
  return getR2Object<R2EventConfig[]>(CONFIG_KEY)
}

export async function putR2EventsConfig(configs: R2EventConfig[]): Promise<void> {
  await putR2Object(CONFIG_KEY, configs)
}

const isProd = process.env.VERCEL_ENV === 'production'

function isVisible(e: R2EventConfig): boolean {
  // absent published field is treated as published; only explicit false hides in prod
  return !isProd || e.published !== false
}

export async function getAllEvents(): Promise<EventConfig[]> {
  const r2 = await getR2EventsConfig()
  return (r2 ?? []).filter(isVisible).map(toEventConfig)
}

export async function getActiveEvent(): Promise<EventConfig | null> {
  const r2 = await getR2EventsConfig()
  if (!r2 || r2.length === 0) return null

  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  // show most recent event for up to 7 days
  cutoff.setDate(cutoff.getDate() - 7)

  const activeOrFuture = r2
    .filter(isVisible)
    .map(toEventConfig)
    .filter((e) => e.startDate >= cutoff)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  return activeOrFuture[0] ?? null
}

export async function getStrictlyActiveEvent(): Promise<EventConfig | null> {
  const r2 = await getR2EventsConfig()
  if (!r2 || r2.length === 0) return null

  const now = new Date()
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)

  const active = r2
    .filter(isVisible)
    .map(toEventConfig)
    .filter((e) => e.startDate >= cutoff && e.startDate <= now)
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())

  return active[0] ?? null
}
