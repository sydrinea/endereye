'use client'

import { useEventShell } from '../EventShell'
import { AnalyticsPanel } from '../AnalyticsPanel'

export function AnalyticsTabPage() {
  const { eventData, filteredNicknames, seed } = useEventShell()
  return (
    <AnalyticsPanel eventData={eventData} filteredNicknames={filteredNicknames} viewSeed={seed} />
  )
}
