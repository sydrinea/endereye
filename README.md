<div align="center">
  <img src=".github/logo.png" width="80" alt="MCSR Ranked logo" />

# endereye

A live survival odds calculator for MCSR Ranked LCQ and MSS events

</div>

---

`endereye` generates per-player qualification probabilities during Last Chance Qualifiers and Midseason Showdowns, updating after each seed to answer the question: _who is actually in trouble right now?_

## Usage

Visit [https://lcqtracker.vercel.app](https://lcqtracker.vercel.app), where it updates in real time for the currently active event!

## How it works

Each time a seed completes, the model runs 20,000 simulated playthroughs of the remaining seeds. In each simulation, player performance is sampled from a model built on Elo rating and season ladder completion stats (average time, best time). The fraction of simulations in which a player survives the next elimination becomes their displayed survival probability.

Survival and threat paths are derived from the same simulation batch. After all simulations run, the model identifies which opponent placement patterns most reliably separate "survived" from "eliminated" outcomes for each player, and surfaces the most frequent ones.

In a 60+ player lobby, simulating exact permutations becomes computationally impossible. The **Safe** and **Needs #** labels bypass player variance by using point calculations to surface guaranteed survival thresholds:

- **Safe** — whether a player is mathematically guaranteed to survive the next cut regardless of this seed's result
- **Clinch Place** — the minimum placement a player needs this seed to guarantee survival at the next cut, under worst-case assumptions for all other players

## Calibration

| Metric                   | Value  |
| ------------------------ | ------ |
| Survival Brier score     | 0.0552 |
| Safe violations          | 0      |
| Clinch violations        | 0      |
| Variation per simulation | ±0.3%  |

A well-calibrated model should be right as often as it says it will be: when it assigns 70% survival odds, the player should survive roughly 70% of the time. The model is slightly overconfident in the 10–80% range (actual rates run ~3–8% below predicted). At the extremes it is well-calibrated — near-certain survivors and near-certain eliminations are predicted accurately.

No safe or clinch guarantee has ever been incorrect.

## Limitations

- The model does not account for player momentum, fatigue, or meta-game dynamics within an event.
- Elo and completion time metrics are based on the season ladder. A player having an unusually good or bad day is not reflected.
- Scenario path validation is based on a small number of historical events. Sample sizes will grow as more seasons are archived.
- DNF probability is estimated from historical completion rates and does not account for known circumstances like technical issues or scheduling conflicts.
