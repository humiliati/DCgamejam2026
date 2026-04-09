# Suit System Roadmap — Dungeon Gleaner

> **Created:** 2026-03-27 | **Updated:** 2026-04-07
> **Status:** 8 of 12 passes complete. Card DB expanded to 120 cards. Audio + spatial SFX live. Remaining 4 below.

---

## System Summary

Playing card suits replace flame/frost/storm/neutral as the element system.
Suit → resource color → cost type correlation makes combat readable at a glance.

### RPS Triangle

```
  ♣ Clubs (Wild/Force)
     │ beats
     ▼
  ♦ Diamonds (Crystal/Precision)
     │ beats
     ▼
  ♠ Spades (Earth/Steel)
     │ beats
     ▼
  ♣ Clubs  ← full circle
```

**♥ Hearts (Life/Blood)** — outside the triangle. No direct advantage.
Rule-breaker suit: strong vs status effects, weak vs burst damage.

### Suit ↔ Resource Color ↔ Cost Type

| Suit | Resource | Color | Hex | Default Cost | Glyph |
|------|----------|-------|-----|-------------|-------|
| ♠ Spade | — (free) | Warm Grey | `rgba(180,170,150,0.7)` | Free | — |
| ♣ Club | Energy | Electric Blue | `#00D4FF` | Energy | △ |
| ♦ Diamond | Battery | Toxic Green | `#00FFA6` | Battery | ◈ |
| ♥ Heart | HP | Vibrant Pink | `#FF6B9D` | HP | ♥ |

### Biome Alignment

| Biome | Floors | Dominant Suit | Enemies Drop | Cards Found |
|-------|--------|---------------|-------------|-------------|
| Cellar | 1-2 | ♠ (Earth/Burial) | Organic, bone | ♠ basics + ♦ (advantage vs ♠) |
| Foundry | 3-5 | ♦ (Crystal/Construct) | Battery | ♦ native + ♣ (advantage vs ♦) |
| Sealab | 6-8 | ♣ (Wild/Marine) | Energy, relics | ♣ native + ♠ (advantage vs ♣) |
| Cross-biome | any | ♥ (rare drops) | Varies | ♥ rule-breakers |

### Card Distribution (120 cards — updated 2026-04-07)

```
♠ Spade:   34 cards (28%) — starter basics, earth/steel, free cost
♣ Club:    36 cards (30%) — wild/force, energy cost trend
♦ Diamond: 29 cards (24%) — crystal/precision, battery cost trend
♥ Heart:   21 cards (18%) — life/blood, HP cost, sacrifice + defense
```

### Defense Coverage

```
♠ Spade:   baseline walls, control+defense hybrids
♣ Club:    energy barriers, brace+CC combos
♦ Diamond: 7 defense cards — battery-cost forge armor, burn counter (ACT-133 Crucible Shell: 14 DEF @ battery:2)
♥ Heart:   HP-sacrifice shields, regen brace (ACT-117 Final Stand: 15 DEF @ HP:5)
```

### Brace Cards (defense + damage)

```
♥ ACT-115 Crimson Counter — HP-cost brace (4 def + 4 dmg)
♣ ACT-126 Countershock    — energy-cost brace (3 def + 3 dmg)
♦ ACT-132 Forge Brace     — battery-cost brace (4 def + 3 dmg)
♦ ACT-085 Forge Mastery   — battery-cost brace (2 def + 6 dmg)
```

---

## Completed Passes

### Pass 1 — Data Migration ✅
- [x] `cards.json` — 63 cards: `element` → `suit`, synergyTags updated, descriptions updated
- [x] `enemies.json` — 27 enemies: `element` → `suit`, designNotes updated
- [x] `card-system.js` — 5 fallback cards updated to suit system

