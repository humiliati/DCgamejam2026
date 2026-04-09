/**
 * NpcSystem — NPC type registry, patrol, proximity barks, and interaction.
 *
 * Covers five NPC types:
 *
 *   AMBIENT      — Patrol between waypoints, bark when player is close.
 *                  No interaction verb. Pure atmosphere. The most common type.
 *
 *   INTERACTIVE  — Like AMBIENT but talkable. Shows "[OK] Talk" prompt when
 *                  the player faces them. On interact, fires from their
 *                  dialogue pool or starts a dialogue tree.
 *
 *   VENDOR       — Talkable + shop. Delegates to the existing Shop system
 *                  via factionId. Owns a bark pool for ambient flavour.
 *
 *   DISPATCHER   — Blocks player movement (blocksMovement: true). Forces a
 *                  conversational encounter when bumped. Bark cascade is
 *                  managed by Game._onBump() using BarkLibrary pool keys.
 *                  NpcSystem only handles patrol and spawn for these.
 *
 *   HERO         — Reserved. Hero NPCs rove floors differently from all other
 *                  types (fast patrol, floor-spanning, rare spawns). Not yet
 *                  implemented — stub registered for future wiring.
 *                  See NPC_SYSTEM_ROADMAP.md §5.
 *
 * Integration model:
 *   - NPCs are entity objects compatible with FloorManager.getEnemies().
 *     They are pushed into the active enemy list on spawn and rendered
 *     by the raycaster / enemy-sprite system automatically.
 *   - NpcSystem maintains a per-floor definition registry (_defs) and a
 *     flat active list (_active) for the current floor.
 *   - `spawn(floorId, enemies, grid)` is called from Game._onFloorArrive().
 *   - `tick(playerPos, enemies, dt)` runs at 10fps from Game._tick().
 *   - `interact(npc)` is called by Game._interact() when the player presses
 *     OK on an NPC tile.
 *
 * Patrol model:
 *   Ambient and interactive NPCs use a simple A→B→A greedy step patrol:
 *   every `stepInterval` ms the NPC takes one step toward its current
 *   target waypoint, avoids wall tiles, reverses at endpoints. This is
 *   intentionally cheaper than full Pathfind — ambient patrollers are
 *   decoration, not puzzle elements.
 *
 * Proximity bark model (Fable):
 *   Each tickable NPC has `barkPool` (BarkLibrary key) and `barkRadius`
 *   (tiles). When the player enters the radius AND the NPC's own per-entity
 *   `_barkTimer` has expired, `BarkLibrary.fire(barkPool)` is called.
 *   The BarkLibrary handles pool-level cooldown and anti-repeat; the entity
 *   timer prevents the same NPC from firing more than once every
 *   `barkInterval` ms regardless of pool cooldown.
 *
 * Layer 3 — depends on: TILES, MovementController, BarkLibrary, DialogBox,
 *            NpcComposer (all optional, degrades gracefully if absent)
 */
