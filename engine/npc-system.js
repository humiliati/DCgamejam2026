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
      blocksMovement:def.blocksMovement || (def.type === TYPES.DISPATCHER)
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
      _inRadius:     false
    };
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

      // Patrol advance
      if (npc._patrolPoints && npc._patrolPoints.length >= 2
          && npc.npcType !== TYPES.DISPATCHER) {
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
  }

  function _tickPatrol(npc, dt, grid) {
    npc._stepTimer -= dt;
    if (npc._stepTimer > 0) return;
    npc._stepTimer = npc._stepInterval + (Math.random() * 200 - 100);

    var target = npc._patrolPoints[npc._patrolIdx];
    if (npc.x === target.x && npc.y === target.y) {
      // Reached target — advance to next waypoint (bounce)
      npc._patrolIdx = (npc._patrolIdx + 1) % npc._patrolPoints.length;
      target = npc._patrolPoints[npc._patrolIdx];
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

  /**
   * Resolve the best bark pool for the current time of day.
   * Tries time-suffixed pool first (e.g. "ambient.promenade.heroday"),
   * then NPC-specific time pool (e.g. "npc.guild_veteran.heroday"),
   * falling back to the base pool if no timed variant exists.
   */
  function _resolveTimedBarkPool(basePool) {
    if (typeof DayCycle === 'undefined') return basePool;
    var suffix = DayCycle.getBarkTimeSuffix();
    if (!suffix) return basePool;

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
    switch (npc.npcType) {
      case TYPES.AMBIENT:
        // Ambient NPCs don't advertise interaction, but if somehow
        // activated, fire a bark rather than silently doing nothing.
        if (npc.barkPool && typeof BarkLibrary !== 'undefined') {
          BarkLibrary.fire(npc.barkPool, { style: 'bubble' });
        }
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
        break;

      case TYPES.DISPATCHER:
        // Dispatcher interactions are handled by game.js _onBump() via
        // BarkLibrary cascade. On direct interact (player presses OK while
        // facing a stationary Dispatcher), fire the nudge pool if intro spent.
        if (typeof BarkLibrary !== 'undefined') {
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

  function _interactInteractive(npc) {
    // Show speech capsule above NPC during interaction
    if (typeof KaomojiCapsule !== 'undefined') {
      KaomojiCapsule.startSpeech(npc.id, 'greeting');
    }

    // Prefer a registered DialogBox tree over a bark pool
    var tree = _trees[npc.id];
    if (tree && typeof DialogBox !== 'undefined') {
      DialogBox.startConversation(
        { id: npc.id, name: npc.name, emoji: npc.emoji },
        tree
      );
      return;
    }
    // Fall back: fire the interaction bark pool
    if (npc.dialoguePool && typeof BarkLibrary !== 'undefined') {
      BarkLibrary.fire(npc.dialoguePool, { style: 'dialog' });
      // Auto-dismiss speech capsule after bark
      if (typeof KaomojiCapsule !== 'undefined') {
        setTimeout(function () { KaomojiCapsule.stopSpeech(npc.id); }, SPEECH_CAPSULE_MS);
      }
    } else if (npc.barkPool && typeof BarkLibrary !== 'undefined') {
      BarkLibrary.fire(npc.barkPool, { style: 'bubble' });
      if (typeof KaomojiCapsule !== 'undefined') {
        setTimeout(function () { KaomojiCapsule.stopSpeech(npc.id); }, SPEECH_CAPSULE_MS);
      }
    }
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
    register('0', [
      {
        id:           'floor0_worker_1',
        type:         TYPES.AMBIENT,
        x: 6, y: 10,
        facing:       'east',
        emoji:        '🧹',
        name:         'Maintenance Worker',
        patrolPoints: [{ x: 6, y: 10 }, { x: 12, y: 10 }],
        stepInterval: 1400,
        barkPool:     'ambient.approach',
        barkRadius:   4,
        barkInterval: 22000
      },
      {
        id:           'floor0_worker_2',
        type:         TYPES.AMBIENT,
        x: 9, y: 9,
        facing:       'north',
        emoji:        '🪣',
        name:         'Maintenance Worker',
        patrolPoints: [{ x: 9, y: 9 }, { x: 9, y: 13 }],
        stepInterval: 1600,
        barkPool:     'ambient.approach',
        barkRadius:   3,
        barkInterval: 30000
      }
    ]);

    // ── Floor 1: The Promenade ─────────────────────────────────────
    // 12 NPCs: 5 faction (2 Tide, 1 Foundry, 2 Admiralty) + 7 citizen.
    // Tide is dominant here (temple is nearby on this floor).
    register('1', [
      // ── Citizens (7) ───────────────────────────────────────────
      {
        id:           'floor1_citizen_1',
        type:         TYPES.AMBIENT,
        x: 8, y: 10,
        facing:       'south',
        emoji:        '🧑',
        name:         'Townsperson',
        patrolPoints: [{ x: 8, y: 10 }, { x: 12, y: 10 }],
        stepInterval: 1500,
        barkPool:     'ambient.promenade',
        barkRadius:   3,
        barkInterval: 22000
      },
      {
        id:           'floor1_citizen_2',
        type:         TYPES.AMBIENT,
        x: 4, y: 6,
        facing:       'east',
        emoji:        '👩',
        name:         'Townsperson',
        patrolPoints: [{ x: 4, y: 6 }, { x: 4, y: 10 }],
        stepInterval: 1300,
        barkPool:     'ambient.promenade',
        barkRadius:   4,
        barkInterval: 28000
      },
      {
        id:           'floor1_citizen_3',
        type:         TYPES.AMBIENT,
        x: 14, y: 8,
        facing:       'west',
        emoji:        '🧓',
        name:         'Elder',
        patrolPoints: [{ x: 14, y: 6 }, { x: 14, y: 11 }],
        stepInterval: 1800,
        barkPool:     'ambient.promenade',
        barkRadius:   3,
        barkInterval: 35000
      },
      {
        id:           'floor1_citizen_4',
        type:         TYPES.AMBIENT,
        x: 10, y: 6,
        facing:       'west',
        emoji:        '👧',
        name:         'Stall Keeper',
        patrolPoints: [{ x: 10, y: 6 }, { x: 12, y: 6 }],
        stepInterval: 1600,
        barkPool:     'ambient.promenade',
        barkRadius:   3,
        barkInterval: 26000
      },
      {
        id:           'floor1_citizen_5',
        type:         TYPES.AMBIENT,
        x: 6, y: 11,
        facing:       'north',
        emoji:        '🧑',
        name:         'Dockworker',
        patrolPoints: [{ x: 6, y: 11 }, { x: 6, y: 8 }],
        stepInterval: 1400,
        barkPool:     'ambient.promenade',
        barkRadius:   3,
        barkInterval: 30000
      },
      {
        id:           'floor1_citizen_6',
        type:         TYPES.AMBIENT,
        x: 16, y: 10,
        facing:       'south',
        emoji:        '👴',
        name:         'Fisherman',
        patrolPoints: [{ x: 16, y: 10 }, { x: 16, y: 6 }],
        stepInterval: 2000,
        barkPool:     'ambient.promenade',
        barkRadius:   3,
        barkInterval: 40000
      },
      {
        id:           'floor1_citizen_7',
        type:         TYPES.AMBIENT,
        x: 2, y: 8,
        facing:       'east',
        emoji:        '👨',
        name:         'Lamplighter',
        patrolPoints: [{ x: 2, y: 8 }, { x: 2, y: 4 }],
        stepInterval: 1700,
        barkPool:     'ambient.promenade',
        barkRadius:   3,
        barkInterval: 32000
      },
      // ── Tide Council (2) — dominant on Floor 1 ─────────────────
      {
        id:           'floor1_tide_1',
        type:         TYPES.AMBIENT,
        x: 7, y: 4,
        facing:       'south',
        emoji:        '🧙',
        name:         'Tide Scholar',
        role:         'tide_member',
        patrolPoints: [{ x: 7, y: 4 }, { x: 11, y: 4 }],
        stepInterval: 1600,
        barkPool:     'faction.tide',
        barkRadius:   3,
        barkInterval: 25000
      },
      {
        id:           'floor1_tide_2',
        type:         TYPES.AMBIENT,
        x: 3, y: 10,
        facing:       'north',
        emoji:        '🧝',
        name:         'Tide Acolyte',
        role:         'tide_member',
        patrolPoints: [{ x: 3, y: 10 }, { x: 7, y: 10 }],
        stepInterval: 1400,
        barkPool:     'faction.tide',
        barkRadius:   3,
        barkInterval: 28000
      },
      // ── The Foundry (1) ────────────────────────────────────────
      {
        id:           'floor1_foundry_1',
        type:         TYPES.AMBIENT,
        x: 15, y: 6,
        facing:       'south',
        emoji:        '👨',
        name:         'Foundry Rep',
        role:         'foundry_member',
        patrolPoints: [{ x: 15, y: 6 }, { x: 15, y: 10 }],
        stepInterval: 1500,
        barkPool:     'faction.foundry',
        barkRadius:   3,
        barkInterval: 30000
      },
      // ── The Admiralty (2) ──────────────────────────────────────
      {
        id:           'floor1_admiralty_1',
        type:         TYPES.AMBIENT,
        x: 12, y: 8,
        facing:       'west',
        emoji:        '👩',
        name:         'Admiralty Officer',
        role:         'admiralty_member',
        patrolPoints: [{ x: 12, y: 8 }, { x: 8, y: 8 }],
        stepInterval: 1300,
        barkPool:     'faction.admiralty',
        barkRadius:   3,
        barkInterval: 26000
      },
      {
        id:           'floor1_admiralty_2',
        type:         TYPES.AMBIENT,
        x: 17, y: 4,
        facing:       'south',
        emoji:        '🧑',
        name:         'Admiralty Ensign',
        role:         'admiralty_member',
        patrolPoints: [{ x: 17, y: 4 }, { x: 17, y: 8 }],
        stepInterval: 1500,
        barkPool:     'faction.admiralty',
        barkRadius:   3,
        barkInterval: 32000
      }
    ]);

    // ── Floor 1.1: Coral Bazaar ────────────────────────────────────
    register('1.1', [
      {
        id:           'bazaar_patron_1',
        type:         TYPES.AMBIENT,
        x: 4, y: 8,
        facing:       'north',
        emoji:        '🧑‍🤝‍🧑',
        name:         'Market Patron',
        patrolPoints: [{ x: 4, y: 7 }, { x: 4, y: 9 }],
        stepInterval: 2000,
        barkPool:     'interior.bazaar',
        barkRadius:   3,
        barkInterval: 30000
      },
      {
        id:           'bazaar_patron_2',
        type:         TYPES.AMBIENT,
        x: 10, y: 8,
        facing:       'south',
        emoji:        '🧕',
        name:         'Market Patron',
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
        emoji:        '🫡',
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

  // ── Public API ────────────────────────────────────────────────────

  return Object.freeze({
    TYPES:        TYPES,
    init:         init,
    register:     register,
    registerTree: registerTree,
    spawn:        spawn,
    tick:         tick,
    interact:     interact,
    clearActive:  clearActive,
    findById:     findById,
    findAtTile:   findAtTile,
    isTalkable:   isTalkable
  });
})();
