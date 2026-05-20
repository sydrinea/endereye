'use client'

import dynamic from 'next/dynamic'
import type { EventData } from '@endereye/core'
import Loading from './loading'

const DashboardClient = dynamic(
  () => import('./DashboardClient').then((mod) => mod.DashboardClient),
  { ssr: false, loading: () => <Loading /> }
)

export function DashboardWrapper({ eventData, seed }: { eventData: EventData; seed: number }) {
  return <DashboardClient eventData={eventData} seed={seed} />
}
