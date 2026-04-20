# Golf.UiUnificationAndRefillAudit — Day 1 End-of-Day Report

**Section:** Golf.UiUnificationAndRefillAudit
**Date:** 2026-04-20 (Mon, Day 1 of patch sprint)
**Sprint:** Voting-Period Patch (DOC-130)
**Ship gate:** 2026-04-25 EOD
**Audience:** Command.QaAndIntegration (approval required before Day 2 rename lands)

---

## 1. ACTION_MAP — Refill-Family Inventory

Five entries in `engine/interact-prompt.js` touch the refill family. All of them route through the `ACTION_MAP` object built in `init()` (lines 103–154).

| Line | Tile | Non-Gleaner action | Non-Gleaner icon | Gleaner verb | Gleaner icon | Hint key(s) |
|---|---|---|---|---|---|---|
| 114 | `TILES.CORPSE` | `interact.harvest` | *(empty)* | `interact.restock` | `🧪` | `hint.harvest` / `hint.restock` (135) |
| 115 | `TILES.BREAKABLE` | `interact.smash` | `🔨` | `interact.fill` | `📦` | `hint.smash` / `hint.fill` (137) |
| 123 | `TILES.TORCH_LIT` | `interact.extinguish` | `🔥` | `interact.refuel` | `🪵` | `hint.extinguish` / `hint.refuel` (146) |
| 124 | `TILES.TORCH_UNLIT` | `interact.refuel` | `🪵` | *(n/a — no class gate)* | — | `hint.refuel` (147) |
| 128 | `TILES.DUMP_TRUCK` | `interact.grab_hose` | `🧵` | *(n/a — no class gate)* | — | `hint.grab_hose` (154) |

**Verb count (refill family only):** 4 distinct verbs — `fill`, `restock`, `refuel`, `grab_hose`.
**Icon count (refill family only):** 4 distinct glyphs — `🧪`, `📦`, `🪵`, `🧵`.

**Out-of-family (correctly separate, leave alone per brief):** `interact.smash`, `interact.extinguish`, `interact.harvest`.

---

## 2. Consumer Sites — Blast Radius

### 2a. i18n string tables (`data/strings/**/*.js`)

| File | Key | Current value | Notes |
|---|---|---|---|
| `data/strings/en.js:261` | `interact.refuel` | `'Refuel Torch'` | Visible verb |
| `data/strings/en.js:263` | `interact.restock` | `'Restock'` | Visible verb |
| `data/strings/en.js:269` | `hint.restock` | `'Fill slots with matching items to seal.'` | Hint copy uses word "fill" |
| `data/strings/en.js:270` | `hint.restock_sealed` | `'Sealed; contributes to readiness.'` | No verb conflict |
| `data/strings/en.js:276` | `hint.refuel` | `'Add fuel to keep the torch lit.'` | |
| `data/strings/en.js:330` | `interact.grab_hose` | `'Grab Hose'` | |
| `data/strings/en.js:331` | `hint.grab_hose` | `'Drag the pressure-wash hose into the dungeon.'` | |
| `data/strings/es.js:118` | `interact.refuel` | `'Reabastecer Antorcha'` | |
| `data/strings/es.js:120` | `interact.restock` | `'Reabastecer'` | Already "Restock" == "Reabastecer" — ES is already unified. |
| `data/strings/hi.js` | — | — | No refill-family entries. Gaps. |
| `data/strings/ps.js` | — | — | No refill-family entries. Gaps. |

**Gap flagged:** `interact.fill` and `hint.fill` are referenced from ACTION_MAP but have **no i18n entries in any language**. The fallback in `interact-prompt.js:204` is `entry.action.split('.')[1]` — so Gleaner-class players currently see the lowercase word `"fill"` on a breakable crate. That is an existing bug that the unification pass fixes for free.

### 2b. Engine code consumers (hardcoded strings + key references)

