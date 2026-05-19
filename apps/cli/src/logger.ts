import { consola } from 'consola'

export const log = {
  info: (msg: string) => consola.info(msg),
  success: (msg: string) => consola.success(msg),
  warn: (msg: string) => consola.warn(msg),
  error: (msg: string, err?: unknown) => consola.error(msg, err),
  start: (msg: string) => consola.start(msg),
  section: (msg: string) => consola.box(msg),
  metric: (label: string, value: string | number) => consola.log(`  ${label}: ${value}`),
}
