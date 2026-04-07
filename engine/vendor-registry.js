/**
 * VendorRegistry — Central vendor placement, faction resolution, and NPC spawning.
 *
 * SC-G: Replaces fragmented vendor management that was spread across floor
 * blockout `shops[]` arrays, game.js SHOP tile handler, and game.js NPC
 * spawning path. All vendor concerns now route through this module.
 *
 * Spatial contract: Vendors operate at D1 (outdoor stalls) and D2 (indoor
 * shops) only. D3+ dungeons have no vendors — the dungeon economy is
 * restock-for-coins, not commerce.
 *
 * Layer 2 module — depends on: FloorManager (soft), NpcComposer (soft),
 * Shop (soft), DayCycle (soft).
 */
var VendorRegistry = (function () {
  'use strict';

  // ── NPC dialogue data (extracted from game.js) ─────────────────────

  var NPC_DATA = {
    tide: {
      name:    'Kai',
      emoji:   '\uD83D\uDC09',  // 🐉
      first:   'Welcome, Gleaner. The Tide Council watches\nthe currents of trade. Browse our wares.',
      lines: [
        'The tides bring fortune today.',
        'Back again? I have new stock.',
        'The Council appreciates your patronage.',
        'Trade well, Gleaner.'
      ]
    },
    foundry: {
      name:    'Renko',
      emoji:   '\u2699\uFE0F',  // ⚙️
      first:   'Hah! Fresh hands for the Foundry.\nEverything here is forged to last.',
      lines: [
        'Need something reforged?',
        'The anvil never sleeps.',
        'Foundry steel. Accept no substitute.',
        'Business is business.'
      ]
    },
    admiralty: {
      name:    'Vasca',
      emoji:   '\uD83C\uDF0A',  // 🌊
      first:   'The Admiralty extends its hand.\nWe deal in... refined goods.',
      lines: [
        'The sea remembers its debts.',
        'Rare finds, fair prices.',
        'Only the best for Admiralty clients.',
        'Anchors and aces, Gleaner.'
      ]
    }
  };

  // ── Internal state ─────────────────────────────────────────────────

  /** @type {Object.<string, {x:number, y:number, floorId:string, faction:string, facing:string}>} */
  var _vendors = {};          // keyed by "x,y,floorId"

  /** @type {Object.<string, number>} */
  var _visits = {};           // keyed by faction, counts per-session visits

  var _currentFloorId = null; // last floor we registered vendors for

  // ── Key helper ─────────────────────────────────────────────────────

  function _key(x, y, floorId) {
    return x + ',' + y + ',' + floorId;
  }

  // ── Registration ───────────────────────────────────────────────────

  /**
   * Register all vendors declared in a floor's `shops[]` array.
   * Called on floor load. Clears previous registrations for different floors.
   *
   * SC-G depth contract: silently skips vendors at D3+ (dungeon depth).
   *
   * @param {string} floorId
   * @param {Array}  shopList - [{x, y, faction|factionId, facing}]
   */
  function registerFloor(floorId, shopList) {
    if (!shopList || !shopList.length) return;

    // Depth contract: D1/D2 only
    var depth = floorId ? String(floorId).split('.').length : 1;
    if (depth >= 3) return;

    _currentFloorId = floorId;

    for (var i = 0; i < shopList.length; i++) {
      var s = shopList[i];
      var faction = s.faction || s.factionId || 'tide';
      var key = _key(s.x, s.y, floorId);
      _vendors[key] = {
        x: s.x,
        y: s.y,
        floorId: floorId,
        faction: faction,
        facing: s.facing || 'south'
      };
    }
  }

  /**
   * Clear all vendor registrations for a given floor.
   * Called when floor data is unloaded / cleared.
   */
  function clearFloor(floorId) {
    for (var key in _vendors) {
      if (_vendors.hasOwnProperty(key) && _vendors[key].floorId === floorId) {
        delete _vendors[key];
      }
    }
  }

  /** Clear all registrations (full reset). */
  function clearAll() {
    _vendors = {};
    _visits = {};
    _currentFloorId = null;
  }

  // ── Lookup ─────────────────────────────────────────────────────────

  /**
   * Get the faction ID for the vendor at (x, y, floorId).
   * Returns null if no vendor is registered at that position.
   */
  function getFaction(x, y, floorId) {
    var v = _vendors[_key(x, y, floorId)];
    return v ? v.faction : null;
  }

  /**
   * Get the full vendor entry at (x, y, floorId).
   * Returns null if no vendor registered.
   */
  function getVendor(x, y, floorId) {
    return _vendors[_key(x, y, floorId)] || null;
  }

  /**
   * Check if a position has a registered vendor.
   */
  function hasVendor(x, y, floorId) {
    return !!_vendors[_key(x, y, floorId)];
  }

  /**
   * Get all vendors on a given floor. Returns array of vendor entries.
   */
  function getFloorVendors(floorId) {
    var result = [];
    for (var key in _vendors) {
      if (_vendors.hasOwnProperty(key) && _vendors[key].floorId === floorId) {
        result.push(_vendors[key]);
      }
    }
    return result;
  }

  // ── Visit tracking ─────────────────────────────────────────────────

  /**
   * Record a visit to a faction vendor. Returns the new visit count.
   * Used by greeting rotation logic.
   */
  function recordVisit(factionId) {
    _visits[factionId] = (_visits[factionId] || 0) + 1;
    return _visits[factionId];
  }

  /** Get the current visit count for a faction. */
  function getVisitCount(factionId) {
    return _visits[factionId] || 0;
  }

  // ── NPC data access ────────────────────────────────────────────────

  /**
   * Get NPC dialogue data for a faction.
   * Returns {name, emoji, first, lines} or a default for unknown factions.
   */
  function getNpcData(factionId) {
    return NPC_DATA[factionId] || NPC_DATA.tide;
  }

  /**
   * Get the appropriate greeting for a faction based on visit count.
   */
  function getGreeting(factionId) {
    var npc = getNpcData(factionId);
    var visits = getVisitCount(factionId);
    if (visits <= 1) {
      return npc.first;
    }
    var idx = (visits - 2) % npc.lines.length;
    return npc.lines[idx];
  }

  // ── NPC sprite generation ──────────────────────────────────────────

  /**
   * Generate sprite defs for all vendors on the current floor.
   * Returns an array of sprite objects compatible with game.js _sprites[].
   *
   * @param {string} floorId
   * @returns {Array} Sprite definitions
   */
  function buildSprites(floorId) {
    if (typeof NpcComposer === 'undefined') return [];

    var vendors = getFloorVendors(floorId);
    var sprites = [];

    for (var i = 0; i < vendors.length; i++) {
      var v = vendors[i];
      var vendorStack = NpcComposer.getVendorPreset(v.faction);
      if (!vendorStack) continue;

      sprites.push({
        x: v.x, y: v.y,
        id: 'vendor_' + v.faction,
        emoji: vendorStack.head || vendorStack.torso || '\uD83E\uDDD9',
        stack: {
          head:   vendorStack.head   || '',
          torso:  vendorStack.torso  || '',
          legs:   vendorStack.legs   || '',
          hat:    vendorStack.hat    ? { emoji: vendorStack.hat, scale: vendorStack.hatScale || 0.5, behind: !!vendorStack.hatBehind } : null,
          backWeapon:  vendorStack.backWeapon  ? { emoji: vendorStack.backWeapon,  scale: vendorStack.backWeaponScale || 0.4,  offsetX: vendorStack.backWeaponOffsetX || 0.3 }  : null,
          frontWeapon: vendorStack.frontWeapon ? { emoji: vendorStack.frontWeapon, scale: vendorStack.frontWeaponScale || 0.65, offsetX: vendorStack.frontWeaponOffsetX || -0.25 } : null,
          headMods:  vendorStack.headMods  || null,
          torsoMods: vendorStack.torsoMods || null,
          tintHue: vendorStack.tintHue
        },
        color: null,
        scale: 0.7,
        facing: v.facing,
        awareness: 0,
        counterOcclude: true,
        glow: null, glowRadius: 0, tint: null,
        particleEmoji: null, overlayText: null,
        bobY: 0, scaleAdd: 0
      });
    }

    return sprites;
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    NPC_DATA:        NPC_DATA,
    registerFloor:   registerFloor,
    clearFloor:      clearFloor,
    clearAll:        clearAll,
    getFaction:      getFaction,
    getVendor:       getVendor,
    hasVendor:       hasVendor,
    getFloorVendors: getFloorVendors,
    recordVisit:     recordVisit,
    getVisitCount:   getVisitCount,
    getNpcData:      getNpcData,
    getGreeting:     getGreeting,
    buildSprites:    buildSprites
  };
})();
