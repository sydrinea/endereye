import type { Metadata } from 'next'
import { Footer } from '@/components/layout'
import { getAllEvents } from '@/lib/events-config'
import { buildMeta } from '@/lib/og-metadata'

const VALID_KINDS = ['worlds', 'mss', 'lcq'] as const
type EventKind = (typeof VALID_KINDS)[number]

function defaultLabel(kind: string, id: number): string {
  if (kind === 'worlds') return `${id} World Championships`
  return `${kind.toUpperCase()} Season ${id}`
}

function findEvent(
  allEvents: Awaited<ReturnType<typeof getAllEvents>>,
  kind: EventKind,
  id: number,
) {
  return allEvents.find((e) => {
    if (e.kind !== kind) return false
    return kind === 'worlds' ? e.startDate.getFullYear() === id : e.season === id
  })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string; id: string }>
}): Promise<Metadata> {
  const { kind, id: idParam } = await params
  const id = Number(idParam)
  if (!VALID_KINDS.includes(kind as EventKind)) return {}
  const allEvents = await getAllEvents()
  const event = findEvent(allEvents, kind as EventKind, id)
  const eventLabel = event?.label ?? defaultLabel(kind, id)
  const imagePath = `/api/og?type=event&label=${encodeURIComponent(eventLabel)}`
  return buildMeta({
    title: `${eventLabel} | endereye`,
    description: `Survival analytics and round tracking for ${eventLabel}.`,
    imagePath,
  })
}

export default function EventKindLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  )
}
