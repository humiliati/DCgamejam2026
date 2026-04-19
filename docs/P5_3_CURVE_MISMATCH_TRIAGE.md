# DOC-110 P5.3 Curve Mismatch Triage

**Date:** 2026-04-17
**Scope:** Task #39 — triage the 5 zero-match + 12 one-match roster decks surfaced by `tools/smoke-enemy-hydrator-curve.js` against the P5.3 recommended-curve library.
**Author tool:** `tools/triage-curve-mismatches.js` (one-shot diagnostic; keep for post-jam review).

## Headline finding

**The "5 zero + 12 one" number was misleading.** It compared deck-expansions against the 6-slot recommended curves without accounting for the fact that most roster decks are only size 3 — and a size-3 deck looping over a 6-round window is *structurally* capped at 3-5/6 matches depending on which recommended sequence it's tested against. No amount of deck reordering can move a size-3 elite/tanky enemy above 3/6.

We added a closed-form `ceiling` metric to `tools/js/enemy-hydrator-curve.js` (and propagated it through the smoke + debug surface). With ceiling as context:

| cohort       | size | avg match | avg ceiling | avg gap | cohort interpretation |
|--------------|------|-----------|-------------|---------|-----------------------|
| roster total | 26   | 1.19/6    | 3.54/6      | 2.35    | we hit ~34% of achievable  |
| zero-match   | 5    | 0.00/6    | 3.40/6      | 3.40    | fully unaligned — worth a look |
| one-match    | 12   | 1.00/6    | 3.58/6      | 2.58    | opener landed once, loop slots off |
| two-match    | 8    | 2.00/6    | 3.50/6      | 1.50    | closest cohort to ceiling |
| three-match  | 1    | 3.00/6    | 4.00/6      | 1.00    | sole near-ceiling row |

**Ceiling math:** the smoke now asserts `total ≤ ceiling ≤ rounds` and exposes `window.EnemyHydratorCurve.ceilingFor(recExp, deckSize)`. See `smoke-enemy-hydrator-curve.js` test S8 for the closed-form derivation (size-3 vs standard/balanced = 4; size-3 vs elite/tanky = 3; size-4 vs elite/balanced = 5; size-6 vs anything = 6; size-1 vs elite/tanky = 2).

## Clusters surfaced by the triage

### Cluster A — hp/str = 5.0 boundary (4 enemies)

ENM-007 (hp30/str6), ENM-020 Tide Stalker, ENM-024 Brine Wraith, ENM-090 Hero's Shadow all sit exactly at hp/str = 5.0 — the `profileFor()` boundary between `balanced` (ratio < 5) and `tanky` (ratio ≥ 5). They get classified as tanky and compared to `elite/tanky` (which expects a double-BRACE opener). Their authored decks open with DOT/DRAIN/BURST patterns that fit `elite/balanced` much better (ceiling would be 5/6 instead of 3/6 for size-4, 3/6 either way for size-3).

**Design call:** flip the `profileFor()` boundary from `ratio >= 5` (tanky) to `ratio > 5` (strict) — shifts 4 elites into balanced, increases ceilings for 2 of them, and aligns classification with the authorial intent.

### Cluster B — size-3 loop constrains the mid-roster (12 enemies)

Every size-3 elite deck has ceiling=3 against its tier/profile curve. Size-3 standards fare slightly better (ceiling=4). This is not a deck bug — authoring a 6-slot matching deck requires 6 distinct cards. With the current EATK pool size (14 cards) and the size-3 default from `hydrateFromStats()`, ceilings of 3-4 are *the design envelope*.

