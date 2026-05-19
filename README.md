<div align="center">
  <img src="/packages/core/assets/logo.png" width="80" alt="MCSR Ranked logo" />

# endereye

A live survival odds calculator for MCSR Ranked LCQ and MSS events

</div>

---

`endereye` generates per-player qualification probabilities during Last Chance Qualifiers and Midseason Showdowns, updating after each seed to answer the question: _who is actually in trouble right now?_

## Monte Carlo

Each event state is simulated 10,000 times. For each simulation, players are ranked per seed based on a power score derived from their Elo, win rate, best time, and average completion time. Players with a large gap between their best and average time are more likely to DNF in any given seed. Eliminations are applied at the scheduled cut points, and the top 4 finishers qualify.

## Power Scoring

The model scores each player's expected performance per seed using:

- **Elo** — a compressed version of their season rating, weighted lightly to avoid over-relying on ladder performance
- **Win rate** — scaled by number of matches played, so low-volume players don't get outsized credit
- **Best time** — how fast they can go on a good run, relative to the field
- **Average time** — how consistently they finish, weighted more heavily in the first half of the event

## Deterministic Guarantees

Beyond probabilities, the model provides exact answers where possible:

- **Clinch score**: the minimum placement a player needs this seed to guarantee survival at the next cut, under worst-case assumptions for all other players
- **Safe**: whether a player is mathematically guaranteed to survive the next cut regardless of this seed's result
- **Can still win**: whether a top-4 finish is still mathematically possible

These are computed deterministically, not from simulation, so they carry no sampling error.

## Calibration

The model has been backtested across Seasons 7–10 for both LCQ and MSS:

- **AUC 0.886** vs. baseline 0.762 — statistically significant lift over raw Elo (p < 0.001, bootstrap 1000 iterations)
- **0 clinch violations** — no player flagged as safe was subsequently eliminated
- **0 safe violations** — no clinch guarantee was incorrect

Calibration is slightly overconfident in the 10–80% survival range (actual rates run ~3–6% below predicted), likely due to underestimating DNF variance in the competitive field.

## Usage

```bash
npm run dev -- --season 10 --event lcq --seed 7
```

Generates a shareable PNG of current survival odds and copies it to your clipboard.
