# Cobweb & Trap Strategy Roadmap

**Created**: 2026-03-30 | **Updated**: 2026-04-17 | **Status**: Phases 1–2 complete, Phase 4 expanded (4.6 shipped), Phases 3/4.7/5–7 planned
**Phase 2 completion**: Consumable resources (Silk Spider, Trap Kit) fully wired — item defs, shop, loot drops, cost checks, prompts, starter loadout
**Phase 4.6 completion (Apr 17)**: Barrier-web variety dispatch (6 silhouettes), draw-in install animation, and foreshortening floor raised 0.15 → 0.30 — shipped in `cobweb-renderer.js`
**Depends on**: Phase C (cleaning loop), Phase E (hero cycle), Phase F (economy tuning)

---

## Design Philosophy

Traps and cobwebs are the Gleaner's **embellishment tools** — the dungeon equivalent of cleaning up and then setting the table for the next hero. They transform the classic dungeon-crawler backtracking problem into a strategic layer: you clean forward, arm backward, and exit carefully.

The core tension: **every trap and cobweb you place can hurt you on the way out.** This makes placement a real decision, not a checkbox. Players learn this the hard way when they arm their first trap and walk back over it, or tear their first cobweb by forgetting which corridor they webbed.

The strategic loop is: **clean inward → arm outward → exit via safe path**. This is an age-old corridor-clearing trope made tangible through the Gleaner's unique role.

---

## Current State (Phase 1 — Jam Scope)

### Trap Re-arm
- **Module**: `engine/trap-rearm.js` (Layer 1, ~160 lines)
- **Mechanic**: Face consumed TRAP position (EMPTY tile) → interact → tile restored to TRAP
- **Self-trigger**: Walking over a re-armed trap fires HazardSystem → 1 dmg → trap consumed again → can be re-armed again (infinite cycle)
- **Readiness**: Trap readiness = (rearmed count / consumed count). Feeds into ReadinessCalc misc weight (10%)
- **InteractPrompt**: Shows "⚙️ Re-arm trap" when facing a consumed position
- **Cooldown**: 600ms between re-arms

### Cobweb System
- **Modules**: `engine/cobweb-system.js` (Layer 1, ~370 lines), `engine/cobweb-renderer.js` (Layer 2, ~240 lines), `engine/cobweb-node.js` (Layer 3, ~320 lines)
- **Mechanic**: Face eligible corridor tile (1-wide, 3+ long) → interact → spider deploys cobweb
- **Self-tear**: Walking through your own cobweb destroys it (warning toast, −1g penalty, readiness drop of 0.25 per tear)
- **Rendering**: Corridor-aware elliptical web with foreshortened projection, per-biome tint, tear particle system
- **Readiness**: `_cobwebScore() = max(0, min(1.0, intactCount × 0.33) − tornCount × 0.25)` — weighs 15% of extra-credit tier
- **Node highlights**: Green pulsing dots at eligible positions, visible within 7 tiles
- **Enemy interaction**: Wired in `_onMoveFinish` — entities moving through cobwebs destroy them

### The Strategic Loop (Working Now)
1. Enter dungeon, work order posted (C8)
2. Clean blood, restock crates, process corpses (forward sweep)
3. On the way back: arm consumed traps, deploy spiders at corridor chokes
4. **Mistake penalty**: walk over your own trap = 1 dmg + trap consumed; walk through your own web = web torn + readiness loss + **−1g gold penalty**
5. **Install reward**: each successful cobweb deploy = **+2g** (coin burst VFX)
6. Exit dungeon, work order evaluated, readiness score determines payout

### Pre-Placed Cobwebs (Apr 4)
- Floor blockout data can include a `cobwebs` array: `[{ x, y, type }]`
- `game.js _onFloorArrived` auto-installs these via `CobwebSystem.install()`
- Allows level designers to pre-arm corridors for the Gleaner to maintain (or tear accidentally)

---

## Phase 2 — Economic Cost (Partial — Coin Loop Done)

### ✅ 2.0 Coin Economy (Apr 4)
Spider deployment and cobweb tearing now have immediate gold consequences:
- **Install reward**: +2g on successful cobweb deploy (`CardAuthority.addGold(2)`)
- **Tear penalty**: −1g when the player walks through their own cobweb (`CardAuthority.spendGold(1)`)
- **Readiness penalty**: Each player self-tear deducts 0.25 from cobweb readiness sub-score (`readiness-calc.js _cobwebScore()`)
- **Tracking**: `CobwebSystem.recordPlayerTear(floorId)` / `getPlayerTornCount(floorId)` track per-floor self-tears
- VFX: coin burst on install, tear particle effect on destruction
- This creates the core lesson: deploy carefully, exit via a different path

