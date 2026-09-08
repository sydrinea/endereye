import { Breadcrumbs, PlayerAvatar } from '@/components/ui'
import type { User } from '@endereye/core'

/**
 * Fallback player page for someone with no career analytics — i.e. they've only
 * appeared in community-hosted events, which aren't part of the official
 * `/players` + `/finalists` pipeline. Shows their live MCSR Ranked season stats.
 */
export function MinimalPlayerProfile({ user }: { user: User }) {
  const s = user.statistics.season
  const stats: Array<[string, string | number]> = [
    ['Elo', user.eloRate ?? '—'],
    ['Rank', user.eloRank ? `#${user.eloRank}` : '—'],
    ['Ranked W–L', `${s.wins.ranked ?? 0}–${s.loses.ranked ?? 0}`],
    ['Matches', s.playedMatches.ranked ?? 0],
  ]

  return (
    <main className="flex flex-col items-center px-6 py-8 gap-6">
      <div className="w-full max-w-4xl flex flex-col gap-6 text-zinc-400">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Players', href: '/players' },
            { label: user.nickname },
          ]}
        />

        <div className="flex items-center gap-4">
          <PlayerAvatar nickname={user.nickname} size="lg" />
          <div>
            <h1 className="font-display text-3xl text-zinc-100">{user.nickname}</h1>
            {user.country && <p className="text-sm text-zinc-500 mt-0.5">{user.country}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex flex-col gap-1"
            >
              <span className="text-xs text-zinc-500">{label}</span>
              <span className="font-mono text-lg text-zinc-200">{value}</span>
            </div>
          ))}
        </div>

        <p className="text-sm text-zinc-600">
          Career analytics covers official MCSR Ranked LCQ, MSS, and World Championship events only.
        </p>
      </div>
    </main>
  )
}
