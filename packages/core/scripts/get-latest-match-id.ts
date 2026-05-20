import { fetchLatestMatchId } from '../lib/api/fetch'

const id = await fetchLatestMatchId()
console.log(`Latest match ID: ${id}`)
console.log(`Set matchBoundsAfter: ${id} in apps/web/app/events.config.ts`)
