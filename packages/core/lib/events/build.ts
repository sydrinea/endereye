import type { Match, BracketEntry, Event, MatchList, PhaseLeaderboard } from '../api/types'
import { ELIMINATION_SCHEDULE, MAX_SCORE_PER_SEED } from '../core/config'
import { applyElimination, toSimPlayer, EMPTY_PLAYER } from '../core/simulation'

function getScoreForPlace(place: number, completionCount: number): number {
  const N = Math.min(completionCount, MAX_SCORE_PER_SEED)
  if (place > MAX_SCORE_PER_SEED) return 0
  return Math.round((MAX_SCORE_PER_SEED * (N - place + 1)) / N)
}

export function buildEvent(seedMatches: Match[], bonusMap: Map<string, number>): Event {
  const sorted = [...seedMatches].sort((a, b) => a.id - b.id)

  const field = sorted[0].players.map((p) => p.uuid)
  const points = new Map(field.map((uuid) => [uuid, bonusMap.get(uuid) ?? 0]))

  const active = new Set(field)
  const cutEliminated = new Set<string>()

  const completionHistory = new Map<string, BracketEntry['completions'][number][]>(
    field.map((uuid) => [uuid, []]),
  )

  let prevRanks = new Map<string, number>(field.map((uuid) => [uuid, 1]))

  for (let s = 0; s < sorted.length; s++) {
    const match = sorted[s]
    const seedNum = s + 1

    if (!match.completions) throw new Error(`Match ${match.id} missing completions`)

    const scoreMap = new Map<string, { place: number; score: number }>()
    for (let i = 0; i < match.completions.length; i++) {
      const c = match.completions[i]
      scoreMap.set(c.uuid, {
        place: i + 1,
        score: getScoreForPlace(i + 1, match.players.length),
      })
    }

    for (const uuid of field) {
      const history = completionHistory.get(uuid)!
      if (cutEliminated.has(uuid)) {
        history.push(null)
        continue
      }
      const completion = scoreMap.get(uuid)
      if (completion) {
        points.set(uuid, (points.get(uuid) ?? 0) + completion.score)
        history.push({ place: completion.place, score: completion.score })
      } else {
        history.push(null)
      }
    }

    const currentRanks = new Map<string, number>()
    const toRank = [...field]
      .filter((uuid) => !cutEliminated.has(uuid))
      .sort((a, b) => {
        const pa = points.get(a) ?? 0
        const pb = points.get(b) ?? 0
        return pb !== pa ? pb - pa : a.localeCompare(b)
      })

    let rank = 1
    for (let i = 0; i < toRank.length; i++) {
      if (i > 0 && (points.get(toRank[i]) ?? 0) < (points.get(toRank[i - 1]) ?? 0)) rank = i + 1
      currentRanks.set(toRank[i], rank)
    }

    const cut = ELIMINATION_SCHEDULE.find((c) => c.afterSeed === seedNum)
    if (cut) {
      const simPlayers = [...active].map((uuid) =>
        toSimPlayer({ ...EMPTY_PLAYER, uuid, nickname: uuid }, points.get(uuid) ?? 0),
      )
      const survivors = applyElimination(simPlayers, cut)
      const survivorSet = new Set(survivors.map((p) => p.uuid))
      for (const uuid of active) {
        if (!survivorSet.has(uuid)) {
          active.delete(uuid)
          cutEliminated.add(uuid)
        }
      }
    }

    const nextRanks = new Map(prevRanks)
    for (const [uuid, r] of currentRanks) nextRanks.set(uuid, r)
    prevRanks = nextRanks
  }

  const brackets: BracketEntry[] = field.map((uuid) => ({
    uuid,
    rank: prevRanks.get(uuid) ?? field.length,
    prevRank: prevRanks.get(uuid) ?? field.length,
    point: points.get(uuid) ?? 0,
    bonus: bonusMap.get(uuid) ?? 0,
    eliminated: cutEliminated.has(uuid),
    completions: completionHistory.get(uuid) ?? [],
  }))

  return {
    currentRound: sorted.length + 1,
    matches: sorted.map((m) => m.id),
    brackets,
    players: sorted[0].players,
  }
}

export function computeBonusMap(
  seedMatches: MatchList,
  leaderboard: PhaseLeaderboard,
): Map<string, number> {
  const firstSeed = [...seedMatches].sort((a, b) => a.id - b.id)[0]
  const field = new Set(firstSeed.players.map((p) => p.uuid))

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
