import { NextResponse } from 'next/server'
import { getActiveEvent } from '@/lib/events-config'

export async function GET() {
  const event = await getActiveEvent()
  return NextResponse.json({ path: event?.path ?? null })
}
