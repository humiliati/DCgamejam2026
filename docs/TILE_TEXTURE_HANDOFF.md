# Tile Texture & Shape Handoff — DOC-115

> Concise spec for every tile needing new procedural textures, biome wiring, or architectural shape work.
> Written 2026-04-17. Feeds into DOC-105 Wave 1 blockout unblockers.

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Shipped — texture exists in `texture-atlas.js` |
| ⚠️ | Partial — texture exists but missing biome/contract wiring |
| ❌ | Needs work — no texture, no wiring |

---

## 1. Infrastructure Tiles (40–48) — Texture DONE, Wiring Gaps

All nine infrastructure tiles already have procedural texture generators in `texture-atlas.js` and spatial contract entries (height offsets, freeform configs, wall heights). The only gap is **biome palette registration** — three tiles are missing from `biome-map.json` entirely, so they never appear in biome-aware tools or spawners.

| ID | Constant | Texture | Biome Palettes | Contract | Action Needed |
|----|----------|---------|----------------|----------|---------------|
| 40 | WELL | ✅ `well_stone` | ✅ promenade, gardens | ✅ all 3 | None |
| 41 | BENCH | ✅ `bench_wood` | ✅ promenade, gardens, guild | ✅ all 3 | None |
| 42 | NOTICE_BOARD | ✅ `notice_board_wood` | ✅ promenade, frontier | ✅ all 3 | None |
| 43 | ANVIL | ✅ `anvil_iron` | ✅ frontier | ✅ all 3 | None |
| 44 | BARREL | ✅ `barrel_wood` | ✅ multiple biomes | ✅ all 3 | None |
| 45 | CHARGING_CRADLE | ✅ `charging_cradle` | ✅ guild, armory, cellar, catacomb | ✅ all 3 | **DONE** — wired 2026-04-17 |
| 46 | SWITCHBOARD | ✅ `switchboard_panel` | ✅ guild, armory, catacomb | ✅ all 3 | **DONE** — wired 2026-04-17 |
| 47 | SOUP_KITCHEN | ✅ `soup_cauldron` | ✅ bazaar, guild, inn, cellar | ✅ all 3 | **DONE** — wired 2026-04-17 |
| 48 | COT | ✅ `cot_canvas` | ✅ guild, warren | ✅ all 3 | None |

**Action items for tiles 45–47:** Add these to `biome-map.json` `accentTiles` arrays in the biomes listed above. No texture or contract work needed — purely data wiring.

---

## 2. Creature Verb Tiles (49–54) — Full Build Required

These six tiles represent creature behavior anchors placed throughout dungeon floors. They have ZERO procedural textures, ZERO biome palette entries, and minimal spatial contract support (only tile 52 has a floor texture). Each needs a new texture generator following the art direction in `texture-atlas.js` header comments.

### 2a. Walkable / Floor-Level Tiles (render as floor overlays)

These are walkable and non-opaque — they render as textured floor patches, not walls.

| ID | Constant | wallH | Visual Description | Texture Style |
|----|----------|-------|--------------------|---------------|
| 49 | ROOST | 0.0× | Overhead anchor point — ceiling hook/ring with dangling chain or perch bar. Since the camera looks forward (not up), render as a **floor shadow**: a dark circular shadow with faint chain-link pattern radiating from center. | NON-INTERACTIVE — large blocks, 3 tones (dark shadow center → mid ring → floor-colored edge). Floor texture only. |
| 52 | FUNGAL_PATCH | 0.0× | Bioluminescent mushroom cluster on dungeon floor. Glowing caps in teal/green on dark loam. Already has `floor_fungal_patch` generator and nested dungeon contract entry. | ✅ Floor texture exists. Needs wall texture stub (null OK — walkable tile). |
| 54 | TERRITORIAL_MARK | 0.0× | Claw gouges or scorch marks scratched into stone floor. Three diagonal slash marks with darkened edges, slightly raised stone chips around cuts. | NON-INTERACTIVE — 3 bold parallel scratches, dark-to-medium contrast against base stone. Floor texture only. |

### 2b. Wall-Like / Opaque Tiles (render as wall columns)

These are non-walkable and opaque — they render as full wall-height textured columns.

