import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'

/** Post-login landing for the footer "Manage Events" link — bounces to the host's manage page. */
export default async function ManageRedirect() {
  const user = await getSessionUser()
  redirect(user?.handle ? `/@${user.handle}/manage` : '/')
}
