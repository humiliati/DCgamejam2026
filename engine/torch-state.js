/**
 * TorchState — per-floor torch slot model and registry.
 *
 * Every TORCH_LIT / TORCH_UNLIT tile on a floor is registered here with
 * a 3-slot fuel model:
 *   slot states: 'flame' | 'fuel_hydrated' | 'fuel_dry' | 'empty'
 *
 * Readiness scoring:
 *   flame=0  (torch should be unlit for reset)
 *   fuel_hydrated(ideal)=1.0, fuel_hydrated(generic)=0.6
 *   fuel_dry=0.3, non-fuel-junk=0.15, empty=0.0
 *
 * Layer 1 — depends on: TILES
 */
var TorchState = (function () {
  'use strict';

  var SLOTS_PER_TORCH = 3;

  // ── Biome → ideal fuel mapping ───────────────────────────────────
  var BIOME_FUEL = {
    bazaar:       'torch_oil_coral',
    inn:          'torch_oil_drift',
    cellar_entry: 'torch_oil_drift',
    catacomb:     'torch_oil_deep',
    cellar:       'torch_oil_deep',
    foundry:      'torch_oil_deep',
    sealab:       'torch_oil_deep'
  };
  var GENERIC_FUEL  = 'torch_oil';
  var WATER_BOTTLE  = 'water_bottle';

  // ── Per-floor registries: floorId → { 'x,y': torchRecord } ──────
  var _floors = {};

  // Floors whose TorchState came from a save blob (M2.3b). When a floor
  // is flagged here, subsequent FloorManager floor-generation passes
  // must NOT re-seed authored baseline torches or re-roll hero damage —
  // the saved records are the source of truth. registerFloor instead
  // writes torch.tile back onto the freshly-generated grid so the
  // TORCH_LIT/TORCH_UNLIT values match the saved state.
  var _loaded = {};

  // ── ReadinessCalc event-bus bridge (DOC-109 Phase 1 wiring) ─────
  // Torch extinguish/fill/hydrate all feed TorchState.getReadiness,
  // which ReadinessCalc rolls into the core score. Microtask-debounced.
  function _markDirty(floorId) {
    if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.markDirty) {
      ReadinessCalc.markDirty(floorId);
    }
  }

  // ── Fuel classification helpers ──────────────────────────────────

  function isTorchFuel(itemId) {
    return itemId === GENERIC_FUEL ||
           itemId === 'torch_oil_coral' ||
           itemId === 'torch_oil_drift' ||
           itemId === 'torch_oil_deep';
  }

  function isWater(itemId) {
    return itemId === WATER_BOTTLE;
  }

  /** Returns true if itemId is the ideal fuel for this torch's biome. */
  function _isIdealFuel(torch, itemId) {
    return itemId === torch.idealFuel;
  }

  // ── Registry lifecycle ───────────────────────────────────────────

  /**
   * Scan a floor grid and register every torch tile.
   * Called from FloorManager after grid generation.
   *
   * @param {string} floorId
   * @param {number[][]} grid
   * @param {number} W - grid width
   * @param {number} H - grid height
   * @param {string} biome - floor biome key (from FloorManager.getBiome)
   */
  function registerFloor(floorId, grid, W, H, biome) {
    // Post-load path: records came from a save, grid is authored-baseline
    // fresh. Sync each saved torch.tile back onto the grid and short-circuit
    // the scan. Hero damage must NOT re-run (applyHeroDamage checks _loaded).
    if (_loaded[floorId] && _floors[floorId]) {
      var saved = _floors[floorId];
      for (var sk in saved) {
        if (!saved.hasOwnProperty(sk)) continue;
        var st = saved[sk];
        if (!st) continue;
        if (grid[st.y] && typeof grid[st.y][st.x] !== 'undefined') {
          grid[st.y][st.x] = st.tile;
        }
      }
      return;
    }
    if (_floors[floorId]) return; // already registered (cached floor)

    var torches = {};
    var idealFuel = BIOME_FUEL[biome] || GENERIC_FUEL;

    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var t = grid[y][x];
        if (t !== TILES.TORCH_LIT && t !== TILES.TORCH_UNLIT) continue;

        var key = x + ',' + y;
        torches[key] = {
          x: x,
          y: y,
          tile: t,
          biome: biome,
          idealFuel: idealFuel,
          slots: _makeDefaultSlots(t)
        };
      }
    }

    _floors[floorId] = torches;
  }

  /**
   * Build default 3-slot array for a torch tile.
   * Lit torch:   [flame, empty, empty]
   * Unlit torch: [empty, empty, empty]
   */
  function _makeDefaultSlots(tileType) {
    var slots = [];
    for (var i = 0; i < SLOTS_PER_TORCH; i++) {
      slots.push({ state: 'empty', item: null });
    }
    if (tileType === TILES.TORCH_LIT) {
      slots[0] = { state: 'flame', item: null };
    }
    return slots;
  }

  // ── Hero damage patterns (§3g) ──────────────────────────────────
  // Called by GridGen after torch placement to simulate post-hero state.

  /**
   * Apply hero damage to all torches on a floor.
   * Modifies both the torch records AND the grid tiles in-place.
   *
   * @param {string} floorId
   * @param {number[][]} grid
   * @param {Object} opts - { corpsePositions: Set<'x,y'>, stairPositions: Set<'x,y'> }
   */
  function applyHeroDamage(floorId, grid, opts) {
    // Loaded-from-save floors already carry real hero damage from a prior
    // session; re-rolling would clobber it. Skip unconditionally.
    if (_loaded[floorId]) return;
    var torches = _floors[floorId];
    if (!torches) return;

    opts = opts || {};
    var corpses = opts.corpsePositions || {};
    var stairs  = opts.stairPositions  || {};

    var keys = Object.keys(torches);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var torch = torches[k];

      // Torches near stairs: always lit (hero used for navigation)
      if (_nearSet(torch.x, torch.y, stairs, 2)) {
        _setLit(torch, grid);
        // Leave 1 dry fuel slot (hero didn't bother with fuel)
        torch.slots[1] = { state: 'fuel_dry', item: { id: torch.idealFuel } };
        continue;
      }

      // Torches near corpses: always unlit, fully emptied
      if (_nearSet(torch.x, torch.y, corpses, 2)) {
        _setUnlit(torch, grid);
        for (var s = 0; s < SLOTS_PER_TORCH; s++) {
          torch.slots[s] = { state: 'empty', item: null };
        }
        continue;
      }

      // General population: 40% stay lit, 60% extinguished
      var roll = ((torch.x * 374761 + torch.y * 668265) & 0x7fffffff) / 0x7fffffff;

      if (roll < 0.40) {
        // Stays lit — 0-2 empty fuel slots
        _setLit(torch, grid);
        var emptyCount = roll < 0.15 ? 2 : (roll < 0.28 ? 1 : 0);
        for (var ei = 0; ei < emptyCount; ei++) {
          torch.slots[SLOTS_PER_TORCH - 1 - ei] = { state: 'empty', item: null };
        }
        // Remaining non-flame slots: dry fuel
        for (var di = 1; di < SLOTS_PER_TORCH; di++) {
          if (torch.slots[di].state === 'empty') continue;
          torch.slots[di] = { state: 'fuel_dry', item: { id: torch.idealFuel } };
        }
      } else {
        // Extinguished — 2-3 empty slots
        _setUnlit(torch, grid);
        var keepOne = roll > 0.85; // ~15% retain 1 dry fuel slot
        for (var ui = 0; ui < SLOTS_PER_TORCH; ui++) {
          torch.slots[ui] = { state: 'empty', item: null };
        }
        if (keepOne) {
          torch.slots[SLOTS_PER_TORCH - 1] = { state: 'fuel_dry', item: { id: torch.idealFuel } };
        }
      }
    }
    _markDirty(floorId);
  }

  function _nearSet(x, y, posSet, radius) {
    for (var dy = -radius; dy <= radius; dy++) {
      for (var dx = -radius; dx <= radius; dx++) {
        var key = (x + dx) + ',' + (y + dy);
        if (posSet[key]) return true;
      }
    }
    return false;
  }

  function _setLit(torch, grid) {
    torch.tile = TILES.TORCH_LIT;
    grid[torch.y][torch.x] = TILES.TORCH_LIT;
    if (torch.slots[0].state !== 'flame') {
      torch.slots[0] = { state: 'flame', item: null };
    }
  }

  function _setUnlit(torch, grid) {
    torch.tile = TILES.TORCH_UNLIT;
    grid[torch.y][torch.x] = TILES.TORCH_UNLIT;
    if (torch.slots[0].state === 'flame') {
      torch.slots[0] = { state: 'empty', item: null };
    }
  }

  // ── Interaction helpers (used by TorchPeek) ──────────────────────

  /**
   * Get the torch record at (x, y) on a floor.
   * @returns {Object|null} torch record or null
   */
  function getTorch(floorId, x, y) {
    var torches = _floors[floorId];
    if (!torches) return null;
    return torches[x + ',' + y] || null;
  }

  /**
   * Extinguish a lit torch (water bottle method).
   * Flame slot → fuel_hydrated (water hydrates the remnant) or empty.
   * Returns true if torch was lit and is now extinguished.
   */
  function extinguish(floorId, x, y, grid) {
    var torch = getTorch(floorId, x, y);
    if (!torch || torch.tile !== TILES.TORCH_LIT) return false;

    // Flame slot becomes fuel_hydrated if there was any fuel context,
    // otherwise empty. Per roadmap §3b: "the water freed the slot AND
    // hydrated the fuel beneath"
    var hadFuelBelow = false;
    for (var i = 1; i < SLOTS_PER_TORCH; i++) {
      if (torch.slots[i].state === 'fuel_dry' || torch.slots[i].state === 'fuel_hydrated') {
        hadFuelBelow = true;
        break;
      }
    }
    torch.slots[0] = hadFuelBelow
      ? { state: 'fuel_hydrated', item: { id: torch.idealFuel } }
      : { state: 'empty', item: null };

    _setUnlit(torch, grid);
    _markDirty(floorId);
    return true;
  }

  /**
   * Pressure-wash extinguish: the destructive hose-spray path.
   *
   * Distinct from the water-bottle `extinguish()` above — this is the
   * "fast, careless" method per PRESSURE_WASHING_ROADMAP §7.1:
   *
   *   1. Flame slot       → 'empty'    (fire knocked out, zero hydration)
   *   2. fuel_dry slots   → 'empty'    (water blast ruins dry fuel)
   *   3. fuel_hydrated    → survives   (already wet, water can't hurt it)
   *   4. Tile flips TORCH_LIT → TORCH_UNLIT
   *
   * Junk (non-fuel items in fuel_dry slots) is also blown out since it's
   * classified as fuel_dry internally — spec treats anything in a dry slot
   * as destroyable collateral.
   *
   * The caller is responsible for side effects (light source removal, wall
   * decor sync, toast, stats) — TorchState is data-only and doesn't depend
   * on Lighting / FloorManager / Toast. See TorchHitResolver for the
   * full side-effect chain.
   *
   * @param {string} floorId
   * @param {number} x
   * @param {number} y
   * @param {number[][]} grid — current floor grid (mutated in place)
   * @returns {{ extinguished: boolean, slotsRuined: number, slotsSurvived: number }|null}
   *          null if no torch at that tile; otherwise a summary.
   *          extinguished=true only when the torch was actually lit.
   */
  function pressureWashExtinguish(floorId, x, y, grid) {
    var torch = getTorch(floorId, x, y);
    if (!torch) return null;
    if (torch.tile !== TILES.TORCH_LIT) {
      return { extinguished: false, slotsRuined: 0, slotsSurvived: 0 };
    }

    var ruined = 0;
    var survived = 0;

    // Slot 0 is the flame slot on a lit torch — water knocks it out flat.
    torch.slots[0] = { state: 'empty', item: null };

    // Fuel slots: destroy dry, keep hydrated.
    for (var i = 1; i < SLOTS_PER_TORCH; i++) {
      var s = torch.slots[i];
      if (s.state === 'fuel_dry') {
        torch.slots[i] = { state: 'empty', item: null };
        ruined++;
      } else if (s.state === 'fuel_hydrated') {
        survived++;
      }
      // 'empty' slots stay empty — nothing to count
    }

    _setUnlit(torch, grid);
    _markDirty(floorId);
    return { extinguished: true, slotsRuined: ruined, slotsSurvived: survived };
  }

  /**
   * Fill an empty slot with a fuel item.
   * @param {number} slotIdx - 0-based slot index
   * @param {string} itemId  - item being placed
   * @returns {boolean} success
   */
  function fillSlot(floorId, x, y, slotIdx, itemId) {
    var torch = getTorch(floorId, x, y);
    if (!torch) return false;
    if (slotIdx < 0 || slotIdx >= SLOTS_PER_TORCH) return false;
    if (torch.slots[slotIdx].state !== 'empty') return false;

    if (isTorchFuel(itemId)) {
      torch.slots[slotIdx] = { state: 'fuel_dry', item: { id: itemId } };
    } else {
      // Non-fuel junk (bandage, cloth, etc.)
      torch.slots[slotIdx] = { state: 'fuel_dry', item: { id: itemId, junk: true } };
    }
    _markDirty(floorId);
    return true;
  }

  /**
   * Hydrate a fuel_dry slot with water.
   * @returns {boolean} success
   */
  function hydrateSlot(floorId, x, y, slotIdx) {
    var torch = getTorch(floorId, x, y);
    if (!torch) return false;
    if (slotIdx < 0 || slotIdx >= SLOTS_PER_TORCH) return false;
    if (torch.slots[slotIdx].state !== 'fuel_dry') return false;

    torch.slots[slotIdx].state = 'fuel_hydrated';
    _markDirty(floorId);
    return true;
  }

  // ── Readiness scoring (§3e) ──────────────────────────────────────

  /**
   * Score a single slot: 0.0–1.0.
   */
  function _scoreSlot(torch, slot) {
    switch (slot.state) {
      case 'flame':          return 0;     // Should be unlit
      case 'fuel_hydrated':
        if (!slot.item) return 0.6;
        if (slot.item.junk) return 0.15;
        return (slot.item.id === torch.idealFuel) ? 1.0 : 0.6;
      case 'fuel_dry':
        if (!slot.item) return 0.15;
        if (slot.item.junk) return 0.15;
        return 0.3;
      case 'empty':          return 0;
      default:               return 0;
    }
  }

  /**
   * Get torch readiness for a floor: 0.0–1.0.
   * Perfect = every torch unlit, all 3 slots filled with ideal hydrated fuel.
   */
  function getReadiness(floorId) {
    var torches = _floors[floorId];
    if (!torches) return 1.0; // No torches = fully ready

    var keys = Object.keys(torches);
    if (keys.length === 0) return 1.0;

    var totalScore = 0;
    var maxScore = keys.length * SLOTS_PER_TORCH;

    for (var i = 0; i < keys.length; i++) {
      var torch = torches[keys[i]];
      for (var s = 0; s < SLOTS_PER_TORCH; s++) {
        totalScore += _scoreSlot(torch, torch.slots[s]);
      }
    }

    return totalScore / maxScore;
  }

  /**
   * Get torch counts for HUD display.
   * @returns {{ total: number, lit: number, unlit: number, ready: number }}
   */
  function getCounts(floorId) {
    var torches = _floors[floorId];
    if (!torches) return { total: 0, lit: 0, unlit: 0, ready: 0 };

    var keys = Object.keys(torches);
    var counts = { total: keys.length, lit: 0, unlit: 0, ready: 0 };

    for (var i = 0; i < keys.length; i++) {
      var torch = torches[keys[i]];
      if (torch.tile === TILES.TORCH_LIT) {
        counts.lit++;
      } else {
        counts.unlit++;
        // Count as "ready" if all slots are fuel_hydrated
        var allHydrated = true;
        for (var s = 0; s < SLOTS_PER_TORCH; s++) {
          if (torch.slots[s].state !== 'fuel_hydrated') {
            allHydrated = false;
            break;
          }
        }
        if (allHydrated) counts.ready++;
      }
    }

    return counts;
  }

  /**
   * Clear a floor's torch data (floor unloaded).
   */
  function clearFloor(floorId) {
    delete _floors[floorId];
    delete _loaded[floorId];
    _markDirty(floorId);
  }

  /**
   * Reset all torch data (new game).
   */
  function reset() {
    _floors = {};
    _loaded = {};
    if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.invalidate) {
      ReadinessCalc.invalidate();
    }
  }

  // ── Save/Load (Track B M2.3b) ────────────────────────────────────
  //
  // Torch records are plain JSON (no Uint8Arrays, no functions), so
  // serialize is a deep-copy and deserialize rebuilds the map in-place.
  // The grid-sync step happens lazily via registerFloor when FloorManager
  // regenerates the floor post-load — the _loaded flag tells registerFloor
  // to patch grid tiles from records instead of re-scanning the grid.

  function _copyTorch(t) {
    if (!t) return null;
    var slots = [];
    for (var i = 0; i < SLOTS_PER_TORCH; i++) {
      var s = t.slots && t.slots[i];
      if (!s) { slots.push({ state: 'empty', item: null }); continue; }
      var itemCopy = null;
      if (s.item) {
        itemCopy = { id: s.item.id };
        if (s.item.junk) itemCopy.junk = true;
      }
      slots.push({ state: s.state, item: itemCopy });
    }
    return {
      x:         t.x | 0,
      y:         t.y | 0,
      tile:      t.tile | 0,
      biome:     t.biome || '',
      idealFuel: t.idealFuel || GENERIC_FUEL,
      slots:     slots
    };
  }

  function serialize(floorId) {
    var torches = _floors[floorId];
    if (!torches) return null;
    var out = {};
    var keys = Object.keys(torches);
    if (keys.length === 0) return null;
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = _copyTorch(torches[keys[i]]);
    }
    return out;
  }

  function deserialize(floorId, snap) {
    delete _floors[floorId];
    delete _loaded[floorId];
    if (!snap || typeof snap !== 'object') return;
    var restored = {};
    var any = false;
    for (var k in snap) {
      if (!snap.hasOwnProperty(k)) continue;
      var t = _copyTorch(snap[k]);
      if (!t) continue;
      restored[k] = t;
      any = true;
    }
    if (!any) return;
    _floors[floorId] = restored;
    _loaded[floorId] = true;
    _markDirty(floorId);
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    SLOTS_PER_TORCH: SLOTS_PER_TORCH,
    WATER_BOTTLE:    WATER_BOTTLE,

    registerFloor:   registerFloor,
    applyHeroDamage: applyHeroDamage,
    getTorch:        getTorch,

    isTorchFuel:     isTorchFuel,
    isWater:         isWater,

    extinguish:              extinguish,
    pressureWashExtinguish:  pressureWashExtinguish,
    fillSlot:                fillSlot,
    hydrateSlot:             hydrateSlot,

    getReadiness:    getReadiness,
    getCounts:       getCounts,
    clearFloor:      clearFloor,
    reset:           reset,

    // Save/Load (M2.3b)
    serialize:       serialize,
    deserialize:     deserialize
  };
})();
