# Voting-Period Patch — Day 1 Dispatch Briefs

Paste each brief into a fresh Cowork session. Each brief is self-contained — the receiving agent has no conversation context from the sprint kickoff.

**Sprint plan:** `docs/SPRINT_PLAN_VOTING_PERIOD_PATCH.md` (DOC-130)
**Ship gate:** Sat 2026-04-25 EOD
**Coordinator:** Command.QaAndIntegration (this session)
**Baseline validator state (2026-04-20):** 39 issues on `bo validate` (18 err / 21 warn); `check-budgets.js` exit=1 with 10 pre-existing FAIL entries. Don't regress any of these; Command tracks the delta.

---

## Brief 1 — Foxtrot.BlockoutRefreshAndFloorUpdate

```
You are Foxtrot.BlockoutRefreshAndFloorUpdate, a Cowork section on the Dungeon
Gleaner repo (Dev\Dungeon Gleaner Main). Your charter is Phases B–D of
docs/BLOCKOUT_REFRESH_PLAN.docx plus a per-floor §7 update pass across floors 0
through 3.1.N. You have 3–4 sprint-days; ship gate is Sat 2026-04-25.

CONTEXT
• Patch-sprint plan: docs/SPRINT_PLAN_VOTING_PERIOD_PATCH.md (DOC-130)
• BLOCKOUT_REFRESH_PLAN.docx is a Word doc — read via
  `pandoc "docs/BLOCKOUT_REFRESH_PLAN.docx" -t markdown` (anthropic-skills:docx
  skill is available; use it before editing).
• Floors 0 through 3.1.N already exist but are in pre-refactor states. Your §7
  pass is an UPDATE checklist per floor — not a rebuild, not net-new floor
  creation. Do not resize grids or author new floor files.

DAY 1 DELIVERABLES (Mon 2026-04-20)
1. Phase B: BuildingRegistry contrast updates for Driftwood Inn and Gleaner's
   Home. Update doorPanel fields only; do not touch door-sprites.js engine
   hotpath.
2. Phase C kickoff: convert Coral Bazaar and Storm Shelter to DOOR_FACADE
   (doorFaces + DoorSprites.setTexture + doorTargets wiring). Driftwood Inn
   Phase C conversion lands Tue. Registry/data edits only.
3. Report EOD: which of Phase B / Phase C buildings landed clean, any
   engine-side blockers on DOOR_FACADE conversion discovered, and an honest
   estimate of whether you're on pace for Phase D (Wolfenstein porthole
   extension) to start Tue.

OWNED FILES
• Data/registry: engine/building-registry.js, floor payload JSON under
  tools/floor-payloads/
• Spec: docs/BLOCKOUT_REFRESH_PLAN.docx, docs/DOOR_ARCHITECTURE_ROADMAP.md §Ph 3

HARD SCOPE FENCES
• Do NOT edit engine/door-sprites.js hotpath — that is Alpha's engine file.
  Registry data + doorFaces config only.
• Do NOT rebuild or resize floor grids. Work against existing floor states.
• Do NOT touch engine/raycaster.js (Alpha/Charlie territory, serialized).
• Do NOT touch interact-prompt.js or any interaction UI (Golf's surface).
• If you encounter what looks like a systemic bug, log it to
  docs/DEBUG_NOTES_SCREENER.md and keep moving. Don't authoring-fix.

DEFINITION OF DONE (sprint-end)
• Phases B, C, D of BLOCKOUT_REFRESH_PLAN.docx shipped
• Every floor 0 → 3.1.N checked against §7 checklist; per-floor checkbox
  log added to docs/DEBUG_NOTES_SCREENER.md
• `node tools/blockout-cli.js validate` does not regress the 39-issue baseline
• `node tools/check-budgets.js` does not add any FAIL entries

FIRST MOVE
Read docs/SPRINT_PLAN_VOTING_PERIOD_PATCH.md, then load the docx skill and
read BLOCKOUT_REFRESH_PLAN.docx. Then grep engine/building-registry.js for
"Driftwood Inn" and "Gleaner's Home" to locate the panels you'll edit. Do
NOT start editing until you've confirmed the contrast matrix targets from
Phase B in the docx.

Post your Day 1 end-of-day report back to Command (this session) with:
  - Commits landed (hashes + one-line subject each)
  - Validator state (`bo validate` issue count delta vs 39-baseline)
  - Blockers or engine-side questions for Command
  - Whether Juliet (Boss Door stretch) is plausible based on your pace
```

---

## Brief 2 — Golf.UiUnificationAndRefillAudit

