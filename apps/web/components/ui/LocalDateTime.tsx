'use client'

/**
 * Renders an absolute instant in the viewer's local timezone, with the zone
 * abbreviation (e.g. "Sep 15, 2026, 3:00 PM EDT"). `suppressHydrationWarning`
 * because the server renders in UTC and the client corrects on mount.
 */
export function LocalDateTime({
  date,
  options,
}: {
  date: Date | string | number
  options?: Intl.DateTimeFormatOptions
}) {
  const d = date instanceof Date ? date : new Date(date)
  const text = d.toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...options,
  })
  return <span suppressHydrationWarning>{text}</span>
}
