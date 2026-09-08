import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getCareerContext } from '@/lib/career-data'
import type { CareerEventSlice } from '@/lib/career-data'
import { CareerHeader } from '@/app/views/CareerHeader'
import { CareerClient } from '@/app/views/CareerClient'
import { MinimalPlayerProfile } from '@/app/views/MinimalPlayerProfile'
import { CareerModal } from '@/app/views/CareerModal'
import { ReplaceUrl } from '@/app/views/ReplaceUrl'
import { fetchUser } from '@endereye/core'

export default async function Page({ params }: { params: Promise<{ nickname: string }> }) {
  const { nickname } = await params
  const user = await fetchUser(nickname)
  const career = await getCareerContext(user.uuid)
  const isUuid = /^[0-9a-f]{32}$/i.test(nickname)

  const slices = career
    ? await readFile(
        join(process.cwd(), 'public', 'data', 'career', `${user.uuid}.json`),
        'utf-8',
      ).then((json) => JSON.parse(json) as CareerEventSlice[])
    : null

  return (
    <CareerModal skipEntryAnimation>
      {isUuid && <ReplaceUrl href={`/players/${user.nickname}`} />}
      <div className="px-6 py-6">
        {career && slices ? (
          <>
            <CareerHeader career={career} />
            <CareerClient slices={slices} />
          </>
        ) : (
          <MinimalPlayerProfile user={user} />
        )}
      </div>
    </CareerModal>
  )
}
