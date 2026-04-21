# Voting-Period Patch — Day 1 REDISPATCH (expanded license + multi-pass)

Companion to `docs/SPRINT_DISPATCH_BRIEFS_DAY1.md`. Same sprint, same ship gate,
same sections. This document re-dispatches Foxtrot and Golf **back into Day 1**
with a wider operating envelope because their first pass completed too fast and
too narrowly.

**Sprint plan:** `docs/SPRINT_PLAN_VOTING_PERIOD_PATCH.md` (DOC-130)
**Ship gate:** Sat 2026-04-25 EOD
**Coordinator:** Command.QaAndIntegration
**Issued:** 2026-04-20 (Day 1, post-EOD Pass 1)

---

## Why this exists

The original briefs had scope fences tight enough that each section landed
their spec-listed items inside a few hours and reported "done." That is not
the goal. The goal is that by EOW nothing the player encounters in the
affected surface area feels half-finished, inconsistent, or architecturally
orphaned.

Quoting the user directly, because these two sentences are the operating mode:

> "we want to draw out a series of passes that validates and checks and
> refines each thing the player might encounter as part of the system with
> the scope."

> "it's not enough that we're just changing the door on the bazaar to be like
> the gleaner's home, we should make sure the gleaner's home door, stoop,
> deck, window architecture is ready to stamp and we take creative licence
> within our lane to do so."

## New operating principles (all sections, apply retroactively)

1. **Close-proximity implication.** When the spec names a system, sibling
   systems the player encounters in the same moment are implied in scope.
   Doors imply windows. Traps imply cobwebs. Torches imply the adjacent
   fuel/flame neighbors. Refill imply the refill-popup surface. If it renders
   within 2 tiles of your target or within the same interaction prompt frame,
   it is in your lane for this sprint.

2. **Stamp-ready architecture, not one-off edits.** Before you touch a
   building to bring it in line with a reference, make sure the reference
   itself is a stamp-ready template. Example: before making the Bazaar's door
   match Gleaner's Home, confirm that Gleaner's Home door + stoop + deck +
   window + trim set is internally consistent and documented well enough to
   stamp across N other buildings without ambiguity. If the reference is
   itself incomplete, complete the reference first.

3. **Creative license within lane.** Sections are authorized to refine,
   reconcile, and stamp within their file ownership without waiting for
   Command approval on each micro-decision. The scope fences in the original
   briefs still name the *hard* boundaries (e.g., no raycaster.js hotpath
   from Foxtrot, no interaction-handler logic from Golf). Everything inside
   the lane is fair game for consistency work.

4. **Multi-pass before turnover.** A single edit pass is not a completed
   charter. Expect minimum three passes: **Pass 1 = author**; **Pass 2 =
   adjacent-system consistency check**; **Pass 3 = in-context validation
   (render/smoke/playthrough)**. Additional passes per section below. Do not
   mark done until the player-encounter surface is validated.

