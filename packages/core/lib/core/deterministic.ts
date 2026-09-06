/**
 * Exact best-case / worst-case reachability math — the "is it still
 * mathematically possible" questions behind the clinch pills and the
 * qualified/safe/danger status, computed by handing out every remaining seed
 * score in the most (or least) favourable way for one target player.
 *
 * These are decision procedures, not probabilities: they answer yes/no by
 * constructing the extreme outcome, so a `false` from `canStillWin` means
 * genuinely impossible and a `true` from `isSafeAtNextCut` means guaranteed.
 * Monte Carlo (`monte-carlo.ts`) supplies the likelihoods in between.
 *
 * `fixed` (uuid → 1-based finishing place) pins some players' current-seed
 * results — used by the client-side "what if the seed finished like this"
 * recompute; a pinned place both scores that player exactly and removes that
 * place from the pool the free players draw from.
 */
import type { EliminationCut } from './config'
import type { SimPlayer } from './player-model'
import { getAvailableScores, applyElimination } from './scoring'

/**
 * Worst-case (for the target) hand-out of `avail` seed scores: each opponent at
 * or below the target, richest first, is given the smallest available score
 * that lifts them one point past `targetPts`; whatever scores are left are
 * dumped on the remaining players. Mutates the players in `unassigned` and
 * consumes `avail`.
 */
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

/** Worst-case current seed for the target: opponents get ascending scores tuned to just overtake. */
function applyWorstCaseSeed(state: SimPlayer[], targetUuid: string): void {
  const scores = getAvailableScores(state.length - 1)
  const tIdx = state.findIndex((p) => p.uuid === targetUuid)
  const targetPts = state[tIdx].point
  const avail = [...scores].sort((a, b) => a - b)
  const others = state.filter((p) => p.uuid !== targetUuid)
  assignOvertakeScores(others, avail, targetPts)
}

/**
 * Best-case for the target over `seeds` future rounds: each round the target
 * takes first place and the others take the remaining scores in point order
 * (richest opponent gets the next-best score, so the field stays as bunched as
 * possible behind the target). Pure — returns a fresh copy.
 */
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

/**
 * Best-case current seed with some players pinned (`fixed`: uuid → 1-based
 * place). Pinned players score exactly their place; an unpinned target takes
 * the best score still available; the remaining scores go to the other free
 * players in any order, since only the target's own total and rank are read
 * afterwards. Mutates `state`.
 */
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

/**
 * Can the target still finish in the top `targetRank`, given every favourable
 * break from here on?
 *
 * Gives the target the best current seed (respecting `fixed`), then best-cases
 * each segment between cuts and applies each cut for real; if the target is
 * ever eliminated by a cut the answer is `false`. After the last cut it
 * best-cases the remaining seeds and checks the final rank. A `false` is a hard
 * mathematical elimination.
 */
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

/**
 * Worst-case current seed with some players pinned (`fixed`: uuid → 1-based
 * place). Pinned players score their place. An unpinned target is given
 * `targetScore` (or 0), and the remaining scores go to the free opponents via
 * `assignOvertakeScores` so they clear the target by the thinnest margin.
 * Mutates `state`.
 */
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

/**
 * Is the target guaranteed to survive the next cut, no matter how the
 * intervening seeds fall?
 *
 * Constructs the worst case: gives opponents the current seed (honouring
 * `fixed` or a known `fixedNextScore` for the target), then worst-cases every
 * seed up to the cut, then applies the cut. Returns `true` only if the target
 * still survives that. Returns `true` early if the event is already past all
 * cuts.
 *
 * @param fixedNextScore the target's own current-seed score, if already known.
 */
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

/**
 * The easiest current-seed result that already guarantees the target survives
 * the immediately-next cut — the "clinch" pill.
 *
 * Only meaningful when this seed *is* a cut seed. Tries a DNF first (score 0),
 * then walks scores from worst to best and returns the first that makes
 * `isSafeAtNextCutDeterministic` true, so the returned `place` is the worst
 * finish the target can afford. `null` if there's no next cut here, the
 * target's result is already pinned, or nothing clinches.
 */
export function getClinchScore(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  fixed: Record<string, number> | null = null,
): { score: number; place: number | 'DNF' } | null {
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCut || nextCut.afterSeed !== currentRound) return null
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
