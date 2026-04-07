# Triple Emoji Stack — Sprite System Roadmap

**Created**: 2026-03-29
**Cross-Roadmap Tier**: T1.5 (Combat Polish — Enemy Attack Telegraph)
**Depends on**: EnemySprites (Layer 1), Raycaster sprite path (Layer 2), EnemyIntent (Layer 2)
**Replaces**: Single-emoji sprite system + floating intent glyph

---

## Problem Statement

Every enemy and NPC is a single emoji billboard. The hero (the player's primary antagonist) renders as `⚔️` — crossed swords, indistinguishable from a weapon pickup. Slimes, goblins, bosses, and vendors all occupy the same flat single-glyph space with no body, no clothing, no visual identity beyond one icon. The intent telegraph floats a face emoji above the sprite during combat, but outside combat every creature is visually inert.

The triple emoji stack fixes this by composing each entity from three vertical slots — head, torso, legs — with layered accessories, kaomoji intent capsules, directional awareness, and color-tint variety. A simple 3-slot system with optional sub-layers gives us thousands of visually distinct NPCs from a small emoji kit, while folding the intent telegraph cleanly into the head region.

---

## The Stack Model

```
        ╭──────────────╮
        │ KAOMOJI PILL │  ← intent capsule (combat/periodic flash)
        ╰──────┬───────╯
     ┌─────────┴─────────┐
     │      HEAD         │  Slot 0 — face/creature head
     │   (+ hat layer)   │  Sub-layer: hat/hair/helmet behind or in front
     ├───────────────────┤
     │      TORSO        │  Slot 1 — body/armor/role identity
     │ (+ weapon layers) │  Sub-layers: backWeapon (behind), frontWeapon (in front)
     ├───────────────────┤
     │      LEGS         │  Slot 2 — locomotion/boots/lower body
     └───────────────────┘
```

Each slot is a `fillText()` call at a Y offset within the existing billboard system. The raycaster already computes `spriteH` scaled by distance — the three slots render at `Y - spriteH*0.28`, `Y`, and `Y + spriteH*0.28`. Empty slots are skipped. Sub-layers render at the same Y as their parent slot but at reduced scale and slight X offset.

---

## Stack Definition Schema

```javascript
// New shape for EnemySprites.registerStack()
{
  type: 'goblin',

  // Core 3-slot stack
  head:    '👹',           // Slot 0 — always present for humanoids
  torso:   '🧥',           // Slot 1 — body/clothing
  legs:    '👖',           // Slot 2 — empty string '' to skip

  // Sub-layers (optional, rendered relative to parent slot)
  hat:      '⛑️',          // Over/behind head, slight Y offset up
  hatScale: 0.6,           // Relative to slot size (default 0.5)
  hatBehind: false,        // true = render before head (hoods); false = over (crowns)

  backWeapon:  '🗡️',       // Behind torso (sheathed sword, backpack)
  backWeaponScale: 0.5,
  backWeaponOffsetX: 0.3,  // Fraction of spriteW, positive = right

  frontWeapon: '⚔️',       // In front of torso (wielded weapon, shield)
  frontWeaponScale: 0.75,
  frontWeaponOffsetX: -0.2,

  // Corpse override (death collapses stack to single ground sprite)
  corpse: '💀',

  // Color tint seed — hue-shifts the entire stack for NPC variety
  // Applied as a CSS hue-rotate filter on the offscreen composite
  tintHue: null            // null = no tint, 0-360 = hue shift degrees
}
```

### Creature Archetypes

Not every entity fills all three slots. The system handles five archetype patterns:

| Archetype | Head | Torso | Legs | Examples |
|-----------|------|-------|------|----------|
| **Humanoid** | face | clothing | pants/boots | Goblins, NPCs, Hero, vendors |
| **Beast** | head | body | (empty) | Rats, hounds, toads |
| **Floating** | face | (empty) | (empty) | Ghosts, wraiths, bats |
| **Blob** | (empty) | body | (empty) | Slimes, oozes |
| **Construct** | head | body | base | Golems, automatons |

---

## Phase 1: Core Stack Renderer

**Est**: 3h | **Files**: `enemy-sprites.js`, `raycaster.js`, `game.js`

### 1.1 EnemySprites Registry Refactor

Replace `registerPoses({ idle, attack, corpse })` with `registerStack()`:

```javascript
// Old API (preserved for backward compat)
registerPoses('goblin', { idle: '👹', attack: '👺', corpse: '💀' });

// New API
registerStack('goblin', {
  head: '👹', torso: '🧥', legs: '👖',
  hat: '⛑️', hatScale: 0.6,
  corpse: '💀'
});
```

`computeFrame()` returns an expanded result:

```javascript
{
  // Existing fields (unchanged for backward compat)
  emoji: '👹',          // Legacy single-emoji fallback
  tint: ..., glow: ..., // STATE_FX modifiers (apply to whole stack)

  // New stack fields
  stack: {
    head:   '👹',
    torso:  '🧥',
    legs:   '👖',
    hat:    { emoji: '⛑️', scale: 0.6, behind: false },
    backWeapon:  null,
    frontWeapon: null,
    tintHue: null
  }
}
```

If an enemy has no registered stack, `stack` is `null` and the raycaster falls back to single-emoji rendering. Zero regression risk.

### 1.2 Raycaster Stacked Render

In `_renderSprites()`, after the existing `if (s.emoji)` block, add stacked rendering:

```javascript
if (s.stack && spriteH > 6) {
  _renderStack(ctx, s.stack, screenX, spriteCenterY, spriteH, spriteW,
               hSquish, ySquish, s.facing, item);
} else if (s.emoji) {
  // Existing single-emoji path (unchanged)
}
```

`_renderStack()` draws each non-empty slot as a `fillText()` at the appropriate Y offset:

```
Slot 0 (head):   centerY - spriteH * 0.28
Slot 1 (torso):  centerY
Slot 2 (legs):   centerY + spriteH * 0.28
```

Sub-layers (hat, weapons) render at reduced scale relative to their parent slot. `backWeapon` and `hat` with `behind: true` render before the parent slot. `frontWeapon` and `hat` with `behind: false` render after.

### 1.3 Game.js Sprite Assembly

The sprite object pushed to `_sprites[]` gains a `stack` field populated from `computeFrame().stack`:

```javascript
_sprites.push({
  x: e.x, y: e.y, id: e.id,
  emoji: spriteEmoji,      // Legacy fallback
  stack: frame.stack,       // New: null or { head, torso, legs, ... }
  // ... existing fields unchanged
});
```

---

## Phase 2: Kaomoji Intent Capsule ✅ IMPLEMENTED

**Status**: Complete | **Files**: `kaomoji-capsule.js` (new), `raycaster.js`, `game.js`, `dialog-box.js`, `index.html`

### 2.1 KaomojiCapsule Module (`engine/kaomoji-capsule.js`)

New standalone IIFE module (Layer 1) managing capsule state for any number of sprites simultaneously. Two modes:

- **Intent mode** — combat telegraph. Periodic flash cycle (900ms visible / 2800ms interval) with animated kaomoji twitch frames (e.g. `^_^` → `^_~` wink at 300ms into flash).
- **Speech mode** — NPC dialogue. Continuous capsule with rolling ellipsis (`.` → `..` → `...` → blank cycling at 400ms per dot).

Each kaomoji entry has `base`/`anim` frames plus an RGB tint color for the pill background. The `updateFromIntent()` method maps EnemyIntent expression names to kaomoji keys; `startSpeech()`/`stopSpeech()` control NPC dialogue capsules.

### 2.2 Kaomoji Catalog (with animation frames)

| Key | Base | Anim | RGB Tint | Context |
|-----|------|------|----------|---------|
| `calm` | `^_^` | `^_~` | 120,200,120 | Patrolling, unaware |
| `focused` | `>__<` | `>_<` | 200,160,60 | Preparing attack |
| `angry` | `>:()` | `>:(` | 220,100,60 | Combat aggression |
| `enraged` | `#>_<` | `#>.<` | 255,60,60 | Low HP, desperate |
| `surprised` | `O_O` | `o_O` | 160,180,220 | Ambushed |
| `dazed` | `X_X` | `x_X` | 180,180,100 | Stunned/jammed |
| `sleeping` | `-_-` | `-_-z` | 100,100,180 | Very low awareness |
| `confident` | `^w^` | `^v^` | 200,160,220 | Confident attack |
| `desperate` | `@_@` | `@.@` | 200,120,100 | HP critical |
| `charged` | `*_*` | `⁕_⁕` | 255,200,60 | Stack full, about to fire |
| `speaking` | `...` | ` ..` | 180,200,220 | NPC dialogue (rolling) |
| `greeting` | `^_^/` | `^_~/` | 140,220,160 | NPC greeting wave |
| `thinking` | `?.?` | `?_?` | 180,180,200 | NPC considering |

### 2.3 Capsule Renderer (in raycaster.js)

Replaces the old floating emoji intent glyph. The capsule renders as a pill-shaped `roundRect` (with arcTo fallback for older browsers) filled with the kaomoji's RGB tint at 55% opacity. Kaomoji text in white bold monospace with dark stroke outline. Positioned above the head slot (or sprite center for non-stacked enemies), with the existing overhead bob animation.

Card stack telegraph (committed card emojis + empty slot placeholders) now renders *above* the capsule as a separate row, preserving the combat stacking UI.

### 2.4 Flash Timing

```
FLASH_DURATION  = 900ms   (visible per flash)
FLASH_INTERVAL  = 2800ms  (between flash starts)
ANIM_DELAY      = 300ms   (into flash before twitch frame)
ANIM_DURATION   = 150ms   (twitch frame holds)
FADE_IN         = 120ms   (alpha ramp up)
FADE_OUT        = 200ms   (alpha ramp down)
```

Intent capsules flash periodically during combat and immediately on state change. Speech capsules display continuously until DialogBox closes.

### 2.5 NPC Speech Integration

`DialogBox.getActiveSpeakerId()` (new accessor) returns the NPC entity's `.id` when a conversation is active. Game.js syncs this each frame: when a speaker ID appears, `KaomojiCapsule.startSpeech()` activates the rolling ellipsis capsule above the NPC's sprite in the 3D viewport. When the dialog closes, `stopSpeech()` dismisses it.

---

## Phase 2b: Kaomoji Polish (DEFERRED)

**Est**: 2h | **Depends on**: Phase 2 ✅, gameplay feedback

Deferred polish items split out from Phase 2 for post-jam or when capsule rendering is confirmed working in gameplay:

### 2b.1 Capsule Frame Shake

On certain events (invalid player input, NPC rejection, failed dialogue check), the capsule plays a rapid horizontal shake animation (3 oscillations over 250ms, ±4px). Triggered by a new `KaomojiCapsule.shake(spriteId)` API.

### 2b.2 Capsule Pulse on Error

When the player attempts an action the NPC rejects (wrong dialogue choice, insufficient currency), the capsule flashes red briefly (background tint override to `[255,60,60]` for 400ms) before reverting to the speaking kaomoji.

### 2b.3 Extended Kaomoji Animation Library

Expand the animated kaomoji set with more expressive twitch frames and longer animation sequences:
- Multi-frame sequences (e.g. `^_^` → `^_~` → `^_^` → `~_^` four-frame wink cycle)
- Context-sensitive animations (e.g. `>:(` shakes harder when HP is lower)
- Vendor-specific kaomoji (e.g. `$_$` when player has high gold, `._.' when browsing too long)

### 2b.4 Kaomoji for Awareness States

Map exploration awareness states (Unaware/Suspicious/Alerted/Engaged) to capsule flashes during non-combat, replacing the current MGS-style emoji glyphs (💤/❓/❗/⚔️) with kaomoji equivalents. This unifies all overhead sprite communication into the capsule system.

---

## Phase 3: State Transition Wobble & Bob + Ragdoll Death ✅ IMPLEMENTED

**Status**: Complete | **Files**: `raycaster.js`, `death-anim.js`, `corpse-registry.js`, `game.js`

### Implemented Beyond Original Scope

Phase 3 was expanded to include the full death→corpse→loot→reanimate lifecycle:

- **3a Differential idle bob**: Per-slot bob damping in `_renderStack()` — head bobs full, torso 60%, legs 20% (grounded). `_SLOT_BOB` array scales `bobY` per slot.
- **3b Ragdoll joint collapse**: `DeathAnim` stack-aware fold. Each slot separates with staggered timing (`SLOT_STAGGER = [0, 0.12, 0.25]`), independent rotation with damped sinusoidal wobble, X drift, and joint coupling that keeps slots tethered during the first moments. Head falls first and rotates most (`SLOT_MAX_ROT = [0.55, 0.35, 0.15]`), legs are the anchor. Sub-layers (hat, weapons) detach and fly off with amplified rotation. Settles into a scattered pile layout.
- **3c Corpse pile sprites**: `CorpseRegistry` stores full `stackDef` and scatter seed. `buildSprites()` emits `corpseStack` objects with pile layout data. Raycaster renders piles via new `_renderCorpsePile()` — each slot drawn at its resting scatter position with slight rotation and reduced alpha.
- **3d Bone transition**: When looted dry, `buildSprites()` gates on `lootState !== DRY` for stack piles, falling through to single bone emoji (🦴). Clean visual transition — pile vanishes, bone remains.
- **3e Reanimation**: `DeathAnim.startReanimate()` reverses the collapse — legs plant first, torso follows, head snaps to attention with spring overshoot wobble. Hat drops on at the end with bounce. `_harvestCorpse()` checks `CorpseRegistry.isFullyHydrated()` before loot — if hydration is full, triggers stand-up animation and spawns friendly NPC.

> **Extraction note:** `_harvestCorpse()` was extracted from `game.js` to `engine/corpse-actions.js` as `CorpseActions.harvestCorpse()`.

### Original Phase 3 Spec (for reference)

### 3.1 Stack Wobble on State Change

When `spriteState` changes (idle→attacking, attacking→dazed, etc.), the stack plays a brief wobble animation — a damped sinusoidal rotation applied to each slot with increasing amplitude from bottom to top:

```javascript
// Wobble params (set when spriteState changes)
var WOBBLE_DURATION = 400;    // ms
var WOBBLE_FREQ = 12;         // Hz
var WOBBLE_DECAY = 5;         // Damping factor
var WOBBLE_AMP = [0.04, 0.07, 0.10]; // radians: legs, torso, head

// Per-frame wobble angle for slot i:
var t = (now - wobbleStart) / WOBBLE_DURATION;
if (t < 1) {
  var decay = Math.exp(-WOBBLE_DECAY * t);
  var wave = Math.sin(t * WOBBLE_FREQ * Math.PI * 2);
  var angle = WOBBLE_AMP[slotIndex] * decay * wave;
  ctx.rotate(angle);  // Applied per-slot before fillText
}
```

The head wobbles most, the legs least — like a bobblehead spring. Corpse transition skips wobble (plays fold/poof instead).

### 3.2 Idle Bob

Gentle continuous bob already exists (`bobY` in STATE_FX). The stack version applies differential bob per slot:

```javascript
// Slot 0 (head): full bob amplitude
// Slot 1 (torso): 60% bob
// Slot 2 (legs): 20% bob (grounded)
var slotBobScale = [1.0, 0.6, 0.2];
var slotBobY = baseBobY * slotBobScale[slotIndex];
```

This gives the stack an organic sway — the head leads, the body follows, the legs anchor.

### 3.3 Attack Lunge

When `spriteState` is `ATTACKING`, the torso and head shift forward slightly (toward the player) while legs stay planted:

```javascript
if (state === 'attacking') {
  // Lunge: head +6px toward player, torso +3px, legs 0
  var lungeScale = [6, 3, 0];
  var lungeOffset = lungeScale[slotIndex] * Math.sin(attackPhase) / dist;
}
```

---

## Phase 4: Suit-Based Creature Variants ✅ IMPLEMENTED

**Status**: Complete | **Files**: `enemy-sprites.js` (29 enemy stacks + suit tint), `enemy-ai.js` (enemies.json population), `game.js` (loadPopulation wire), `data/enemies.json` (data source)

### 4.1 Suit Visual Language

Reframed from generic elemental variants to the ♣/♦/♠/♥ RPS suit system. Suit identity is expressed through three layers — never by simply overlaying a suit symbol:

1. **tintHue colour wash** — 15% overlay composite tints the entire stack in the suit colour
2. **Thematic modifier emojis** — suit-flavoured accessories (cobwebs for ♠, lightning for ♣, crystals for ♦, hearts for ♥)
3. **Creature archetype choices** — body emojis chosen to reinforce biome + suit identity

Suit tint hues (avoiding resource UI colours):

| Suit | Colour | tintHue | Theme |
|------|--------|---------|-------|
| ♠ Spade | Grey/achromatic | `null` (no tint) | Earth, bone, undead, heavy |
| ♣ Club | Electric Blue #00D4FF | `190` | Energy, wild, arcane, marine |
| ♦ Diamond | Toxic Green #00FFA6 | `150` | Crystal, construct, forge |
| ♥ Heart | Vibrant Pink #FF6B9D | `330` | Life, corruption, shadow |

### 4.2 All 29 Enemy Stacks (from enemies.json)

| ID | Enemy | Suit | Stack | Mods | Weapons |
|----|-------|------|-------|------|---------|
| ENM-001 | Cobweb Crawler | ♠ | `🕷️` | 🕸️ web | — |
| ENM-002 | Shambling Corpse | ♠ | `🧟 🦴 🦿` | 🪦 gravestone | — |
| ENM-003 | Dungeon Rat | ♠ | `🐀` | — | — |
| ENM-004 | Bone Guard | ♠ | `💀 🦴 🦿` | — | ⚔️ + 🛡️ |
| ENM-005 | Mold Wraith | ♣ | `👻` | 💧 + ✨ | — |
| ENM-006 | Cave Toad | ♦ | `🐸` | 💎 crystal | — |
| ENM-007 | Rot Hound | ♠ | `🐕 🦴` | 💀 skull | — |
| ENM-008 | Bone Sovereign | ♠ | `💀 🦴 🦿` | 🔮 orb | 🗡️ + 🛡️, 👑 hat |
| ENM-010 | Soot Imp | ♦ | `👺 🧥 👖` | 🔥 flame | — |
| ENM-011 | Iron Golem | ♠ | `🤖 🗿 🦿` | ⚙️ gear | — |
| ENM-012 | Slag Hound | ♦ | `🐺` | 🔥 flame | — |
| ENM-013 | Clockwork Guard | ♣ | `⚙️ 🤖 🦿` | ⚡ spark | 🔧 wrench |
| ENM-014 | Ember Sprite | ♦ | `✨` | 🔥 flame | — |
| ENM-015 | Scrap Brute | ♠ | `🦾 🗿 🦿` | ⚙️ gear | 🔨 hammer |
| ENM-016 | Smelt Master | ♦ | `😤 🦺 🥾` | 🔥 flame | 🔨, ⛑️ hat |
| ENM-017 | The Amalgam | ♦ | `🏭 🗿 🦿` | ⚙️ + 🔥 | — |
| ENM-020 | Tide Stalker | ♠ | `🦈` | 💧 water | — |
| ENM-021 | Shock Eel | ♣ | `🐍` | ⚡ spark | — |
| ENM-022 | Lab Drone | ♣ | `🔬 🤖` | ⚡ spark | — |
| ENM-023 | Deep Crawler | ♠ | `🦀` | 🫧 bubble | — |
| ENM-024 | Brine Wraith | ♠ | `👻` | 💧 water | — |
| ENM-025 | Bio-Hazard Slime | ♣ | `🫧` | 💧 drip | — |
| ENM-026 | Admiralty Enforcer | ♣ | `😠 🥷 🥾` | — | 🔱 + 🛡️, ⚓ hat |
| ENM-027 | Cryo-Brute | ♠ | `🧊 🗿 🦿` | ❄️ frost | — |
| ENM-028 | The Archivist | ♣ | `🌊 🥼 🦿` | ⚡ spark | 🔱, 🎓 hat |
| ENM-090 | Hero's Shadow | ♥ | `👤 🖤 🦿` | 💔 heart | 🗡️ dagger |
| ENM-091 | Wandering Vendor | ♠ | `🛒 🧥 👖` | — | — |

### 4.3 Population System

`enemy-ai.js` now loads `data/enemies.json` via `loadPopulation()` (sync XHR, called at `Game.init()`). Enemies are indexed by biome and tier:

- **Standard pool**: biome-matched, randomly picked per spawn
- **Elite pool**: 15% + 5%/level chance, separate biome-matched pool
- **Cross-biome**: 5% chance of rare cross-biome spawn (Hero's Shadow, Wandering Vendor)
- **Legacy fallback**: If JSON load fails, falls back to 6-enemy hardcoded pool

Biome resolution from floor ID: `"1.3.1-2"` = cellar, `"2.2.1-2"` = hero's wake, `"3.1.1+"` = deep vaults.

### 4.4 Type Field Pipeline

`createEnemy()` now derives a `type` key from the enemy name:
`"Bone Guard"` → `"bone_guard"` → `_stackRegistry["bone_guard"]`

This closes the gap where `enemy.type` was undefined, so `computeFrame()` can now resolve stacks.

### 4.5 Elite Scaling

Elite enemies (`isElite: true`) render at `scale: 0.8` vs standard `0.6`. All stack slots scale uniformly. The suit tint applies identically — elite identity comes from scale + stat scaling, not visual differentiation.

---

## Phase 5: Humanoid NPC Composition & Color Variety ✅ IMPLEMENTED

**Status**: Complete | **Files**: new `npc-composer.js` (Layer 1), `game.js`, `index.html`

### 5.1 NPC Emoji Kit

A curated set of emoji for each slot that reads clearly at small raycaster sizes (12-40px):

**Heads** (face/species):
`👤 👦 👧 👨 👩 🧑 👴 👵 🧙 🧝 🧟 🤖 👹 💀 🐲`

**Hats/Hair** (sub-layer over head):
`⛑️ 🎩 👒 🪖 👑 🧢 🎓 💇 (none)`

**Torsos** (clothing/armor/role):
`🧥 👔 👕 🥼 🦺 🎽 👘 🥷 (none)`

**Weapons** (front or back sub-layer on torso):
`⚔️ 🗡️ 🏹 🔫 🛡️ 🪓 🔱 🥍 🪄 🔧 (none)`

**Legs** (lower body):
`👖 🩳 🥾 🦿 👗 (none)`

### 5.2 Seed-Based Composition

```javascript
// npc-composer.js — generates deterministic NPC stacks from a seed
var NpcComposer = (function() {
  'use strict';

  var HEADS   = ['👤','👦','👧','👨','👩','🧑','👴','👵','🧙','🧝'];
  var HATS    = ['', '', '⛑️','🎩','👒','🪖','🧢','🎓'];  // weighted empty
  var TORSOS  = ['🧥','👔','👕','🥼','🦺','🎽','👘'];
  var WEAPONS = ['', '', '', '⚔️','🗡️','🏹','🛡️','🪓','🔧','🪄'];
  var LEGS    = ['👖','👖','👖','🩳','🥾','👗'];

  function compose(seed) {
    // Deterministic selection from seed bits
    var h  = HEADS[seed % HEADS.length];
    var ha = HATS[Math.floor(seed / 13) % HATS.length];
    var t  = TORSOS[Math.floor(seed / 97) % TORSOS.length];
    var w  = WEAPONS[Math.floor(seed / 211) % WEAPONS.length];
    var l  = LEGS[Math.floor(seed / 331) % LEGS.length];
    var hue = (seed * 137) % 360;  // Color tint

    return {
      head: h, torso: t, legs: l,
      hat: ha || null,
      hatScale: 0.5,
      hatBehind: false,
      frontWeapon: w || null,
      frontWeaponScale: 0.65,
      frontWeaponOffsetX: -0.25,
      tintHue: hue,
      corpse: '💀'
    };
  }

  return { compose: compose };
})();
```

With 10 heads, 8 hats, 7 torsos, 10 weapons, 6 legs, and 360 hue values: **10 × 8 × 7 × 10 × 6 × 360 = 12,096,000** unique combinations. Deterministic from seed — same NPC always looks the same.

### 5.3 Color Tint Overlay

Applied as a translucent hue-shifted rect over the entire stack after all slots render:

```javascript
if (stack.tintHue !== null) {
  ctx.save();
  // Convert hue to RGB for overlay
  var rgb = _hueToRgb(stack.tintHue);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.15;  // Subtle — tints clothing, not overwhelms
  ctx.fillStyle = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
  ctx.fillRect(drawX, drawY, spriteW, spriteH);
  ctx.restore();
}
```

---

## Phase 6: Directional Awareness ✅ IMPLEMENTED

**Status**: Complete | **Files**: `raycaster.js` (stack render path)

### 6.1 Facing-Dependent Layer Visibility

The existing raycaster already computes a `faceDot` (-1 back, +1 front) and applies a directional darkening overlay. The stack system extends this with layer-specific behavior:

**Front-facing (dot > 0.3):**
- All slots visible at full brightness
- `frontWeapon` visible, `backWeapon` hidden (occluded by body)
- `hat` with `behind: false` visible over head

**Side-facing (|dot| < 0.3):**
- Weapon sub-layers rendered at 70% scale (foreshortened)
- Hat shifts slightly in facing direction
- Existing Euler flattening (spriteW narrows) applies to whole stack

**Back-facing (dot < -0.3):**
- Head emoji dims to 60% alpha (implied "back of head")
- `frontWeapon` hidden, `backWeapon` visible (slung over shoulder)
- `hat` always visible (crowns/helmets seen from behind)
- Existing directional darkening overlay applies to whole stack
- Optional: CSS-like `scaleY: 0.96` squash on head for NPC_IDEAS.md depth trick

```javascript
// In _renderStack():
var faceDot = _computeFaceDot(s.facing, item);

// Layer visibility
var showFrontWeapon = faceDot > -0.1;
var showBackWeapon  = faceDot < 0.2;
var headDim = faceDot < -0.3 ? 0.6 : 1.0;  // Dim head when facing away
var headSquash = faceDot < -0.3 ? 0.96 : 1.0;  // Slight Y compression

// Weapon foreshortening at side angles
var weaponScale = Math.abs(faceDot) < 0.3 ? 0.7 : 1.0;
```

### 6.2 Travel-Away Darkening

Already implemented in the raycaster's directional facing shade block (lines 1011-1036). This applies to the entire sprite rect. For the stack version, the same overlay applies after all slots render — no change needed. The head-dim above is an additional per-slot refinement on top of the global darkening.

---

## Phase 7: Vendor & Half-Height Counter NPCs ✅ IMPLEMENTED

**Status**: Complete | **Files**: `raycaster.js`, `npc-composer.js`, `game.js`

### 7.1 Half-Height Counter Tile

Vendor NPCs stand behind counter tiles — a wall-height tile rendered at 50% height that occludes the lower half of the sprite. The counter tile already exists conceptually (shop counters in the Biome Plan). The sprite system needs a `counterOcclude` flag:

```javascript
// Vendor behind counter: legs hidden by counter tile
_sprites.push({
  ...vendorStack,
  counterOcclude: true,  // Raycaster clips bottom 40% of sprite
  scale: 0.7             // Slightly larger than standard enemy
});
```

### 7.2 Counter Occlusion Render

```javascript
if (s.counterOcclude) {
  // Clip rendering to upper 60% of sprite (legs hidden by counter)
  ctx.save();
  ctx.beginPath();
  ctx.rect(screenX - spriteW, spriteCenterY - spriteH * 0.5, spriteW * 2, spriteH * 0.6);
  ctx.clip();
  // ... render stack normally ...
  ctx.restore();
}
```

### 7.3 Vendor Composition Example

```javascript
registerStack('vendor_wizard', {
  head:  '🧙',
  torso: '🟦',             // Blue robe (counter blocks lower half)
  legs:  '🥾',             // Present but occluded by counter
  frontWeapon: '🥍',       // Staff held in front
  frontWeaponScale: 0.65,
  frontWeaponOffsetX: 0.25,
  hat: null,                // Wizard hat is part of 🧙 glyph
  tintHue: 220,            // Blue tint for magical merchant
  corpse: null              // Vendors don't die
});
// Visual: 🧙🥍🟦 visible above counter, 🥾 hidden below
```

### 7.4 Other Vendor Types

| Vendor | Stack | Counter | Notes |
|--------|-------|---------|-------|
| **Weapon Smith** | `[👨, ⚒️🧥, 👖]` | Yes | Hammer in hand, apron |
| **Potion Brewer** | `[🧝, 🧪🥼, 👖]` | Yes | Lab coat, test tube |
| **Fence (black market)** | `[🥷, 🗡️🖤, 👖]` | Yes | Dark torso, dagger |
| **Guild Master** | `[👴, 📜👔, 👖]` | Yes | Scroll, formal wear |
| **Tide Faction Rep** | `[🧑, 🛡️🦺, 🥾]` | Yes | Shield, vest, boots |

---

## Phase 8: Hero (Antagonist) Stack ✅ IMPLEMENTED

**Status**: Complete (registered in Phase 1 initDefaults) | **Files**: `enemy-sprites.js`

### 8.1 Hero Stack Definition

The hero is the player's primary antagonist — a living creature, not a sword icon. The stack gives them a menacing humanoid presence:

```javascript
registerStack('hero_seeker', {
  head:  '😤',              // Determined face — reads as human antagonist
  torso: '🥷',              // Dark tactical gear
  legs:  '🥾',              // Combat boots
  hat:   '⛑️',              // Helmet
  hatScale: 0.5,
  hatBehind: false,
  frontWeapon: '⚔️',        // Signature dual blades
  frontWeaponScale: 0.75,
  frontWeaponOffsetX: -0.2,
  backWeapon: '🛡️',         // Shield on back
  backWeaponScale: 0.4,
  backWeaponOffsetX: 0.3,
  tintHue: 45,              // Warm gold tint — legendary aura
  corpse: '💀'              // If player ever defeats the hero
});
```

### 8.2 Hero Type Variants

The four hero archetypes from `TUTORIAL_WORLD_ROADMAP.md §14` get distinct stacks:

| Type | Head | Torso | Legs | Hat | Weapon | Back |
|------|------|-------|------|-----|--------|------|
| **Seeker** | 😤 | 🥷 | 🥾 | ⛑️ | ⚔️ | 🛡️ |
| **Scholar** | 🧐 | 🥼 | 👖 | 🎓 | 🪄 | 📜 |
| **Shadow** | 😈 | 🖤 | 🦿 | (none) | 🗡️ | 🏹 |
| **Crusader** | 😠 | 🦺 | 🥾 | 👑 | 🔱 | 🛡️ |

### 8.3 Hero Encounter Visual

When the hero walks away from the player (Floor 0.1.1 intro), the directional awareness system kicks in: head dims, front weapon hides, back shield becomes visible, and the global darkening overlay makes them a receding silhouette. The kaomoji capsule stays hidden during exploration — the hero never flashes intent outside of direct combat.

---

## Default Enemy Stack Registry

Remapping all 10 current `initDefaults()` entries plus the hero:

```javascript
function initDefaults() {
  // Cellar biome
  registerStack('goblin',    { head:'👹', torso:'🧥', legs:'👖', corpse:'💀' });
  registerStack('skeleton',  { head:'💀', torso:'🦴', legs:'🦿',
                               frontWeapon:'⚔️', frontWeaponScale:0.5, corpse:'🦴' });
  registerStack('slime',     { head:'',   torso:'🟢', legs:'',
                               torsoMods:[{emoji:'💧',scale:0.25,offsetX:0.3,offsetY:-0.2}],
                               corpse:'💧' });
  registerStack('bat',       { head:'🦇', torso:'',   legs:'', corpse:'🪶' });
  registerStack('ghost',     { head:'👻', torso:'',   legs:'',
                               headMods:[{emoji:'✨',scale:0.2,offsetX:0.3,offsetY:0.1}],
                               corpse:'✨' });
  registerStack('rat',       { head:'🐀', torso:'',   legs:'', corpse:'🦴' });
  registerStack('spider',    { head:'🕷️', torso:'',   legs:'',
                               headMods:[{emoji:'🕸️',scale:0.4,offsetX:-0.3,offsetY:-0.1}],
                               corpse:'🕷️' });
  registerStack('mimic',     { head:'📦', torso:'👄', legs:'', corpse:'💰' });
  registerStack('golem',     { head:'🗿', torso:'🤖', legs:'🦿', corpse:'🪨' });
  registerStack('dragon',    { head:'🐉', torso:'',   legs:'',
                               headMods:[{emoji:'🔥',scale:0.35,offsetX:0.3,offsetY:0.2}],
                               corpse:'🐲' });

  // Hero types
  registerStack('hero_seeker',   { head:'😤', torso:'🥷', legs:'🥾',
                                   hat:'⛑️', hatScale:0.5,
                                   frontWeapon:'⚔️', frontWeaponScale:0.75,
                                   corpse:'💀' });
  registerStack('hero_scholar',  { head:'🧐', torso:'🥼', legs:'👖',
                                   hat:'🎓', hatScale:0.5,
                                   frontWeapon:'🪄', frontWeaponScale:0.6,
                                   corpse:'💀' });
  registerStack('hero_shadow',   { head:'😈', torso:'🖤', legs:'🦿',
                                   frontWeapon:'🗡️', frontWeaponScale:0.6,
                                   backWeapon:'🏹', backWeaponScale:0.4,
                                   corpse:'💀' });
  registerStack('hero_crusader', { head:'😠', torso:'🦺', legs:'🥾',
                                   hat:'👑', hatScale:0.5,
                                   frontWeapon:'🔱', frontWeaponScale:0.7,
                                   backWeapon:'🛡️', backWeaponScale:0.4,
                                   corpse:'💀' });
}
```

---

## Implementation Order & Cross-Roadmap Mapping

| Phase | Est | Depends On | Cross-Roadmap |
|-------|-----|------------|---------------|
| **Phase 1**: Core stack renderer | 3h | — | T1.5 (telegraph), A1 | ✅ |
| **Phase 2**: Kaomoji intent capsule | 2h | Phase 1 | T1.5 (telegraph), A1 | ✅ |
| **Phase 3**: Wobble & bob + ragdoll death | 1.5h | Phase 1 | T1.5 polish, A2 (corpse) | ✅ |
| **Phase 4**: Suit-based creature variants | 2h | Phase 1 | A2 (corpse tile visual) | ✅ |
| **Phase 5**: NPC composer + color | 2.5h | Phase 1 | Phase D (hero AI needs visible heroes) | ✅ |
| **Phase 6**: Directional awareness | 2h | Phase 1 | Phase D (hero patrol facing) | ✅ |
| **Phase 7**: Vendor counters | 1.5h | Phase 1, 6 | Phase B (shop round-trip) | ✅ |
| **Phase 8**: Hero stacks | 1h | Phase 1, 5, 6 | Phase D (hero system) | ✅ |

**Total estimate**: ~15.5h (~15.5h complete, ~1.5h remaining for Phase 2b)

**Jam-complete phases**: 1, 2, 3, 4, 5, 6, 7, 8. Remaining: Phase 2b (kaomoji polish) is post-jam polish.

---

## Backward Compatibility

The stack system is additive. Every existing code path continues to work:

- `computeFrame()` still returns `.emoji` (the head slot, or legacy single emoji)
- Raycaster checks `s.stack` first — if null, falls back to `s.emoji` rendering
- `registerPoses()` still works — old registrations produce single-emoji sprites
- Enemy data JSON doesn't need to change — stacks are registered in code, not data
- CorpseRegistry, DeathAnim, and all FX systems receive the same sprite object shape

---

*This document is a sub-roadmap of TABLE_OF_CONTENTS_CROSS_ROADMAP.md, Tier 1.5 (Combat Polish — Enemy Attack Telegraph). Implementation begins when Phase A combat tasks are complete.*
