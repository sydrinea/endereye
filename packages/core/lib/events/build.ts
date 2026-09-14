/**
 * Builds a normalized `Event` (per-player brackets, completion + rank history,
 * cuts applied) from raw seed data. Two entry points:
 * - `buildEvent` — from `Match[]`, scoring each seed from `match.completions`.
 * - `buildEventFromApiResponse` — from a pre-scored blob, reading `completions[s]`.
 *
 * Both feed `replaySeeds`, which owns the shared work: accumulate points seed
 * by seed, dense-rank the survivors, and apply any `ELIMINATION_SCHEDULE` cut
 * whose seed was just played. `computeBonusMap` derives the season carry-in
 * points beforehand.
 */
import type { Match, BracketEntry, Event, MatchList, PhaseLeaderboard } from '../api/types'
import { ELIMINATION_SCHEDULE } from '../core/config'
import { applyElimination, getAvailableScores, toSimPlayer, EMPTY_PLAYER } from '../core/simulation'

/** A player's result in one seed. */
type SeedResult = { place: number; score: number }

interface SeedReplay {
  /** Every uuid in the event, in a stable order (drives bracket output order). */
  field: string[]
  /** uuid → carry-in bonus points. */
  bonusMap: Map<string, number>
  /** How many seeds have been played and should be replayed. */
  seedCount: number
  /** Tiebreak between players with equal bonus in the pre-seed-1 standings. */
  initialTiebreak: (a: string, b: string) => number
  /** Results for seed `s` (0-based): uuid → { place, score }, only players who completed. */
  seedResults: (s: number) => Map<string, SeedResult>
}

/**
 * Dense 1-based ranking of `sortedDesc` (already ordered by `key`, highest
 * first): equal keys share a rank and the next distinct key jumps to its
 * positional index — keys `[10, 8, 8, 5]` give ranks `[1, 2, 2, 4]`.
 */
function denseRankMap(sortedDesc: string[], key: (uuid: string) => number): Map<string, number> {
  const ranks = new Map<string, number>()
  let rank = 1
  for (let i = 0; i < sortedDesc.length; i++) {
    if (i > 0 && key(sortedDesc[i]) < key(sortedDesc[i - 1])) rank = i + 1
    ranks.set(sortedDesc[i], rank)
  }
  return ranks
}

/**
 * The shared seed-replay loop behind both build entry points.
 *
 * Points start at each player's bonus. Pre-seed-1 rank is by bonus then the
 * caller's tiebreak. For each played seed: add that seed's scores, record the
 * completion (or `null` for a non-completer / already-eliminated player),
 * dense-rank the still-active field by running points (uuid tiebreak, for
 * stable output), then apply the scheduled cut if this seed has one. An
 * eliminated player is frozen — `null` completions and their last rank for
 * every later seed.
 */
function replaySeeds({
  field,
  bonusMap,
  seedCount,
  initialTiebreak,
  seedResults,
}: SeedReplay): BracketEntry[] {
  const points = new Map(field.map((uuid) => [uuid, bonusMap.get(uuid) ?? 0]))
  const active = new Set(field)
  const cutEliminated = new Set<string>()
  const completionHistory = new Map<string, BracketEntry['completions'][number][]>(
    field.map((uuid) => [uuid, []]),
  )

  const bonusOf = (uuid: string) => bonusMap.get(uuid) ?? 0
  const initialSorted = [...field].sort(
    (a, b) => bonusOf(b) - bonusOf(a) || initialTiebreak(a, b),
  )
  const initialRankMap = denseRankMap(initialSorted, bonusOf)
  const ranksHistory = new Map<string, number[]>(
    field.map((uuid) => [uuid, [initialRankMap.get(uuid) ?? field.length]]),
  )

  for (let s = 0; s < seedCount; s++) {
    const seedNum = s + 1
    const results = seedResults(s)

    for (const uuid of field) {
      const history = completionHistory.get(uuid)!
      if (cutEliminated.has(uuid)) {
        history.push(null)
        continue
      }
      const result = results.get(uuid)
      if (result) {
        points.set(uuid, (points.get(uuid) ?? 0) + result.score)
        history.push({ place: result.place, score: result.score })
      } else {
        history.push(null)
      }
    }

    const pointsOf = (uuid: string) => points.get(uuid) ?? 0
    const toRank = [...field]
      .filter((uuid) => !cutEliminated.has(uuid))
      .sort((a, b) => pointsOf(b) - pointsOf(a) || a.localeCompare(b))
    const currentRanks = denseRankMap(toRank, pointsOf)

    const cut = ELIMINATION_SCHEDULE.find((c) => c.afterSeed === seedNum)
    if (cut) {
      const simPlayers = [...active].map((uuid) =>
        toSimPlayer({ ...EMPTY_PLAYER, uuid, nickname: uuid }, points.get(uuid) ?? 0),
      )
      const survivorSet = new Set(applyElimination(simPlayers, cut).map((p) => p.uuid))
      for (const uuid of active) {
        if (!survivorSet.has(uuid)) {
          active.delete(uuid)
          cutEliminated.add(uuid)
        }
      }
    }

    for (const uuid of field) {
      ranksHistory.get(uuid)!.push(currentRanks.get(uuid) ?? field.length)
    }
  }

  return field.map((uuid) => ({
    uuid,
    ranks: ranksHistory.get(uuid) ?? [],
    point: points.get(uuid) ?? 0,
    bonus: bonusMap.get(uuid) ?? 0,
    eliminated: cutEliminated.has(uuid),
    completions: completionHistory.get(uuid) ?? [],
  }))
}

