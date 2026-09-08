import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getHostByHandle, getHostEventsFor } from '@/lib/events-config'
import { decodeScope } from '@/lib/event-route'
import { getSessionUser } from '@/lib/auth'
import { HostAvatar } from '@/app/views/HostAvatar'
import { HostEvents } from './HostEvents'
import { Breadcrumbs } from '@/components/ui'
import { buildMeta } from '@/lib/og-metadata'

function scopeHandle(scope: string): string {
  if (!scope.startsWith('@')) notFound()
  return scope.slice(1)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scope: string }>
}): Promise<Metadata> {
  const scope = decodeScope((await params).scope)
  if (!scope.startsWith('@')) return {}
  const host = await getHostByHandle(scope.slice(1))
  if (!host) return {}
  const official = host.handle === 'official'
  return buildMeta({
    title: official ? 'Official Events | endereye' : `@${host.handle} | endereye`,
    description: official
      ? 'Every official MCSR Ranked LCQ, MSS, and World Championship event tracked on endereye.'
      : `Community events hosted by @${host.handle} on endereye.`,
    imagePath: '/api/og?type=default',
  })
}

export default async function ScopePage({ params }: { params: Promise<{ scope: string }> }) {
  const handle = scopeHandle(decodeScope((await params).scope))

  const [host, sessionUser] = await Promise.all([getHostByHandle(handle), getSessionUser()])
  if (!host) notFound()

  const isOwnProfile = sessionUser?.id === host.id
  const events = (await getHostEventsFor(host, isOwnProfile)).sort(
    (a, b) => b.startDate.getTime() - a.startDate.getTime(),
  )

  return (
    <main className="flex flex-col items-center px-6 py-8 gap-6">
      <div className="w-full max-w-4xl flex flex-col gap-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: `@${host.handle}` }]} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <HostAvatar handle={host.handle} image={host.image} />
            <div className="flex flex-col">
              <h1 className="font-display text-3xl text-zinc-100 flex items-center gap-2">
                @{host.handle}
                {host.handle === 'official' && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 font-sans text-xs font-medium text-accent">
                    Official
                  </span>
                )}
              </h1>
              <span className="text-sm text-zinc-500">
                {events.length} event{events.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {isOwnProfile && (
            <a
              href={`/@${host.handle}/manage`}
              className="inline-flex h-9 items-center rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
            >
              Manage Events
            </a>
          )}
        </div>

        <HostEvents events={events} />
      </div>
    </main>
  )
}