| File:line | Symbol / context | Current string |
|---|---|---|
| `engine/corpse-peek.js:126` | `_actionBtn.textContent` (initial render) | `'Restock'` |
| `engine/corpse-peek.js:346` | `line2` subcopy | `'→ restock to reanimate'` |
| `engine/corpse-peek.js:350` | `btnLabel` (isRestock branch) | `'Restock'` |
| `engine/torch-peek.js:258` | `_actionBtn.textContent` | `isLit ? 'Extinguish' : 'Refuel'` |
| `engine/torch-peek.js:619` | `_actionBtn.textContent` (torch-state refresh) | `isLit ? 'Extinguish' : 'Refuel'` |
| `engine/chest-peek.js:751` | `btnLabel` | `demandRefill ? 'Restock' : 'Empty'` |
| `engine/crate-peek.js:888` | `_cpBtn` (action button) | `isStorage ? 'Open' : (isSupply ? 'Fill Crate' : 'Smash')` — **"Fill Crate" diverges from "Restock"** |
| `engine/restock-surface.js:401` | `labels.crate` (surface title) | `'📦 Restock Crate'` |
| `engine/restock-surface.js:402` | `labels.torch` (surface title) | `'🔥 Refuel Torch'` — **diverges from Restock naming** |
| `engine/restock-surface.js:403` | `labels.corpse` (surface title) | `'☠️ Restock Corpse'` |
| `engine/restock-surface.js:406` | i18n lookup | `'restock.title.' + _mode` — **keys not defined in any strings file; all three fall through to the `labels` map above** |
| `engine/hose-peek.js:131,150,183,187` | Toast copy | Uses `hose.grabbed`, `hose.already_carrying`, `hose.first_grab`, `hose.no_deployment` — these are status toasts, not the action verb. **Leave alone.** |

### 2c. Lore / dialogue / books (terminology consistency — NOT UI strings)

Out of scope for this rename pass, but noted so Command can see the terminology is already aligned in-world:

- `data/books.js` / `data/books.json`: 9+ hits on "Restock" (field manuals, dispatcher logs, delivery schedule titles). Already canonical in lore.
- `data/dialogue-trees.js` / `.json`: NPC dialogue uses "Restock traps" / "Restock before you scrub" as the natural profession verb.
- `data/barks/en.js`: Two "Restock" barks.
- `engine/npc-dialogue-trees.js`: mirrors `dialogue-trees.json` — same two hits.

**Conclusion: the lore layer is already 100% "Restock." The UI layer is fragmented — unifying UI onto "Restock" costs zero terminology rework elsewhere.**

### 2d. Summary count

| Layer | Unique call-sites | Files |
|---|---|---|
| ACTION_MAP (verb + icon + hint) | 5 entries × 3 fields ≈ 15 field-level edits | 1 (`interact-prompt.js`) |
| i18n verb/hint keys | 7 key definitions (en) + 2 (es) | 4 (`en.js`, `es.js`, `hi.js`, `ps.js`) |
| Engine hardcoded button labels | 7 literal-string sites | 5 (`corpse-peek.js`, `torch-peek.js`, `chest-peek.js`, `crate-peek.js`, `restock-surface.js`) |
| **Total blast radius** | **~22 edit sites across 10 files** | |

Zero of these edits touch engine interaction logic, action handlers, tile definitions, raycaster, door sprites, building-registry, tutorial mechanics, or any of Alpha/Charlie/Foxtrot/Hotel's surfaces. Pure rename.

---

## 3. Proposed Canonical Verb — **"Restock"**

### Recommendation
Canonical verb for the entire refill family (crate / corpse / torch / hose-grab): **`Restock`**.

### Rationale

