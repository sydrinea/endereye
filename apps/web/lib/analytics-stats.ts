import { MAX_SCORE_PER_SEED } from '@endereye/core'
import type { EventPlayer } from '@endereye/core'
import type { SeedSnapshot } from '@/app/views/analytics.worker'
import type { SwingPoint } from '@/app/views/charts/SeedSwingChart'
import type { DnfEntry } from '@/app/views/charts/DnfImpactChart'
import type { SeedResultRow, SeedResultCell } from '@/app/views/charts/SeedResultsGrid'

export const PLAYER_COLORS = [
  '#38bdf8', '#4ade80', '#f472b6', '#fb923c', '#a78bfa',
  '#facc15', '#34d399', '#f87171', '#60a5fa', '#e879f9',
  '#fbbf24', '#2dd4bf', '#818cf8', '#f43f5e', '#22d3ee',
  '#84cc16', '#c084fc', '#fb7185', '#0ea5e9', '#10b981',
]

export const SEED_COLORS = [
  '#38bdf8', '#4ade80', '#fb923c', '#a78bfa', '#facc15',
  '#f472b6', '#34d399', '#f87171', '#60a5fa', '#e879f9',
]

export const CLINCH_CUT_SEEDS = [3, 5, 7, 8, 9, 10]

export function buildColorMap(players: EventPlayer[]): Map<string, string> {
  return new Map(players.map((p, i) => [p.uuid, PLAYER_COLORS[i % PLAYER_COLORS.length]]))
}

// ── Preset sets ───────────────────────────────────────────────────────────────

export function getAlivePreset(displaySnapshots: SeedSnapshot[]): Set<string> {
  const lastSnap = displaySnapshots[displaySnapshots.length - 1]
  if (!lastSnap) return new Set()
  return new Set(lastSnap.brackets.filter((b) => !b.eliminated).map((b) => b.uuid))
}

export function getFinalCutPreset(snapshots: SeedSnapshot[], players: EventPlayer[]): Set<string> {
  const seed8Snap = snapshots.find((s) => s.seed === 9)
  if (!seed8Snap) return new Set()
  return new Set(
    players
      .filter((p) => {
        const b = seed8Snap.brackets.find((b) => b.uuid === p.uuid)
        return b && !b.eliminated
      })
      .map((p) => p.uuid),
  )
}

export function getDominantPreset(snapshots: SeedSnapshot[], players: EventPlayer[]): Set<string> {
  const cutDeltaSums = new Map<string, { sum: number; count: number }>()
  for (const snap of snapshots) {
    for (const b of snap.brackets) {
      if (b.eliminated) continue
      const delta = snap.playerOdds[b.uuid]?.cutDelta
      if (delta == null) continue
      const entry = cutDeltaSums.get(b.uuid) ?? { sum: 0, count: 0 }
      entry.sum += delta
      entry.count += 1
      cutDeltaSums.set(b.uuid, entry)
    }
  }
  const survivedSeed7 = getSurvivedSeed7(snapshots)
  return new Set(
    players
      .filter((p) => {
        if (!survivedSeed7.has(p.uuid)) return false
        const e = cutDeltaSums.get(p.uuid)
        return e && e.count > 0 && e.sum / e.count > 0
      })
      .map((p) => p.uuid),
  )
}

export function getClutchPreset(snapshots: SeedSnapshot[], players: EventPlayer[]): Set<string> {
  const survivedSeed7 = getSurvivedSeed7(snapshots)
  const seed5Snap = snapshots.find((s) => s.seed === 5)
  return new Set(
    players
      .filter((p) => survivedSeed7.has(p.uuid))
      .filter((p) => (seed5Snap?.playerOdds[p.uuid]?.survivalProbability ?? 1) < 0.2)
      .map((p) => p.uuid),
  )
}

function getSurvivedSeed7(snapshots: SeedSnapshot[]): Set<string> {
  const seed7Snap = snapshots.find((s) => s.seed === 7)
  return new Set(
    seed7Snap ? seed7Snap.brackets.filter((b) => !b.eliminated).map((b) => b.uuid) : [],
  )
}

// ── Chart data builders ───────────────────────────────────────────────────────

