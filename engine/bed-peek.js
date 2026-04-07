/**
 * BedPeek — sleep/rest interaction for the bed tile at player home.
 *
 * When the player faces the BED tile at Floor 1.6 (player home), position (2,2),
 * a sleep confirmation overlay shows after a short debounce. Pressing interact (F)
 * triggers a sleep transition: fade to black, advance time by 8 hours (REST),
 * heal the player to full, then fade back in with a morning bark.
 *
 * If the sleep transition advances the game into a Hero Day, the _onHeroDayRun
 * callback is fired during the transition to allow setup of hero events.
 *
 * The overlay auto-hides if the player looks away from the bed.
 *
 * Layer 3 — depends on: TILES, Player, FloorManager, DayCycle, TransitionFX,
 *           InputManager, HUD, BarkLibrary, MovementController, Toast
 */
var BedPeek = (function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────
  var SHOW_DELAY       = 300;   // ms debounce before overlay shows
  var HIDE_DELAY       = 200;   // ms before overlay hides after looking away
  var HOME_FLOOR_ID    = '1.6';
  var BED_X            = 2;
  var BED_Y            = 2;

  // ── State ───────────────────────────────────────────────────
  var _active          = false;     // Overlay is visible
  var _timer           = 0;         // Debounce timer
  var _hideTimer       = 0;         // Fade-out timer
  var _isSleeping      = false;     // Sleeping transition in progress
  var _overlay         = null;      // DOM overlay element
  var _currentFloorId  = null;      // Last known floor

  // Callbacks
  var _onHeroDayRun    = null;      // callback(day) — fired during sleep if advancing into Hero Day
  var _onWake          = null;      // callback(day) — fired after waking up

  // ── Helpers ─────────────────────────────────────────────────

  /**
   * Check if the player is on Floor 1.6 and facing the bed at (2,2).
   */
  function _facingBed() {
    if (typeof FloorManager === 'undefined' || typeof MovementController === 'undefined') {
      return false;
    }

    var floorId = FloorManager.getFloor();
    if (floorId !== HOME_FLOOR_ID) {
      return false;
    }

    var pos = MovementController.getGridPos();
    if (!pos) return false;

    // Player must be adjacent to bed and facing it
    var dx = pos.x - BED_X;
    var dy = pos.y - BED_Y;

    // Check if player is orthogonally adjacent (one square away)
    var isAdjacent = (Math.abs(dx) + Math.abs(dy) === 1);
    if (!isAdjacent) return false;

    // Check if player is facing the bed
    var dir = MovementController.getDir();
    var isFacing = false;

    // dir: 0=EAST, 1=SOUTH, 2=WEST, 3=NORTH
    if (dir === 0 && dx === -1 && dy === 0) isFacing = true;  // Facing EAST toward bed
    if (dir === 1 && dx === 0 && dy === -1) isFacing = true;  // Facing SOUTH toward bed
    if (dir === 2 && dx === 1 && dy === 0) isFacing = true;   // Facing WEST toward bed
    if (dir === 3 && dx === 0 && dy === 1) isFacing = true;   // Facing NORTH toward bed

    return isFacing;
  }

  // ── Overlay Management ──────────────────────────────────────

  function _createOverlay() {
    if (_overlay) return _overlay;

    _overlay = document.createElement('div');
    _overlay.id = 'bed-peek-overlay';
    _overlay.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'z-index:20;background:rgba(20,15,10,0.92);border:2px solid rgba(180,160,120,0.4);' +
      'border-radius:8px;padding:24px 32px;color:#d4c8a0;font:18px monospace;' +
      'text-align:center;pointer-events:none;opacity:0;transition:opacity 0.3s ease;' +
      'min-width:280px;';

    document.body.appendChild(_overlay);
    return _overlay;
  }

  function _updateOverlay() {
    if (!_overlay || typeof DayCycle === 'undefined') return;

    var day = DayCycle.getDay();
    var daysUntil = DayCycle.daysUntilHeroDay();
    var heroWarning = '';

    if (daysUntil === 0) {
      heroWarning = '<br><br>⚠️ Heroes arrive at dawn!';
    }

    var daysText = 'Day ' + day + ' of 3';
    var heroText = '';
    if (daysUntil === 0) {
      heroText = 'Heroes arrive: TODAY';
    } else if (daysUntil === 1) {
      heroText = 'Heroes arrive: Tomorrow';
    } else {
      heroText = 'Heroes arrive: In ' + daysUntil + ' days';
    }

    if (_isRestBlocked()) {
      _overlay.innerHTML =
        '\uD83D\uDECF REST FOR THE NIGHT<br><br>' +
        '\u26D4 The truck is at Heroes\u2019 Wake.<br>' +
        'Report for duty before resting.';
    } else {
      _overlay.innerHTML =
        '\uD83D\uDECF REST FOR THE NIGHT<br><br>' +
        daysText + '<br>' +
        heroText + '<br><br>' +
        '[F] Sleep \u2192 Advance to Dawn' +
        heroWarning;
    }
  }

  function _show() {
    if (_active) return;

    _active = true;
    _timer = 0;
    _hideTimer = 0;

    var overlay = _createOverlay();
    _updateOverlay();

    // Fade in overlay
    setTimeout(function () {
      if (overlay && _active) {
        overlay.style.opacity = '1';
      }
    }, 10);
  }

  function _hide() {
    if (!_active) return;

    _active = false;
    _timer = 0;
    _hideTimer = 0;

    if (_overlay) {
      _overlay.style.opacity = '0';
      setTimeout(function () {
        if (_overlay && _overlay.parentNode) {
          _overlay.parentNode.removeChild(_overlay);
          _overlay = null;
        }
      }, 300);
    }
  }

  // ── Sleep Interaction ───────────────────────────────────────

  /**
   * Day 0 rest gate — the player must complete the Heroes' Wake
   * encounter (setting the heroWakeArrival flag) before they can
   * sleep.  Without this, the player can skip the hose-discovery
   * beat entirely by going straight to bed.
   */
  function _isRestBlocked() {
    if (typeof DayCycle === 'undefined' || typeof Player === 'undefined') return false;
    // Only block on day 0 (the tutorial hero day)
    if (DayCycle.getDay() !== 0) return false;
    // Block until the Heroes' Wake cinematic has played
    return !Player.getFlag('heroWakeArrival');
  }

  function _onInteract() {
    if (!_active) return;

    // ── Day 0 rest gate ──────────────────────────────────────────
    if (_isRestBlocked()) {
      if (typeof Toast !== 'undefined') {
        Toast.show('The truck is waiting at Heroes\u2019 Wake. No rest until the job\u2019s done.', 'warning');
      }
      return;
    }

    // Lock input during transition
    if (typeof InputManager !== 'undefined' && InputManager.lock) {
      InputManager.lock('bed-peek');
    }

    // Hide overlay immediately
    _hide();

    // Mark as sleeping
    _isSleeping = true;

    // Trigger sleep transition with descend preset
    if (typeof TransitionFX !== 'undefined') {
      TransitionFX.begin({
        type: 'descend',
        label: 'Sleeping...',
        onMidpoint: function () {
          // At peak darkness: advance time, heal, fire callbacks
          _sleepMidpoint();
        },
        onComplete: function () {
          // After fade-in: unlock input, fire wake callback
          _sleepComplete();
        }
      });
    }
  }

  function _sleepMidpoint() {
    if (typeof DayCycle === 'undefined' || typeof Player === 'undefined') {
      return;
    }

    var sleepHour = DayCycle.getHour();
    var dayBefore = DayCycle.getDay();

    // Temporarily unpause clock (home is depth-2, clock is paused)
    var wasPaused = DayCycle.isPaused();
    if (wasPaused) DayCycle.setPaused(false);

    // Advance time by 8 hours (REST)
    DayCycle.advanceTime(DayCycle.ADVANCE.REST);

    // Re-pause (still at depth-2 after waking)
    if (wasPaused) DayCycle.setPaused(true);

    var dayAfter = DayCycle.getDay();

    // Check if we've advanced into a Hero Day
    if (dayAfter > dayBefore && DayCycle.isHeroDay() && _onHeroDayRun) {
      try {
        _onHeroDayRun(dayAfter);
      } catch (e) {
        console.error('[BedPeek] onHeroDayRun error:', e);
      }
    }

    // Heal player to full
    var state = Player.state();
    Player.heal(state.maxHp);
    Player.restoreEnergy(state.maxEnergy);

    // Refresh HUD + debrief panels so gauges reflect the restored pools
    // (sleep fires off the move-finish path, so nothing else will cascade).
    if (typeof HUD !== 'undefined' && HUD.updatePlayer) HUD.updatePlayer(Player.state());
    if (typeof DebriefFeed !== 'undefined' && DebriefFeed.refresh) DebriefFeed.refresh();

    // Clear TIRED debuff via StatusEffect
    if (typeof StatusEffect !== 'undefined') {
      StatusEffect.clearByCondition('until_rest');
    }

    // Grant WELL_RESTED if in bed before midnight
    // sleepHour >= 6 = went to bed during day/evening (good)
    // sleepHour < 6 = post-midnight zone (stayed up too late, no buff)
    if (sleepHour >= 6 && typeof StatusEffect !== 'undefined') {
      StatusEffect.apply('WELL_RESTED');
    }

    // Morning bark
    if (typeof BarkLibrary !== 'undefined') {
      BarkLibrary.fire('home.morning.wakeup');
    }
  }

  function _sleepComplete() {
    var day = (typeof DayCycle !== 'undefined') ? DayCycle.getDay() : 0;

    // Fire wake callback
    if (_onWake) {
      try {
        _onWake(day);
      } catch (e) {
        console.error('[BedPeek] onWake error:', e);
      }
    }

    // Unlock input
    if (typeof InputManager !== 'undefined' && InputManager.unlock) {
      InputManager.unlock('bed-peek');
    }

    _isSleeping = false;
  }

  // ── Update Loop ─────────────────────────────────────────────

  /**
   * Called every frame from the game loop.
   * Checks if player is facing bed and manages overlay visibility.
   */
  function update(dt) {
    // Check floor change (reset overlay on floor transition)
    var floorId = (typeof FloorManager !== 'undefined') ?
      FloorManager.getFloor() : null;
    if (floorId !== _currentFloorId) {
      _currentFloorId = floorId;
      if (_active) _hide();
    }

    // Skip updates while sleeping
    if (_isSleeping) return;

    // Check if player is facing bed
    var facingBed = _facingBed();

    if (facingBed && !_active) {
      // Increase debounce timer
      _timer += dt;
      if (_timer >= SHOW_DELAY) {
        _show();
      }
    } else if (!facingBed && _active) {
      // Start fade-out timer
      _hideTimer += dt;
      if (_hideTimer >= HIDE_DELAY) {
        _hide();
      }
    } else if (facingBed && _active) {
      // Reset timers while still facing
      _timer = 0;
      _hideTimer = 0;
    } else if (!facingBed && !_active) {
      // Reset timers while not facing and overlay hidden
      _timer = 0;
      _hideTimer = 0;
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────

  function init() {
    if (typeof InputManager !== 'undefined') {
      InputManager.on('interact', function () {
        if (_active) {
          _onInteract();
        }
      });
    }

    console.log('[BedPeek] Initialized');
  }

  // ── Callbacks ───────────────────────────────────────────────

  function setOnHeroDayRun(fn) {
    _onHeroDayRun = fn;
  }

  function setOnWake(fn) {
    _onWake = fn;
  }

  function isSleeping() {
    return _isSleeping;
  }

  // ── Public API ──────────────────────────────────────────────

  /** Force-hide the peek overlay. */
  function forceHide() { _hide(); }

  return Object.freeze({
    init: init,
    update: update,
    setOnHeroDayRun: setOnHeroDayRun,
    setOnWake: setOnWake,
    isSleeping: isSleeping,
    forceHide: forceHide
  });
})();
