# Sprite Commissioning Map

> What an artist needs to draw, why, and in what order.
>
> The game currently renders everything as emoji on canvas.
> Some emoji read well at game scale. Others are tofu, generic
> blobs, or just don't communicate what the thing is. This doc
> maps out exactly what needs to become a real sprite.

---

## How emoji rendering works now

Every visual entity (enemy, item, card, NPC) carries an `emoji`
field. The raycaster billboards it. The HUD/menu draws it with
`ctx.fillText()`. At 16-24px on canvas, some emoji are crisp and
recognizable. Others collapse into colored smudges.

The sprite pipeline doesn't replace all emoji — it supplements.
When `SpriteSheet.isLoaded('coin')` returns true, ParticleFX
draws the coin sprite frame. When it returns false, it draws 💰.
This same pattern extends to enemies, items, everything.

---

## Tier 0 — Already commissioned (EyesOnly assets)

These exist as PNG frames and are already copied into `assets/fx/`.

| Asset | Frames | Size | Status |
|-------|--------|------|--------|
| Gold coin flip | 6 × 96×144 | 60KB | ✅ In `assets/fx/coin/` |
| Smoke poof | 5 × 32×32 | ~1KB | ✅ In `assets/fx/smoke/` |
| Light burst | 5 × 32×32 | ~1KB | ✅ In `assets/fx/light/` |

---

## Tier 1 — Broken or meaningless at game scale

These emoji either tofu on some platforms, render as a generic
colored square, or communicate nothing about what the entity is.
**An artist must draw these for the game to read correctly.**

### 1a. Replaced-but-wrong (current substitutions are placeholder)

| Entity | Current | Problem | Needs |
|--------|---------|---------|-------|
| Rock corpse (golem/construct death) | ⬛ | Black square. Reads as "nothing." | 32×32 rubble pile, grey stone chunks |
| Bio-Hazard Slime | 💧 | Water droplet. Not a slime. | 32×32 toxic blob, green/purple, bubbling |
| Vital Organ (salvage) | ❤️ | Generic heart. Could be anything. | 24×24 organ in jar, clinical feel |
| Cryo Cocoon (card) | ❄️ | Snowflake. Not a cocoon. | Card-size ice chrysalis, blue glow |
| Hemorrhage (card) | 💀 | Skull. Already used for SHAKEN debuff + Bone Guard. Collision. | Card-size blood splash / wound icon |
| Final Stand (card) | 💗 | Pink heart. Doesn't say "last resort." | Card-size cracked shield or burning heart |
| Amber Lock (card) | 🔒 | Generic padlock. Not amber. | Card-size golden amber crystal with trapped insect |
| Watchman NPC | 🎖️ | Medal. Not a person. | 32×48 uniformed guard, lantern |

### 1b. Emoji that are tofu or nearly unreadable at small sizes

| Entity | Current | Problem | Needs |
|--------|---------|---------|-------|
| Spyglass (item) | 🔭 | Telescope renders tiny/dark on many platforms | 24×24 brass telescope, retro |
| Maelstrom / special cards | 🌀 | Spiral. Indistinct at 16px. | Card-size vortex, water spiral |
| Coral (item) | 🪸 | Emoji 14.0. Tofu on older systems. | 24×24 pink/orange coral branch |
| Hook (item) | 🪝 | Emoji 13.0. Tofu risk. | 24×24 grappling hook, iron |

**Tier 1 total: ~12 sprites. Mix of 24×24 items and 32×32/32×48 characters.**

---

## Tier 2 — Works but generic (same emoji, different entity)

These emoji render fine but are reused across multiple unrelated
entities, causing visual confusion. Artist sprites differentiate them.

