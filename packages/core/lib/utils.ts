export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b) / values.length
}

export function rocAuc(preds: Array<{ prob: number; actual: number }>): number {
  const winners = preds.filter((p) => p.actual === 1)
  const losers = preds.filter((p) => p.actual === 0)
  if (winners.length === 0 || losers.length === 0) return 0
  let correct = 0
  let tied = 0
  for (const w of winners) {
    for (const l of losers) {
      if (w.prob > l.prob) correct++
      else if (w.prob === l.prob) tied++
    }
  }
  return (correct + 0.5 * tied) / (winners.length * losers.length)
}

export function pct(n: number): string {
  if (!Number.isFinite(n)) return 'N/A'
  return `${(n * 100).toFixed(1)}%`
}

export function delta(n: number): string {
  if (!Number.isFinite(n)) return 'N/A'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(1)}%`
}

export function dataTable(headers: string[], rows: (string | number)[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)),
  )
  const sep = `├${widths.map((w) => '─'.repeat(w + 2)).join('┼')}┤`
  const top = `┌${widths.map((w) => '─'.repeat(w + 2)).join('┬')}┐`
  const bot = `└${widths.map((w) => '─'.repeat(w + 2)).join('┴')}┘`
  const fmt = (row: (string | number)[]) =>
    `│${row.map((v, i) => ` ${String(v ?? '').padEnd(widths[i])} `).join('│')}│`
  return [top, fmt(headers), sep, ...rows.map(fmt), bot].join('\n')
}