### Pass 2 — SynergyEngine ✅
- [x] Full RPS advantage table: ♣>♦, ♦>♠, ♠>♣
- [x] ♥ Hearts neutral (no advantage/disadvantage)
- [x] `getAdvantage(attacker, defender)` → 1.5x / 1.0x / 0.75x multiplier
- [x] `getDominantSuit(cards)` — majority suit of a stack
- [x] `computeStackAdvantage(stack, enemy)` — returns multiplier + display label
- [x] `checkMonoSuitBonus(cards)` — +1 dmg per card in mono-suit stack
- [x] Suit constants, symbols, colors, names exported

### Pass 3 — Combat Integration ✅
- [x] `CombatEngine.fireStack()` applies `SynergyEngine.computeStackAdvantage()` multiplier
- [x] Result includes `suitMult` and `suitLabel` for HUD
- [x] `CombatBridge.fireStack()` displays suit advantage label in combat log

### Pass 4 — CardFan Visual ✅
- [x] Card borders use suit resource colors (♠ grey, ♣ blue, ♦ green, ♥ pink)
- [x] Suit symbol (♠♣♦♥) rendered in top-left corner of each card
- [x] Stack glow uses golden color; stacked cards get numbered badges
- [x] Drag ghost shows green/red compatibility strip on hover

### Pass 5 — Drag-to-Stack UX ✅
- [x] pointerdown → dead zone → drag start with ghost
- [x] Drag onto card in combat → stack formation (shared synergy tags)
- [x] Tap stacked card → un-stack
- [x] Swipe up → fire stack with thrust multiplier
- [x] Reorder by dragging to new position (non-combat or no-stack drop)
- [x] AudioSystem.play() hooks: card-pickup, card-snap, card-stack, card-unstack, card-fire, card-reject

### Pass 6 — Suit Advantage Toast + Visual Feedback ✅
- [x] `engine/toast.js` — Added `showCentered()` method + 6 suit color presets
- [x] `engine/suit-toast.js` — Created. Formats advantage ("♣>♦ +50%!") / disadvantage / mono-suit toast
- [x] `engine/combat-bridge.js` — SuitToast trigger in `fireStack()` after combat log
- [x] `engine/combat-fx.js` — `flashFrame()` accepts optional `customColor` param for suit flash

### Pass 8 — Enemy Attack Telegraph ✅
- [x] `engine/enemy-intent.js` — Created. 10 emoji expression glyphs (😐→😠→🔥), stack telegraph data
- [x] `engine/raycaster.js` — Intent rendering: face glyph + card slot row above enemy sprite
- [x] `engine/combat-bridge.js` — 5 integration points: beginCombat, stacking, enemy_commit, enemy_ready, endCombat
- [x] `engine/game.js` — Added `id` to sprite push for raycaster intent matching
- [x] Ready-pulse: red flash overlay when enemy stack is full

### Pass 6.5 — Card DB Expansion (Defensive + Status) ✅
- [x] 27 new cards added (63 → 90 total)
- [x] ♥ Heart: 6→15 cards. 9 new: Life Ward, Blood Barrier, Vital Surge, Heartblood Thorns, Martyr's Embrace, Crimson Counter, Transfusion, Hemorrhage, Final Stand
- [x] ♣ Club: 17→28 cards. Added 7 defensive: Static Field, Energy Shield, Pulse Guard, Neural Brace, Feedback Loop, EMP Dome, Countershock. 4 status: Venom Drip, Corrosive Splash, Toxic Cloud, Constrict
- [x] ♦ Diamond: 16→20 cards. 4 new: Tempered Plate, Slag Armor, Forge Brace, Crucible Shell
- [x] ♠ Spade: 24→27 cards. 3 new status: Tangle Root, Serrated Edge, Briar Trap
- [x] Brace pattern: defense+damage cards in ♥/♣/♦ suits
- [x] Status gaps filled: poison 1→4, root 1→5, bleed 2→6

