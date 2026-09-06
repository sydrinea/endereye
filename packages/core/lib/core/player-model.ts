/**
 * The player model for simulation: how a real player's season stats translate
 * into a per-round "power" number, a variance, and a DNF probability, plus the
 * `SimPool` typed-array structure the Monte Carlo hot loop runs on.
 *
 * All the tuning constants here (compression factors, bonus weights, floors)
 * are empirical — they were fit so simulated qualification rates line up with
 * historical results (see the backtests in `tests/`). Treat the exact numbers
 * as knobs, not derived quantities.
 */
import { EventPlayer } from '../context/event'

/** An `EventPlayer` plus their running event `point` total and derived `winRate`. */
export type SimPlayer = EventPlayer & {
  point: number
  winRate: number
}

/** Aggregate timing stats for one lobby, used to normalise per-player bonuses. */
export interface LobbyStats {
  meanBest: number
  stdDevBest: number
  meanAvg: number
  meanGap: number
}

/** Fallback lobby stats (milliseconds) when a field has no usable timing data. */
export const DEFAULT_LOBBY_STATS: LobbyStats = {
  meanBest: 300000,
  stdDevBest: 60000,
  meanAvg: 450000,
  meanGap: 150000,
}

/** Zero-value `EventPlayer`; handy for building synthetic players in tests and in `events/build.ts`. */
export const EMPTY_PLAYER: EventPlayer = {
  uuid: '',
  nickname: '',
  country: null,
  eloRate: null,
  eloRank: null,
  bestTimeMs: 0,
  avgTimeMs: 0,
  wins: 0,
  losses: 0,
  playedMatches: 0,
  forfeits: 0,
}

/**
 * Wraps an `EventPlayer` with its current `point` total and a `winRate`.
 * A player with no decisive games gets 0.5 (no signal); a null season Elo is
 * coerced to 0 here so downstream math never has to null-check it.
 */
export function toSimPlayer(player: EventPlayer, point: number): SimPlayer {
  const decisive = player.wins + player.losses
  return {
    ...player,
    eloRate: player.eloRate ?? 0,
    point,
    winRate: decisive > 0 ? player.wins / decisive : 0.5,
  }
}

/** Arithmetic mean. Local copy (no empty-array guard); callers here always pass non-empty arrays. */
function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Derives lobby-wide timing stats from the field. Only players with real
 * (`> 0`) best/avg times contribute; if none do, `DEFAULT_LOBBY_STATS` is
 * returned so the rest of the model still has sane denominators.
 * `meanGap` is the mean of `avg - best` (how much a player typically loses to
 * their own ceiling) and drives the DNF and variance terms.
 */
export function calculateLobbyStats(players: SimPlayer[]): LobbyStats {
  const bestTimes = players.map((p) => p.bestTimeMs).filter((t) => t > 0)
  const avgTimes = players.map((p) => p.avgTimeMs).filter((t) => t > 0)

  if (bestTimes.length === 0 || avgTimes.length === 0) return DEFAULT_LOBBY_STATS

  const meanBest = mean(bestTimes)
  const meanAvg = mean(avgTimes)
  const gaps = players
    .filter((p) => p.bestTimeMs > 0 && p.avgTimeMs > 0)
    .map((p) => Math.max(0, p.avgTimeMs - p.bestTimeMs))
  const meanGap = gaps.length > 0 ? mean(gaps) : DEFAULT_LOBBY_STATS.meanGap
  const stdDevBest = Math.sqrt(mean(bestTimes.map((t) => (t - meanBest) ** 2)))

  return { meanBest, stdDevBest, meanAvg, meanGap }
}

/**
 * Probability this player fails to complete a given round. Scales with how far
 * their gap (`avg - best`) exceeds the lobby's typical gap, raised to 1.5 so
 * the tail grows faster than linearly, and capped at 0.4.
 */
export function getDNFProbability(p: SimPlayer, stats: LobbyStats): number {
  const gap = Math.max(0, p.avgTimeMs - p.bestTimeMs)
  return Math.min(0.4, 0.12 * (gap / (stats.meanGap || DEFAULT_LOBBY_STATS.meanGap)) ** 1.5)
}

/**
 * Standard deviation of this player's per-round power (the noise added in the
 * simulation). More games played ⇒ more confidence ⇒ lower base spread
 * (2500 → 1500). A player whose gap is worse than the lobby average gets extra
 * spread on top; the result is floored at 400 so no one is ever deterministic.
 */
