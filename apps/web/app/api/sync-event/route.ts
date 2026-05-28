import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { buildEventFromApiResponse, enrichEventPlayers } from '@endereye/core'
import type { ApiEventData, EventPlayer } from '@endereye/core'
import { getStrictlyActiveEvent } from '@/lib/events-config'
import { getR2Object, putR2Object } from '@/lib/r2'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-secret')
  if (!process.env.DASHBOARD_SECRET || secret !== process.env.DASHBOARD_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const event = await getStrictlyActiveEvent()
  if (!event) return NextResponse.json({ skipped: true, reason: 'no active event' })
  if (!event.endpoint) return NextResponse.json({ skipped: true, reason: 'no endpoint configured' })

  const apiRes = await fetch(`https://api.mcsrranked.com/${event.endpoint}`)
  if (!apiRes.ok) {
    return NextResponse.json({ error: `API fetch failed: ${apiRes.status}` }, { status: 502 })
  }
  const { data }: { status: string; data: ApiEventData } = await apiRes.json()

  const existing = await getR2Object<{ currentRound: number }>(`${event.prefix}.event.json`)
  if (existing && existing.currentRound === data.currentRound) {
    return NextResponse.json({
      skipped: true,
      reason: 'no new seed',
      currentRound: data.currentRound,
    })
  }

  const built = buildEventFromApiResponse(data)

  const existingPlayers = await getR2Object<EventPlayer[]>(`${event.prefix}.players.json`)
  const updatedPlayers = await (async () => {
    if (existingPlayers === null) {
      return enrichEventPlayers(built, event.kind, event.season)
    }
    const knownUuids = new Set(existingPlayers.map((p) => p.uuid))
    const newPlayers = built.players.filter((p) => !knownUuids.has(p.uuid))
    if (newPlayers.length === 0) return existingPlayers
    const enriched = await enrichEventPlayers(
      { ...built, players: newPlayers },
      event.kind,
      event.season,
    )
    return [...existingPlayers, ...enriched]
  })()

  await Promise.all([
    putR2Object(`${event.prefix}.event.json`, { ...built, qualifyCount: event.qualifyCount }),
    putR2Object(`${event.prefix}.players.json`, updatedPlayers),
  ])

  revalidateTag(`event:${event.prefix}`, 'max')

  return NextResponse.json({ synced: true, currentRound: data.currentRound })
}
