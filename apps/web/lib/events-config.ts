import { getR2Object, putR2Object } from './r2'

export interface R2EventConfig {
  slug: string
  label: string
  kind: 'lcq' | 'mss'
  season: number
  prefix: string // R2 key prefix, e.g. "lcq/10" or "worlds/2026"
  startDate: string // ISO string
  path: string
  qualifyCount?: number
  noBonus?: boolean
}

export interface EventConfig {
  slug: string
  label: string
  kind: 'lcq' | 'mss'
  season: number
  prefix: string
  startDate: Date
  path: string
  qualifyCount?: number
  noBonus?: boolean
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

export async function getAllEvents(): Promise<EventConfig[]> {
  const r2 = await getR2EventsConfig()
  return (r2 ?? []).map(toEventConfig)
}

export async function getActiveEvent(): Promise<EventConfig | null> {
  const r2 = await getR2EventsConfig()
  if (!r2 || r2.length === 0) return null
  const now = new Date()
  const future = r2
    .map(toEventConfig)
    .filter((e) => e.startDate >= now)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  return future[0] ?? null
}