### ✅ 2.1 Spider Resource (Apr 4)
- **Silk Spider** (🕷️ ITM-115): consumable, 5g shop price, stackable ×10
- `CobwebNode.tryInteract()` requires 1 Silk Spider in bag — consumed on successful deploy
- "Need a Silk Spider 🕷️" toast when attempting to deploy without one
- Prompt shows inventory count: "🕷️ Deploy Spider +2g (×N)"
- Drops from cellar crate breakables (20% chance) and common chests (35% chance)
- Available at shop (SUPPLY_STOCK unlimited)
- Net cost per web: 5g spider − 2g install reward = **3g**
- Future rarity tiers: Fat Spider (2 webs from 1 deploy), Queen Spider (reinforced, 2 hits to destroy)

### ✅ 2.2 Trap Parts (Apr 4)
- **Trap Kit** (🪜 ITM-116): consumable, 3g shop price, stackable ×10
- Also accepts legacy **Trap Spring** (🪤 ITM-092, 2g) — either works
- `game.js _interact()` checks for ITM-116 or ITM-092 in bag before calling `TrapRearm.rearm()`
- "Need a Trap Kit 🪜 or Trap Spring 🪤" toast when attempting without one
- Prompt shows inventory count: "⚙️ Re-arm trap (×N)"
- Drops from foundry furnace drums (25% chance) and common chests (35% chance)
- Lab cabinets (sealab) drop either spider or kit (20% chance)
- Available at shop (SUPPLY_STOCK unlimited)

### ✅ 2.3 Starter Loadout & Drop Curve (Apr 4)
- **Starter bag**: 3× Silk Spider + 2× Trap Kit seeded in `CardSystem.init()`
- Enough for the first nested-dungeon run without needing to shop first
- **Breakable loot integration**: `loot-tables.js` resolves new `supply` drop type from breakable loot tables
- `_applyPickup()` in game.js handles `supply` type → `CardAuthority.addToBag()` with toast + audio
- Drop distribution biased by biome: cellar → spiders, foundry → trap kits, sealab → both
- **Price curve** (future): deeper floors could reduce supply drop rates for scarcity pressure

---

## Phase 3 — Proc-Gen Contract Integration

Work orders (C4/C8) currently set a flat readiness target. Phase 3 adds **embellishment objectives** to contracts.

### 3.1 Contract Bonus Objectives
- "Install ≥3 cobwebs on this floor" → +15g bonus
- "Re-arm all consumed traps" → +10g bonus
- "No cobwebs torn (clean exit)" → +20g bonus (stealth mastery)
- "Install a cobweb within 2 tiles of the boss door" → +25g bonus (strategic placement)

### 3.2 Gate-Contracting Thresholds
- Dispatcher escalation: Cycle 3+ orders require minimum embellishment score
- Embellishment score = (intact cobwebs × 5) + (rearmed traps × 3)
- Failing embellishment threshold = reduced payout even if base readiness is met
- This makes trap/cobweb work mandatory at higher cycles, not just bonus

### 3.3 Floor-Specific Modifiers
- Cellar biome: "Humid air — cobwebs decay after 60s" (timer pressure)
- Foundry biome: "Hot air — cobwebs catch fire if placed near FIRE tiles" (spatial puzzle)
- Sealab biome: "Stagnant air — cobwebs last forever" (easy mode, but fewer eligible spots)

---

## Phase 4 — Cobweb Visual Upgrade: Windsails (Partial — Core Rendering Done)

### ✅ 4.1 Biome Tint System (Apr 4)
- Per-biome colour applied dynamically in `cobweb-renderer.js`:
  - Cellar: `#ddd8cc` (dusty grey)
  - Foundry: `#e8d8a0` (warm gold)
  - Sealab: `#b8e8c8` (pale green)
  - Default: `#ccc8b8` (neutral silk)
- `render()` accepts optional `biome` parameter; game.js passes current biome each frame
- All hardcoded `WEB_COLOR` / `WEB_COLOR2` references replaced with `_mainColor` / `_ringColor`

### ✅ 4.2 Corridor-Aware Projection (Apr 4)
- `_renderOne()` rewritten: computes `planeNormalAngle` from cobweb `corridorDir` (H or V)
- Width foreshortened by `cos(playerDir − planeNormalAngle)`, clamped to min 0.15
- Result: webs appear as flat planes spanning the corridor, foreshortened when viewed at an angle
- Structural anchor threads drawn to 4 corridor corners (elliptical `halfW` / `halfH`)

