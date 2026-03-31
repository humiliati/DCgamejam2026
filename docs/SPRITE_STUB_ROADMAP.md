# Sprite Stub Roadmap

> How the codebase gets from "everything is emoji" to "artist sprites
> with emoji fallback" — the code-side implementation plan.
>
> Companion to SPRITE_COMMISSIONING_MAP.md (what the artist draws).
> This doc covers what the programmer builds.

---

## Current state

Three systems already render visual entities:

1. **Raycaster billboard** — draws enemy/item emoji via `ctx.fillText()`
   at billboard scale. Enemy triple-stack uses per-slot emoji (head,
   torso, legs). Items are single emoji.

2. **ParticleFX** — screen-space particles. Already has a sprite path:
   checks `SpriteSheet.isLoaded(name)`, draws `ctx.drawImage()` if
   available, falls back to `ctx.fillText(emoji)`.

3. **HUD / menus** — card fan, crate UI, menu faces all draw emoji with
   `ctx.fillText()`. Card art is the card's emoji field. Item icons in
   inventory are the item's emoji field.

Every entity carries an `emoji` string in its data (enemies.json,
items.json, cards.json, npc-system.js). That string is the universal
visual identity today.

---

## Goal

Add a **static sprite layer** between artist PNGs and emoji fallback:

```
Artist PNG  →  StaticSprite.get(id)  →  Image or null
                     ↓ null
              entity.emoji fallback
```

Artist delivers a PNG → drop it in `assets/sprites/` → the entity
renders with the sprite. No artist PNG yet? Emoji still works. Zero
breakage, purely additive.

---

## Architecture: StaticSprite module

A new Layer 1 IIFE module: `engine/static-sprite.js`.

Simpler than SpriteSheet (which handles multi-frame animation).
StaticSprite maps entity IDs to single static Image objects.

### API

```javascript
var StaticSprite = (function () {
  'use strict';

  var _sprites = {};   // id → { img: Image, loaded: boolean }

  /**
   * Register a sprite for an entity ID.
   * @param {string} id    — entity ID (e.g. 'ENM-025', 'ITM-102')
   * @param {string} path  — PNG file path
   * @param {Function} [onReady]
   */
  function register(id, path, onReady) { ... }

  /**
   * Get the loaded Image for an entity ID. Returns null if not loaded.
   * @param {string} id
   * @returns {Image|null}
   */
  function get(id) { ... }

  /**
   * Check if a sprite is loaded for this ID.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) { ... }

  /**
   * Batch-register from a manifest object.
   * @param {Object} manifest — { 'ENM-025': 'assets/sprites/enemies/ENM-025-biohazard-slime.png', ... }
   */
  function registerManifest(manifest) { ... }

  return Object.freeze({ register, get, has, registerManifest });
})();
```

### Manifest file

`assets/sprites/manifest.js` — a Layer 0 data file that maps entity
IDs to file paths. Loaded before StaticSprite so the paths are
available at init.

```javascript
var SPRITE_MANIFEST = {
  // Tier 1a — broken substitutions
  'ENM-025':  'assets/sprites/enemies/ENM-025-biohazard-slime.png',
  'ITM-102':  'assets/sprites/items/ITM-102-vital-organ.png',
  'NPC-watchman': 'assets/sprites/npcs/NPC-watchman.png',

  // Tier 1b — tofu risk
  'ITM-spyglass': 'assets/sprites/items/ITM-spyglass.png',
  'ITM-coral':    'assets/sprites/items/ITM-coral.png',
  'ITM-hook':     'assets/sprites/items/ITM-hook.png',

  // Cards use ACT-xxx IDs
  'ACT-068': 'assets/sprites/cards/ACT-068-cryo-cocoon.png',
  'ACT-117': 'assets/sprites/cards/ACT-117-final-stand.png',
  'ACT-141': 'assets/sprites/cards/ACT-141-hemorrhage.png',
  'ACT-025': 'assets/sprites/cards/ACT-025-amber-lock.png',

  // Tier 2 entries added as artist delivers...
};
```

### Fallback chain at render sites

Each render site gets a one-line change:

```javascript
// Before (emoji only):
ctx.fillText(entity.emoji, x, y);

// After (sprite → emoji):
var sprite = StaticSprite.get(entity.id);
if (sprite) {
  ctx.drawImage(sprite, x - w/2, y - h/2, w, h);
} else {
  ctx.fillText(entity.emoji, x, y);
}
```

Render sites to patch (5 total):

| Site | File | What it draws |
|------|------|--------------|
| Enemy billboard | raycaster.js `_renderBillboardEmoji()` | Enemy emoji at world position |
| Item billboard | raycaster.js `_renderItemSprites()` | Floor items at world position |
| Card fan | card-fan.js | Card emoji on hand cards |
| Crate UI | crate-ui.js | Item emoji in loot grid |
| Menu faces (inventory) | menu-faces.js | Item emoji in bag/equip slots |

