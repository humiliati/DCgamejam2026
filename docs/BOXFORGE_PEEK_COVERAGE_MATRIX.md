# BoxForge Peek Coverage Matrix (DOC-112)

**Status**: planning ¦ **Owner**: BoxForge pipeline ¦ **Generated**: 2026-04-17
**Feeds**: `BOXFORGE_AGENT_ROADMAP.md` Phase 5 — Peek-primitive stamps

This matrix is the single inventory of every peek the game needs, everywhere it shows up, and which BoxForge template slot each one maps to. It consolidates `INTERACTIVE_OBJECTS_AUDIT.md`, `MINIGAME_ROADMAP.md` / `MINIGAME_TILES.md`, `tools/tile-schema.json` (97 tiles), and the currently-wired peek modules in `engine/*-peek.js`.

The matrix exists so the BoxForge subagent can answer, for any tile or interaction: (a) is there a peek today? (b) if not, which stamp do I start from? (c) what shape does the final sidecar want to land on?

## 1. Template primitives (Phase 5 stamp sources)

Five of the 15 shipped sidecars are *primitives* — not wired to any tile, held as building blocks for Phase 5 stamps. These are NOT orphans; they are the stamp roster.

| Primitive | Shape | Derivation family | `bf apply-stamp` slot |
|---|---|---|---|
| `crate` | Box + hinged lid + interior panes | Any container with a lid | `stamp-box-lidded` |
| `torch` | Vertical pane stack w/ flame glow | Any light fixture or phase-animated vertical | `stamp-vertical-fixture` |
| `torch-box` | Box + top-mounted flame pane | Brazier, brazier-in-crate, anvil-with-coals | `stamp-braizer` |
| `torch-plus-orb` | Vertical + floating orb | Conduit, shrine-with-offering, charging-cradle | `stamp-fixture-plus-orb` |
| `pyramid` | Conic / tetrahedral with glow | Shrines, fungal mounds, altars, waypoints | `stamp-pyramid-shrine` |
| `orb` | Floating sphere | Orbs, crystal balls, floating collectibles | `stamp-orb-primitive` |
| `splash-cube` | Generic cube + splash phase | Placeholder / new tile scaffold | `stamp-splash-primitive` |

Plus the wired template sidecars that can *also* serve as stamps:

| Primitive | Derived-from | Derivation family | `bf apply-stamp` slot |
|---|---|---|---|
| `chest` | crate family | Treasure chests, coffins, trunks, sarcophagi, reliquaries | `stamp-chest` |
| `bookshelf` | vertical stack | Bookshelves, weapon racks, shelving units | `stamp-bookshelf` |
| `single-door` / `double-doors` / `locked-door` / `boss-door-plus-orb` | door family | All door variants | `stamp-door-*` |
| `corpse` | flat + sprite | Bodies on floor, triage beds with occupant | `stamp-flat-sprite` |
| `torch-peek` | torch + context | Context-gated vertical fixtures | `stamp-context-fixture` |

Total stamp roster: **12** (7 primitive + 5 wired archetypes).

## 2. Wired coverage today

| Peek module | Tiles it handles | Source sidecar | Type |
|---|---|---|---|
| `door-peek.js` | DOOR (2), DOOR_BACK (3), DOOR_EXIT (4), STAIRS_DN (5), STAIRS_UP (6), BOSS_DOOR (14) | single-door / double-doors / boss-door-plus-orb | action |
| `arch-peek.js` | ARCH_DOORWAY (71) | (inline, no sidecar yet) | micro |
| `locked-door-peek.js` | LOCKED_DOOR (24) | locked-door | action |
| `crate-peek.js` | BREAKABLE (11) | crate | full |
| `chest-peek.js` | CHEST (7) | chest | full |
| `corpse-peek.js` | CORPSE (19) | corpse | full |
| `torch-peek.js` | TORCH_LIT (30), TORCH_UNLIT (31) | torch-peek | context-gated |
| `merchant-peek.js` | SHOP (12) | *(no sidecar)* | full |
| `puzzle-peek.js` | PUZZLE (23) | *(no sidecar)* | action |
| `bookshelf-peek.js` | BOOKSHELF (25), TERMINAL (36) | bookshelf | full (+ CRT mode) |
| `bar-counter-peek.js` | BAR_COUNTER (26) | *(no sidecar)* | full |
| `bed-peek.js` | BED (27) | *(no sidecar)* | context-gated |
| `mailbox-peek.js` | MAILBOX (37) | *(no sidecar)* | full |
| `hose-peek.js` | DUMP_TRUCK (38) hose state | *(no sidecar)* | context-gated |
| `monologue-peek.js` | NPC dialogue lines | *(no sidecar)* | face-js |