1. **Zero-cost alignment with existing architecture.** The unified surface is already named `RestockSurface`, the bridge is `RestockBridge`, the wheel is `RestockWheel`, the audit doc is `RESTOCK_AUDIT.md`, the roadmap is `UNIFIED_RESTOCK_SURFACE_ROADMAP.md`. Picking any other verb forces a secondary rename cascade across ~40+ code-level identifiers. Picking "Restock" lands the UI on the same word the architecture already uses.
2. **The lore and NPC dialogue already say "Restock."** Books, dispatcher logs, field manuals, barks, and the game's profession tagline ("Restock traps, mop blood, reset the floors") all use "Restock." The player is canonically a *Restocker*. The UI should match the fiction the player is reading.
3. **Matches the research insight, one step upstream of the player's word.** The jam playtester called it "refilling stuff" — that is the player's descriptive word, but "Restock" is the in-fiction job title. Teaching the player the job verb ("Restock") on first interaction is a better discovery cue than echoing their descriptive word back ("Refill").
4. **Rejected alternatives:**
   - **"Refill"** — too generic; grammatically reads fine on a torch but awkward on a corpse (*"Refill Corpse"* reads like a body-horror typo). Also requires flipping the entire architecture's naming.
   - **"Load"** — military/truck/shipping connotation; tonally wrong for a fantasy dungeon cleanup crew. Would read as "Load Corpse" with coffin glyphs — unintentionally menacing.
   - **"Top Up"** — too British-casual, poor fit for controller-remote button rendering at 60px.

