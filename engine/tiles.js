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
    ROOF_EAVE_L:      60,  // Left eave — 0.20× thin strip, +0.05 raised. Lowest roof point.
    ROOF_SLOPE_L:     61,  // Left slope — 0.25× strip, +0.15 raised. Ascending slope.
    ROOF_PEAK:        62,  // Ridge beam — 0.30× thickest strip, +0.30 raised. Highest point.
    ROOF_SLOPE_R:     63,  // Right slope — 0.25× strip, +0.15 raised. Mirror of SLOPE_L.
    ROOF_EAVE_R:      64   // Right eave — 0.20× thin strip, +0.05 raised. Mirror of EAVE_L.
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
           tile === T.ROOST || tile === T.FUNGAL_PATCH || tile === T.TERRITORIAL_MARK;
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
           tile === T.ROOF_EAVE_L || tile === T.ROOF_SLOPE_L || tile === T.ROOF_PEAK || tile === T.ROOF_SLOPE_R || tile === T.ROOF_EAVE_R;
  };

  /** Check if tile is a torch (lit or unlit) */
  T.isTorch = function (tile) {
    return tile === T.TORCH_LIT || tile === T.TORCH_UNLIT;
  };

  /** Check if tile is a door of any kind */
  T.isDoor = function (tile) {
    return tile === T.DOOR || tile === T.DOOR_BACK || tile === T.DOOR_EXIT ||
           tile === T.STAIRS_DN || tile === T.STAIRS_UP || tile === T.BOSS_DOOR ||
           tile === T.LOCKED_DOOR;
  };

  return T;
})();