Coverage hole to close while we're here: six wired peeks (`merchant`, `puzzle`, `bar-counter`, `bed`, `mailbox`, `hose`, plus `arch`) exist as engine modules but have no canonical sidecar. They should be ingested into `tools/templates/peeks/` so Phase 5 can reason about them as templates. This is deferred to Phase 3b (legacy CSS decoder).

## 3. Gap inventory — tiles that need a peek

Grouped by derivation family. Each row tells the agent exactly where to start.

### 3.1 Furnishing & hearth (furnish category)

| Tile | ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| TABLE | 28 | `stamp-flat-sprite` | micro | cozy-quip toast on face; no menu |
| HEARTH | 29 | `stamp-braizer` | context-gated | phase = lit/cold; rest action when lit |

### 3.2 Infrastructure minigame stations (infra category)

| Tile | ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| WELL | 40 | `stamp-vertical-fixture` | action | crank animation; pumps bucket |
| BENCH | 41 | `stamp-flat-sprite` | context-gated | nap action when tired |
| NOTICE_BOARD | 42 | `stamp-bookshelf` (flat variant) | action | arrangement puzzle entry |
| ANVIL | 43 | `stamp-braizer` | action | hammer/coal glow; forge entry |
| BARREL | 44 | `stamp-chest` (no lid / stave texture) | action | pour / tap sequence |
| CHARGING_CRADLE | 45 | `stamp-fixture-plus-orb` | action | calibration dial |
| SWITCHBOARD | 46 | `stamp-bookshelf` (upright panel variant) | full | routing-puzzle entry |
| SOUP_KITCHEN | 47 | `stamp-braizer` | action | ladle/pot simmer intro |
| COT | 48 | `stamp-flat-sprite` | context-gated | nap when tired |

### 3.3 Creature spawners (creature category)

| Tile | ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| ROOST | 49 | `stamp-vertical-fixture` | context-gated | shows nest activity / scarecrow toggle |
| NEST | 50 | `stamp-flat-sprite` | action | sweep cleanup clicky |
| DEN | 51 | `stamp-box-lidded` (interior-cavity variant) | context-gated | growl state if occupied |
| FUNGAL_PATCH | 52 | `stamp-pyramid-shrine` | action | harvest-with-warning; tension bar |
| ENERGY_CONDUIT | 53 | `stamp-fixture-plus-orb` | context-gated | arcing/pulsing by charge |
| TERRITORIAL_MARK | 54 | `stamp-splash-primitive` | micro | paw-print / faction-sigil hint |

#### 3.3a Creature-tile peek hooks (2026-04-17 update)

The creature family is now the most cross-connected in the schema: floor-texture generators (DOC-115) ship underneath each peek, adjacent-tile decor (DOC-117) spawns on neighboring cells, the evidence ledger (DOC-118) swings faction rep when the peek resolves to a cleanup action, and ENERGY_CONDUIT specifically gets its own hazard state machine (DOC-119). Each peek must surface these hooks so the player can read consequences BEFORE committing. Per-tile delta:

| Tile | DOC-115 floor tex | DOC-117 decor hook | DOC-118 ledger swing | DOC-119 hazard | Peek additions |
|---|---|---|---|---|---|
| ROOST (49) | `roost_shadow` ✅ shipped | feather-strewn cardinal-neighbor sprites | NEST destroyed reads here too (+3/+2/0/−8/−5) | — | Badge "BPRD research asset" in approach toast; flash red if rep would drop ≥ one tier |
| NEST (50) | (no generator — uses biome default) | eggshell-shard floor decor adjacent | +3 MSS / +2 Pinkerton / −8 Jesuit / −5 BPRD on sweep | — | Rep-delta pips on face prompt; first-entry beat triggers Dispatcher quip |
| DEN (51) | (no generator — biome default) | claw-scrape wall decor on facing-tile | +2 MSS / −3 Jesuit / −2 BPRD on flush | — | Growl-state ties to DOC-119-style tint so "occupied" reads as hazard-tier warning |
| FUNGAL_PATCH (52) | `floor_fungal_patch` ✅ shipped (pre-DOC-115) | mycelial runner decor inline + cardinal | Harvest branch: +1 Jesuit / +2 BPRD. Destroy branch: +2 MSS / −2 Jesuit / −5 BPRD | — | Peek exposes the harvest-vs-destroy choice on the prompt (two-face variant) |
| ENERGY_CONDUIT (53) | `energy_conduit` ✅ shipped + `energy_conduit_overload`/`energy_conduit_dead` (DOC-119) | `decor_brass_pipe_run_wall` on facing-tile; drops cyan glow when conduit DEAD | DEAD: −2 MSS / −3 Pinkerton / +2 Jesuit / −8 BPRD. Cascade 3+: −5 / −8 / +5 / −15 | Full state machine: NOMINAL → SHOCKED → OVERLOADING → DEAD. Chain reaction at 2-tile radius | Peek must show hazard badge ("DANGER — HIGH CURRENT"), state dot (green/amber/red/black), and a "do-not-spray" prompt hint when washer is equipped. Four sidecar phases, one per state |
| TERRITORIAL_MARK (54) | `territorial_mark` ✅ shipped | three-slash scratch decor on wall-mid, facing-tile | First-entry: flags onboarding beat (no rep swing until sprayed). Spray: +0.1 weight only (low-signal) | — | Peek triggers first-time Dispatcher sting ("you're in something's territory, Gleaner"); subsequent peeks demote to pure micro-flavor |

**Peek-copy tone rule**: every creature peek must read as *professional cleanup operator facing dungeon ecology*, not *dungeon-diver fighting monsters*. The verbs are "log", "catalog", "sweep", "re-arm", "flush", "de-energize", never "kill" or "clear". Faction rep deltas surface as a single pip (green up / red down) rather than numeric text — the ledger (DOC-118) is the canonical source, the peek just previews direction.

**Sidecar phase count**: DOC-119 pushes ENERGY_CONDUIT from a 2-phase sidecar (idle / interacted) to a **4-phase sidecar** (NOMINAL / SHOCKED / OVERLOADING / DEAD). Phase 5 stamp work for `stamp-fixture-plus-orb` must therefore parameterise orb-glow intensity + spark-particle density by phase index rather than a binary lit/unlit toggle.

### 3.4 Economy / medical (economy category — dungeon scavenge ops)

| Tile | ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| STRETCHER_DOCK | 55 | `stamp-flat-sprite` | action | dock stretcher, unload bodies |
| TRIAGE_BED | 56 | `stamp-flat-sprite` | context-gated | occupied / empty |
| MORGUE_TABLE | 57 | `stamp-flat-sprite` | action | deposit body for report |
| INCINERATOR | 58 | `stamp-braizer` | action | burn sequence menu |
| REFRIG_LOCKER | 59 | `stamp-box-lidded` | action | cold-storage menu |

### 3.5 Light fixtures already partly covered

| Tile | ID | Start from stamp | Peek type | Notes |
|---|---|---|---|---|
| BONFIRE | 18 | `stamp-braizer` | context-gated | fire phase state; rest action; share torch behaviour |
| CITY_BONFIRE | 69 | `stamp-braizer` | context-gated | town-square variant of bonfire |

### 3.6 Trap family — NEW TILES + NEW PEEKS (per user request)

The schema currently ships only `TRAP (8)` as a generic placeholder plus instant-hazard tiles (`FIRE 15`, `SPIKES 16`, `POISON 17`) that need NO peek (no approach moment — the hazard fires on step). Gleaner's cleanup scope needs the *mechanism-before-fire* tiles, which do not exist in the schema yet.

Proposed new tiles + peeks. Existing max ID is 96 (PORTHOLE_OCEAN), so the trap family starts at 97:

