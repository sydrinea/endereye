/**
 * One-off: copy the R2 `config/events.json` blob into the D1 `events` table,
 * owned by the `official` user. Idempotent — upserts by (hostId, slug).
 *
 * Prereq: the owner has signed in once (so the `official` user row exists).
 *
 *   npx tsx --env-file .env.local scripts/import-events-to-d1.ts
 *   npx tsx --env-file .env.local scripts/import-events-to-d1.ts --dry
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../lib/db'
import { getR2Object } from '../lib/r2'

interface R2EventConfig {
  slug: string
  label: string
  kind: 'lcq' | 'worlds' | 'mss'
  season: number
  prefix: string
  startDate: string
  path?: string
  endpoint?: string
  qualifyCount?: number
  noBonus?: boolean
  published?: boolean
}

const DRY = process.argv.includes('--dry')

async function main() {
  const config = await getR2Object<R2EventConfig[]>('config/events.json')
  if (!config || config.length === 0) throw new Error('config/events.json missing or empty in R2')

  const owner = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.handle, 'official'))
    .limit(1)
  if (!owner[0]) throw new Error('no `official` user in D1 — sign in as the owner first')
  const hostId = owner[0].id

  const existing = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.hostId, hostId))
  const bySlug = new Map(existing.map((r) => [r.slug, r]))

  console.log(`${config.length} events in R2 config, ${existing.length} already in D1\n`)

  for (const e of config) {
    const row = {
      hostId,
      slug: e.slug,
      label: e.label,
      kind: e.kind,
      season: e.season,
      prefix: e.prefix,
      qualifyCount: e.qualifyCount ?? null,
      noBonus: e.noBonus ?? false,
      startDate: new Date(e.startDate).toISOString(),
      published: e.published ?? true,
      endpoint: e.endpoint ?? null,
    }
    const current = bySlug.get(e.slug)
    const verb = current ? 'update' : 'insert'
    console.log(`  ${verb.padEnd(6)} ${e.slug.padEnd(14)} ${e.kind}/${e.season}  ${e.prefix}`)
    if (DRY) continue
    if (current) {
      await db.update(schema.events).set(row).where(eq(schema.events.id, current.id))
    } else {
      await db.insert(schema.events).values({ id: crypto.randomUUID(), ...row })
    }
  }

  console.log(DRY ? '\n(dry run — nothing written)' : '\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
