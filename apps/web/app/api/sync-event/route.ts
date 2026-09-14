import { NextRequest, NextResponse } from 'next/server'
import { getEventBySlug, getStrictlyActiveEvent } from '@/lib/events-config'
import { runEventSync } from '@/lib/sync-event'

/**
 * Autofetch endpoint hit by the `apps/cron` worker every minute. Refreshes the
 * currently-active event from the MCSR Ranked tournament API into R2.
 *
 * `?slug=<slug>` overrides the active-event lookup and syncs that named event
 * directly (ignoring the published/visible filter) — for manual re-syncs and
 * end-to-end tests. Gated on `DASHBOARD_SECRET` either way.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-secret')
  if (!process.env.DASHBOARD_SECRET || secret !== process.env.DASHBOARD_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const slug = req.nextUrl.searchParams.get('slug')
  const event = slug ? await getEventBySlug(slug) : await getStrictlyActiveEvent()
  if (!event) {
    return NextResponse.json({
      skipped: true,
      reason: slug ? `no event with slug "${slug}"` : 'no active event',
    })
  }

  const result = await runEventSync(event)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result)
}
