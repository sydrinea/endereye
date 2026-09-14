'use client'

import { Surface } from '@/components/layout'
import { signIn } from '@/lib/auth-client'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'

export default function CreateYourOwn() {
  useEffect(() => {
    ;(async () => await signIn.social({ provider: 'discord', callbackURL: '/manage-redirect' }))()
  })
  return (
    <Surface variant="centered">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm">
          <span>Redirecting</span>
          <Loader2 size={14} className="animate-spin" />
        </div>
      </div>
    </Surface>
  )
}
