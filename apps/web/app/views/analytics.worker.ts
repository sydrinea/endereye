import { computeHistoricalData, computePlayerOdds } from '@endereye/core'
import type { EventContext, PlayerOdds, BracketEntry } from '@endereye/core'

export interface SeedSnapshot {
  seed: number
  playerOdds: Record<string, PlayerOdds>
  brackets: BracketEntry[]
}

export type WorkerMessage =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'done'; snapshots: SeedSnapshot[] }

self.onmessage = (e: MessageEvent<EventContext>) => {
  const eventData = e.data
  const total = eventData.currentRound - 1
  const snapshots: SeedSnapshot[] = []
  for (let seed = 1; seed <= total; seed++) {
    const ctx = computeHistoricalData(eventData, seed)
    const playerOdds = computePlayerOdds(ctx)
    snapshots.push({ seed, playerOdds, brackets: ctx.brackets })
    self.postMessage({ type: 'progress', completed: seed, total } satisfies WorkerMessage)
  }
  self.postMessage({ type: 'done', snapshots } satisfies WorkerMessage)
}
