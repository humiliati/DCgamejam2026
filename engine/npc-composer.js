/**
 * NpcComposer — seed-based NPC stack generator.
 *
 * Generates deterministic triple-emoji stacks from a numeric seed,
 * producing 12M+ unique combinations from curated emoji kits.
 * Each slot (head, hat, torso, weapon, legs) is selected via
 * integer division of the seed across prime-spaced pools.
 *
 * Also provides named vendor presets for faction shopkeepers
 * and role-based composition templates (guard, merchant, citizen, etc.)
 *
 * Layer 1 (depends on: nothing — pure data + helpers)
 */
var NpcComposer = (function () {
  'use strict';

  // ── Emoji kit pools ────────────────────────────────────────────
  // Curated for clarity at 12–40px raycaster sizes.
  // Weighted empties ('') reduce accessory frequency for variety.

  var HEADS   = ['👤','👦','👧','👨','👩','🧑','👴','👵','🧙','🧝','🤖','👹'];
  var HATS    = ['','','','','⛑️','🎩','👒','🪖','👑','🧢','🎓'];
  var TORSOS  = ['🧥','👔','👕','🥼','🦺','🎽','👘','🥷'];
  var WEAPONS = ['','','','','','⚔️','🗡️','🏹','🛡️','🪓','🔧','🪄','🔱','🥍'];
  var LEGS    = ['👖','👖','👖','🩳','🥾','👗','🦿'];

  // Primes used for pool indexing — spread seed bits across pools
  var P_HEAD = 1;
  var P_HAT  = 13;
  var P_TORSO = 97;
  var P_WEAPON = 211;
  var P_LEGS = 331;
  var P_HUE  = 137;

  // ── Role templates ──────────────────────────────────────────────
  // Override specific pools for role-specific NPCs while keeping
  // other slots seed-varied.

  var ROLES = {
    guard:    { hats: ['⛑️','🪖','⛑️'],    weapons: ['⚔️','🛡️','🗡️'],      torsos: ['🦺','🥷','🦺'] },
    merchant: { hats: ['🎩','👒','🧢',''],  weapons: ['','','🔧',''],          torsos: ['👔','🧥','👕'] },
    scholar:  { hats: ['🎓','🎓','🎩'],     weapons: ['📜','🪄','📜'],        torsos: ['🥼','👔','🥼'] },
    citizen:  { hats: ['','','','🧢','👒'],  weapons: ['','','',''],            torsos: ['👕','🎽','👘','🧥'] },
    rogue:    { hats: ['','',''],             weapons: ['🗡️','🏹','🗡️'],      torsos: ['🥷','🖤','🥷'] },
    priest:   { hats: ['','👑',''],           weapons: ['','🪄',''],            torsos: ['👘','👘','🥼'] },
    // ── Faction uniforms (GTA2-style gang visuals) ──
    tide_member:      { hats: ['🎓','','',''],      weapons: ['🪄','🔱','',''],    torsos: ['👘','🥼','👘'],   tintHue: 200 },
    foundry_member:   { hats: ['⛑️','🧢','⛑️'],   weapons: ['🔧','🪓','⚔️'],    torsos: ['🦺','🧥','🦺'],  tintHue: 30  },
    admiralty_member:  { hats: ['🪖','👑','🪖'],    weapons: ['🛡️','🏹','⚔️'],   torsos: ['🧥','👔','🧥'],  tintHue: 280 }
  };

  // ── Named vendor presets ────────────────────────────────────────
  // Faction vendors get hand-crafted stacks, not random compositions.

  var VENDOR_PRESETS = {
    tide: {
      head: '🧙', torso: '👘', legs: '🥾',
      hat: null, hatScale: 0.5, hatBehind: false,
      frontWeapon: '🥍', frontWeaponScale: 0.65, frontWeaponOffsetX: 0.25,
      backWeapon: null, backWeaponScale: 0.4, backWeaponOffsetX: 0.3,
      headMods: null, torsoMods: null,
      tintHue: 200, corpse: null
    },
    foundry: {
      head: '👨', torso: '🦺', legs: '👖',
      hat: '⛑️', hatScale: 0.5, hatBehind: false,
      frontWeapon: '🔧', frontWeaponScale: 0.6, frontWeaponOffsetX: -0.25,
      backWeapon: null, backWeaponScale: 0.4, backWeaponOffsetX: 0.3,
      headMods: null, torsoMods: null,
      tintHue: 30, corpse: null
    },
    admiralty: {
      head: '👩', torso: '🧥', legs: '🥾',
      hat: '🪖', hatScale: 0.5, hatBehind: false,
      frontWeapon: '🛡️', frontWeaponScale: 0.55, frontWeaponOffsetX: -0.2,
      backWeapon: '⚔️', backWeaponScale: 0.4, backWeaponOffsetX: 0.3,
      headMods: null, torsoMods: null,
      tintHue: 280, corpse: null
    },
    // ── Dispatcher (player's employer) ─────────────────────────────
    // Dragon-headed agency handler. Blocks the dungeon gate on day 1
    // until the player retrieves their work keys from home (Floor 1.6).
    // Visual spec: dragon head, black jacket, black trousers, clipboard.
    dispatcher: {
      head: '🐉', torso: '🧥', legs: '👖',
      hat: null, hatScale: 0.5, hatBehind: false,
      frontWeapon: '📋', frontWeaponScale: 0.55, frontWeaponOffsetX: -0.22,
      backWeapon: null, backWeaponScale: 0.4, backWeaponOffsetX: 0.3,
      headMods: null, torsoMods: null,
      tintHue: 0,     // Desaturated — monochrome black suit
      corpse: null
    }
  };

  /**
   * Compose a deterministic NPC stack from a numeric seed.
   *
   * @param {number} seed - Integer seed (entity id, tile hash, etc.)
   * @param {string} [role] - Optional role key from ROLES table
   * @returns {Object} Stack definition compatible with EnemySprites.registerStack()
   */
  function compose(seed, role) {
    seed = Math.abs(seed | 0);  // Coerce to non-negative integer

    var headPool   = HEADS;
    var hatPool    = HATS;
    var torsoPool  = TORSOS;
    var weaponPool = WEAPONS;
    var legPool    = LEGS;

    // Override pools for role-specific NPCs
    var roleDef = (role && ROLES[role]) ? ROLES[role] : null;
    if (roleDef) {
      if (roleDef.hats)    hatPool    = roleDef.hats;
      if (roleDef.weapons) weaponPool = roleDef.weapons;
      if (roleDef.torsos)  torsoPool  = roleDef.torsos;
    }

    var h  = headPool[seed % headPool.length];
    var ha = hatPool[Math.floor(seed / P_HAT) % hatPool.length];
    var t  = torsoPool[Math.floor(seed / P_TORSO) % torsoPool.length];
    var w  = weaponPool[Math.floor(seed / P_WEAPON) % weaponPool.length];
    var l  = legPool[Math.floor(seed / P_LEGS) % legPool.length];
    // Faction roles override hue with their faction's tint; others get seed-varied hue
    var hue = (roleDef && roleDef.tintHue !== undefined) ? roleDef.tintHue : ((seed * P_HUE) % 360);

    return {
      head: h,
      torso: t,
      legs: l,
      hat: ha || null,
      hatScale: 0.5,
      hatBehind: false,
      frontWeapon: w || null,
      frontWeaponScale: 0.65,
      frontWeaponOffsetX: -0.25,
      backWeapon: null,
      backWeaponScale: 0.4,
      backWeaponOffsetX: 0.3,
      headMods: null,
      torsoMods: null,
      tintHue: hue,
      corpse: '💀'
    };
  }

  /**
   * Get a hand-crafted vendor preset by faction ID.
   *
   * @param {string} factionId - 'tide', 'foundry', or 'admiralty'
   * @returns {Object|null} Stack definition or null if not found
   */
  function getVendorPreset(factionId) {
    return VENDOR_PRESETS[factionId] || null;
  }

  /**
   * Register a new vendor preset at runtime.
   *
   * @param {string} factionId
   * @param {Object} stackDef - Full stack definition
   */
  function registerVendorPreset(factionId, stackDef) {
    VENDOR_PRESETS[factionId] = stackDef;
  }

  /**
   * Get list of available role keys.
   * @returns {string[]}
   */
  function getRoles() {
    return Object.keys(ROLES);
  }

  // ── Public API ───────────────────────────────────────────────────
  return Object.freeze({
    compose:              compose,
    getVendorPreset:      getVendorPreset,
    registerVendorPreset: registerVendorPreset,
    getRoles:             getRoles
  });
})();
