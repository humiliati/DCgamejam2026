/**
 * BreakableSpawner — biome-specific breakable prop placement and HP tracking.
 *
 * Spawns 8-12 destructible props per floor from the biome's prop list
 * (data/loot-tables.json → biome_props). Manages prop HP state. When a
 * prop is destroyed, rolls loot via LootTables and spawns walk-over drops
 * via WorldItems.
 *
 * Adapted from EyesOnly's breakable-spawner.js (93 lines).
 * DG additions: self-contained _breakables[] state, loot spill on destroy,
 * explosive radius handling.
 *
 * Layer 1 — depends on: TILES, SeededRNG (rng.js), LootTables, WorldItems
 */
var BreakableSpawner = (function () {
  'use strict';

  // ── Internal state ───────────────────────────────────────────────
  // { x, y, hp, maxHp, emoji, name, drops, explosive, noise }
  var _breakables = [];
  var _biome = 'cellar';
  var _floor = 1;
  var _floorId = '';

  // ── Lifecycle ────────────────────────────────────────────────────

  function init() {
    _breakables = [];
  }

  // ── Placement ────────────────────────────────────────────────────

  /**
   * Spawn biome-appropriate breakable props on the floor grid.
   * Called by GridGen after room placement, same pattern as Salvage.placeCorpses().
   *
   * @param {Array}  grid  - Live 2D grid array from GridGen
   * @param {Array}  rooms - Room list from GridGen
   * @param {number} W     - Grid width
   * @param {number} H     - Grid height
   * @param {string} biome - 'cellar' | 'foundry' | 'sealab'
   * @param {number} floor - Current floor number
   * @param {string} [floorId] - Floor ID string (for CrateSystem integration)
   */
  function spawnBreakables(grid, rooms, W, H, biome, floor, floorId) {
    _breakables = [];
    _biome = biome || 'cellar';
    _floor = floor || 1;
    _floorId = floorId || '';

    var props = LootTables.getBiomeProps(_biome);
    var breakableProps = props.filter(function (p) { return p.breakable; });

    if (!breakableProps.length) {
      // Fallback: plain crate
      breakableProps = [{ name: 'Crate', emoji: '📦', breakable: true, hp: 2, drops: 'crate', noise: 1.5 }];
    }

    // Skip spawn room (rooms[0] is the player spawn room by GridGen convention)
    var eligibleRooms = rooms.length > 1 ? rooms.slice(1) : rooms;

    // Place 8-12 breakables across eligible rooms
    var count = 8 + Math.floor(SeededRNG.random() * 5);
    var placed = 0;
    var attempts = 0;

    while (placed < count && attempts < count * 20) {
      attempts++;

      // Pick a random eligible room
      var room = eligibleRooms[Math.floor(SeededRNG.random() * eligibleRooms.length)];
      var rx = room.x + 1 + Math.floor(SeededRNG.random() * Math.max(1, room.w - 2));
      var ry = room.y + 1 + Math.floor(SeededRNG.random() * Math.max(1, room.h - 2));

      if (rx <= 0 || rx >= W - 1 || ry <= 0 || ry >= H - 1) continue;
      if (!grid[ry] || grid[ry][rx] !== TILES.EMPTY) continue;
      if (_breakables.some(function (b) { return b.x === rx && b.y === ry; })) continue;

      var template = breakableProps[Math.floor(SeededRNG.random() * breakableProps.length)];
      var bDef = {
        x:       rx,
        y:       ry,
        hp:      template.hp || 2,
        maxHp:   template.hp || 2,
        emoji:   template.emoji || '📦',
        name:    template.name  || 'Crate',
        drops:   template.drops || 'breakable_default',
        noise:   template.noise || 1.0,
        explosive: !!template.explosive
      };
      _breakables.push(bDef);
      grid[ry][rx] = TILES.BREAKABLE;
      placed++;

      // Create CrateSystem slot container for this breakable (Phase B)
      if (typeof CrateSystem !== 'undefined') {
        var floorId = _floorId || '';
        CrateSystem.createCrate(rx, ry, floorId, _biome);
      }
    }
  }

  // ── Combat — player hits a breakable ─────────────────────────────

  /**
   * Called when the player interacts with (smashes) a TILES.BREAKABLE tile.
   * Reduces HP by 1. On death, spills loot as walk-over tiles via WorldItems.
   *
   * @param {number} x     - Grid X of the breakable
   * @param {number} y     - Grid Y of the breakable
   * @param {Array}  grid  - Live grid from FloorManager
   * @returns {Object|null} Dead breakable def if destroyed, else null
   */
  function hitBreakable(x, y, grid) {
    var b = _getAt(x, y);
    if (!b) return null;

    b.hp--;

    if (b.hp > 0) return null;  // Still standing

    // ── Destroy it ───────────────────────────────────────────────

    // Clear the tile
    if (grid && grid[y] && grid[y][x] === TILES.BREAKABLE) {
      grid[y][x] = TILES.EMPTY;
    }

    // Remove from list
    _breakables = _breakables.filter(function (br) { return !(br.x === x && br.y === y); });

    // Spill loot onto adjacent empty tiles (or the corpse tile itself)
    var drops = LootTables.rollBreakableLoot(b.drops, _floor);
    _spillDrops(drops, x, y, grid);

    // Explosive props damage nearby tiles / breakables
    if (b.explosive) {
      _doExplosionRadius(x, y, grid);
    }

    return b;
  }

  // ── Loot spill ───────────────────────────────────────────────────

  /**
   * Spill walk-over collectible drops around position (x, y).
   * Walk-over types (gold, battery, food) go to WorldItems.
   * Salvage parts go to the Salvage staged pool (if Salvage loaded).
   */
  function _spillDrops(drops, x, y, grid) {
    if (!drops || !drops.length) return;

    // Check floor item cap
    var cap = LootTables.maxFloorItems();
    if (typeof WorldItems !== 'undefined' && WorldItems.getAll().length >= cap) return;

    // Candidate tiles: the destroyed tile itself, then adjacent empties
    var candidates = _adjacentEmpties(x, y, grid);
    candidates.unshift({ x: x, y: y }); // The freed tile is empty now

    var ci = 0;
    for (var i = 0; i < drops.length; i++) {
      var drop = drops[i];

      if (drop.type === 'salvage') {
        // Salvage parts: try to add to Salvage module's staged pool
        if (typeof Salvage !== 'undefined' && Salvage.addLoosePartToFloor) {
          Salvage.addLoosePartToFloor(drop.partId, x, y, grid);
        }
        continue;
      }

      // Walk-over drops (gold, battery, food)
      if (typeof WorldItems !== 'undefined' && ci < candidates.length) {
        var pos = candidates[ci++];
        WorldItems.spawnAt(pos.x, pos.y, drop, grid);
      }
    }
  }

  function _adjacentEmpties(x, y, grid) {
    var dirs = [{ dx:0, dy:-1 }, { dx:1, dy:0 }, { dx:0, dy:1 }, { dx:-1, dy:0 }];
    var result = [];
    for (var i = 0; i < dirs.length; i++) {
      var nx = x + dirs[i].dx;
      var ny = y + dirs[i].dy;
      if (grid[ny] && grid[ny][nx] === TILES.EMPTY) {
        result.push({ x: nx, y: ny });
      }
    }
    return result;
  }

  // ── Explosion ────────────────────────────────────────────────────

  /**
   * 1-tile blast radius: damage adjacent breakables, hazard-tile conversion.
   * Chain explosions are possible (adjacent explosive breakable takes damage).
   */
  function _doExplosionRadius(cx, cy, grid) {
    var dirs = [{ dx:0,dy:-1 }, { dx:1,dy:0 }, { dx:0,dy:1 }, { dx:-1,dy:0 },
                { dx:1,dy:-1 }, { dx:1,dy:1 }, { dx:-1,dy:1 }, { dx:-1,dy:-1 }];
    for (var i = 0; i < dirs.length; i++) {
      var nx = cx + dirs[i].dx;
      var ny = cy + dirs[i].dy;
      var adj = _getAt(nx, ny);
      if (adj) {
        hitBreakable(nx, ny, grid);  // May chain-explode
      }
    }
  }

  // ── Accessors ────────────────────────────────────────────────────

  function _getAt(x, y) {
    for (var i = 0; i < _breakables.length; i++) {
      if (_breakables[i].x === x && _breakables[i].y === y) return _breakables[i];
    }
    return null;
  }

  /** Get all live breakables (for minimap / debug overlay). */
  function getBreakables() { return _breakables; }

  /** Check if a tile position has a live breakable. */
  function hasBreakable(x, y) { return !!_getAt(x, y); }

  /** Get the breakable def at (x, y), or null. */
  function getAt(x, y) { return _getAt(x, y); }

  // ── Public API ───────────────────────────────────────────────────
  return {
    init:            init,
    spawnBreakables: spawnBreakables,
    hitBreakable:    hitBreakable,
    getBreakables:   getBreakables,
    hasBreakable:    hasBreakable,
    getAt:           getAt
  };
})();
