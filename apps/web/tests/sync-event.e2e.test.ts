/**
 * End-to-end test for the `/api/sync-event` autofetch flow, against the **real**
 * MCSR Ranked API and the **real** R2 bucket.
 *
 * Gated: runs only with `RUN_SYNC_E2E=1` and R2 + D1 credentials present (loaded
 * from apps/web/.env.local by the vitest setupFile). It inserts a `published:false`
 * `test-sync-lcq11` row into D1, syncs it via the same code the cron uses, checks
 * the written R2 data against the frozen Season 11 LCQ golden files (`lcq/11.*`),
 * then removes every trace.
 *
 *   npx turbo e2e                        (builds @endereye/core first)
 *   npx turbo e2e:cleanup     (if a run was hard-killed before teardown)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { buildEventFromApiResponse } from '@endereye/core'
import type { ApiEventData, EventPlayer } from '@endereye/core'
import { GET } from '@/app/api/sync-event/route'
import { runEventSync } from '@/lib/sync-event'
import { getEventContext } from '@/lib/event-data'
import {
  TEST_SLUG,
  TEST_PREFIX,
  TEST_EVENT,
  GOLDEN_EVENT_KEY,
  GOLDEN_PLAYERS_KEY,
  hasR2Creds,
  makeS3,
  getJson,
  putJson,
  listKeys,
  deleteKeys,
  cleanupTestSync,
  insertTestEventRow,
  deleteTestEventRow,
} from './support/sync-e2e'

const RUN = process.env.RUN_SYNC_E2E === '1' && hasR2Creds()
const STRICT_PLAYERS = process.env.SYNC_E2E_LOOSE_PLAYERS !== '1'
// SYNC_E2E_KEEP=1 skips teardown so the R2 state can be inspected by hand.
// Follow up with `npx turbo e2e:cleanup`.
const KEEP = process.env.SYNC_E2E_KEEP === '1'
const ENDPOINT_URL = `https://api.mcsrranked.com/${TEST_EVENT.endpoint}`
const NUMERIC_FIELDS = [
  'eloRate',
  'eloRank',
  'bestTimeMs',
  'avgTimeMs',
  'wins',
  'losses',
  'playedMatches',
  'forfeits',
] as const

type EventJson = {
  currentRound: number
  matches: number[]
  brackets: Array<{ uuid: string } & Record<string, unknown>>
  players: Array<{ uuid: string } & Record<string, unknown>>
}

const byUuid = (a: { uuid: string }, b: { uuid: string }) => a.uuid.localeCompare(b.uuid)
const normalizeEvent = (e: EventJson): EventJson => ({
  ...e,
  brackets: [...e.brackets].sort(byUuid),
  players: [...e.players].sort(byUuid),
})

function mkReq(query: string, secret?: string) {
  const headers = new Headers()
  if (secret !== undefined) headers.set('x-secret', secret)
  return new NextRequest(`http://localhost/api/sync-event${query}`, { headers })
}

describe.skipIf(!RUN)('sync-event e2e', () => {
  const { s3, bucket } = makeS3()
  const secret = process.env.DASHBOARD_SECRET!
  const eventKey = `${TEST_PREFIX}.event.json`
  const playersKey = `${TEST_PREFIX}.players.json`
  const sentinelKey = `cache/views/${TEST_PREFIX}/0.json`

  let goldenEvent: EventJson
  let goldenPlayers: EventPlayer[]
  let goldenPlayerByUuid: Map<string, EventPlayer>

  beforeAll(async () => {
    // Clear anything a killed prior run left, so assertion 1 is a real sync, not a dedup-skip.
    await cleanupTestSync(s3, bucket)

    await insertTestEventRow()
    await putJson(s3, bucket, sentinelKey, [{ sentinel: true }])

    goldenEvent = (await getJson<EventJson>(s3, bucket, GOLDEN_EVENT_KEY))!
    goldenPlayers = (await getJson<EventPlayer[]>(s3, bucket, GOLDEN_PLAYERS_KEY))!
    if (!goldenEvent || !goldenPlayers) throw new Error('golden lcq/11.* files missing from R2')
    goldenPlayerByUuid = new Map(goldenPlayers.map((p) => [p.uuid, p]))
  }, 60_000)

  afterAll(async () => {
    if (KEEP) {
      console.warn(
        [
          '',
          '[sync-event.e2e] SYNC_E2E_KEEP=1 — teardown skipped. Left as-is for inspection:',
          `  D1 events row "${TEST_SLUG}" (owned by the official user)`,
          `  ${eventKey}     (compare to ${GOLDEN_EVENT_KEY})`,
          `  ${playersKey}   (compare to ${GOLDEN_PLAYERS_KEY})`,
          `  note: the last test re-adds a dropped player at the END of players.json`,
          '  clean up with:  npx turbo e2e:cleanup',
          '',
        ].join('\n'),
      )
      return
    }
    await deleteTestEventRow()
    const keys = [
      ...(await listKeys(s3, bucket, 'test-sync/')),
      ...(await listKeys(s3, bucket, 'cache/views/test-sync/')),
    ]
    await deleteKeys(s3, bucket, keys)
  }, 60_000)

  it(
    'cold sync writes exactly buildEventFromApiResponse(liveData)',
    { timeout: 120_000 },
    async () => {
      const { data } = (await fetch(ENDPOINT_URL).then((r) => r.json())) as { data: ApiEventData }
      const expected = JSON.parse(JSON.stringify(buildEventFromApiResponse(data)))

      const result = await runEventSync(TEST_EVENT)
      expect(result).toEqual({ synced: true, currentRound: expected.currentRound })

      const written = await getJson<EventJson>(s3, bucket, eventKey)
      expect(written).toEqual(expected)
    },
  )

  it('event.json deep-equals the frozen lcq/11 golden file', async () => {
    const written = (await getJson<EventJson>(s3, bucket, eventKey))!
    // S11 LCQ is over and its stored data was built by the pre-refactor code —
    // this is the regression guard for the replaySeeds rewrite.
    expect(normalizeEvent(written)).toEqual(normalizeEvent(goldenEvent))
    expect(written.matches).toEqual(goldenEvent.matches)
    expect(written).not.toHaveProperty('qualifyCount')
  })

  it('players.json matches the frozen lcq/11 golden file', async () => {
    const written = (await getJson<EventPlayer[]>(s3, bucket, playersKey))!
    expect(new Set(written.map((p) => p.uuid))).toEqual(new Set(goldenPlayers.map((p) => p.uuid)))
    expect(written.length).toBe(goldenPlayers.length)

    for (const p of written) {
      expect(typeof p.uuid).toBe('string')
      expect(typeof p.nickname).toBe('string')
      for (const f of NUMERIC_FIELDS) expect(Number.isFinite(p[f]) || p[f] === null).toBe(true)

      const g = goldenPlayerByUuid.get(p.uuid)!
      if (p.nickname !== g.nickname)
        console.warn(`[sync-event.e2e] rename since S11: ${g.nickname} -> ${p.nickname}`)
      if (STRICT_PLAYERS) {
        for (const f of NUMERIC_FIELDS) expect(p[f], `${g.nickname}.${f}`).toBe(g[f])
      }
    }
  })

  it('a 2nd sync with no new seed is a no-op', async () => {
    const result = await runEventSync(TEST_EVENT)
    expect(result).toEqual({
      skipped: true,
      reason: 'no new seed',
      currentRound: goldenEvent.currentRound,
    })
  })

  it('cache-busts the cached views for the prefix', async () => {
    expect(await getJson(s3, bucket, sentinelKey)).toBeNull()
  })

  it('route GET rejects a missing / wrong secret with 401', async () => {
    const before = await getJson<EventJson>(s3, bucket, eventKey)
    for (const req of [mkReq(`?slug=${TEST_SLUG}`), mkReq(`?slug=${TEST_SLUG}`, 'nope')]) {
      const res = await GET(req)
      expect(res.status).toBe(401)
    }
    expect(await getJson<EventJson>(s3, bucket, eventKey)).toEqual(before)
  })

  it('route GET maps unknown slug and dedup to 200 bodies', async () => {
    const miss = await GET(mkReq('?slug=does-not-exist', secret))
    expect(miss.status).toBe(200)
    expect(await miss.json()).toMatchObject({ skipped: true })

    const dedup = await GET(mkReq(`?slug=${TEST_SLUG}`, secret))
    expect(dedup.status).toBe(200)
    expect(await dedup.json()).toMatchObject({ skipped: true, reason: 'no new seed' })
  })

  it('incremental enrichment re-adds a dropped player', { timeout: 120_000 }, async () => {
    await deleteKeys(s3, bucket, [eventKey])
    const players = (await getJson<EventPlayer[]>(s3, bucket, playersKey))!
    const [dropped, ...kept] = players
    await putJson(s3, bucket, playersKey, kept)

    const result = await runEventSync(TEST_EVENT)
    expect(result).toMatchObject({ synced: true })

    const after = (await getJson<EventPlayer[]>(s3, bucket, playersKey))!
    expect(after.filter((p) => p.uuid !== dropped.uuid)).toEqual(kept)

    const restored = after.find((p) => p.uuid === dropped.uuid)
    expect(restored).toBeDefined()
    const g = goldenPlayerByUuid.get(dropped.uuid)!
    for (const f of NUMERIC_FIELDS) {
      if (STRICT_PLAYERS) expect(restored![f], `${g.nickname}.${f}`).toBe(g[f])
      else expect(Number.isFinite(restored![f]) || restored![f] === null).toBe(true)
    }
  })

  it('synced data round-trips through getEventContext', async () => {
    const ctx = await getEventContext('lcq', 11, TEST_PREFIX)
    expect(ctx).not.toBeNull()
    expect(ctx!.brackets.length).toBe(goldenEvent.brackets.length)
  })
})
