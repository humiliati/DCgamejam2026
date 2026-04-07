/**
 * CratePeek — BoxAnim crate reveal when facing a breakable tile.
 *
 * When the player faces a BREAKABLE tile, a CSS 3D crate box appears
 * centred in the viewport. The lid slides off to the right to reveal
 * the crate interior from a steep top-down perspective. Hovering the
 * opened lid tilts it further to emphasise the view-from-above angle.
 *
 * Visual: BoxAnim crate-variant — wood-plank faces, cross-grain lid,
 * warm amber interior glow.
 *
 * Labels are rendered in a FLAT overlay div that sits ABOVE the 3D
 * scene in z-order, so text is never occluded by box faces.
 *
 * Text below box (two rows, left-aligned):
 *   breakable crate
 *   → smash to loot
 *
 * Layer 3 (after InteractPrompt, BoxAnim)
 * Depends on: BoxAnim, TILES, Player, MovementController, FloorManager
 *
 * === Bug fix (Apr 3): z-stacking & click-through ===
 * Problem: Inner label ("? LOOT ?") and sub-label were inside the 3D
 * transform hierarchy. The opaque box faces rendered in front of the
 * glow plane in 3D space, hiding all text. The InteractPrompt (canvas-
 * rendered at z=0.60×vpH) was also visually occluded by the DOM overlay.
 * Playtesters saw a crate animation with no readable text and nothing
 * apparently clickable.
 *
 * Fix:
 *   1. Labels moved to a separate flat overlay div (_labelLayer) that
 *      sits ABOVE the 3D scene via z-index:2 (relative to container).
 *   2. Sub-label repositioned with extra bottom margin to clear the
 *      3D-projected crate geometry.
 *   3. Added a visible "[OK] Smash" action button inside the label
 *      layer with pointer-events:auto so playtesters have an obvious
 *      click target. Fires the same interact as the InteractPrompt.
 *   4. Container gets pointer-events:none but action button gets
 *      pointer-events:auto — clicks outside the button still fall
 *      through to the canvas InteractPrompt.
 */