### Class-gating stays invisible
Confirmed the Gleaner-vs-non-Gleaner split is strictly about *affordance* (what happens when you press OK), not *terminology*. Under the new scheme, both classes see **"Restock"** on crate / corpse; only the underlying action handler differs. Torch-lit still special-cases to "Extinguish" for non-Gleaners (that's out-of-family — not touching).

---

## 4. Proposed Canonical Icon — **📦**

### Recommendation
Canonical glyph for the entire refill family: **`📦`** (package/box, U+1F4E6).

### Rationale

1. **Reads as "stocked container" universally** — whether the player is facing a crate (literal box), a corpse (box of trap materials), a torch (box of fuel rods), or the supply truck (box of hose supplies), 📦 communicates "there's stock here that needs topping up."
2. **Already the canonical glyph on `RestockSurface.labels.crate`** — the unified surface's crate title is `📦 Restock Crate`. Inheriting this for the in-world interact prompt is consistent.
3. **Rejected alternatives:**
   - `🧪` (potion) — only reads on corpse and only because of the harvest/viscera associations. Meaningless on crate/torch/hose.
   - `🪵` (log) — fuel-specific. Crate ≠ wood; corpse ≠ wood.
   - `🧵` (thread/spool) — currently on DUMP_TRUCK; does not read as "hose" or as "supply." Worst of the four — not retained.
   - New glyph proposal considered: `♻️` (recycle), `🔄` (refresh), `⬆️` (up-arrow). All tested worse — recycle reads as trash, refresh reads as puzzle reset, up-arrow reads as stairs.

### Class-gated icon fallback
For BREAKABLE tiles, non-Gleaners see `🔨` (smash) — out of family, unchanged. For TORCH_LIT, non-Gleaners see `🔥` (extinguish) — unchanged. CORPSE non-Gleaner currently has empty icon — propose leaving empty to preserve the solemn "face a body" beat (or backfill with `👤`/`⚰️` in a later sprint — NOT this one).

---

## 5. Day 2 Effort Estimate — **≤ 0.75 section-day (comfortable fit inside Tuesday)**

### Work breakdown

| Step | Est. | Files |
|---|---|---|
| 1. Rewrite ACTION_MAP entries on lines 114, 115, 123, 124, 128 (verbs → `interact.restock`, icons → `📦`; retain distinct hint keys for per-tile context) | 15 min | `engine/interact-prompt.js` |
| 2. Consolidate/remove obsolete i18n keys (`interact.fill`, `interact.refuel`, `interact.grab_hose`, `interact.restock`) — collapse to single `interact.restock = 'Restock'`; deprecate `interact.fill`/`interact.refuel`/`interact.grab_hose` with alias comments | 20 min | `data/strings/en.js`, `data/strings/es.js` |
| 3. Keep per-tile **hint** keys distinct (`hint.restock`, `hint.refuel`, `hint.grab_hose`) — the *verb* unifies, but the *hint line* should still give tile-specific guidance (e.g. torch still needs "Add fuel to keep the torch lit"). This is a feature, not a bug. | 10 min | `data/strings/en.js` |
| 4. Rewrite 7 hardcoded button labels: `corpse-peek.js:126,350`, `torch-peek.js:258,619` (replace "Refuel" with "Restock"), `chest-peek.js:751`, `crate-peek.js:888` (replace "Fill Crate" with "Restock"), `restock-surface.js:402` (replace "🔥 Refuel Torch" with "📦 Restock Torch") | 25 min | 5 files |
| 5. Add the 3 missing `restock.title.*` i18n keys so the surface title can be localized (en + es) | 10 min | `data/strings/en.js`, `es.js` |
| 6. Smoke test in tutorial world: approach crate, corpse, torch (lit + unlit), dump truck; confirm prompt text + icon consistent across all five tiles; confirm seal/harvest flow still routes correctly | 45 min | manual playtest |
| 7. Diff review + one commit with inventory-style message referencing this audit | 15 min | — |
| **Total** | **~2h20m** | **~10 files** |

Comfortable fit for Day 2 (Tue 2026-04-21). No spill into Day 3. Leaves Tue headroom for Hotel's seam check per dispatch schedule, and Wed's Hotel handoff is unblocked.

### Rollback plan
Single-commit rename. Revert = `git revert HEAD`. No save-state migrations, no i18n key deletions that would break existing-language fallbacks (we keep the old `interact.fill`/`interact.refuel`/`interact.grab_hose` keys aliased for one sprint before pruning — defensive against any callsite we missed).

---

## 6. Borderline Verbs — Flagged for Future Sprint (NOT this sprint)

Per the brief, these are semantically-adjacent verbs that are *candidates* for later unification but **stay untouched** in this patch:

| Verb | Current string | Why borderline | Recommendation for next sprint |
|---|---|---|---|
| `interact.rearm` | `'Re-arm trap'` (en) / `'Rearmar trampa'` (es) | Semantically re-stocking a trap with its missing trigger material. Player mental model: "top up the trap." **Strongest future-unification candidate.** | Consider folding into Restock in post-patch sprint once Hotel's tutorial video shows whether players confuse "Re-arm" with "Restock." If they do → unify. If the distinction carries weight (trap is binary armed/unarmed vs crate's graded fill) → keep separate. |
| `interact.grab_hose` | `'Grab Hose'` → becoming `'Restock'` this sprint | This one **is** being unified now, but flagged because semantically the truck is a *tool pickup*, not a container top-up. If the playtester regression video shows confusion ("why does the truck say Restock when I'm grabbing a hose?"), the fallback is to split it back out with a dedicated `interact.pickup_tool` verb in a post-patch hotfix. | Watch the Hotel playthrough video (Fri 2026-04-24) for player reaction. Pre-commit rollback path ready. |
| `interact.check_mail` (mailbox) | `'Check Mailbox'` | Reading hero run reports — adjacent to "read" (bookshelf) more than to refill. Not a refill. | Leave out of refill family. Candidate for future unification with `interact.read` if the bookshelf and mailbox UIs ever merge. |
| `interact.pick_up` (DETRITUS tile) | `'Pick Up'` + 👝 | Single-item grab off the floor, not a container. Not a refill. | Leave alone. |
| `demandRefill` (internal crate flag, `crate-system.js`) | code-only boolean | Internal state — not user-facing. | Can optionally rename to `demandRestock` in a later code-hygiene pass to match architecture naming, but zero user-visible impact. Defer. |

---

## 7. Questions for Command before Day 2 commit

