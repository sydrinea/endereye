import type { EliminationCut } from './config'
import type { SimPlayer } from './player-model'
import { getAvailableScores, applyElimination } from './scoring'

// Greedily hands out `avail` (ascending point values) to whichever players in
// `unassigned` need the smallest boost to just overtake `targetPts` (worst
// case for the target), then dumps any leftover scores on whoever's left.
// This exact loop was previously copy-pasted three times across this file's
// worst-case-seed variants.
function assignOvertakeScores(unassigned: SimPlayer[], avail: number[], targetPts: number): void {
  const pool = [...unassigned]
  for (const p of [...pool].filter((p) => p.point <= targetPts).sort((a, b) => b.point - a.point)) {
    const needed = targetPts + 1 - p.point
    const idx = avail.findIndex((s) => s >= needed)
    if (idx === -1) continue
    p.point += avail.splice(idx, 1)[0]
    pool.splice(pool.indexOf(p), 1)
  }
  for (const p of pool) p.point += avail.pop() ?? 0
}

function applyWorstCaseSeed(state: SimPlayer[], targetUuid: string): void {
  const scores = getAvailableScores(state.length - 1)
  const tIdx = state.findIndex((p) => p.uuid === targetUuid)
  const targetPts = state[tIdx].point
  const avail = [...scores].sort((a, b) => a - b)
  const others = state.filter((p) => p.uuid !== targetUuid)
  assignOvertakeScores(others, avail, targetPts)
}

function applyBestCaseSegment(
  targetUuid: string,
  players: SimPlayer[],
  seeds: number,
): SimPlayer[] {
  if (seeds <= 0) return players
  const result = players.map((p) => ({ ...p }))
  const tIdx = result.findIndex((p) => p.uuid === targetUuid)
  if (tIdx === -1) return players

  for (let s = 0; s < seeds; s++) {
    const scores = getAvailableScores(result.length)
    result[tIdx].point += scores[0]
    const others = result.filter((p) => p.uuid !== targetUuid).sort((a, b) => b.point - a.point)
    for (let i = 0; i < others.length; i++) others[i].point += scores[i + 1] ?? 0
  }
  return result
}

// Best-case (for the target) distribution of the current seed when some
// players are pinned to a known finishing place — the existence-question
// counterpart to applyFixedWorstCaseSeed below. Pinned players get exactly
// their pinned score; if the target itself isn't pinned, it gets the best
// remaining score (maximizing its own advantage, since "can still win" asks
// whether *any* outcome lets it reach the top targetRank); the rest of the
// leftover scores go to the other unpinned players in no particular order,
// since only the target's own point total and rank matter here.
function applyFixedBestCaseSeed(
  targetUuid: string,
  state: SimPlayer[],
  fixed: Record<string, number>,
): void {
  const n = state.length
  const scores = getAvailableScores(n)
  const takenPlaces = new Set<number>()

  for (const [uuid, place] of Object.entries(fixed)) {
    if (place < 1 || place > n) continue
    takenPlaces.add(place)
    const p = state.find((x) => x.uuid === uuid)
    if (p) p.point += scores[place - 1]
  }

  const avail = scores.filter((_, i) => !takenPlaces.has(i + 1)).sort((a, b) => b - a)
  const tIdx = state.findIndex((p) => p.uuid === targetUuid)
  const targetFixed = targetUuid in fixed

  if (!targetFixed && tIdx !== -1) {
    state[tIdx].point += avail.shift() ?? 0
  }

  const others = state.filter((p) => p.uuid !== targetUuid && !(p.uuid in fixed))
  for (let i = 0; i < others.length; i++) others[i].point += avail[i] ?? 0
}

export function canStillWinDeterministic(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  targetRank: number,
  fixed: Record<string, number> | null = null,
): boolean {
  let alive = players.map((p) => ({ ...p }))
  let sDone = currentRound - 1

  if (fixed && Object.keys(fixed).length > 0) {
    applyFixedBestCaseSeed(targetUuid, alive, fixed)
    sDone = currentRound
  }

  for (const cut of cuts) {
    if (cut.afterSeed < currentRound) continue
    alive = applyBestCaseSegment(targetUuid, alive, cut.afterSeed - sDone)
    alive = applyElimination(alive, cut)
    if (!alive.some((p) => p.uuid === targetUuid)) return false
    sDone = cut.afterSeed
  }

  if (sDone < 10) alive = applyBestCaseSegment(targetUuid, alive, 10 - sDone)

  const rank =
    [...alive].sort((a, b) => b.point - a.point).findIndex((p) => p.uuid === targetUuid) + 1
  return rank > 0 && rank <= targetRank
}