| New tile | Proposed ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| TRAP_PRESSURE_PLATE | 97 | `stamp-flat-sprite` | action | disarm / pry plate; returns TRAP_DISARMED |
| TRAP_DART_LAUNCHER | 98 | `stamp-vertical-fixture` (wall-mount variant) | action | de-cock / remove dart; show aim line |
| TRAP_TRIPWIRE | 99 | `stamp-flat-sprite` (thin-strip variant) | micro | cut / step-over hint; reset mechanism |
| TRAP_SPIKE_PIT | 100 | `stamp-box-lidded` (open-pit interior variant) | action | board-over / retract spikes |
| TRAP_TELEPORT_DISC | 101 | `stamp-pyramid-shrine` (flat-disc variant) | context-gated | destination preview; deactivate rune |
| TRAP_TRAPDOOR_RIG | — | reuse TRAPDOOR_DN (75) | action | re-bolt trapdoor; Gleaner reset |
| COBWEB | 102 | `stamp-vertical-fixture` (translucent strand variant) | action | sweep + inspect (may drop harvest) |

All seven live under family **trap / hazard-mechanism**. Gleaner's cleanup narrative reads "re-arm for the next delve" rather than "disarm" — important for the UX tone in the peek copy.

### 3.7 Gate peeks — locked / unlock / rejection animations (DOC-116)

The existing `locked-door-peek.js` only handles the KEY gate type. DOC-116 defines six gate types, each needing distinct locked-state presentation, unlock animation, and rejection animation. Gates are tile-agnostic (any opaque tile with a `doorTarget` can carry a gate), but the visual peek anchors on the tile's sidecar shape.

#### 3.7a Locked-state peek variants (approach moment)

Each gate type presents differently when the player faces a gated tile. The `gated` peek type in `PEEK_PHASE_MAP` is the entry point; the gate type from `evaluateGate()` selects the visual variant.

| Gate type | Visual cue on locked state | Start from stamp | Animation TODO |
|---|---|---|---|
| KEY | Keyhole icon + lock plate overlay (existing `locked-door` sidecar) | `stamp-door-*` (locked-door) | ✅ shipped — keyhole glow pulse |
| QUEST | Seal/sigil overlay — glowing rune band across door face | `stamp-door-*` + glow pane | ❌ rune-pulse idle loop; rune-dissolve on unlock |
| FACTION | Faction emblem + reputation bar preview | `stamp-door-*` + emblem pane | ❌ emblem shimmer idle; bar-fill on approach (reads current tier) |
| SCHEDULE | Clock face overlay + open/close hours text | `stamp-door-*` + clock pane | ❌ clock-hand tick idle; door-shimmer during open window |
| BREAKABLE | Degradation state (intact → cracked → broken) | `stamp-door-*` or `stamp-box-lidded` | ❌ crack propagation per hit; debris particle burst on break |
| COMPOSITE | Stacked condition icons (AND chain / OR fan) | `stamp-door-*` + multi-icon pane | ❌ icon-by-icon check-off animation as conditions are met |

#### 3.7b Unlock animations (gate passes → door opens)

| Gate type | Unlock sequence | Duration | Animation TODO |
|---|---|---|---|
| KEY | Key-insert → turn → lock-plate retract → door swing | ~800ms (existing 3-beat juice) | ✅ shipped — `_executeUnlock()` in `floor-transition.js` |
| QUEST | Rune-dissolve → seal-crack → door swing | ~1000ms | ❌ rune particles scatter outward; seal splits vertically |
| FACTION | Emblem-glow → bar fills to threshold → emblem fades → door swing | ~1200ms | ❌ reputation bar fill animation; emblem fade-to-gold |
| SCHEDULE | Clock-hand sweeps to open hour → door shimmers open | ~600ms | ❌ fast clock-sweep; shimmer uses schedule `openHour` color |
| BREAKABLE | Hit impact → crack deepens → (final hit) collapse + debris | ~500ms per hit; ~1200ms final | ❌ per-hit crack texture swap; final: debris burst + dust cloud |
| COMPOSITE | Condition icons check off sequentially → final gate animation | varies by child count | ❌ sequential icon tick (200ms each) → parent gate type animation |

#### 3.7c Rejection animations (gate fails → player told why)

All rejection peeks share a common shell: the locked-state visual plays a "deny" shake, then a rejection hint toast appears using the gate's `rejectHint` i18n key. Gate-type-specific rejection flavor:

