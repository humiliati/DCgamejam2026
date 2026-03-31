# Sprite Library Plan — Particle FX & Economic Juice

> **Constraint:** webOS TV app. Total asset budget ~500KB for all sprites.
> Current UI sprites: 30 files, 92KB. Plenty of headroom.

## Current rendering approaches

| Approach | Used for | Weight |
|----------|----------|--------|
| Procedural canvas | Wall/door textures (TextureAtlas) | 0KB disk, ~2MB runtime |
| Loaded PNG | UI frames/bars/buttons (UISprites) | 92KB |
| Emoji composition | Enemy sprites, item icons, particle FX | 0KB |

The emoji approach is zero-weight and renders everywhere (webOS Chromium includes full emoji coverage). It's the right default for jam. Loaded sprites are reserved for elements that need multi-frame animation or sub-pixel precision.

---

## Jam-reasonable sprites (must-have by April 5)

These can ship with the jam build and stay under 150KB total added weight.

### 1. Coin flip (6 frames) — READY in EyesOnly

**Source:** `EyesOnly/public/assets/Sprites/Coin/Coin Flip (animation frames)/`

| Frame | File | Size |
|-------|------|------|
| goldcoin-frame1.png | Front face | 14KB |
| goldcoin-frame2.png | Slight tilt | 11KB |
| goldcoin-frame3.png | Quarter turn | 8KB |
| goldcoin-frame4.png | Edge-on | 6KB |
| goldcoin-frame5.png | Back quarter | 9KB |
| goldcoin-frame6.png | Back face | 13KB |

**Total: ~61KB** for gold. Silver set also available (~61KB).

**Usage:** Replace emoji `🪙` in ParticleFX coin presets with animated sprite frames. Each coin particle cycles through frames at 12fps (83ms/frame). This gives the ConstellationRewards coin-rain feel.

**Integration path:** Add to UISprites manifest as `coin-f1` through `coin-f6`. ParticleFX checks for sprite availability and falls back to emoji.

### 2. Smoke poof (5 frames) — READY in EyesOnly

**Source:** `EyesOnly/public/assets/Sprites/Smoke/FX001/`

| Frame | Desc | Size |
|-------|------|------|
| FX001_0.png | Tiny wisp | ~3KB |
| FX001_1.png | Expanding | ~4KB |
| FX001_2.png | Full cloud | ~5KB |
| FX001_3.png | Dissipating | ~4KB |
| FX001_4.png | Fading | ~3KB |

**Total: ~19KB**

**Usage:** Replace emoji `💨` in `itemPoof` preset. Renders at 60ms/frame for a 300ms poof animation. Used for: incinerator destroy, consumable use, key consumption.

### 3. Light burst (5 frames) — READY in EyesOnly

**Source:** `EyesOnly/public/assets/Sprites/LightFX/FX003/`

**Total: ~15KB**

**Usage:** Replace `✨` sparkle in `equipFlash` and `sparkle` presets. 50ms/frame for a 250ms flash. Used for: equip, level up, door unlock.

### Jam sprite budget

| Asset | Frames | Size | Priority |
|-------|--------|------|----------|
| Gold coin flip | 6 | 61KB | P0 — coin rain |
| Smoke poof FX001 | 5 | 19KB | P0 — consume/destroy |
| Light burst FX003 | 5 | 15KB | P1 — equip/sparkle |
| **Jam total** | **16** | **~95KB** | |

Combined with existing 92KB UI sprites: **~187KB total sprite weight.** Well under budget.

---

## Post-jam sprites (stretch — full TV polish)

These are for the webOS Content Store build. Higher-fidelity replacements for emoji-rendered elements.

### 4. Silver coin flip (6 frames)

Same structure as gold. Used for secondary currency or card-game chip visualization.

**Size: ~61KB**

### 5. Fireball (moving + explosion)

**Source:** `EyesOnly/public/assets/fireBallStylOo/`

| Set | Frames | Size |
|-----|--------|------|
| Moving fireball | 7 | ~35KB |
| Explosion | 5 | ~29KB |

