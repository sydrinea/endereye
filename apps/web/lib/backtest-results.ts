export const CALIBRATION_DATA: Array<{
  range: string
  predicted: number
  actual: number
  n: number
}> = [
  { range: '0–10%', predicted: 0.3, actual: 0.1, n: 3054 },
  { range: '10–20%', predicted: 14.9, actual: 12.9, n: 178 },
  { range: '20–30%', predicted: 25.2, actual: 17.1, n: 298 },
  { range: '30–40%', predicted: 35.1, actual: 31.1, n: 190 },
  { range: '40–50%', predicted: 45.2, actual: 37.1, n: 264 },
  { range: '50–60%', predicted: 55.2, actual: 49.1, n: 275 },
  { range: '60–70%', predicted: 64.6, actual: 59.8, n: 239 },
  { range: '70–80%', predicted: 74.7, actual: 77.3, n: 119 },
  { range: '80–90%', predicted: 84.8, actual: 88.2, n: 93 },
  { range: '90–100%', predicted: 99.7, actual: 99.8, n: 1320 },
]

export const SCENARIO_PATH_DATA = {
  threat: { hitRate: 54.5, baseline: 30.7, n: 11 },
  survival: { hitRate: 85.7, baseline: 69.6, n: 7 },
}

export const MODEL_STATS = {
  auc: 0.8861,
  brier: 0.0552,
  simulationsPerPrediction: 20_000,
}
