import type { EliminationCut } from './config'
import type { SimPlayer } from './player-model'
import { getAvailableScores, applyElimination } from './scoring'

function applyWorstCaseSeed(state: SimPlayer[], targetUuid: string): void {
  const scores = getAvailableScores(state.length - 1)
  const tIdx = state.findIndex((p) => p.uuid === targetUuid)

  const targetPts = state[tIdx].point
  const avail = [...scores].sort((a, b) => a - b)
  const others = state.filter((p) => p.uuid !== targetUuid)
  const unassigned = [...others]

  for (const p of [...unassigned]
    .filter((p) => p.point <= targetPts)
    .sort((a, b) => b.point - a.point)) {
    const needed = targetPts + 1 - p.point
    const idx = avail.findIndex((s) => s >= needed)
    if (idx === -1) continue
    p.point += avail.splice(idx, 1)[0]
    unassigned.splice(unassigned.indexOf(p), 1)
  }

  for (const p of unassigned) p.point += avail.pop() ?? 0
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

export function canStillWinDeterministic(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  targetRank: number,
): boolean {
  let alive = players.map((p) => ({ ...p }))
  let sDone = currentRound - 1

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

export function isSafeAtNextCutDeterministic(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  fixedNextScore: number | null = null,
): boolean {
  const lastSeed = Math.max(...cuts.map((c) => c.afterSeed), currentRound)
  if (currentRound > lastSeed) return true
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCut) return true

  const state = players.map((p) => ({ ...p }))
  const tIdx = state.findIndex((p) => p.uuid === targetUuid)
  if (tIdx === -1) return false

  if (fixedNextScore !== null) {
    const scores = getAvailableScores(state.length)
    state[tIdx].point += fixedNextScore
    const otherScores = [...scores]
    const fIdx = otherScores.indexOf(fixedNextScore)
    if (fIdx !== -1) otherScores.splice(fIdx, 1)
    const targetPts = state[tIdx].point
    const avail = [...otherScores].sort((a, b) => a - b)
    const unassigned = state.filter((p) => p.uuid !== targetUuid)
    for (const p of [...unassigned]
      .filter((p) => p.point <= targetPts)
      .sort((a, b) => b.point - a.point)) {
      const needed = targetPts + 1 - p.point
      const idx = avail.findIndex((s) => s >= needed)
      if (idx === -1) continue
      p.point += avail.splice(idx, 1)[0]
      unassigned.splice(unassigned.indexOf(p), 1)
    }
    for (const p of unassigned) p.point += avail.pop() ?? 0
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
): { score: number; place: number | 'DNF' } | null {
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCut || nextCut.afterSeed !== currentRound) return null
  if (isSafeAtNextCutDeterministic(targetUuid, players, currentRound, cuts, 0))
    return { score: 0, place: 'DNF' }

  const scores = getAvailableScores(players.length)
  for (let i = scores.length - 1; i >= 0; i--) {
    if (isSafeAtNextCutDeterministic(targetUuid, players, currentRound, cuts, scores[i]))
      return { score: scores[i], place: i + 1 }
  }
  return null
}
