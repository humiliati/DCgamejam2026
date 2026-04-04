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
    DUMP_TRUCK:  38   // Pressure wash dump truck — tall body, wall-decor wheels, cleaning equipment
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
           tile === T.GRASS;
  };

  /** Check if a tile is an environmental hazard */
  T.isHazard = function (tile) {
    return tile === T.TRAP || tile === T.FIRE ||
           tile === T.SPIKES || tile === T.POISON;
  };

  /** Check if a tile blocks light / line of sight */
  T.isOpaque = function (tile) {
    return tile === T.WALL || tile === T.PILLAR || tile === T.BREAKABLE || tile === T.CHEST || tile === T.TREE || tile === T.SHRUB || tile === T.LOCKED_DOOR || tile === T.BOOKSHELF || tile === T.BAR_COUNTER || tile === T.BED || tile === T.TABLE || tile === T.HEARTH || tile === T.BONFIRE || tile === T.TORCH_LIT || tile === T.TORCH_UNLIT || tile === T.FENCE || tile === T.TERMINAL || tile === T.MAILBOX || tile === T.DUMP_TRUCK;
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