### 4.3 Billow Animation (Planned)
- Subtle sine-wave horizontal displacement per-column (simulates air current)
- Amplitude scales with corridor width and distance from player
- Wind direction follows the corridor orientation (H or V from CobwebSystem)
- Breathing effect: slow amplitude pulse (2–4s period) so webs feel alive
- When player moves through adjacent tile: billow spike (web reacts to air displacement)

### 4.4 Hover Interaction (Magic Remote / Pointer) (Planned)
- When pointer hovers over a cobweb in the 3D viewport, highlight the web threads
- Thread color shifts to NODE_COLOR (lime green) to indicate interactability
- Tooltip appears: "🕸️ Intact cobweb — +5 readiness"
- Click to inspect: brief info overlay with placement time, corridor direction, readiness contribution
- This is the post-jam LG Content Store / webOS Magic Remote target interaction

### ✅ 4.5 Destruction Animation (Apr 4)
- `CobwebRenderer.spawnTear(wx, wy)` spawns 6–10 silk strand particles on cobweb destruction
- Particle physics: drift, gravity, rotation, alpha fade over ~1s lifetime
- `updateTearParticles()` called each frame from game.js render loop
- Game.js wires tear particles on player self-tear (`_onPlayerMoveCommit`)
- Audio: placeholder 'step' cue (TODO: add dedicated `cobweb_tear` audio asset)

### ✅ 4.6 Installed-Web Variety & Draw-in Animation (Apr 17)

Addresses three contributor complaints about the Phase-1 install mechanic:
webs were too narrow when viewed at an angle, the F-to-interact install
was visually indistinguishable from any other interaction, and barriers
popped into existence with no physical beat.

- **Silhouette dispatcher** — `_drawBarrierWeb()` became a switch over six
  variants: `classic`, `corner_br`, `funnel`, `tangled`, `hammock`, `sheet`.
  Each variant is a distinct geometric silhouette sharing the same
  framing bbox so corridor foreshortening stays consistent.
- **Deterministic variant picker** — `_pickVariant(cob, floorId)` uses an
  FNV-1a hash of `floorId + "|" + x + "," + y`. Same tile always renders
  with the same silhouette across frames and survives save/load without
  mutating CobwebSystem state.
- **Draw-in animation** — Derived from `cob.installedAt` (already set by
  `CobwebSystem.install`). `DRAW_DURATION_MS = 600`. Strands extend from
  their anchor outward (progress 0→0.65); rings fade in with an
  overlapping window (0.40→1.0). Every variant honours two progress
  params so the animation reads consistently across silhouettes.
- **Foreshortening floor raised 0.15 → 0.30** — Fixes the "too narrow at
  shallow angles" complaint. Webs now stay legible from any corridor view.
- **Wall-overlay webs** — `_drawWebCircle()` also accepts the progress
  params; small decorative webs draw in the same way.

**Files touched**: `engine/cobweb-renderer.js` (single-file change, ~350
lines added including six variant renderers and the dispatcher).

**Deferred — tile-102 floor-cobweb sibling textures.** The `floor_cobweb`
decal (tile 102) is a fixed procedural texture. Raycaster floor sampling
is per-tile-UV (every tile instance samples the same atlas entry), so
authoring sibling generators like `floor_cobweb_tangled` or
`floor_cobweb_sheet` would produce dead code without a per-cell variant
dispatch in `raycaster-floor.js`. Revisit when that dispatch lands (post
Phase 4.7).

### 4.7 Constellation-Trace Install Minigame (Shipped 2026-04-18)

> **Shipped 2026-04-18.** Module `engine/cobweb-trace.js` (~700 lines, Layer
> 2, loaded after `cobweb-renderer.js`) implements the full constellation-
> trace minigame described below. All six per-variant prescriptions wired,
> all three validation modes (`shape` / `euler` / `exact`) live, hybrid
> pointer + keyboard cursor input with Magic Remote fallback. Failed traces
> auto-install as `tangled` (sloppy visual); clean first-try traces award
> +1g. `CobwebRenderer.pickVariantForPosition(x, y, floorId)` exposes the
> FNV-1a hash so the trace overlay knows the target variant before
> `CobwebSystem.install()` creates the cob record (which now honors an
> optional 6th `variantId` override). Game-loop integration lives in
> `engine/game.js` across 8 sites (pause intercept, 5 cursor-nudge
> intercepts in strafe/turn/step handlers, pointer-click intercept, Enter
> intercept, InputPoll.isBlocked predicate, and the update/render call in
> the render pipeline). Recovery note: during scaffolding verification,
> `engine/game.js` was found truncated at the main Raycaster.render call —
> 135 lines lost during commit 334e6a8. Recovered from HEAD~1 (`2145cde`)
> per CLAUDE.md's "recovery, not rewrite" playbook; file now 4923 lines.


