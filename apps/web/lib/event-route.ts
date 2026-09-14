/**
 * Maps the unified `[scope]/[eventId]` route params to an `EventDescriptor`.
 *
 *   /lcq/11            → official  { kind: 'lcq', id: 11 }
 *   /@sydrinea/spring  → host      { handle: 'sydrinea', slug: 'spring' }
 *
 * `/@official/<slug>` resolves but immediately redirects to the canonical flat
 * path (`/lcq/11`), so official events have exactly one public URL.
 *
 * Next sometimes hands the `@`-prefixed segment through still percent-encoded
 * (`%40official`), so every consumer normalizes the scope via `decodeScope`.
 */
import { redirect } from 'next/navigation'
import { resolveEventDescriptor, type EventDescriptor } from './events-config'

export function decodeScope(scope: string): string {
  try {
    return decodeURIComponent(scope)
  } catch {
    return scope
  }
}

export function parseEventParams(
  scope: string,
  eventId: string,
): { handle: string; slug: string } | { kind: string; id: number } {
  const s = decodeScope(scope)
  return s.startsWith('@')
    ? { handle: s.slice(1), slug: eventId }
    : { kind: s, id: Number(eventId) }
}

/** Resolve for a page/layout that renders the event — redirects `/@official/*` to flat. */
export async function resolveEventRoute(
  scope: string,
  eventId: string,
): Promise<EventDescriptor | null> {
  const input = parseEventParams(scope, eventId)
  const descriptor = await resolveEventDescriptor(input)
  if (descriptor && 'handle' in input && descriptor.event.handle === 'official') {
    redirect(descriptor.event.path)
  }
  return descriptor
}
