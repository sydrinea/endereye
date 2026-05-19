import { EventContext } from '../context/event'
import { ELIMINATION_SCHEDULE, QUALIFY_COUNT } from './config'
import type { MCResult, SimPlayer } from './simulation'
import {
  calculateLobbyStats,
  canStillWinDeterministic,
  defaultSimPlayer,
  getClinchScore,
  getPlayerPower,
  isSafeAtNextCutDeterministic,
  makeSimPlayer,
  runMonteCarlo,
} from './simulation'

export type PlayerStatus = 'qualified' | 'safe' | 'danger' | 'eliminated'

export interface PlayerOdds {
  uuid: string
  winProbability: number
  survivalProbability: number
  canStillWin: boolean
  isSafeAtNextCut: boolean
  clinchScore: number | null
  clinchPlace: number | 'DNF' | null
  cutDelta: number
  status: PlayerStatus
  power: number
}

export function computePlayerOdds(ctx: EventContext): Record<string, PlayerOdds> {
  const { currentRound, brackets, players } = ctx

  const playerLookup = new Map(players.map((p) => [p.uuid, p]))

  const alivePlayers: SimPlayer[] = brackets
    .filter((b) => !b.eliminated)
    .map((b) => {
      const p = playerLookup.get(b.uuid)
      return p ? makeSimPlayer(p, b.point) : defaultSimPlayer(b.uuid, b.point)
    })

  const isOver = currentRound > 10

  const nextCut = ELIMINATION_SCHEDULE.find((c) => c.afterSeed >= currentRound)
  let cutThresholdPoint = 0
  if (nextCut && alivePlayers.length > 0) {
    const sorted = [...alivePlayers].sort((a, b) => b.point - a.point)
    if ('rule' in nextCut) {
      cutThresholdPoint =
        nextCut.rule === 'zero_out'
          ? 1
          : sorted[Math.min(Math.ceil(alivePlayers.length / 2) - 1, sorted.length - 1)]?.point || 0
    } else {
      cutThresholdPoint = sorted[Math.min(nextCut.keepTop - 1, sorted.length - 1)]?.point || 0
    }
  }

  let mcResults: Record<string, MCResult> = {}
  if (!isOver && currentRound >= 1 && alivePlayers.length > 0)
    mcResults = runMonteCarlo(alivePlayers, currentRound, ELIMINATION_SCHEDULE, QUALIFY_COUNT)

  const lobbyStats = calculateLobbyStats(alivePlayers)

  const result: Record<string, PlayerOdds> = {}
  for (const bracket of brackets) {
    const player = playerLookup.get(bracket.uuid)
    const simPlayer: SimPlayer = player
      ? makeSimPlayer(player, bracket.point)
      : defaultSimPlayer(bracket.uuid, bracket.point)

    const power = getPlayerPower(simPlayer, currentRound, lobbyStats)
    const apiEliminated = bracket.eliminated

    let canWin = false
    let isSafe = false
    let winProb = 0
    let survProb = 0
    let clinchScore: number | null = null
    let clinchPlace: number | 'DNF' | null = null

    if (!apiEliminated && !isOver && currentRound >= 1) {
      canWin = canStillWinDeterministic(
        bracket.uuid,
        alivePlayers,
        currentRound,
        ELIMINATION_SCHEDULE,
        QUALIFY_COUNT,
      )
      if (canWin)
        isSafe = isSafeAtNextCutDeterministic(
          bracket.uuid,
          alivePlayers,
          currentRound,
          ELIMINATION_SCHEDULE,
        )
      const clinchData = getClinchScore(
        bracket.uuid,
        alivePlayers,
        currentRound,
        ELIMINATION_SCHEDULE,
      )
      if (clinchData) {
        clinchScore = clinchData.score
        clinchPlace = clinchData.place
      }
      const mc = mcResults[bracket.uuid]
      if (mc) {
        winProb = mc.winProbability
        survProb = mc.survivalProbability
      }
    } else if (isOver) {
      canWin = true
      isSafe = true
      if (bracket.rank <= QUALIFY_COUNT) {
        winProb = 1
        survProb = 1
      }
    }

    let status: PlayerStatus
    if (isOver && bracket.rank <= QUALIFY_COUNT) status = 'qualified'
    else if (apiEliminated) status = 'eliminated'
    else if (isSafe) status = 'safe'
    else status = 'danger'

    result[bracket.uuid] = {
      uuid: bracket.uuid,
      winProbability: winProb,
      survivalProbability: survProb,
      canStillWin: canWin,
      isSafeAtNextCut: isSafe,
      clinchScore,
      clinchPlace,
      cutDelta: bracket.point - cutThresholdPoint,
      status,
      power,
    }
  }

  return result
}
