'use client'

import { useEffect } from 'react'

export function ReplaceUrl({ href }: { href: string }) {
  useEffect(() => {
    window.history.replaceState(null, '', href)
  }, [])
  return null
}