| Gate type | Rejection flavor | Animation TODO |
|---|---|---|
| KEY | Lock rattles, keyhole flashes red | ❌ rattle-shake (3 frames); red keyhole pulse |
| QUEST | Rune band flares, seal pulses bright | ❌ rune-flare burst; seal glow intensifies then fades |
| FACTION | Emblem dims, reputation bar flashes at deficit | ❌ bar flash showing gap between current and required tier |
| SCHEDULE | Clock face highlights closed hours in red | ❌ red-zone highlight on clock; "current time" arrow pulse |
| BREAKABLE | Impact spark but no crack progression (wrong suit) | ❌ spark particle + "clang" with no damage; wrong-suit icon flash |
| COMPOSITE | Failed condition icon(s) flash red, met ones stay green | ❌ per-condition red/green flash; unmet conditions pulse |

**Phase mapping:** Gate peek variants belong in **Phase 5** stamp work (sidecar shapes) + **Phase 7** minigame drive-through (runtime wiring). The `locked-door` sidecar is the Phase 5 seed — all six gate presentations derive from it plus type-specific overlay panes. Engine-side `evaluateGate()` dispatch (DOC-116 §4) must ship before the rejection peeks can read gate state at runtime.

### 3.8 Architectural / freeform that eventually want peeks

| Tile | ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| TRAPDOOR_DN / _UP | 75 / 76 | `stamp-box-lidded` (floor-hatch variant) | action | open/close + descend prompt |
| WINDOW_* family | 72, 73, 77-83 | `stamp-flat-sprite` (lit variant) | micro | eavesdrop-on-NPC gag |
| PORTHOLE | 72 | `stamp-flat-sprite` (circular variant) | micro | sea-view vignette |
| ARCH_DOORWAY | 71 | `stamp-door-*` (open-arch variant) | micro | already has `arch-peek.js`; ingest to sidecar (Phase 3b) |

### 3.9 Environmental & ambient tiles — justifiable interactive possibilities

Tiles in this section were previously treated as "set dressing" with no peek proposal. The 2026-04-17 audit identifies justifiable interactive hooks so the dungeon doesn't read as static backdrop between action tiles. Each row carries an explicit **Justification** column naming the narrative, mechanical, or faction reason the peek earns its slot. Many of these are micro peeks (flavor toast only, no menu) so the cost is low; promotion to action/context-gated is gated on whether the hook feeds an existing minigame or faction beat.

