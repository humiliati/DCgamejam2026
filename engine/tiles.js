/**
 * TILES — tile type constants and grid helpers.
 * Adapted from EyesOnly's tile system for dungeon crawler use.
 */
var TILES = (function () {
  'use strict';

  var T = {
    EMPTY:     0,
    WALL:      1,
    DOOR:      2,   // Standard door (advance to next floor)
    DOOR_BACK: 3,   // Back door (retreat to previous floor)
    DOOR_EXIT: 4,   // Exit door (interior → parent floor)
    STAIRS_DN: 5,   // Stairs down
    STAIRS_UP: 6,   // Stairs up
    CHEST:     7,
    TRAP:      8,   // Generic trap (pressure plate, pit cover)
    WATER:     9,
    PILLAR:    10,
    BREAKABLE: 11,
    SHOP:      12,
    SPAWN:     13,  // Player spawn marker (removed after placement)
    BOSS_DOOR: 14,
    FIRE:      15,  // Environmental hazard — burning ground
    SPIKES:    16,  // Environmental hazard — spike pit
    POISON:    17,  // Environmental hazard — toxic pool
    BONFIRE:     18,  // Checkpoint — respawn point, rest & heal
    CORPSE:      19,  // Harvestable remains — necro-salvage loot
    COLLECTIBLE: 20,  // Walk-over pickup (gold, battery, food) — placed by WorldItems
    TREE:        21,  // Exterior tree — solid, 2x tall, brown trunk + green canopy
    SHRUB:       22,  // Half-height hedge — blocks movement, player sees over
    PUZZLE:      23,  // Sliding-tile puzzle panel — solved state, player disorganizes
    LOCKED_DOOR: 24,  // Locked door — requires key item to open
    BOOKSHELF:   25,  // Interior furnishing — face to read a tip/lore page (peek overlay)
    BAR_COUNTER: 26,  // Interior furnishing — face to tap for a small stat boost (finite uses)
    BED:         27,  // Interior furnishing — half-height, face to rest (bonfire equivalent)
    TABLE:       28,  // Interior furnishing — half-height, face for cozy inspection
    HEARTH:      29,  // Fireplace — opaque column, fire emoji, incinerator + bonfire rest
    TORCH_LIT:   30,  // Wall-mounted torch, burning — opaque, warm glow, light source
    TORCH_UNLIT: 31,  // Wall-mounted torch, extinguished — opaque, charred bracket, no glow
    ROAD:        32,  // Walkable exterior — cobblestone floor texture (main avenues)
    PATH:        33,  // Walkable exterior — dirt floor texture (trails, alleys)
    GRASS:       34,  // Walkable exterior — grass floor texture (clearings, meadows)
    FENCE:       35,  // Half-wall railing (0.4×) — blocks movement, player sees over
    TERMINAL:    36,  // Data terminal — half-wall desk + CRT screen, sickly green glow, peek overlay
    MAILBOX:     37,  // Exterior mailbox — solid, interactable, emoji-on-platform (📫/📬/📪)
    DUMP_TRUCK:  38,  // Pressure wash dump truck — tall body, wall-decor wheels, cleaning equipment
    DETRITUS:    39,  // Adventurer detritus — walkable floor, bobbing emoji sprite, pick-up or walk-over

    // ── Living Infrastructure & Retrofuturistic Tiles (DOC-83 §13, DOC-84 §1) ──
    WELL:             40,  // Exterior well — 0.5× stone rim, dark water center. Social verb node.
    BENCH:            41,  // Bench seating — 0.35× low profile. Social + rest dual-verb node.
    NOTICE_BOARD:     42,  // Exterior notice board — 1.2× posts with pinned parchment. Errands verb node.
    ANVIL:            43,  // Foundry anvil — 0.5× dark iron on stone base. Duty/work_station verb node.
    BARREL:           44,  // Wooden barrel — 0.6× banded oak. Errands/work_station prop.
    CHARGING_CRADLE:  45,  // Construct charging station — 0.8× metal frame + conduit cables. Rest for constructs.
    SWITCHBOARD:      46,  // Signal switchboard — 1.0× brass toggle panel. Duty/work_station for comms.
    SOUP_KITCHEN:     47,  // Soup cauldron on brazier — 0.7× iron pot. Eat verb node.
    COT:              48,  // Canvas bedroll on low frame — 0.3× drab canvas. Rest verb node.

    // ── Dungeon Creature Verb Tiles (DOC-84 §12) ──────────────────────────────
    ROOST:            49,  // Ceiling rest point — 0.0× overhead anchor. Walkable. Flying creature rest verb.
    NEST:             50,  // Ground debris pile — 0.3× bones/cloth. Rest + eat for ground creatures.
    DEN:              51,  // Hollowed alcove — 0.5× recess. Rest + social for pack creatures.
    FUNGAL_PATCH:     52,  // Bioluminescent growth — 0.0× floor glow. Walkable. Eat for organic creatures.
    ENERGY_CONDUIT:   53,  // Exposed power junction — 0.8× sparking conduit. Eat + rest for constructs.
    TERRITORIAL_MARK: 54,  // Floor scorch/claw mark — 0.0× surface. Walkable. Duty for guard creatures.

    // ── Economy & Corpse Recovery Tiles (DOC-84 §14, §17) ─────────────────────
    STRETCHER_DOCK:   55,  // Medic staging point — 0.4× frame. Duty for recovery crews.
    TRIAGE_BED:       56,  // Clinic processing bed — 0.4× low bed. Duty for medical NPCs.
    MORGUE_TABLE:     57,  // Corpse conversion slab — 0.5× stone table. Duty for morticians.
    INCINERATOR:      58,  // Disposal grate — 1.2× tall iron frame. Duty + eat (construct waste heat).
    REFRIG_LOCKER:    59,  // Cold storage panel — 1.0× metal cabinet. Errands for corpse preservation.

    // ── Architectural Shape Tiles (ARCHITECTURAL_SHAPES_ROADMAP §1-3) ────────
    ROOF_EAVE_L:      60,  // Left eave — 0.20× thin strip, raised. Floating (no step fill).
    ROOF_SLOPE_L:     61,  // Left slope — 0.25× strip, raised. Floating.
    ROOF_PEAK:        62,  // Ridge beam — 0.30× thickest strip, raised highest. Floating.
    ROOF_SLOPE_R:     63,  // Right slope — 0.25× strip, raised. Floating.
    ROOF_EAVE_R:      64,  // Right eave — 0.20× thin strip, raised. Floating.
    CANOPY:           65,  // Tree canopy ring — 0.25× thin strip, raised high. Walkable + floating.
                           //   OPAQUE LID variant: underside rendered via per-column
                           //   floor-cast that stops at the tile footprint, solid fill.
    CANOPY_MOSS:      66,  // Swampy hanging-moss canopy — same floating strip, but the
                           //   underside uses a translucent fog-darkened band sampled from
                           //   the texture edge. Reads as hanging Spanish moss / vines:
                           //   the sky shows through in patches, which is the whole point.
    ROOF_CRENEL:      67,  // Crenellated rampart — floating slab with a geometric toothed
                           //   silhouette on the top half (4 teeth per tile UV, solid bottom).
                           //   Single-pane: only the ray-entry face renders (no back-face
                           //   injection) so the silhouette reads as a clean merlon line
                           //   instead of a doubled lattice. Drop on a roof perimeter cell
                           //   directly above the building wall — the wall's top cap shows
                           //   between the teeth via the N-layer back-layer pass.
    PERGOLA:          68,  // Open-air beam lattice — same toothed silhouette as ROOF_CRENEL
                           //   but WITH back-face injection, so both front and back faces
                           //   render the tooth pattern. The duplicated silhouette reads
                           //   as vertical posts holding up a horizontal cross-beam — the
                           //   correct look for a pergola or shade trellis over a public
                           //   plaza, market row, or temple courtyard. Same altitude model
                           //   as CRENEL (offset sets slab bottom, wallH sets thickness).

    // ── Freeform community pyre (RAYCAST_FREEFORM_UPGRADE_ROADMAP §4 Phase 2) ──
    CITY_BONFIRE:     69,  // City Bonfire — Olympic-model community pyre kept lit
                           //   during the games. Framed as a "greater hearth":
                           //   2-tile tall freeform column split into three bands.
                           //     • 0.50 world units — waist-high limestone pedestal
                           //     • 0.70 world units — narrow fire window (animated
                           //       gradient via the 'city_bonfire_fire' gap filler)
                           //     • 0.80 world units — suspended chimney hood, same
                           //       mantle thickness as interior HEARTH so the two
                           //       read as kin. The PERGOLA_BEAM canopy ring lands
                           //       on top of this hood to frame the outdoor plaza
                           //       around the pyre.
                           //   Opaque to rays (z-bypass is applied by the freeform
                           //   path so the pyre itself doesn't occlude nearby sprites).
                           //   Not walkable. Anchors the Lantern Row plaza and marks
                           //   safe-rest zones for the Dispatcher's briefing in Act 1.
                           //   See contract exterior() tileFreeform entry for per-
                           //   biome tuning.

    // ── Freeform pergola beam (RAYCAST_FREEFORM_UPGRADE_ROADMAP §4 Phase 2b) ──
    PERGOLA_BEAM:     70,  // Pergola Beam — freeform canopy strip that rests on
                           //   top of the adjacent CITY_BONFIRE chimney hood as a
                           //   thin "landing" rail — roughly one quarter the
                           //   thickness of the chimney so the pergola reads as
                           //   delicate beam lattice instead of a second full-mass
                           //   slab.
                           //   2-tile tall freeform column with:
                           //     • hLower 0.0  — no pedestal (nothing at plaza grade)
                           //     • gap    1.80 — transparent cavity (sky + plaza
                           //       show through so the player can walk under the
                           //       canopy and still see the pyre column)
                           //     • hUpper 0.20 — stained-hardwood canopy strip at
                           //       world-unit elevation 1.80–2.00. That sits at
                           //       the top of the CITY_BONFIRE chimney's 1.20–2.00
                           //       hood band so a ring of beams appears to land on
                           //       top of the chimney.
                           //   Uses the '_default' gap filler (transparent cavity) —
                           //   no custom filler needed. The beam is the only painted
                           //   band; everything below is sky/plaza.
                           //   Opaque to rays so the raycaster registers a hit and
                           //   feeds the freeform path, but the z-bypass applied to
                           //   all freeform tiles means sprites behind the beam
                           //   render cleanly (and the new pedestal-mask branch is
                           //   a no-op here because hLower = 0).
                           //   Walkable — the player passes under the canopy the
                           //   same way they walk under CANOPY / ROOF strips.
                           //   Placement: ring of 7 around CITY_BONFIRE on the
                           //   Promenade, plus future cells at the Dispatcher's
                           //   Office approach (Lantern Row, floor "2.1").
                           //   See contract exterior() tileFreeform entry.

    // ── Freeform tavern window (RAYCAST_FREEFORM_UPGRADE_ROADMAP §4 Phase 4) ──
    // Note: IDs 71–72 are reserved for Phase 3 (ARCH_DOORWAY, PORTHOLE)
    // which ship with per-column alpha-mask freeform. WINDOW_TAVERN takes
    // 73 so those IDs stay open. Phase 4 uses the SAME row-range freeform
    // path as HEARTH / CITY_BONFIRE / DUMP_TRUCK — no new renderer work,
    // just a new tile + gap filler + interior-scene billboard.
    // -- Alpha-mask freeform (Phase 3) --
    ARCH_DOORWAY:     71,  // Arched doorway -- freeform alpha-mask arch opening
    PORTHOLE:         72,  // Porthole -- freeform alpha-mask circular opening

    WINDOW_TAVERN:    73,  // Tavern Window — exterior building-facade wall tile
                           //   with a row-range "glass" cavity in the middle
                           //   of a 2.0-tall wall. Three bands, reading bottom-up:
                           //     • 0.00 → 0.40 — wooden sill + wall below the window
                           //     • 0.40 → 1.15 — transparent glass slot (0.75 tall,
                           //       centred on eye level) filled with a faint amber
                           //       tint via the 'window_tavern_interior' gap filler
                           //     • 1.15 → 2.00 — lintel + wall above the window
                           //   The interior scene (amber glow, silhouette of bar
                           //   patrons / furniture) is emitted as a billboard
                           //   sprite by WindowSprites (Layer 3) so the gap filler
                           //   stays transparent — same pattern as HEARTH's
                           //   dragonfire and DUMP_TRUCK's hose reel.
                           //   Opaque (DDA hit → freeform path), not walkable —
                           //   it replaces WALL tiles on building exteriors so
                           //   the player walks past it on the street side.
                           //   Intended placement: Driftwood Inn and Coral Bazaar
                           //   facades on the Promenade (`1`), with future
                           //   placement on Lantern Row shops (`2`).
                           //   See contract exterior() tileFreeform entry.

    // -- Door Architecture Roadmap tiles --
    DOOR_FACADE:      74,  // Facade Door -- freeform full-height building entrance
    TRAPDOOR_DN:      75,  // Trapdoor Down -- freeform interior hatch descending
    TRAPDOOR_UP:      76,  // Trapdoor Up -- freeform interior hatch ascending

    // -- Living Windows Roadmap §4.5: per-building window types --
    WINDOW_SHOP:      77,  // Commercial storefront — large plate glass with thin iron
                           //   bars (3 vertical muntins). Mostly glass, minimal frame.
                           //   Slight inset (recessD: 0.10) behind the wall face.
                           //   Buildings: Coral Bazaar, Driftwood Inn, future shops.
                           //   Gap filler: 'window_shop_interior'.
    WINDOW_BAY:       78,  // Residential bay window — projects 0.20 units OUTWARD from
                           //   the wall face (negative recessD). Beveled side jambs in
                           //   building wallTexture. 2×2 wood mullion cross (colonial).
                           //   Buildings: Gleaner's Home, private residences.
                           //   Gap filler: 'window_bay_interior'.
    WINDOW_SLIT:      79,  // Institutional fortress slit — narrow vertical opening
                           //   (center 30% of tile width). Single iron bar. Cold
                           //   blue-grey wash. Masonry flanks on wallX < 0.35 / > 0.65.
                           //   Buildings: Storm Shelter, Watchman's Post, Dispatcher's.
                           //   Gap filler: 'window_slit_interior'.
    WINDOW_ALCOVE:    80,  // Residential alcove window — mild inset (recessD 0.12),
                           //   narrower glass cavity than BAY, single horizontal
                           //   mullion band. Used where BAY's protrusion is
                           //   awkward (corners, walls flanking a door).
                           //   Gap filler: 'window_alcove_interior'.
    WINDOW_COMMERCIAL: 81, // Commercial storefront — almost full-building-facade
                           //   glass (0.25→3.00 world units, 2.75 tall) divided
                           //   into 3 tall panels by 2 vertical mullions only.
                           //   Gas-station / car-dealership look. Same 2-mullion
                           //   filler as WINDOW_SHOP, just a larger cavity.
                           //   Gap filler: 'window_shop_interior'.

    // -- Living Windows §5: dungeon / interior architectural peepholes --
    //    No glass, no warm interior vignette. These are cuts through stone:
    //    the filler paints masonry outside the aperture and leaves the
    //    aperture itself transparent so back-layer geometry (the adjacent
    //    room) shows through. Usable on both interior (N.N) and nested
    //    dungeon (N.N.N) floors — the fog mode of the current contract
    //    (CLAMP vs DARKNESS) governs how legible the far side is.
    WINDOW_ARROWSLIT: 82,  // Arrow slit — tall narrow vertical aperture, ~10%
                           //   of tile width centered at wallX=0.5. Full-height
                           //   cavity so the slit reads from floor to lintel.
                           //   Defensive / gaolhouse aesthetic.
                           //   Gap filler: 'window_arrowslit_interior'.
    WINDOW_MURDERHOLE: 83, // Murder hole / peephole — small high square opening.
                           //   Narrow wallX band (~20%) at high elevation so the
                           //   player has to crane up to see through. Classic
                           //   dungeon guard-room feature.
                           //   Gap filler: 'window_murderhole_interior'.

    // ── Dungeon hanging-moss variant (square) ─────────────────────────
    CANOPY_MOSS_SQ:   84,  // Square-silhouette hanging moss — the dungeon /
                           //   cellar variant of CANOPY_MOSS. Shares the same
                           //   floating-strip altitude and translucent moss
                           //   underside rendering, but KEEPS a square cell
                           //   footprint so it reads as "moss hanging from
                           //   between stone ceiling beams" rather than a
                           //   round leafy pad. Placed in nested-dungeon
                           //   ceiling bays where the square silhouette
                           //   conforms to rectangular stonework. The
                           //   regular CANOPY_MOSS (66) renders round in
                           //   exterior contracts via tileShapes: 'circle'.

    // ── Square-silhouette tree variant ────────────────────────────────
    TREE_SQ:          85,  // Square-footprint tree — visually identical to
                           //   TREE (21) in texture, wall height, floor,
                           //   and canopy compatibility, but KEEPS the
                           //   default square cell silhouette instead of
                           //   the inscribed-circle render. Use for:
                           //     (a) dense treelines / hedgerow walls where
                           //         adjacent squares butt together with no
                           //         corner gaps (round TREE leaves visible
                           //         corner slivers by design),
                           //     (b) the interior of a grove — ring the
                           //         perimeter with round TREE (21) for a
                           //         soft silhouette, fill the inside with
                           //         TREE_SQ (85) to read as a thick,
                           //         impenetrable forest mass.
                           //   No tileShapes entry → falls through to the
                           //   default square DDA hit.

    // ── Raised walkable platforms (ARCHITECTURAL_SHAPES_ROADMAP §3) ──────
    STOOP:            86,  // Raised entry step — 0.08× thin lip, +0.10 offset.
                           //   Walkable, non-opaque. Floor texture override
                           //   differentiates step surface from surrounding
                           //   ground. Use in front of doors or as single-
                           //   tile porch entry.
    DECK:             87,  // Multi-tile raised platform — same 0.08× lip and
                           //   +0.10 offset as STOOP. Walkable, non-opaque.
                           //   Floor override gives boardwalk planking. Ring
                           //   with FENCE (0.4h) for railings.

    // ── 2×2 pillar cluster ────────────────────────────────────────────
    PILLAR_QUAD:      88,  // Four small round columns inside a single tile
                           //   cell. Non-walkable, opaque at the tile level
                           //   (movement can't pass through), but visually
                           //   sight-permeable through the diagonal gaps
                           //   between the four sub-pillars. Rendered via
                           //   tileShapes 'circle4' — 4 sub-circles of
                           //   r≈0.20 at (±0.25, ±0.25) from tile centre.
                           //   Use for quad-colonnade plaza accents,
                           //   decorative shrine bases, or chokepoints
                           //   that let the player peek the next chamber
                           //   before walking around.

    // ── Reserved: TERMINAL_RIM ────────────────────────────────────────
    // Slot 89 was reserved for a back-layer "rim" slab auto-attached on
    // top of TERMINAL (36). We simplified to a single-slab pedestal
    // approach: TERMINAL itself is a low ~0.45-tall wall with
    // hasFlatTopCap + hasVoidCap on the tile directly, so the top
    // surface renders as a translucent void without a separate rim
    // tile. The ~0.09 "lip" is achieved by bumping TERMINAL's
    // wallHeight to 0.54 and letting the top strip of the pedestal
    // texture read as the rim. If we later want a genuinely distinct
    // rim material (e.g. brass ring around a wooden pedestal), re-
    // introduce this slot and implement per-tile slab stacking.
    TERMINAL_RIM:     89,

    // ── Beveled / diagonally-slashed wall tiles ───────────────────────
    // Ported from raycast.js-master (OFFSET_DIAG_WALLS). Each tile is a
    // single axis-aligned diagonal segment spanning two corners of the
    // unit cell; the other half of the cell is open/traversable. The
    // four orientations correspond to the four corner-to-corner slashes:
    //
    //   WALL_DIAG_0 (90): #/   segment (0,1)→(1,0)  — SW→NE, fills NW
    //   WALL_DIAG_1 (91): \#   segment (0,0)→(1,1)  — NW→SE, fills NE
    //   WALL_DIAG_2 (92): /#   segment (1,0)→(0,1)  — NE→SW, fills SE
    //   WALL_DIAG_3 (93): #\   segment (1,1)→(0,0)  — SE→NW, fills SW
    //
    // Non-walkable (the segment blocks movement across its half of the
    // cell). Opaque (blocks sight along the segment). Rendering uses a
    // DDA-secondary ray-segment intersection in raycaster.js; the
    // texture U coordinate is (hitX - x0) / (x1 - x0). Unit-cell corner
    // offsets live in TILES.OFFSET_DIAG_WALLS below.
    WALL_DIAG_0:      90,
    WALL_DIAG_1:      91,
    WALL_DIAG_2:      92,
    WALL_DIAG_3:      93,

    // ── Sealab / hobbit-tunnel dungeon tiles ──────────────────────────
    // Walkable + freeform-rendered tunnel rib. Acts like ARCH_DOORWAY
    // but with a lower headroom ceiling so a 1-tile corridor reads as
    // a compressed rib-vault the player threads through. Place at
    // every 1-2 tiles along a corridor centerline. Gap is traversable;
    // upper band is a low arched ceiling; lower band is a raised
    // threshold lip. See SpatialContract.hobbitTunnel() preset for
    // the exact band extents and textures.
    TUNNEL_RIB:       94,

    // Corridor side-wall variant with an inset decorative alcove
    // (lantern niche, shelf, mushroom cluster). Opaque, NOT walkable —
    // the gap is a recessed display niche, not a traversable opening.
    // Place on either side of TUNNEL_RIB to reinforce the narrow
    // silhouette when the player looks left/right. Gap filler draws
    // the alcove contents as a billboard; upper/lower bands use the
    // tunnel's tight fieldstone / damp wood texture.
    TUNNEL_WALL:      95,

    // Ocean skybox porthole. Opaque, NOT walkable. Freeform gap is
    // filled by a parallax skybox sampler that pulls from the active
    // contract's oceanSkybox asset (undersea gradient + kelp silhouette
    // band + occasional fish sprite band). Upper/lower bands render as
    // riveted bulkhead plate. Intended for sealab dungeon outer walls
    // where the tile is adjacent to "hull exterior." Gap reveals the
    // distant ocean; parallax-based (stable horizon) rather than true
    // skybox-cube sampling — correct for 1-tile porthole scale.
    PORTHOLE_OCEAN:   96
  };

  /**
   * Unit-cell corner offsets for the four WALL_DIAG orientations.
   * Each entry is [[ax, ay], [bx, by]] — the two endpoints of the
   * diagonal segment inside the tile's unit cell. Consumed by the
   * raycaster's ray-segment intersection test and by the movement
   * collider's side-of-line check. Indexed by (tile - WALL_DIAG_0).
   */
  T.OFFSET_DIAG_WALLS = Object.freeze([
    Object.freeze([Object.freeze([0, 1]), Object.freeze([1, 0])]), // WALL_DIAG_0: #/
    Object.freeze([Object.freeze([0, 0]), Object.freeze([1, 1])]), // WALL_DIAG_1: \#
    Object.freeze([Object.freeze([1, 0]), Object.freeze([0, 1])]), // WALL_DIAG_2: /#
    Object.freeze([Object.freeze([1, 1]), Object.freeze([0, 0])])  // WALL_DIAG_3: #\
  ]);

  /** Check if a tile is one of the four diagonal wall orientations. */
  T.isWallDiag = function (tile) {
    return tile === T.WALL_DIAG_0 || tile === T.WALL_DIAG_1 ||
           tile === T.WALL_DIAG_2 || tile === T.WALL_DIAG_3;
  };

  /** Convert a WALL_DIAG tile ID to its OFFSET_DIAG_WALLS index (0-3). */
  T.diagFaceIndex = function (tile) {
    return tile - T.WALL_DIAG_0;
  };

  /** Check if a tile blocks movement */
  T.isWalkable = function (tile) {
    return tile === T.EMPTY || tile === T.DOOR || tile === T.DOOR_BACK ||
           tile === T.DOOR_EXIT || tile === T.STAIRS_DN || tile === T.STAIRS_UP ||
           tile === T.TRAP || tile === T.WATER ||
           tile === T.SHOP || tile === T.SPAWN || tile === T.BOSS_DOOR ||
           tile === T.FIRE || tile === T.SPIKES || tile === T.POISON ||
           tile === T.BONFIRE || tile === T.CORPSE || tile === T.COLLECTIBLE ||
           tile === T.PUZZLE || tile === T.ROAD || tile === T.PATH ||
           tile === T.GRASS || tile === T.DETRITUS ||
           tile === T.ROOST || tile === T.FUNGAL_PATCH || tile === T.TERRITORIAL_MARK ||
           tile === T.CANOPY || tile === T.CANOPY_MOSS || tile === T.CANOPY_MOSS_SQ ||
           tile === T.ROOF_CRENEL ||
           tile === T.PERGOLA || tile === T.PERGOLA_BEAM ||
           tile === T.ROOF_EAVE_L || tile === T.ROOF_SLOPE_L || tile === T.ROOF_PEAK ||
           tile === T.ROOF_SLOPE_R || tile === T.ROOF_EAVE_R ||
           tile === T.DOOR_FACADE ||
           tile === T.TRAPDOOR_DN || tile === T.TRAPDOOR_UP ||
           tile === T.STOOP || tile === T.DECK ||
           tile === T.TUNNEL_RIB;
  };

  /** Check if a tile is an environmental hazard */
  T.isHazard = function (tile) {
    return tile === T.TRAP || tile === T.FIRE ||
           tile === T.SPIKES || tile === T.POISON;
  };

  /** Check if a tile blocks light / line of sight */
  T.isOpaque = function (tile) {
    return tile === T.WALL || tile === T.PILLAR || tile === T.BREAKABLE || tile === T.CHEST || tile === T.TREE || tile === T.TREE_SQ || tile === T.PILLAR_QUAD || tile === T.SHRUB || tile === T.LOCKED_DOOR || tile === T.BOOKSHELF || tile === T.BAR_COUNTER || tile === T.BED || tile === T.TABLE || tile === T.HEARTH || tile === T.BONFIRE || tile === T.TORCH_LIT || tile === T.TORCH_UNLIT || tile === T.FENCE || tile === T.TERMINAL || tile === T.MAILBOX || tile === T.DUMP_TRUCK ||
           tile === T.WELL || tile === T.BENCH || tile === T.NOTICE_BOARD || tile === T.ANVIL || tile === T.BARREL || tile === T.CHARGING_CRADLE || tile === T.SWITCHBOARD || tile === T.SOUP_KITCHEN || tile === T.COT ||
           tile === T.NEST || tile === T.DEN || tile === T.ENERGY_CONDUIT ||
           tile === T.STRETCHER_DOCK || tile === T.TRIAGE_BED || tile === T.MORGUE_TABLE || tile === T.INCINERATOR || tile === T.REFRIG_LOCKER ||
           tile === T.ROOF_EAVE_L || tile === T.ROOF_SLOPE_L || tile === T.ROOF_PEAK || tile === T.ROOF_SLOPE_R || tile === T.ROOF_EAVE_R ||
           tile === T.CANOPY || tile === T.CANOPY_MOSS || tile === T.CANOPY_MOSS_SQ ||
           tile === T.ROOF_CRENEL || tile === T.PERGOLA ||
           tile === T.CITY_BONFIRE || tile === T.PERGOLA_BEAM ||
           tile === T.ARCH_DOORWAY || tile === T.PORTHOLE ||
           tile === T.WINDOW_TAVERN || tile === T.WINDOW_SHOP ||
           tile === T.WINDOW_BAY || tile === T.WINDOW_SLIT ||
           tile === T.WINDOW_ALCOVE || tile === T.WINDOW_COMMERCIAL ||
           tile === T.WINDOW_ARROWSLIT || tile === T.WINDOW_MURDERHOLE ||
           tile === T.DOOR_FACADE ||
           tile === T.TRAPDOOR_DN || tile === T.TRAPDOOR_UP ||
           tile === T.WALL_DIAG_0 || tile === T.WALL_DIAG_1 ||
           tile === T.WALL_DIAG_2 || tile === T.WALL_DIAG_3 ||
           tile === T.TUNNEL_RIB || tile === T.TUNNEL_WALL ||
           tile === T.PORTHOLE_OCEAN;
  };

  /** Check if tile is a torch (lit or unlit) */
  T.isTorch = function (tile) {
    return tile === T.TORCH_LIT || tile === T.TORCH_UNLIT;
  };

  /** Check if tile is a door of any kind */
  T.isDoor = function (tile) {
    return tile === T.DOOR || tile === T.DOOR_BACK || tile === T.DOOR_EXIT ||
           tile === T.STAIRS_DN || tile === T.STAIRS_UP || tile === T.BOSS_DOOR ||
           tile === T.LOCKED_DOOR || tile === T.DOOR_FACADE ||
           tile === T.TRAPDOOR_DN || tile === T.TRAPDOOR_UP;
  };

  /**
   * Descent-stair predicate — true for any tile that sends the player
   * to a deeper (or sibling-further) floor via the stair-transition
   * path. STAIRS_DN and TRAPDOOR_DN are semantic variants: STAIRS for
   * one-depth-step descents (N->N.N, N.N->N.N.N), TRAPDOOR for intra-
   * dungeon sibling drops and dungeon-to-surface warps. Transition
   * logic is unified; the tile identity is a rendering-intent marker
   * consumed by SpatialContract + DoorSprites.
   */
  T.isDescendStair = function (tile) {
    return tile === T.STAIRS_DN || tile === T.TRAPDOOR_DN;
  };

  /** Ascent-stair predicate — mirror of isDescendStair. */
  T.isAscendStair = function (tile) {
    return tile === T.STAIRS_UP || tile === T.TRAPDOOR_UP;
  };

  /** Any stair-like transition tile (either direction). */
  T.isStairLike = function (tile) {
    return T.isDescendStair(tile) || T.isAscendStair(tile);
  };

  /**
   * Check if tile is a raised "step" tile — walkable platform that still
   * needs the raycaster to draw its thin lip column so the Doom-rule
   * heightOffset + short wallHeight read as a visible step silhouette.
   * Without this, walkable+non-opaque tiles are skipped entirely by the
   * DDA and no vertical lip renders (floor-texture override still works).
   */
  T.isStep = function (tile) {
    return tile === T.STOOP || tile === T.DECK;
  };

  /**
   * Tiles that render their TOP surface via per-row floor projection
   * (the "stoop cap" path in raycaster.js) instead of the cheap wallX
   * sampling used by block furniture. Used for thin-slab geometry where
   * the top plane is a visible horizontal surface — STOOP/DECK (walkable
   * curbs), plus raised thin-slab furniture like TABLE and BED whose
   * tabletop/mattress reads as a board, not the top of a fat cube.
   *
   * These tiles MUST have positive tileHeightOffsets on the relevant
   * floor contract; the cap only renders above the horizon gap above
   * the wall face. Walls opt in by being in this set AND having
   * wallHeightMult small enough (< ~0.2) that the visible face reads
   * as a slab rather than a column.
   */
  T.hasFlatTopCap = function (tile) {
    return tile === T.STOOP || tile === T.DECK ||
           tile === T.TABLE || tile === T.BED ||
           tile === T.TERMINAL;
  };

  /**
   * Tiles whose cap should render as a translucent void (dark-tinted
   * fill) instead of sampling a floor-style texture. Used for terminal
   * wells, scrying basins, and any "rim around a void" furniture where
   * looking down onto the cap should read as "looking into the piece"
   * rather than a solid surface. Sits inside the hasFlatTopCap cap loop
   * as a branch — the outer predicate still gates the loop, the inner
   * branch picks paint style.
   *
   * TERMINAL uses a dark-green tint (~rgba(4,18,10,0.55*brightness))
   * keyed to the hologram emoji's glow color family, so the well reads
   * as lit by the terminal itself rather than just "dark."
   */
  T.hasVoidCap = function (tile) {
    return tile === T.TERMINAL;
  };

  /** Check if tile is a floating architectural shape (no step fill, walkable + opaque) */
  T.isFloating = function (tile) {
    return tile === T.ROOF_EAVE_L || tile === T.ROOF_SLOPE_L ||
           tile === T.ROOF_PEAK || tile === T.ROOF_SLOPE_R ||
           tile === T.ROOF_EAVE_R || tile === T.CANOPY || tile === T.CANOPY_MOSS ||
           tile === T.CANOPY_MOSS_SQ ||
           tile === T.ROOF_CRENEL || tile === T.PERGOLA;
  };

  /**
   * Check if a floating tile carries a per-column silhouette cutout (merlons
   * + crenels). Tiles in this set draw their ray-entry face with a UV-driven
   * tooth pattern so alternating bands clip the slab's upper half, revealing
   * sky/back-geometry through the gaps. Back layers behind the slab are
   * gathered by the N-layer loop's floating-foreground branch (which starts
   * _maxTop=0 so under-slab walls still register).
   *
   * ROOF_CRENEL uses single-pane rendering (no back-face injection) — the
   * silhouette reads as one clean merlon line crowning the wall below it.
   * PERGOLA uses the same tooth pattern WITH back-face injection — the
   * duplicated silhouette reads as vertical posts + horizontal cross-beam,
   * the correct look for an open-air shade structure.
   */
  T.isCrenellated = function (tile) {
    return tile === T.ROOF_CRENEL || tile === T.PERGOLA;
  };

  /**
   * Check if a crenellated tile should inject a back-face for the N-layer
   * stack. PERGOLA does (both sides of the lattice show); CRENEL does not
   * (single-pane rampart silhouette). Used by the raycaster to suppress
   * back-face injection on CRENEL while still firing it on other floating
   * tiles (CANOPY, ROOF_PEAK, PERGOLA, etc.) that need the far face to
   * avoid a paper-cutout silhouette.
   */
  T.isFloatingBackFace = function (tile) {
    // All floating tiles EXCEPT ROOF_CRENEL need a back face.
    return T.isFloating(tile) && tile !== T.ROOF_CRENEL;
  };

  /**
   * Check if a floating tile uses the translucent "hanging moss" underside
   * rendering style (sky visible in patches) vs. the opaque-lid underside
   * (solid footprint-clipped projection). Only CANOPY_MOSS uses the moss
   * style; all other floating tiles use the opaque lid.
   */
  T.isFloatingMoss = function (tile) {
    return tile === T.CANOPY_MOSS || tile === T.CANOPY_MOSS_SQ;
  };

  /**
   * Check if a floating tile uses the opaque-lid underside rendering style.
   * Used by the raycaster to decide between moss band and floor-cast pass.
   */
  T.isFloatingLid = function (tile) {
    return tile === T.ROOF_EAVE_L || tile === T.ROOF_SLOPE_L ||
           tile === T.ROOF_PEAK || tile === T.ROOF_SLOPE_R ||
           tile === T.ROOF_EAVE_R || tile === T.CANOPY ||
           tile === T.ROOF_CRENEL || tile === T.PERGOLA;
  };

  /**
   * Check if a tile is a candidate for freeform two-segment rendering.
   * Freeform tiles split their wall column into an upper brick band, a
   * gap (fire cavity / arch opening / window), and a lower brick band.
   * The per-tile gap geometry is configured on the spatial contract via
   * the `tileFreeform` table ({ hUpper, hLower } in world units).
   *
   * This predicate is just a fast-path filter — the raycaster still
   * consults `SpatialContract.getTileFreeform()` to get the actual
   * segment bounds (and gracefully degrades to single-segment rendering
   * when no config exists for the active contract).
   *
   * See docs/RAYCAST_FREEFORM_UPGRADE_ROADMAP.md for the phased plan.
   */
  T.isFreeform = function (tile) {
    // Phase 1: HEARTH (fire-cavity sandwich — interior).
    // Phase 2: + CITY_BONFIRE (Olympic pyre — exterior community pyre).
    // Phase 2b: + PERGOLA_BEAM (top-anchored beam, same chimney elevation
    //   as CITY_BONFIRE so a ring of beams snaps flush to the hood).
    // Phase 2c: + DUMP_TRUCK (HEARTH-stature pressure-wash truck with a
    //   thin ground-level spool cavity instead of a mid-body fire window).
    //   The freeform path lets the spool slot render as a genuine cutout
    //   while the lower body carries wheel decor and the upper chassis
    //   reads as a tall solid mass.
    // Phase 3: + ARCH_DOORWAY, PORTHOLE.
    // Phase 4: + WINDOW_TAVERN (row-range glass slot on building facades,
    //   interior scene billboard renders inside the transparent gap).
    // Phase 4b: + WINDOW_SHOP, WINDOW_BAY, WINDOW_SLIT (per-building
    //   window types; vignette depth now driven by EmojiMount instance
    //   mount recess rather than the retired zBypassMode field).
    return tile === T.HEARTH || tile === T.CITY_BONFIRE ||
           tile === T.PERGOLA_BEAM || tile === T.DUMP_TRUCK ||
           tile === T.ARCH_DOORWAY || tile === T.PORTHOLE ||
           tile === T.WINDOW_TAVERN || tile === T.WINDOW_SHOP ||
           tile === T.WINDOW_BAY || tile === T.WINDOW_SLIT ||
           tile === T.WINDOW_ALCOVE || tile === T.WINDOW_COMMERCIAL ||
           tile === T.WINDOW_ARROWSLIT || tile === T.WINDOW_MURDERHOLE ||
           tile === T.DOOR_FACADE ||
           tile === T.TRAPDOOR_DN || tile === T.TRAPDOOR_UP ||
           tile === T.TUNNEL_RIB || tile === T.TUNNEL_WALL ||
           tile === T.PORTHOLE_OCEAN;
  };

  /** Check if tile is any window type (facade glass + dungeon apertures) */
  T.isWindow = function (tile) {
    return tile === T.WINDOW_TAVERN || tile === T.WINDOW_SHOP ||
           tile === T.WINDOW_BAY || tile === T.WINDOW_SLIT ||
           tile === T.WINDOW_ALCOVE || tile === T.WINDOW_COMMERCIAL ||
           tile === T.WINDOW_ARROWSLIT || tile === T.WINDOW_MURDERHOLE ||
           tile === T.PORTHOLE_OCEAN;
  };

  return T;
})();