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
    tide:    { glow: 'rgba(80,180,200,0.5)',  label: '#60c8d0', emoji: '\uD83C\uDF0A', dark: '#082830', light: '#306878' },
    ember:   { glow: 'rgba(220,120,60,0.5)',  label: '#e08040', emoji: '\uD83D\uDD25', dark: '#301808', light: '#905028' },
    root:    { glow: 'rgba(80,180,80,0.5)',   label: '#60b860', emoji: '\uD83C\uDF3F', dark: '#082808', light: '#306830' },
    iron:    { glow: 'rgba(180,180,200,0.5)', label: '#b0b0c0', emoji: '\u2699\uFE0F', dark: '#181820', light: '#585868' },
    shadow:  { glow: 'rgba(140,100,180,0.5)', label: '#a080c0', emoji: '\uD83C\uDF19', dark: '#180c28', light: '#483060' }
  };
  var DEFAULT_STYLE = { glow: 'rgba(200,180,100,0.5)', label: '#c8b060', emoji: '\uD83D\uDED2', dark: '#282008', light: '#806030' };

  // ── State ──────────────────────────────────────────────────────
  var _active     = false;
  var _boxId      = null;
  var _facingTile = 0;
  var _facingX    = -1;
  var _facingY    = -1;
  var _timer      = 0;
  var _opened     = false;
  var _container  = null;
  var _labelLayer = null;
  var _innerLabel = null;
  var _subLabel   = null;
  var _actionBtn  = null;
  var _closeBtn   = null;
  var _factionId  = null;

  // ── Init ───────────────────────────────────────────────────────

  function _onActionClick() {
    if (typeof Game !== 'undefined' && Game.interact) Game.interact();
  }

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

    // ── Label layer (z-index:2) — flat overlay above 3D box ──
    _labelLayer = document.getElementById('merchant-peek-labels');
    if (!_labelLayer) {
      _labelLayer = document.createElement('div');
      _labelLayer.id = 'merchant-peek-labels';
      _labelLayer.style.cssText =
        'position:absolute; top:0; left:0; width:100%; height:100%;' +
        'z-index:2; pointer-events:none;';
      _container.appendChild(_labelLayer);
    }

    // Inner label (faction emoji + SHOP — replaces the one inside .box3d-glow)
    _innerLabel = document.getElementById('merchant-peek-innerlabel');
    if (!_innerLabel) {
      _innerLabel = document.createElement('div');
      _innerLabel.id = 'merchant-peek-innerlabel';
      _innerLabel.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'font:bold 32px monospace; color:#c8b060;' +
        'text-shadow:0 0 12px rgba(200,180,100,0.5);' +
        'white-space:nowrap; pointer-events:none;';
      _labelLayer.appendChild(_innerLabel);
    }

    // Sub-label (margin bumped to 60px)
    _subLabel = document.getElementById('merchant-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'merchant-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:0; transform:none;' +
        'margin-top:60px; text-align:left;' +
        'font:38px monospace; color:rgba(200,180,100,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.8);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.3;';
      _labelLayer.appendChild(_subLabel);
    }

    // Action button — teal/gold merchant palette
    _actionBtn = document.getElementById('merchant-peek-action');
    if (!_actionBtn) {
      _actionBtn = document.createElement('button');
      _actionBtn.id = 'merchant-peek-action';
      _actionBtn.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:130px; padding:8px 22px;' +
        'font:bold 20px monospace; color:#d0c080; background:rgba(30,30,20,0.85);' +
        'border:1px solid #c8b060; border-radius:6px;' +
        'cursor:pointer; pointer-events:auto; opacity:0;' +
        'transition:opacity 0.3s ease, border-color 0.15s, color 0.15s, box-shadow 0.15s;';
      _actionBtn.textContent = '[OK] Browse Wares';
      _actionBtn.addEventListener('click', _onActionClick);
      _actionBtn.addEventListener('mouseenter', function () {
        _actionBtn.style.borderColor = '#ffe080';
        _actionBtn.style.color       = '#fff';
        _actionBtn.style.boxShadow   = '0 0 10px rgba(200,180,100,0.5)';
      });
      _actionBtn.addEventListener('mouseleave', function () {
        _actionBtn.style.borderColor = '#c8b060';
        _actionBtn.style.color       = '#d0c080';
        _actionBtn.style.boxShadow   = 'none';
      });
      _labelLayer.appendChild(_actionBtn);
    }

    // Close button — [ESC] Close
    _closeBtn = document.getElementById('merchant-peek-close');
    if (!_closeBtn) {
      _closeBtn = document.createElement('button');
      _closeBtn.id = 'merchant-peek-close';
      _closeBtn.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:170px; padding:6px 18px;' +
        'font:16px monospace; color:rgba(200,180,100,0.6); background:rgba(30,30,20,0.5);' +
        'border:1px solid rgba(200,180,100,0.25); border-radius:4px;' +
        'cursor:pointer; pointer-events:auto; opacity:0;' +
        'transition:opacity 0.3s ease, border-color 0.15s, color 0.15s;';
      _closeBtn.textContent = '[ESC] Close';
      _closeBtn.addEventListener('click', function () { _hide(); });
      _closeBtn.addEventListener('mouseenter', function () {
        _closeBtn.style.borderColor = 'rgba(200,180,100,0.6)';
        _closeBtn.style.color       = 'rgba(220,200,130,0.9)';
      });
      _closeBtn.addEventListener('mouseleave', function () {
        _closeBtn.style.borderColor = 'rgba(200,180,100,0.25)';
        _closeBtn.style.color       = 'rgba(200,180,100,0.6)';
      });
      _labelLayer.appendChild(_closeBtn);
    }
  }

  function handleKey(key) {
    if (!_active) return false;
    if (key === 'Escape') { _hide(); return true; }
    return false;
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

    _boxId   = BoxAnim.create('chest', _container, { spin: false });
    _active  = true;
    _opened  = false;
    _timer   = 0;

    // Style the box — faction-colored faces
    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.setProperty('--box-glow', style.glow);
      inst.style.setProperty('--box-dark', style.dark);
      inst.style.setProperty('--box-light', style.light);
      inst.style.pointerEvents = 'none';
      inst.style.zIndex = '1'; // Below _labelLayer (z-index:2)
    }

    // Inner label — faction emoji + SHOP (in label layer, NOT inside .box3d-glow)
    if (_innerLabel) {
      _innerLabel.textContent = style.emoji + ' SHOP';
      _innerLabel.style.color = style.label;
      _innerLabel.style.textShadow = '0 0 12px ' + style.glow;
    }

    // Sub-label: merchant name + browse hint
    var vendorName = _factionId;
    if (typeof Shop !== 'undefined' && Shop.getFactionLabel) {
      vendorName = Shop.getFactionLabel(_factionId);
    }
    var fEmoji = style.emoji;
    if (typeof Shop !== 'undefined' && Shop.getFactionEmoji) {
      fEmoji = Shop.getFactionEmoji(_factionId) || fEmoji;
    }

    if (_subLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode(fEmoji + ' ' + vendorName));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode('\u2192 browse wares'));
      _subLabel.style.color = 'rgba(200,180,100,0)';
    }

    // Action button — faction-colored
    if (_actionBtn) {
      _actionBtn.style.opacity = '0';
      _actionBtn.style.borderColor = style.label;
      _actionBtn.style.color = style.label;
    }
    if (_closeBtn) _closeBtn.style.opacity = '0';

    _container.style.opacity = '1';

    // Open lid after brief delay
    setTimeout(function () {
      if (_active && _boxId) {
        BoxAnim.open(_boxId);
        _opened = true;
        if (_subLabel) _subLabel.style.color = style.label;
        if (_actionBtn) _actionBtn.style.opacity = '1';
        if (_closeBtn) _closeBtn.style.opacity = '1';
      }
    }, OPEN_DELAY);
  }

  function _hide() {
    if (!_active) return;

    if (_subLabel) {
      _subLabel.style.color = 'rgba(200,180,100,0)';
    }
    if (_actionBtn) _actionBtn.style.opacity = '0';
    if (_closeBtn) _closeBtn.style.opacity = '0';

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

  /** Force-hide the peek overlay. */
  function forceHide() { _hide(); }

  // ── Public API ──────────────────────────────────────────────────

  return {
    init:       init,
    update:     update,
    handleKey:  handleKey,
    forceHide:  forceHide,
    isActive:   function () { return _active; },
    getFaction: function () { return _factionId; }
  };
})();
