import type { PlayerOdds } from './odds'
import type { SimPlayer } from './simulation'
import { createTournamentContext, EventContext, EventPlayer } from '../context/event'
import { computePlayerOdds } from './odds'
import {
  applyElimination,
  defaultSimPlayer,
  makeSimPlayer,
  runFullHeatmapSimulation,
} from './simulation'
import { BracketEntry, EventKind } from '../api/types'
import { ELIMINATION_SCHEDULE } from './config'

export interface TournamentPageData {
  readonly kind: EventKind
  readonly season: number
  readonly players: EventPlayer[]
  readonly brackets: BracketEntry[]
  readonly matches: number[]
  readonly currentRound: number
  readonly playerOdds: Record<string, PlayerOdds>
}

export type PlayerView = EventPlayer & BracketEntry & PlayerOdds

export async function createTournamentPageData(
  type: EventKind,
  season: number,
  opts: { skipOdds?: boolean } = {},
): Promise<TournamentPageData> {
  const ctx = await createTournamentContext(type, season)
  const playerOdds = opts.skipOdds ? ({} as Record<string, PlayerOdds>) : computePlayerOdds(ctx)
  return {
    kind: ctx.kind,
    season: ctx.season,
    players: ctx.players,
    brackets: ctx.brackets,
    matches: ctx.matches,
    currentRound: ctx.currentRound,
    playerOdds,
  }
}

export function calculatePoints(b: BracketEntry, seed: number): number {
  return (
    b.bonus +
    b.completions.slice(0, Math.min(seed, 10)).reduce((sum, c) => sum + (c?.score ?? 0), 0)
  )
}

export function computeHistoricalData(
  data: TournamentPageData,
  viewSeed: number,
): TournamentPageData {
  const bracketMap = new Map(data.brackets.map((b) => [b.uuid, b]))
  const playerLookup = new Map(data.players.map((p) => [p.uuid, p]))

  let surviving = new Set(data.brackets.map((b) => b.uuid))

  for (const cut of ELIMINATION_SCHEDULE) {
    if (cut.afterSeed > viewSeed) break
    const playersAtCut: SimPlayer[] = [...surviving].map((uuid) => {
      const p = playerLookup.get(uuid)
      const b = bracketMap.get(uuid)!
      const point = calculatePoints(b, cut.afterSeed)
      return p ? makeSimPlayer(p, point) : defaultSimPlayer(uuid, point)
    })
    const survivors = applyElimination(playersAtCut, cut)
    surviving = new Set(survivors.map((p) => p.uuid))
  }

  const modified = data.brackets.map((b) => ({
    ...b,
    point: calculatePoints(b, viewSeed),
    eliminated: !surviving.has(b.uuid),
    completions: b.completions.map((c, i) =>
      i < viewSeed ? c : null,
    ) as BracketEntry['completions'],
    prevRank: b.rank,
  }))

  const alive = [...modified]
    .filter((b) => !b.eliminated)
    .sort((a, b) => {
      if (b.point !== a.point) return b.point - a.point
      return a.uuid.localeCompare(b.uuid)
    })
  const dead = [...modified]
    .filter((b) => b.eliminated)
    .sort((a, b) => {
      if (b.point !== a.point) return b.point - a.point
      return a.uuid.localeCompare(b.uuid)
    })

  const rankMap = new Map<string, number>()
  let rank = 1
  for (let i = 0; i < alive.length; i++) {
    if (i > 0 && alive[i].point < alive[i - 1].point) rank = i + 1
    rankMap.set(alive[i].uuid, rank)
  }
  let elimRank = alive.length + 1
  for (const b of dead) rankMap.set(b.uuid, elimRank++)

  const newBrackets = modified.map((b) => ({ ...b, rank: rankMap.get(b.uuid) ?? b.rank }))

  const historicalCtx: EventContext = {
    kind: data.kind,
    season: data.season,
    players: data.players,
    brackets: newBrackets,
    matches: data.matches,
    currentRound: viewSeed + 1,
  }

  return {
    ...data,
    brackets: newBrackets,
    currentRound: viewSeed + 1,
    playerOdds: computePlayerOdds(historicalCtx),
  }
}

export function buildPlayerViews(data: TournamentPageData): PlayerView[] {
  const playerLookup = new Map(data.players.map((p) => [p.uuid, p]))
  return data.brackets
    .sort((a, b) => a.rank - b.rank)
    .map((b) => {
      const player: EventPlayer = playerLookup.get(b.uuid) ?? {
        uuid: b.uuid,
        nickname: b.uuid,
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
      const odds: PlayerOdds = data.playerOdds[b.uuid] ?? {
        uuid: b.uuid,
        winProbability: 0,
        survivalProbability: 0,
        canStillWin: false,
        isSafeAtNextCut: false,
        clinchScore: null,
        clinchPlace: null,
        cutDelta: 0,
        status: 'eliminated' as const,
        power: 0,
      }
      return { ...player, ...b, ...odds } as PlayerView
    })
}

export function runHeatmapSimulation(
  data: TournamentPageData,
  currentRound: number,
  iterations = 10000,
): Record<string, Record<number, number>> {
  const playerLookup = new Map(data.players.map((p) => [p.uuid, p]))
  const alivePlayers: SimPlayer[] = data.brackets
    .filter((b) => !b.eliminated)
    .map((b) => {
      const p = playerLookup.get(b.uuid)
      return p ? makeSimPlayer(p, b.point) : defaultSimPlayer(b.uuid, b.point)
    })
  return runFullHeatmapSimulation(
    alivePlayers,
    currentRound,
    ELIMINATION_SCHEDULE,
    data.kind,
    iterations,
  )
}
