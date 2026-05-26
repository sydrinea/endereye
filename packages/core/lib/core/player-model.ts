import { EventPlayer } from '../context/event'

export type SimPlayer = EventPlayer & {
  point: number
  winRate: number
}

export interface LobbyStats {
  meanBest: number
  stdDevBest: number
  meanAvg: number
  meanGap: number
}

export const DEFAULT_LOBBY_STATS: LobbyStats = {
  meanBest: 300000,
  stdDevBest: 60000,
  meanAvg: 450000,
  meanGap: 150000,
}

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

export function toSimPlayer(player: EventPlayer, point: number): SimPlayer {
  const decisive = player.wins + player.losses
  return {
    ...player,
    eloRate: player.eloRate ?? 0,
    point,
    winRate: decisive > 0 ? player.wins / decisive : 0.5,
  }
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

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

export function getDNFProbability(p: SimPlayer, stats: LobbyStats): number {
  const gap = Math.max(0, p.avgTimeMs - p.bestTimeMs)
  return Math.min(0.4, 0.12 * (gap / (stats.meanGap || DEFAULT_LOBBY_STATS.meanGap)) ** 1.5)
}

export function getPlayerVariance(p: SimPlayer, stats: LobbyStats): number {
  const confidence = Math.min(p.playedMatches, 500) / 500
  const base = 2500 - 1000 * confidence
  const risk =
    (Math.max(0, p.avgTimeMs - p.bestTimeMs) / (stats.meanGap || DEFAULT_LOBBY_STATS.meanGap) -
      1.0) *
    800
  return Math.max(400, base + risk)
}

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

export function randomGaussian(): number {
  let u = 0,
    v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}
