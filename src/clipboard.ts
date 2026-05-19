import { execSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { platform } from 'node:os'
import { AppError } from './errors'

export function copyPngToClipboard(buffer: Buffer): void {
  const os = platform()

  if (os === 'darwin') {
    const tmp = join(tmpdir(), `endereye-${Date.now()}.png`)
    try {
      writeFileSync(tmp, buffer)
      execSync(`osascript -e 'set the clipboard to (read (POSIX file "${tmp}") as «class PNGf»)'`)
    } finally {
      try {
        unlinkSync(tmp)
      } catch {
        /* empty */
      }
    }
  } else if (os === 'linux') {
    try {
      execSync('wl-copy --type image/png', { input: buffer, stdio: ['pipe', 'ignore', 'ignore'] })
    } catch {
      execSync('xclip -selection clipboard -t image/png', {
        input: buffer,
        stdio: ['pipe', 'ignore', 'ignore'],
      })
    }
  } else {
    throw new AppError('Clipboard copy not supported on Windows', 'CLIPBOARD_ERROR')
  }
}
