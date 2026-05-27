import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCareerContext } from '../../../lib/career-data'
import { CareerHeader } from '@/app/views/CareerHeader'
import { CareerClient } from '@/app/views/CareerClient'
import { buildMeta } from '@/lib/og-metadata'

export const revalidate = 2592000 // 30 days

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uuid: string }>
}): Promise<Metadata> {
  const { uuid } = await params
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

export default async function Page({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params
  const career = await getCareerContext(uuid)
  if (!career) return notFound()
  return (
    <>
      <CareerHeader career={career} />
      <CareerClient career={career} />
    </>
  )
}
