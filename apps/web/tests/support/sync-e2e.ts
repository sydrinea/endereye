/**
 * Shared fixtures + helpers for the `/api/sync-event` end-to-end test and the
 * `scripts/cleanup-test-sync.ts` safety-net script.
 *
 * The test event mirrors the real `lcq-s11` config entry (same `kind`, `season`,
 * `endpoint`) but writes to an isolated `test-sync/` R2 prefix and is
 * `published: false` with a far-past `startDate`, so only `?slug=` can resolve it.
 * It lives as a D1 `events` row owned by the `official` user (the same place the
 * real events live), added in `beforeAll` and removed in teardown / cleanup.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../../lib/db'

export const TEST_SLUG = 'test-sync-lcq11'
export const TEST_PREFIX = 'test-sync/lcq11'

type TestEvent = {
  slug: string
  label: string
  kind: 'lcq'
  season: number
  prefix: string
  endpoint: string
  path: string
  published: boolean
  startDate: string
}

export const TEST_EVENT: TestEvent = {
  slug: TEST_SLUG,
  label: 'TEST — sync-event e2e',
  kind: 'lcq',
  season: 11,
  prefix: TEST_PREFIX,
  endpoint: 'tourneys/qualifiers_s11',
  path: '/lcq/11',
  published: false,
  startDate: '2020-01-01T00:00:00.000Z',
}

async function officialUserId(): Promise<string> {
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.handle, 'official'))
    .limit(1)
  if (!rows[0]) throw new Error('no `official` user in D1 — sign in as the owner first')
  return rows[0].id
}

/** Insert the D1 row that lets `GET /api/sync-event?slug=test-sync-lcq11` resolve. */
export async function insertTestEventRow(): Promise<void> {
  const hostId = await officialUserId()
  await db.insert(schema.events).values({
    id: `test-${TEST_SLUG}`,
    hostId,
    slug: TEST_EVENT.slug,
    label: TEST_EVENT.label,
    kind: TEST_EVENT.kind,
    season: TEST_EVENT.season,
    prefix: TEST_EVENT.prefix,
    endpoint: TEST_EVENT.endpoint,
    published: TEST_EVENT.published,
    startDate: TEST_EVENT.startDate,
  })
}

export async function deleteTestEventRow(): Promise<void> {
  await db
    .delete(schema.events)
    .where(and(eq(schema.events.id, `test-${TEST_SLUG}`), eq(schema.events.slug, TEST_SLUG)))
}

/** The real S11 LCQ event's R2 keys — the frozen golden files to compare against. */
export const GOLDEN_EVENT_KEY = 'lcq/11.event.json'
export const GOLDEN_PLAYERS_KEY = 'lcq/11.players.json'

const REQUIRED_ENV = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'DASHBOARD_SECRET',
  'CF_ACCOUNT_ID',
  'D1_DATABASE_ID',
  'D1_API_TOKEN',
] as const

/** Load apps/web/.env.local into process.env (does not overwrite existing vars). */
export function loadEnvLocal(): void {
  // Works whether cwd is the repo root or apps/web.
  const candidates = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), 'apps/web/.env.local'),
  ]
  for (const envPath of candidates) {
    let contents: string
    try {
      contents = fs.readFileSync(envPath, 'utf8')
    } catch {
      continue
    }
    for (const line of contents.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
      if (!(key in process.env)) process.env[key] = val
    }
    return
  }
}

export function hasR2Creds(): boolean {
  return REQUIRED_ENV.every((k) => !!process.env[k])
}

export function makeS3(): { s3: S3Client; bucket: string } {
  return {
    s3: new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    }),
    bucket: process.env.R2_BUCKET_NAME!,
  }
}

export async function getJson<T>(s3: S3Client, bucket: string, key: string): Promise<T | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const text = await res.Body?.transformToString()
    return text ? (JSON.parse(text) as T) : null
  } catch {
    return null
  }
}

export async function putJson(
  s3: S3Client,
  bucket: string,
  key: string,
  value: unknown,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: 'application/json',
    }),
  )
}

export async function listKeys(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    )
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys
}

export async function deleteKeys(s3: S3Client, bucket: string, keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((Key) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }))),
  )
}

/**
 * Remove every trace of a test-sync run: the `test-sync-lcq11` D1 row and all
 * `test-sync/*` + `cache/views/test-sync/*` R2 objects. Idempotent.
 */
export async function cleanupTestSync(s3: S3Client, bucket: string): Promise<{ removed: number }> {
  await deleteTestEventRow()
  const keys = [
    ...(await listKeys(s3, bucket, `${TEST_PREFIX.split('/')[0]}/`)),
    ...(await listKeys(s3, bucket, `cache/views/${TEST_PREFIX.split('/')[0]}/`)),
  ]
  await deleteKeys(s3, bucket, keys)
  return { removed: keys.length }
}
