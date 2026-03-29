/**
 * FloorTransition — SFX-sequenced floor transition state machine.
 *
 * Orchestrates the full transition timeline:
 *   1. DoorOpen sound plays immediately
 *   2. Pre-fade delay (~350ms) — player hears the door creak
 *   3. Fade to black + transition label overlay
 *   4. Floor generation (sync)
 *   5. Fade in from black
 *   6. DoorClose sound (if present in sequence)
 *
 * Sound sequences come from DoorContractAudio's transition table,
 * which encodes the correct door/ascend/descend sounds for each
 * floor depth pair.
 *
 * Minimap floor stack is managed here (push/pop/enter) so the
 * minimap's fog-of-war cache stays in sync with transitions.
 *
 * Does NOT own:
 *   - Floor generation (delegates to FloorManager)
 *   - Player state (delegates to Player)
 *   - HUD rendering (delegates to HUD)
 */
var FloorTransition = (function () {
  'use strict';

  var MC = MovementController;

  var _transitioning = false;

  // ── Callbacks (wired by Game orchestrator) ─────────────────────────
  var _onBeforeTransition = null;  // Called before fade starts
  var _onAfterTransition = null;   // Called after fade ends

  function isTransitioning() { return _transitioning; }

  /**
   * Wire callbacks from the Game orchestrator.
   * @param {Object} cbs - { onBefore, onAfter }
   */
  function setCallbacks(cbs) {
    cbs = cbs || {};
    _onBeforeTransition = cbs.onBefore || null;
    _onAfterTransition = cbs.onAfter || null;
  }

  // ── Main transition entry point ────────────────────────────────────

  /**
   * Execute a floor transition with proper audio sequencing.
   *
   * @param {string} targetFloorId - Destination floor ID string
   * @param {string} direction      - 'advance' (descending) or 'retreat' (ascending)
   */
  function go(targetFloorId, direction) {
    targetFloorId = String(targetFloorId);
    console.log('[FloorTransition] go(' + targetFloorId + ', ' + direction + ') — _transitioning=' + _transitioning);
    if (_transitioning) return;
    _transitioning = true;

    // Cancel any queued movement
    MC.cancelAll();

    var sourceFloorId = FloorManager.getFloor();
    var audioDir = direction === 'advance' ? 'down' : 'up';

    // Resolve door contract sounds from the transition table
    var sounds = DoorContractAudio.getTransitionSounds(
      sourceFloorId, targetFloorId, { direction: audioDir }
    );
    var preFadeDelay = DoorContractAudio.getPreFadeDelay(sounds);
    var transitionLabel = DoorContractAudio.getTransitionLabel(
      sourceFloorId, targetFloorId, { direction: audioDir }
    );
    var floorLabel = FloorManager.getFloorLabel(targetFloorId);

    // Play door open sound immediately (delay=0 entries fire now)
    AudioSystem.playSequence(sounds);

    // Stop current music during transition
    AudioSystem.stopMusic();

    // Notify orchestrator (cancel combat, etc.)
    if (_onBeforeTransition) _onBeforeTransition();

    // Determine visual preset from depth pair
    var presetName = (typeof TransitionFX !== 'undefined')
      ? TransitionFX.resolvePreset(sourceFloorId, targetFloorId, direction)
      : 'walk_through';

    // Use TransitionFX if available, fall back to HUD overlay
    if (typeof TransitionFX !== 'undefined') {
      TransitionFX.begin({
        type: presetName,
        duration: Math.max(800, preFadeDelay + 500),
        label: transitionLabel + ' ' + floorLabel,
        onMidpoint: function () {
          _doFloorSwitch(targetFloorId, direction);
        },
        onComplete: function () {
          _transitioning = false;
          if (_onAfterTransition) _onAfterTransition();
        }
      });
    } else {
      // Legacy fallback: HUD overlay with setTimeout
      setTimeout(function () {
        HUD.showFloorTransition(transitionLabel + ' ' + floorLabel);
        _doFloorSwitch(targetFloorId, direction);
        setTimeout(function () {
          HUD.hideFloorTransition();
          _transitioning = false;
          if (_onAfterTransition) _onAfterTransition();
        }, 300);
      }, preFadeDelay);
    }
  }

  /**
   * Perform the actual floor switch (shared by TransitionFX and legacy paths).
   */
  function _doFloorSwitch(targetFloorId, direction) {
    console.log('[FloorTransition] _doFloorSwitch: floor ' + targetFloorId + ' dir=' + direction);

    // Stop door-open animation (floor is about to change)
    if (typeof DoorAnimator !== 'undefined' && DoorAnimator.isAnimating()) {
      DoorAnimator.stop();
    }

    // Update floor state in FloorManager
    FloorManager.setFloor(targetFloorId);

    // Update minimap floor stack
    if (direction === 'advance') {
      Minimap.pushFloor(targetFloorId);
    } else {
      Minimap.popToFloor(targetFloorId);
    }

    // Enter floor on minimap (restores cached explored or starts fresh)
    var contract = FloorManager.getFloorContract(targetFloorId);
    Minimap.enterFloor(targetFloorId, contract.label || ('Floor ' + targetFloorId));

    // Generate the floor (sync)
    var spawn = FloorManager.generateCurrentFloor();
    console.log('[FloorTransition] Floor generated — spawn at (' +
                spawn.x + ',' + spawn.y + ') dir=' + spawn.dir);

    // Reveal starting tiles on minimap
    var p = Player.state();
    Minimap.reveal(p.x, p.y);

    // Update HUD
    HUD.updateFloor(targetFloorId);
    HUD.updatePlayer(p);

    console.log('[FloorTransition] _doFloorSwitch complete — HUD updated to floor ' + targetFloorId);
  }

  // ── Stair interaction ──────────────────────────────────────────────

  /**
   * Resolve the target floor ID for a stair transition.
   * Down: descend to next level (child or next sibling)
   * Up: ascend to parent level
   */
  function _resolveStairTarget(currentId, direction) {
    var depth = currentId.split('.').length;
    if (direction === 'down') {
      if (depth >= 3) return FloorManager.nextSiblingId(currentId);
      return FloorManager.childId(currentId, '1');
    } else {
      if (depth <= 1) return null;  // Can't ascend from depth 1
      if (depth >= 3) return FloorManager.prevSiblingId(currentId);
      return FloorManager.parentId(currentId);
    }
  }

  /**
   * Attempt to use stairs at player position or facing tile.
   * @param {string} direction - 'down' or 'up'
   */
  function tryStairs(direction) {
    if (_transitioning) return;

    var pos = MC.getGridPos();
    var floorData = FloorManager.getFloorData();
    var grid = floorData.grid;
    var tile = grid[pos.y][pos.x];
    var currentId = FloorManager.getFloor();

    if (direction === 'down' && tile === TILES.STAIRS_DN) {
      var target = _resolveStairTarget(currentId, 'down');
      if (!target) return;
      DoorContracts.setContract({ x: pos.x, y: pos.y }, 'advance');
      go(target, 'advance');
    } else if (direction === 'up' && tile === TILES.STAIRS_UP) {
      var target = _resolveStairTarget(currentId, 'up');
      if (!target) return;
      DoorContracts.setContract({ x: pos.x, y: pos.y }, 'retreat');
      go(target, 'retreat');
    }
  }

  /**
   * Attempt to interact with stairs on the tile the player faces.
   * @param {number} fx - Facing tile X
   * @param {number} fy - Facing tile Y
   * @returns {boolean} true if a transition was triggered
   */
  function tryInteractStairs(fx, fy) {
    if (_transitioning) return false;

    var floorData = FloorManager.getFloorData();
    var grid = floorData.grid;
    var tile = grid[fy][fx];
    var currentId = FloorManager.getFloor();

    if (tile === TILES.STAIRS_DN) {
      var target = _resolveStairTarget(currentId, 'down');
      if (!target) return false;
      _startDoorAnimation(fx, fy, tile, 'advance');
      DoorContracts.setContract({ x: fx, y: fy }, 'advance');
      go(target, 'advance');
      return true;
    } else if (tile === TILES.STAIRS_UP) {
      var target = _resolveStairTarget(currentId, 'up');
      if (!target) return false;
      _startDoorAnimation(fx, fy, tile, 'retreat');
      DoorContracts.setContract({ x: fx, y: fy }, 'retreat');
      go(target, 'retreat');
      return true;
    }
    return false;
  }

  // ── Door interaction ──────────────────────────────────────────────

  /**
   * Attempt to interact with a door tile the player faces.
   *
   * Handles DOOR (advance), DOOR_BACK (retreat), DOOR_EXIT (retreat),
   * and BOSS_DOOR (advance). Stairs are NOT handled here — use
   * tryInteractStairs() for STAIRS_DN / STAIRS_UP.
   *
   * @param {number} fx - Facing tile X
   * @param {number} fy - Facing tile Y
   * @returns {boolean} true if a transition was triggered
   */
  function tryInteractDoor(fx, fy) {
    console.log('[FloorTransition] tryInteractDoor(' + fx + ',' + fy + ') transitioning=' + _transitioning);
    if (_transitioning) return false;

    var floorData = FloorManager.getFloorData();
    var grid = floorData.grid;
    var tile = grid[fy][fx];
    var currentId = FloorManager.getFloor();
    console.log('[FloorTransition] tryInteractDoor tile=' + tile + ' floorId=' + currentId);

    var direction = null;
    var targetId = null;

    if (tile === TILES.DOOR || tile === TILES.BOSS_DOOR) {
      if (tile === TILES.BOSS_DOOR && !_tryUnlockDoor(fx, fy, currentId)) {
        return true;  // Consumed the interaction (showed locked dialog)
      }
      direction = 'advance';
      // Check explicit doorTargets first
      var key = fx + ',' + fy;
      if (floorData.doorTargets && floorData.doorTargets[key]) {
        targetId = floorData.doorTargets[key];
      } else {
        // Convention: DOOR advances one depth level
        targetId = FloorManager.childId(currentId, '1');
      }
    } else if (tile === TILES.DOOR_BACK || tile === TILES.DOOR_EXIT) {
      direction = 'retreat';
      // Check explicit doorTargets first (needed for sibling-depth transitions
      // like Promenade DOOR_EXIT → The Approach, both depth 1)
      var exitKey = fx + ',' + fy;
      if (floorData.doorTargets && floorData.doorTargets[exitKey]) {
        targetId = floorData.doorTargets[exitKey];
      } else {
        // Convention: DOOR_EXIT/DOOR_BACK ascends to parent
        var parentId = FloorManager.parentId(currentId);
        if (!parentId) return false;  // Can't exit from top-level without explicit target
        targetId = parentId;
      }
    }

    if (!direction || !targetId) return false;

    _startDoorAnimation(fx, fy, tile, direction, currentId, targetId);
    DoorContracts.setContract({ x: fx, y: fy }, direction, tile);
    go(targetId, direction);
    return true;
  }

  // ── Locked door system ───────────────────────────────────────────

  /**
   * Track which BOSS_DOOR tiles have been unlocked.
   * Key: "floorId_x_y" → true
   * Persists for the session; reset on new game.
   */
  var _unlockedDoors = {};

  /**
   * Generate a unique key for a door position.
   */
  function _doorKey(floorId, fx, fy) {
    return floorId + '_' + fx + '_' + fy;
  }

  /**
   * Check if a BOSS_DOOR is already unlocked.
   */
  function isDoorUnlocked(floorId, fx, fy) {
    return !!_unlockedDoors[_doorKey(floorId, fx, fy)];
  }

  /**
   * Attempt to unlock a BOSS_DOOR.
   * Checks Player inventory for a key-type item.
   * If key found: consumes it, marks door unlocked, returns true.
   * If no key: shows locked-door dialog, returns false.
   *
   * Also checks Player flags — if 'boss_door_{floorId}_x_y' is set,
   * the door was already opened in a previous visit to this floor.
   *
   * @param {number} fx - Door tile X
   * @param {number} fy - Door tile Y
   * @param {string} floorId - Current floor ID
   * @returns {boolean} true if door is (now) unlocked
   */
  function _tryUnlockDoor(fx, fy, floorId) {
    var dk = _doorKey(floorId, fx, fy);

    // Already unlocked this session
    if (_unlockedDoors[dk]) return true;

    // Check flag from previous visit
    var flagKey = 'boss_door_' + dk;
    if (typeof Player !== 'undefined' && Player.hasFlag(flagKey)) {
      _unlockedDoors[dk] = true;
      return true;
    }

    // Look for a key item in player inventory
    var keyItem = (typeof Player !== 'undefined') ? Player.hasItemType('key') : null;

    if (keyItem) {
      // Consume the key
      Player.consumeItem(keyItem.id);
      _unlockedDoors[dk] = true;
      Player.setFlag(flagKey, true);

      // Visual + audio feedback
      if (typeof Toast !== 'undefined') {
        Toast.show(
          (keyItem.emoji || '\uD83D\uDD11') + ' ' +
          i18n.t('door.unlocked', 'Door unlocked!'),
          'loot'
        );
      }
      if (typeof AudioSystem !== 'undefined') {
        AudioSystem.play('ui-confirm', { volume: 0.7 });
      }
      if (typeof HUD !== 'undefined') {
        HUD.updatePlayer(Player.state());
      }

      console.log('[FloorTransition] Boss door unlocked at (' + fx + ',' + fy +
                  ') with ' + (keyItem.name || keyItem.id));
      return true;
    }

    // No key — show locked dialog
    if (typeof DialogBox !== 'undefined') {
      DialogBox.show({
        text: i18n.t('door.locked', 'The door is locked. You need a key.'),
        speaker: null,
        portrait: '\uD83D\uDD12',  // 🔒
        transient: true,
        transientLong: true,
        priority: DialogBox.PRIORITY.PERSISTENT
      });
    }
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('ui-fail', { volume: 0.5 });
    }

    return false;
  }

  // ── Door animation bridge ────────────────────────────────────────

  /**
   * Start the door-open animation in the raycaster.
   * Called before go() so the animation runs during the pre-fade delay.
   */
  function _startDoorAnimation(fx, fy, tile, direction, currentFloorId, targetFloorId) {
    if (typeof DoorAnimator !== 'undefined') {
      DoorAnimator.start(fx, fy, tile, direction, currentFloorId, targetFloorId);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    go: go,
    tryStairs: tryStairs,
    tryInteractStairs: tryInteractStairs,
    tryInteractDoor: tryInteractDoor,
    isTransitioning: isTransitioning,
    isDoorUnlocked: isDoorUnlocked,
    setCallbacks: setCallbacks
  };
})();
