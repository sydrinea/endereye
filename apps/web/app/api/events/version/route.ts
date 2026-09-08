import { NextRequest, NextResponse } from 'next/server'
import { getR2Object } from '@/lib/r2'

/**
 * Change-detection poll for the live event views. Clients fetch this every ~5s
 * with `cache: 'no-store'`, so it's one request per poll; the `s-maxage` then
 * collapses those at the edge to ~one origin read per 4s per region regardless
 * of viewer count. The value is just a round counter, never rendered as data, so
 * up to 4s of edge staleness only delays the "new seed" nudge slightly.
 */
export async function GET(req: NextRequest) {
  const prefix = req.nextUrl.searchParams.get('prefix')
  if (!prefix) return NextResponse.json({ error: 'Missing prefix' }, { status: 400 })

  const event = await getR2Object<{ currentRound: number }>(`${prefix}.event.json`)
  return NextResponse.json(
    { currentRound: event?.currentRound ?? null },
    { headers: { 'Cache-Control': 'public, s-maxage=4' } },
  )
}