Extend the install interaction so placing a cobweb *feels* like the
spider (via the Gleaner) is actually spinning the web. Inspired by the
EyesOnly splash-screen `ConstellationTracer` — players connect nodes
painted on the surface in a specific pattern before the web resolves.

**Interaction loop**
1. Face eligible corridor tile, press F → `CobwebNode.tryInteract()`.
2. Instead of placing the web immediately, the camera zooms slightly and
   3–6 lime node dots are painted across the corridor plane
   (normalized 0–1 coords, scaled at render time so the overlay scales
   with viewport).
3. Player drags between nodes (mouse / Magic Remote pointer) to draw
   connecting strands. Each completed connection locks with a snap ring
   and a soft silk cue.
4. Once the required shape is traced, the web resolves and the full
   barrier web plays through the Phase 4.6 draw-in animation.
5. Tracing the wrong shape plays a red-flash on the nodes and resets the
   current edge (no progress lost — nodes remain visible).

**Validation modes** (ported from EyesOnly `ConstellationTracer`)
- `shape` — player draws a closed cycle of 3+ nodes (signature circle).
- `euler` — every authored edge must be traversed exactly once
  (signature *X across four nodes* — two diagonals).
- `exact` — every node must be visited at least once, order-agnostic.

**Per-variant shape prescription**. The required trace varies by cob
variant, reinforcing the visual variety from 4.6:
- `classic` → shape (closed cycle of 4 corner nodes).
- `corner_br` → exact (spider reaching from corner — all 4 nodes).
- `funnel` → euler (two diagonals across 3 nodes — an X).
- `tangled` → shape + euler (two overlapping cycles, draw each).
- `hammock` → exact (left-anchor → midpoints → right-anchor).
- `sheet` → shape (horizontal zig-zag through 6 nodes).

**Layered feedback**
- Pulse dwell arc on the active node while dragging.
- Glow halo on locked edges.
- Flowing gradient core line on the active tether.
- Dashed preview tether between pointer and last locked node.
- Snap ring on node lock.
- Red flash on reject (keeps node layout intact).

**Reward loop**
- Successful trace: +2g base (Phase 2.0 reward) **+1g bonus** for
  tracing cleanly on the first try (no rejections). Builds skill
  expression on top of the existing economy.
- Failed trace (3+ rejections): web still installs, but no bonus and a
  sloppy-web variant is forced (`tangled`) regardless of the hash-picked
  variant. The visual tells the story of the botched install.

**Files (planned)**
- New: `engine/cobweb-trace.js` (Layer 2) — state machine idle →
  highlighting → hasNode → tethered → resolve. Port from
  `EyesOnly/public/js/constellation-tracer.js`.
- `cobweb-node.js` — replace immediate install call with
  `CobwebTrace.begin(cob, variant)` → resolves by calling
  `CobwebSystem.install()` with the variant baked in.
- `cobweb-system.js` — extend `install()` signature to accept an
  explicit `variantId` override (bypasses the Phase 4.6 hash dispatch
  for sloppy-forced installs and trace-on-specific-layouts).
- `index.html` — script tag for `cobweb-trace.js` in Layer 2.

**Out of scope for 4.7**: touch input (pointer only for Jam + webOS
Magic Remote), per-floor trace difficulty curves (deferred to Phase 5
tiers), trace contribution to readiness (Phase 3.1).

---

## Phase 5 — Reinforced Variants

### 5.1 Web Tiers
- **Silk Web** (default): Destroyed in 1 pass. Current behavior.
- **Thick Web**: Requires 2 passes to destroy. Deployed by Fat Spider. Visual: denser thread pattern, slightly lower transparency.
- **Steel Web**: Requires 3 passes. Crafted (spider + iron salvage). Enemies with STR < 3 are blocked entirely. Visual: metallic thread sheen.

### 5.2 Trap Tiers
- **Pressure Plate** (default): 1 dmg, consumed on trigger. Current TRAP tile.
- **Spring Trap**: 2 dmg, consumed. Requires Trap Kit + spring salvage.
- **Rune Trap**: 1 dmg + energy drain, persists for 2 triggers. Requires Trap Kit + rune fragment.

