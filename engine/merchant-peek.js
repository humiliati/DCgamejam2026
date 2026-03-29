/**
 * MerchantPeek — BoxAnim shop reveal when facing a SHOP tile.
 *
 * When the player faces a SHOP tile, a CSS 3D box appears showing
 * the merchant's stall. The lid slides open to reveal the faction
 * emoji and vendor name. Pressing [Space] dismisses the peek and
 * opens the vendor dialog → shop MenuBox flow.
 *
 * Visual: BoxAnim crate-variant with merchant colour scheme —
 * teal/gold interior glow, faction emoji inside.
 *
 * Text below box (two rows):
 *   [faction emoji] Merchant Name
 *   → browse wares
 *
 * Layer 3 (after InteractPrompt, BoxAnim)
 * Depends on: BoxAnim, TILES, Player, MovementController,
 *             FloorManager, Shop (optional)
 *
 * @module MerchantPeek
 */
var MerchantPeek = (function () {
  'use strict';

  var MC = MovementController;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY = 350;   // ms before box appears (debounce)
  var OPEN_DELAY = 200;   // ms after appear before lid slides off

  // ── Faction visual presets ──────────────────────────────────────
  var FACTION_STYLE = {
    tide:    { glow: 'rgba(80,180,200,0.5)',  label: '#60c8d0', emoji: '\uD83C\uDF0A' },
    ember:   { glow: 'rgba(220,120,60,0.5)',  label: '#e08040', emoji: '\uD83D\uDD25' },
    root:    { glow: 'rgba(80,180,80,0.5)',   label: '#60b860', emoji: '\uD83C\uDF3F' },
    iron:    { glow: 'rgba(180,180,200,0.5)', label: '#b0b0c0', emoji: '\u2699\uFE0F' },
    shadow:  { glow: 'rgba(140,100,180,0.5)', label: '#a080c0', emoji: '\uD83C\uDF19' }
  };
  var DEFAULT_STYLE = { glow: 'rgba(200,180,100,0.5)', label: '#c8b060', emoji: '\uD83D\uDED2' };

  // ── State ──────────────────────────────────────────────────────
  var _active     = false;
  var _boxId      = null;
  var _facingTile = 0;
  var _facingX    = -1;
  var _facingY    = -1;
  var _timer      = 0;
  var _opened     = false;
  var _container  = null;
  var _subLabel   = null;
  var _factionId  = null;

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    _container = document.getElementById('merchant-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'merchant-peek-container';
      _container.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-55%);' +
        'z-index:18; pointer-events:none; opacity:0;' +
        'transition:opacity 0.3s ease;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    _subLabel = document.getElementById('merchant-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'merchant-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:0; transform:none;' +
        'margin-top:36px; text-align:left;' +
        'font:38px monospace; color:rgba(200,180,100,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.8);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.3;';
      _container.appendChild(_subLabel);
    }
  }

  // ── Per-frame check ──────────────────────────────────────────

  function update(dt) {
    if (!_container || typeof BoxAnim === 'undefined') return;
    if (typeof FloorManager === 'undefined') return;

    var floorData = FloorManager.getFloorData();
    if (!floorData) { _hide(); return; }

    var p   = Player.getPos();
    var dir = Player.getDir();
    var fx  = p.x + MC.DX[dir];
    var fy  = p.y + MC.DY[dir];

    if (fx < 0 || fx >= floorData.gridW || fy < 0 || fy >= floorData.gridH) {
      _hide(); return;
    }

    var tile = floorData.grid[fy][fx];
    if (tile !== TILES.SHOP) { _hide(); return; }

    // Same tile we were already peeking at
    if (_active && _facingTile === tile && _facingX === fx && _facingY === fy) {
      return;
    }

    // New tile — accumulate debounce
    _facingTile = tile;
    _facingX    = fx;
    _facingY    = fy;
    _timer     += dt;

    if (_timer >= SHOW_DELAY) {
      _show(tile, fx, fy, floorData);
    }
  }

  // ── Show / hide ──────────────────────────────────────────────

  function _show(tile, fx, fy, floorData) {
    if (_active) _destroyBox();

    // Resolve faction for this shop tile
    _factionId = 'tide'; // fallback
    var shopList = floorData.shops || [];
    for (var i = 0; i < shopList.length; i++) {
      if (shopList[i].x === fx && shopList[i].y === fy) {
        _factionId = shopList[i].factionId;
        break;
      }
    }

    var style = FACTION_STYLE[_factionId] || DEFAULT_STYLE;

    _boxId   = BoxAnim.create('crate', _container, { spin: false });
    _active  = true;
    _opened  = false;
    _timer   = 0;

    // Style the box
    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.setProperty('--box-glow', style.glow);
      inst.style.pointerEvents = 'none';

      // Interior content: faction emoji
      var glow = inst.querySelector('.box3d-glow');
      if (glow) {
        var span = document.createElement('span');
        span.style.cssText =
          'font:bold 32px monospace;color:' + style.label +
          ';text-shadow:0 0 12px ' + style.glow +
          ';position:absolute;top:50%;left:50%;' +
          'transform:translate(-50%,-50%);white-space:nowrap;';
        span.textContent = style.emoji + ' SHOP';
        glow.appendChild(span);
      }
    }

    // Sub-label: merchant name + browse hint
    if (_subLabel) {
      _subLabel.textContent = '';

      var vendorName = _factionId;
      if (typeof Shop !== 'undefined' && Shop.getFactionLabel) {
        vendorName = Shop.getFactionLabel(_factionId);
      }
      var fEmoji = style.emoji;
      if (typeof Shop !== 'undefined' && Shop.getFactionEmoji) {
        fEmoji = Shop.getFactionEmoji(_factionId) || fEmoji;
      }

      _subLabel.appendChild(document.createTextNode(fEmoji + ' ' + vendorName));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode('\u2192 browse wares'));
      _subLabel.style.color = 'rgba(200,180,100,0)';
    }

    _container.style.opacity = '1';

    // Open lid after brief delay
    setTimeout(function () {
      if (_active && _boxId) {
        BoxAnim.open(_boxId);
        _opened = true;
        // Fade in sub-label
        if (_subLabel) {
          _subLabel.style.color = style.label;
        }
      }
    }, OPEN_DELAY);
  }

  function _hide() {
    if (!_active) return;

    if (_subLabel) {
      _subLabel.style.color = 'rgba(200,180,100,0)';
    }

    if (_boxId && _opened) {
      BoxAnim.close(_boxId);
    }

    _container.style.opacity = '0';

    // Destroy after fade-out
    setTimeout(function () {
      _destroyBox();
    }, 350);

    _active     = false;
    _opened     = false;
    _facingTile = 0;
    _facingX    = -1;
    _facingY    = -1;
    _timer      = 0;
    _factionId  = null;
  }

  function _destroyBox() {
    if (_boxId) {
      BoxAnim.destroy(_boxId);
      _boxId = null;
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    init:   init,
    update: update,
    isActive: function () { return _active; },
    getFaction: function () { return _factionId; }
  };
})();