1. **Approve `"Restock"` as canonical verb?** (Sprint plan Monday-row pre-hinted this choice; asking explicit confirmation per brief.)
2. **Approve `📦` as canonical icon?**
3. **Approve keeping per-tile distinct *hints* (different second-line copy per tile) while unifying verb + icon?** Rationale: the verb is the discoverability lever; the hint is contextual helper text, and losing per-tile specificity there would regress player guidance.
4. **Approve the one-sprint aliasing of `interact.fill` / `interact.refuel` / `interact.grab_hose`** (keep the keys as aliases pointing to `'Restock'` for this patch; delete in next sprint)? Alternative: delete immediately. I recommend alias — defensive against any callsite missed in the grep.

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hardcoded `'Refuel'` or `'Restock'` string in a file I didn't grep (build script, test harness, debug overlay) | Low-med | Grep pass on Day 2 pre-commit with broader patterns (`\bRefuel\b`, `\bRestock\b`, `\bFill Crate\b`); cross-check against `tools/`, `scripts/`, `debug/`. |
| Playtester reaction to `Restock` at the dump truck reads as "wrong" | Low | Pre-agreed rollback path documented in §6. Hotel's Fri playthrough video is the acceptance test (sprint-plan DoD). |
| Hindi / Pashto locales don't have any refill-family strings at all → rename widens existing i18n gap | Known existing gap (not regression) | Out of scope for Golf. Flag for i18n localization backlog. |

---

## 9. Status

- [x] Audit ACTION_MAP refill-family entries
- [x] Grep i18n keys + consumer sites across `engine/` + `data/`
- [x] Propose canonical verb + icon with rationale
- [x] Estimate Day 2 rename effort
- [x] Flag borderline verbs for future sprint
- [ ] **BLOCKED on Command approval** before landing the rename

**Ready to execute Day 2 (Tue 2026-04-21) on Command sign-off.** Awaiting green light on (a) verb = Restock, (b) icon = 📦, (c) per-tile hint retention, (d) one-sprint alias deprecation window.

---

*— Golf.UiUnificationAndRefillAudit, EOD 2026-04-20*

---

## Addendum — Day 2 Rename Landed (same-day on Command green light)

**Command approval received 2026-04-20 same-day** on (a) verb = **Restock**, (b) icon = **📦**, (c) per-tile hints retained. Option (d) deprecation window was not explicitly addressed — proceeded with the recommended defensive alias (DEPRECATED keys point to 'Restock'; prune next sprint).

### Files edited

| # | File | Change |
|---|---|---|
| 1 | `engine/interact-prompt.js` | ACTION_MAP lines 114/115/123/124/128: verbs → `interact.restock`, icons → `📦`. Hint map line 137: `hint.fill` (undefined) → `hint.restock`. Per-tile torch/hose hints preserved. |
| 2 | `data/strings/en.js` | Promoted `interact.restock: 'Restock'` to canonical; demoted `interact.refuel` / `interact.fill` to aliased 'Restock' with DEPRECATED comment; `interact.grab_hose` aliased at its original block. Added 3 new `restock.title.{crate,torch,corpse}` keys for surface titles. |
| 3 | `data/strings/es.js` | Mirrored en.js: canonical `interact.restock: 'Reabastecer'`; DEPRECATED aliases for `refuel`/`fill`/`grab_hose`. Added Spanish `restock.title.*` keys. |
| 4 | `engine/torch-peek.js` | Lines 258, 619: `'Refuel'` → `'Restock'` in both `textContent` assignments. |
| 5 | `engine/crate-peek.js` | Line 888: `'Fill Crate'` → `'Restock'`. |
| 6 | `engine/restock-surface.js` | Line 402: `'🔥 Refuel Torch'` → `'🔥 Restock Torch'` (surface title). Mode icon preserved — player is already inside the mode-specific surface; in-world prompt uses canonical 📦. |

**Untouched (verified no change needed):** `engine/corpse-peek.js` (already 'Restock'), `engine/chest-peek.js` (already 'Restock'), `engine/hose-peek.js` (toast copy, not action verb — not in refill family semantically per the brief).