| Tile | ID | Start from stamp | Peek type | Justification |
|---|---|---|---|---|
| WATER (9) | 9 | `stamp-splash-primitive` (puddle variant) | context-gated | **Mechanical** — washer-equipped peek shows "evaporation gag" (quick toast + small steam particle burst). **Narrative** — standing puddles in the dungeon are evidence the Hero didn't bother to drain after flooding a chamber. Feeds DOC-118 low-weight "observation" ledger entries so water-rich floors trend the cleanup trace toward factions that care (MSS). No menu — pure micro peek when approaching without a washer |
| PILLAR (10) | 10 | `stamp-vertical-fixture` (columnar-stonework variant) | micro | **Narrative** — carved pillars carry per-biome inscriptions. BPRD pillars read "BUREAU SEAL — DO NOT DEFACE"; Jesuit pillars carry 400-year-old hymn fragments; Pinkerton pillars carry civic surveying marks. Faction-specific lore micro deepens conspiracy-layer reads. **Faction hook** — first-entry on a Jesuit-inscribed pillar emits DOC-118 tier-gate toward the hidden Jesuit branch (low-weight reveal event) |
| TREE (21) / TREE_SQ (85) | 21 / 85 | `stamp-vertical-fixture` (foliage variant) | context-gated | **Mechanical** — harvest micro triggers only if the player carries a cutting tool (scythe, hatchet card, or quest-issued marker); otherwise pure flavor toast ("the bark is scored by something's claws"). **Narrative** — scoring reinforces the DOC-117 claw-scratch decor adjacent to DENs, so trees near creature-tile neighborhoods read as "they've been here." **Faction hook** — tree harvests near dragon-glyph zones emit Jesuit rep swing |
| SHRUB (22) | 22 | `stamp-flat-sprite` (low-foliage variant) | micro | **Mechanical** — crouch-adjacent concealment micro: if Gleaner is in stealth stance and a patrol is facing the shrub, the peek surfaces a "hide here" prompt that resets enemy awareness on the tile. **Narrative** — low hedge cover lets the player slip past a guarded section without combat, supporting the "operative, not warrior" tone |
| FENCE (35) | 35 | `stamp-vertical-fixture` (picket variant) | micro | **Narrative** — eavesdrop-over-the-fence micro. Near a scripted NPC conversation, fence peek surfaces overheard audio snippet (useful for conspiracy beats the player would otherwise miss). **Faction hook** — overheard Pinkerton dialogue tips rep upward toward whichever side the player explicitly flagged in the DOC-118 ledger |
| DETRITUS (39) | 39 | `stamp-flat-sprite` (debris-pile variant) | context-gated | **Mechanical** — scavenge micro returns a small Salvage drop with ~30% probability; context-gated on bag capacity. **Narrative** — the primary cleanup-signature tile on hero-wake floors; every DETRITUS peek emits a low-weight cleanup entry so DETRITUS-rich floors accumulate toward whichever faction cares about thoroughness. **Ledger hook** — aggregate scavenge count is the most frequent DOC-118 entry and the primary driver of early-game MSS approval curve |
| PILLAR_QUAD (88) | 88 | `stamp-vertical-fixture` (quad-column variant) | micro | **Mechanical** — diagonal peek-through: unlike solid PILLAR, quad-cluster tiles let the ray graze between sub-columns, so the peek surfaces a "preview the next chamber" micro (free info without committing to enter). **Narrative** — the peek-through gag reinforces that Gleaner is a cautious operator who scouts before crossing thresholds |
| TUNNEL_WALL (95) | 95 | `stamp-flat-sprite` (alcove-niche variant) | micro | **Narrative** — the side-wall alcove holds a lantern, bone cluster, or mushroom cluster per biome. Peek reads the niche contents as flavor toast without a menu; tier 2 promotion (context-gated) adds a "collect the mushroom" branch that feeds the FUNGAL_PATCH harvest economy. **Mechanical** — biome-diverse tunnels read more clearly when the niche content differs from the floor texture |
| PORTHOLE_OCEAN (96) | 96 | `stamp-flat-sprite` (circular-vignette variant) | micro | **Narrative** — sealab dungeon floors need sea-view beats so the setting reads. Peek surfaces a parallax fish sighting (rare event) + ambient audio swell. **Retrofuturism theme** — underwater dungeon installations feed the jam's Retrofuturism pillar directly |
| STOOP (86) / DECK (87) | 86 / 87 | `stamp-flat-sprite` (planking variant) | micro | **Mechanical** — "stepping up" toast on entry provides a subtle cue that the player moved onto a raised platform (since the Doom-rule height offset is otherwise silent). **Narrative** — wooden planks vs. stone stoops reinforce building-vs-street readability. No menu |
| CITY_BONFIRE (69) | 69 | `stamp-braizer` (already in §3.5) | context-gated | **Cross-ref** — already covered by BONFIRE row in §3.5; noted here for completeness because the town-square placement makes it the most-peeked ambient tile in The Promenade. Peek variant adds NPC-crowd-chatter overheard-line sampler on approach |
| CANOPY family (66/67/84) | 66, 67, 84 | — | (no peek) | **Decision: skip.** Floating overhead decor with no player interaction surface. Listed here to explicitly close the audit — no peek is justifiable |
| ROOF family (60-64, 68, 70) | 60-64, 68, 70 | — | (no peek) | **Decision: skip.** Exterior-building roof tiles are unreachable by Gleaner. Listed here to explicitly close the audit — no peek is justifiable |
| WALL_DIAG (90-93) | 90-93 | — | (no peek) | **Decision: skip.** Beveled wall geometry is a rendering primitive, not an interactive tile |
| TERMINAL_RIM (89) | 89 | — | reserved | Slot currently not shipped — superseded by single-slab TERMINAL. No peek work until the slot is revived |

**Stamp queue impact**: the environmental-tile audit adds work for `stamp-splash-primitive` (WATER adopts the splash-cube foundation beyond TERRITORIAL_MARK), `stamp-vertical-fixture` (already queued; PILLAR/TREE/FENCE/PILLAR_QUAD reuse it with variants), and `stamp-flat-sprite` (already queued; SHRUB/DETRITUS/TUNNEL_WALL/PORTHOLE_OCEAN/STOOP/DECK reuse with variants). No new primitive stamps are required for §3.9 — all rows are variant-parameterisations of existing queue entries.

**Peek-vs-no-peek rule**: a tile earns a peek row when at least one of the three justifications (narrative / mechanical / faction) is non-trivial. Pure rendering primitives (WALL_DIAG), unreachable decor (ROOF/CANOPY), and reserved/unshipped slots (TERMINAL_RIM) are explicitly closed with a "skip" row so the audit is complete rather than silent.

