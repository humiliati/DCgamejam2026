# Multi-Elevation Rendering Arc

**Status:** Phase 1 shipped — same-height lip tiles (STOOP/DECK) render
correctly when the player stands on a neighbouring lip. Phase 2 (fence
tiles with negative-offset water floor below) is documented and ready.

## Motivation

The Doom-rule tile height system lets us raise or sink individual tiles
by a small world-Y offset (STOOP/DECK at +0.04, trapdoors at -0.08, etc.).
This reads semantically at a glance — players learn that important doors
are never flush with the ground. But every projection formula in the
raycaster was originally written assuming the camera sits at exactly
`baseWallH/2` above world Y=0: the ground plane. When the player walks
onto a raised tile, their eye is physically at `baseWallH/2 + heightOffset`,
and tile tops, floor rows, and step-fill bands all miscomputed by that
delta.

The most visible symptom: standing on a DECK tile and looking at an
adjacent STOOP tile, the STOOP's raised lip disappears — it flattens
into the floor because the step-fill band collapses against the miscom-
puted horizon. Same architecture will bite when the player stands on a
boardwalk DECK tile adjacent to FENCE railings with water (negative
offset) below — we need to see the fence silhouette against a water
plane that sits lower than the deck.

## The correction

Eye height in world Y is `baseWallH/2 + playerElev`, where `playerElev`
is the heightOffset of the tile the player currently stands on (0 for
ground-level tiles). That's one scalar, sampled once per frame.

Every formula that previously hardcoded `baseWallH/2` as the eye-above-
ground distance now uses `baseWallH/2 + playerElev`. Equivalently —
in the screen-space projection that most of the raycaster uses —
`flatBottom` (the screen row where world Y=0 meets a wall at distance
`perpDist`) shifts DOWN by `h * playerElev / perpDist`.

## Phase 1 — Shipped (2026-04-14)

**File: `engine/raycaster.js`**

1. `_playerElev` computed once per frame near the top of `render()`,
   reading the grid tile at the player's position and looking up its
   `heightOffset` via `SpatialContract.getTileHeightOffset()`.
2. Foreground wall pass adds `_elevShift = h * _playerElev / perpDist`
   to `flatBottom`. `flatTop`, `drawStart`, `drawEnd`, step-fill
   `stepTop`/`stepBot`, and the flat-top cap's `drawStart > halfH` gate
   all inherit the correction through the existing subtraction chain.
3. Back-layer renderer `_renderBackLayer` takes `playerElev` as a new
   parameter and applies the same `_blElevShift` to its `flatBot`, so
   back-layer tiles stay pinned to the shared ground plane.
4. Flat-top cap `_capEyeScale` gains `+ 2 * _playerElev` — for two same-
   height lip tiles (stoop viewed from deck) this keeps the row-to-plane
   projection self-consistent instead of producing a degenerate
   near-zero eye-scale.
5. Back-layer cull at the `_cTop > _maxTop` comparison gains an
   `_elevAccept` branch: low-lip tiles (`_cOff > 0 && _cOff < 0.5 &&
   _cH < 0.25`) at equal top-height are now *kept* when the player
   themselves is on a low lip. Full-height solid walls still use the
   strict `>` comparison so we don't double-paint identical back walls.

**File: `engine/raycaster-floor.js`**

1. `renderFloor()` takes `playerElev` as a new (optional) parameter.
2. `rowDist` numerator changes from `trueHalfH * baseWallH` to
   `trueHalfH * (baseWallH + 2 * playerElev)` — that's literally
   `trueHalfH * 2 * eyeAboveFloor`, which is the correct projection
   when the eye is above the ground plane being cast against.

**Invariant checked:** when `playerElev === 0` (ground-level tiles),
every added term collapses to zero, so all existing floors, buildings,
and dungeon geometry render identically.

## Phase 2 — Boardwalk over water (planned)

When the player stands on a DECK tile at world Y=+0.04 and looks over a
FENCE railing at water below (world Y=-0.20 or similar), three things
need to work:

1. **Water floor plane below the grid.** `RaycasterFloor.renderFloor` currently
   projects onto world Y=0. A second pass (or the same pass parameterised)
   needs to project onto Y=-waterDepth for tiles flagged as "water below"
   (FENCE, PIER_EDGE, maybe a future PIER_DECK). The fence lets rays
   pass through its lower half — the upper half is solid railing — so the
   floor pass has to know to paint water in the gap beneath the fence bar.

2. **Back-layer cull for void-under tiles.** Add `TILES.hasVoidUnder(tile)`
   returning true for FENCE and similar railings overlooking water. In
   the back-layer collector, void-under tiles register unconditionally
   (past the `_cTop > _maxTop` gate) so the water and any far-bank
   geometry behind them reach the paint pass.

3. **Negative offset tile rendering.** STAIRS_DN and TRAPDOORs already
   handle negative offsets for the lip-above-wall case. Water surfaces
   would be a full floor texture at a negative offset — closer to a
   contract-level `waterPlane` field than a per-tile offset. TBD whether
   this lands as a new tile class or a contract extension.

Anchor files when we start Phase 2:
- `engine/raycaster-floor.js` — add water-plane pass.
- `engine/tiles.js` — add `hasVoidUnder` predicate.
- `engine/raycaster.js` — extend back-layer cull for hasVoidUnder tiles.
- `engine/spatial-contract.js` — add `waterPlane` contract field
  (exterior floors only, matches Skybox in that it only applies at
  depth 1).

## Verification

Visual test: on Floor 1, walk onto the 3-tile DECK strip at (25-27, 26)
and turn west to face the STOOP at (21-23, 26). Before this change, the
STOOP's raised lip collapsed against the horizon — the stone face was
invisible and the player saw floor_grass where the flagstone cap
should be. After this change, the STOOP's flagstone cap and step-fill
band render at their correct elevation and the lip reads as a physical
step even when viewed from the same elevation.

Repeat from the reciprocal angle: walk onto the STOOP at (21-23, 26)
and face east to the DECK. Board-and-beam deck face + plank cap should
both read cleanly.

Reset test: walk off both platforms onto plaza cobbles (23, 25) or so.
Both platforms should render identically to how they did before this
change, because `_playerElev` collapses to 0 and every correction term
is gated on it.
