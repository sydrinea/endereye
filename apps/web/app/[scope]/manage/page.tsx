import { notFound } from 'next/navigation'
import { fetchCurrentSeason } from '@endereye/core'
import { getHostByHandle, getHostEvents } from '@/lib/events-config'
import { getSessionUser } from '@/lib/auth'
import { decodeScope } from '@/lib/event-route'
import { ManageContent } from './ManageContent'

export const metadata = { title: 'Manage | endereye', robots: { index: false } }

export default async function ManagePage({ params }: { params: Promise<{ scope: string }> }) {
  const scope = decodeScope((await params).scope)
  if (!scope.startsWith('@')) notFound()
  const handle = scope.slice(1)

  const [host, sessionUser] = await Promise.all([getHostByHandle(handle), getSessionUser()])
  if (!host) notFound()
  if (!sessionUser || sessionUser.handle !== handle) notFound()

  const [events, currentSeason] = await Promise.all([
    getHostEvents(handle, true),
    fetchCurrentSeason().catch(() => new Date().getUTCFullYear() % 100),
  ])

  return (
    <ManageContent
      handle={handle}
      image={host.image}
      isOfficial={handle === 'official'}
      currentSeason={currentSeason}
      events={events}
    />
  )
}
