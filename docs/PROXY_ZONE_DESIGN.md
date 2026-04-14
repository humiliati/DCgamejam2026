# Proxy Zone Design — Interior Windows Looking *Out*

> **DOC-18** | Dungeon Gleaner — DC Jam 2026 | Created: 2026-04-14
>
> **Status**: Design only. No code landed. Phase 12 of `LIVING_WINDOWS_ROADMAP.md`.
>
> **Companion to** `LIVING_WINDOWS_ROADMAP.md` (§4.2 Facade Model; §4.6 EmojiMount unification; §12 phase entry), `RAYCAST_FREEFORM_UPGRADE_ROADMAP.md`, `SKYBOX_ROADMAP.md` (if present — otherwise see Skybox module in `engine/skybox.js`), `BIOME PLAN` §future-city-floor-4.

---

## 1. Problem Statement

The `LIVING_WINDOWS_ROADMAP` shipped windows on **exterior floors** (floor N — Promenade, Lantern Row) that look *inward* at shops, inns, fortresses. The glass paints an amber interior wash, a mullion grid, and a vignette emoji that sits on a diorama tile inside the building footprint. That footprint is empty on floor N's grid — the real building interior is a separate floor (N.N). The window is a painted promise that the space beyond is lived-in.

Phase 12 is the **mirror case**: windows on **interior floors** (floor N.N — Driftwood Inn interior, Coral Bazaar interior) that look *outward* at the exterior street. The player is inside the building, walks up to a window, and expects to see:

- The actual boardwalk they just came from, with its buildings and streetlamps.
- The current DayCycle phase in the sky (sunset amber, midday cyan, night stars).
- Floor N's weather (rain, fog) passing across the view.
- Through tall commercial shop windows: a grand view with full vertical range — ground plane, horizon, sky above.

A single tinted pane with a scene-emoji poster (the cheap solution considered and rejected in LIVING_WINDOWS §4.6 discussion) fails on three counts: no parallax as the player moves, no day-night continuity with the exterior they just left, no scale for tall storefront glass. The player would immediately notice the windows are *fake* on the inside in a way they aren't fake on the outside.

This doc specifies the proxy zone system that closes that gap.

---

## 2. The Inverse-Facade Symmetry

Phase 12 is not a new rendering paradigm. It's the existing Wolfenstein-facade trick run in reverse.

| Direction | Exterior content | Interior content | Diorama lives on | Viewer floor |
|---|---|---|---|---|
| **Outside looking in** (shipped) | Real street | Empty building footprint, populated with vignette emoji + patron NPC | Floor N (exterior) | Floor N |
| **Inside looking out** (Phase 12) | Pasted slice of floor N tiles, with sky above | Real interior room | Floor N.N (interior) | Floor N.N |

Both run on the same axioms:

- **Axiom 1:** *The space beyond the glass is on the viewer's grid.* No cross-floor rendering, no portal cameras. What you see through the window is just tiles the raycaster can't path to because the window is non-walkable.
- **Axiom 2:** *Content is placed, not generated.* The designer authors the diorama in the blockout tool, same tool that authors the interior.
- **Axiom 3:** *The tile type carries rendering intent.* A WALL tile knows it's a wall. A WINDOW tile knows it's a window. The floor-level contract interprets tile IDs; it doesn't need to know the tile's origin floor.
- **Axiom 4:** *Cross-glass tint always shows the **other** side's light.* Outside face → interior lamp amber. Inside face → exterior sky tint. Same filler, different face branch.

The facade work on floor N already validated that viewers accept painted dioramas as "real enough" when the geometry and lighting are consistent. Phase 12 extends that validation to the inverse angle.

---

## 3. Design Axiom

> **The proxy zone is a region of floor N.N's grid that the raycaster renders under floor N's rules.**

Not a separate coordinate system. Not a portal. Not an overlay. Just tiles — the same tile IDs, the same DDA, the same render loop — with three switches flipped per column:

1. **Ceiling** → use parent skybox instead of interior ceiling color.
2. **Fog** → use parent fog profile (FADE long-range) instead of interior (CLAMP short-range).
3. **Wall heights** → use parent's height overrides for exterior wall tile IDs.

Nothing else changes. The player's position, the DDA, the sprite pass, the z-buffer, the door/freeform passes — unchanged. The three switches are read per column from a small set of floor-data metadata and per-tile predicates.

---

## 4. Architecture

### 4.1 Per-tile predicate: `TILES.hasOpenSky(t)`