### Defensive grep sweep (post-edit)

```
rg -n "\b(Refuel|Fill Crate|Grab Hose)\b" engine/
```
Only match: the inline comment `'Fill Crate' → 'Restock' per GOLF_DAY1_AUDIT.md` in `crate-peek.js:888` — a deliberate breadcrumb. Zero live literals remain.

```
rg -n "interact\.(fill|refuel|grab_hose)" engine/
```
Zero matches in engine. Keys only survive as deprecated aliases in `data/strings/{en,es}.js` — correct.

### Out-of-scope fallout flagged

- `tools/string-index.json:202,257` still references old labels (`"Refuel Torch"`, `"Grab Hose"`). This is an **auto-generated build artifact** (header: `"generated": "2026-04-14..."`, `"source": "data/strings/en.js"`). Will regenerate on next build run; no hand-edit needed. Flagging so India.PatchBuildGate can re-run the string-index regenerator as part of the stamp step.
- `data/strings/hi.js` and `data/strings/ps.js` still have zero refill-family entries — pre-existing i18n gap, unchanged. Logged for localization backlog.

### Smoke-test readiness (Tue 04-21 → Wed 04-22 Hotel handoff)

Manual playtest checklist for Tue morning:

1. Spawn in tutorial world.
2. Walk up to a **breakable crate** as Gleaner → confirm prompt reads `📦 Restock`.
3. Walk up to a **corpse** (unsealed) as Gleaner → confirm prompt reads `📦 Restock`.
4. Walk up to a **lit torch** as Gleaner → confirm prompt reads `📦 Restock`.
5. Walk up to an **unlit torch** (any class) → confirm prompt reads `📦 Restock`.
6. Walk up to the **dump truck** → confirm prompt reads `📦 Restock`.
7. Press OK on crate → RestockSurface opens with title `📦 Restock Crate`.
8. Press OK on torch → RestockSurface opens with title `🔥 Restock Torch` (was `Refuel Torch`).
9. Press OK on corpse → RestockSurface opens with title `☠️ Restock Corpse`.
10. In-peek button labels: confirm `torch-peek` shows `Restock` (not `Refuel`); `crate-peek` shows `Restock` (not `Fill Crate`); `corpse-peek` shows `Restock`; `chest-peek` (D3+ `demandRefill` chest) shows `Restock`.
11. Non-Gleaner class on same tiles: confirm Smash/Extinguish/Harvest preserved on crate/lit-torch/corpse respectively; Restock preserved on unlit-torch and truck (no class gate on those).
12. Hint line spot-check: torch hint still reads `"Add fuel to keep the torch lit."`; truck hint still reads `"Drag the pressure-wash hose into the dungeon."`; crate/corpse hint reads `"Fill slots with matching items to seal."` (unified under `hint.restock`).

### Rollback plan (unchanged)

Single logical commit: `git revert HEAD`. No save-state migrations, no tile-defs touched, no action handlers modified. The deprecated i18n aliases mean any missed callsite still renders `'Restock'` instead of breaking.

### Status

- [x] Day 1 — audit + proposal (this doc §1–§8)
- [x] Day 2 — ACTION_MAP updated
- [x] Day 2 — i18n reconciled (en + es)
- [x] Day 2 — hardcoded button labels updated
- [x] Day 2 — restock-surface title unified
- [x] Day 2 — defensive grep sweep clean
- [ ] Day 2 — manual smoke test (tutorial-world playthrough) — to be run Tue morning
- [ ] Handoff to Hotel.TutorialInteractionPolish (unblocked) — terminology now consistent for their Wed pressure-wash loop + Thu interaction smoke tests

Ready for Command's seam-watch pass. No Foxtrot/Alpha/Charlie/Hotel territory touched.

*— Golf.UiUnificationAndRefillAudit, same-day Day 2 close-out 2026-04-20*