### Pass 7 — Audio Asset Pass ✅
- [x] `engine/audio-system.js` — Full Web Audio implementation: gesture-unlock AudioContext, three-tier gain bus, fetch+decode SFX cache, `<audio>` music streaming with crossfade, 80ms rate limiter, `playRandom()` for variants, `preloadCategory()` for cache warming. WebM/Opus only.
- [x] `data/audio-manifest.json` — 122 curated entries: ui(18), card(20), combat(22), movement(12), collectible(9), environment(7), music(34: 14 Aila Scott + 20 Turtlebox)
- [x] `EyesOnly/scripts/encode-turtlebox.mjs` — Encodes 20 Turtlebox HiFi MP3s → WebM/Opus 128k
- [x] `scripts/audio-copy-and-verify.ps1` — Copies SFX+Aila+Turtlebox into `media_assets/audio/`, verifies manifest, reports size
- [x] `media_assets/audio/sfx/` — 325 WebM SFX clips (~4.6MB)
- [x] `media_assets/audio/music/` — 34 tracks (~38MB)
- [x] All placeholder audio keys remapped: game.js, combat-bridge.js, floor-transition.js, hazard-system.js, suit-toast.js
- [x] Suit-keyed hit sounds: `hit-spade` (clang), `hit-club` (thump), `hit-diamond` (crystal break), `hit-heart` (wet)
- [x] Combat: enemy-alert on engage, advantage-chime/disadvantage on RPS, parry on blocked hits
- [x] Total audio budget: 42.6MB (within 50MB target)

---

## Remaining Passes

### Pass 9 — Suit Balance Tuning
**Est: 1-2h** | **Priority: Medium** | **Jam-polish**

Playtest and tune the expanded 120-card DB. Mono-suit bonus is now live in combat-engine.js (was dead code pre-patch, fixed 2026-04-07).

**Current tuning constants:**
- `ADV_MULT = 1.5` / `DISADV_MULT = 0.75` (synergy-engine.js)
- Mono-suit bonus: `+1 dmg per card beyond first` (3-stack mono = +2). Stacks with stack-size bonus (+1 per extra card), so a 3-card mono stack gets +4 total bonus.
- Damage order: base + stackEffects → stack-size bonus → mono-suit bonus → thrust mult → suit RPS mult → ambush/alert mult

**Playtest checklist:**
- [ ] **♦ battery economy:** 15 of 29 diamonds cost battery. ACT-133 Crucible Shell (battery:2, 14 DEF) may be too rewarding — consider battery:1 or DEF→12 if battery feels scarce
- [ ] **♥ HP sacrifice viability:** Final Stand (HP:5, 15 DEF) and Martyr's Embrace (HP:4, 10 DEF) are steep — do they feel like traps at low HP? Vital Surge (HP:1, 4 HP + draw) is the cheap entry point
- [ ] **Brace responsiveness:** Crimson Counter, Countershock, Forge Brace, Forge Mastery — do they feel like the right answer to enemy telegraphs?
- [ ] **Mono-suit bonus (+1):** May need to be +2 to compete with RPS advantage (50%). At +1, a 3-stack mono is +2 dmg vs RPS advantage of ×1.5 on base damage. The question: is mono-suit a viable alternative to suit-matching the enemy, or just a consolation prize?
- [ ] **RPS teaching progression:** Cellar (♠ dominant, ♦ drops advantage) → Foundry (♦ dominant, ♣ drops) → Sealab (♣ dominant, ♠ drops). Does the player learn naturally?
- [ ] **DoT stacking:** Poison 4 cards, root 5, bleed 6 — dedicated status builds are now possible. Verify DoT stacking isn't OP in longer fights
- [ ] **Cost override candidates:** If battery is too tight, candidates for cost reduction: ACT-210 EMP Blast (battery:3→2), ACT-133 Crucible Shell (battery:2→1)

Files: `data/cards.json` (cost/effect values), `synergy-engine.js` (multipliers), `combat-engine.js` (damage pipeline)

### Pass 10 — Hearts Rule-Breaker Mechanics (Post-Jam / T3)
**Est: 3h** | **Priority: Low** | **Post-jam**

