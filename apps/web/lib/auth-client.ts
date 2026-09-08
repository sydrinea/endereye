/**
 * Client-side better-auth handle — used by `AuthMenu` and any other client
 * component that needs the session or the sign-in / sign-out actions.
 *
 * `inferAdditionalFields` is given the `handle` field explicitly (rather than
 * `<typeof auth>`) so this file never pulls the server auth module into the
 * client bundle.
 */
'use client'

import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: { handle: { type: 'string', required: false } } })],
})

export const { signIn, signOut, useSession } = authClient
