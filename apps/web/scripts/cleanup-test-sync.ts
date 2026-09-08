/**
 * Manual safety net for the `/api/sync-event` e2e test: undoes everything the
 * test's setup does, in case a run was hard-killed before `afterAll` could clean
 * up. The test's own `beforeAll` also self-heals, so this is only needed to
 * remove the D1 test row / reclaim R2 space after a crash.
 *
 *   npx turbo e2e:cleanup        (tsx --env-file .env.local)
 */
import { cleanupTestSync, loadEnvLocal, hasR2Creds, makeS3 } from '../tests/support/sync-e2e'

async function main() {
  loadEnvLocal()
  if (!hasR2Creds()) {
    console.error('Missing R2 credentials (R2_ENDPOINT / R2_ACCESS_KEY_ID / …). Nothing to do.')
    process.exit(1)
  }
  const { s3, bucket } = makeS3()
  const { removed } = await cleanupTestSync(s3, bucket)
  console.log(`cleanup-test-sync: removed ${removed} object(s); config entry stripped if present.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