Implement the "Hearts bend outcomes" mechanic:
- ♥ cards can stack with ANY suit (ignore synergy tag requirements)
- ♥ cards in stack grant "purify" — clears status effects on resolution
- ♥ cards weak vs burst damage (>6 dmg in single hit gets +25% vs ♥ enemies)
- ♥ enemies "rewrite rules mid-fight" — phase shifts, stack manipulation
- "Bond" status effect: shared damage/healing between linked targets

Files: `synergy-engine.js`, `combat-engine.js`, `card-stack.js`

### Pass 11 — Suit-Keyed Terrain Effects (Post-Jam / T3)
**Est: 3h** | **Priority: Low** | **Post-jam**

Terrain tiles interact with the suit system:
- ♣ zones grow hazards over time (mold, vines, coral)
- ♠ zones slow movement and increase defense (stone, burial sites)
- ♦ zones create refraction lines (crystal corridors, precision bonus)
- ♥ zones create shared health pools or aura buffs (sanctuaries)

Files: `floor-manager.js`, `hazard-system.js`, `synergy-engine.js`

### Pass 12 — State-Driven Advantage (Post-Jam / T3)
**Est: 4h** | **Priority: Low** | **Post-jam**

Make the RPS triangle context-sensitive:
- ♣ beats ♦ only if growth > fracture (tracked per-combat)
- ♦ beats ♠ only if fracture stacks exist
- ♠ beats ♣ only if terrain is hardened
- The triangle becomes emergent from board state, not static

Files: `synergy-engine.js`, `combat-engine.js`

---

## Files Modified

| File | Changes |
|------|---------|
| `data/cards.json` | `element` → `suit`, synergyTags migrated; expanded 63→90 cards with 27 new defensive/status cards |
| `data/enemies.json` | `element` → `suit`, designNotes updated |
| `engine/synergy-engine.js` | Full rewrite: RPS triangle, suit advantage, mono-suit bonus, display helpers |
| `engine/combat-engine.js` | Added suit RPS multiplier in `fireStack()`, exports `suitMult`/`suitLabel` |
| `engine/card-fan.js` | Full rewrite: drag-to-reorder, drag-drop-to-stack, swipe-to-fire, suit-color borders, suit symbols |
| `engine/card-system.js` | Fallback cards updated to suit system |
| `engine/card-stack.js` | Created: stack mechanics, thrust gesture, enemy AI stack |
| `engine/combat-bridge.js` | Suit advantage label, SuitToast trigger, EnemyIntent wiring (5 integration points) |
| `engine/combat-fx.js` | Per-enemy-type resolution timing, fan slide choreography, customColor flashFrame |
| `engine/toast.js` | Added `showCentered()` method + 6 suit color presets |
| `engine/suit-toast.js` | Created: advantage/disadvantage/mono-suit centered toast formatter |
| `engine/enemy-intent.js` | Created: 10 emoji expressions, intent state tracker, stack telegraph render data |
| `engine/raycaster.js` | Intent telegraph rendering: face glyph + card slot row + ready-pulse above enemy sprite |
| `engine/game.js` | Added `id` to sprite push; remapped all placeholder audio keys to manifest |
| `engine/audio-system.js` | Full rewrite: stub → Web Audio pipeline (gesture-unlock, gain bus, buffer cache, streaming music) |
| `engine/floor-transition.js` | Remapped door_unlock/bump → ui-confirm/ui-fail |
| `engine/hazard-system.js` | Remapped bonfire_rest/hazard_*/env_death_* → manifest keys |
| `data/audio-manifest.json` | Created: 122 entries, WebM/Opus only, SFX + Aila Scott + Turtlebox |
| `EyesOnly/scripts/encode-turtlebox.mjs` | Created: Turtlebox HiFi MP3 → WebM/Opus 128k encoder |
| `scripts/audio-copy-and-verify.ps1` | Created: asset copy + manifest verification + size report |
| `index.html` | Added enemy-intent.js, suit-toast.js to script load order |

---

**Document Version:** 3.1
**Updated:** 2026-04-07 — Card DB 90→120. Pass 9 checklist updated with current tuning constants. Mono-suit bonus confirmed live in combat pipeline.
