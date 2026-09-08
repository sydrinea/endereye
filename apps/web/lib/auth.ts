/**
 * better-auth server instance — Discord social login, backed by the D1 Drizzle
 * client. Sessions are stored in D1 with a short-lived signed cookie cache.
 *
 * We deliberately do **not** request Discord's `email` scope. better-auth needs
 * a `user.email`, so `mapProfileToUser` fills it with a synthetic
 * `${discordId}@discord.local`; nothing treats it as a real address.
 *
 * Every user gets a `handle` (public `/@handle` scope). The site owner
 * (`OWNER_DISCORD_ID`) is pinned to `official`; everyone else gets a slug
 * derived from their Discord name, de-duped against existing handles.
 */
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { cache } from 'react'
import { db, schema } from './db'

const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID
const RESERVED_HANDLES = new Set(['official', 'admin', 'api', 'auth', 'www'])

function slugifyHandle(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
  return base || 'host'
}

/** Discord id ⇄ synthetic email, so `create.before` can recover it without the profile. */
function emailForDiscordId(id: string): string {
  return `${id}@discord.local`
}
function discordIdFromEmail(email: string): string {
  return email.split('@')[0] ?? ''
}

async function handleExists(handle: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.handle, handle))
    .limit(1)
  return rows.length > 0
}

async function deriveUniqueHandle(name: string): Promise<string> {
  const base = slugifyHandle(name)
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`
    if (!RESERVED_HANDLES.has(candidate) && !(await handleExists(candidate))) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'sqlite', schema, transaction: false }),
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
      disableDefaultScope: true,
      scope: ['identify'],
      mapProfileToUser: (profile) => ({
        name: profile.global_name || profile.username || profile.id,
        email: emailForDiscordId(profile.id),
        emailVerified: false,
        image: profile.image_url,
      }),
    },
  },
  user: {
    additionalFields: {
      handle: { type: 'string', required: false, input: false },
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const discordId = discordIdFromEmail(user.email)
          const handle =
            OWNER_DISCORD_ID && discordId === OWNER_DISCORD_ID
              ? 'official'
              : await deriveUniqueHandle(user.name || 'host')
          return { data: { ...user, handle } }
        },
      },
    },
  },
  plugins: [nextCookies()],
})

export type SessionUser = typeof auth.$Infer.Session.user

/** Current session user (or null). Memoised per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
})

/** The `official` user's id — the owner of every official event. Memoised per request. */
export const getOwnerUserId = cache(async (): Promise<string | null> => {
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.handle, 'official'))
    .limit(1)
  return rows[0]?.id ?? null
})

export async function isOwner(user: Pick<SessionUser, 'id'> | null): Promise<boolean> {
  if (!user) return false
  return user.id === (await getOwnerUserId())
}

/** Thrown by `requireHost` — server actions catch it, pages let it bubble to `notFound()`. */
export class ForbiddenError extends Error {
  constructor() {
    super('forbidden')
    this.name = 'ForbiddenError'
  }
}

/**
 * Gate for `/@handle/manage` and its actions: the session user must *be* that
 * host (their own `handle`). The owner is a host too (`handle === 'official'`),
 * so this covers official-event management without a special case.
 */
export async function requireHost(handle: string): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user || user.handle !== handle) throw new ForbiddenError()
  return user
}

/** Gate for owner-only actions. */
export async function requireOwner(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user || !(await isOwner(user))) throw new ForbiddenError()
  return user
}