New Layer 0 predicate, pattern matches the existing `hasVoidCap` / `hasFlatTopCap`.

```js
// engine/tiles.js
function hasOpenSky(t) {
  // Tiles that puncture the ceiling and render the parent-floor skybox above them.
  // Populated at blockout-tool zone-tag time; plain open / street / grass / dirt tiles
  // inside a tagged proxy zone return true.
  return _skyAboveSet[t] === true;
}
```

The set is authored per-floor — a tile type isn't globally "sky-above" or not; it depends on which floor it's on and whether that floor has it inside a tagged zone. Rather than mutating the tile registry, the predicate is driven by a **per-floor sky-above lookup table** built at floor-generation time from `proxyZones` metadata:

```js
// engine/floor-manager.js
function buildSkyAboveLookup(floorData) {
  var set = {};
  (floorData.proxyZones || []).forEach(function(zone) {
    for (var y = zone.y; y < zone.y + zone.h; y++) {
      for (var x = zone.x; x < zone.x + zone.w; x++) {
        var t = floorData.grid[y][x];
        // Only open / ground tiles get sky; walls inside a zone keep their ceiling off.
        if (TILES.isOpen(t) || TILES.isGround(t)) {
          set[x + ',' + y] = true;
        }
      }
    }
  });
  return set;
}
```

The raycaster consults a per-column `_skyAbove[mapX + ',' + mapY]` lookup during the ceiling pass, populated from the active floor's table.

### 4.2 Raycaster ceiling pass branch

Current ceiling pass paints `contract.ceilingColor` (or a sky gradient on exterior floors) across every column. Phase 12 adds a single conditional at the column level:

```js
// raycaster ceiling pass, per column
var terminalTile = /* the opaque hit tile or null if no hit before render distance */;
var skyAbove = terminalTile
  ? _skyAbove[terminalTile.x + ',' + terminalTile.y]
  : false;

if (skyAbove) {
  Skybox.renderColumn(col, angle, parentContract, parentSky);
} else if (contract.ceilingMode === 'skybox') {
  Skybox.renderColumn(col, angle, contract, contract.sky);
} else {
  _renderInteriorCeiling(col, ...);
}
```

`Skybox.renderColumn(col, angle, contract, sky)` already exists for exterior floors; Phase 12 just routes it to the **parent** contract + sky when the column's terminal tile has sky above it. No new skybox code.

### 4.3 Fog profile routing: `fogProfile: 'parent'`

Window freeform configs gain an optional `fogProfile` field:

```js
// SpatialContract freeform config for an interior window
WINDOW_SHOP_INTERIOR: {
  hUpper: 2.4, hLower: 0.4,
  recessD: 0.10,
  wallTexture: 'wood_plank',
  fogProfile: 'parent'  // <-- new: rays beyond this window use parent's fog params
}
```

At DDA time, when a ray crosses a window tile whose config has `fogProfile: 'parent'`, subsequent fog multiplier calculations for that ray use `parentContract.fog` (FADE, long-range) instead of `currentContract.fog` (CLAMP, short-range). The switch is per-ray, not per-column — once a ray has crossed the glass, every wall hit and every floor hit beyond uses parent fog.

Implementation: the raycaster's per-column state gets one new bool (`_fogFromParent`) set when the first freeform hit's config declares `fogProfile: 'parent'`. The fog multiplier path reads from the correct contract via a getter.

### 4.4 Parent contract lookup

`FloorManager` already knows parent relationships via `parentId(floorId)`. Phase 12 exposes:

```js
FloorManager.getParentContract(floorId);  // returns SpatialContract or null
FloorManager.getParentSky(floorId);       // returns Skybox config or null
FloorManager.getParentFog(floorId);       // returns fog profile or null
```

Called once at floor-arrive time by the raycaster, cached as `_parentContract`, `_parentSky`, `_parentFog` for the duration of the floor. No per-frame lookup.

### 4.5 Wall heights on proxy tiles

Already supported. N.N's `SpatialContract.interior()` gains `tileWallHeights` entries for the exterior tile IDs that live inside its proxy zones. Example:

```js
// interior contract
tileWallHeights: {
  [TILES.TERMINAL]: 0.90,             // existing
  [TILES.WALL_BRICK_EXTERIOR]: 3.0,   // new: exterior brick at full height
  [TILES.STREETLAMP_POST]: 1.2,       // new: streetlamp through window
  [TILES.BUILDING_FACADE]: 2.8        // new: a distant building's wall
}
```

