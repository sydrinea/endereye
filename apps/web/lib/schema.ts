/**
 * Drizzle schema for the Cloudflare D1 database (SQLite).
 *
 * The `user` / `session` / `account` / `verification` tables are better-auth's
 * standard core schema (kept in sync with `npx @better-auth/cli generate` — see
 * `lib/auth.ts`). `user` carries one extra column, `handle`, declared to
 * better-auth via `user.additionalFields`.
 *
 * `events` is the event index that replaces the old `config/events.json` R2 blob.
 * Every event — official or host-run — is a row here; official events are owned
 * by the `official` user. The event *data* (brackets, players, overrides, cached
 * views) still lives in R2, keyed by `prefix`.
 */
import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // better-auth requires this column, but we don't request Discord's `email`
  // scope — it's filled with a synthetic `${discordId}@discord.local` in lib/auth.ts.
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  // Extra field — see `user.additionalFields` in lib/auth.ts. Public scope handle
  // (no leading `@`); the owner's is forced to `official`.
  handle: text('handle').unique(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    /** Owning user. Official events are owned by the `official` user — never null. */
    hostId: text('host_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Per-host unique slug. Official: the historic config slug (`lcq-11`, `worlds-2026`). */
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    /** `'lcq' | 'worlds' | 'mss'` — drives PHASE_INDEX in enrichEventPlayers. Custom events: `'mss'`. */
    kind: text('kind').notNull(),
    season: integer('season').notNull(),
    /** R2 key prefix for this event's data blobs. Unique across all events. */
    prefix: text('prefix').notNull().unique(),
    /** Overrides the elimination schedule's final cut. */
    qualifyCount: integer('qualify_count'),
    noBonus: integer('no_bonus', { mode: 'boolean' }).notNull().default(false),
    /** ISO-8601 UTC (…Z) so lexicographic comparison is chronological. */
    startDate: text('start_date').notNull(),
    published: integer('published', { mode: 'boolean' }).notNull().default(true),
    /** MCSR Ranked tournament API endpoint for autofetch sync (official events only). */
    endpoint: text('endpoint'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex('events_host_slug_idx').on(t.hostId, t.slug)],
)

export type EventRow = typeof events.$inferSelect
export type NewEventRow = typeof events.$inferInsert
