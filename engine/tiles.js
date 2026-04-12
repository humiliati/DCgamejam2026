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
    TRAPDOOR_UP:      76   // Trapdoor Up -- freeform interior hatch ascending
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
           tile === T.CANOPY || tile === T.CANOPY_MOSS || tile === T.ROOF_CRENEL ||
           tile === T.PERGOLA || tile === T.PERGOLA_BEAM ||
           tile === T.ROOF_EAVE_L || tile === T.ROOF_SLOPE_L || tile === T.ROOF_PEAK ||
           tile === T.ROOF_SLOPE_R || tile === T.ROOF_EAVE_R ||
           tile === T.DOOR_FACADE ||
           tile === T.TRAPDOOR_DN || tile === T.TRAPDOOR_UP;
  };

  /** Check if a tile is an environmental hazard */
  T.isHazard = function (tile) {
    return tile === T.TRAP || tile === T.FIRE ||
           tile === T.SPIKES || tile === T.POISON;
  };

  /** Check if a tile blocks light / line of sight */
  T.isOpaque = function (tile) {
    return tile === T.WALL || tile === T.PILLAR || tile === T.BREAKABLE || tile === T.CHEST || tile === T.TREE || tile === T.SHRUB || tile === T.LOCKED_DOOR || tile === T.BOOKSHELF || tile === T.BAR_COUNTER || tile === T.BED || tile === T.TABLE || tile === T.HEARTH || tile === T.BONFIRE || tile === T.TORCH_LIT || tile === T.TORCH_UNLIT || tile === T.FENCE || tile === T.TERMINAL || tile === T.MAILBOX || tile === T.DUMP_TRUCK ||
           tile === T.WELL || tile === T.BENCH || tile === T.NOTICE_BOARD || tile === T.ANVIL || tile === T.BARREL || tile === T.CHARGING_CRADLE || tile === T.SWITCHBOARD || tile === T.SOUP_KITCHEN || tile === T.COT ||
           tile === T.NEST || tile === T.DEN || tile === T.ENERGY_CONDUIT ||
           tile === T.STRETCHER_DOCK || tile === T.TRIAGE_BED || tile === T.MORGUE_TABLE || tile === T.INCINERATOR || tile === T.REFRIG_LOCKER ||
           tile === T.ROOF_EAVE_L || tile === T.ROOF_SLOPE_L || tile === T.ROOF_PEAK || tile === T.ROOF_SLOPE_R || tile === T.ROOF_EAVE_R ||
           tile === T.CANOPY || tile === T.CANOPY_MOSS || tile === T.ROOF_CRENEL || tile === T.PERGOLA ||
           tile === T.CITY_BONFIRE || tile === T.PERGOLA_BEAM ||
           tile === T.ARCH_DOORWAY || tile === T.PORTHOLE ||
           tile === T.WINDOW_TAVERN || tile === T.DOOR_FACADE ||
           tile === T.TRAPDOOR_DN || tile === T.TRAPDOOR_UP;
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

  /** Check if tile is a floating architectural shape (no step fill, walkable + opaque) */
  T.isFloating = function (tile) {
    return tile === T.ROOF_EAVE_L || tile === T.ROOF_SLOPE_L ||
           tile === T.ROOF_PEAK || tile === T.ROOF_SLOPE_R ||
           tile === T.ROOF_EAVE_R || tile === T.CANOPY || tile === T.CANOPY_MOSS ||
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
    return tile === T.CANOPY_MOSS;
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
    return tile === T.HEARTH || tile === T.CITY_BONFIRE ||
           tile === T.PERGOLA_BEAM || tile === T.DUMP_TRUCK ||
           tile === T.ARCH_DOORWAY || tile === T.PORTHOLE ||
           tile === T.WINDOW_TAVERN || tile === T.DOOR_FACADE ||
           tile === T.TRAPDOOR_DN || tile === T.TRAPDOOR_UP;
  };

  return T;
})();