var NpcSystem = (function () {
  'use strict';

  // ── NPC Types ────────────────────────────────────────────────────

  var TYPES = Object.freeze({
    AMBIENT:     'ambient',
    INTERACTIVE: 'interactive',
    VENDOR:      'vendor',
    DISPATCHER:  'dispatcher',
    HERO:        'hero'
  });

  // ── State ────────────────────────────────────────────────────────

  var _defs   = {};    // floorId → Array<NpcDefinition>
  var _active = [];    // Flat list of live NPC entities (current floor)
  var _trees  = {};    // npcId → dialogue tree object (for INTERACTIVE NPCs)

  // ── Definition schema ────────────────────────────────────────────
  //
  // {
  //   id:           string       — unique stable identifier
  //   type:         TYPES.*      — NPC class
  //   x: number, y: number       — starting grid position
  //   facing:       string       — 'north'|'south'|'east'|'west' (default 'south')
  //   emoji:        string       — fallback emoji (overridden by stack)
  //   stack:        object|null  — NpcComposer stack or null
  //   name:         string       — display name (used in InteractPrompt + DialogBox)
  //
  //   // Patrol (AMBIENT / INTERACTIVE)
  //   patrolPoints: [{x,y},{x,y}]  — 2-point bounce patrol; null = stationary
  //   stepInterval: number          — ms between steps (default 1200)
  //
  //   // Bark (all talkable types + AMBIENT)
  //   barkPool:     string|null  — BarkLibrary pool key for proximity barks
  //   barkRadius:   number       — tiles; default 3
  //   barkInterval: number       — ms between NPC-level bark triggers; default 25000
  //
  //   // Dialogue (INTERACTIVE / VENDOR / DISPATCHER)
  //   talkable:     bool         — shows [OK] Talk prompt (default false for AMBIENT)
  //   dialoguePool: string|null  — BarkLibrary pool key used on interact (single bark)
  //   dialogueTree: object|null  — DialogBox conversation tree (overrides dialoguePool)
  //
  //   // Vendor
  //   factionId:    string|null  — shop faction ID (delegates to Shop system)
  //
  //   // Dispatcher
  //   blocksMovement: bool       — entity.blocksMovement = true
  // }

  // ── Tuning constants ─────────────────────────────────────────────

  var SPAWN_STAGGER_MS = 400;   // Max random added to each NPC's first step timer
  var BARK_STAGGER_MS  = 8000;  // Max random offset to stagger initial bark window

  // ── Verb-field tuning constants ──────────────────────────────────
  // See VERB_FIELD_NPC_ROADMAP.md §6.2

  var VF_DISTANCE_WEIGHT    = 0.15;   // How much distance penalises pull (lower = NPCs walk farther)
  var VF_NOISE_FACTOR       = 0.05;   // Random perturbation on node score (breaks ties)
  var VF_SATISFACTION_DROP   = 0.50;   // How much need drops on node arrival
  var VF_LINGER_MIN         = 3000;   // Min ms NPC pauses at a node
  var VF_LINGER_MAX         = 7000;   // Max ms NPC pauses at a node
  var VF_TRANSITION_BARK_P  = 0.20;   // Probability of solo transition bark on verb switch

  // ── Verb-field archetype presets ─────────────────────────────────
  // Personality expressed as decay rate coefficients.
  // See VERB_FIELD_NPC_ROADMAP.md §5.3

  var VF_ARCHETYPES = {
    scholar: {
      duty:    { need: 0.8, decayRate: 0.0020, satisfiers: ['faction_post'] },
      social:  { need: 0.3, decayRate: 0.0012, satisfiers: ['bonfire', 'well', 'bench'] },
      errands: { need: 0.4, decayRate: 0.0008, satisfiers: ['shop_entrance', 'bulletin_board'] }
    },
    worker: {
      duty:    { need: 0.8, decayRate: 0.0025, satisfiers: ['work_station', 'faction_post'] },
      social:  { need: 0.2, decayRate: 0.0008, satisfiers: ['bonfire', 'well'] },
      errands: { need: 0.5, decayRate: 0.0010, satisfiers: ['shop_entrance', 'bulletin_board'] }
    },
    citizen: {
      duty:    { need: 0.2, decayRate: 0.0005, satisfiers: ['work_station'] },
      social:  { need: 0.5, decayRate: 0.0018, satisfiers: ['bonfire', 'well', 'bench'] },
      errands: { need: 0.6, decayRate: 0.0020, satisfiers: ['shop_entrance', 'bulletin_board'] }
    },
    drunk: {
      duty:    { need: 0.0, decayRate: 0.0002, satisfiers: ['work_station'] },
      social:  { need: 0.8, decayRate: 0.0030, satisfiers: ['bonfire', 'well', 'bench'] },
      errands: { need: 0.1, decayRate: 0.0005, satisfiers: ['shop_entrance'] }
    },
    guard: {
      duty:    { need: 0.9, decayRate: 0.0028, satisfiers: ['faction_post'] },
      social:  { need: 0.1, decayRate: 0.0004, satisfiers: ['bonfire'] },
      errands: { need: 0.1, decayRate: 0.0003, satisfiers: ['shop_entrance', 'bulletin_board'] }
    },
    granny: {
      duty:    { need: 0.7, decayRate: 0.0022, satisfiers: ['work_station'] },
      social:  { need: 0.3, decayRate: 0.0010, satisfiers: ['bonfire', 'well', 'bench'] },
      errands: { need: 0.1, decayRate: 0.0004, satisfiers: ['shop_entrance'] },
      rest:    { need: 0.4, decayRate: 0.0015, satisfiers: ['rest_spot', 'bench'] }
    }
  };

  /**
   * Register NPC definitions for a floor.
   * Calling register() for the same floor appends (does not replace).
   *
   * @param {string}  floorId
   * @param {Array}   defs   - Array of NPC definition objects
   */
  function register(floorId, defs) {
    if (!_defs[floorId]) _defs[floorId] = [];
    for (var i = 0; i < defs.length; i++) {
      _defs[floorId].push(_normalise(defs[i]));
    }
  }

  /**
   * Attach a DialogBox conversation tree to a specific NPC by id.
   * The tree is activated when the player interacts with the NPC.
   * Format: { root: nodeId, nodes: { [id]: { text, choices? } } }
   *
   * @param {string} npcId
   * @param {Object} tree
   */
  function registerTree(npcId, tree) {
    _trees[npcId] = tree;
  }

  // ── Normalise / defaults ─────────────────────────────────────────

  function _normalise(def) {
    return {
      id:            def.id,
      type:          def.type || TYPES.AMBIENT,
      x:             def.x,
      y:             def.y,
      facing:        def.facing  || 'south',
      emoji:         def.emoji   || '👤',
      stack:         def.stack   || null,
      name:          def.name    || 'Passerby',

      patrolPoints:  def.patrolPoints || null,
      stepInterval:  def.stepInterval != null ? def.stepInterval : 1200,

      barkPool:      def.barkPool     || null,
      barkRadius:    def.barkRadius   != null ? def.barkRadius : 3,
      barkInterval:  def.barkInterval != null ? def.barkInterval : 25000,

      talkable:      def.talkable != null ? def.talkable
                       : (def.type === TYPES.AMBIENT ? false : true),
      dialoguePool:  def.dialoguePool || null,
      dialogueTree:  def.dialogueTree || null,

      factionId:     def.factionId    || null,
      role:          def.role         || null,    // NpcComposer role key (e.g. 'tide_member')
      blocksMovement:def.blocksMovement || (def.type === TYPES.DISPATCHER),

      // Gate-check tag — forward-compat metadata for NPCs that gate a
      // locked door on journal-book presence. See floor3_inspector for
      // the canonical example. Consumed by Game._interact() after the
      // dialogue tree wraps to decide whether to set unlock flags.
      // Shape: { requiredBookId, unlockFlags:[], targetFloor,
      //          rejectBarkPool, acceptBarkPool }
      gateCheck:     def.gateCheck    || null,

      // ── Verb-field system (VERB_FIELD_NPC_ROADMAP.md) ──────────
      // If verbSet is provided (or verbArchetype resolves one), the NPC
      // uses verb-field movement instead of patrolPoints bounce patrol.
      verbArchetype: def.verbArchetype || null,   // Key into VF_ARCHETYPES
      verbSet:       def.verbSet       || null,   // Direct verb set (overrides archetype)
      verbFaction:   def.verbFaction   || def.factionId || null  // Faction lock for duty verbs
    };
  }

  // ── Spawn ─────────────────────────────────────────────────────────

  /**
   * Instantiate registered NPCs for a floor into the active enemy list.
   * Skips any NPC whose id already exists in `enemies` (prevents duplicates
   * if spawn is called more than once for the same floor, e.g., after
   * cache invalidation).
   *
   * @param {string} floorId
   * @param {Array}  enemies  - FloorManager.getEnemies() (mutable)
   * @param {Array}  grid     - 2D tile grid for walkability checks
   */
  function spawn(floorId, enemies, grid) {
    var defs = _defs[floorId];
    if (!defs || defs.length === 0) return;

    _active = [];

    // Build a set of existing IDs for fast lookup
    var existingIds = {};
    for (var e = 0; e < enemies.length; e++) {
      if (enemies[e].id) existingIds[enemies[e].id] = true;
    }

    for (var i = 0; i < defs.length; i++) {
      var def = defs[i];
      if (existingIds[def.id]) {
        // Already live (e.g., Dispatcher added by game.js) — find and track it
        for (var j = 0; j < enemies.length; j++) {
          if (enemies[j].id === def.id) { _active.push(enemies[j]); break; }
        }
        continue;
      }

      var npc = _createEntity(def);
      enemies.push(npc);
      _active.push(npc);
    }

    console.log('[NpcSystem] Spawned ' + _active.length + ' NPC(s) on floor ' + floorId);
  }

  function _createEntity(def) {
    // Resolve stack from NpcComposer preset if not directly supplied
    var stack = def.stack;
    if (!stack && def.type === TYPES.VENDOR && def.factionId
        && typeof NpcComposer !== 'undefined') {
      stack = NpcComposer.getVendorPreset(def.factionId);
    }
    if (!stack && def.type === TYPES.DISPATCHER
        && typeof NpcComposer !== 'undefined') {
      stack = NpcComposer.getVendorPreset(def.factionId || 'dispatcher');
    }
    // Ambient / Interactive NPCs: generate a seed-based stack via NpcComposer.
    // The seed is derived from the NPC id string so each NPC gets a unique
    // but deterministic appearance across sessions.
    if (!stack && typeof NpcComposer !== 'undefined' && NpcComposer.compose) {
      var seed = 0;
      var idStr = def.id || '';
      for (var ci = 0; ci < idStr.length; ci++) {
        seed = (seed * 31 + idStr.charCodeAt(ci)) | 0;
      }
      // Map NPC roles to NpcComposer role templates for variety.
      // Faction NPCs use def.role (e.g., 'tide_member'); others default by type.
      var role = def.role || (def.type === TYPES.INTERACTIVE ? 'guard' : 'citizen');
      stack = NpcComposer.compose(Math.abs(seed), role);
    }

    return {
      // Identity
      id:           def.id,
      name:         def.name,
      type:         def.type,

      // Position
      x:            def.x,
      y:            def.y,
      facing:       def.facing,

      // Appearance
      emoji:        stack ? stack.head : def.emoji,
      stack:        stack,

      // Stats (NPCs are non-combatant)
      hp:           999,
      maxHp:        999,
      str:          0,
      awareness:    0,

      // Flags (enemy-system compat)
      friendly:     true,
      nonLethal:    true,
      blocksMovement: def.blocksMovement,

      // NPC metadata
      npcType:      def.type,
      talkable:     def.talkable,
      factionId:    def.factionId,
      barkPool:     def.barkPool,
      barkRadius:   def.barkRadius,
      barkInterval: def.barkInterval,
      dialoguePool: def.dialoguePool,

      // Internal patrol state
      _patrolPoints: def.patrolPoints,
      _patrolIdx:    0,
      _stepTimer:    def.stepInterval + Math.random() * SPAWN_STAGGER_MS,
      _stepInterval: def.stepInterval,

      // Internal bark state
      _barkTimer:    Math.random() * BARK_STAGGER_MS,
      _inRadius:     false,

      // Patrol pause at waypoints
      _waypointPause: 0,

      // Conversation lock — true while player is talking to this NPC
      _talking:      false,
      _talkTimer:    0,

      // ── Verb-field state ───────────────────────────────────────
      _verbSet:      _resolveVerbSet(def),
      _verbTarget:   null,       // Current target node (or null)
      _verbSatisfyTimer: 0,      // ms remaining lingering at a node
      _currentNode:  null,       // Node the NPC is currently at (for encounter detection)
      _dominantVerb: null        // Which verb drove us to _currentNode
    };
  }

  /**
   * Resolve a verb set from def.verbSet, def.verbArchetype, or null.
   * Deep-copies so each NPC gets independent need state.
   */
  function _resolveVerbSet(def) {
    var source = def.verbSet;
    if (!source && def.verbArchetype && VF_ARCHETYPES[def.verbArchetype]) {
      source = VF_ARCHETYPES[def.verbArchetype];
    }
    if (!source) return null;

    // Deep copy — each NPC gets its own mutable need values
    var copy = {};
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i++) {
      var v = source[keys[i]];
      copy[keys[i]] = {
        need:       v.need != null ? v.need : 0.5,
        decayRate:  v.decayRate || 0.001,
        satisfiers: v.satisfiers ? v.satisfiers.slice() : [],
        factionLock: v.factionLock || def.verbFaction || null
      };
    }
    return copy;
  }

  // ── Tick ──────────────────────────────────────────────────────────
  //
  // Called at 10fps from Game._tick(). Updates patrol positions and
  // checks proximity bark triggers for all active NPCs.

  /**
   * @param {{x:number, y:number}} playerPos
   * @param {Array}  enemies  - FloorManager.getEnemies()
   * @param {number} dt       - Delta time in ms (typically ~100)
   * @param {Array}  [grid]   - Tile grid for collision (optional; if absent, skips wall checks)
   */
  function tick(playerPos, enemies, dt, grid) {
    // Only update NPCs that are still alive in the enemy list
    for (var i = 0; i < _active.length; i++) {
      var npc = _active[i];

      // Verify NPC is still in the live enemy list (may have been despawned)
      var alive = false;
      for (var e = 0; e < enemies.length; e++) {
        if (enemies[e] === npc) { alive = true; break; }
      }
      if (!alive) continue;

      // Conversation lock: NPC stays put while talking to the player.
      // Auto-release after TALK_HOLD_MS in case dismiss is missed.
      if (npc._talking) {
        npc._talkTimer -= dt;
        if (npc._talkTimer <= 0) {
          _releaseTalk(npc);
        }
      }

      // Movement advance — skip if NPC is in conversation
      if (npc._talking) {
        // locked in place
      } else if (npc._verbSet && npc.npcType !== TYPES.DISPATCHER) {
        // Verb-field driven movement (VERB_FIELD_NPC_ROADMAP.md §6)
        var floorForNodes = (typeof FloorManager !== 'undefined' && FloorManager.getFloor)
          ? FloorManager.getFloor() : null;
        var nodes = (typeof VerbNodes !== 'undefined' && floorForNodes)
          ? VerbNodes.getNodes(floorForNodes) : [];
        if (nodes.length > 0) {
          _tickVerbField(npc, dt, grid, nodes);
        }
      } else if (npc._patrolPoints && npc._patrolPoints.length >= 2
          && npc.npcType !== TYPES.DISPATCHER) {
        // Legacy 2-point bounce patrol
        _tickPatrol(npc, dt, grid);
      }

      // Proximity bark trigger
      if (npc.barkPool && typeof BarkLibrary !== 'undefined') {
        _tickBark(npc, playerPos, dt);
      }
    }

    // Dialogue ping-pong: when two NPCs are within 2 tiles, alternate
    // the rolling ellipsis between them so it looks like conversation.
    _tickDialoguePingPong(dt);
  }

  // ── Dialogue ping-pong state ─────────────────────────────────────
  var _dialoguePairs = [];       // [{ a: npc, b: npc, timer: ms, beat: 0|1, active: bool }]
  var DIALOGUE_PAIR_DIST = 2;    // Max tile distance for NPC-NPC dialogue
  var DIALOGUE_BEAT_MS   = 1800; // Time per speech beat before switching speaker
  var DIALOGUE_BEATS     = 6;    // Total beats before pair goes silent

  // ── Verb-encounter state ──────────────────────────────────────────
  // Cooldown map: pairKey → timestamp of last encounter bark fire.
  // Prevents the same two NPCs from barking at each other repeatedly.
  var _encounterCooldowns = {};
  var ENCOUNTER_COOLDOWN_MS = 180000;  // 3 minutes between same-pair encounters

  function _tickDialoguePingPong(dt) {
    if (typeof KaomojiCapsule === 'undefined') return;

    // Rebuild pair list every ~2 seconds (cheap scan)
    _dialoguePairRebuildTimer = (_dialoguePairRebuildTimer || 0) - dt;
    if (_dialoguePairRebuildTimer <= 0) {
      _dialoguePairRebuildTimer = 2000;
      _rebuildDialoguePairs();
    }

    // Advance each active pair
    for (var i = _dialoguePairs.length - 1; i >= 0; i--) {
      var pair = _dialoguePairs[i];
      if (!pair.active) continue;

      pair.timer -= dt;
      if (pair.timer <= 0) {
        pair.beatCount++;
        if (pair.beatCount >= DIALOGUE_BEATS) {
          // Conversation over — dismiss both
          KaomojiCapsule.stopSpeech(pair.a.id);
          KaomojiCapsule.stopSpeech(pair.b.id);
          pair.active = false;
          continue;
        }
        // Switch speaker
        pair.beat = 1 - pair.beat;
        pair.timer = DIALOGUE_BEAT_MS;

        var speaker = pair.beat === 0 ? pair.a : pair.b;
        var listener = pair.beat === 0 ? pair.b : pair.a;
        KaomojiCapsule.startSpeech(speaker.id, 'speaking');
        KaomojiCapsule.stopSpeech(listener.id);
      }
    }
  }

  var _dialoguePairRebuildTimer = 0;

  function _rebuildDialoguePairs() {
    // Mark all existing pairs inactive — will be reactivated if still valid
    for (var p = 0; p < _dialoguePairs.length; p++) {
      _dialoguePairs[p]._checked = false;
    }

    // Find NPC pairs within DIALOGUE_PAIR_DIST
    for (var i = 0; i < _active.length; i++) {
      for (var j = i + 1; j < _active.length; j++) {
        var a = _active[i], b = _active[j];
        if (!a.barkPool || !b.barkPool) continue;
        var dx = a.x - b.x, dy = a.y - b.y;
        if (dx * dx + dy * dy > DIALOGUE_PAIR_DIST * DIALOGUE_PAIR_DIST) continue;

        // Check if this pair already exists
        var found = false;
        for (var p = 0; p < _dialoguePairs.length; p++) {
          var pp = _dialoguePairs[p];
          if ((pp.a === a && pp.b === b) || (pp.a === b && pp.b === a)) {
            pp._checked = true;
            found = true;
            break;
          }
        }
        if (!found) {
          // New pair — start conversation
          _dialoguePairs.push({
            a: a, b: b,
            beat: 0, beatCount: 0,
            timer: DIALOGUE_BEAT_MS,
            active: true, _checked: true
          });
          if (typeof KaomojiCapsule !== 'undefined') {
            KaomojiCapsule.startSpeech(a.id, 'speaking');
          }
        }
      }
    }

    // Remove pairs that are no longer close
    for (var p = _dialoguePairs.length - 1; p >= 0; p--) {
      if (!_dialoguePairs[p]._checked && _dialoguePairs[p].active) {
        KaomojiCapsule.stopSpeech(_dialoguePairs[p].a.id);
        KaomojiCapsule.stopSpeech(_dialoguePairs[p].b.id);
        _dialoguePairs.splice(p, 1);
      }
    }

    // ── Verb encounter detection ─────────────────────────────────
    // When two verb-field NPCs are both lingering at the same node
    // (or adjacent nodes), fire a classified encounter bark.
    _checkVerbEncounters();
  }

  /**
   * Detect verb-field NPC encounters and fire semantically classified
   * barks. See VERB_FIELD_NPC_ROADMAP.md §7.
   */
  function _checkVerbEncounters() {
    if (typeof BarkLibrary === 'undefined') return;

    var now = Date.now();

    for (var i = 0; i < _active.length; i++) {
      var a = _active[i];
      if (!a._verbSet || !a._currentNode || a._verbSatisfyTimer <= 0) continue;

      for (var j = i + 1; j < _active.length; j++) {
        var b = _active[j];
        if (!b._verbSet || !b._currentNode || b._verbSatisfyTimer <= 0) continue;

        // Are they at the same node or adjacent nodes?
        var adx = Math.abs(a._currentNode.x - b._currentNode.x);
        var ady = Math.abs(a._currentNode.y - b._currentNode.y);
        if (adx + ady > 2) continue;

        // Cooldown check
        var pairKey = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
        if (_encounterCooldowns[pairKey] && now - _encounterCooldowns[pairKey] < ENCOUNTER_COOLDOWN_MS) {
          continue;
        }

        // Classify the encounter
        var encType = _classifyEncounter(a, b);
        var nodeType = a._currentNode.type || 'bonfire';

        // Build the bark pool key: encounter.<nodeType>.<encounterType>
        var poolKey = 'encounter.' + nodeType + '.' + encType;

        // Try the specific pool; fall back to generic encounter pool
        if (!BarkLibrary.hasPool(poolKey)) {
          poolKey = 'encounter.' + encType;
        }
        if (!BarkLibrary.hasPool(poolKey)) {
          continue; // No bark pool for this encounter type yet
        }

        // Fire the encounter bark
        BarkLibrary.fire(poolKey);
        _encounterCooldowns[pairKey] = now;

        // Face each other during encounter
        _faceToward(a, b.x, b.y);
        _faceToward(b, a.x, a.y);

        // Extend linger so they don't walk away mid-bark
        a._verbSatisfyTimer = Math.max(a._verbSatisfyTimer, 4000);
        b._verbSatisfyTimer = Math.max(b._verbSatisfyTimer, 4000);

        // Show speech capsules
        if (typeof KaomojiCapsule !== 'undefined') {
          KaomojiCapsule.startSpeech(a.id, 'speaking');
          setTimeout(function (bid) {
            KaomojiCapsule.startSpeech(bid, 'speaking');
          }.bind(null, b.id), DIALOGUE_BEAT_MS);
          setTimeout(function (aid, bid) {
            KaomojiCapsule.stopSpeech(aid);
            KaomojiCapsule.stopSpeech(bid);
          }.bind(null, a.id, b.id), DIALOGUE_BEAT_MS * 3);
        }
      }
    }
  }

  /**
   * Classify an encounter between two verb-field NPCs.
   * Returns a string key used to select the bark pool.
   * See VERB_FIELD_NPC_ROADMAP.md §7.2.
   */
  function _classifyEncounter(a, b) {
    var sameVerb = a._dominantVerb && b._dominantVerb
                   && a._dominantVerb === b._dominantVerb;
    var aFaction = a.factionId || null;
    var bFaction = b.factionId || null;
    var sameFaction = aFaction && bFaction && aFaction === bFaction;
    var bothFaction = aFaction && bFaction;

    if (!bothFaction) {
      // At least one is a non-faction citizen
      return 'gossip';
    }

    if (sameVerb && sameFaction) {
      return 'camaraderie';
    }
    if (sameVerb && !sameFaction) {
      return 'uneasy';
    }
    if (!sameVerb && sameFaction) {
      return 'passing';
    }
    // Different verbs, different factions
    return 'tension';
  }

  // ── Verb-field tick ───────────────────────────────────────────────
  // See VERB_FIELD_NPC_ROADMAP.md §6 — Sundog-diffused movement.
  //
  // Each verb's need decays upward over time. The NPC moves toward the
  // spatial node with the highest combined pull (need / distance).
  // On arrival, the matching verb's need drops (bloom collapse) and the
  // NPC lingers before other verbs pull them elsewhere.

  function _tickVerbField(npc, dt, grid, nodes) {
    var verbs = npc._verbSet;
    var keys = Object.keys(verbs);

    // 1. Decay — increase all verb needs over time
    for (var vi = 0; vi < keys.length; vi++) {
      var v = verbs[keys[vi]];
      v.need = Math.min(1.0, v.need + v.decayRate * dt);
    }

    // 2. Satisfaction linger — if paused at a node, don't move
    if (npc._verbSatisfyTimer > 0) {
      npc._verbSatisfyTimer -= dt;
      return;
    }

    // 3. Step timer — respect the NPC's step interval cadence
    npc._stepTimer -= dt;
    if (npc._stepTimer > 0) return;
    npc._stepTimer = npc._stepInterval + (Math.random() * 200 - 100);

    // 4. Score all reachable nodes — find the strongest pull
    var bestScore = -1;
    var bestNode  = null;

    for (var ni = 0; ni < nodes.length; ni++) {
      var node = nodes[ni];

      // Compute total pull from all verbs this node satisfies
      var pull = 0;
      for (var vi2 = 0; vi2 < keys.length; vi2++) {
        var vb = verbs[keys[vi2]];
        for (var si = 0; si < vb.satisfiers.length; si++) {
          if (vb.satisfiers[si] === node.type) {
            // Faction lock check: faction_post nodes only satisfy
            // NPCs whose verbFaction matches the node's faction tag
            if (node.type === 'faction_post' && node.faction) {
              if (vb.factionLock && vb.factionLock !== node.faction) continue;
              if (!vb.factionLock && npc.factionId !== node.faction) continue;
            }
            pull += vb.need;
            break; // Each verb counts once per node
          }
        }
      }

      if (pull <= 0) continue;

      // Distance penalty — closer nodes score higher
      var dx = npc.x - node.x;
      var dy = npc.y - node.y;
      var dist = Math.abs(dx) + Math.abs(dy); // Manhattan
      if (dist === 0) dist = 0.5; // Already at the node

      var score = pull / (dist * VF_DISTANCE_WEIGHT);
      // Small random perturbation to break ties and create variety
      score += Math.random() * VF_NOISE_FACTOR;

      if (score > bestScore) {
        bestScore = score;
        bestNode  = node;
      }
    }

    // 5. Step toward the winning node
    if (bestNode) {
      npc._verbTarget = bestNode;
      _stepToward(npc, bestNode.x, bestNode.y, grid);
    }

    // 6. Check arrival — are we at or adjacent to any node?
    for (var ai = 0; ai < nodes.length; ai++) {
      var arrNode = nodes[ai];
      var adx = Math.abs(npc.x - arrNode.x);
      var ady = Math.abs(npc.y - arrNode.y);
      if (adx + ady > 1) continue; // Not at this node

      // Find which verb(s) this node satisfies and reduce their need
      var dominated = null;
      var bestNeed  = -1;
      for (var vk = 0; vk < keys.length; vk++) {
        var verb = verbs[keys[vk]];
        for (var sk = 0; sk < verb.satisfiers.length; sk++) {
          if (verb.satisfiers[sk] === arrNode.type) {
            // Faction check (same as scoring)
            if (arrNode.type === 'faction_post' && arrNode.faction) {
              if ((verb.factionLock || npc.factionId) !== arrNode.faction) continue;
            }
            verb.need = Math.max(0, verb.need - VF_SATISFACTION_DROP);
            if (verb.need + VF_SATISFACTION_DROP > bestNeed) {
              bestNeed = verb.need + VF_SATISFACTION_DROP;
              dominated = keys[vk];
            }
            break;
          }
        }
      }

      // Linger at the node
      npc._verbSatisfyTimer = VF_LINGER_MIN +
        Math.random() * (VF_LINGER_MAX - VF_LINGER_MIN);
      npc._currentNode  = arrNode;
      npc._dominantVerb = dominated;
      npc._verbTarget   = null;

      // Face toward the node
      _faceToward(npc, arrNode.x, arrNode.y);
      break;
    }
  }

  /**
   * Move one greedy step toward (tx, ty). Extracted from _tickPatrol
   * for reuse by both patrol and verb-field systems.
   */
  function _stepToward(npc, tx, ty, grid) {
    var diffX = tx - npc.x;
    var diffY = ty - npc.y;
    if (diffX === 0 && diffY === 0) return;

    var dx = 0, dy = 0;
    // Move along dominant axis first; fall back to other if blocked
    if (Math.abs(diffX) >= Math.abs(diffY) && diffX !== 0) {
      dx = diffX > 0 ? 1 : -1;
    } else if (diffY !== 0) {
      dy = diffY > 0 ? 1 : -1;
    } else if (diffX !== 0) {
      dx = diffX > 0 ? 1 : -1;
    }

    var nx = npc.x + dx;
    var ny = npc.y + dy;

    // Wall / occupancy check
    var blocked = false;
    if (grid && grid[ny] && grid[ny][nx] !== undefined) {
      var tile = grid[ny][nx];
      if (typeof TILES !== 'undefined' && !TILES.isWalkable(tile)) {
        blocked = true;
      }
    }

    if (blocked) {
      // Try the other axis as fallback
      var dx2 = 0, dy2 = 0;
      if (dx !== 0 && diffY !== 0) {
        dy2 = diffY > 0 ? 1 : -1;
      } else if (dy !== 0 && diffX !== 0) {
        dx2 = diffX > 0 ? 1 : -1;
      }
      if (dx2 !== 0 || dy2 !== 0) {
        nx = npc.x + dx2;
        ny = npc.y + dy2;
        blocked = false;
        if (grid && grid[ny] && grid[ny][nx] !== undefined) {
          var tile2 = grid[ny][nx];
          if (typeof TILES !== 'undefined' && !TILES.isWalkable(tile2)) {
            blocked = true;
          }
        }
        if (!blocked) { dx = dx2; dy = dy2; }
        else return; // Both axes blocked — stay put
      } else {
        return; // No fallback axis
      }
    }

    // Commit the step
    npc._prevX = npc.x;
    npc._prevY = npc.y;
    npc._lerpT = 0;

    npc.x = nx;
    npc.y = ny;

    if      (dx > 0)  npc.facing = 'east';
    else if (dx < 0)  npc.facing = 'west';
    else if (dy > 0)  npc.facing = 'south';
    else if (dy < 0)  npc.facing = 'north';

    _playNpcStep(nx, ny);
  }

  /**
   * Face NPC toward a specific grid position.
   */
  function _faceToward(npc, tx, ty) {
    var dx = tx - npc.x;
    var dy = ty - npc.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      npc.facing = dx > 0 ? 'east' : (dx < 0 ? 'west' : npc.facing);
    } else {
      npc.facing = dy > 0 ? 'south' : (dy < 0 ? 'north' : npc.facing);
    }
  }

  // Natural pause range at waypoint endpoints (ms)
  var WAYPOINT_PAUSE_MIN = 1500;
  var WAYPOINT_PAUSE_MAX = 4000;

  // ── Spatial footstep for NPC patrol ──
  // Softer than enemy steps — friendly villagers walk lightly.
  // Contract-aware radius/volume like all spatial audio.
  function _playNpcStep(nx, ny) {
    if (typeof AudioSystem === 'undefined' || !AudioSystem.playSpatial) return;
    if (typeof Player === 'undefined' || !Player.getPos) return;
    var p = Player.getPos();

    var contract = (typeof FloorManager !== 'undefined' && FloorManager.getFloorContract)
      ? FloorManager.getFloorContract() : null;
    var depth = contract ? contract.depth : 'exterior';

    var maxDist = depth === 'nested_dungeon' ? 3
               : depth === 'interior' ? 4 : 6;
    var baseVol = depth === 'nested_dungeon' ? 0.25
                : depth === 'interior' ? 0.18 : 0.12;

    var rate = 0.92 + Math.random() * 0.16;

    AudioSystem.playSpatial('step', nx, ny, p.x, p.y,
      { volume: baseVol, maxDist: maxDist, playbackRate: rate });
  }

  function _tickPatrol(npc, dt, grid) {
    // Waypoint pause: NPC idles at endpoints before turning around
    if (npc._waypointPause > 0) {
      npc._waypointPause -= dt;
      return;
    }

    npc._stepTimer -= dt;
    if (npc._stepTimer > 0) return;
    npc._stepTimer = npc._stepInterval + (Math.random() * 200 - 100);

    var target = npc._patrolPoints[npc._patrolIdx];
    if (npc.x === target.x && npc.y === target.y) {
      // Reached target — pause naturally, then advance to next waypoint
      npc._patrolIdx = (npc._patrolIdx + 1) % npc._patrolPoints.length;
      target = npc._patrolPoints[npc._patrolIdx];
      // Add idle pause with randomized duration
      npc._waypointPause = WAYPOINT_PAUSE_MIN +
        Math.random() * (WAYPOINT_PAUSE_MAX - WAYPOINT_PAUSE_MIN);
      // Face toward next target while pausing
      var pdx = target.x - npc.x;
      var pdy = target.y - npc.y;
      if (Math.abs(pdx) >= Math.abs(pdy)) {
        npc.facing = pdx > 0 ? 'east' : 'west';
      } else {
        npc.facing = pdy > 0 ? 'south' : 'north';
      }
      return;
    }

    // Determine step direction
    var dx = 0, dy = 0;
    var diffX = target.x - npc.x;
    var diffY = target.y - npc.y;

    // Move along dominant axis first; fall back to other axis if blocked
    if (Math.abs(diffX) >= Math.abs(diffY) && diffX !== 0) {
      dx = diffX > 0 ? 1 : -1;
    } else if (diffY !== 0) {
      dy = diffY > 0 ? 1 : -1;
    } else if (diffX !== 0) {
      dx = diffX > 0 ? 1 : -1;
    }

    var nx = npc.x + dx;
    var ny = npc.y + dy;

    // Wall / occupancy check
    var blocked = false;
    if (grid && grid[ny] && grid[ny][nx] !== undefined) {
      var tile = grid[ny][nx];
      if (typeof TILES !== 'undefined' && !TILES.isWalkable(tile)) {
        blocked = true;
      }
    }

    if (!blocked) {
      // Store previous position for lerp interpolation
      npc._prevX = npc.x;
      npc._prevY = npc.y;
      npc._lerpT = 0;

      npc.x = nx;
      npc.y = ny;
      // Update facing
      if      (dx > 0)  npc.facing = 'east';
      else if (dx < 0)  npc.facing = 'west';
      else if (dy > 0)  npc.facing = 'south';
      else if (dy < 0)  npc.facing = 'north';

      // Spatial footstep — NPC patrol (softer than enemies)
      _playNpcStep(nx, ny);
    }
  }

  // ── Depth-scaled bark radius ──────────────────────────────────────
  // Dungeon floors (depth 3+) use huge radius so all barks are audible.
  // Exterior floors (depth 1) use small radius with forward bias:
  //   ~3 tiles around player, ~5 tiles in player's forward direction.
  // Interior floors (depth 2) use moderate radius (original barkRadius).

  var _DIR_DX = [1, 0, -1, 0];   // EAST, SOUTH, WEST, NORTH
  var _DIR_DY = [0, 1, 0, -1];

  function _isInBarkRange(npc, playerPos, playerDir, floorId) {
    var dx = npc.x - playerPos.x;
    var dy = npc.y - playerPos.y;
    var distSq = dx * dx + dy * dy;
    var depth = floorId ? floorId.split('.').length : 1;

    if (depth >= 3) {
      // Dungeon: huge radius — hear everything on the floor
      return distSq <= 20 * 20;
    }

    if (depth === 1) {
      // Exterior: small surround + larger forward cone
      var surroundR = 3;
      if (distSq <= surroundR * surroundR) return true;

      // Forward bias: project NPC offset onto player facing
      var fdx = _DIR_DX[playerDir] || 0;
      var fdy = _DIR_DY[playerDir] || 0;
      var dot = dx * fdx + dy * fdy;
      // In front of player AND within 5 tiles forward, 2 tiles lateral
      if (dot > 0 && dot <= 5) {
        var cross = Math.abs(dx * fdy - dy * fdx);
        if (cross <= 2) return true;
      }
      return false;
    }

    // Interior (depth 2): use NPC's native barkRadius
    return distSq <= npc.barkRadius * npc.barkRadius;
  }

  // Speech capsule duration — how long the rolling ellipsis shows above NPC
  var SPEECH_CAPSULE_MS = 3000;
  var TALK_HOLD_MS      = 8000;   // How long NPC stays rooted after interact

  // ── Faction voice pitch map ──────────────────────────────────────
  // Each faction gets a distinct playbackRate range for the voice SFX,
  // giving NPCs a tonal personality without needing recorded voice lines.
  var FACTION_VOICE = {
    'tide':       { sfx: 'ui-blip',  rate: 1.3  },  // bright, high-pitched
    'foundry':    { sfx: 'ui-blop',  rate: 0.75 },  // low, gruff
    'admiralty':  { sfx: 'ui-bip',   rate: 1.0  },  // mid, authoritative
    '_default':   { sfx: 'ui-blip',  rate: 1.1  }   // neutral citizen
  };

  /**
   * Play a short voice chirp for an NPC based on faction.
   * Three rapid pitch-varied blips to simulate speech cadence.
   */
  function _playVoiceSfx(npc) {
    if (typeof AudioSystem === 'undefined') return;
    var fv = FACTION_VOICE[npc.factionId] || FACTION_VOICE['_default'];
    var base = fv.rate;
    // 3-chirp burst with slight randomized pitch for natural feel
    AudioSystem.play(fv.sfx, { volume: 0.35, playbackRate: base + (Math.random() * 0.15 - 0.07) });
    setTimeout(function () {
      AudioSystem.play(fv.sfx, { volume: 0.30, playbackRate: base + (Math.random() * 0.2 - 0.1) });
    }, 120);
    setTimeout(function () {
      AudioSystem.play(fv.sfx, { volume: 0.25, playbackRate: base + (Math.random() * 0.25 - 0.12) });
    }, 250);
  }

  /**
   * Lock an NPC in place and set their sprite to a talking/attentive state.
   */
  function _engageTalk(npc) {
    npc._talking = true;
    npc._talkTimer = TALK_HOLD_MS;

    // Face the player
    if (typeof MovementController !== 'undefined') {
      var pp = MovementController.getGridPos();
      var dx = pp.x - npc.x;
      var dy = pp.y - npc.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        npc.facing = dx > 0 ? 'east' : 'west';
      } else {
        npc.facing = dy > 0 ? 'south' : 'north';
      }
    }

    // Keep NPC in IDLE state while talking. PACIFIED is a combat status
    // (dove particles, "PEACE" overlay, glow) — wrong for friendly chat.
    // The NPC already faces the player and stops moving via _talking flag.
    if (typeof EnemySprites !== 'undefined' && EnemySprites.STATE) {
      npc.spriteState = EnemySprites.STATE.IDLE;
    }

    // Voice chirp
    _playVoiceSfx(npc);
  }

  /**
   * Release an NPC from talk lock, restore idle state.
   */
  function _releaseTalk(npc) {
    npc._talking = false;
    npc._talkTimer = 0;
    if (typeof EnemySprites !== 'undefined' && EnemySprites.STATE) {
      npc.spriteState = EnemySprites.STATE.IDLE;
    }
  }

  /**
   * Resolve the best bark pool for the current time of day.
   * Tries time-suffixed pool first (e.g. "ambient.promenade.heroday"),
   * then NPC-specific time pool (e.g. "npc.guild_veteran.heroday"),
   * falling back to the base pool if no timed variant exists.
   */
  function _resolveTimedBarkPool(basePool) {
    if (typeof DayCycle === 'undefined') return basePool;

    // Layer 1: time-of-day suffix (heroday, morning, dusk, night)
    var suffix = DayCycle.getBarkTimeSuffix();
    if (suffix) {
      var timedPool = basePool + '.' + suffix;
      if (BarkLibrary.hasPool(timedPool)) return timedPool;

      // For NPC pools like "npc.guild_veteran.ambient", try replacing
      // the last segment: "npc.guild_veteran.heroday"
      var parts = basePool.split('.');
      if (parts.length >= 3) {
        parts[parts.length - 1] = suffix;
        var altPool = parts.join('.');
        if (BarkLibrary.hasPool(altPool)) return altPool;
      }
    }

    // Layer 2: day-of-cycle suffix (day1, day2) — checked when no
    // time-specific pool was found. This gives post-hero-day and
    // routine-day flavour without needing every time+day combination.
    if (DayCycle.getDayCycleSuffix) {
      var daySuffix = DayCycle.getDayCycleSuffix();
      if (daySuffix) {
        var dayPool = basePool + '.' + daySuffix;
        if (BarkLibrary.hasPool(dayPool)) return dayPool;

        // NPC alt: replace last segment
        var dParts = basePool.split('.');
        if (dParts.length >= 3) {
          dParts[dParts.length - 1] = daySuffix;
          var dAltPool = dParts.join('.');
          if (BarkLibrary.hasPool(dAltPool)) return dAltPool;
        }
      }
    }

    return basePool;
  }

  function _tickBark(npc, playerPos, dt) {
    // Use depth-aware radius check
    var floorId = (typeof FloorManager !== 'undefined' && FloorManager.getFloor)
      ? FloorManager.getFloor() : null;
    var playerDir = (typeof Player !== 'undefined' && Player.getDir)
      ? Player.getDir() : 0;

    var inRadius = _isInBarkRange(npc, playerPos, playerDir, floorId);

    if (inRadius) {
      // Countdown the bark timer while player is in range
      npc._barkTimer -= dt;
      if (npc._barkTimer <= 0) {
        // Resolve time-aware bark pool (heroday, morning, dusk, night)
        var pool = _resolveTimedBarkPool(npc.barkPool);

        // 15% chance to fire a callsign/class bark instead (personal touch)
        // Only on exterior/guild floors where NPCs would know the player
        if (Math.random() < 0.15 && typeof Player !== 'undefined' && Player.state) {
          var ps = Player.state();
          var className = (ps.avatarName || '').toLowerCase();
          // Try class-specific pool first, then generic callsign pool
          var classPool = 'ambient.class.' + className;
          if (className && BarkLibrary.hasPool(classPool)) {
            pool = classPool;
          } else if (BarkLibrary.hasPool('ambient.callsign')) {
            pool = 'ambient.callsign';
          }
          // Guild NPCs get the guild-specific callsign pool
          if (npc.barkPool && npc.barkPool.indexOf('npc.guild') === 0 &&
              BarkLibrary.hasPool('npc.guild.callsign')) {
            pool = 'npc.guild.callsign';
          }
        }

        BarkLibrary.fire(pool);
        npc._barkTimer = npc.barkInterval;

        // Show rolling ellipsis speech capsule above barking NPC
        if (typeof KaomojiCapsule !== 'undefined') {
          KaomojiCapsule.startSpeech(npc.id);
          // Auto-dismiss after bark duration
          setTimeout(function () {
            KaomojiCapsule.stopSpeech(npc.id);
          }, SPEECH_CAPSULE_MS);
        }
      }
    } else {
      // Out of range — reset timer so next entry fires promptly
      if (!npc._inRadius) {
        // Was already out — let timer drift down naturally toward next fire
        npc._barkTimer = Math.max(npc._barkTimer - dt * 0.1, 0);
      }
    }

    npc._inRadius = inRadius;
  }

  // ── Interact ──────────────────────────────────────────────────────
  //
  // Called by Game._interact() when the player presses OK on an NPC tile.
  // Determines the correct response based on NPC type.

  /**
   * @param {Object} npc     - Live NPC entity from the enemy list
   * @param {string} floorId - Current floor ID
   */
  function interact(npc, floorId) {
    // Lock NPC in place and animate for all talkable types
    _engageTalk(npc);

    switch (npc.npcType) {
      case TYPES.AMBIENT:
        // OK-interact on AMBIENT NPCs cycles their bark pool into the
        // tooltip footer. Speech capsule plays briefly then fades.
        if (typeof KaomojiCapsule !== 'undefined') {
          KaomojiCapsule.startSpeech(npc.id, 'speaking');
        }
        if (npc.barkPool && typeof BarkLibrary !== 'undefined') {
          BarkLibrary.fire(npc.barkPool, { style: 'bubble' });
        }
        setTimeout(function () {
          if (typeof KaomojiCapsule !== 'undefined') KaomojiCapsule.stopSpeech(npc.id);
          _releaseTalk(npc);
        }, SPEECH_CAPSULE_MS);
        break;

      case TYPES.INTERACTIVE:
        _interactInteractive(npc);
        break;

      case TYPES.VENDOR:
        // Vendor interaction delegates to the Shop/merchant-peek system.
        // NpcSystem fires an ambient bark, then the caller (Game._interact)
        // handles the vendor shop open via factionId.
        if (npc.dialoguePool && typeof BarkLibrary !== 'undefined') {
          BarkLibrary.fire(npc.dialoguePool, { style: 'bubble' });
        }
        // Release when shop closes (auto-release timer handles it)
        break;

      case TYPES.DISPATCHER:
        // Dispatchers with dialogue trees use the inline tooltip system
        // (same as INTERACTIVE). Falls back to bark cascade if no tree.
        if (_trees[npc.id]) {
          _interactInteractive(npc);
        } else if (typeof BarkLibrary !== 'undefined') {
          var introPool = 'npc.dispatcher.gate.intro';
          var b = BarkLibrary.hasPool(introPool) ? BarkLibrary.fire(introPool) : null;
          if (!b) {
            b = BarkLibrary.hasPool('npc.dispatcher.gate.direction')
              ? BarkLibrary.fire('npc.dispatcher.gate.direction') : null;
          }
          if (!b) BarkLibrary.fire('npc.dispatcher.gate.nudge');
        }
        break;

      default:
        break;
    }
  }

  /**
   * Compute the yaw offset needed to center the camera on an NPC.
   * Returns a value in Player.FREE_LOOK_RANGE for MouseLook.lockOn().
   */
  function _computeNpcYaw(npc) {
    if (typeof MovementController === 'undefined' || typeof Player === 'undefined') return 0;
    var pp = MovementController.getGridPos();
    var dx = npc.x - pp.x;
    var dy = npc.y - pp.y;
    var angleToNpc = Math.atan2(dy, dx); // world angle to NPC
    var playerAngle = MovementController.dirToAngle
      ? MovementController.dirToAngle(Player.getDir())
      : Player.getDir() * Math.PI / 2;
    // Signed angular difference, clamped to freelook range
    var diff = angleToNpc - playerAngle;
    // Normalize to [-π, π]
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    var range = Player.FREE_LOOK_RANGE || 0.56;
    return Math.max(-range, Math.min(range, diff));
  }

  function _interactInteractive(npc) {
    // Show rolling ellipsis above NPC while they "speak".
    // Uses 'speaking' key (rolling "...") — NOT 'greeting' (kaomoji face).
    if (typeof KaomojiCapsule !== 'undefined') {
      KaomojiCapsule.startSpeech(npc.id, 'speaking');
    }

    // ── Gentle face-lock: lock MouseLook toward the NPC ──
    // The player is already grid-facing the NPC (they pressed OK on
    // the facing tile), but MouseLook offset might have them looking
    // off-center. lockOn(0, 0) centers the view on the grid direction.
    // releaseLock fires on dialogue end or bark timeout.
    // NPC_SYSTEM_ROADMAP §7.3 — force-facing for interactive NPCs.
    if (typeof MouseLook !== 'undefined' && MouseLook.lockOn) {
      MouseLook.lockOn(0, 0);
    }

    // ── Dialogue tree path ─────────────────────────────────────────
    // Renders inline in the StatusBar tooltip footer per
    // EYESONLYS_TOOLTIP_SPACE_CANON. No canvas overlay, no camera lock,
    // no letterbox bars — player retains free-look but tile traversal
    // and facing changes are blocked by StatusBar.isDialogueActive().
    var tree = _trees[npc.id];
    if (tree && typeof StatusBar !== 'undefined' && StatusBar.pushDialogue) {
      StatusBar.pushDialogue(
        { id: npc.id, name: npc.name, emoji: npc.emoji, x: npc.x, y: npc.y },
        tree,
        function () {
          // onEnd callback — conversation finished or interrupted
          if (typeof KaomojiCapsule !== 'undefined') KaomojiCapsule.stopSpeech(npc.id);
          if (typeof MouseLook !== 'undefined' && MouseLook.releaseLock) MouseLook.releaseLock();
          _releaseTalk(npc);
        }
      );
      return;
    }

    // ── Bark path (no dialogue tree) ───────────────────────────────
    // Fire bark text into the tooltip footer. The rolling ellipsis
    // plays briefly above the NPC then fades. No camera lock or bars
    // for simple barks — just the tooltip + speech capsule.
    var barkFired = false;
    if (npc.dialoguePool && typeof BarkLibrary !== 'undefined') {
      var b = BarkLibrary.fire(npc.dialoguePool, { style: 'dialog' });
      if (b) barkFired = true;
    }
    if (!barkFired && npc.barkPool && typeof BarkLibrary !== 'undefined') {
      var b2 = BarkLibrary.fire(npc.barkPool, { style: 'bubble' });
      if (b2) barkFired = true;
    }

    // Fallback: all bark pools exhausted — push a generic acknowledgement
    if (!barkFired) {
      var fallbackText = (npc.name || 'NPC') + ' nods silently.';
      if (typeof StatusBar !== 'undefined' && StatusBar.pushTooltip) {
        StatusBar.pushTooltip(fallbackText, 'npc');
      } else if (typeof Toast !== 'undefined') {
        Toast.show(fallbackText, 'info');
      }
    }

    // Auto-dismiss speech capsule and release NPC after bark
    setTimeout(function () {
      if (typeof KaomojiCapsule !== 'undefined') KaomojiCapsule.stopSpeech(npc.id);
      if (typeof MouseLook !== 'undefined' && MouseLook.releaseLock) MouseLook.releaseLock();
      _releaseTalk(npc);
    }, SPEECH_CAPSULE_MS);
  }

  // ── Built-in NPC populations ──────────────────────────────────────
  //
  // Hand-authored ambient NPC rosters for the jam's hand-authored floors.
  // These are registered at module init time. Proc-gen floors get enemies
  // from EnemyAI.spawnEnemies(), not NpcSystem.
  //
  // Floor 0 — The Approach: 2 maintenance workers crossing the yard
  // Floor 1 — The Promenade: 3 townspeople patrolling the plaza
  // Floor 1.1 — Coral Bazaar: 2 market patrons + 1 stall vendor
  // Floor 1.6 — Gleaner's Home: no ambient NPCs (private space)

  function _registerBuiltinPopulations() {

    // ── Floor 0: The Approach ──────────────────────────────────────
    //
    // Design intent: player spawns ALONE at (4,17) facing east. The
    // first 10+ tiles of road are empty — eerie silence after the
    // deploy cutscene. The first NPC encounter is around the NC/SC
    // pod junction (~col 18). NPCs progressively reveal setting via
    // dialogue trees: the encampment, the industries, the homelessness
    // crisis, and one unhinged hermit ranting about pandas and dragons.
    //
    // ┌─ spawn buffer ─┐  ┌─ first encounters ─┐  ┌─ deep pods ─┐
    // cols 4-12: EMPTY    cols 14-22: 2 NPCs       cols 25-37: 3 NPCs
    //
    register('0', [
      // ── 1. Campfire Drifter — first NPC the player encounters ────
      //    Sitting on the NC pod path stub (col 18, row 14) just north
      //    of the road. Player walks right past them. Talkable.
      //    Dialogue tree: the settlement, the environment, why people
      //    camp here instead of going through the arch.
      {
        id:           'floor0_drifter',
        type:         TYPES.INTERACTIVE,
        x: 18, y: 14,
        facing:       'south',
        emoji:        '\uD83E\uDDD1',
        name:         'Campfire Drifter',
        talkable:     true,
        barkPool:     'ambient.approach',
        barkRadius:   4,
        barkInterval: 30000
      },
      // ── 2. Laid-off Laborer — SC pod bonfire (20,25) ─────────────
      //    Visible from the road at the SC path stub. Player can see
      //    the bonfire glow and walk south to find them. Talkable.
      //    Dialogue tree: the local industries, the factories behind
      //    the facade, the homelessness crisis, who is responsible.
      {
        id:           'floor0_laborer',
        type:         TYPES.INTERACTIVE,
        x: 19, y: 25,
        facing:       'east',
        emoji:        '\uD83E\uDDD1\u200D\uD83D\uDD27',
        name:         'Laid-off Laborer',
        talkable:     true,
        barkPool:     'ambient.approach',
        barkRadius:   4,
        barkInterval: 22000
      },
      // ── 3. Unhinged Hermit — NE pod near shack (bonfire 29,11) ──
      //    Deeper in. Player has to detour north off the road at the
      //    NE pod gap (cols 28-29). Muttering to himself. Talkable.
      //    Dialogue tree: incoherent rambling about pandas, dragon
      //    elites, existential crisis, conspiracy-tinged word salad.
      {
        id:           'floor0_hermit',
        type:         TYPES.INTERACTIVE,
        x: 30, y: 11,
        facing:       'west',
        emoji:        '\uD83D\uDC74',
        name:         'Raving Hermit',
        talkable:     true,
        barkPool:     'ambient.approach',
        barkRadius:   4,
        barkInterval: 18000
      },
      // ── 4. Dozing Vagrant — SW pod near house (9,24) ─────────────
      //    Off the beaten path. Player would have to backtrack west
      //    and turn south. Ambient — does not have a dialogue tree,
      //    just proximity barks. Sells the "people sleeping rough" vibe.
      {
        id:           'floor0_vagrant',
        type:         TYPES.AMBIENT,
        x: 9, y: 24,
        facing:       'north',
        emoji:        '\uD83E\uDDD3',
        name:         'Dozing Vagrant',
        barkPool:     'ambient.approach',
        barkRadius:   3,
        barkInterval: 35000
      },
      // ── 5. Groundskeeper — patrols east half of road shoulder ────
      //    Starts far from spawn (col 22), patrols east toward facade.
      //    Ambient with proximity barks only. Sells that someone
      //    maintains this place, barely.
      {
        id:           'floor0_worker',
        type:         TYPES.AMBIENT,
        x: 22, y: 16,
        facing:       'east',
        emoji:        '\uD83E\uDDF9',
        name:         'Groundskeeper',
        patrolPoints: [{ x: 22, y: 16 }, { x: 35, y: 16 }],
        stepInterval: 1400,
        barkPool:     'ambient.approach',
        barkRadius:   4,
        barkInterval: 22000
      },
      // ── 6. Facade Loiterer — near the arch approach (37,17) ──────
      //    Last NPC before the player enters Floor 1. Ambient barks
      //    about the arch, the town beyond, rumors. Positioned on the
      //    road so the player walks past on approach to the door.
      {
        id:           'floor0_loiterer',
        type:         TYPES.AMBIENT,
        x: 37, y: 17,
        facing:       'east',
        emoji:        '\uD83D\uDC69',
        name:         'Facade Loiterer',
        barkPool:     'ambient.approach',
        barkRadius:   3,
        barkInterval: 28000
      }
    ]);

    // ── Floor 1: The Promenade (50×36, E-W orientation) ──────────
    //
    // Low-density residential boardwalk village. 5 ambient NPCs +
    // 1 Dispatcher who intercepts the player near the east gate
    // and redirects them to 1.6 (Gleaner's Home) for work keys.
    //
    // Perimeter: tree(W) → shrub(mid) → fence(E)
    // Buildings: Bazaar(NW), Inn(NC), Cellar(SW), Home(SC)
    // Landmarks: Noticeboard(NE), Well(SE)
    //
    register('1', [
      // ── 1. Bazaar Vendor — outside Coral Bazaar (NW pod) ─────
      {
        id:           'floor1_bazaar_vendor',
        type:         TYPES.INTERACTIVE,
        x: 10, y: 10,
        facing:       'south',
        emoji:        '\uD83D\uDC69',
        name:         'Market Vendor',
        talkable:     true,
        dialoguePool: 'npc.promenade.vendor',
        barkPool:     'ambient.promenade',
        barkRadius:   4,
        barkInterval: 22000
      },
      // ── 2. Tide Scholar — verb-field: scholar archetype ───────
      //    Starts at tide_post (NC pod). Orbits between post, bonfire,
      //    and noticeboard. Faction-locked duty verb.
      {
        id:           'floor1_tide_1',
        type:         TYPES.AMBIENT,
        x: 22, y: 10,
        facing:       'south',
        emoji:        '\uD83E\uDDD9',
        name:         'Tide Scholar',
        role:         'tide_member',
        verbArchetype: 'scholar',
        verbFaction:  'tide',
        stepInterval: 1600,
        barkPool:     'faction.tide',
        barkRadius:   3,
        barkInterval: 25000
      },
      // ── 3. Foundry Rep — verb-field: worker archetype ────────
      //    Starts at foundry_post (NE cluster). Strong duty pull,
      //    occasional errands to noticeboard and bazaar entrance.
      {
        id:           'floor1_foundry_1',
        type:         TYPES.AMBIENT,
        x: 38, y: 10,
        facing:       'west',
        emoji:        '\uD83D\uDC68',
        name:         'Foundry Rep',
        role:         'foundry_member',
        verbArchetype: 'worker',
        verbFaction:  'foundry',
        stepInterval: 1500,
        barkPool:     'faction.foundry',
        barkRadius:   3,
        barkInterval: 30000
      },
      // ── 4. Admiralty Officer — verb-field: guard archetype ────
      //    Starts at admiralty_post (south road). Very strong duty
      //    pull — rarely leaves post. Occasional bonfire visit.
      {
        id:           'floor1_admiralty_1',
        type:         TYPES.AMBIENT,
        x: 20, y: 22,
        facing:       'east',
        emoji:        '\uD83D\uDC69',
        name:         'Admiralty Officer',
        role:         'admiralty_member',
        verbArchetype: 'guard',
        verbFaction:  'admiralty',
        stepInterval: 1300,
        barkPool:     'faction.admiralty',
        barkRadius:   3,
        barkInterval: 26000
      },
      // ── 5. Lamplighter — road shoulder patrol ────────────────
      {
        id:           'floor1_lamplighter',
        type:         TYPES.AMBIENT,
        x: 30, y: 16,
        facing:       'east',
        emoji:        '\uD83D\uDC68',
        name:         'Lamplighter',
        patrolPoints: [{ x: 24, y: 16 }, { x: 38, y: 16 }],
        stepInterval: 1700,
        barkPool:     'ambient.promenade',
        barkRadius:   3,
        barkInterval: 32000
      },
      // ── 6. Dispatcher — REMOVED from NpcSystem ─────────────────
      //    game.js owns the Dispatcher gate NPC entirely via
      //    _spawnDispatcherGate(). Having it here too caused a
      //    duplicate (two dispatchers visible at the gate).
    ]);

    // ── Floor 1.1: Coral Bazaar ────────────────────────────────────
    register('1.1', [
      {
        id:           'bazaar_merchant',
        type:         TYPES.INTERACTIVE,
        talkable:     true,
        x: 4, y: 8,
        facing:       'north',
        emoji:        '\uD83E\uDDD1\u200D\uD83C\uDF73',
        name:         'Coral Merchant',
        patrolPoints: [{ x: 4, y: 7 }, { x: 4, y: 9 }],
        stepInterval: 2000,
        barkPool:     'interior.bazaar',
        barkRadius:   3,
        barkInterval: 30000
      },
      {
        id:           'bazaar_archivist',
        type:         TYPES.INTERACTIVE,
        talkable:     true,
        x: 10, y: 8,
        facing:       'south',
        emoji:        '\uD83E\uDDD3',
        name:         'Bazaar Archivist',
        patrolPoints: [{ x: 10, y: 7 }, { x: 10, y: 9 }],
        stepInterval: 1900,
        barkPool:     'interior.bazaar',
        barkRadius:   3,
        barkInterval: 32000
      }
    ]);

    // ── Floor 1.2: Driftwood Inn ─────────────────────────────────
    // Innkeeper + a grumpy resident who doesn't want you there.
    register('1.2', [
      {
        id:           'inn_keeper',
        type:         TYPES.INTERACTIVE,
        x: 6, y: 4,
        facing:       'south',
        emoji:        '🧔',
        name:         'Innkeeper Marlo',
        talkable:     true,
        patrolPoints: null,  // Behind the bar
        barkPool:     'npc.innkeeper.ambient',
        barkRadius:   4,
        barkInterval: 25000,
        dialoguePool: 'npc.innkeeper.ambient'
      },
      {
        id:           'inn_patron_grumpy',
        type:         TYPES.INTERACTIVE,
        x: 10, y: 8,
        facing:       'west',
        emoji:        '😤',
        name:         'Grumpy Patron',
        talkable:     true,
        patrolPoints: null,  // Sitting at a table
        barkPool:     'npc.resident.annoyed',
        barkRadius:   3,
        barkInterval: 20000,
        dialoguePool: 'npc.resident.annoyed'
      },
      {
        id:           'inn_patron_quiet',
        type:         TYPES.AMBIENT,
        x: 4, y: 8,
        facing:       'east',
        emoji:        '🧑',
        name:         'Quiet Patron',
        patrolPoints: [{ x: 4, y: 8 }, { x: 4, y: 6 }],
        stepInterval: 2200,
        barkPool:     'interior.inn',
        barkRadius:   3,
        barkInterval: 35000
      }
    ]);

    // ── Floor 1.3: Cellar Entrance ────────────────────────────────
    // A nervous resident guarding the cellar stairs.
    register('1.3', [
      {
        id:           'cellar_resident',
        type:         TYPES.INTERACTIVE,
        x: 6, y: 6,
        facing:       'south',
        emoji:        '😰',
        name:         'Cellar Owner',
        talkable:     true,
        patrolPoints: null,
        barkPool:     'npc.resident.annoyed',
        barkRadius:   3,
        barkInterval: 22000,
        dialoguePool: 'npc.resident.annoyed'
      }
    ]);

    // ── Floor 2: Lantern Row ──────────────────────────────────────
    register('2', [
      {
        id:           'floor2_citizen_1',
        type:         TYPES.AMBIENT,
        x: 6, y: 8,
        facing:       'east',
        emoji:        '🧑',
        name:         'Shopkeeper',
        patrolPoints: [{ x: 6, y: 8 }, { x: 10, y: 8 }],
        stepInterval: 1500,
        barkPool:     'ambient.lanternrow',
        barkRadius:   3,
        barkInterval: 25000
      },
      {
        id:           'floor2_citizen_2',
        type:         TYPES.AMBIENT,
        x: 12, y: 6,
        facing:       'south',
        emoji:        '👩',
        name:         'Courier',
        patrolPoints: [{ x: 12, y: 6 }, { x: 12, y: 10 }],
        stepInterval: 1200,
        barkPool:     'ambient.lanternrow',
        barkRadius:   3,
        barkInterval: 28000
      },
      {
        id:           'floor2_tide_1',
        type:         TYPES.AMBIENT,
        x: 4, y: 10,
        facing:       'north',
        emoji:        '🧙',
        name:         'Tide Envoy',
        role:         'tide_member',
        patrolPoints: [{ x: 4, y: 10 }, { x: 8, y: 10 }],
        stepInterval: 1600,
        barkPool:     'faction.tide',
        barkRadius:   3,
        barkInterval: 30000
      },
      {
        id:           'floor2_admiralty_1',
        type:         TYPES.AMBIENT,
        x: 14, y: 6,
        facing:       'west',
        emoji:        '👮',
        name:         'Admiralty Patrol',
        role:         'admiralty_member',
        patrolPoints: [{ x: 14, y: 6 }, { x: 14, y: 10 }],
        stepInterval: 1400,
        barkPool:     'faction.admiralty',
        barkRadius:   3,
        barkInterval: 26000
      }
    ]);

    // ── Floor 2.1: Dispatcher's Office ────────────────────────────
    // Friendly guild NPCs: a veteran Gleaner, a clerk, and a rookie.
    // All talkable (INTERACTIVE) with dialogue trees wired at init.
    register('2.1', [
      {
        id:           'dispatch_veteran',
        type:         TYPES.INTERACTIVE,
        x: 4, y: 6,
        facing:       'east',
        emoji:        '🧔',
        name:         'Ren',
        role:         'guild_veteran',
        talkable:     true,
        patrolPoints: [{ x: 4, y: 6 }, { x: 6, y: 6 }],
        stepInterval: 2000,
        barkPool:     'npc.guild_veteran.ambient',
        barkRadius:   4,
        barkInterval: 22000,
        dialoguePool: 'npc.guild_veteran.ambient'
      },
      {
        id:           'dispatch_clerk',
        type:         TYPES.INTERACTIVE,
        x: 10, y: 4,
        facing:       'south',
        emoji:        '👩‍💼',
        name:         'Sable',
        role:         'guild_clerk',
        talkable:     true,
        patrolPoints: null,  // Stationary — behind the desk
        barkPool:     'npc.guild_clerk.ambient',
        barkRadius:   3,
        barkInterval: 28000,
        dialoguePool: 'npc.guild_clerk.ambient'
      },
      {
        id:           'dispatch_rookie',
        type:         TYPES.INTERACTIVE,
        x: 8, y: 8,
        facing:       'west',
        emoji:        '🧒',
        name:         'Pip',
        role:         'guild_rookie',
        talkable:     true,
        patrolPoints: [{ x: 8, y: 8 }, { x: 6, y: 8 }],
        stepInterval: 1800,
        barkPool:     'npc.guild_rookie.ambient',
        barkRadius:   4,
        barkInterval: 24000,
        dialoguePool: 'npc.guild_rookie.ambient'
      },
      {
        id:           'dispatch_ambient_1',
        type:         TYPES.AMBIENT,
        x: 12, y: 6,
        facing:       'north',
        emoji:        '🧑',
        name:         'Gleaner',
        patrolPoints: [{ x: 12, y: 6 }, { x: 12, y: 8 }],
        stepInterval: 1600,
        barkPool:     'interior.dispatch',
        barkRadius:   3,
        barkInterval: 30000
      },
      {
        id:           'dispatch_ambient_2',
        type:         TYPES.AMBIENT,
        x: 6, y: 10,
        facing:       'east',
        emoji:        '👷',
        name:         'Gleaner',
        patrolPoints: [{ x: 6, y: 10 }, { x: 10, y: 10 }],
        stepInterval: 1500,
        barkPool:     'interior.dispatch',
        barkRadius:   3,
        barkInterval: 32000
      }
    ]);

    // ── Floor 2.2: Watchman's Post ────────────────────────────────
    register('2.2', [
      {
        id:           'watchpost_watchman',
        type:         TYPES.INTERACTIVE,
        x: 6, y: 6,
        facing:       'south',
        emoji:        '🎖️',
        name:         'The Watchman',
        talkable:     true,
        patrolPoints: null,  // Stationary — on watch
        barkPool:     'interior.watchpost',
        barkRadius:   4,
        barkInterval: 35000,
        dialoguePool: 'interior.watchpost'
      },
      {
        id:           'watchpost_guard',
        type:         TYPES.AMBIENT,
        x: 10, y: 8,
        facing:       'west',
        emoji:        '💂',
        name:         'Admiralty Guard',
        role:         'admiralty_member',
        patrolPoints: [{ x: 10, y: 8 }, { x: 10, y: 6 }],
        stepInterval: 1600,
        barkPool:     'faction.admiralty',
        barkRadius:   3,
        barkInterval: 30000
      }
    ]);

    // ── Floor 3: The Garrison (frontier exterior, 52×52) ──────────
    // Admiralty-dominant militarised slum. 12 NPCs:
    //   3 Admiralty uniformed (patrol, gate guard, pier lookout)
    //   1 Tide envoy (north clearing, near bonfire)
    //   1 Foundry worker (east arm, highway freight hauler)
    //   7 Non-faction citizens (hawkers, beggars, drifters, fisherman)
    register('3', [
      // ── Admiralty (3) ──
      {
        id:           'floor3_admiralty_gate',
        type:         TYPES.INTERACTIVE,
        x: 8, y: 25,
        facing:       'west',
        emoji:        '💂',
        name:         'Gate Sentry',
        role:         'admiralty_member',
        talkable:     true,
        patrolPoints: null,
        barkPool:     'faction.admiralty',
        barkRadius:   4,
        barkInterval: 20000,
        dialoguePool: 'faction.admiralty'
      },
      {
        id:           'floor3_admiralty_patrol',
        type:         TYPES.AMBIENT,
        x: 24, y: 22,
        facing:       'south',
        emoji:        '👮',
        name:         'Admiralty Patrol',
        role:         'admiralty_member',
        patrolPoints: [{ x: 24, y: 22 }, { x: 28, y: 22 }, { x: 28, y: 28 }, { x: 24, y: 28 }],
        stepInterval: 1400,
        barkPool:     'faction.admiralty',
        barkRadius:   3,
        barkInterval: 24000
      },
      {
        id:           'floor3_admiralty_pier',
        type:         TYPES.AMBIENT,
        x: 25, y: 40,
        facing:       'south',
        emoji:        '🪖',
        name:         'Pier Lookout',
        role:         'admiralty_member',
        patrolPoints: [{ x: 25, y: 40 }, { x: 25, y: 44 }],
        stepInterval: 2000,
        barkPool:     'faction.admiralty',
        barkRadius:   3,
        barkInterval: 30000
      },
      // ── Tide envoy (1) — near north bonfire ──
      {
        id:           'floor3_tide_envoy',
        type:         TYPES.INTERACTIVE,
        x: 22, y: 8,
        facing:       'east',
        emoji:        '🧙',
        name:         'Tide Envoy',
        role:         'tide_member',
        talkable:     true,
        patrolPoints: [{ x: 22, y: 8 }, { x: 24, y: 6 }],
        stepInterval: 2200,
        barkPool:     'faction.tide',
        barkRadius:   3,
        barkInterval: 28000,
        dialoguePool: 'faction.tide'
      },
      // ── Foundry worker (1) — east highway freight ──
      {
        id:           'floor3_foundry_hauler',
        type:         TYPES.AMBIENT,
        x: 40, y: 24,
        facing:       'east',
        emoji:        '🔧',
        name:         'Foundry Hauler',
        role:         'foundry_member',
        patrolPoints: [{ x: 40, y: 24 }, { x: 46, y: 24 }],
        stepInterval: 1200,
        barkPool:     'faction.foundry',
        barkRadius:   3,
        barkInterval: 26000
      },
      // ── Non-faction citizens (7) ──
      {
        id:           'floor3_hawker_1',
        type:         TYPES.AMBIENT,
        x: 20, y: 20,
        facing:       'south',
        emoji:        '🧑',
        name:         'Street Hawker',
        patrolPoints: [{ x: 20, y: 20 }, { x: 20, y: 24 }],
        stepInterval: 1600,
        barkPool:     'ambient.garrison',
        barkRadius:   3,
        barkInterval: 22000
      },
      {
        id:           'floor3_drifter_1',
        type:         TYPES.AMBIENT,
        x: 30, y: 26,
        facing:       'west',
        emoji:        '🧔',
        name:         'Drifter',
        patrolPoints: [{ x: 30, y: 26 }, { x: 26, y: 26 }],
        stepInterval: 1800,
        barkPool:     'ambient.garrison',
        barkRadius:   3,
        barkInterval: 32000
      },
      {
        id:           'floor3_beggar_1',
        type:         TYPES.AMBIENT,
        x: 14, y: 25,
        facing:       'east',
        emoji:        '🧎',
        name:         'Beggar',
        patrolPoints: null,
        barkPool:     'ambient.garrison',
        barkRadius:   2,
        barkInterval: 18000
      },
      {
        id:           'floor3_citizen_2',
        type:         TYPES.AMBIENT,
        x: 22, y: 30,
        facing:       'north',
        emoji:        '👩',
        name:         'Washerwoman',
        patrolPoints: [{ x: 22, y: 30 }, { x: 24, y: 30 }],
        stepInterval: 2000,
        barkPool:     'ambient.garrison',
        barkRadius:   3,
        barkInterval: 30000
      },
      {
        id:           'floor3_fisherman',
        type:         TYPES.INTERACTIVE,
        x: 24, y: 46,
        facing:       'south',
        emoji:        '🎣',
        name:         'Old Fisherman',
        talkable:     true,
        patrolPoints: null,
        barkPool:     'ambient.pier',
        barkRadius:   4,
        barkInterval: 35000,
        dialoguePool: 'ambient.pier'
      },
      {
        id:           'floor3_trader_highway',
        type:         TYPES.AMBIENT,
        x: 38, y: 26,
        facing:       'east',
        emoji:        '🐴',
        name:         'Caravan Trader',
        patrolPoints: [{ x: 38, y: 26 }, { x: 48, y: 26 }],
        stepInterval: 1000,
        barkPool:     'ambient.highway',
        barkRadius:   3,
        barkInterval: 24000
      },
      {
        id:           'floor3_urchin_1',
        type:         TYPES.AMBIENT,
        x: 26, y: 19,
        facing:       'south',
        emoji:        '👦',
        name:         'Street Urchin',
        patrolPoints: [{ x: 26, y: 19 }, { x: 30, y: 23 }, { x: 22, y: 27 }],
        stepInterval: 900,
        barkPool:     'ambient.garrison',
        barkRadius:   2,
        barkInterval: 20000
      },

      // ── Vivec Arch gate — Immigrant Inspector + aloof bark crowd ──
      // The eastern arch at (51,25)/(51,26) is LOCKED_DOOR. The Inspector
      // is the narrative gate-check: his dialogue tree checks the player
      // journal for a `rent_receipt_book` entry (proof of residence) and,
      // when present, sets the unlock flag on both LOCKED_DOOR tiles.
      //
      // The crowd is decorative — four aloof onlookers who bark immigration
      // chatter (weather-beaten gossip, envy, rumor). They don't block the
      // path; they create ambience so the gate scene feels populated.
      {
        id:           'floor3_inspector',
        type:         TYPES.INTERACTIVE,
        x: 48, y: 25,
        facing:       'west',
        emoji:        '🛂',
        name:         'Immigrant Inspector',
        role:         'admiralty_member',
        talkable:     true,
        patrolPoints: null,             // Stationary — stands in the archway
        barkPool:     'npc.inspector.ambient',
        barkRadius:   5,
        barkInterval: 18000,
        dialogueTree: null,             // Tree registered in game.js init
        // ── Gate-check tag (wiring deferred) ──
        // When the dialogue tree wraps, game.js will consult this tag to
        // decide whether to call Player.setFlag() on the arch LOCKED_DOOR
        // tiles. See npc-system.js `getGateCheck(npcId)` accessor below.
        gateCheck: {
          requiredBookId: 'rent_receipt_book',
          unlockFlags:    ['locked_door_3:51,25', 'locked_door_3:51,26'],
          targetFloor:    '4',
          rejectBarkPool: 'npc.inspector.reject',
          acceptBarkPool: 'npc.inspector.accept'
        }
      },
      {
        id:           'floor3_crowd_1',
        type:         TYPES.AMBIENT,
        x: 46, y: 21,
        facing:       'south',
        emoji:        '🧕',
        name:         'Hopeful',
        patrolPoints: [{ x: 46, y: 21 }, { x: 47, y: 21 }],
        stepInterval: 2600,
        barkPool:     'ambient.vivec_crowd',
        barkRadius:   4,
        barkInterval: 21000
      },
      {
        id:           'floor3_crowd_2',
        type:         TYPES.AMBIENT,
        x: 47, y: 22,
        facing:       'south',
        emoji:        '🧑‍🦱',
        name:         'Weary Traveler',
        patrolPoints: null,
        barkPool:     'ambient.vivec_crowd',
        barkRadius:   4,
        barkInterval: 24000
      },
      {
        id:           'floor3_crowd_3',
        type:         TYPES.AMBIENT,
        x: 46, y: 28,
        facing:       'north',
        emoji:        '👴',
        name:         'Old Petitioner',
        patrolPoints: null,
        barkPool:     'ambient.vivec_crowd',
        barkRadius:   4,
        barkInterval: 26000
      },
      {
        id:           'floor3_crowd_4',
        type:         TYPES.AMBIENT,
        x: 47, y: 29,
        facing:       'north',
        emoji:        '🧔‍♀️',
        name:         'Disappointed Applicant',
        patrolPoints: [{ x: 47, y: 29 }, { x: 48, y: 28 }],
        stepInterval: 2800,
        barkPool:     'ambient.vivec_crowd',
        barkRadius:   4,
        barkInterval: 22000
      }
    ]);
  }

  // ── Utility ───────────────────────────────────────────────────────

  /**
   * Clear active NPC list. Called on floor change so stale refs
   * from the previous floor don't linger in _active.
   */
  function clearActive() {
    _active = [];
    _dialoguePairs = [];
    _dialoguePairRebuildTimer = 0;
  }

  /**
   * Find a live NPC entity by id from the given enemy list.
   * @param {string} id
   * @param {Array}  enemies
   * @returns {Object|null}
   */
  function findById(id, enemies) {
    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].id === id) return enemies[i];
    }
    return null;
  }

  /**
   * Find the first NPC entity at grid position (x, y).
   * Used by Game._interact() to resolve the NPC before calling interact().
   * @param {number} x
   * @param {number} y
   * @param {Array}  enemies
   * @returns {Object|null}
   */
  function findAtTile(x, y, enemies) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.x === x && e.y === y && e.npcType) return e;
    }
    return null;
  }

  /**
   * Return true if the entity at (x, y) is a talkable NPC.
   * Used by Game._interact() to decide whether to call interact() or
   * fall through to normal tile interaction.
   */
  function isTalkable(x, y, enemies) {
    var npc = findAtTile(x, y, enemies);
    return !!(npc && npc.talkable);
  }

  // ── Init ──────────────────────────────────────────────────────────

  function init() {
    _registerBuiltinPopulations();
    console.log('[NpcSystem] Initialised. Floors with NPC definitions: '
      + Object.keys(_defs).join(', '));
  }

  /**
   * Look up the `gateCheck` tag on a registered NPC definition. Returns
   * null if the NPC does not exist or does not carry a gate-check tag.
   *
   * Used by post-dialogue hooks that need to decide whether to set door
   * unlock flags based on the player's journal contents. The canonical
   * consumer is the Immigrant Inspector on Floor 3 (floor3_inspector).
   *
   * @param {string} npcId
   * @returns {Object|null}
   */
  function getGateCheck(npcId) {
    var floors = Object.keys(_defs);
    for (var i = 0; i < floors.length; i++) {
      var defs = _defs[floors[i]];
      for (var j = 0; j < defs.length; j++) {
        if (defs[j].id === npcId) return defs[j].gateCheck || null;
      }
    }
    return null;
  }

  // ── Public API ────────────────────────────────────────────────────

  return Object.freeze({
    TYPES:        TYPES,
    init:         init,
    register:     register,
    registerTree: registerTree,
    spawn:        spawn,
    tick:         tick,
    interact:     interact,
    engageTalk:   _engageTalk,
    clearActive:  clearActive,
    findById:     findById,
    findAtTile:   findAtTile,
    isTalkable:   isTalkable,
    getGateCheck: getGateCheck
  });
})();
