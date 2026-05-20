import { execSync } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { platform } from 'node:os'
import { join } from 'node:path'
import { AppError } from '@endereye/core'

function copyDarwin(buffer: Buffer): void {
  const tmp = join(tmpdir(), `endereye-${Date.now()}.png`)
  try {
    writeFileSync(tmp, buffer)
    execSync(`osascript -e 'set the clipboard to (read (POSIX file "${tmp}") as «class PNGf»)'`)
  } finally {
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}

function copyLinux(buffer: Buffer): void {
  try {
    execSync('wl-copy --type image/png', { input: buffer, stdio: ['pipe', 'ignore', 'ignore'] })
  } catch {
    execSync('xclip -selection clipboard -t image/png', {
      input: buffer,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
  }
}

const CLIPBOARD_HANDLERS: Partial<Record<NodeJS.Platform, (buffer: Buffer) => void>> = {
  darwin: copyDarwin,
  linux: copyLinux,
}

export function copyPngToClipboard(buffer: Buffer): void {
  const handler = CLIPBOARD_HANDLERS[platform()]
  if (!handler)
    throw new AppError(`Clipboard copy not supported on ${platform()}`, 'CLIPBOARD_ERROR')
  handler(buffer)
}
