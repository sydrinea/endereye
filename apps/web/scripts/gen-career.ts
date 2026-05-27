import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeHistoricalData, computePlayerOdds, MAX_SCORE_PER_SEED } from '@endereye/core'
import type { BracketEntry, EventContext } from '@endereye/core'
import { getAllEvents } from '../lib/events-config'
import { getEventContext } from '../lib/event-data'
import { CAREER_COLORS } from '../lib/career-data'
import type { CareerEventSlice } from '../lib/career-data'
import { computeFinalistsData } from '../lib/finals-stats'
import type { EventConfig } from '../lib/events-config'


const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DATA = join(__dirname, '..', 'public', 'data')

const CUT_SEEDS = [3, 5, 7, 8, 9, 10]

type SnapData = {
  seed: number
  survivalPct: number
  clinchScore: number | null
  bracket: BracketEntry | null
}

function buildSlice(
  label: string,
  color: string,
  ctx: EventContext,
  snaps: SnapData[],
): CareerEventSlice {
  const snapshots = snaps.map((snap, i) => {
    let clinchSlack: number | null = null
    if (CUT_SEEDS.includes(snap.seed)) {
      const prev = snaps[i - 1]
      if (prev) {
        const clinch = prev.clinchScore ?? MAX_SCORE_PER_SEED
        const actual = snap.bracket?.completions[snap.seed - 1]?.score ?? 0
        clinchSlack = actual - clinch
      }
    }
    return { seed: snap.seed, survivalPct: snap.survivalPct, clinchSlack }
  })

  const dnfSeeds: Array<{ seed: number; survivalDrop: number }> = []
  for (let i = 1; i < snaps.length; i++) {
    const before = snaps[i - 1]
    const after = snaps[i]
    if (!before.bracket || before.bracket.eliminated) continue
    if (after.bracket?.completions[after.seed - 1] !== null) continue
    const drop = before.survivalPct - after.survivalPct
    if (drop > 0) dnfSeeds.push({ seed: after.seed, survivalDrop: drop })
  }

  const seedResults = snaps.map((snap, i) => {
    const bracket = snap.bracket
    if (!bracket)
      return { place: null, score: null, rankAfter: null, rankDelta: null, eliminated: true }
    const completion = bracket.completions[snap.seed - 1] ?? null
    const rankAfter = bracket.ranks[snap.seed] ?? null
    const prevRank = i > 0 ? (snaps[i - 1].bracket?.ranks[snap.seed - 1] ?? null) : null
    return {
      place: completion?.place ?? null,
      score: completion?.score ?? null,
      rankAfter,
      rankDelta: rankAfter !== null && prevRank !== null ? prevRank - rankAfter : null,
      eliminated: i > 0 ? (snaps[i - 1].bracket?.eliminated ?? false) : false,
    }
  })

  const lastSnap = snaps[snaps.length - 1]
  const finalRank = lastSnap?.bracket?.ranks[lastSnap.seed] ?? null
  const qualified =
    ctx.currentRound > 10 && finalRank !== null && finalRank <= (ctx.qualifyCount ?? 4)

  return { label, color, snapshots, finalRank, qualified, dnfSeeds, seedResults }
}

async function main() {
  const allEvents = await getAllEvents()
  console.log(`getAllEvents → ${allEvents.length} events`)

  const now = new Date()
  const completed = allEvents
    .filter((e) => e.startDate < now)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  console.log(`Past events: ${completed.length} (of ${allEvents.length} total)`)
  if (allEvents.length > 0 && completed.length === 0) {
    console.log('  All event startDates are in the future? First event:', allEvents[0].startDate)
  }

  // uuid → sorted list of { startTime, eventConfig, ctx, snaps }
  const playerEntries = new Map<
    string,
    Array<{ startTime: number; config: EventConfig; ctx: EventContext; snaps: SnapData[] }>
  >()
  const loadedEvents: Array<{ config: EventConfig; context: EventContext }> = []

  for (let ei = 0; ei < completed.length; ei++) {
    const config = completed[ei]
    process.stdout.write(`[${ei + 1}/${completed.length}] ${config.label} (prefix: ${config.prefix}) `)

    const ctx = await getEventContext(
      config.kind,
      config.season,
      config.prefix,
      config.qualifyCount,
    )
    if (!ctx || ctx.currentRound <= 1) {
      console.log(`(skip — ctx=${ctx ? `round ${ctx.currentRound}` : 'null'})`)
      continue
    }

    loadedEvents.push({ config, context: ctx })
    const totalSeeds = ctx.currentRound - 1
    console.log(`round=${ctx.currentRound} players=${ctx.players.length} seeds to compute=${totalSeeds}`)

    // Init snap accumulators for every player in this event
    const eventSnaps = new Map<string, SnapData[]>()
    for (const p of ctx.players) eventSnaps.set(p.uuid, [])

    // One MC pass per seed — all players computed simultaneously
    for (let seed = 1; seed <= totalSeeds; seed++) {
      process.stdout.write(`${seed}`)
      const sliced = computeHistoricalData(ctx, seed)
      const allOdds = computePlayerOdds(sliced)

      for (const [uuid, snaps] of eventSnaps) {
        const odds = allOdds[uuid]
        const bracket = sliced.brackets.find((b) => b.uuid === uuid) ?? null
        snaps.push({
          seed,
          survivalPct: Math.round((odds?.survivalProbability ?? 0) * 100),
          clinchScore: odds?.clinchScore ?? null,
          bracket,
        })
      }
      process.stdout.write(seed < totalSeeds ? ',' : '')
    }
    console.log()

    for (const [uuid, snaps] of eventSnaps) {
      if (snaps.length === 0) continue
      const list = playerEntries.get(uuid) ?? []
      list.push({ startTime: config.startDate.getTime(), config, ctx, snaps })
      playerEntries.set(uuid, list)
    }
  }

  // Write per-player career JSONs
  const careerDir = join(PUBLIC_DATA, 'career')
  await mkdir(careerDir, { recursive: true })

  let written = 0
  for (const [uuid, entries] of playerEntries) {
    entries.sort((a, b) => a.startTime - b.startTime)
    const slices: CareerEventSlice[] = entries.map(({ config, ctx, snaps }, idx) =>
      buildSlice(config.label, CAREER_COLORS[idx % CAREER_COLORS.length], ctx, snaps),
    )
    await writeFile(join(careerDir, `${uuid}.json`), JSON.stringify(slices))
    written++
  }
  console.log(`Wrote ${written} career files → public/data/career/`)

  // Write finalists JSON
  process.stdout.write('Computing finalists… ')
  const finalistsData = computeFinalistsData(loadedEvents)
  await writeFile(join(PUBLIC_DATA, 'finalists.json'), JSON.stringify(finalistsData))
  console.log('done → public/data/finalists.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
