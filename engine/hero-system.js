/**
 * HeroSystem — Abstract Hero Day system + scripted hero encounters.
 *
 * Phase D of the cross-roadmap (DOC-4 §18, DOC-2 §6/§14).
 *
 * Instead of real-time hero AI, the hero's impact is abstracted:
 * on Hero Days (every 3 in-game days, starting day 0), entering a
 * dungeon triggers a **Carnage Manifest** — a procedural report of
 * what the hero destroyed while the player was away. The grid is
 * modified (crates smashed, chests looted, enemies killed, tiles
 * dirtied) and a narrative Toast sequence plays.
 *
 * Four hero archetypes have distinct carnage signatures:
 *   Seeker   — smashes everything, high collateral
 *   Scholar  — solves puzzles, triggers traps, surgical
 *   Shadow   — loots chests cleanly, leaves structure intact
 *   Crusader — destroys undead, blesses tiles, ignores traps
 *
 * The scripted hero glimpse at Floor 2.2.1 (§6.3) still creates a
 * visible hero entity — The Seeker walking away from the player
 * through a corridor of high-level corpses.
 *
 * Layer 3 — depends on: TILES, SeededRNG, DayCycle, Toast, AudioSystem,
 *           CardSystem, FloorManager
 */
var HeroSystem = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  HERO TYPE DEFINITIONS (§18.1)
  // ═══════════════════════════════════════════════════════════════

  var HERO_TYPES = Object.freeze({
    SEEKER:   'seeker',
    SCHOLAR:  'scholar',
    SHADOW:   'shadow',
    CRUSADER: 'crusader'
  });

  var HERO_DEFS = {};
  HERO_DEFS[HERO_TYPES.SEEKER] = Object.freeze({
    name:       'The Seeker',
    emoji:      '⚔️',
    heroClass:  'Fighter',
    threat:     'high',
    suit:       'spade',
    scale:      1.5,
    glow:       '#d4af37',
    glowRadius: 14,
    particleEmoji: '✨',
    tint:       'rgba(200,180,100,0.15)',
    bobY:       0.02,
    // Carnage signature
    smashBreakables:  true,
    lootChests:       true,
    triggerTraps:     true,
    solvePuzzles:     false,
    killEnemies:      true,
    dirtyTiles:       true,
    carnageRate:      0.80   // % of eligible tiles affected
  });
  HERO_DEFS[HERO_TYPES.SCHOLAR] = Object.freeze({
    name:       'The Scholar',
    emoji:      '📖',
    heroClass:  'Mage',
    threat:     'medium',
    suit:       'club',
    scale:      1.3,
    glow:       '#7070cc',
    glowRadius: 10,
    particleEmoji: '🔮',
    tint:       'rgba(100,100,200,0.12)',
    bobY:       0.015,
    smashBreakables:  false,
    lootChests:       true,
    triggerTraps:     true,
    solvePuzzles:     true,
    killEnemies:      false,
    dirtyTiles:       false,
    carnageRate:      0.50
  });
  HERO_DEFS[HERO_TYPES.SHADOW] = Object.freeze({
    name:       'The Shadow',
    emoji:      '🗡️',
    heroClass:  'Rogue',
    threat:     'low',
    suit:       'diamond',
    scale:      1.2,
    glow:       '#505060',
    glowRadius: 6,
    particleEmoji: '💨',
    tint:       'rgba(60,60,80,0.10)',
    bobY:       0.01,
    smashBreakables:  false,
    lootChests:       true,
    triggerTraps:     false,
    solvePuzzles:     false,
    killEnemies:      false,
    dirtyTiles:       false,
    carnageRate:      0.40
  });
  HERO_DEFS[HERO_TYPES.CRUSADER] = Object.freeze({
    name:       'The Crusader',
    emoji:      '🛡️',
    heroClass:  'Paladin',
    threat:     'high',
    suit:       'heart',
    scale:      1.6,
    glow:       '#e0c050',
    glowRadius: 16,
    particleEmoji: '🌟',
    tint:       'rgba(220,200,100,0.18)',
    bobY:       0.025,
    smashBreakables:  true,
    lootChests:       false,
    triggerTraps:     false,
    solvePuzzles:     false,
    killEnemies:      true,
    dirtyTiles:       true,
    carnageRate:      0.65
  });

  // Encounter stages (§18.4) — deck size thresholds
  var ENCOUNTER = Object.freeze({
    EARLY_MAX:    9,
    MID_MAX:     19,
    SHOVE_DMG:    1,
    SHOVE_KB:     2,
    STUN_MS:    2000
  });

  // ═══════════════════════════════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════════════════════════════

  var _heroCount = 0;           // Which hero cycle we're on
  var _lastCarnageManifest = null;
  var _carnageAppliedFloors = {}; // floorId → true (don't re-apply)

  // Scripted hero entity (for Floor 2.2.1 reveal)
  var _scriptedHero = null;
  var _scriptedMoveTimer = 0;
  var _scriptedPath = null;
  var _scriptedPathIdx = 0;

  // Callbacks (wired by Game)
  var _onCarnageApplied = null;
  var _onTileDestroyed = null;
  var _onHeroEncounter = null;

  // ═══════════════════════════════════════════════════════════════
  //  HERO TYPE CYCLING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the hero type for the current Hero Day.
   * Cycles through: Seeker → Scholar → Shadow → Crusader
   */
  function _getCurrentHeroType() {
    var types = [HERO_TYPES.SEEKER, HERO_TYPES.SCHOLAR, HERO_TYPES.SHADOW, HERO_TYPES.CRUSADER];
    return types[_heroCount % types.length];
  }

  function _getCurrentHeroDef() {
    return HERO_DEFS[_getCurrentHeroType()];
  }

  // ═══════════════════════════════════════════════════════════════
  //  CARNAGE MANIFEST (D2 + D6 — abstract patrol + Wake of Carnage)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate a carnage manifest for a dungeon floor.
   * Called when the player enters a dungeon on Hero Day.
   * Returns a report of what the hero destroyed.
   *
   * @param {string} floorId
   * @param {Array}  grid - 2D tile grid (mutable — will be modified)
   * @param {number} gridW
   * @param {number} gridH
   * @param {Array}  rooms - Room data for weighted destruction
   * @param {Array}  enemies - Enemy list (mutable — dead enemies marked hp=0)
   * @returns {Object} Manifest: { heroType, heroName, smashed, looted, disarmed, killed, dirtied }
   */
  function generateCarnageManifest(floorId, grid, gridW, gridH, rooms, enemies) {
    var heroDef = _getCurrentHeroDef();
    var rate = heroDef.carnageRate;

    var manifest = {
      heroType:  _getCurrentHeroType(),
      heroName:  heroDef.name,
      heroEmoji: heroDef.emoji,
      smashed:   0,
      looted:    0,
      disarmed:  0,
      killed:    0,
      dirtied:   0,
      tiles:     [] // Array of {x, y, type} for minimap trail
    };

    // Scan grid for interactable tiles
    for (var y = 1; y < gridH - 1; y++) {
      for (var x = 1; x < gridW - 1; x++) {
        var tile = grid[y][x];

        // Roll against carnage rate (seeded for determinism)
        if (SeededRNG.random() > rate) continue;

        // Breakables
        if (tile === TILES.BREAKABLE && heroDef.smashBreakables) {
          grid[y][x] = TILES.EMPTY;
          manifest.smashed++;
          manifest.tiles.push({ x: x, y: y, type: 'smash' });
          if (_onTileDestroyed) _onTileDestroyed(x, y, 'breakable');
        }

        // Chests
        if (tile === TILES.CHEST && heroDef.lootChests) {
          manifest.looted++;
          manifest.tiles.push({ x: x, y: y, type: 'loot' });
          if (_onTileDestroyed) _onTileDestroyed(x, y, 'chest');
        }

        // Traps
        if (tile === TILES.TRAP && heroDef.triggerTraps) {
          grid[y][x] = TILES.EMPTY;
          manifest.disarmed++;
          manifest.tiles.push({ x: x, y: y, type: 'trap' });
          if (_onTileDestroyed) _onTileDestroyed(x, y, 'trap');
        }

        // Dirty tiles (foot traffic)
        if (tile === TILES.EMPTY && heroDef.dirtyTiles && SeededRNG.random() < 0.3) {
          manifest.dirtied++;
          manifest.tiles.push({ x: x, y: y, type: 'dirty' });
        }
      }
    }

    // Kill enemies
    if (heroDef.killEnemies && enemies) {
      for (var i = enemies.length - 1; i >= 0; i--) {
        var enemy = enemies[i];
        if (enemy.isHero || enemy.friendly) continue;
        if (SeededRNG.random() > rate) continue;
        enemy.hp = 0;
        manifest.killed++;
        manifest.tiles.push({ x: enemy.x, y: enemy.y, type: 'kill' });
        if (_onTileDestroyed) _onTileDestroyed(enemy.x, enemy.y, 'enemy_killed');
      }
    }

    _lastCarnageManifest = manifest;
    return manifest;
  }

  /**
   * Apply carnage to a dungeon floor and narrate the results.
   * Called from Game._onFloorArrive when entering a dungeon on Hero Day.
   *
   * @param {string} floorId
   * @param {Object} floorData - { grid, gridW, gridH, rooms }
   * @param {Array}  enemies
   */
  function applyCarnageIfHeroDay(floorId, floorData, enemies) {
    // Only on Hero Days, only on dungeon floors (depth 3+), only once per floor
    if (typeof DayCycle === 'undefined' || !DayCycle.isHeroDay()) return null;
    if (floorId.split('.').length < 3) return null;
    if (_carnageAppliedFloors[floorId]) return null;

    var manifest = generateCarnageManifest(
      floorId,
      floorData.grid,
      floorData.gridW,
      floorData.gridH,
      floorData.rooms,
      enemies
    );

    _carnageAppliedFloors[floorId] = true;

    // Narrate
    _narrateCarnage(manifest);

    if (_onCarnageApplied) _onCarnageApplied(floorId, manifest);

    return manifest;
  }

  /**
   * Narrate the carnage manifest via Toasts and StatusBar.
   */
  function _narrateCarnage(manifest) {
    if (!manifest) return;

    var lines = [];
    var emoji = manifest.heroEmoji || '⚔️';

    lines.push(emoji + ' ' + manifest.heroName + ' was here.');

    if (manifest.smashed > 0) {
      lines.push('💥 ' + manifest.smashed + ' crate' + (manifest.smashed > 1 ? 's' : '') + ' smashed.');
    }
    if (manifest.looted > 0) {
      lines.push('📦 ' + manifest.looted + ' chest' + (manifest.looted > 1 ? 's' : '') + ' looted.');
    }
    if (manifest.disarmed > 0) {
      lines.push('⚙️ ' + manifest.disarmed + ' trap' + (manifest.disarmed > 1 ? 's' : '') + ' triggered.');
    }
    if (manifest.killed > 0) {
      lines.push('💀 ' + manifest.killed + ' creature' + (manifest.killed > 1 ? 's' : '') + ' slain.');
    }
    if (manifest.dirtied > 0) {
      lines.push('👣 ' + manifest.dirtied + ' tile' + (manifest.dirtied > 1 ? 's' : '') + ' dirtied.');
    }

    // Stagger Toasts for dramatic effect
    for (var i = 0; i < lines.length; i++) {
      (function (line, idx) {
        setTimeout(function () {
          if (typeof Toast !== 'undefined') {
            Toast.show(line, idx === 0 ? 'danger' : 'warning');
          }
          if (typeof StatusBar !== 'undefined' && StatusBar.pushTooltip) {
            StatusBar.pushTooltip(line, 'system');
          }
        }, idx * 1200);
      })(lines[i], i);
    }

    // Summarize for the StatusBar
    var total = manifest.smashed + manifest.looted + manifest.disarmed + manifest.killed;
    if (total > 0) {
      setTimeout(function () {
        if (typeof Toast !== 'undefined') {
          Toast.show('🧹 Your work is cut out for you.', 'info');
        }
      }, lines.length * 1200);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  SCRIPTED HERO ENTITY (Floor 2.2.1 reveal — §6.3)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create the scripted hero entity for the Floor 2.2.1 reveal.
   * The Seeker walks away from the player through a corridor of corpses.
   *
   * @param {number} x - Spawn X (far end of entry corridor)
   * @param {number} y - Spawn Y
   * @param {Array}  path - Pre-scripted waypoints [{x,y}, ...]
   * @returns {Object} Hero entity for sprite rendering
   */
  function createScriptedHero(x, y, path) {
    var def = HERO_DEFS[HERO_TYPES.SEEKER];

    _scriptedHero = {
      id:           'hero_scripted_seeker',
      type:         'hero',
      name:         def.name,
      emoji:        def.emoji,
      heroType:     HERO_TYPES.SEEKER,

      x:            x,
      y:            y,
      facing:       'north',  // Walking AWAY from player
      _prevX:       x,
      _prevY:       y,
      _lerpT:       1,

      scale:        def.scale,
      glow:         def.glow,
      glowRadius:   def.glowRadius,
      particleEmoji: def.particleEmoji,
      tint:         def.tint,
      bobY:         def.bobY,

      hp:           999,
      maxHp:        999,
      str:          99,
      suit:         def.suit,

      friendly:     false,
      nonLethal:    true,
      isHero:       true,
      awareness:    -1,   // Never engages — always fleeing

      path:         null,
      pathIndex:    0,
      pathDirection: 1,
      pathTimer:    0,
      color:        def.glow
    };

    _scriptedPath = path || [];
    _scriptedPathIdx = 0;
    _scriptedMoveTimer = 0;

    return _scriptedHero;
  }

  /**
   * Tick the scripted hero movement.
   * Moves 1 tile per 800ms along pre-scripted path.
   * Speeds to 500ms when player closes to 4 tiles.
   *
   * @param {Object} player - { x, y }
   * @param {number} deltaMs
   */
  function tickScriptedHero(player, deltaMs) {
    if (!_scriptedHero || !_scriptedPath || _scriptedPath.length === 0) return;

    var moveMs = 800;
    if (player) {
      var dist = Math.abs(_scriptedHero.x - player.x) + Math.abs(_scriptedHero.y - player.y);
      if (dist <= 4) moveMs = 500;
    }

    _scriptedMoveTimer += deltaMs;
    if (_scriptedMoveTimer < moveMs) return;
    _scriptedMoveTimer = 0;

    if (_scriptedPathIdx >= _scriptedPath.length) {
      // Reached end of path — despawn
      if (typeof AudioSystem !== 'undefined') {
        AudioSystem.play('ascend-3', { volume: 0.3 });
      }
      var hero = _scriptedHero;
      _scriptedHero = null;
      _scriptedPath = null;
      return hero; // Return for caller to remove from sprite list
    }

    var next = _scriptedPath[_scriptedPathIdx];
    _scriptedHero._prevX = _scriptedHero.x;
    _scriptedHero._prevY = _scriptedHero.y;
    _scriptedHero._lerpT = 0;

    // Face toward next waypoint
    var dx = next.x - _scriptedHero.x;
    var dy = next.y - _scriptedHero.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      _scriptedHero.facing = dx > 0 ? 'east' : 'west';
    } else {
      _scriptedHero.facing = dy > 0 ? 'south' : 'north';
    }

    _scriptedHero.x = next.x;
    _scriptedHero.y = next.y;
    _scriptedPathIdx++;

    return null; // Still moving
  }

  /**
   * Update scripted hero lerp for smooth rendering.
   */
  function updateScriptedLerp(frameDt) {
    if (!_scriptedHero) return;
    if (_scriptedHero._lerpT < 1) {
      _scriptedHero._lerpT = Math.min(1, _scriptedHero._lerpT + frameDt * 1000 / 800);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  ENCOUNTER RESOLUTION (§18.4)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Resolve what happens when the hero engages the player.
   * Called from scripted encounters or if player walks into hero.
   */
  function resolveEncounter() {
    var heroDef = _getCurrentHeroDef();

    var deckSize = 0;
    if (typeof CardSystem !== 'undefined' && CardSystem.getDeck) {
      deckSize = CardSystem.getDeck().length;
    }

    if (deckSize < ENCOUNTER.EARLY_MAX + 1) {
      return {
        stage:   'early',
        message: '"Out of my way, rat."',
        effect:  'shove',
        damage:  ENCOUNTER.SHOVE_DMG,
        knockback: ENCOUNTER.SHOVE_KB,
        stunMs:  ENCOUNTER.STUN_MS
      };
    } else if (deckSize < ENCOUNTER.MID_MAX + 1) {
      return {
        stage:   'mid',
        message: '"You? Fighting? With those cards?"',
        effect:  'confiscate',
        cardCount: 1
      };
    } else {
      return {
        stage:   'late',
        message: '"So the janitor fancies himself a warrior."',
        effect:  'combat',
        heroDef: heroDef
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  function init() {
    _heroCount = 0;
    _lastCarnageManifest = null;
    _carnageAppliedFloors = {};
    _scriptedHero = null;
    _scriptedPath = null;
    console.log('[HeroSystem] Initialized (abstract Hero Day mode)');
  }

  /**
   * Called when a new Hero Day starts (from DayCycle callback).
   */
  function onHeroDayStart(dayNum) {
    _heroCount++;
    _carnageAppliedFloors = {}; // Reset — new Hero Day, fresh carnage
    console.log('[HeroSystem] Hero Day! Cycle ' + _heroCount + ' — ' + _getCurrentHeroDef().name);

    if (typeof Toast !== 'undefined') {
      Toast.show('⚔️ Hero Day — ' + _getCurrentHeroDef().name + ' is dispatched.', 'danger');
    }

    // Fire system bark
    if (typeof BarkLibrary !== 'undefined') {
      BarkLibrary.fire('system.heroday_dawn');
    }
  }

  /**
   * Advance to next hero type (for testing or post-Hero Day).
   */
  function advanceHeroCycle() {
    _heroCount++;
    _carnageAppliedFloors = {};
  }

  // ═══════════════════════════════════════════════════════════════
  //  CALLBACKS
  // ═══════════════════════════════════════════════════════════════

  function setOnCarnageApplied(fn) { _onCarnageApplied = fn; }
  function setOnTileDestroyed(fn)  { _onTileDestroyed = fn; }
  function setOnHeroEncounter(fn)  { _onHeroEncounter = fn; }

  // ═══════════════════════════════════════════════════════════════
  //  QUERIES
  // ═══════════════════════════════════════════════════════════════

  function getScriptedHero()       { return _scriptedHero; }
  function getLastManifest()       { return _lastCarnageManifest; }
  function getCurrentHeroType()    { return _getCurrentHeroType(); }
  function getCurrentHeroDef()     { return _getCurrentHeroDef(); }
  function getHeroCount()          { return _heroCount; }
  function isCarnageApplied(fId)   { return !!_carnageAppliedFloors[fId]; }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  return Object.freeze({
    // Constants
    HERO_TYPES:     HERO_TYPES,
    HERO_DEFS:      HERO_DEFS,
    ENCOUNTER:      ENCOUNTER,

    // Lifecycle
    init:                  init,
    onHeroDayStart:        onHeroDayStart,
    advanceHeroCycle:      advanceHeroCycle,

    // Carnage (abstract Hero Day)
    generateCarnageManifest:  generateCarnageManifest,
    applyCarnageIfHeroDay:    applyCarnageIfHeroDay,

    // Scripted hero (Floor 2.2.1 reveal)
    createScriptedHero:     createScriptedHero,
    tickScriptedHero:       tickScriptedHero,
    updateScriptedLerp:     updateScriptedLerp,

    // Encounter
    resolveEncounter:       resolveEncounter,

    // Callbacks
    setOnCarnageApplied:    setOnCarnageApplied,
    setOnTileDestroyed:     setOnTileDestroyed,
    setOnHeroEncounter:     setOnHeroEncounter,

    // Queries
    getScriptedHero:        getScriptedHero,
    getLastManifest:        getLastManifest,
    getCurrentHeroType:     getCurrentHeroType,
    getCurrentHeroDef:      getCurrentHeroDef,
    getHeroCount:           getHeroCount,
    isCarnageApplied:       isCarnageApplied
  });
})();
