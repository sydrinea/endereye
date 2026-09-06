/** Shared formatting and metric helpers, used mostly by the backtest scripts and tests. */

/** Arithmetic mean; 0 for an empty array. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b) / values.length
}

/**
 * ROC AUC by direct pairwise comparison: the fraction of (winner, loser) pairs
 * the model ranks correctly, with ties counting half. 0 if either class is
 * empty. Used to score odds predictions against historical outcomes.
 */
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

/** A 0–1 ratio as a one-decimal percent (`"12.3%"`); `"N/A"` if not finite. */
export function pct(n: number): string {
  if (!Number.isFinite(n)) return 'N/A'
  return `${(n * 100).toFixed(1)}%`
}

/** Like `pct`, but always signed (`"+1.2%"` / `"-3.4%"`) — for showing a change. */
export function delta(n: number): string {
  if (!Number.isFinite(n)) return 'N/A'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(1)}%`
}

/** Renders a Unicode box-drawing table for console output, columns auto-sized to content. */
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
