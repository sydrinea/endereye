import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs outside Next, so load the local env file it needs for the
// D1 HTTP credentials. Node >= 20.12. No-op in CI where the vars are already set.
try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local absent (CI / prod) — vars come from the real environment
}

export default defineConfig({
  schema: './lib/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CF_ACCOUNT_ID!,
    databaseId: process.env.D1_DATABASE_ID!,
    token: process.env.D1_API_TOKEN!,
  },
})
