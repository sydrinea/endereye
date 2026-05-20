# Pre-Event Checklist — MCSR World Championships LCQ (May 24, 2026)

## When the bracket is announced (days before)

- [ ] Run the player seed script:
  ```sh
  cd packages/discovery
  npm run seed -- lcq 11
  ```
- [ ] Rename the output file to the correct path:
  ```sh
  mv data/lcq/11.players.json data/lcq/2026.worlds.players.json
  ```
- [ ] Verify the file has the correct players (check count and a few nicknames)
- [ ] Commit and push:
  ```sh
  git add packages/discovery/data/lcq/2026.worlds.players.json
  git commit -m "chore: seed worlds 2026 player cache"
  git push
  ```
- [ ] Redeploy to Vercel (push triggers deploy automatically if CI is wired)
- [ ] Confirm `/` still shows the countdown hero

---

## ~1 hour before event (10am ET, May 24th)

- [ ] Run the match bounds helper:
  ```sh
  npx tsx packages/core/scripts/get-latest-match-id.ts
  ```
- [ ] Copy the printed match ID
- [ ] Update `matchBoundsAfter` in `apps/web/app/events.config.ts`:
  ```ts
  matchBoundsAfter: <paste ID here>,
  ```
- [ ] Commit and push:
  ```sh
  git add apps/web/app/events.config.ts
  git commit -m "chore: set worlds 2026 match bounds"
  git push
  ```
- [ ] Wait for Vercel deploy to complete
- [ ] Confirm `/` still shows countdown (event hasn't started yet)

---

## At 11am ET (event start)

- [ ] `/` should auto-switch from hero to live tracker within ~2 minutes of the first seeded match
- [ ] Check that standings show correct players and points
- [ ] Monitor Vercel function logs for any API errors (429 rate limit, parse errors)
- [ ] If standings look wrong, verify `currentRound` in the live data and that `matchBoundsAfter` is correct

---

## Notes

- The live pipeline runs at most once every 2 minutes (server-side cache). Clients refresh every 30s but only get new data when the cache expires.
- If the event is delayed past 11am ET, the hero "Starting soon…" state shows automatically when the countdown hits zero but no matches are found yet.
- To test the live tracker before the event, temporarily set `startDate` to a past date in `events.config.ts` (it will show the empty-matches "Starting soon…" state since no real match data exists yet).
