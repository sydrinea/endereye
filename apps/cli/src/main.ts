import {
  createEventData,
  computeHistoricalData,
  buildPlayerViews,
  runHeatmapSimulation,
  renderSurvivalHeatmap,
  copyPngToClipboard,
  type EventKind,
} from '@endereye/core'
import { defineCommand, runMain } from 'citty'
import { log } from './logger'

const main = defineCommand({
  meta: {
    name: 'endereye',
    description: 'LCQ/MSS survival odds generator',
  },
  args: {
    season: {
      type: 'string',
      description: 'Season number',
      required: true,
      alias: 's',
    },
    event: {
      type: 'string',
      description: 'Event type: lcq or mss',
      default: 'lcq',
      alias: 'e',
    },
    seed: {
      type: 'string',
      description: 'After which seed to compute (0 = pre-event)',
      default: '0',
      alias: 'a',
    },
    iterations: {
      type: 'string',
      description: 'Monte Carlo iterations',
      default: '10000',
      alias: 'i',
    },
  },
  async run({ args }) {
    const season = Number(args.season)
    const afterSeed = Number(args.seed)
    const iterations = Number(args.iterations)
    const kind = args.event as EventKind

    log.section(`S${season} ${kind.toUpperCase()} — After Seed ${afterSeed}`)

    log.start('Fetching event data...')
    const data = await createEventData(kind, season)

    log.start(`Computing historical state at seed ${afterSeed}...`)
    const state = computeHistoricalData(data, afterSeed)

    log.start(`Running Monte Carlo (${iterations.toLocaleString()} iterations)...`)

    const heatmap = runHeatmapSimulation(state, state.currentRound, iterations)

    const players = buildPlayerViews(state)
    const alive = players.filter((p) => !p.eliminated)

    log.success(`Simulation complete — ${alive.length} players surviving`)

    log.start('Rendering image...')
    const png = await renderSurvivalHeatmap({
      season,
      kind,
      currentRound: state.currentRound,
      results: heatmap,
      players: alive.map((p) => ({ uuid: p.uuid, nickname: p.nickname, eloRank: p.eloRank })),
      iterations,
    })
    copyPngToClipboard(png)
    log.success(`Copied image to clipboard`)
  },
})

runMain(main)
