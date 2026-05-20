import type { SatoriOptions } from 'satori'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let _imageFonts: SatoriOptions['fonts'] | undefined

export function getImageFonts(): SatoriOptions['fonts'] {
  if (_imageFonts) return _imageFonts
  const fontDir = join(__dirname, '../../assets/fonts')
  _imageFonts = [
    {
      name: 'Minecraft',
      data: readFileSync(join(fontDir, 'minecraft-regular.otf')),
      weight: 400,
    },
    {
      name: 'Raleway',
      data: readFileSync(join(fontDir, 'raleway-frozen.ttf')),
      weight: 400,
    },
    {
      name: 'GeistMono',
      data: readFileSync(join(fontDir, 'geist-mono-frozen.ttf')),
      weight: 400,
    },
  ]
  return _imageFonts
}
