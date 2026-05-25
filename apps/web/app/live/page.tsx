import { redirect } from 'next/navigation'
import { getActiveEvent } from '../../lib/events-config'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const activeEvent = await getActiveEvent()

  if (!activeEvent) {
    return (
      <div className="flex items-center justify-center min-h-screen text-neutral-400 text-sm">
        No event data available yet.
      </div>
    )
  }

  redirect(activeEvent.path)
}
