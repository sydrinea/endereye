'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

export function CareerModal({
  children,
  skipEntryAnimation = false,
}: {
  children: React.ReactNode
  skipEntryAnimation?: boolean
}) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(skipEntryAnimation)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!skipEntryAnimation) setVisible(true)
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [skipEntryAnimation])

  const close = useCallback(() => {
    setVisible(false)
    setTimeout(() => router.back(), 200)
  }, [router])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-10 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) close()
      }}
    >
      <div
        ref={panelRef}
        className={`relative w-full max-w-3xl h-fit bg-zinc-900 border border-zinc-950 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