export function buildSurvivalTrajectory(
  displaySnapshots: SeedSnapshot[],
  visiblePlayers: EventPlayer[],
  colorByUuid: Map<string, string>,
): {
  players: Array<{ nickname: string; color: string }>
  data: Array<Record<string, number>>
  cutSeeds: number[]
} {
  const players = visiblePlayers.map((p) => ({
    nickname: p.nickname,
    color: colorByUuid.get(p.uuid) ?? '#71717a',
  }))

  const data = displaySnapshots.map((snap) => {
    const point: Record<string, number> = { seed: snap.seed }
    for (const p of visiblePlayers) {
      const odds = snap.playerOdds[p.uuid]
      point[p.nickname] = odds ? Math.round(odds.survivalProbability * 100) : 0
    }
    return point
  })

  const cutSeeds = CLINCH_CUT_SEEDS.filter((s) => displaySnapshots.some((sn) => sn.seed === s))

  return { players, data, cutSeeds }
}

export function buildClinchSlackSeries(
  displaySnapshots: SeedSnapshot[],
  visiblePlayers: EventPlayer[],
): Array<Record<string, string | number | undefined>> {
  return CLINCH_CUT_SEEDS.filter(
    (cutSeed) => cutSeed <= (displaySnapshots.at(-1)?.seed ?? 0),
  ).map((cutSeed) => {
    const point: Record<string, string | number | undefined> = { label: `Seed ${cutSeed}` }
    const beforeSnap = displaySnapshots.find((s) => s.seed === cutSeed - 1)
    const afterSnap = displaySnapshots.find((s) => s.seed === cutSeed)
    if (!beforeSnap || !afterSnap) return point

    const slackValues: number[] = []
    for (const p of visiblePlayers) {
      const clinch = beforeSnap.playerOdds[p.uuid]?.clinchScore
      if (clinch === null || clinch === undefined) continue
      const bracket = afterSnap.brackets.find((b) => b.uuid === p.uuid)
      const actual = bracket?.completions[cutSeed - 1]?.score ?? 0
      const slack = actual - clinch
      point[p.nickname] = slack
      slackValues.push(slack)
    }
    if (slackValues.length > 0) {
      point.avg = Math.round(slackValues.reduce((s, v) => s + v, 0) / slackValues.length)
    }
    return point
  })
}

export function buildClinchSlackTrajectory(
  displaySnapshots: SeedSnapshot[],
  visiblePlayers: EventPlayer[],
): Array<Record<string, number | string>> {
  return CLINCH_CUT_SEEDS.filter(
    (cutSeed) => cutSeed <= (displaySnapshots.at(-1)?.seed ?? 0),
  ).map((cutSeed) => {
    const point: Record<string, number | string> = { seed: cutSeed }
    const beforeSnap = displaySnapshots.find((s) => s.seed === cutSeed - 1)
    const afterSnap = displaySnapshots.find((s) => s.seed === cutSeed)
    if (!beforeSnap || !afterSnap) return point

    for (const p of visiblePlayers) {
      const bBefore = beforeSnap.brackets.find((b) => b.uuid === p.uuid)
      if (!bBefore || bBefore.eliminated) continue
      // null clinchScore means even a perfect score can't clinch — use MAX_SCORE_PER_SEED as threshold
      const clinch = beforeSnap.playerOdds[p.uuid]?.clinchScore ?? MAX_SCORE_PER_SEED
      const actual =
        afterSnap.brackets.find((b) => b.uuid === p.uuid)?.completions[cutSeed - 1]?.score ?? 0
      point[p.nickname] = actual - clinch
    }
    return point
  })
}

export function buildSeedSwings(displaySnapshots: SeedSnapshot[]): SwingPoint[] {
  return displaySnapshots.slice(1).map((snap) => {
    const seed = snap.seed
    let total = 0
    let count = 0
    for (const b of snap.brackets) {
      if (b.eliminated) continue
      const rankNow = b.ranks[seed]
      const rankPrev = b.ranks[seed - 1]
      if (rankNow !== undefined && rankPrev !== undefined) {
        total += Math.abs(rankNow - rankPrev)
        count++
      }
    }
    // avgSwing = (avg rank change / lobby size) × 100 — normalizes so a one-place shift in a
    // 6-player lobby reads the same as a one-place shift in a 24-player lobby.
    const avgSwing = count > 0 ? parseFloat(((total / count / count) * 100).toFixed(1)) : 0
    return { seed, avgSwing }
  })
}

