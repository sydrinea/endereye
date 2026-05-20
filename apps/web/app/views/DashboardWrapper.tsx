'use client'

import dynamic from 'next/dynamic'
import type { EventData } from '@endereye/core'
import Loading from '../loading'

const DashboardClient = dynamic(
  () => import('./DashboardClient').then((mod) => mod.DashboardClient),
  { ssr: false, loading: () => <Loading /> }
)

export function DashboardWrapper({ eventData, seed, eventLabel, live = true, backHref }: { eventData: EventData; seed: number; eventLabel?: string; live?: boolean; backHref?: string }) {
  return <DashboardClient eventData={eventData} seed={seed} eventLabel={eventLabel} live={live} backHref={backHref} />
}
