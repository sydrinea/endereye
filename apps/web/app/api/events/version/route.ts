import { NextRequest, NextResponse } from 'next/server'
import { getR2Object } from '@/lib/r2'

export async function GET(req: NextRequest) {
  const prefix = req.nextUrl.searchParams.get('prefix')
  if (!prefix) return NextResponse.json({ error: 'Missing prefix' }, { status: 400 })

  const event = await getR2Object<{ currentRound: number }>(`${prefix}.event.json`)
  return NextResponse.json({ currentRound: event?.currentRound ?? null })
}
