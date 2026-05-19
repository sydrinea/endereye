export const EPS = 1e-7

export function getMidRanks(values: number[]): number[] {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const ranks: number[] = Array.from({ length: values.length })
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j < sorted.length && sorted[j].v === sorted[i].v) j++
    const avgRank = (i + 1 + j) / 2
    for (let k = i; k < j; k++) ranks[sorted[k].i] = avgRank
    i = j
  }
  return ranks
}

export function calculatePearson(x: number[], y: number[]): number {
  const n = x.length
  if (n !== y.length || n === 0) return 0
  const avgX = x.reduce((a, b) => a + b, 0) / n
  const avgY = y.reduce((a, b) => a + b, 0) / n
  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - avgX
    const dy = y[i] - avgY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  if (denX === 0 || denY === 0) return 0
  return num / Math.sqrt(denX * denY)
}

export function spearmanRankCorrelation(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  if (a.every((v) => v === a[0]) || b.every((v) => v === b[0])) return 0
  return calculatePearson(getMidRanks(a), getMidRanks(b))
}

export function topNAccuracy(predicted: string[], actual: string[], n: number): number {
  const predSet = new Set(predicted.slice(0, n))
  const actSet = new Set(actual.slice(0, n))
  return [...predSet].filter((id) => actSet.has(id)).length
}

export interface TierCalibrationRow {
  tier: string
  predictedRate: number
  actualRate: number
  count: number
}

export function tierCalibration(
  tiers: Array<{ tier: string; predicted: number; actual: boolean }>,
): TierCalibrationRow[] {
  const map = new Map<string, { count: number; probSum: number; survived: number }>()
  for (const { tier, predicted, actual } of tiers) {
    if (!map.has(tier)) map.set(tier, { count: 0, probSum: 0, survived: 0 })
    const s = map.get(tier)!
    s.count++
    s.probSum += predicted
    if (actual) s.survived++
  }
  return [...map.entries()].map(([tier, s]) => ({
    tier,
    predictedRate: s.probSum / s.count,
    actualRate: s.survived / s.count,
    count: s.count,
  }))
}

export function brierScore(preds: Array<{ prob: number; actual: number }>): number {
  if (preds.length === 0) return 0
  return preds.reduce((sum, { prob, actual }) => sum + (prob - actual) ** 2, 0) / preds.length
}

export function binaryCrossEntropy(predictions: number[], actuals: number[]): number {
  if (predictions.length === 0) return 0
  let total = 0
  for (let i = 0; i < predictions.length; i++) {
    const p = Math.max(EPS, Math.min(1 - EPS, predictions[i]))
    const y = actuals[i]
    total += -(y * Math.log(p) + (1 - y) * Math.log(1 - p))
  }
  return total / predictions.length
}

export function l1Regularization(weights: number[], lambda: number): number {
  return weights.reduce((sum, w) => sum + Math.abs(w), 0) * lambda
}

export function l2Regularization(weights: number[], lambda: number): number {
  return weights.reduce((sum, w) => sum + w * w, 0) * lambda
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

export function rocCurve(preds: Array<{ prob: number; actual: number }>): {
  fpr: number[]
  tpr: number[]
} {
  const sorted = [...preds].sort((a, b) => b.prob - a.prob)
  const totalPos = sorted.filter((p) => p.actual === 1).length
  const totalNeg = sorted.filter((p) => p.actual === 0).length
  if (totalPos === 0 || totalNeg === 0) return { fpr: [0, 1], tpr: [0, 1] }
  const fpr: number[] = [0]
  const tpr: number[] = [0]
  let currentPos = 0
  let currentNeg = 0
  for (const p of sorted) {
    if (p.actual === 1) currentPos++
    else currentNeg++
    fpr.push(currentNeg / totalNeg)
    tpr.push(currentPos / totalPos)
  }
  return { fpr, tpr }
}
