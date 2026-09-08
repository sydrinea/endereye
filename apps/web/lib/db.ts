/**
 * Drizzle client for the Cloudflare D1 database, over the D1 HTTP API.
 *
 * `apps/web` runs on Vercel, not the Workers runtime, so there is no D1 binding —
 * we talk to D1 the same way `lib/r2.ts` talks to R2: over HTTP with an API
 * token. `drizzle-orm/d1` is binding-only, so this uses `sqlite-proxy` with a
 * callback that POSTs to D1's `/raw` endpoint (rows come back column-ordered,
 * which is what sqlite-proxy wants).
 *
 * Reads add a ~50–150 ms hop, so callers on hot paths wrap this in `React.cache`
 * (see `lib/events-config.ts`).
 */
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import * as schema from './schema'

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var ${name}`)
  return value
}

interface D1RawResult {
  result: Array<{ results: { columns: string[]; rows: unknown[][] }; success: boolean }>
  success: boolean
  errors: Array<{ code: number; message: string }>
}

async function d1Raw(
  sql: string,
  params: unknown[],
): Promise<{ columns: string[]; rows: unknown[][] }> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env('CF_ACCOUNT_ID')}/d1/database/${env('D1_DATABASE_ID')}/raw`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env('D1_API_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    },
  )
  const body = (await res.json()) as D1RawResult
  if (!res.ok || !body.success) {
    const detail = body.errors?.map((e) => e.message).join('; ') || res.statusText
    throw new Error(`D1 query failed (${res.status}): ${detail}`)
  }
  return body.result[0]?.results ?? { columns: [], rows: [] }
}

export const db = drizzle(
  async (sql, params, method) => {
    const { rows } = await d1Raw(sql, params)
    // sqlite-proxy: 'get' wants the single row (or []); 'all'/'values' want all rows; 'run' ignores.
    return { rows: method === 'get' ? (rows[0] ?? []) : rows }
  },
  async (queries) => {
    const out: Array<{ rows: unknown[] }> = []
    for (const q of queries) {
      const { rows } = await d1Raw(q.sql, q.params)
      out.push({ rows: q.method === 'get' ? (rows[0] ?? []) : rows })
    }
    return out
  },
  { schema },
)

export { schema }