export function buildDnfImpact(
  displaySnapshots: SeedSnapshot[],
  visiblePlayers: EventPlayer[],
): {
  data: DnfEntry[]
  seedKeys: string[]
  seedColors: string[]
  seedLabels: Record<string, string>
} {
  const visibleUuids = new Set(visiblePlayers.map((p) => p.uuid))
  const nicknameByUuid = new Map(visiblePlayers.map((p) => [p.uuid, p.nickname]))
  const dnfEvents: Array<{ uuid: string; nickname: string; seed: number; drop: number }> = []

  for (let snapIdx = 1; snapIdx < displaySnapshots.length; snapIdx++) {
    const afterSnap = displaySnapshots[snapIdx]
    const beforeSnap = displaySnapshots[snapIdx - 1]
    const seedN = afterSnap.seed

    for (const b of afterSnap.brackets) {
      if (!visibleUuids.has(b.uuid)) continue
      const prevBracket = beforeSnap.brackets.find((bb) => bb.uuid === b.uuid)
      if (!prevBracket || prevBracket.eliminated) continue
      const completion = b.completions[seedN - 1]
      if (completion !== null) continue

      const preDnfOdds = beforeSnap.playerOdds[b.uuid]?.survivalProbability ?? 0
      const postDnfOdds = afterSnap.playerOdds[b.uuid]?.survivalProbability ?? 0
      const drop = Math.round((preDnfOdds - postDnfOdds) * 100)
      if (drop <= 0) continue

      const nickname = nicknameByUuid.get(b.uuid)
      if (!nickname) continue

      dnfEvents.push({ uuid: b.uuid, nickname, seed: seedN, drop })
    }
  }

  const allDnfSeeds = [...new Set(dnfEvents.map((e) => e.seed))].sort((a, b) => a - b)
  const dnfByPlayer = new Map<string, DnfEntry>()

  for (const event of dnfEvents) {
    if (!dnfByPlayer.has(event.uuid)) {
      dnfByPlayer.set(event.uuid, { nickname: event.nickname })
    }
    const entry = dnfByPlayer.get(event.uuid)!
    entry[`seed${event.seed}`] = ((entry[`seed${event.seed}`] as number) ?? 0) + event.drop
  }

  for (const [, entry] of dnfByPlayer) {
    for (const seed of allDnfSeeds) {
      if (entry[`seed${seed}`] === undefined) entry[`seed${seed}`] = 0
    }
  }

  const data = [...dnfByPlayer.values()].sort((a, b) => {
    const aTotal = allDnfSeeds.reduce((s, seed) => s + ((a[`seed${seed}`] as number) ?? 0), 0)
    const bTotal = allDnfSeeds.reduce((s, seed) => s + ((b[`seed${seed}`] as number) ?? 0), 0)
    return bTotal - aTotal
  })

  const seedKeys = allDnfSeeds.map((s) => `seed${s}`)
  const seedColors = allDnfSeeds.map((_, i) => SEED_COLORS[i % SEED_COLORS.length])
  const seedLabels = Object.fromEntries(allDnfSeeds.map((s) => [`seed${s}`, `Seed ${s} DNF`]))

  return { data, seedKeys, seedColors, seedLabels }
}

export function buildSeedResultsGrid(
  displaySnapshots: SeedSnapshot[],
  visiblePlayers: EventPlayer[],
  colorByUuid: Map<string, string>,
): SeedResultRow[] {
  return visiblePlayers.map((p) => {
    const cells: SeedResultCell[] = displaySnapshots.map((snap, idx) => {
      const bracket = snap.brackets.find((b) => b.uuid === p.uuid)
      if (!bracket)
        return { place: null, score: null, rankAfter: null, rankDelta: null, eliminated: true }

      const completion = bracket.completions[snap.seed - 1] ?? null
      const rankAfter = bracket.ranks[snap.seed] ?? null

      const prevSnap = idx > 0 ? displaySnapshots[idx - 1] : null
      const prevBracket = prevSnap?.brackets.find((b) => b.uuid === p.uuid)
      const prevRank = prevBracket?.ranks[snap.seed - 1] ?? null

      return {
        place: completion?.place ?? null,
        score: completion?.score ?? null,
        rankAfter,
        rankDelta: rankAfter !== null && prevRank !== null ? prevRank - rankAfter : null,
        eliminated: prevBracket?.eliminated ?? false,
      }
    })
    return {
      uuid: p.uuid,
      nickname: p.nickname,
      color: colorByUuid.get(p.uuid) ?? '#71717a',
      cells,
    }
  })
}
