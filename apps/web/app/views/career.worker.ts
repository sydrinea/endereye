import { computeHistoricalData, computePlayerOdds, MAX_SCORE_PER_SEED } from '@endereye/core'
import type { BracketEntry } from '@endereye/core'
import type { CareerRawEvent, CareerContext } from '../../lib/career-data'

const CUT_SEEDS = [3, 5, 7, 8, 9, 10]

interface CareerSeedSnapshot {
  seed: number
  survivalPct: number
  clinchSlack: number | null
}

interface CareerSeedResultCell {
  place: number | null
  score: number | null
  rankAfter: number | null
  rankDelta: number | null
  eliminated: boolean
}

export interface CareerEventSlice {
  label: string
  color: string
  snapshots: CareerSeedSnapshot[]
  finalRank: number | null
  qualified: boolean
  dnfSeeds: Array<{ seed: number; survivalDrop: number }>
  seedResults: CareerSeedResultCell[]
}

type SnapData = {
  seed: number
  survivalPct: number
  clinchScore: number | null
  bracket: BracketEntry | null
}

function computeCareerSlice(uuid: string, ev: CareerRawEvent): CareerEventSlice {
  const ctx = ev.eventContext
  const totalSeeds = ctx.currentRound - 1
  const snaps: SnapData[] = []

  for (let seed = 1; seed <= totalSeeds; seed++) {
    const sliced = computeHistoricalData(ctx, seed)
    const odds = computePlayerOdds(sliced)
    const playerOdds = odds[uuid]
    const bracket = sliced.brackets.find((b) => b.uuid === uuid) ?? null
    snaps.push({
      seed,
      survivalPct: Math.round((playerOdds?.survivalProbability ?? 0) * 100),
      clinchScore: playerOdds?.clinchScore ?? null,
      bracket,
    })
  }

  const snapshots: CareerSeedSnapshot[] = snaps.map((snap, i) => {
    let clinchSlack: number | null = null
    if (CUT_SEEDS.includes(snap.seed)) {
      const prev = snaps[i - 1]
      if (prev) {
        const clinch = prev.clinchScore ?? MAX_SCORE_PER_SEED
        const actual = snap.bracket?.completions[snap.seed - 1]?.score ?? 0
        clinchSlack = actual - clinch
      }
    }
    return { seed: snap.seed, survivalPct: snap.survivalPct, clinchSlack }
  })

  const dnfSeeds: Array<{ seed: number; survivalDrop: number }> = []
  for (let i = 1; i < snaps.length; i++) {
    const before = snaps[i - 1]
    const after = snaps[i]
    if (!before.bracket || before.bracket.eliminated) continue
    if (after.bracket?.completions[after.seed - 1] !== null) continue
    const drop = before.survivalPct - after.survivalPct
    if (drop > 0) dnfSeeds.push({ seed: after.seed, survivalDrop: drop })
  }

  const seedResults: CareerSeedResultCell[] = snaps.map((snap, i) => {
    const bracket = snap.bracket
    if (!bracket)
      return { place: null, score: null, rankAfter: null, rankDelta: null, eliminated: true }
    const completion = bracket.completions[snap.seed - 1] ?? null
    const rankAfter = bracket.ranks[snap.seed] ?? null
    const prevRank = i > 0 ? (snaps[i - 1].bracket?.ranks[snap.seed - 1] ?? null) : null
    return {
      place: completion?.place ?? null,
      score: completion?.score ?? null,
      rankAfter,
      rankDelta: rankAfter !== null && prevRank !== null ? prevRank - rankAfter : null,
      eliminated: i > 0 ? (snaps[i - 1].bracket?.eliminated ?? false) : false,
    }
  })

  const lastSnap = snaps[snaps.length - 1]
  const finalRank = lastSnap?.bracket?.ranks[lastSnap.seed] ?? null
  const qualified =
    ctx.currentRound > 10 && finalRank !== null && finalRank <= (ctx.qualifyCount ?? 4)

  return { label: ev.label, color: ev.color, snapshots, finalRank, qualified, dnfSeeds, seedResults }
}

export type WorkerMessage =
  | { type: 'progress'; completed: number; total: number; label: string }
  | { type: 'done'; slices: CareerEventSlice[] }

self.onmessage = (e: MessageEvent<Pick<CareerContext, 'uuid' | 'events'>>) => {
  const { uuid, events } = e.data
  const slices: CareerEventSlice[] = []
  for (const ev of events) {
    slices.push(computeCareerSlice(uuid, ev))
    self.postMessage({ type: 'progress', completed: slices.length, total: events.length, label: ev.label } satisfies WorkerMessage)
  }
  self.postMessage({ type: 'done', slices } satisfies WorkerMessage)
}