The raycaster's existing `SpatialContract.getWallHeight()` consumes these — no new code. Works transparently once the entries exist.

### 4.6 Window face orientation

`windowFaces` on N.N's floor data points the *outward* face toward the proxy zone, by the same convention that N's windows face the street. Face-aware dispatch (§3.1 in LIVING_WINDOWS) picks:

- **Outward face hit** → inside-out viewer → cyan/sky wash (tint from `FloorManager.getParentSky(floorId).currentTint`).
- **Inward face hit** → inside-in viewer (player standing inside, looking at a wall) → interior wash (the normal amber/warm lamp tint of the room).
- **Perpendicular faces** → opaque masonry.

For tall commercial windows (which the user wants for shop interiors), the slot config extends floor-to-ceiling. The face-aware filler paints the tint; the cavity is transparent; the ray continues into the proxy zone and hits the sky pass. Works at any slot height without special-casing.

---

## 5. Floor data format

```js
// floor-manager.js — Driftwood Inn interior, floor "1.2"
{
  floorId: '1.2',
  parentFloorId: '1',
  grid: /* 2D array including the proxy zone tiles */,

  // The rectangular region(s) on THIS floor's grid that render as exterior.
  // Can be a single ring around the building or multiple patches.
  proxyZones: [
    {
      x: 0, y: 0, w: 8, h: 20,           // zone footprint on this grid
      sourceFloorId: '1',                 // where the tiles were pasted from
      sourceOrigin: { x: 16, y: 3 },      // top-left of the source region on floor N
      sourceWidth: 8, sourceHeight: 20,   // for 1:1 copy — no scaling
      fogInherit: true,                   // default true: beyond-window rays use parent fog
      skyInherit: true                    // default true: open tiles in zone puncture ceiling
    }
  ],

  // Windows — same format as exterior windows, faces point outward into the zone.
  windowFaces: {
    '9,10': 2,   // this window faces WEST, where the proxy zone sits
    '9,12': 2,
    '9,14': 2
  },

  // Normal interior stuff follows — rooms, spawn, doors, etc.
  spawn: { x: 16, y: 12, dir: 3 },
  doorTargets: { ... }
}
```

**`sourceFloorId` + `sourceOrigin` are optional but recommended** — they enable the blockout tool's "refresh from source" button (Phase 12B) without requiring the designer to re-copy-paste when floor N changes.

**Validation at floor load**: `proxyZones` rectangles must not overlap interior walkable tiles. A zone containing a walkable tile that isn't blocked off by interior walls → warning, because the player could walk onto a diorama tile. This is caught at blockout-tool save time (§6.4) but re-validated at runtime for safety.

---

## 6. Blockout Tool Support

The user's described workflow:

> Cut floor N. Go to floor N.N and paste. Floor N.N just got 5× bigger. Draw the interior walls ~3× bigger inside the pasted region, rearrange the spawn. Go back to floor N and draw 4 windows on the 4 walls of the building. Go back to floor N.N and draw 8 windows on the 4 walls of the interior building.

Almost works as-is with existing cut/paste (`bv-clipboard.js`). Gaps below.

### 6.1 "Tag as Sky Zone" rectangle tool

New toolbar button in `bv-toolbar.js`: **Sky Zone**. Activates a drag-rectangle selection that writes a `proxyZones` entry on the current floor's data when confirmed.

Behavior:
- Drag out a rectangle over the pasted region.
- Tool captures `x, y, w, h`.
- If the user last pasted from another floor, prompt once: *"Bind this zone to source floor '1' region (16,3) 8×20?"* → records `sourceFloorId` + `sourceOrigin` + `sourceWidth`/`sourceHeight`.
- Otherwise, zone is "untethered" — no source bind, works but can't be refreshed.

Confirming writes to the floor's `proxyZones` array. Multiple zones per floor are supported (a motel with 4 separate courtyards would want 4).

### 6.2 Visual indicator in grid render

`bv-render.js` gains a proxy-zone overlay pass: inside any cell flagged by a `proxyZones` entry, draw a blue diagonal hatch at 30% opacity over the normal tile render. Makes it impossible to confuse proxy tiles with interior tiles when scanning the floor.

The zone's bounding rectangle also gets a 1px cyan outline, labeled with the source-floor bind in a corner tag: `"→ 1 @ (16,3)"`.

### 6.3 Auto-wire window `fogProfile`

