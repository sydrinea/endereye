import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Footer } from '@/components/layout'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCareerContext } from '@/lib/career-data'
import type { CareerEventSlice } from '@/lib/career-data'
import { CareerHeader } from '@/app/views/CareerHeader'
import { CareerClient } from '@/app/views/CareerClient'
import { buildMeta } from '@/lib/og-metadata'
import { fetchUser } from '@endereye/core'

const UUID_RE = /^[0-9a-f]{32}$/i

export const revalidate = 2592000 // 30 days

async function resolveUser(segment: string) {
  const user = await fetchUser(segment)
  if (UUID_RE.test(segment) && user.nickname !== segment) {
    redirect(`/players/${user.nickname}`)
  }
  return user
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nickname: string }>
}): Promise<Metadata> {
  const { nickname } = await params
  const { uuid } = await resolveUser(nickname)
  const career = await getCareerContext(uuid)
  if (!career) return {}
  const eventCount = career.events.length
  const imagePath = `/api/og?type=player&name=${encodeURIComponent(career.nickname)}&events=${eventCount}`
  return buildMeta({
    title: `${career.nickname} | endereye`,
    description: `Career analytics for ${career.nickname} across ${eventCount} MCSR Ranked event${eventCount === 1 ? '' : 's'}.`,
    imagePath,
  })
}

export default async function Page({ params }: { params: Promise<{ nickname: string }> }) {
  const { nickname } = await params
  const { uuid } = await resolveUser(nickname)
  const career = await getCareerContext(uuid)
  if (!career) return notFound()

  const slices = await readFile(
    join(process.cwd(), 'public', 'data', 'career', `${uuid}.json`),
    'utf-8',
  ).then((json) => JSON.parse(json) as CareerEventSlice[])

  return (
    <>
      <main className="flex flex-col items-center px-6 py-8 gap-6">
        <div className="w-full max-w-4xl flex flex-col gap-6">
          <CareerHeader career={career} />
          <CareerClient slices={slices} />
        </div>
      </main>
      <Footer />
    </>
  )
}
