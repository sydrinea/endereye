import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { notFound } from 'next/navigation'
import { getCareerContext } from '@/lib/career-data'
import type { CareerEventSlice } from '@/lib/career-data'
import { CareerHeader } from '@/app/views/CareerHeader'
import { CareerClient } from '@/app/views/CareerClient'
import { CareerModal } from '@/app/views/CareerModal'
import { ReplaceUrl } from '@/app/views/ReplaceUrl'
import { fetchUser } from '@endereye/core'

export default async function Page({ params }: { params: Promise<{ nickname: string }> }) {
  const { nickname } = await params
  const user = await fetchUser(nickname)
  const { uuid } = user
  const career = await getCareerContext(uuid)
  if (!career) return notFound()

  const slices = await readFile(
    join(process.cwd(), 'public', 'data', 'career', `${uuid}.json`),
    'utf-8',
  ).then((json) => JSON.parse(json) as CareerEventSlice[])

  const isUuid = /^[0-9a-f]{32}$/i.test(nickname)

  return (
    <CareerModal skipEntryAnimation>
      {isUuid && <ReplaceUrl href={`/players/${user.nickname}`} />}
      <div className="px-6 py-6">
        <CareerHeader career={career} />
        <CareerClient slices={slices} />
      </div>
    </CareerModal>
  )
}
