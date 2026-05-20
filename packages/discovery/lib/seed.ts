import { seedPlayerCache } from './cache'
import type { EventKind } from '@endereye/core'

const kind = (process.argv[2] ?? 'lcq') as EventKind
const season = Number(process.argv[3] ?? 10)

seedPlayerCache(kind, season).catch(e => {
  console.error(e.message)
  process.exit(1)
})
