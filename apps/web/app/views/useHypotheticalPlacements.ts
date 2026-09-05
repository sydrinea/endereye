'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  computeHistoricalData,
  computeHypotheticalOdds,
  getAvailableScores,
} from '@endereye/core'
import type { EventContext, PlayerView } from '@endereye/core'
import type { Status } from '@/components/ui'
import { mapPill, mapStatus, survivalPct } from '@/lib/dashboard-utils'
import type { PillData } from './StandingsRow'

export interface HypoOverlay {
  survivalPct: number
  status: Status
  pill?: PillData
  clinchPlace: number | 'DNF' | null
  projectedPts: number
  place: number
}

interface HypotheticalPlacements {
  /** Whether the feature applies to this seed (field ≤ 10, cut still ahead). */
  enabled: boolean
  /** uuid → 1-based place assigned for the current seed. */
  fixed: Record<string, number>
  /** uuid → recomputed row values, once a placement is set. */
  overlay: Record<string, HypoOverlay>
  fieldSize: number
  computing: boolean
  assign: (uuid: string, place: number) => void
  clear: (uuid: string) => void
  reset: () => void
}

const MAX_FIELD = 10

export function useHypotheticalPlacements(
  eventData: EventContext,
  seed: number,
  views: PlayerView[],
): HypotheticalPlacements {
  const activeViews = useMemo(() => views.filter((v) => v.status !== 'eliminated'), [views])
  const fieldSize = activeViews.length
  const enabled = fieldSize > 0 && fieldSize <= MAX_FIELD && seed + 1 <= 10

  const [fixed, setFixed] = useState<Record<string, number>>({})
  const [overlay, setOverlay] = useState<Record<string, HypoOverlay>>({})
  const [computing, setComputing] = useState(false)
  const fixedCount = Object.keys(fixed).length

  // Reset assignments whenever the seed or event snapshot changes.
  const resetKey = `${eventData.kind}:${eventData.season}:${seed}:${eventData.currentRound}`
  const prevResetKey = useRef(resetKey)
  useEffect(() => {
    if (prevResetKey.current !== resetKey) {
      prevResetKey.current = resetKey
      setFixed({})
      setOverlay({})
    }
  }, [resetKey])

  const assign = useCallback((uuid: string, place: number) => {
    setFixed((prev) => {
      const next = { ...prev }
      // A place is unique — drop it from whoever else held it.
      for (const [k, v] of Object.entries(next)) if (v === place && k !== uuid) delete next[k]
      if (next[uuid] === place) delete next[uuid]
      else next[uuid] = place
      return next
    })
  }, [])

  const clear = useCallback((uuid: string) => {
    setFixed((prev) => {
      if (!(uuid in prev)) return prev
      const next = { ...prev }
      delete next[uuid]
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setFixed({})
    setOverlay({})
  }, [])

  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(() => {
      if (cancelled) return
      if (!enabled || fixedCount === 0) {
        setOverlay({})
        setComputing(false)
        return
      }
      setComputing(true)
      const ctx = computeHistoricalData(eventData, seed)
      const odds = computeHypotheticalOdds(ctx, fixed)
      const seedScores = getAvailableScores(fieldSize)
      const next: Record<string, HypoOverlay> = {}
      for (const v of activeViews) {
        const o = odds[v.uuid]
        if (!o) continue
        const place = fixed[v.uuid]
        next[v.uuid] = {
          survivalPct: survivalPct(o.survivalProbability),
          status: mapStatus(o as unknown as PlayerView),
          pill: mapPill(o as unknown as PlayerView),
          clinchPlace: o.clinchPlace,
          projectedPts: v.point + (place ? (seedScores[place - 1] ?? 0) : 0),
          place: place ?? 0,
        }
      }
      setOverlay(next)
      setComputing(false)
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [enabled, fixed, fixedCount, eventData, seed, fieldSize, activeViews])

  return { enabled, fixed, overlay, fieldSize, computing, assign, clear, reset }
}
