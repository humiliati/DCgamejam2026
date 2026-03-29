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
    BAR_COUNTER: 26   // Interior furnishing — face to tap for a small stat boost (finite uses)
  };

  /** Check if a tile blocks movement */
  T.isWalkable = function (tile) {
    return tile === T.EMPTY || tile === T.DOOR || tile === T.DOOR_BACK ||
           tile === T.DOOR_EXIT || tile === T.STAIRS_DN || tile === T.STAIRS_UP ||
           tile === T.CHEST || tile === T.TRAP || tile === T.WATER ||
           tile === T.SHOP || tile === T.SPAWN || tile === T.BOSS_DOOR ||
           tile === T.FIRE || tile === T.SPIKES || tile === T.POISON ||
           tile === T.BONFIRE || tile === T.CORPSE || tile === T.COLLECTIBLE ||
           tile === T.PUZZLE;
  };

  /** Check if a tile is an environmental hazard */
  T.isHazard = function (tile) {
    return tile === T.TRAP || tile === T.FIRE ||
           tile === T.SPIKES || tile === T.POISON;
  };

  /** Check if a tile blocks light / line of sight */
  T.isOpaque = function (tile) {
    return tile === T.WALL || tile === T.PILLAR || tile === T.BREAKABLE || tile === T.TREE || tile === T.SHRUB || tile === T.LOCKED_DOOR || tile === T.BOOKSHELF || tile === T.BAR_COUNTER;
  };

  /** Check if tile is a door of any kind */
  T.isDoor = function (tile) {
    return tile === T.DOOR || tile === T.DOOR_BACK || tile === T.DOOR_EXIT ||
           tile === T.STAIRS_DN || tile === T.STAIRS_UP || tile === T.BOSS_DOOR ||
           tile === T.LOCKED_DOOR;
  };

  return T;
})();