| ID | Constant | wallH | Visual Description | Texture Style |
|----|----------|-------|--------------------|---------------|
| 50 | NEST | 0.3× | Ground-level debris pile — woven sticks, torn cloth, bone fragments. Low mound shape. Browns/tans with white bone highlights. | NON-INTERACTIVE — chunky woven texture, irregular horizontal bands of brown/tan/bone-white. 3-tier shading. |
| 51 | DEN | 0.5× | Hollowed rock alcove — dark recessed opening in cave wall. Stone arch frame with deep shadow interior. | NON-INTERACTIVE — stone arch frame (medium grey blocks) surrounding dark void center. Frame uses large square blocks, interior is near-black with subtle texture. |
| 53 | ENERGY_CONDUIT | 0.8× | Exposed power junction — industrial conduit pipe with sparking gap. Metal pipe frame with glowing energy slit. Retrofuturistic brass/copper tones. | INTERACTIVE — detailed pipe frame with rivets, central glowing slit (cyan/electric blue). Higher detail since this is an interact target. |

### 2c. Texture Generator Signatures Needed

Each new generator follows the existing pattern in `texture-atlas.js`:

```
function _genRoostShadow(id, p)     // → 'roost_shadow'        (floor tex)
function _genTerritorialMark(id, p)  // → 'territorial_mark'    (floor tex)
function _genNest(id, p)             // → 'nest_debris'         (wall tex)
function _genDen(id, p)              // → 'den_alcove'          (wall tex)
function _genEnergyConduit(id, p)    // → 'energy_conduit'      (wall tex)
```

`FUNGAL_PATCH` (52) already has `_genFloorFungalPatch` — no new generator needed.
`ROOST` (49) needs only a floor texture (walkable, no wall column).

### 2d. Spatial Contract Entries Needed

Only the **nested dungeon** contract needs creature tiles (they don't appear on the surface or in shops).

| Tile | `tileHeightOffsets` | `tileShapes` | `tileFreeform` | `tileTextures` | `tileFloorTextures` |
|------|---------------------|--------------|----------------|----------------|---------------------|
| 49 ROOST | 0 | — | — | — | `'roost_shadow'` |
| 50 NEST | 0.03 | — | — | `'nest_debris'` | — |
| 51 DEN | 0.04 | — | — | `'den_alcove'` | — |
| 52 FUNGAL_PATCH | 0 | — | — | — | ✅ `'floor_fungal_patch'` |
| 53 ENERGY_CONDUIT | 0.05 | — | — | `'energy_conduit'` | — |
| 54 TERRITORIAL_MARK | 0 | — | — | — | `'territorial_mark'` |

---

## 3. Biome Palette Assignments

Where each new tile should appear in `biome-map.json`:

| Tile | Biomes (accentTiles) | Rationale |
|------|---------------------|-----------|
| 45 CHARGING_CRADLE | ✅ `guild`, `armory`, `cellar`, `catacomb` | Construct rest node — industrial/tech areas |
| 46 SWITCHBOARD | ✅ `guild`, `armory`, `catacomb` | Comms duty node — anywhere with infrastructure |
| 47 SOUP_KITCHEN | ✅ `bazaar`, `guild`, `inn`, `cellar` | Eat verb node — communal/civilian areas |
| 49 ROOST | ✅ `cellar`, `catacomb`, `depths` | Flying creature rest — underground vaults |
| 50 NEST | ✅ `cellar`, `catacomb` | Ground creature rest — tunnels, burrows |
| 51 DEN | ✅ `cellar`, `catacomb`, `depths` | Pack creature rest — larger caverns |
| 52 FUNGAL_PATCH | ✅ `cellar`, `catacomb`, `depths` | Organic creature eat — damp areas |
| 53 ENERGY_CONDUIT | ✅ `catacomb`, `depths` | Construct eat/rest — power infrastructure |
| 54 TERRITORIAL_MARK | ✅ `cellar`, `catacomb`, `depths` | Guard creature duty — patrol zones |

---

## 4. Priority Order

1. ~~**Biome wiring for tiles 45–47**~~ ✅ Done 2026-04-17
2. **Creature tile textures (50, 51, 53)** — wall-like tiles that will show as magenta fallback without textures. Highest visual impact.
3. **Creature floor textures (49, 54)** — floor overlays, less visually urgent but needed for complete dungeon authoring.
4. ~~**Biome wiring for tiles 49–54**~~ ✅ Done 2026-04-17
5. **Spatial contract entries for 49–54** — height offsets and texture mappings in nested dungeon contract.

---

## 5. Reference Material

- Art direction: `texture-atlas.js` header comments (lines 9–29)
- Existing infrastructure generators: `_genWellStone` through `_genSwitchboard` (texture-atlas.js lines 6163–6640)
- Spatial contract patterns: `spatial-contract.js` nested dungeon section
- Tile definitions: `tiles.js` lines 49–66
- Tile schema (for editor): `tools/tile-schema.json`
- Biome palettes: `tools/biome-map.json`
