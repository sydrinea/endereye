import { cookies } from 'next/headers'
import { LoginForm } from './LoginForm'
import { DashboardContent } from './DashboardContent'
import { getR2EventsConfig } from '../../lib/events-config'
import type { R2EventConfig } from '../../lib/events-config'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const auth = cookieStore.get('dashboard_auth')
  const isAuthed =
    process.env.DASHBOARD_SECRET !== undefined &&
    auth?.value === process.env.DASHBOARD_SECRET

  if (!isAuthed) return <LoginForm />

  const events: R2EventConfig[] = (await getR2EventsConfig()) ?? []

  const configJson = JSON.stringify(events, null, 2)

  return <DashboardContent events={events} initialConfigJson={configJson} />
}