export function getPlayerVariance(p: SimPlayer, stats: LobbyStats): number {
  const confidence = Math.min(p.playedMatches, 500) / 500
  const base = 2500 - 1000 * confidence
  const risk =
    (Math.max(0, p.avgTimeMs - p.bestTimeMs) / (stats.meanGap || DEFAULT_LOBBY_STATS.meanGap) -
      1.0) *
    800
  return Math.max(400, base + risk)
}

/**
 * The player's expected finishing strength in a round, before noise.
 *
 * Terms, in order: season Elo compressed toward 1700 (only 20% of the spread
 * survives, so lobbies stay competitive); a win-rate nudge that fades in with
 * sample size; an exponential bonus for a fast personal best relative to the
 * lobby; and an average-time bonus weighted more heavily in early rounds
 * (`round <= 5`), where consistency matters more than ceiling.
 */
export function getPlayerPower(p: SimPlayer, round: number, stats: LobbyStats): number {
  const elo = 1700 + ((p.eloRate || 1700) - 1700) * 0.2
  let power = elo + (p.winRate - 0.5) * 150 * (Math.min(p.playedMatches, 50) / 50)
  if (p.bestTimeMs > 0 && stats.stdDevBest > 0)
    power += 100 * Math.exp(((stats.meanBest - p.bestTimeMs) / stats.stdDevBest) * 0.8)
  if (p.avgTimeMs > 0) {
    const avgBonus = Math.max(0, (stats.meanAvg - p.avgTimeMs) / 1000)
    power += round <= 5 ? avgBonus * 0.75 : avgBonus * 0.25
  }
  return power
}

/** One draw from a standard normal, via Box–Muller. */
export function randomGaussian(): number {
  let u = 0,
    v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

/**
 * Struct-of-arrays representation of a field for the Monte Carlo hot loop.
 *
 * Allocated once per simulation run and mutated in place across all iterations,
 * so a run does no per-iteration allocation and stays off the GC's radar. The
 * static arrays (`dnfProb`, `variance`, `powerByRound`, `basePoints`) are set
 * by `createSimPool` and never touched again; `points`/`alive` are reset at the
 * start of each iteration; `rankIdx`/`rankVals` are scratch reused every round.
 */
export interface SimPool {
  n: number
  uuids: string[]
  uuidToIdx: Map<string, number>
  // static per-player data (never mutated)
  dnfProb: Float64Array        // [n]
  variance: Float64Array       // [n]
  powerByRound: Float64Array   // [n * 11]: power[i * 11 + round] for rounds 1–10
  basePoints: Float64Array     // [n] starting points, copied into `points` each iteration
  // mutable per-iteration state
  points: Float64Array         // [n]
  alive: Uint8Array            // [n] 1 = alive, 0 = eliminated
  // scratch space (reused each round, no allocation)
  rankIdx: Int32Array          // [n]
  rankVals: Float64Array       // [n]
}

/**
 * Builds a `SimPool`, precomputing each player's DNF probability, variance, and
 * power for rounds 1–10 (index `i * 11 + round`; slot 0 is unused so `round`
 * indexes directly). `basePoints` snapshots the entry point totals.
 */
export function createSimPool(players: SimPlayer[], stats: LobbyStats): SimPool {
  const n = players.length
  const pool: SimPool = {
    n,
    uuids: players.map((p) => p.uuid),
    uuidToIdx: new Map(players.map((p, i) => [p.uuid, i])),
    dnfProb: new Float64Array(n),
    variance: new Float64Array(n),
    powerByRound: new Float64Array(n * 11),
    basePoints: new Float64Array(n),
    points: new Float64Array(n),
    alive: new Uint8Array(n),
    rankIdx: new Int32Array(n),
    rankVals: new Float64Array(n),
  }
  for (let i = 0; i < n; i++) {
    const p = players[i]
    pool.dnfProb[i] = getDNFProbability(p, stats)
    pool.variance[i] = getPlayerVariance(p, stats)
    for (let r = 1; r <= 10; r++) {
      pool.powerByRound[i * 11 + r] = getPlayerPower(p, r, stats)
    }
    pool.basePoints[i] = p.point
  }
  return pool
}