Each site already has the entity's `id` in scope (or can trivially
access it from the data object). The patch is purely additive — if
`StaticSprite.get()` returns null, the existing emoji path runs
unchanged.

---

## Procedural stubs (optional, post-jam)

If we want placeholders before the artist delivers, StaticSprite can
generate them at runtime using canvas:

```javascript
function generateStub(id, size, bgColor, label) {
  var c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  var ctx = c.getContext('2d');

  // Colored circle with entity ID text
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#000';
  ctx.font = Math.floor(size * 0.25) + 'px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label || id, size/2, size/2);

  // Cache as an Image
  var img = new Image();
  img.src = c.toDataURL();
  return img;
}
```

Color coding by entity type:
- Enemies: red circle
- Items: gold circle
- Cards: blue circle
- NPCs: green circle
- UI/faction: grey circle

This is a **debug/dev tool**, not a shipping feature. It lets us see
at a glance which sprites are still stubs vs real art. For the jam,
emoji fallback is the shipping visual — stubs are never shown to
players.

---

## Implementation order

### Phase 1 — Jam (by April 5)

Ship with emoji-only rendering. The SpriteSheet module handles the
three animated FX sequences (coin, smoke, light) that are already in
`assets/fx/`. No static sprite system needed for jam deadline.

**What ships:**
- SpriteSheet + ParticleFX sprite rendering (already done)
- All entities render via emoji (already working)
- Tofu-risk emoji replaced with safe alternatives (already done)

### Phase 2 — Post-jam week 1

Build the StaticSprite module and manifest system.

1. Create `engine/static-sprite.js` (IIFE, Layer 1)
2. Create `assets/sprites/manifest.js` (Layer 0 data)
3. Add both `<script>` tags to index.html
4. Wire `StaticSprite.registerManifest(SPRITE_MANIFEST)` in Game.init()
5. Patch raycaster billboard to check StaticSprite before emoji
6. Patch card-fan to check StaticSprite before emoji
7. Patch crate-ui to check StaticSprite before emoji
8. Patch menu-faces inventory slots to check StaticSprite before emoji

**Test:** Drop a test PNG into `assets/sprites/enemies/` for one
entity. Verify it renders in-world as a billboard sprite and in menus.
Verify removing the PNG falls back to emoji.

### Phase 3 — Post-jam week 2+

Artist delivers Tier 1 sprites (12 PNGs). Drop into `assets/sprites/`,
add entries to manifest.js, done. No code changes needed per sprite.

### Phase 4 — Polish

- Tier 2 disambiguation sprites (15-20 PNGs)
- Procedural stub generator for dev builds
- Tier 3 polish sprites (40+ PNGs, ongoing)
- Enemy triple-stack sprite overhaul (replace head/torso/legs emoji
  with composed sprite sheets — big lift, separate design doc)

---

## File tree after Phase 2

```
engine/
├── static-sprite.js          (NEW — Layer 1)
├── sprite-sheet.js            (existing — animated FX)
└── ...

assets/
├── fx/                        (existing — animated sequences)
│   ├── coin/
│   ├── smoke/
│   └── light/
└── sprites/                   (NEW — static entity sprites)
    ├── manifest.js            (ID → path map)
    ├── enemies/
    │   ├── ENM-025-biohazard-slime.png
    │   └── ...
    ├── items/
    │   ├── ITM-102-vital-organ.png
    │   └── ...
    ├── cards/
    │   ├── ACT-068-cryo-cocoon.png
    │   └── ...
    ├── npcs/
    │   └── NPC-watchman.png
    └── ui/
        ├── faction-foundry.png
        └── faction-tide.png
```

---

## Relationship to SpriteSheet

Two separate systems, complementary:

| | SpriteSheet | StaticSprite |
|---|---|---|
| Purpose | Animated frame sequences | Single static images |
| Used by | ParticleFX (coins, smoke, light) | Raycaster, card-fan, menus |
| Key type | Sequence name ('coin') | Entity ID ('ENM-025') |
| Frame count | 5-6 frames | 1 frame |
| Exists now | Yes | Post-jam |
| Fallback | ParticleFX emoji path | Render-site emoji path |

Both follow the same pattern: caller checks availability → draws
sprite if present → falls back to emoji if not. No forced dependency
between them.

---

## Size budget

Per SPRITE_LIBRARY_PLAN.md:

- **Jam:** ~95KB total (coin + smoke + light FX only)
- **Tier 1 (12 sprites):** ~24KB at 32×32 PNG (~2KB each)
- **Tier 2 (20 sprites):** ~40KB
- **Tier 3 (40 sprites):** ~80KB
- **Total post-jam:** ~240KB sprite payload

Well within webOS app size limits. The entire sprite directory
compresses to ~150KB gzipped.
