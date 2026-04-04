/**
 * BarCounterPeek — autonomous peek overlay for BAR_COUNTER tiles.
 *
 * When the player faces a BAR_COUNTER tile, a drink/food billboard appears
 * after a short debounce. Pressing OK (interact) consumes one tap charge
 * and grants a small stat boost. Each bar counter has a finite number of
 * taps per visit (default 3, resets on floor re-enter).
 *
 * The boost is intentionally tiny — +1 energy, +5% speed for 1 floor,
 * clear 1 debuff — purely for cozy feel and to reward exploration of
 * building interiors. The bar counter is the interior equivalent of a
 * bonfire: a micro-rest that says "you're safe here."
 *
 * Each bar counter's drink menu is defined by the building biome:
 *   - inn:    beer, ale, tonic (classic tavern)
 *   - bazaar: tea, juice, spiced drink (market stall)
 *   - guild:  coffee, energy drink (utilitarian)
 *   - home:   water, leftover stew (humble)
 *
 * Layer 2 — depends on: TILES, Player, MovementController, FloorManager,
 *           Toast, AudioSystem
 */
var BarCounterPeek = (function () {
  'use strict';

  var MC = typeof MovementController !== 'undefined' ? MovementController : null;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY    = 300;   // ms debounce before billboard shows
  var HIDE_DELAY    = 200;   // ms before billboard hides after looking away
  var MAX_TAPS      = 3;     // Uses per counter per visit (resets on floor re-enter)
  var BOOST_DURATION_FLOORS = 1;  // Boost lasts for N floor transitions

  // ── Drink menus per biome ───────────────────────────────────────

  var DRINK_MENUS = {
    inn: [
      { emoji: '☕', name: 'Boardwalk Brew',  effect: 'energy',  amount: 1,  desc: '+1 energy' },
      { emoji: '🍺', name: 'Deep Ale',        effect: 'speed',   amount: 5,  desc: '+5% speed (1 floor)' },
      { emoji: '🧃', name: 'Coral Tonic',     effect: 'cleanse', amount: 1,  desc: 'Clears 1 debuff' }
    ],
    bazaar: [
      { emoji: '🍵', name: 'Spice Tea',       effect: 'energy',  amount: 1,  desc: '+1 energy' },
      { emoji: '🧃', name: 'Coral Juice',     effect: 'heal',    amount: 3,  desc: '+3 HP' },
      { emoji: '🫖', name: 'Warm Brew',       effect: 'speed',   amount: 3,  desc: '+3% speed (1 floor)' }
    ],
    guild: [
      { emoji: '☕', name: 'Black Coffee',    effect: 'energy',  amount: 2,  desc: '+2 energy' },
      { emoji: '🥤', name: 'Stim Drink',      effect: 'speed',   amount: 8,  desc: '+8% speed (1 floor)' },
      { emoji: '💊', name: 'Guild Remedy',    effect: 'cleanse', amount: 1,  desc: 'Clears 1 debuff' }
    ],
    home: [
      { emoji: '🥛', name: 'Glass of Water',  effect: 'energy',  amount: 1,  desc: '+1 energy' },
      { emoji: '🍲', name: 'Leftover Stew',   effect: 'heal',    amount: 2,  desc: '+2 HP' }
    ]
  };
  var DEFAULT_MENU = DRINK_MENUS.inn;

  // ── State ───────────────────────────────────────────────────────
  var _active     = false;
  var _timer      = 0;
  var _hideTimer  = 0;
  var _facingX    = -1;
  var _facingY    = -1;
  var _currentMenu = null;   // Resolved drink menu array
  var _currentDrink = null;  // Currently highlighted drink
  var _tapCounts  = {};      // "x,y" → taps remaining (resets per floor visit)
  var _currentFloorId = null;
  var _buffCounter = 0;      // Monotonic counter for unique buff IDs

  // ── Drink resolution ────────────────────────────────────────────

  function _resolveDrink(fx, fy, floorData) {
    var biome = floorData.biome || 'inn';
    var menu = DRINK_MENUS[biome] || DEFAULT_MENU;
    _currentMenu = menu;

    // Rotate through menu based on position (stable per counter)
    var idx = ((fx * 7 + fy * 13) & 0x7fffffff) % menu.length;
    return menu[idx];
  }

  function _getTapsRemaining(fx, fy) {
    var key = fx + ',' + fy;
    if (_tapCounts[key] === undefined) {
      _tapCounts[key] = MAX_TAPS;
    }
    return _tapCounts[key];
  }

  function _consumeTap(fx, fy) {
    var key = fx + ',' + fy;
    if (_tapCounts[key] === undefined) {
      _tapCounts[key] = MAX_TAPS;
    }
    if (_tapCounts[key] > 0) {
      _tapCounts[key]--;
      return true;
    }
    return false;
  }

  // ── Show / Hide ─────────────────────────────────────────────────

  function _show(fx, fy, floorData) {
    if (_active && fx === _facingX && fy === _facingY) return;

    var drink = _resolveDrink(fx, fy, floorData);
    if (!drink) return;

    // Reset tap counts if we changed floors
    var floorId = typeof FloorManager !== 'undefined' ? FloorManager.getFloor() : '';
    if (floorId !== _currentFloorId) {
      _tapCounts = {};
      _currentFloorId = floorId;
    }

    _currentDrink = drink;
    _active = true;
    _facingX = fx;
    _facingY = fy;
    _hideTimer = 0;

    _renderBillboard();
  }

  function _hide() {
    if (!_active) return;
    _active = false;
    _currentDrink = null;
    _facingX = -1;
    _facingY = -1;
  }

  function _renderBillboard() {
    if (!_currentDrink || typeof Toast === 'undefined') return;

    var drink = _currentDrink;
    var taps = _getTapsRemaining(_facingX, _facingY);

    if (taps > 0) {
      Toast.show(
        drink.emoji + ' ' + drink.name + ' - ' + drink.desc +
        ' (' + taps + '/' + MAX_TAPS + ' left)  [OK] Drink',
        'info'
      );
    } else {
      Toast.show(
        drink.emoji + ' ' + drink.name + ' - Empty! Come back next visit.',
        'warning'
      );
    }
  }

  // ── Interact (called from Game._interact) ───────────────────────

  /**
   * Attempt to consume a drink at the facing bar counter.
   * Returns true if a drink was consumed, false if empty.
   */
  function tryDrink(fx, fy, floorData) {
    var drink = _resolveDrink(fx, fy, floorData);
    if (!drink) return false;

    if (!_consumeTap(fx, fy)) {
      if (typeof Toast !== 'undefined') {
        Toast.show(drink.emoji + ' The counter is empty. Come back next visit.', 'warning');
      }
      if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-blop');
      return false;
    }

    // Apply the effect
    _applyEffect(drink);

    // Feedback
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('pickup-success');
    }
    if (typeof Toast !== 'undefined') {
      Toast.show(drink.emoji + ' ' + drink.name + '! ' + drink.desc, 'loot');
    }

    // Update billboard
    _renderBillboard();
    return true;
  }

  function _applyEffect(drink) {
    if (typeof Player === 'undefined') return;
    var state = Player.state();

    switch (drink.effect) {
      case 'energy':
        // Add energy (capped at max)
        if (state.energy !== undefined) {
          Player.setEnergy(Math.min(
            (state.energy || 0) + drink.amount,
            state.maxEnergy || 100
          ));
        }
        break;

      case 'heal':
        // Restore HP
        if (state.hp !== undefined) {
          Player.heal(drink.amount);
        }
        break;

      case 'speed':
        // Speed boost — stored as a temporary buff.
        // The actual implementation is a stub; the buff system (Phase B)
        // will read Player.getBuffs() for speed modifiers.
        if (Player.addBuff) {
          Player.addBuff({
            id: 'bar_speed_' + (_buffCounter++),
            type: 'speed',
            amount: drink.amount,
            floorsRemaining: BOOST_DURATION_FLOORS
          });
        }
        break;

      case 'cleanse':
        // Remove one debuff
        if (Player.clearDebuff) {
          Player.clearDebuff(1);
        }
        break;

      default:
        break;
    }

    // Drink effects fire from an interact path, not a move-step, so nothing
    // else will cascade a refresh. Push the new state to HUD + debrief now.
    if (typeof HUD !== 'undefined' && HUD.updatePlayer) HUD.updatePlayer(Player.state());
    if (typeof DebriefFeed !== 'undefined' && DebriefFeed.refresh) DebriefFeed.refresh();
  }

  // ── Update (per-frame) ──────────────────────────────────────────

  function update(dt) {
    if (!MC || typeof FloorManager === 'undefined') return;

    var floorData = FloorManager.getFloorData();
    if (!floorData) { if (_active) _hide(); return; }

    var p = Player.getPos();
    var dir = Player.getDir();
    var fx = p.x + MC.DX[dir];
    var fy = p.y + MC.DY[dir];

    // Out of bounds
    if (fx < 0 || fx >= floorData.gridW || fy < 0 || fy >= floorData.gridH) {
      if (_active) {
        _hideTimer += dt;
        if (_hideTimer >= HIDE_DELAY) _hide();
      } else {
        _timer = 0;
      }
      return;
    }

    var tile = floorData.grid[fy][fx];

    if (tile === TILES.BAR_COUNTER) {
      _hideTimer = 0;
      if (_active && fx === _facingX && fy === _facingY) return;
      _timer += dt;
      if (_timer >= SHOW_DELAY) {
        _show(fx, fy, floorData);
        _timer = 0;
      }
    } else {
      _timer = 0;
      if (_active) {
        _hideTimer += dt;
        if (_hideTimer >= HIDE_DELAY) _hide();
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Force-hide the peek overlay. */
  function forceHide() { _hide(); }

  return {
    init: function () {
      console.log('[BarCounterPeek] Initialised');
    },
    update: update,
    tryDrink: tryDrink,
    isActive: function () { return _active; },
    getDrink: function () { return _currentDrink; },
    resetTaps: function () { _tapCounts = {}; },
    forceHide: forceHide,
    DRINK_MENUS: DRINK_MENUS
  };
})();
