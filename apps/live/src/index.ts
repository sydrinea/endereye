interface R2EventConfig {
  slug: string
  kind: 'lcq' | 'worlds' | 'mss'
  season: number
  prefix: string
  startDate: string
  path: string
  endpoint?: string
  qualifyCount?: number
  noBonus?: boolean
  published?: boolean
}

export interface Env {
  BUCKET: R2Bucket
  SITE_URL: string
}

async function getActiveEvent(bucket: R2Bucket): Promise<R2EventConfig | null> {
  const obj = await bucket.get('config/events.json')
  if (!obj) return null

  const configs: R2EventConfig[] = await obj.json()
  if (!configs.length) return null

  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - 7)

  const activeOrFuture = configs
    .filter((e) => e.published !== false)
    .filter((e) => new Date(e.startDate) >= cutoff)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())

  return activeOrFuture[0] ?? null
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const event = await getActiveEvent(env.BUCKET)
    if (!event?.path) return Response.redirect(new URL('/', req.url).toString(), 302)
    return Response.redirect(new URL(event.path, env.SITE_URL).toString(), 302)
  },
} satisfies ExportedHandler<Env>