## 4. Minigame bookend coverage

Every minigame from `MINIGAME_ROADMAP.md` needs a peek as its "world-side bookend" — the approach moment before the player commits to the minigame screen. The minigame's closing peek (result card) typically reuses the same sidecar with a phase swap.

| Minigame | Opener tile | Peek family | Status |
|---|---|---|---|
| Lockpick — KEY gate | LOCKED_DOOR (24) | action | ✅ `locked-door` (KEY only) |
| Gate reject — all 6 types | any gated tile | gated | ❌ per-type rejection peek (§3.7c) |
| Gate unlock — QUEST | any gated tile | gated | ❌ rune-dissolve sequence (§3.7b) |
| Gate unlock — FACTION | any gated tile | gated | ❌ emblem-fade sequence (§3.7b) |
| Gate unlock — SCHEDULE | any gated tile | gated | ❌ clock-sweep sequence (§3.7b) |
| Gate unlock — BREAKABLE | any gated tile | gated | ❌ crack-to-collapse sequence (§3.7b) |
| Gate unlock — COMPOSITE | any gated tile | gated | ❌ sequential-check sequence (§3.7b) |
| Chest-loot | CHEST (7) | full | ✅ `chest` |
| Boss-seal orb | BOSS_DOOR (14) | action | ✅ `boss-door-plus-orb` |
| Bar counter order | BAR_COUNTER (26) | full | ✅ wired, needs sidecar (3b) |
| Well crank | WELL (40) | action | ❌ `stamp-vertical-fixture` |
| Soup ladle | SOUP_KITCHEN (47) | action | ❌ `stamp-braizer` |
| Anvil forge | ANVIL (43) | action | ❌ `stamp-braizer` |
| Barrel pour | BARREL (44) | action | ❌ `stamp-chest` (no-lid variant) |
| Fungal harvest | FUNGAL_PATCH (52) | action | ❌ `stamp-pyramid-shrine` |
| Cradle calibration | CHARGING_CRADLE (45) | action | ❌ `stamp-fixture-plus-orb` |
| Switchboard routing | SWITCHBOARD (46) | full | ❌ `stamp-bookshelf` |
| Notice arrange | NOTICE_BOARD (42) | action | ❌ `stamp-bookshelf` |
| Nest sweep | NEST (50) | action | ❌ `stamp-flat-sprite` |
| Trap reset clicky | every TRAP_* (3.6) | action | ❌ new family |
| Incinerator burn | INCINERATOR (58) | action | ❌ `stamp-braizer` |
| Morgue report | MORGUE_TABLE (57) | action | ❌ `stamp-flat-sprite` |

**10 minigame/gate peeks wired today. 23+ still needed** (16 minigame + 7 gate unlock/reject).

## 5. Work queue for Phase 5 (stamp authoring order)

Prioritised so each slice unlocks more minigames per unit of stamp work:

1. **`stamp-braizer`** (from torch-box) — unlocks HEARTH, BONFIRE, CITY_BONFIRE, ANVIL, SOUP_KITCHEN, INCINERATOR (6 peeks).
2. **`stamp-flat-sprite`** (from corpse, flat horizontal + sprite overlay) — unlocks TABLE, BENCH, COT, NEST, STRETCHER_DOCK, TRIAGE_BED, MORGUE_TABLE, TRAP_PRESSURE_PLATE, TRAP_TRIPWIRE (9 peeks).
3. **`stamp-fixture-plus-orb`** (from torch-plus-orb) — unlocks CHARGING_CRADLE, ENERGY_CONDUIT (2 peeks).
4. **`stamp-vertical-fixture`** (from torch) — unlocks WELL, ROOST, TRAP_DART_LAUNCHER, COBWEB (4 peeks).
5. **`stamp-bookshelf`** (from bookshelf, upright-panel variant) — unlocks SWITCHBOARD, NOTICE_BOARD (2 peeks).
6. **`stamp-box-lidded`** (from crate, generalised) — unlocks BARREL, DEN, REFRIG_LOCKER, TRAP_SPIKE_PIT, TRAP_TRAPDOOR_RIG (5 peeks).
7. **`stamp-pyramid-shrine`** (from pyramid) — unlocks FUNGAL_PATCH, TRAP_TELEPORT_DISC (2 peeks).
8. **`stamp-splash-primitive`** (from splash-cube) — TERRITORIAL_MARK + scaffold for unplanned future tiles.

