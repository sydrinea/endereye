import satori from 'satori'
import sharp from 'sharp'
import {
  HeaderRow,
  ImageFooter,
  ImageTitle,
  outerShellStyle,
  PlayerHead,
  tableContainerStyle,
} from './components'
import { getImageFonts } from './fonts'
import { computeImageDimensions, fetchPlayerHeads, getHeatmapStyle } from './utils'
import { ELIMINATION_SCHEDULE } from '@endereye/core'
import { accentRgba } from './ui'
import type { EventKind } from '@endereye/core'

interface RenderOptions {
  season: number
  kind: EventKind
  currentRound: number
  results: Record<string, Record<number, number>>
  players: Array<{ uuid: string; nickname: string; eloRank: number | null }>
  iterations: number
  qualifyCount?: number
}

export async function renderSurvivalHeatmap(opts: RenderOptions): Promise<Buffer<ArrayBufferLike>> {
  const { season, kind, currentRound, results, players, iterations, qualifyCount = 4 } = opts

  const remainingCuts = ELIMINATION_SCHEDULE.filter((c) => c.afterSeed >= currentRound)

  let filteredPlayers = players
    .filter((p) => (results[p.uuid]?.[999] || 0) > 0.05)
    .sort((a, b) => (results[b.uuid]?.[999] || 0) - (results[a.uuid]?.[999] || 0))

  if (filteredPlayers.length === 0) {
    filteredPlayers = players
      .sort((a, b) => (results[b.uuid]?.[999] || 0) - (results[a.uuid]?.[999] || 0))
      .slice(0, 15)
  }

  const maxProbsPerCut = new Map<number, number>()
  for (const cut of remainingCuts) {
    const max = Math.max(...players.map((p) => results[p.uuid]?.[cut.afterSeed] || 0), 0.01)
    maxProbsPerCut.set(cut.afterSeed, max)
  }
  const maxTop4 = Math.max(...players.map((p) => results[p.uuid]?.[999] || 0), 0.01)
  maxProbsPerCut.set(999, maxTop4)

  const avatarUrls = await fetchPlayerHeads(filteredPlayers.map((p) => p.nickname))
  const { width, height } = computeImageDimensions({
    columnWidths: [204, ...remainingCuts.map(() => 96)],
    rowCount: filteredPlayers.length,
    hasSubheader: true,
    minWidth: 500,
  })

  const cutColumns = remainingCuts.map((cut, i) => ({
    cut,
    sublabel:
      i === remainingCuts.length - 1 && 'keepTop' in cut
        ? `Top ${qualifyCount}`
        : 'keepTop' in cut
          ? `Top ${cut.keepTop}`
          : cut.rule === 'zero_out'
            ? 'Zero Out'
            : 'Top 50%',
  }))

  const svg = await satori(
    <div style={outerShellStyle}>
      <ImageTitle>{`S${season} ${kind.toUpperCase()} — Top ${qualifyCount} Survival Odds`}</ImageTitle>

      <div style={tableContainerStyle}>
        <HeaderRow
          columns={[
            { label: 'Nickname', width: '204px', border: false },
            ...cutColumns.map(({ cut, sublabel }) => ({
              label: `Seed ${cut.afterSeed}`,
              sublabel,
              width: '96px',
              border: true,
            })),
          ]}
        />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredPlayers.map((p) => (
            <div
              key={p.uuid}
              style={{
                display: 'flex',
                flexDirection: 'row',
                borderBottom: `1px solid ${accentRgba(0.3)}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: '204px',
                  padding: '6px 8px',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    width: '20px',
                    justifyContent: 'flex-end',
                    color: '#52525b',
                    fontFamily: 'GeistMono',
                    fontSize: '11px',
                    flexShrink: 0,
                  }}
                >
                  {p.eloRank ?? ''}
                </span>
                <PlayerHead src={avatarUrls[p.nickname]} />
                <span style={{ display: 'flex', color: '#f4f4f5', fontFamily: 'Minecraft' }}>
                  {p.nickname}
                </span>
              </div>
              {remainingCuts.map((cut) => (
                <div
                  key={cut.afterSeed}
                  style={{
                    display: 'flex',
                    width: '96px',
                    padding: '8px',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderLeft: `1px solid ${accentRgba(0.3)}`,
                    backgroundColor: getHeatmapStyle(
                      results[p.uuid]?.[cut.afterSeed] || 0,
                      maxProbsPerCut.get(cut.afterSeed) || 1,
                    ),
                    color: '#18181b',
                    fontFamily: 'GeistMono',
                  }}
                >
                  {((results[p.uuid]?.[cut.afterSeed] || 0) * 100).toFixed(1)}%
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <ImageFooter>
        Generated by endereye • {iterations.toLocaleString()} Monte Carlo iterations
      </ImageFooter>
    </div>,
    { width, height, fonts: getImageFonts() },
  )

  return await sharp(Buffer.from(svg)).png().toBuffer()
}