/**
 * Builds an `Event` from the seed matches themselves.
 *
 * The field is the union of players across all seeds (late joiners are
 * backfilled with `null` completions for earlier seeds). Each seed's scores are
 * derived from the completion order in `match.completions` via the standard
 * score table; the pre-seed-1 rank tiebreak is Elo, highest first.
 */
export function buildEvent(seedMatches: Match[], bonusMap: Map<string, number>): Event {
  const sorted = [...seedMatches].sort((a, b) => a.id - b.id)

  // Field = union of players over all seeds, so late joiners are included and
  // backfilled with nulls for the seeds before they appeared.
  const playerEloMap = new Map<string, number>()
  const allSeenPlayers: Match['players'][number][] = []
  for (const match of sorted) {
    for (const p of match.players) {
      if (!playerEloMap.has(p.uuid)) {
        playerEloMap.set(p.uuid, p.eloRate ?? 0)
        allSeenPlayers.push(p)
      }
    }
  }
  const field = allSeenPlayers.map((p) => p.uuid)
  const eloOf = (uuid: string) => playerEloMap.get(uuid) ?? 0

  const brackets = replaySeeds({
    field,
    bonusMap,
    seedCount: sorted.length,
    initialTiebreak: (a, b) => eloOf(b) - eloOf(a),
    seedResults: (s) => {
      const match = sorted[s]
      if (!match.completions) throw new Error(`Match ${match.id} missing completions`)
      const scores = getAvailableScores(match.players.length)
      const results = new Map<string, SeedResult>()
      for (let i = 0; i < match.completions.length; i++) {
        results.set(match.completions[i].uuid, { place: i + 1, score: scores[i] ?? 0 })
      }
      return results
    },
  })

  return {
    currentRound: sorted.length + 1,
    matches: sorted.map((m) => m.id),
    brackets,
    players: allSeenPlayers,
  }
}

/** Pre-scored bracket from the precomputed API blob: `completions[s]` already carries a `score`. */
export interface ApiBracketEntry {
  uuid: string
  point: number
  bonus: number
  eliminated: boolean
  completions: Array<{ place: number; score: number } | null>
}

/** Precomputed event payload — the shape stored/served when scoring has already been done upstream. */
export interface ApiEventData {
  currentRound: number
  matches: number[]
  brackets: ApiBracketEntry[]
  players: Array<{ uuid: string; nickname: string }>
}

/**
 * Builds an `Event` from a pre-scored `ApiEventData` blob. Same replay as
 * `buildEvent`, but each seed's scores are read straight from
 * `bracket.completions[s]` and only the `currentRound - 1` played seeds are
 * replayed. The field is fixed (no late-joiner union), the pre-seed-1 tiebreak
 * is by uuid, and player profiles come back minimal (Elo/country null).
 */
export function buildEventFromApiResponse(apiData: ApiEventData): Event {
  const field = apiData.brackets.map((b) => b.uuid)

  const brackets = replaySeeds({
    field,
    bonusMap: new Map(apiData.brackets.map((b) => [b.uuid, b.bonus])),
    seedCount: apiData.currentRound - 1,
    initialTiebreak: (a, b) => a.localeCompare(b),
    seedResults: (s) => {
      const results = new Map<string, SeedResult>()
      for (const bracket of apiData.brackets) {
        const c = bracket.completions[s]
        if (c) results.set(bracket.uuid, { place: c.place, score: c.score })
      }
      return results
    },
  })

  return {
    currentRound: apiData.currentRound,
    matches: apiData.matches,
    brackets,
    players: apiData.players.map((p) => ({ uuid: p.uuid, eloRate: null, country: null })),
  }
}

/**
 * Carry-in bonus points for a known field: `floor((phasePoint - cutoff) / 10)`,
 * where `cutoff` is the lowest qualifying player's phase points (so the last
 * player in gets 0 and everyone else is scaled above that), never negative.
 * Sort is by predicted phase points, then Elo rank, to decide the cutoff.
 */
export function computeBonusMapForPlayers(
  field: Set<string>,
  leaderboard: PhaseLeaderboard,
): Map<string, number> {
  const sorted = [...leaderboard.users]
    .sort((a, b) => {
      if (b.predPhasePoint !== a.predPhasePoint) return b.predPhasePoint - a.predPhasePoint
      return (a.eloRank ?? Infinity) - (b.eloRank ?? Infinity)
    })
    .filter((u) => field.has(u.uuid))

  const cutoffPoints = sorted[sorted.length - 1]?.seasonResult.phasePoint ?? 0

  return new Map(
    sorted.map((u) => [
      u.uuid,
      Math.max(0, Math.floor((u.seasonResult.phasePoint - cutoffPoints) / 10)),
    ]),
  )
}

/**
 * Same as `computeBonusMapForPlayers`, but takes the field from the players in
 * the first seed's match rather than an explicit set.
 */
export function computeBonusMap(
  seedMatches: MatchList,
  leaderboard: PhaseLeaderboard,
): Map<string, number> {
  const firstSeed = [...seedMatches].sort((a, b) => a.id - b.id)[0]
  const field = new Set(firstSeed.players.map((p) => p.uuid))
  return computeBonusMapForPlayers(field, leaderboard)
}