Eight stamps deliver peeks for **30 tiles**. Gate peek variants (§3.7) derive from the existing `stamp-door-*` family plus type-specific overlay panes — no new primitive stamp needed, but 5 new overlay pane templates (quest-rune, faction-emblem, schedule-clock, breakable-crack, composite-icons) must be authored as Phase 5 door-stamp extensions. The remaining coverage is sidecar-only (no new primitive needed): ingesting the six wired-but-sidecarless peeks (`merchant`, `puzzle`, `bar-counter`, `bed`, `mailbox`, `hose`, `arch`) into `tools/templates/peeks/` via Phase 3b CSS decode.

## 6. Schema additions required

Phase 5 cannot ship TRAP family peeks without first widening `tools/tile-schema.json`. Current max tile ID is 96 (PORTHOLE_OCEAN), so the new family slots into IDs 97-102:

- 97 TRAP_PRESSURE_PLATE (hazard)
- 98 TRAP_DART_LAUNCHER (hazard)
- 99 TRAP_TRIPWIRE (hazard)
- 100 TRAP_SPIKE_PIT (hazard)
- 101 TRAP_TELEPORT_DISC (hazard)
- 102 COBWEB (creature)

These lift the TRAP family from a single generic tile to a proper spread, matching how EyesOnly handles mechanism-before-fire. Schema extension is a prerequisite — belongs in an early Phase 5 slice labelled `5.0 schema widen`. After extension, tile count goes from 97 → 103 and `tools/extract-floors.js` must be re-run to regenerate `tools/tile-schema.json`.

## 7. Maintenance

- When a new tile is added to `tile-schema.json`, append a row to §3 of this doc.
- When a stamp is shipped in Phase 5, tick the corresponding row in §4 and update `BOXFORGE_AGENT_ROADMAP.md` §Phase 5.
- When a peek is ingested to `tools/templates/peeks/`, remove the "*(no sidecar)*" tag from §2.
- **Creature-tile peeks (§3.3) are cross-connected** to four docs (DOC-115 textures, DOC-117 decor, DOC-118 evidence ledger, DOC-119 electrocution hazard). When any of those advance, re-audit the §3.3a delta table so peek copy, sidecar phase count, and rep-swing badges stay current.
- **§3.9 justification rule**: a tile earns an environmental-peek row only when at least one of narrative / mechanical / faction is non-trivial. When adding a new ambient tile, either fill the three-justification test or explicitly close the audit with a "skip" row.

## 8. Cross-references

- `docs/BOXFORGE_AGENT_ROADMAP.md` — Phase 5 stamps and Phase 3b legacy ingest
- `docs/GATE_TAXONOMY.md` (DOC-116) — 6 gate types, resolution pipeline, `evaluateGate()` pseudocode. §3.7 of this doc maps each gate type to locked/unlock/rejection peek variants and animation TODOs
- `docs/TILE_TEXTURE_HANDOFF.md` (DOC-115) — creature-tile procedural floor textures (ROOST, FUNGAL_PATCH, TERRITORIAL_MARK shipped). Referenced by §3.3a
- `docs/ADJACENT_TILE_DECOR_SPEC.md` (DOC-117) — wall/floor decor spawned on cardinal-neighbors of creature tiles. Each §3.3a row names the specific decor sprite the peek must acknowledge in its copy
- `docs/CLEANING_EVIDENCE_LEDGER.md` (DOC-118) — per-tile rep-swing weights. §3.3a rep pips in peek previews pull from this table
- `docs/ELECTROCUTION_HAZARD_SPEC.md` (DOC-119) — ENERGY_CONDUIT state machine (NOMINAL/SHOCKED/OVERLOADING/DEAD). Drives the 4-phase sidecar requirement for `stamp-fixture-plus-orb`
- `docs/INTERACTIVE_OBJECTS_AUDIT.md` — per-tile behaviour and status badges
- `docs/MINIGAME_ROADMAP.md` + `docs/MINIGAME_TILES.md` — minigame bookends
- `tools/tile-schema.json` — authoritative 97-tile list
- `tools/templates/peeks/` — canonical sidecars (15 today)