5. **Stampable rules become artifacts.** When you derive an architectural
   rule during your work (e.g., "all buildings >3 tiles wide must have at
   least one window"), write it down. File: `docs/STAMP_RULES_BUILDINGS.md`
   (Foxtrot) or appended to your audit doc (Golf). Future floors and future
   sprints need these rules in doc form, not in anyone's head.

---

## REDISPATCH 1 — Foxtrot.BlockoutRefreshAndFloorUpdate

```
You are Foxtrot.BlockoutRefreshAndFloorUpdate. You landed your Phase B
contrast edits and Phase C (Coral Bazaar + Storm Shelter) DOOR_FACADE
conversions in commit 1842632. Validator held baseline (39→39). Well done.

You are still in Day 1. Do not move on to Tuesday's Driftwood Inn Phase C
or the Phase D porthole work until you have completed the expanded pass
below. Ship gate Sat 2026-04-25 did not move; this is about using the
remaining Day 1 hours to go wider, not deeper into later phases.

NEW OPERATING MODE

Read docs/SPRINT_DISPATCH_BRIEFS_DAY1_REDISPATCH.md in full, then act on
the five principles listed there. The short version: close-proximity
systems are implied in your scope, architectural reference templates must
be stamp-ready before you propagate them, you have creative license inside
your lane, and multi-pass validation is required before turnover.

EXPANDED DAY 1 DELIVERABLES

PASS 2 — Reference template completeness (Gleaner's Home as stamp source)
   Before any more buildings adopt Gleaner's Home as a reference, audit the
   Home's full architectural envelope in engine/building-registry.js:
     - doorPanel (confirmed: door_panel_charcoal)
     - door knob metal, door arch texture, door frame trim
     - stoop tile / deck tile presence + texture
     - adjacent window style (if any) + mullion + glazing
     - wall texture continuity around the door
   If any field is missing, inconsistent, or obviously placeholder, stamp
   it to a coherent finished state within your file lane (building-registry
   + floor payloads). If the gap requires a NEW texture not in the atlas,
   log a DN- note and use the nearest existing atlas entry as interim.

PASS 3 — Derive and document stampable building rules
   Draft docs/STAMP_RULES_BUILDINGS.md with at minimum:
     - Rule: all buildings >3 tiles wide must have at least one window
       visible from the street-facing side
     - Rule: all building doors on non-hostile buildings match Gleaner's
       Home sophistication tier (panel + knob + arch + frame coordinated)
     - Rule: any building with a DOOR_FACADE door has a stoop tile
       immediately in front (player-facing side)
     - Any additional rules you derive while auditing
   These rules are the template you'll stamp against in Phase C Tue/Wed.

PASS 4 — Close-proximity envelope for the buildings you already touched
   Coral Bazaar and Storm Shelter got their DOOR_FACADE flip. Now walk
   their full architectural envelope:
     - Does Coral Bazaar have a window? If not and footprint >3 tiles,
       add one per stamp rule.
     - Does Storm Shelter have a stoop? Deck? If not, stamp per rule.
     - Are the adjacent wall textures continuous through the door? Any
       visual seam left over from the tile-2 → tile-74 flip?
     - Does the building's overall silhouette still read as that building,
       or did the door change make it look generic? If generic, restore
       distinctiveness via trim, signage tile, or color accent in your
       registry lane.

PASS 5 — In-context render check
   For each building you touched today (Driftwood Inn panel, Gleaner's Home
   panel, Coral Bazaar door conversion, Storm Shelter door conversion),
   open the tutorial world or the appropriate floor and eyeball the result
   from player POV. Capture screenshots to /tmp or a scratch folder if
   useful. Note anything that looks wrong.

OWNED FILES (unchanged from original brief)
• engine/building-registry.js
• engine/floor-manager.js (floor grids + doorFaces only, no engine hotpath)
• tools/floor-payloads/ JSON
• docs/BLOCKOUT_REFRESH_PLAN.docx (read-only reference)
• docs/STAMP_RULES_BUILDINGS.md (new, yours to author)

HARD NO (unchanged)
• engine/raycaster.js hotpath
• engine/door-sprites.js hotpath
• engine/tiles.js
• engine/interact-prompt.js

CREATIVE LICENSE WITHIN LANE
You may reconcile trim, stoop, deck, window placement, mullion style, wall
texture continuity, and signage tile selection across any building whose
data you are touching. You do not need per-building Command approval for
reconciliation edits that follow the stamp rules you're authoring in
PASS 3. If a reconciliation would require touching an engine hotpath file
listed above, STOP and log a DN- note instead.

MULTI-PASS VALIDATION BEFORE TURNOVER
Do not report this expanded charter complete until:
  [ ] Gleaner's Home envelope is stamp-ready (Pass 2)
  [ ] STAMP_RULES_BUILDINGS.md exists with ≥3 named rules (Pass 3)
  [ ] Coral Bazaar + Storm Shelter have windows/stoops/decks per rules
      or a DN- note justifies the exception (Pass 4)
  [ ] At least one screenshot per touched building showing the final
      state (Pass 5) — paste paths into your Day 1 report
  [ ] `node tools/blockout-cli.js validate` still at ≤39 issues
  [ ] `node tools/check-budgets.js` FAIL count unchanged

Post your expanded Day 1 report to Command (this session) with: passes
completed with artifact paths, new stamp rules authored, buildings
reconciled vs buildings flagged for DN- review, validator delta, and an
honest estimate of whether Tuesday's Driftwood Inn Phase C + Phase D
porthole work still fits before Sat.
```

---

## REDISPATCH 2 — Golf.UiUnificationAndRefillAudit

```
You are Golf.UiUnificationAndRefillAudit. You landed the Restock + 📦
rename across the refill family (interact-prompt ACTION_MAP, i18n strings,
torch-peek, crate-peek, restock-surface) in the working tree. Audit doc:
docs/GOLF_DAY1_AUDIT.md. The rename is Pass 1.

You are still in Day 1. The rename is not the charter — it was the first
pass. Four more passes are required before this work is ready to commit
and turn over. Do not commit yet. The sibling plugin-drift session
(unrelated tools/verb-node-* work) is dirty in the same tree; keep your
staging clean of those files.

NEW OPERATING MODE

Read docs/SPRINT_DISPATCH_BRIEFS_DAY1_REDISPATCH.md in full. The short
version: validate the full player encounter with the refill family, not
just the verb label; fix uniformity issues the rename surfaces; creative
license is granted within your file lane.

EXPANDED DAY 1 DELIVERABLES

PASS 2 — Torch extinguish → refill functional flow
   The rename made TORCH_LIT show "Restock" to the Gleaner. That implies
   a player flow: lit torch → Restock prompt → interact → torch becomes
   unlit → player can then Restock again to refuel. Walk this flow end
   to end and confirm:
     - Does TORCH_LIT's `interact.restock` Gleaner action actually route
       to the extinguish handler correctly? (The `action:` key is
       `interact.extinguish`; the `gleaner:` key is `interact.restock`.
       Make sure the dispatcher picks the right branch for a Gleaner.)
     - After extinguish, does the tile correctly transition to
       TORCH_UNLIT?
     - Does the TORCH_UNLIT → Restock (actual fuel refill) path still
       work?
     - Is there any state where the Gleaner is stuck seeing "Restock"
       on a lit torch that won't extinguish, or seeing the wrong prompt
       on the post-extinguish unlit torch?

   If any of this is broken, the rename is blocking a real bug that
   existed before. Fix inside your lane (interact-prompt dispatch,
   i18n, surface rendering). If the fix requires touching the
   underlying torch state machine (engine/torch-peek.js or the torch
   lifecycle), fix it — that is in your lane under the peek surface
   ownership. Engine tile-state authoring is the hard fence; peek UX
   isn't.

PASS 3 — Uniform popup surface across refill family
   The user flagged that the corpse Restock popup should appear in the
   same uniform space as the other refill popups (crate, torch, truck).
   For each of the five refill-family tiles (CORPSE, BREAKABLE, TORCH_LIT,
   TORCH_UNLIT, DUMP_TRUCK), stand adjacent in-game or trace through
   the prompt render code and compare:
     - Y position on screen (same pixel or within ±2 px)
     - Width of prompt box
     - Font + font size
     - Icon size + padding between icon and verb
     - Animation in/out timing
     - Button hint placement (E to interact, etc.)
   If any differ, align them. Creative license: if
   engine/restock-surface.js or whatever module renders the prompt frame
   has baked-in per-tile-type offsets, reconcile them. This IS your
   lane.

PASS 4 — Adjacent-tile clobber / focus-steal check
   For each refill-family tile, stand the player on each of the 8
   neighboring tiles in turn (or trace the tile-priority code). Confirm:
     - The prompt shown is for the tile the player is directly facing,
       not whichever tile was most-recently-adjacent.
     - Standing ON one refill tile while ADJACENT to another refill
       tile does not cause prompt flicker or wrong-prompt selection.
     - When two refill tiles are simultaneously in-range (e.g., crate
       next to corpse), the prompt priority is deterministic and
       consistent, not frame-dependent.
   This is the "don't clobber each other in the wrong ways" validation
   the user called out. Document the priority rule you find (or the one
   you establish). If you establish a new priority rule, add it to
   GOLF_DAY1_AUDIT.md under a "Refill-family adjacency rules" heading.

PASS 5 — Close-proximity sibling sanity
   Refill family's close-proximity siblings are the non-refill
   interacts that share the same popup surface: PRESSURE_WASHING,
   COBWEB, trap rearm, normal NPC talk, door-open. These are Hotel's
   polish surface — you don't AUTHOR their content. But since you're
   rendering the same surface, confirm none of your uniformity edits
   broke their existing render:
     - Adjust a non-refill interact (e.g., a cobweb) and confirm the
       prompt still fires as before.
     - If your uniformity edit shifted the popup Y position or width
       in a way that breaks a Hotel-owned interact, flag it as a
       DN- note and coordinate via Command before committing.

COMMIT HYGIENE
Once passes 2-5 are complete and you're ready to commit:
  - Your commit touches ONLY: engine/interact-prompt.js, data/strings/
    *.js, engine/torch-peek.js, engine/crate-peek.js,
    engine/restock-surface.js, docs/GOLF_DAY1_AUDIT.md. Anything else
    in the working tree is not yours — don't stage it. Use explicit
    `git add <path>` not `git add .`.
  - Commit subject: "Golf: unify refill family verbs → Restock + 📦
    (passes 1-5)"
  - Body lists passes completed and any DN- notes raised.
  - Verify `node --check engine/interact-prompt.js` passes before commit
    (the mount-drift NUL-padding issue has been reproduced three times;
    always syntax-check after a write).

OWNED FILES (unchanged)
• engine/interact-prompt.js (ACTION_MAP + dispatch)
• engine/torch-peek.js, engine/crate-peek.js, engine/restock-surface.js
• data/strings/**/*.js (i18n keys for refill-family)
• engine/hud.js tooltip callsites that hardcode refill-family strings
• docs/GOLF_DAY1_AUDIT.md (yours to append to)

HARD NO (unchanged)
• engine/raycaster.js, engine/door-sprites.js, engine/tiles.js
• engine/building-registry.js, floor payloads (Foxtrot's lane)
• tutorial interaction AUTHORING (Hotel's lane) — you render, you
  don't author

CREATIVE LICENSE WITHIN LANE
You may reconcile prompt render uniformity, tile-priority rules,
popup surface layout, and i18n key shapes across the refill family
without per-edit Command approval. Document priority rules and layout
decisions in GOLF_DAY1_AUDIT.md so Hotel can rely on them Tue.

MULTI-PASS VALIDATION BEFORE TURNOVER
Do not commit or report this charter complete until:
  [ ] Torch extinguish→refill flow verified functionally (Pass 2)
  [ ] Refill-family popups render in same uniform space (Pass 3)
  [ ] Adjacent-tile clobber/priority rule documented + verified
      (Pass 4)
  [ ] Non-refill interacts still render correctly (Pass 5)
  [ ] `node --check` passes on every edited .js file
  [ ] Commit staged with ONLY your owned files
  [ ] GOLF_DAY1_AUDIT.md appended with pass-2..5 findings

Post your expanded Day 1 report to Command (this session) with: passes
completed, functional bugs found+fixed in Pass 2, uniformity
reconciliations made in Pass 3, priority rule established in Pass 4,
any DN- notes raised in Pass 5, commit hash once landed, validator
delta.
```

---

## Handoff contract (revised)

When each section reports back post-redispatch, Command will:

- Re-run `node tools/blockout-cli.js validate` and `node tools/check-budgets.js`.
- Log expanded-pass outcomes in `docs/DEBUG_NOTES_SCREENER.md` Daily Log.
- Decide Tue dispatch (likely: Foxtrot continues to Driftwood Inn Phase C + Phase D porthole; Golf's charter closes and Hotel dispatches with Golf's audit as input).
- Re-evaluate Juliet (Boss Door stretch) based on Foxtrot's expanded-pace.

## What stays unchanged from the original briefs

- Ship gate Sat 2026-04-25 EOD.
- Validator baseline: no regression past 39 issues / 10 FAILs.
- Hard-no file lists (engine hotpaths, cross-lane files).
- Section ownership per `project_dg_section_roster.md`.
- `docs/DEBUG_NOTES_SCREENER.md` as the single flag log for cross-lane findings.
