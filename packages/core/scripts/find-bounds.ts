import { findMatchIdForDate } from '../lib/api/fetch'

async function main() {
  const earliestMaySecond = new Date(2026, 4, 2, 0, 0, 0, 0)
  const earliestMayThird = new Date(2026, 4, 3, 0, 0, 0, 0)
  const afterMatchId = await findMatchIdForDate(earliestMaySecond)
  const beforeMatchId = await findMatchIdForDate(earliestMayThird)
  console.log(`Search bounds are [${afterMatchId}, ${beforeMatchId}]`)
}

main()
