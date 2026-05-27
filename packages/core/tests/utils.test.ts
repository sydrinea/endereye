import { describe, expect, it } from 'vitest'
import { rocAuc, mean } from '../lib/utils'

describe('rocAuc', () => {
  it('returns 1.0 when all winners have strictly higher probability than all losers', () => {
    const preds = [
      { prob: 0.9, actual: 1 },
      { prob: 0.8, actual: 1 },
      { prob: 0.4, actual: 0 },
      { prob: 0.2, actual: 0 },
    ]
    expect(rocAuc(preds)).toBe(1.0)
  })

  it('returns 0.0 when all losers have strictly higher probability than all winners', () => {
    const preds = [
      { prob: 0.9, actual: 0 },
      { prob: 0.8, actual: 0 },
      { prob: 0.4, actual: 1 },
      { prob: 0.2, actual: 1 },
    ]
    expect(rocAuc(preds)).toBe(0.0)
  })

  it('returns 0.5 when all predictions are the same probability', () => {
    const preds = [
      { prob: 0.5, actual: 1 },
      { prob: 0.5, actual: 1 },
      { prob: 0.5, actual: 0 },
      { prob: 0.5, actual: 0 },
    ]
    expect(rocAuc(preds)).toBe(0.5)
  })

  it('returns 1.0 for a single winner-loser pair where winner has higher prob', () => {
    expect(
      rocAuc([
        { prob: 0.8, actual: 1 },
        { prob: 0.3, actual: 0 },
      ]),
    ).toBe(1.0)
  })

  it('returns 0.5 for a single winner-loser pair that is tied', () => {
    expect(
      rocAuc([
        { prob: 0.5, actual: 1 },
        { prob: 0.5, actual: 0 },
      ]),
    ).toBe(0.5)
  })

  it('returns 0.75 for a known mixed case: 3 of 4 winner-loser pairs correct', () => {
    // winners: 0.8, 0.6 — losers: 0.7, 0.4
    // pairs: (0.8,0.7)→correct, (0.8,0.4)→correct, (0.6,0.7)→wrong, (0.6,0.4)→correct
    // 3 correct / 4 total = 0.75
    const preds = [
      { prob: 0.8, actual: 1 },
      { prob: 0.6, actual: 1 },
      { prob: 0.7, actual: 0 },
      { prob: 0.4, actual: 0 },
    ]
    expect(rocAuc(preds)).toBe(0.75)
  })

  it('returns 0 when there are no winners', () => {
    const preds = [
      { prob: 0.8, actual: 0 },
      { prob: 0.3, actual: 0 },
    ]
    expect(rocAuc(preds)).toBe(0)
  })

  it('returns 0 when there are no losers', () => {
    const preds = [
      { prob: 0.8, actual: 1 },
      { prob: 0.3, actual: 1 },
    ]
    expect(rocAuc(preds)).toBe(0)
  })
})

describe('mean', () => {
  it('returns the average value', () => {
    expect(mean([3, 1, 2])).toBe(2)
  })
})
