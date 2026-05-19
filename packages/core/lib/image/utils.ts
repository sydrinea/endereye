import { FetchError } from '../errors'

export async function fetchPlayerHeads(nicknames: string[]): Promise<Record<string, string>> {
  const avatarUrls: Record<string, string> = {}
  await Promise.all(
    nicknames.map(async (nickname) => {
      try {
        const res = await fetch(`https://mc-heads.net/avatar/${nickname}/32`)
        const buf = await res.arrayBuffer()
        const b64 = Buffer.from(buf).toString('base64')
        avatarUrls[nickname] = `data:image/png;base64,${b64}`
      } catch {
        throw new FetchError(`Failed to fetch player head: ${nickname}`)
      }
    }),
  )
  return avatarUrls
}

const TITLE_HEIGHT = 70
const HEADER_HEIGHT = 32
const HEADER_HEIGHT_SUB = 46
const ROW_HEIGHT = 32
const FOOTER_HEIGHT = 41

export function computeImageDimensions({
  columnWidths,
  rowCount,
  hasSubheader = false,
  padding = 40,
  minWidth = 0,
}: {
  columnWidths: number[]
  rowCount: number
  hasSubheader?: boolean
  padding?: number
  minWidth?: number
}): { width: number; height: number } {
  const tableWidth = columnWidths.reduce((a, b) => a + b, 0)
  const headerHeight = hasSubheader ? HEADER_HEIGHT_SUB : HEADER_HEIGHT
  const width = Math.max(padding * 2 + tableWidth, minWidth)
  return {
    width,
    height: padding * 2 + TITLE_HEIGHT + headerHeight + rowCount * ROW_HEIGHT + FOOTER_HEIGHT,
  }
}

export function getHeatmapStyle(prob: number, maxProb: number): string {
  const v = maxProb > 0 ? Math.max(0, Math.min(1, prob / maxProb)) : 0
  let r, g, b

  if (v < 0.5) {
    const t = v / 0.5
    r = 255
    g = Math.round(0 + (255 - 0) * t)
    b = 0
  } else {
    const t = (v - 0.5) / 0.5
    r = Math.round(255 + (0 - 255) * t)
    g = 255
    b = 0
  }

  return `rgba(${r}, ${g}, ${b}, 0.6)`
}