```
You are Golf.UiUnificationAndRefillAudit, a Cowork section on the Dungeon
Gleaner repo (Dev\Dungeon Gleaner Main). Your charter is resolving the peer
feedback flagged during voting: refill-family interactions use inconsistent
verbs and icons, hurting discoverability. You unify the vocabulary across
crate / corpse / torch / hose. You have 2–3 sprint-days; ship gate is
Sat 2026-04-25.

CONTEXT
• Patch-sprint plan: docs/SPRINT_PLAN_VOTING_PERIOD_PATCH.md (DOC-130)
• The inconsistency lives primarily in engine/interact-prompt.js ACTION_MAP:
    ACTION_MAP[TILES.CORPSE]      = { ..., gleaner: 'interact.restock', gleanerIcon: '🧪' };
    ACTION_MAP[TILES.BREAKABLE]   = { ..., gleaner: 'interact.fill',    gleanerIcon: '📦' };
    ACTION_MAP[TILES.TORCH_LIT]   = { ..., gleaner: 'interact.refuel',  gleanerIcon: '🪵' };
    ACTION_MAP[TILES.TORCH_UNLIT] = { action: 'interact.refuel',        icon: '🪵' };
    ACTION_MAP[TILES.DUMP_TRUCK]  = { action: 'interact.grab_hose',     icon: '🧵' };
  Four different verbs, four different icons, for what players perceive as
  "top this thing up."
• Class-gating (Gleaner vs non-Gleaner) should stay invisible to the player:
  non-Gleaners still see the same verb, they just get the non-Gleaner action
  when they press. Only affordance availability differs — never terminology.

DAY 1 DELIVERABLES (Mon 2026-04-20)
1. Full audit:
   - List every ACTION_MAP entry in engine/interact-prompt.js touching
     refill-family actions (fill / restock / refuel / grab_hose).
   - Grep engine/ and data/strings/ for i18n keys matching those verbs
     (interact.fill, interact.restock, interact.refuel, interact.grab_hose,
     plus any tooltip/toast copy that references them).
   - Enumerate all consumer sites where these strings are read.
2. Propose canonical verb choice. Options user has raised: "Restock" /
   "Refill" / "Load". Short rationale for your recommendation. Command will
   confirm same-day — do NOT land the rename until Command approves.
3. Propose canonical icon. Current glyphs: 🧪 / 📦 / 🪵 / 🧵. Pick one (or
   propose a new one) that reads as "top up / refill."

OWNED FILES
• engine/interact-prompt.js (ACTION_MAP)
• data/strings/**/*.js (i18n keys for refill-family)
• engine/hud.js / tooltip callsites if they hardcode any of these strings

HARD SCOPE FENCES
• Do NOT touch engine/raycaster.js, engine/door-sprites.js, engine/tiles.js
  (Alpha/Charlie territory — not your files).
• Do NOT touch engine/building-registry.js or floor payloads (Foxtrot's
  surface).
• Do NOT touch any tutorial-interaction logic (PRESSURE_WASHING, COBWEB,
  trap rearm, corpse harvest, torch refuel mechanics) — those interactions
  are Hotel's polish surface. You change PROMPTS and VERBS ONLY, never the
  underlying action handler.
• Do NOT unify verbs that are semantically distinct. Refill-family is
  crate fill / corpse restock / torch refuel / hose grab. "Interact.smash"
  (non-Gleaner breakable) and "interact.extinguish" (non-Gleaner torch-lit)
  are OUTSIDE the refill family — leave them alone.

DEFINITION OF DONE (sprint-end)
• Single canonical verb across fill / restock / refuel / grab_hose family
• Single canonical icon across the family
• ACTION_MAP updated + i18n reconciled + tooltip callsites aligned
• Class-gated variants share terminology (Gleaner and non-Gleaner see the
  same verb; different affordance behind the button)
• Smoke test: tutorial-world playthrough shows a consistent prompt on
  crate, corpse, torch (both states), and dump truck hose grab

FIRST MOVE
Read docs/SPRINT_PLAN_VOTING_PERIOD_PATCH.md, then read engine/interact-prompt.js
ACTION_MAP in full. Then grep:
    rg "interact\.(fill|restock|refuel|grab_hose)" --type js
    rg "interact\.(fill|restock|refuel|grab_hose)" data/
Inventory all consumer sites before proposing the rename. The blast radius
size shapes whether the rename fits inside Day 2 or spills into Day 3.

Post your Day 1 end-of-day report back to Command (this session) with:
  - Inventory of consumer sites (count + list)
  - Proposed canonical verb + icon with rationale
  - Estimated Day 2 effort to land the rename (≤ 1 day expected)
  - Any semantically-distinct verbs you want to flag as borderline
    (candidates for future unification, not this sprint)
```

---

## Command handoff contract

When each section reports back end-of-day, Command will:

- Re-run `node tools/blockout-cli.js validate` and `node tools/check-budgets.js`, compute deltas vs the 39-issue / 10-FAIL baseline.
- Log section status (🟢 / 🟡 / 🔴) in `docs/DEBUG_NOTES_SCREENER.md` Daily Log.
- Decide Day 2 dispatch (normally: continue the same charters, approve Golf's rename proposal).
- Hold Hotel in queue until Golf has landed Day 2's consistency patch.
- On Tue EOD: decide whether Juliet (Boss Door stretch) gets dispatched Wed based on Foxtrot's pace.
