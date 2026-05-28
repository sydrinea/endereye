import { computeHistoricalData, computeMCResults } from '@endereye/core'
import type { EventContext, MCResult } from '@endereye/core'

type WorkerMessage = { eventData: EventContext; seed: number }
type WorkerResponse = { phase: 'full'; mcResults: Record<string, MCResult> }

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { eventData, seed } = e.data
  const ctx = computeHistoricalData(eventData, seed)
  const full = computeMCResults(ctx, 20000)
  self.postMessage({ phase: 'full', mcResults: full } satisfies WorkerResponse)
}