var CratePeek = (function () {
  'use strict';

  var MC = MovementController;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY = 400;   // ms before box appears (debounce)
  var OPEN_DELAY = 200;   // ms after appear before lid slides off

  // ── State ──────────────────────────────────────────────────────
  var _active     = false;
  var _boxId      = null;
  var _facingTile = 0;
  var _facingX    = -1;
  var _facingY    = -1;
  var _timer      = 0;
  var _opened     = false;
  var _container  = null;
  var _labelLayer = null;  // Flat overlay above 3D scene for labels
  var _innerLabel = null;  // "? LOOT ?" text
  var _subLabel   = null;
  var _actionBtn  = null;  // Visible click target
  var _closeBtn   = null;  // [BACK] Close

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    _container = document.getElementById('crate-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'crate-peek-container';
      // top:40% lifts whole peek ~10vh above center so the Smash button
       // (margin-top:130px below container) clears the MouseLook freelook
       // ring hitbox. See corpse-peek.js for the same fix rationale.
       _container.style.cssText =
        'position:absolute; top:40%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'z-index:18; pointer-events:none; opacity:0;' +
        'transition:opacity 0.3s ease;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    // ── Label layer: flat div that sits ABOVE the 3D box ─────────
    // z-index:2 relative to _container ensures labels paint over
    // the 3D scene (box3d-scene has default z-index / stacking).
    _labelLayer = document.getElementById('crate-peek-labels');
    if (!_labelLayer) {
      _labelLayer = document.createElement('div');
      _labelLayer.id = 'crate-peek-labels';
      _labelLayer.style.cssText =
        'position:absolute; top:0; left:0; width:100%; height:100%;' +
        'z-index:2; pointer-events:none;';
      _container.appendChild(_labelLayer);
    }

    // Inner label — centred over the box, reads "? LOOT ?"
    _innerLabel = document.getElementById('crate-peek-innerlabel');
    if (!_innerLabel) {
      _innerLabel = document.createElement('div');
      _innerLabel.id = 'crate-peek-innerlabel';
      _innerLabel.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'font:bold 26px monospace; color:#c8a040;' +
        'text-shadow:0 0 10px rgba(200,150,60,0.5),' +
        '            0 2px 8px rgba(0,0,0,0.9);' +
        'white-space:nowrap; pointer-events:none;' +
        'opacity:0; transition:opacity 0.3s ease 0.15s;';
      _labelLayer.appendChild(_innerLabel);
    }

    // Sub-label — below the box with enough margin to clear 3D projection
    _subLabel = document.getElementById('crate-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'crate-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:60px; text-align:center;' +
        'font:20px monospace; color:rgba(200,170,100,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.8);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.3;';
      _labelLayer.appendChild(_subLabel);
    }

    // ── Action button — visible click target ──────────────────────
    // Gives playtesters an obvious thing to click/tap. Styled as a
    // compact prompt that matches the InteractPrompt aesthetic.
    _actionBtn = document.getElementById('crate-peek-action');
    if (!_actionBtn) {
      _actionBtn = document.createElement('div');
      _actionBtn.id = 'crate-peek-action';
      _actionBtn.style.cssText =
        'position:absolute; top:100%; left:50%;' +
        'transform:translateX(-50%);' +
        'margin-top:130px; min-height:48px;' +
        'font:bold 18px monospace; color:#f0d070;' +
        'text-shadow:0 0 6px rgba(240,208,112,0.3);' +
        'background:rgba(10,8,18,0.88);' +
        'border:1.5px solid rgba(200,180,120,0.55);' +
        'border-radius:10px; padding:12px 28px;' +
        'cursor:pointer; pointer-events:auto;' +
        'opacity:0; transition:opacity 0.3s ease 0.4s;' +
        'white-space:nowrap;' +
        'box-shadow:0 0 12px rgba(240,208,112,0.12);';
      _actionBtn.textContent = 'Smash';
      _actionBtn.addEventListener('click', _onActionClick);
      // Hover feedback
      _actionBtn.addEventListener('mouseenter', function () {
        _actionBtn.style.borderColor = '#f0d070';
        _actionBtn.style.color = '#fff';
        _actionBtn.style.boxShadow = '0 0 18px rgba(240,208,112,0.25)';
      });
      _actionBtn.addEventListener('mouseleave', function () {
        _actionBtn.style.borderColor = 'rgba(200,180,120,0.55)';
        _actionBtn.style.color = '#f0d070';
        _actionBtn.style.boxShadow = '0 0 12px rgba(240,208,112,0.12)';
      });
      _labelLayer.appendChild(_actionBtn);
    }

    // ── Close button ─────────────────────────────────────────────
    _closeBtn = document.getElementById('crate-peek-close');
    if (!_closeBtn) {
      _closeBtn = document.createElement('div');
      _closeBtn.id = 'crate-peek-close';
      _closeBtn.style.cssText =
        'position:absolute; top:100%; left:50%;' +
        'transform:translateX(-50%);' +
        'margin-top:200px; min-height:44px;' +
        'font:16px monospace; color:rgba(200,170,100,0.55);' +
        'background:rgba(10,8,18,0.6);' +
        'border:1px solid rgba(200,180,120,0.25);' +
        'border-radius:6px; padding:10px 20px;' +
        'cursor:pointer; pointer-events:auto;' +
        'opacity:0; transition:opacity 0.3s ease 0.5s;' +
        'white-space:nowrap;';
      _closeBtn.textContent = '\u2715 Close';
      _closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        _hide();
      });
      _closeBtn.addEventListener('mouseenter', function () {
        _closeBtn.style.borderColor = 'rgba(200,180,120,0.55)';
        _closeBtn.style.color       = 'rgba(240,220,160,0.8)';
      });
      _closeBtn.addEventListener('mouseleave', function () {
        _closeBtn.style.borderColor = 'rgba(200,180,120,0.25)';
        _closeBtn.style.color       = 'rgba(200,170,100,0.55)';
      });
      _labelLayer.appendChild(_closeBtn);
    }
  }

  // ── Action button click handler ────────────────────────────────
  // Fires the same interact that the InteractPrompt + OK key would.

  function _onActionClick(e) {
    e.stopPropagation();
    if (!_active) return;

    // Flash feedback
    if (_actionBtn) {
      _actionBtn.style.background = 'rgba(240,220,140,0.3)';
      setTimeout(function () {
        if (_actionBtn) _actionBtn.style.background = 'rgba(10,8,18,0.88)';
      }, 150);
    }

    // Delegate to game.js _interact() via the same path as keyboard OK
    if (typeof Game !== 'undefined' && typeof Game.interact === 'function') {
      Game.interact();
    } else if (typeof InputManager !== 'undefined' &&
               typeof InputManager.simulateOK === 'function') {
      InputManager.simulateOK();
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
    if (tile !== TILES.BREAKABLE) { _hide(); return; }

    // Same tile we were already peeking at — hold steady
    if (_active && _facingTile === tile && _facingX === fx && _facingY === fy) {
      return;
    }

    // Different tile while active — dismiss first, reset debounce
    if (_active && (_facingX !== fx || _facingY !== fy)) {
      _hide();
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
    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-popup', { volume: 0.4 });

    _boxId   = BoxAnim.create('crate', _container, { spin: false });
    _active  = true;
    _opened  = false;
    _timer   = 0;

    // Determine crate type now so labels and button are correct from first frame
    var _cpFloorId = typeof FloorManager !== 'undefined' ? FloorManager.getCurrentFloorId() : '';
    var _cpContainer = (typeof CrateSystem !== 'undefined')
      ? CrateSystem.getContainer(fx, fy, _cpFloorId) : null;
    var isSupply = !!_cpContainer && !_cpContainer.storage;
    var isStorage = !!_cpContainer && !!_cpContainer.storage;

    // Style the box instance (pointer-events off)
    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.setProperty('--box-glow', 'rgba(200,150,60,0.5)');
      inst.style.pointerEvents = 'none';
      // Ensure the 3D scene stacks BELOW the label layer
      inst.style.position = 'relative';
      inst.style.zIndex = '1';
    }

    // Inner label — appears with the box, readable immediately
    var _cpInner = isStorage ? '\uD83D\uDCE6 STORAGE' : (isSupply ? '\u2691 SUPPLY' : '? LOOT ?');
    if (_innerLabel) {
      _innerLabel.textContent = _cpInner;
      _innerLabel.style.opacity = '0';
    }

    // Sub-label — appears after lid opens
    var _cpSub  = isStorage ? 'storage crate' : (isSupply ? 'supply crate' : 'breakable crate');
    var _cpHint = isStorage ? '\u2192 open for supplies'
                : (isSupply ? '\u2192 restock slots' : '\u2192 smash to loot');
    if (_subLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode(_cpSub));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode(_cpHint));
      _subLabel.style.color = 'rgba(200,170,100,0)';
    }

    // Action button hidden until lid opens; label reflects crate type
    var _cpBtn = isStorage ? 'Open' : (isSupply ? 'Fill Crate' : 'Smash');
    if (_actionBtn) {
      _actionBtn.textContent = _cpBtn;
      _actionBtn.style.opacity = '0';
      _actionBtn.style.pointerEvents = 'none';
    }
    if (_closeBtn) { _closeBtn.style.opacity = '0'; _closeBtn.style.pointerEvents = 'none'; }

    _container.style.opacity = '1';

    setTimeout(function () {
      if (_active && _boxId) {
        BoxAnim.open(_boxId);
        _opened = true;
        // Reveal labels after lid slides off
        if (_innerLabel) _innerLabel.style.opacity = '1';
        if (_subLabel) _subLabel.style.color = 'rgba(200,170,100,0.9)';
        if (_actionBtn) {
          _actionBtn.style.opacity = '1';
          _actionBtn.style.pointerEvents = 'auto';
        }
        if (_closeBtn) { _closeBtn.style.opacity = '1'; _closeBtn.style.pointerEvents = 'auto'; }
      }
    }, OPEN_DELAY);
  }

  function _hide() {
    if (!_active) { _timer = 0; return; }
    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-click', { volume: 0.3 });

    if (_opened && _boxId) BoxAnim.close(_boxId);

    _container.style.opacity = '0';
    if (_innerLabel) _innerLabel.style.opacity = '0';
    if (_subLabel) _subLabel.style.color = 'rgba(200,170,100,0)';
    if (_actionBtn) {
      _actionBtn.style.opacity = '0';
      _actionBtn.style.pointerEvents = 'none';
    }
    if (_closeBtn) { _closeBtn.style.opacity = '0'; _closeBtn.style.pointerEvents = 'none'; }

    setTimeout(function () { _destroyBox(); }, 350);

    _active     = false;
    _opened     = false;
    _facingTile = 0;
    _facingX    = -1;
    _facingY    = -1;
    _timer      = 0;
  }

  function _destroyBox() {
    if (_boxId) {
      BoxAnim.destroy(_boxId);
      _boxId = null;
    }
    _active = false;
    _opened = false;
  }

  function handleKey(key) {
    if (!_active) return false;
    if (key === 'Escape') { _hide(); return true; }
    return false;
  }

  function isActive() { return _active; }
  function forceHide() { _hide(); }

  // ── Public API ─────────────────────────────────────────────────

  return {
    init:      init,
    update:    update,
    handleKey: handleKey,
    isActive:  isActive,
    forceHide: forceHide
  };
})();