| Emoji | Used for | Collision risk | Needs |
|-------|----------|---------------|-------|
| ⚙️ | Metal Scrap (item), Clockwork Guard (enemy), Overclock (card), Foundry faction icon | 4-way collision | Different visual per role: gear-shaped scrap, armored construct, lightning-gear card art, faction badge |
| 💀 | Bone Guard (enemy), Dead Weight (card), SHAKEN debuff, Hemorrhage (card) | 4-way collision (Hemorrhage now 💀 too) | Skeleton warrior, dead weight card, shaken face, blood icon |
| 🔥 | Dragon Ember (item), Cinder Strike (card), bonfire UI, burning status | 3-way collision | Ember crystal vs flame card art vs campfire icon |
| 🔨 | Forge Hammer (item), Hammer enemy | 2-way collision | Tool vs weapon |
| ✨ | Sparkle particle, enemy modifier, Arcane card | 3-way collision | Different sparkle per context |

**Tier 2 total: ~15-20 variant sprites to disambiguate.**

---

## Tier 3 — Reads well enough as emoji (low priority)

These are recognizable at game scale and thematically appropriate.
Artist sprites would be nice-to-have polish but aren't blocking.

| Category | Examples | Why they work |
|----------|----------|--------------|
| Animal enemies | 🕷️ 🐀 🐸 🐺 🦈 🐍 🦀 | Distinct silhouettes, read at any size |
| Humanoid enemies | 👺 🧟 👤 👑 🤖 | Face-shaped, immediately recognizable |
| Food items | 🐟 🍞 🌿 | Universal food icons |
| Keys | 🗝️ 🔑 | Everyone knows what a key looks like |
| Resources | 🔋 ⚡ 💎 | High-contrast, distinct shapes |
| Bones | 🦴 | Clear at any size |
| Dragon | 🐉 | Iconic, reads well |
| Hearts/healing | 💚 ❤️ 💗 | Color-coded, universal |
| Card suits | ♠ ♣ ♦ ♥ | Text glyphs, always crisp |
| NPC faces | 🧑 👨 👩 👴 🧓 🧔 | Person variants, decent at 32px+ |
| Combat | 💥 ⚔️ 🛡️ | Universal game icons |

**Tier 3 total: ~40 sprites. Post-jam polish only.**

---

## Commission spec sheet

### Format requirements

- **Canvas rendering**: all sprites are drawn via `ctx.drawImage()` on a `<canvas>`. No CSS, no DOM.
- **Size targets**: 32×32 (enemies, particles), 24×24 (items, icons), 48×64 (NPCs if we do portraits), card art TBD
- **Background**: transparent PNG
- **Color palette**: warm cream/ink/hazmat yellow per VISUAL_OVERHAUL.md, with faction tints (Tide=teal, Foundry=orange, Admiralty=blue)
- **Style**: the game uses a "clinical hazmat / corporate paperwork" aesthetic. Think government forms crossed with dungeon field kits. Line art with flat color fills, not photorealistic.
- **Animation**: only coin flip (already done), smoke poof (already done), and light burst (already done) need animation frames. Everything else is static.

### Delivery format

Single PNG per sprite, named by entity ID:

```
assets/sprites/
├── enemies/
│   ├── ENM-025-biohazard-slime.png    (32×32)
│   ├── ENM-XXX-corpse-rubble.png      (32×32)
│   └── ...
├── items/
│   ├── ITM-102-vital-organ.png        (24×24)
│   ├── ITM-XXX-coral.png              (24×24)
│   └── ...
├── cards/
│   ├── ACT-068-cryo-cocoon.png        (card art TBD)
│   ├── ACT-117-final-stand.png
│   ├── ACT-141-hemorrhage.png
│   ├── ACT-025-amber-lock.png
│   └── ...
├── npcs/
│   ├── NPC-watchman.png               (32×48)
│   └── ...
└── ui/
    ├── faction-foundry.png            (24×24 badge)
    ├── faction-tide.png
    └── ...
```

### Priority order for commissioning

1. **Tier 1a** (broken substitutions): 8 sprites, ~2-3 hours artist time
2. **Tier 1b** (tofu risk): 4 sprites, ~1 hour
3. **Tier 2** (disambiguation): 15-20 variant sprites, ~4-6 hours
4. **Tier 3** (polish): 40+ sprites, ongoing

**Minimum viable commission: Tier 1a + 1b = 12 sprites.**

---

## What the codebase needs to support this

The SpriteSheet module already handles frame sequences. For static
sprites (single image, no animation), we need a simpler loader that
maps entity IDs to sprite images. See SPRITE_STUB_ROADMAP.md for
the implementation plan.

