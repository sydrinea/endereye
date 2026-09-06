// Vitest setupFile: load apps/web/.env.local into process.env before any test
// module (and therefore before lib/r2's S3Client) is imported. No-op when the
// file is absent (e.g. CI without secrets).
import { loadEnvLocal } from './sync-e2e'

loadEnvLocal()