// Worst-case (for the target) distribution of the current seed when some players
// are pinned to a known finishing place. `fixed` maps uuid → 1-based place.
// The target — if not itself pinned — is given `targetScore` (or 0 if null),
// then the remaining seed scores are handed to the free opponents so as to
// overtake the target by the smallest possible margin.
function applyFixedWorstCaseSeed(
  state: SimPlayer[],
  targetUuid: string,
  fixed: Record<string, number>,
  targetScore: number | null,
): void {
  const n = state.length
  const scores = getAvailableScores(n)
  const takenPlaces = new Set<number>()

  for (const [uuid, place] of Object.entries(fixed)) {
    if (place < 1 || place > n) continue
    takenPlaces.add(place)
    const p = state.find((x) => x.uuid === uuid)
    if (p) p.point += scores[place - 1]
  }

  const avail = scores.filter((_, i) => !takenPlaces.has(i + 1)).sort((a, b) => a - b)
  const targetFixed = targetUuid in fixed
  const tIdx = state.findIndex((p) => p.uuid === targetUuid)

  if (!targetFixed && tIdx !== -1) {
    const ts = targetScore ?? 0
    state[tIdx].point += ts
    const k = avail.indexOf(ts)
    if (k !== -1) avail.splice(k, 1)
  }

  const targetPts = tIdx !== -1 ? state[tIdx].point : Infinity
  const freeOpps = state.filter((p) => p.uuid !== targetUuid && !(p.uuid in fixed))
  assignOvertakeScores(freeOpps, avail, targetPts)
}

export function isSafeAtNextCutDeterministic(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  fixedNextScore: number | null = null,
  fixed: Record<string, number> | null = null,
): boolean {
  const lastSeed = Math.max(...cuts.map((c) => c.afterSeed), currentRound)
  if (currentRound > lastSeed) return true
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCut) return true

  const state = players.map((p) => ({ ...p }))
  const tIdx = state.findIndex((p) => p.uuid === targetUuid)
  if (tIdx === -1) return false

  if (fixed && Object.keys(fixed).length > 0) {
    applyFixedWorstCaseSeed(state, targetUuid, fixed, targetUuid in fixed ? null : fixedNextScore)
  } else if (fixedNextScore !== null) {
    const scores = getAvailableScores(state.length)
    state[tIdx].point += fixedNextScore
    const otherScores = [...scores]
    const fIdx = otherScores.indexOf(fixedNextScore)
    if (fIdx !== -1) otherScores.splice(fIdx, 1)
    const targetPts = state[tIdx].point
    const avail = [...otherScores].sort((a, b) => a - b)
    const unassigned = state.filter((p) => p.uuid !== targetUuid)
    assignOvertakeScores(unassigned, avail, targetPts)
  } else {
    applyWorstCaseSeed(state, targetUuid)
  }

  for (let s = currentRound + 1; s < nextCut.afterSeed; s++) applyWorstCaseSeed(state, targetUuid)

  return applyElimination(state, nextCut).some((p) => p.uuid === targetUuid)
}

export function getClinchScore(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  fixed: Record<string, number> | null = null,
): { score: number; place: number | 'DNF' } | null {
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCut || nextCut.afterSeed !== currentRound) return null
  // The target's own result is already known — no clinch pill to show.
  if (fixed && targetUuid in fixed) return null
  if (isSafeAtNextCutDeterministic(targetUuid, players, currentRound, cuts, 0, fixed))
    return { score: 0, place: 'DNF' }

  const scores = getAvailableScores(players.length)
  const takenPlaces = fixed ? new Set(Object.values(fixed)) : new Set<number>()
  for (let i = scores.length - 1; i >= 0; i--) {
    if (takenPlaces.has(i + 1)) continue
    if (isSafeAtNextCutDeterministic(targetUuid, players, currentRound, cuts, scores[i], fixed))
      return { score: scores[i], place: i + 1 }
  }
  return null
}
