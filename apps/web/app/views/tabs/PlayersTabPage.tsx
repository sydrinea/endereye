'use client'

import { useEventShell } from '../EventShell'
import { PlayersPanel } from '../PlayersPanel'

export function PlayersTabPage() {
  const { eventData, filteredNicknames } = useEventShell()
  return <PlayersPanel players={eventData.players} filteredNicknames={filteredNicknames} />
}