**Usage:** Combat spell card visuals. Replaces `💥` combat particle with animated fireball travel + impact. Triggered by fire-type card plays.

### 6. Impact/knockback FX002 (8 frames)

**Source:** `EyesOnly/public/assets/Sprites/Smoke/FX002/`

**Size: ~32KB**

**Usage:** Melee hit impact. Replaces `💥` in `dmgFlash` preset with directional impact burst.

### 7. Heal particle (needs creation)

Green sparkle / heart pulse animation. 4-6 frames.

**Estimated size: ~20KB**

**Usage:** Replace `💚` in `healPulse` preset with purpose-drawn heal effect.

### 8. Card suit particles (needs creation)

One sprite per suit: ♣ ♦ ♠ ♥ in particle form (glowing, slightly stylized).

**Estimated size: ~16KB** (4 sprites × ~4KB)

**Usage:** Synergy toast particles — when a card combo triggers, the matching suit symbol bursts from the card fan.

### 9. Status effect icons (needs creation or sourced)

Small 16×16 or 24×24 icons for each StatusEffect type. Currently rendered as emoji text.

**Estimated: ~24KB** (8 effects × ~3KB)

**Usage:** StatusEffectHUD, Face 1 journal status list, in-world debuff indicators.

### Post-jam sprite budget

| Asset | Frames | Size | Priority |
|-------|--------|------|----------|
| Silver coin flip | 6 | 61KB | P2 |
| Fireball moving | 7 | 35KB | P2 |
| Fireball explosion | 5 | 29KB | P2 |
| Impact FX002 | 8 | 32KB | P2 |
| Heal particle | 5 | 20KB | P3 |
| Card suit particles | 4 | 16KB | P3 |
| Status icons | 8 | 24KB | P3 |
| **Post-jam total** | **43** | **~217KB** | |

**Grand total (jam + post-jam): ~59 frames, ~312KB**

Combined with UI sprites: **~404KB total.** Comfortably under the 500KB budget for a TV app.

---

## Integration architecture

### SpriteSheet module (new, ~80 lines)

Loads sprite frame sequences and provides per-frame access:

```
var SpriteSheet = (function() {
  var _sheets = {};  // name → { frames: Image[], loaded: bool }

  function load(name, paths, onReady) { ... }
  function getFrame(name, frameIndex) { return _sheets[name].frames[idx]; }
  function isLoaded(name) { return !!_sheets[name] && _sheets[name].loaded; }

  return Object.freeze({ load, getFrame, isLoaded });
})();
```

### ParticleFX sprite rendering path

When a sprite sheet is loaded, ParticleFX switches from `ctx.fillText(emoji)` to `ctx.drawImage(frame)`:

```
// In render():
if (p.spriteSheet && SpriteSheet.isLoaded(p.spriteSheet)) {
  var frameIdx = Math.floor((p.maxLife - p.life) / p.frameInterval) % p.frameCount;
  var frame = SpriteSheet.getFrame(p.spriteSheet, frameIdx);
  ctx.drawImage(frame, p.x - drawSize/2, p.y - drawSize/2, drawSize, drawSize);
} else {
  ctx.fillText(p.emoji, p.x, p.y);  // emoji fallback
}
```

### File placement

```
assets/
├── ui/              (existing — 30 files)
├── fx/
│   ├── coin/        goldcoin-frame1..6.png
│   ├── smoke/       FX001_0..4.png
│   └── light/       FX003_0..4.png
```

All loaded lazily after game init. Missing sprites gracefully degrade to emoji rendering.

---

## Decision: jam build approach

For the April 5 deadline, **emoji-only particles ship.** The ParticleFX module uses emoji rendering which works everywhere, looks good on canvas, and adds zero asset weight.

The coin sprite frames get **copied from EyesOnly into `assets/fx/coin/`** as a stretch goal if time permits on April 4-5. The SpriteSheet module and ParticleFX sprite rendering path are documented here for the post-jam polish pass.

This keeps the jam build lightweight and offline-ready while the sprite integration is a clean bolt-on upgrade.
