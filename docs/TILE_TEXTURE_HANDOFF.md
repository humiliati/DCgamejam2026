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

| ID | Constant | wallH | Visual Description | Texture Style | Status |
|----|----------|-------|--------------------|---------------|--------|
| 50 | NEST | 0.3× | Ground-level debris pile — woven sticks, torn cloth, bone fragments. Low mound shape. Browns/tans with white bone highlights. | NON-INTERACTIVE — chunky woven texture, irregular horizontal bands of brown/tan/bone-white. 3-tier shading. | ✅ `nest_debris` shipped 2026-04-17 |
| 51 | DEN | 0.5× | Hollowed rock alcove — dark recessed opening in cave wall. Stone arch frame with deep shadow interior. | NON-INTERACTIVE — stone arch frame (medium grey blocks) surrounding dark void center. Frame uses large square blocks, interior is near-black with subtle texture. | ✅ `den_alcove` shipped 2026-04-17 |
| 53 | ENERGY_CONDUIT | 0.8× | Exposed power junction — industrial conduit pipe with sparking gap. Metal pipe frame with glowing energy slit. Retrofuturistic brass/copper tones. | INTERACTIVE — detailed pipe frame with rivets, central glowing slit (cyan/electric blue). Higher detail since this is an interact target. | ✅ `energy_conduit` shipped 2026-04-17 |

### 2c. Texture Generator Signatures Needed

Each new generator follows the existing pattern in `texture-atlas.js`:

```
function _genRoostShadow(id, p)      // → 'roost_shadow'        (floor tex)    ✅ 2026-04-17
function _genTerritorialMark(id, p)  // → 'territorial_mark'    (floor tex)    ✅ 2026-04-17
function _genNestDebris(id, p)       // → 'nest_debris'         (wall tex)     ✅ 2026-04-17
function _genDenAlcove(id, p)        // → 'den_alcove'          (wall tex)     ✅ 2026-04-17
function _genEnergyConduit(id, p)    // → 'energy_conduit'      (wall tex)     ✅ 2026-04-17
```

`FUNGAL_PATCH` (52) already has `_genFloorFungalPatch` — no new generator needed.
`ROOST` (49) needs only a floor texture (walkable, no wall column).

**Wall-tile generator style anchors (shipped Wave 1):**
- `_genNestDebris` mirrors `_genCot` — low-profile frame-plus-body silhouette, reskinned as a mound with horizontal stick bands, a dark earth ring at the base, and sparse bone-white chip highlights (~4% of upper-60% pixels). Transparent pixels outside the mound silhouette so the wall behind reads through above the pile.
- `_genDenAlcove` mirrors `_genChargingCradle`'s outer-frame + interior-cavity split, with `_genWellStone`'s 10×7 masonry pattern driving the arch stones. Aperture is a semicircle at the top (r=22 at archY = 35% of tex height) transitioning to straight vertical jambs below. Rim-fade darkens stones adjacent to the aperture so the alcove reads as inset rather than decal.
- `_genEnergyConduit` mirrors `_genChargingCradle`'s frame+conduit pattern but collapses the three cables into a single 4px-wide central glowing slit. Adds rivet studs along the brass frame (12px spacing, `_genAnvil`-style). Interior cavity has horizontal ribbing plus subtle cyan ambient bleed so the glow reads as spilling onto the flanking plate.

**Floor-tile generator style anchors (shipped Priority 3):**
- `_genRoostShadow` mirrors `_genFloorStone`'s 16×12 flagstone base (so ROOST tiles sit flush with adjacent `floor_stone`) and overlays a radial-distance shadow profile: dense core (d<8) → mid shadow with chain-link spokes (8–18) → fading vignette (18–28) → plain stone. The chain-link pattern uses 6 angular spokes (θ × 3/π binning) gated against concentric 4px rings so it reads as a hanging chain foreshortened from overhead.
- `_genTerritorialMark` also layers on `_genFloorStone`'s flagstone base but cuts three diagonal slashes via `|y − x − offset| / √2` perpendicular distance. Each slash has a near-black gouge core (d < 2px), a scorched edge (2–3px) that lerps back to a dimmed fraction of the base stone, and a sparse ring of bone-white stone chips along the outer rim. A y-banded `_hash` warp jitters slash position so the marks don't look ruled.

### 2d. Spatial Contract Entries Needed

Only the **nested dungeon** contract needs creature tiles (they don't appear on the surface or in shops).

| Tile | `tileHeightOffsets` | `tileWallHeights` | `tileShapes` | `tileFreeform` | `tileTextures` | `tileFloorTextures` |
|------|---------------------|-------------------|--------------|----------------|----------------|---------------------|
| 49 ROOST | 0 | 0.0× | — | — | — | ✅ `'roost_shadow'` |
| 50 NEST | ✅ 0.03 | ✅ 0.30 | — | — | ✅ `'nest_debris'` | — |
| 51 DEN | ✅ 0.04 | ✅ 0.50 | — | — | ✅ `'den_alcove'` | — |
| 52 FUNGAL_PATCH | 0 | 0.0× | — | — | — | ✅ `'floor_fungal_patch'` |
| 53 ENERGY_CONDUIT | ✅ 0.05 | ✅ 0.80 | — | — | ✅ `'energy_conduit'` | — |
| 54 TERRITORIAL_MARK | 0 | 0.0× | — | — | — | ✅ `'territorial_mark'` |

**Wave 1 notes:** The Wave 1 build (2026-04-17) added `tileWallHeights` entries for the three wall-like tiles alongside the fields the table originally called out. Without the wall-height override, `nestedDungeon()`'s default `wallHeight: 1.0` would scale these textures to full wall height and the creature silhouette would lose its low / half / tall readability.

**Priority 3 notes:** The Priority 3 build (2026-04-17) added `tileFloorTextures` entries for ROOST (49) and TERRITORIAL_MARK (54). Both tiles are walkable and non-opaque (see `tiles.js` `isWalkable` / `isOpaque` sets), so they don't need `tileHeightOffsets`, `tileWallHeights`, or a wall-side `textures` entry — the raycaster sees through the column and only the floor texture matters.

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
2. ~~**Creature tile textures (50, 51, 53)**~~ ✅ Done 2026-04-17 — `_genNestDebris`, `_genDenAlcove`, `_genEnergyConduit` generators added; nested-dungeon contract wires `tileHeightOffsets`, `tileWallHeights`, and `textures` for each.
3. ~~**Creature floor textures (49, 54)**~~ ✅ Done 2026-04-17 — `_genRoostShadow` and `_genTerritorialMark` generators added on a shared flagstone base (mirrors `_genFloorStone` block geometry); nested-dungeon contract wires `tileFloorTextures` for each.
4. ~~**Biome wiring for tiles 49–54**~~ ✅ Done 2026-04-17
5. ~~**Spatial contract entries for 49, 54**~~ ✅ Done 2026-04-17 — `tileFloorTextures` entries wired alongside the Priority 3 texture work. **All DOC-115 work complete.**

---

## 5. Reference Material

- Art direction: `texture-atlas.js` header comments (lines 9–29)
- Existing infrastructure generators: `_genWellStone` through `_genSwitchboard` (texture-atlas.js lines 6163–6640)
- Spatial contract patterns: `spatial-contract.js` nested dungeon section
- Tile definitions: `tiles.js` lines 49–66
- Tile schema (for editor): `tools/tile-schema.json`
- Biome palettes: `tools/biome-map.json`
