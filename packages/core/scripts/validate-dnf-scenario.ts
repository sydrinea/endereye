// Validates DNF scenario math via brute-force permutation enumeration.
// Enumerates all 5! = 120 placement permutations for the 5 completers
// and checks survival for a given target player DNFing.

const QUALIFY = 3

const start: Record<string, number> = {
  HDMICables: 145,
  MrBudgiee: 144,
  Erikfzf: 131,
  silverrruns: 123,
  paukll: 118,
  BadGamer: 118,
}

// HDMICables DNFs — 5 players complete, scores split among them
function scores(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const p = i + 1
    return Math.round((24 * (n - p + 1)) / n)
  })
}

const completers = ['MrBudgiee', 'Erikfzf', 'silverrruns', 'paukll', 'BadGamer']
const S = scores(completers.length)
console.log('5-player scores (HDMICables DNFs):', S)

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  return arr.flatMap((v, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [v, ...p]),
  )
}

const perms = permutations(completers)

function simulate(perm: string[]): Record<string, number> {
  const pts = { ...start } // HDMICables keeps start points only (DNF = 0 extra)
  perm.forEach((name, place) => {
    pts[name] = (pts[name] ?? 0) + S[place]
  })
  return pts
}

function qualifiers(pts: Record<string, number>): string[] {
  return Object.entries(pts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, QUALIFY)
    .map(([name]) => name)
}

// Overall DNF survival rate
const all = perms.map(simulate)
const dnfSurvival = all.filter((pts) => qualifiers(pts).includes('HDMICables')).length
console.log(`\nOverall DNF survival: ${dnfSurvival}/${perms.length} = ${((dnfSurvival / perms.length) * 100).toFixed(1)}%`)

// Constraint: silverrruns 1st AND Erikfzf finishes 3rd or better (place <= 3)
const constrained = perms.filter((p) => p[0] === 'silverrruns' && p.indexOf('Erikfzf') <= 2)
const constrainedSurvival = constrained.filter((p) => qualifiers(simulate(p)).includes('HDMICables')).length
console.log(`\nsilverruns 1st + Erikfzf ≤3rd: ${constrained.length} permutations`)
console.log(`  HDMICables survives: ${constrainedSurvival}/${constrained.length} = ${constrainedSurvival === 0 ? '0%' : ((constrainedSurvival / constrained.length) * 100).toFixed(1) + '%'}`)

// Show the actual final standings for each constrained permutation
console.log('\n  Permutation details:')
for (const perm of constrained) {
  const pts = simulate(perm)
  const sorted = Object.entries(pts).sort((a, b) => b[1] - a[1])
  const survives = qualifiers(pts).includes('HDMICables')
  console.log(`  ${perm.map((n, i) => `${n}(${i + 1})`).join(' ')} → ${sorted.map(([n, p]) => `${n}:${p}`).join(' ')} | HDMI ${survives ? 'SURVIVES' : 'OUT'}`)
}

// Also check: silverrruns 1st + Erikfzf 2nd specifically
const silver1erik2 = perms.filter((p) => p[0] === 'silverrruns' && p[1] === 'Erikfzf')
const silver1erik2Survival = silver1erik2.filter((p) => qualifiers(simulate(p)).includes('HDMICables')).length
console.log(`\nsilverruns 1st + Erikfzf 2nd specifically: ${silver1erik2Survival}/${silver1erik2.length} = ${((silver1erik2Survival / silver1erik2.length) * 100).toFixed(1)}%`)

// ── MrBudgiee DNF scenario ──────────────────────────────────────────────────
console.log('\n\n── MrBudgiee DNF ──')
const mrBCompleters = ['HDMICables', 'Erikfzf', 'silverrruns', 'paukll', 'BadGamer']
const mrBScores = scores(mrBCompleters.length)
console.log('5-player scores (MrBudgiee DNFs):', mrBScores)

const mrBPerms = permutations(mrBCompleters)

function simulateMrBDNF(perm: string[]): Record<string, number> {
  const pts = { ...start }
  perm.forEach((name, place) => { pts[name] = (pts[name] ?? 0) + mrBScores[place] })
  return pts
}

const mrBAll = mrBPerms.map(simulateMrBDNF)
const mrBDnfSurvival = mrBAll.filter((pts) => qualifiers(pts).includes('MrBudgiee')).length
console.log(`\nOverall DNF survival: ${mrBDnfSurvival}/${mrBPerms.length} = ${((mrBDnfSurvival / mrBPerms.length) * 100).toFixed(1)}%`)

function checkThreat(label: string, filter: (p: string[]) => boolean) {
  const matching = mrBPerms.filter(filter)
  const survival = matching.filter((p) => qualifiers(simulateMrBDNF(p)).includes('MrBudgiee')).length
  const pct = matching.length === 0 ? '—' : ((survival / matching.length) * 100).toFixed(1) + '%'
  console.log(`\n${label}: ${matching.length} permutations`)
  console.log(`  MrBudgiee survives: ${survival}/${matching.length} = ${pct}`)
  for (const perm of matching) {
    const pts = simulateMrBDNF(perm)
    const sorted = Object.entries(pts).sort((a, b) => b[1] - a[1])
    const survives = qualifiers(pts).includes('MrBudgiee')
    console.log(`  ${perm.map((n, i) => `${n}(${i + 1})`).join(' ')} → ${sorted.map(([n, p]) => `${n}:${p}`).join(' ')} | MrB ${survives ? 'SURVIVES' : 'OUT'}`)
  }
}

// Screenshot scenarios (threat mode: maxPlace constraints)
checkThreat(
  'silverrruns ≤2nd + Erikfzf ≤2nd',
  (p) => p.indexOf('silverrruns') <= 1 && p.indexOf('Erikfzf') <= 1,
)
checkThreat(
  'silverrruns ≤2nd + Erikfzf ≤3rd',
  (p) => p.indexOf('silverrruns') <= 1 && p.indexOf('Erikfzf') <= 2,
)
checkThreat(
  'silverrruns ≤2nd + Erikfzf ≤3rd + HDMICables ≤3rd',
  (p) => p.indexOf('silverrruns') <= 1 && p.indexOf('Erikfzf') <= 2 && p.indexOf('HDMICables') <= 2,
)
