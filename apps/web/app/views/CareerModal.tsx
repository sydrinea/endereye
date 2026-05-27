'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, createContext, useContext } from 'react'

const CareerModalContext = createContext(false)
export const useCareerModal = () => useContext(CareerModalContext)

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

  const handlePanelClick = useCallback(
    (e: React.MouseEvent) => {
      const anchor = (e.target as Element).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      e.preventDefault()
      setVisible(false)
      setTimeout(() => {
        document.body.style.overflow = ''
        router.push(href)
      }, 200)
    },
    [router],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <CareerModalContext.Provider value={true}>
      <div
        className={`fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-10 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => {
          if (!panelRef.current?.contains(e.target as Node)) close()
        }}
      >
        <div
          ref={panelRef}
          className={`relative w-full max-w-3xl h-fit bg-zinc-900 border border-zinc-950 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
          onClick={(e) => e.stopPropagation()}
          onClickCapture={handlePanelClick}
        >
          {children}
        </div>
      </div>
    </CareerModalContext.Provider>
  )
}
