import type { SatoriOptions } from 'satori'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fontDir = join(__dirname, '../../assets/fonts')

export const imageFonts: SatoriOptions['fonts'] = [
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
