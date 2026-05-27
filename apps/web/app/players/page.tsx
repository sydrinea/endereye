import { Footer } from '@/components/layout'
import { getAllEvents } from '@/lib/events-config'
import { getEventContext } from '@/lib/event-data'
import { PlayerCard } from '@/app/views/PlayerCard'
import { buildMeta } from '@/lib/og-metadata'
import { Breadcrumbs } from '@/components/ui'
import { Metadata } from 'next'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

export const revalidate = false

async function getPlayerUuids(): Promise<string[]> {
  const directoryPath = join(process.cwd(), 'public', 'data', 'career')

  const files = await readdir(directoryPath)
  const jsonFiles = files.filter((file) => file.endsWith('.json'))

  const uuidPromises = jsonFiles.map(async (file) => {
    const filePath = join(directoryPath, file)
    const fileContents = await readFile(filePath, 'utf-8')
    const data = JSON.parse(fileContents)

    if (Array.isArray(data) && data.length >= 3) {
      return file.replace('.json', '')
    }

    return null
  })

  const results = await Promise.all(uuidPromises)
  const validUuids = results.filter((uuid): uuid is string => Boolean(uuid))

  return validUuids
}

export async function generateMetadata(): Promise<Metadata> {
  const uuids = await getPlayerUuids()
  const imagePath = `/api/og?type=players&players=${uuids.join(',')}`
  return buildMeta({
    title: 'Players | endereye',
    description: 'Every player who has competed in an MCSR Ranked LCQ or MSS event.',
    imagePath,
  })
}

export default async function PlayersPage() {
  const allEvents = await getAllEvents()
  const now = new Date()
  const past = allEvents.filter((e) => e.startDate < now)

  const playerMaps = await Promise.all(
    past.map(async (e) => {
      const ctx = await getEventContext(e.kind, e.season, e.prefix, e.qualifyCount)
      return ctx?.players ?? []
    }),
  )

  const seen = new Set<string>()
  const players: { uuid: string; nickname: string }[] = []
  for (const list of playerMaps) {
    for (const p of list) {
      if (!seen.has(p.uuid)) {
        seen.add(p.uuid)
        players.push({ uuid: p.uuid, nickname: p.nickname })
      }
    }
  }

  players.sort((a, b) =>
    a.nickname.localeCompare(b.nickname, undefined, { numeric: true, sensitivity: 'base' }),
  )

  return (
    <>
      <main className="flex flex-col items-center px-6 py-8 gap-6">
        <div className="w-full max-w-4xl flex flex-col gap-4">
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Players' }]} />
          <div>
            <h1 className="font-display text-3xl text-zinc-100">Players</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {players.length} players across {past.length} events
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {players.map((p) => (
              <PlayerCard key={p.uuid} uuid={p.uuid} nickname={p.nickname} />
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
