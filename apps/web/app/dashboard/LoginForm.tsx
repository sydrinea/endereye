'use client'

import { useActionState } from 'react'
import { loginAction } from './actions'
import { Surface } from '@/components/layout/Surface'

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null)

  return (
    <Surface variant="centered">
      <form
        action={action}
        className="flex flex-col gap-4 w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-8"
      >
        <h1 className="font-display text-lg text-zinc-100">Dashboard</h1>
        <input
          type="password"
          name="secret"
          placeholder="Secret"
          autoFocus
          required
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        {state?.error && <p className="text-red-400 text-sm">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="bg-accent/15 text-accent rounded-lg px-4 py-2 text-sm font-medium hover:bg-accent/20 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Surface>
  )
}