---

## Authoring surface (NPC Designer, Identity tab — as of 2026-04-17)

The NPC Designer (`tools/npc-designer.html`, NPC_TOOLING_ROADMAP §4.1
Phase 1.2) ships two fieldsets on the Identity tab that turn an NPC
record into a commissioning brief without leaving the tool.

### Emoji Stack fieldset

- **Mode radio** — *Composer (default)* leaves `npc.stack = null` and the
  runtime generates a seed-based stack via `NpcComposer.compose(seed,
  role)`. *Pin stack* materialises `npc.stack` as a concrete object the
  author can hand-tune.
- **7 slots** — head, torso, legs, plus the three sub-layers (hat,
  frontWeapon, backWeapon) with scale and behind/offsetX modifiers, plus
  a death-override corpse glyph. Matches SPRITE_STACK_ROADMAP §3 schema
  1-for-1 so the runtime consumes the pinned value directly.
- **Tint hue** — 0–360° slider with a "no tint" checkbox. `null` is
  distinct from `0` so the runtime can elide the hue-rotate filter.

Pinning the stack is the prerequisite for commissioning — artists need
an authoritative glyph set to design against, and the runtime needs a
deterministic anchor that survives seed drift.

### Sprite Commissions fieldset

A 6 × 4 grid (slots × intents) with a frame-count badge in each cell.
Click a cell to reveal an in-place frame editor below the grid. Each
row holds:

- **Asset ID** — editable text, auto-suggested as
  `NPC-<npcId>_<slot>_<intent>_<frame>` (e.g.
  `NPC-dispatcher_head_talk_00`). This is the key that will appear in
  `assets/sprites/manifest.js`.
- **Preview cell** — a file picker (Browse…) reads a local PNG via
  `FileReader` and shows it inline. The preview is session-scoped
  only — the browser can't write to `assets/sprites/npcs/`. Authors
  use this to dry-run a frame sequence before commissioning.
- **Remove** — drops the frame from the series.

Below the grid: **Manifest Preview** (dumps the computed asset-ID ↔
path mapping into the Raw Preview panel) and **Download Manifest
Fragment** (blob download of a JSON fragment — `_meta` + `entries` —
ready to merge into `assets/sprites/manifest.js`).

### Fallback chain at render time

1. `StaticSprite(assetId)` — if the PNG is loaded in the manifest, use it.
2. Emoji stack — the pinned or composer-generated stack.
3. `NpcComposer` default — final safety net.

Empty frame series at any cell silently falls through to the next
layer, so authoring is incremental: commission just the `head_walk`
series first, ship, then add `torso_walk` next week.

### Intents — what each series is for

| Intent | Use | Typical frame count |
|--------|-----|---------------------|
| locomotion | walk cycle, idle bob | 2–6 |
| interaction | opening doors, picking items, using stations | 2–4 |
| dialogue | speaking mouth / head tilt for conversations | 2–4 |
| combat | attack anticipation, strike, recovery | 3–6 |

An NPC that never fights (a vendor) leaves the combat row empty; the
Hero's Wake dungeon NPCs fill all four.

### Round-trip status (resolved 2026-04-17)

`tools/extract-npcs.js` preserves both `stack` and `sprites` end-to-end
as of DOC-110 Phase 0 Chapter 5. The normaliser's `normaliseStack()`
and `normaliseSprites()` helpers validate slot/intent keys and frame
shape on write, and `engine/npc-seed.js::_toRuntimeDef` forwards both
fields verbatim to `NpcSystem.register()` on read. `data/npcs.json` is
the sole runtime source of truth — the inline
`_registerBuiltinPopulations()` fallback was retired in the same
commit window. DOC-110 Phase 1.1 (2026-04-17) added `npcStack` /
`npcSprites` definitions to `tools/actor-schema.json` so both fields
are now schema-validated in the NPC Designer save path. See
NPC_TOOLING_ROADMAP (DOC-110) §4.1 Phase 1.2 + Phase 0 Chapter 5 +
Phase 1.1.