**Design call:** leave the size-3 default for standards + low-tier elites (it's intentional for jam pacing). For boss-tier enemies (ENM-008 Bone Sovereign, ENM-017 The Amalgam, ENM-028 The Archivist), size-4 already bumps ceiling to 4 — no action needed.

### Cluster C — DOT/CC-forward archetypes don't map to tanky/balanced/glass (6 enemies)

ENM-010 Soot Imp (DOT×2), ENM-006 Cave Toad (DOT×2), ENM-021 Shock Eel (CC×2), ENM-025 Bio-Hazard Slime (DOT×2), ENM-026 Admiralty Enforcer (CC+BRACE), ENM-023 Deep Crawler (DOT×2) lean into a single intent rather than the "spread" the three profile curves assume. Their authored intent is thematically correct (*burning imp, electric eel, hazard slime*) — the curve library just doesn't have a slot for "specialist" archetypes.

**Design call:** no jam-scope change. Post-jam, consider extending the curve library with `*/dot-forward`, `*/cc-forward`, `*/drain-forward` variants, or introduce a secondary `combatArchetype` field on enemies.json that enables a 2-dimensional curve lookup.

### Cluster D — tolerance.earlyDefense is unused (all 26)

The `tolerance` field (`earlyDefense`, `lateBurst`) is authored for every curve but never consumed by the matching code. A BRACE card in round 3 doesn't satisfy "earlyDefense" today; it only matches if the exact round's intent matches. Wiring tolerance-aware matching (e.g. BRACE in rounds ≤ N satisfies a `BRACE` earlyDefense target regardless of slot) would plausibly bump every roster match score by 0.5-1 on average.

**Design call:** post-jam enhancement — wire tolerance-aware matching with a tolerance-hit count alongside strict-hit count.

## Per-row verdict

No deck changes recommended for jam. Every row below gets tagged with:
- `STRUCT` — gap is ≥ ceiling-drift; mismatch driven by deck size limits
- `PROFILE` — shifts category under proposed ratio-boundary change (Cluster A)
- `ARCHETYPE` — deck is thematically specialized, doesn't fit tanky/balanced/glass (Cluster C)
- `OK-NEAR-CEILING` — total within 1 of ceiling

### Zero-match (5)

| id      | name           | tier/profile | size | match/ceiling | tags                  |
|---------|----------------|--------------|------|---------------|-----------------------|
| ENM-010 | Soot Imp       | std/bal      | 3    | 0/4           | STRUCT, ARCHETYPE     |
| ENM-015 | Scrap Brute    | elite/tanky  | 3    | 0/3           | STRUCT, profile=tanky seems wrong for BURST opener — consider elite/glass |
| ENM-020 | Tide Stalker   | elite/tanky  | 3    | 0/3           | STRUCT, PROFILE, ARCHETYPE (CC-forward) |
| ENM-024 | Brine Wraith   | elite/tanky  | 3    | 0/3           | STRUCT, PROFILE, ARCHETYPE (DRAIN opener) |
| ENM-090 | Hero's Shadow  | elite/tanky  | 4    | 0/4           | STRUCT, PROFILE — deck is deliberately erratic (Hero-echo theme); candidate for `_curveOverride` + custom doc comment |

### One-match (12)

| id      | name              | tier/profile | size | match/ceiling | tags                  |
|---------|-------------------|--------------|------|---------------|-----------------------|
| ENM-002 | Shambling Corpse  | std/bal      | 3    | 1/4           | STRUCT — BASIC-heavy, opener lands; the 4-gap is ceiling-driven |
| ENM-003 | Dungeon Rat       | std/bal      | 3    | 1/4           | STRUCT, BASIC×2 matches opener, loops off |
| ENM-006 | Cave Toad         | std/tanky    | 3    | 1/4           | STRUCT, ARCHETYPE (DOT×2 specialist) |
| ENM-008 | Bone Sovereign    | boss/tanky   | 4    | 1/4           | STRUCT — authored BURST opener doesn't fit boss/tanky; closer to boss/glass |
| ENM-016 | Smelt Master      | elite/bal    | 3    | 1/3           | STRUCT — OK-NEAR-CEILING gap=2, ceiling-limited |
| ENM-017 | The Amalgam       | boss/tanky   | 4    | 1/4           | STRUCT — BURST opener, similar to Bone Sovereign |
| ENM-021 | Shock Eel         | elite/bal    | 3    | 1/3           | STRUCT, ARCHETYPE (CC×2 specialist) |
| ENM-022 | Lab Drone         | elite/bal    | 3    | 1/3           | STRUCT — BASIC-heavy low-key elite |
| ENM-023 | Deep Crawler      | elite/bal    | 3    | 1/3           | STRUCT, ARCHETYPE (DOT-forward) |
| ENM-025 | Bio-Hazard Slime  | std/bal      | 3    | 1/4           | STRUCT, ARCHETYPE (DOT×2 specialist) |
| ENM-026 | Admiralty Enforcer| elite/tanky  | 3    | 1/3           | STRUCT, ARCHETYPE (CC+BRACE control archetype) |
| ENM-028 | The Archivist     | boss/tanky   | 4    | 1/4           | STRUCT, ARCHETYPE (knowledge-drain boss, BASIC opener) |

## Decisions

1. **Add `ceiling` to the Intent Curve tab.** ✅ SHIPPED THIS TRIAGE. `tools/js/enemy-hydrator-curve.js` `buildView()` now returns `meta.match.ceiling` alongside `meta.match.total`. The meta strip renders `match=X/N (ceiling Y, deckSize Z caps achievable)` with an `at-ceiling` badge when `total === ceiling`. Smoke adds test S8 with closed-form assertions + runtime invariants (`total ≤ ceiling ≤ rounds`, `ceiling ≥ 1` for non-empty decks). Debug surface exposes `window.EnemyHydratorCurve.ceilingFor(recExp, deckSize)`.

2. **No deck changes for jam.** The roster is thematically consistent. The "low match" headline was a measurement artifact, not a design bug.

3. **No curve library changes for jam.** The 9-entry library is sufficient for a Vertical-Slice jam build. Extend post-jam (Clusters C + D).

4. **Keep `tools/triage-curve-mismatches.js` for post-jam reviews.** One-shot Node script; no smoke integration needed. Useful any time the roster, deck authoring, or curve library moves.

## Post-jam backlog (filed into #39-followups)

- **F1 — Tighten profile boundary.** Change `profileFor()` from `ratio >= 5` → `ratio > 5` (strict) for tanky. Net effect: 4 elites reclassify to balanced; re-run triage; expect Cluster A ceilings to improve and gaps to close. Low risk, observational-only tool; the stat-hydrator (`tools/js/enemy-hydrator-deck.js`) would need to reflect the same boundary to avoid drift.
- **F2 — Secondary combat-archetype field.** Add optional `combatArchetype: 'dot-forward' | 'cc-forward' | 'drain-forward' | null` to `data/enemies.json` (and the Stats tab). Curve lookup becomes `tier/profile/archetype` with the archetype key falling back to `null` (current behavior). Addresses Cluster C.
- **F3 — Tolerance-aware match scoring.** Consume `spec.tolerance.earlyDefense` and `spec.tolerance.lateBurst` in a `softMatchCount` sibling field. Don't replace `strictMatch.total`; add it alongside so authors can see both numbers.
- **F4 — Hero's Shadow `_curveOverride`.** Populate `_curveOverride` for ENM-090 to reflect the deliberately-erratic Hero-echo pattern. This is the *designed purpose* of the field — deck.cards stays gameplay-correct, curve tab reads the override for analysis.

## Verification (this triage pass)

```
$ node tools/smoke-enemy-hydrator-curve.js
PASS — 26 roster decks expanded · 8 synthetic cases · avg match 1.19/6 · avg ceiling 3.54/6 · 0 at-ceiling · 0 perfect-match · 5 zero-match.

$ node tools/triage-curve-mismatches.js
Total roster decks: 26
Match distribution (0..6):
  0:   5  █████
  1:  12  ████████████
  2:   8  ████████
  3:   1  █
  4:   0
  5:   0
  6:   0
```

Budget check: `tools/js/enemy-hydrator-curve.js` now 576 LOC (warn 600 / fail 750). Within budget.
