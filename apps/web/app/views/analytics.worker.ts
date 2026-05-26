import { computeHistoricalData, computePlayerOdds } from '@endereye/core'
import type { EventContext, PlayerOdds, BracketEntry } from '@endereye/core'

export interface SeedSnapshot {
  seed: number
  playerOdds: Record<string, PlayerOdds>
  brackets: BracketEntry[]
}

self.onmessage = (e: MessageEvent<EventContext>) => {
  const eventData = e.data
  const totalSeeds = eventData.currentRound - 1
  const snapshots: SeedSnapshot[] = []
  for (let seed = 1; seed <= totalSeeds; seed++) {
    const ctx = computeHistoricalData(eventData, seed)
    const playerOdds = computePlayerOdds(ctx)
    snapshots.push({ seed, playerOdds, brackets: ctx.brackets })
  }
  self.postMessage(snapshots)
}
