'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from '@/lib/auth-client'

/**
 * Footer entry point to the host area. Logged in → `/@handle/manage`. Logged out
 * → Discord login, returning to `/@handle/manage` once the session (and handle)
 * exist.
 */
export function ManageLink() {
  const { data: session } = useSession()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const handle = session?.user.handle

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (handle) {
          router.push(`/@${handle}/manage`)
          return
        }
        setBusy(true)
        try {
          await signIn.social({ provider: 'discord', callbackURL: '/manage-redirect' })
        } finally {
          setBusy(false)
        }
      }}
      className="hover:text-zinc-300 transition-colors disabled:opacity-60 cursor-pointer"
    >
      Manage Events
    </button>
  )
}