When the designer places a window tile on floor N.N, `bv-interaction.js` checks if any adjacent tile (4-neighbor) is inside a tagged proxy zone. If yes → auto-add a `fogProfile: 'parent'` entry to the window's per-tile freeform override (if the save patcher supports per-tile freeform config; otherwise flag the window in a sibling `windowFogReset: ['9,10', '9,12']` array on the floor data).

Prevents the common mistake of placing an interior-side window and forgetting to wire the fog — which would silently render the proxy as a gray CLAMP curtain.

### 6.4 Validation

`bv-validation.js` gains three new rules, run on save:

1. **Zone-wall integrity.** A tagged zone must be bounded on its interior-facing edges by opaque wall tiles. Otherwise the player could walk into the zone → the diorama breaks. Error, block save.
2. **Window sightline.** A window with `fogProfile: 'parent'` must have at least one `hasOpenSky` tile reachable along its outward face normal within N tiles. Otherwise the window looks out at a wall or an empty clipped space. Warning, don't block save — intentional "window looks onto a brick wall" design is legal.
3. **Height-override coverage.** Every tile ID present inside a proxy zone must have an entry in the interior contract's `tileWallHeights` (or inherit a sensible default). Otherwise a pasted exterior tile renders at the interior's default wall height — tall exterior walls get squashed to 2.0. Warning, list the missing tile IDs.

### 6.5 Refresh from source (Phase 12B)

With `sourceFloorId` + `sourceOrigin` bound, a toolbar button **Refresh zone from source** re-copies the source region's tiles into the zone. One-way sync — edits made inside the zone on the interior floor are overwritten. The button warns before firing if local edits are detected (diff against a hash stored at bind time).

Deferred past Jam scope. For Jam, re-paste-and-re-tag works.

---

## 7. Dynamic Content (Deferred)

NPCs, patrol sprites, Hero-day events on floor N don't appear through N.N's proxy windows. Options considered:

### 7.1 Static-only (Jam scope)
Zone carries tiles + type-mount emoji (streetlamps auto-glow via TILES.STREETLAMP's registered EmojiMount; mailboxes auto-emit via MailboxSprites). No NPCs. Empty but lit Promenade seen through the window. **This is the Jam scope.**

### 7.2 Sprite feed (Phase 12B)
Floor N publishes a `VisibleSprites.feed(parentFloorId)` stream. N.N's raycaster subscribes and re-emits those sprites into its own `_sprites[]` array, with positions transformed by the zone's `sourceOrigin → (zone.x, zone.y)` offset. NPC walks past a Promenade window → sprite appears on N.N correctly billboarded.

Cost: sprite duplication budget (double the billboard cost when a player is in a building), feed protocol, position transform at ~60fps. Not catastrophic — the number of sprites "visible through windows" is small.

### 7.3 Frozen snapshot (rejected)
Periodically screenshot floor N, composite the capture into N.N's window texture. Doesn't parallax, doesn't animate — worse than the cheap scene-poster approach we already rejected.

Jam ships 7.1. 12B ships 7.2.

---

## 8. Motel Variant — Doubled Diorama (City Floor 4)

The user's creative extension: **a motel building where the rooms visible through the exterior's big windows correspond to real interior rooms on the N.N floor**.

### 8.1 The pattern

Floor N (city block, future floor 4) has a motel building. Instead of the usual "empty footprint with vignette emojis," the motel footprint on N is **divided by interior walls into motel-room-sized cells**, each with:
- A bed tile (emoji mount: 🛏️)
- A lamp tile (emoji mount: 💡)
- A TV tile (emoji mount: 📺)
- A window on the exterior wall of that cell

The player on floor N looks at the motel's exterior → sees four windows, each showing a different motel room's contents through the glass (the established facade pattern from LIVING_WINDOWS §4.2).

The player enters the motel door → transitions to floor N.N, which contains **full-scale motel rooms** with walkable floor plans. **Each room on N.N has a window that looks out onto a proxy zone of the city street** — the same street the player walked in from, pasted in as exterior tiles beyond the window.

The motel is a **doubled diorama**:
- Outward dioramas on N (the bedroom interiors visible through N's windows).
- Outward dioramas on N.N (the city street visible through N.N's windows).

Each floor's windows look at the *other* floor's world, painted on the viewer's grid. Neither floor renders the other directly; both reference each other through facade placeholders.

### 8.2 Authoring

The motel exterior on N follows the normal facade stamp: walls, door, windows, `emojiMounts` populating the cell interiors with bed/lamp/TV glyphs. `windowScenes` wires lifecycle (lights on at night, off by day).

The motel interior on N.N follows the normal interior stamp PLUS the proxy zone workflow:
1. Cut a region of the city floor (N).
2. Paste into N.N outside the motel's interior walls.
3. Tag as sky zone.
4. Author the motel rooms inside.
5. Place windows on each room's outward wall, auto-wire fog to parent.

The *only* new work for the motel is multiplicity — the floor has 4–8 rooms instead of one big open space, with a correspondingly larger proxy zone (a full ring around the building plus some depth).

### 8.3 The payoff

Standing on the city street at dusk, the player sees the motel's windows glowing with distinct contents — room 1 has a TV on, room 2 has a candle, room 3 is dark, room 4 has a silhouette. They walk in, rent room 2, the room has a window looking back out at the city street and the other buildings across the way. DayCycle is continuous — if they slept through the night, both the exterior view (through the motel windows on N from the street) and the interior view (out from room 2 through N.N's window) show the same sunrise.

This is a headline moment that demonstrates the whole system. **Reserved for floor 4 (city) because the town floors (1, 2) don't have this density of visible rooms.** The Biome Plan's city floor is the right home.

### 8.4 Scope flag

Motel variant requires Phase 12A (proxy zones core) + lifecycle sync between exterior facade room contents and interior room contents (e.g., TV on in facade should match TV on in real interior). That lifecycle sync is a thin layer on top of BuildingRegistry.

Not Jam scope. Documented here so the Phase 12 tech is designed to support it without rework.

---

## 9. Phases

### Phase 12A — Core proxy zones (post-Jam, ~4 days)

1. `TILES.hasOpenSky()` predicate + per-floor sky-above lookup table built from `proxyZones`.
2. Raycaster ceiling pass branch → parent skybox on sky-above columns.
3. `fogProfile: 'parent'` freeform config field + per-ray fog-from-parent flag.
4. `FloorManager.getParent{Contract, Sky, Fog}` public API.
5. Interior contract extension: exterior wall-tile heights on N.N for Driftwood Inn's proxy.
6. Blockout tool: Sky Zone tool, hatch overlay, auto-wire fog, three validation rules.
7. Pilot: Driftwood Inn interior `"1.2"` with 3 windows looking out at the Promenade.

**Acceptance:** Inside the Inn, three windows on the west wall show the Promenade with sunset skybox, correct building silhouettes across the street, DayCycle-phased sky. Walking outside and looking in from the Promenade side of the same windows shows amber lamp light + patron vignette.

### Phase 12B — Source binding + sprite feed (post-12A, ~3 days)

1. `sourceFloorId` + `sourceOrigin` capture at paste time.
2. "Refresh from source" toolbar button with dirty-check warning.
3. `VisibleSprites.feed(parentFloorId)` publish/subscribe for NPC & animated-sprite replication.
4. Position transform at render time; culling to proxy-zone bounds.

**Acceptance:** Editing a tile on the Promenade and clicking Refresh on the Inn's zone propagates the change. A patron walking on the Promenade is visible through the Inn's window walking across the proxy zone at the correct position.

### Phase 12C — Motel variant (future city floor, ~2 days on top of 12A/B)

1. Author motel exterior on city floor with room-subdivided facade footprint.
2. Author motel interior on city-floor-N.N with per-room proxy zones.
3. Wire BuildingRegistry room-level state so TV/lamp state syncs across facade and real interior.
4. Pilot one full motel, test the "rent a room, sleep through night, wake up, look out window" loop.

---

## 10. Risks & Open Questions

**R1. Sky-zone boundary vertigo.** Where the interior ceiling ends and sky begins, the visual transition has to read cleanly. If the exterior building wall on the proxy side of the zone isn't visible in the window's frustum, the player will see interior ceiling → bare sky with nothing between. Mitigation: the proxy zone must *always* include an exterior wall tile on its inner boundary (the outside face of the building the player is inside). This is also what the blockout tool validates in rule #1 (§6.4).

**R2. Parallax mismatch at wide FOV.** If the player walks along an interior wall with multiple windows, the proxy zone is fixed relative to N.N's grid, so parallax is physically correct — but if the source region is small and repeats across windows, the player may see the same building three times through three different windows, which breaks the illusion. Mitigation: sources should be authored wide enough that each window's frustum sees a unique slice, or the zones should be authored with source regions that naturally tile.

**R3. Performance of tall shop windows.** Tall commercial windows (floor-to-ceiling) mean a huge vertical swath of columns do sky-substitution + parent-fog math. Interior shops with full-height glass storefronts might push the per-frame cost. Mitigation: measure; if it's bad, cache the sky gradient per scanline inside the shop, redraw every N frames instead of every frame.

**R4. Weather occlusion.** Floor N's rain/snow particle effects travel through the exterior skybox path. Should they also render through an interior window onto the proxy? Probably yes — that's the coolest effect in the whole system. Mitigation: weather module subscribes to `RaycasterWeather.renderColumn` which is already per-column; sky-above columns render weather the same way exterior floors do. Should just work.

**R5. Minimap treatment.** Does the minimap on N.N show the proxy zone, and how? Options: hide entirely (cleanest), show in dim grey (technically correct), show as-if-walkable (confusing). Proposal: hide. The proxy zone isn't part of the player's navigable space.

**R6. Night cycle + interior lamps.** At night, exterior floor N is dark except for streetlamps. Interior floor N.N's lamps are lit regardless. The window should show: dark exterior streets, lit exterior streetlamps, a few faint stars in the sky. The interior room around the window is lit by its own lamps. The contrast should be dramatic and readable. Lighting already flows per-tile, so this works — just important to verify during Phase 12A pilot.

**R7. Door-transition continuity.** When the player walks through the Inn's door, DayCycle and weather should be identical on both sides of the transition (walked outside at sunset → inside should still feel like sunset). The window view through the proxy is what makes this believable. If the Inn's door transition runs through a load/gen pass that silently resets DayCycle, the continuity breaks. Mitigation: DayCycle is already global (not per-floor). Verify on pilot.

**R8. Source-bound edits on the viewer floor.** If a designer edits a tile inside a bound proxy zone on floor N.N (not on the source floor N), what happens? Proposal: the edit is preserved but flagged as "diverged from source." Refresh button would overwrite it. The divergence lets the designer add N.N-only props to the view (a cat on a sill, a bird sculpture) without polluting floor N.

---

## 11. Touch list (Phase 12A)

| File | Change |
|---|---|
| `engine/tiles.js` | `hasOpenSky(t)` predicate, backed by per-floor table |
| `engine/floor-manager.js` | `buildSkyAboveLookup(floorData)`, `getParent{Contract, Sky, Fog}(floorId)`, `proxyZones` validation at load |
| `engine/spatial-contract.js` | `fogProfile` field on freeform configs; interior contract wall-height entries for exterior tile IDs used in Driftwood Inn's zone |
| `engine/raycaster.js` | Per-column sky-above check in ceiling pass; per-ray `_fogFromParent` flag set at window crossing; `_parentContract` / `_parentSky` / `_parentFog` caches at floor-arrive |
| `engine/skybox.js` | Accept a `contract` + `sky` pair as explicit args (already supported for exterior floors — verify it works with parent pairs) |
| `tools/js/bv-toolbar.js` | **Sky Zone** button |
| `tools/js/bv-interaction.js` | Drag-rectangle capture for zone; auto-wire window `fogProfile` on placement |
| `tools/js/bv-render.js` | Diagonal hatch overlay for proxy-zone cells; zone bounding rectangle + source-bind tag |
| `tools/js/bv-validation.js` | Three new rules (zone-wall integrity, window sightline, height-override coverage) |
| `tools/js/bv-save-patcher.js` | Write `proxyZones` array to floor data |

### Phase 12B additional

| File | Change |
|---|---|
| `tools/js/bv-toolbar.js` | **Refresh from source** button |
| `tools/js/bv-clipboard.js` | Capture source-floor coords at copy time; store on clipboard payload for paste-as-zone |
| `engine/visible-sprites.js` | **new** — per-floor sprite publish/subscribe feed |
| `engine/raycaster.js` | Consume parent sprite feed inside proxy-zone bounds |

---

## 12. Cross-references

- `LIVING_WINDOWS_ROADMAP.md` §4.2 (Facade Model), §4.6 (EmojiMount unification), §12 phase entry — the outside-looking-in half of the same contract.
- `COZY_INTERIORS_DESIGN.md` — the interior safety contract that the inside-looking-out window is *inside* of.
- `Biome Plan.html` — city floor 4 is the intended home of the motel variant.
- `DOOR_ARCHITECTURE_ROADMAP.md` — door continuity axioms (DayCycle, weather) that this doc depends on.
- `NPC_SYSTEM_ROADMAP.md` — Phase 12B sprite feed hooks into the main NPC system for visible-through-window patrons.
