import type { Metadata } from 'next'
import { parseEventParams } from '@/lib/event-route'
import { resolveEventDescriptor } from '@/lib/events-config'
import { buildMeta } from '@/lib/og-metadata'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scope: string; eventId: string }>
}): Promise<Metadata> {
  const { scope, eventId } = await params
  // Non-redirecting resolve — the `/@official/*` redirect fires from the page component.
  const descriptor = await resolveEventDescriptor(parseEventParams(scope, eventId))
  if (!descriptor) return {}

  const eventLabel = descriptor.label
  const imagePath = `/api/og?type=event&label=${encodeURIComponent(eventLabel)}`
  return buildMeta({
    title: `${eventLabel} | endereye`,
    description: `Survival analytics and round tracking for ${eventLabel}.`,
    imagePath,
  })
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return children
}
