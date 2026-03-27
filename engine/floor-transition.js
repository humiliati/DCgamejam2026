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
   * @param {number} targetFloorNum - Destination floor number
   * @param {string} direction      - 'advance' (descending) or 'retreat' (ascending)
   */
  function go(targetFloorNum, direction) {
    if (_transitioning) return;
    _transitioning = true;

    // Cancel any queued movement
    MC.cancelAll();

    var sourceFloorId = FloorManager.getCurrentFloorId();
    var targetFloorId = FloorManager.floorId(targetFloorNum);
    var audioDir = direction === 'advance' ? 'down' : 'up';

    // Resolve door contract sounds from the transition table
    var sounds = DoorContractAudio.getTransitionSounds(
      sourceFloorId, targetFloorId, { direction: audioDir }
    );
    var preFadeDelay = DoorContractAudio.getPreFadeDelay(sounds);
    var transitionLabel = DoorContractAudio.getTransitionLabel(
      sourceFloorId, targetFloorId, { direction: audioDir }
    );
    var floorLabel = FloorManager.getFloorLabel(targetFloorNum);

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
          _doFloorSwitch(targetFloorNum, targetFloorId, direction);
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
        _doFloorSwitch(targetFloorNum, targetFloorId, direction);
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
  function _doFloorSwitch(targetFloorNum, targetFloorId, direction) {
    // Stop door-open animation (floor is about to change)
    if (typeof DoorAnimator !== 'undefined' && DoorAnimator.isAnimating()) {
      DoorAnimator.stop();
    }

    // Update floor state in FloorManager
    FloorManager.setFloorNum(targetFloorNum);

    // Update minimap floor stack
    if (direction === 'advance') {
      Minimap.pushFloor(targetFloorId);
    } else {
      Minimap.popToFloor(targetFloorId);
    }

    // Enter floor on minimap (restores cached explored or starts fresh)
    var contract = FloorManager.getFloorContract(targetFloorNum);
    Minimap.enterFloor(targetFloorId, contract.label || ('Floor ' + targetFloorNum));

    // Generate the floor (sync)
    FloorManager.generateCurrentFloor();

    // Reveal starting tiles on minimap
    var p = Player.state();
    Minimap.reveal(p.x, p.y);

    // Update HUD
    HUD.updateFloor(targetFloorNum);
    HUD.updatePlayer(p);
  }

  // ── Stair interaction ──────────────────────────────────────────────

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
    var floorNum = FloorManager.getFloorNum();

    if (direction === 'down' && tile === TILES.STAIRS_DN) {
      DoorContracts.setContract({ x: pos.x, y: pos.y }, 'advance');
      go(floorNum + 1, 'advance');
    } else if (direction === 'up' && tile === TILES.STAIRS_UP) {
      if (floorNum <= 1) return;
      DoorContracts.setContract({ x: pos.x, y: pos.y }, 'retreat');
      go(floorNum - 1, 'retreat');
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
    var floorNum = FloorManager.getFloorNum();

    if (tile === TILES.STAIRS_DN) {
      _startDoorAnimation(fx, fy, tile, 'advance');
      DoorContracts.setContract({ x: fx, y: fy }, 'advance');
      go(floorNum + 1, 'advance');
      return true;
    } else if (tile === TILES.STAIRS_UP) {
      if (floorNum <= 1) return false;
      _startDoorAnimation(fx, fy, tile, 'retreat');
      DoorContracts.setContract({ x: fx, y: fy }, 'retreat');
      go(floorNum - 1, 'retreat');
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
    if (_transitioning) return false;

    var floorData = FloorManager.getFloorData();
    var grid = floorData.grid;
    var tile = grid[fy][fx];
    var floorNum = FloorManager.getFloorNum();

    var direction = null;

    if (tile === TILES.DOOR) {
      // Standard door: advance into building / next zone
      direction = 'advance';
    } else if (tile === TILES.BOSS_DOOR) {
      // Boss door: advance into boss chamber
      // TODO: check for boss key in Player.hasItem() / Player.hasFlag()
      direction = 'advance';
    } else if (tile === TILES.DOOR_BACK) {
      // Back door: retreat to previous floor
      if (floorNum <= 1) return false;
      direction = 'retreat';
    } else if (tile === TILES.DOOR_EXIT) {
      // Exit door: leave interior, return to parent floor
      if (floorNum <= 1) return false;
      direction = 'retreat';
    }

    if (!direction) return false;

    var targetFloorNum = direction === 'advance'
      ? floorNum + 1
      : floorNum - 1;

    _startDoorAnimation(fx, fy, tile, direction);
    DoorContracts.setContract({ x: fx, y: fy }, direction, tile);
    go(targetFloorNum, direction);
    return true;
  }

  // ── Door animation bridge ────────────────────────────────────────

  /**
   * Start the door-open animation in the raycaster.
   * Called before go() so the animation runs during the pre-fade delay.
   */
  function _startDoorAnimation(fx, fy, tile, direction) {
    if (typeof DoorAnimator !== 'undefined') {
      DoorAnimator.start(fx, fy, tile, direction);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    go: go,
    tryStairs: tryStairs,
    tryInteractStairs: tryInteractStairs,
    tryInteractDoor: tryInteractDoor,
    isTransitioning: isTransitioning,
    setCallbacks: setCallbacks
  };
})();