### 5.3 Strategic Differentiation
- Silk webs are cheap early warning systems (enemy movement tears them, you see the gap)
- Steel webs are permanent corridor blocks (enemy pathfinding routes around them)
- Pressure plates are one-shot damage
- Rune traps are reusable area denial
- Player builds a toolkit over the campaign, choosing loadouts per floor

---

## Phase 6 — Enemy Pathfinding Integration

### 6.1 AI Avoidance
- EnemyAI cost map: standalone cobweb tiles get high movement cost (20× base)
- Low-INT enemies ignore cobweb cost and walk through (destroying the web)
- High-INT enemies route around cobwebs (strategic benefit of web placement)
- Enemies with ranged attacks can still target through cobwebs

### 6.2 Cobweb Awareness
- When an enemy destroys a cobweb, a "web torn" event fires
- Nearby enemies (within 5 tiles) become alerted (awareness +50)
- Creates early warning system: player hears cobweb tear → knows enemies are moving
- Audio: distant tear sound with distance-based volume

### 6.3 Trap Awareness
- Enemies that have triggered a trap become trap-aware for that floor
- Trap-aware enemies avoid known trap positions (memory persists per floor visit)
- Creates escalating challenge: re-armed traps work once per enemy type per visit

---

## Phase 7 — Cobweb Ecology (Far Future / Post-webOS)

### 7.1 Spider Nesting
- Cobwebs that survive an entire hero cycle "mature" — the spider builds a nest
- Nested cobwebs produce 1 Silk Spider item per cycle (self-sustaining economy)
- Nests are visible as thicker web centers with a small spider emoji
- Destroying a nested cobweb drops the spider as a pickup

### 7.2 Web Networks
- Adjacent cobwebs (within 2 tiles) form a network
- Networked webs share destruction resistance (+1 hit per network member, cap 3)
- Visual: thin thread connections between networked webs
- Strategic: dense web clusters in key corridors become durable barriers

### 7.3 Environmental Interaction
- Fire tiles adjacent to cobwebs: web catches fire, spreads to adjacent webs (chain reaction)
- Water tiles: webs in humid corridors gain bonus durability
- Poison tiles: webs absorb poison, becoming toxic webs (damage enemies on contact)
- Wind draft (future atmospheric system): webs billow dramatically, particles drift

---

## Integration Map

| Phase | Status | Depends On | Files Modified | New Files |
|-------|--------|-----------|----------------|-----------|
| 1 | ✅ Done | Phase C | game.js, hazard-system.js, interact-prompt.js, readiness-calc.js, index.html | trap-rearm.js |
| 2 | ✅ Done (coins + consumable cost + loot + shop + starter) | — | game.js, cobweb-system.js, cobweb-node.js, readiness-calc.js, card-system.js, shop.js, interact-prompt.js, loot-tables.js | items.json (ITM-115, ITM-116) |
| 3 | ⬜ Planned | Phase 2, C4 (work orders) | work-order-system.js, game.js | — |
| 4.1–4.2, 4.5 | ✅ Done (biome tint, corridor projection, tear particles) | — (visual only) | cobweb-renderer.js, game.js | — |
| 4.3–4.4 | ⬜ Planned (billow animation, hover interaction) | — (visual only) | cobweb-renderer.js | — |
| 4.6 | ✅ Done Apr 17 (6 silhouette variants, draw-in animation, foreshortening floor) | — | cobweb-renderer.js | — |
| 4.7 | ⬜ Planned (constellation-trace install minigame) | 4.6 (variants), EyesOnly ConstellationTracer reference | cobweb-node.js, cobweb-system.js, index.html | cobweb-trace.js |
| 5 | ⬜ Planned | Phase 2 (resource cost) | cobweb-system.js, trap-rearm.js, loot-tables.json | — |
| 6 | ⬜ Planned | Phase E (enemy AI) | enemy-ai.js, pathfind.js, cobweb-system.js | — |
| 7 | ⬜ Planned | Phases 5+6 | cobweb-system.js, cobweb-renderer.js | cobweb-ecology.js |

---

## Cross-References

- **DOC-2** §15: Cleaning tool progression (tools affect trap re-arm speed too)
- **DOC-2** §16: Gleaner pivot phases (trap/cobweb are Phase 2 Gleaner identity)
- **DOC-4** §17.1: Blood/cleaning rendering (cobweb rendering follows same pattern)
- **DOC-4** §17.3: Readiness scoring (trap + cobweb feed misc weight)
- **BONFIRE_POLISH_STEPS.md**: Bonfire waypoint exits create the "clean inward, arm outward" flow
- **TABLE_OF_CONTENTS_CROSS_ROADMAP.md**: Phase C (C7 trap re-arm, cobweb wiring)
