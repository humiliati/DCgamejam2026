# Cobweb & Trap Strategy Roadmap

**Created**: 2026-03-30 | **Status**: Phase 1 complete, Phases 2–7 planned
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
- **Self-tear**: Walking through your own cobweb destroys it (warning toast, readiness drop)
- **Rendering**: Procedural radial web pattern with concentric rings, billboard-projected in 3D viewport
- **Readiness**: Each intact cobweb adds 0.05 to misc score (capped at 0.15 bonus)
- **Node highlights**: Green pulsing dots at eligible positions, visible within 7 tiles
- **Enemy interaction**: Wired in `_onMoveFinish` — entities moving through cobwebs destroy them

### The Strategic Loop (Working Now)
1. Enter dungeon, work order posted (C8)
2. Clean blood, restock crates, process corpses (forward sweep)
3. On the way back: arm consumed traps, deploy spiders at corridor chokes
4. **Mistake penalty**: walk over your own trap = 1 dmg + trap consumed; walk through your own web = web torn + readiness loss
5. Exit dungeon, work order evaluated, readiness score determines payout

---

## Phase 2 — Economic Cost (Post-Jam Priority)

Spider deployment currently costs nothing. This is fine for the jam but removes the core tension. Players spam cobwebs everywhere once they learn the mechanic.

### 2.1 Spider Resource
- New consumable item: **Silk Spider** (🕷️)
- Found in dungeon loot, purchased from Tide Council shop
- Deploying a cobweb consumes 1 Silk Spider from bag/equipped
- Cost creates the first-cobweb lesson: deploy → tear accidentally → "that was my only spider"
- Rarity tiers: Common Spider (1 web), Fat Spider (2 webs from 1 deploy), Queen Spider (reinforced web, 2 hits to destroy)

### 2.2 Trap Parts
- New consumable: **Trap Kit** (⚙️)
- Required to re-arm traps (currently free)
- Found in breakable crates, crafted from salvage parts
- Cost makes the player choose: re-arm this trap or save the kit for a deeper floor

### 2.3 Price Curve
- Early floors: spiders and kits are common drops, nearly free
- Deep floors: resources become scarce, player must choose which corridors to web/trap
- Economy tuning ties into DOC-2 §16 Phase 8 and Phase F tasks

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

## Phase 4 — Cobweb Visual Upgrade: Windsails

The current cobweb rendering is a flat radial web pattern projected as a billboard. Phase 4 transforms cobwebs into dramatic **corridor windsails** — large fabric-like webs that billow and sway, filling the 3D space with visual presence.

### 4.1 Texture System
- New procedural texture: `cobweb_sail` generated by TextureAtlas
- 64×64 canvas with radial thread pattern + transparency gradient
- Per-biome tint: grey (cellar), pale green (sealab), gold (temple), white (default)
- Texture applied to a full-height quad spanning the corridor width

### 4.2 Third-Space Rendering
- Cobwebs occupy the **third space** between walls — they're not wall textures and not floor sprites
- Render as a semi-transparent vertical plane perpendicular to the corridor direction
- The raycaster's column-based rendering can composite the web texture over the background wall
- Requires a per-column alpha blend pass after the main wall render
- Z-buffer integration: web columns occlude sprites behind them but are occluded by closer walls

### 4.3 Billow Animation
- Subtle sine-wave horizontal displacement per-column (simulates air current)
- Amplitude scales with corridor width and distance from player
- Wind direction follows the corridor orientation (H or V from CobwebSystem)
- Breathing effect: slow amplitude pulse (2–4s period) so webs feel alive
- When player moves through adjacent tile: billow spike (web reacts to air displacement)

### 4.4 Hover Interaction (Magic Remote / Pointer)
- When pointer hovers over a cobweb in the 3D viewport, highlight the web threads
- Thread color shifts to NODE_COLOR (lime green) to indicate interactability
- Tooltip appears: "🕸️ Intact cobweb — +5 readiness"
- Click to inspect: brief info overlay with placement time, corridor direction, readiness contribution
- This is the post-jam LG Content Store / webOS Magic Remote target interaction

### 4.5 Destruction Animation
- When a cobweb is torn, don't just remove it — animate the tear:
  - Threads snap from center outward (0.3s)
  - Silk strands drift downward (particle emitters, 0.5s)
  - Tattered remnants persist on adjacent walls for ~3s (ghost texture)
- Audio: soft fabric tear + silk whisper

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

| Phase | Depends On | Files Modified | New Files |
|-------|-----------|----------------|-----------|
| 1 (done) | Phase C | game.js, hazard-system.js, interact-prompt.js, readiness-calc.js, index.html | trap-rearm.js |
| 2 | Phase E (hero cycle), Phase F (economy) | game.js, cobweb-node.js, loot-tables.json | — |
| 3 | Phase 2, C4 (work orders) | work-order-system.js, game.js | — |
| 4 | — (visual only) | cobweb-renderer.js, texture-atlas.js, raycaster.js | — |
| 5 | Phase 2 (resource cost) | cobweb-system.js, trap-rearm.js, loot-tables.json | — |
| 6 | Phase E (enemy AI) | enemy-ai.js, pathfind.js, cobweb-system.js | — |
| 7 | Phases 5+6 | cobweb-system.js, cobweb-renderer.js | cobweb-ecology.js |

---

## Cross-References

- **DOC-2** §15: Cleaning tool progression (tools affect trap re-arm speed too)
- **DOC-2** §16: Gleaner pivot phases (trap/cobweb are Phase 2 Gleaner identity)
- **DOC-4** §17.1: Blood/cleaning rendering (cobweb rendering follows same pattern)
- **DOC-4** §17.3: Readiness scoring (trap + cobweb feed misc weight)
- **BONFIRE_POLISH_STEPS.md**: Bonfire waypoint exits create the "clean inward, arm outward" flow
- **TABLE_OF_CONTENTS_CROSS_ROADMAP.md**: Phase C (C7 trap re-arm, cobweb wiring)
