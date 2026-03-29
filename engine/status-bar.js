/**
 * StatusBar — bottom strip with clickable buttons and status readout.
 *
 * Replaces the top-positioned HUD for floor/heading info. The old #hud
 * div remains for HP/EN bars during the transition; StatusBar handles
 * the bottom strip with [DEBRIEF] [MAP] [BAG] buttons + floor/heading.
 *
 * Layer 2 (after DebriefFeed — wires button clicks to other modules)
 * Depends on: Player, FloorManager, Minimap, DebriefFeed, ScreenManager, i18n
 */
var StatusBar = (function () {
  'use strict';

  // ── Compass headings ────────────────────────────────────────────
  var HEADINGS = ['\u25B8 N', '\u25B8 E', '\u25B8 S', '\u25B8 W'];

  // ── DOM refs ────────────────────────────────────────────────────
  var _el        = null;  // #status-bar
  var _btnDebrief = null;
  var _btnMap     = null;
  var _btnBag     = null;
  var _floorEl    = null;
  var _biomeEl    = null;
  var _headingEl  = null;
  var _visible    = false;

  // ── Combat state ────────────────────────────────────────────────
  var _inCombat   = false;
  var _combatRound = 0;
  var _advantage   = '';
  var _combatEnergy = 0;

  // ── Init ────────────────────────────────────────────────────────

  function init() {
    _el         = document.getElementById('status-bar');
    _btnDebrief = document.getElementById('sb-debrief');
    _btnMap     = document.getElementById('sb-map');
    _btnBag     = document.getElementById('sb-bag');
    _floorEl    = document.getElementById('sb-floor');
    _biomeEl    = document.getElementById('sb-biome');
    _headingEl  = document.getElementById('sb-heading');

    // Button click handlers
    if (_btnDebrief) {
      _btnDebrief.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof DebriefFeed !== 'undefined') DebriefFeed.cycleMode();
      });
    }

    if (_btnMap) {
      _btnMap.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof Minimap !== 'undefined') {
          Minimap.toggle();
          _updateMapBtn();
        }
      });
    }

    if (_btnBag) {
      _btnBag.addEventListener('click', function (e) {
        e.stopPropagation();
        // Open pause menu at Face 2 (Gear/Inventory)
        if (typeof ScreenManager !== 'undefined' && typeof MenuBox !== 'undefined') {
          if (ScreenManager.isPlaying()) {
            MenuBox.setStartFace(2);
            ScreenManager.toPause();
          }
        }
      });
    }
  }

  // ── Show / Hide ─────────────────────────────────────────────────

  function show() {
    _visible = true;
    if (_el) _el.style.display = 'flex';
  }

  function hide() {
    _visible = false;
    if (_el) _el.style.display = 'none';
  }

  // ── Update methods ──────────────────────────────────────────────

  function updateFloor(floorNum, biome) {
    if (_floorEl) {
      _floorEl.innerHTML = i18n.t('status.floor', 'Floor') + ' <span>' + floorNum + '</span>';
    }
    if (_biomeEl) {
      _biomeEl.textContent = biome ? ('\u00B7 ' + biome) : '';
    }
  }

  function updateHeading(dirIndex) {
    if (_headingEl) {
      _headingEl.textContent = HEADINGS[dirIndex] || '';
    }
  }

  function updateBag() {
    if (!_btnBag) return;
    var count = 0;
    var max = 12;
    if (typeof Player !== 'undefined') {
      if (Player.getBag) count = Player.getBag().length;
      if (Player.MAX_BAG) max = Player.MAX_BAG;
    }
    _btnBag.textContent = 'BAG ' + count + '/' + max;

    // Pulse when >75% full
    var full = count / max;
    if (full > 0.75) {
      _btnBag.classList.add('sb-active');
    } else {
      _btnBag.classList.remove('sb-active');
    }
  }

  function _updateMapBtn() {
    if (!_btnMap) return;
    var mapVisible = (typeof Minimap !== 'undefined' && Minimap.isVisible());
    if (mapVisible) {
      _btnMap.classList.add('sb-active');
    } else {
      _btnMap.classList.remove('sb-active');
    }
  }

  // ── Combat mode ─────────────────────────────────────────────────

  function setCombat(active, round, advantage, energy) {
    _inCombat = active;
    _combatRound = round || 0;
    _advantage = advantage || '';
    _combatEnergy = energy || 0;

    if (!_visible) return;

    if (_inCombat) {
      // Swap [MAP] → [FLEE] label during combat
      if (_btnMap) _btnMap.textContent = 'FLEE';
      // Update floor area with combat info
      if (_floorEl) {
        _floorEl.innerHTML = 'Round <span>' + _combatRound + '</span>';
      }
      if (_biomeEl) {
        _biomeEl.textContent = _advantage ? ('\u00B7 ' + _advantage) : '';
      }
      if (_headingEl) {
        _headingEl.textContent = '\u26A1' + _combatEnergy + ' EN';
      }
    } else {
      // Restore normal labels
      if (_btnMap) _btnMap.textContent = 'MAP';
      _updateMapBtn();
    }
  }

  // ── Refresh (called per frame or on state change) ───────────────

  function refresh() {
    if (!_visible) return;
    _updateMapBtn();
    updateBag();
    // Heading from Player direction
    if (typeof Player !== 'undefined' && Player.getDir) {
      updateHeading(Player.getDir());
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    init:          init,
    show:          show,
    hide:          hide,
    updateFloor:   updateFloor,
    updateHeading: updateHeading,
    updateBag:     updateBag,
    setCombat:     setCombat,
    refresh:       refresh
  };
})();
