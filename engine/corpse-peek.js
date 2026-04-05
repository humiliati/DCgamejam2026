/**
 * CorpsePeek — BoxAnim coffin reveal when facing a corpse tile.
 *
 * Mirrors the CratePeek architecture exactly (same state machine, same
 * hide/show/destroy pattern) to avoid the stacking and button-response
 * regressions that occur when extra state (hiding flag, ScreenManager
 * guard) diverges from the working CratePeek baseline.
 *
 * Gleaner mode (container exists, not sealed):
 *   button → "Restock" → Game.openCorpseMenu() → MenuFaces 'corpse' context
 *
 * Gleaner sealed / scavenger mode:
 *   button → "Harvest" → Game.openCorpseMenu() (falls back to harvest)
 *
 * Layer 3 (after InteractPrompt, BoxAnim)
 * Depends on: BoxAnim, TILES, Player, MovementController, FloorManager,
 *             CorpseRegistry, CrateSystem (optional)
 */
var CorpsePeek = (function () {
  'use strict';

  var MC = MovementController;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY = 400;   // ms before box appears (debounce) — must be > 350ms destroy
  var OPEN_DELAY = 250;   // ms after appear before lid slides off

  // ── State ──────────────────────────────────────────────────────
  var _active     = false;
  var _boxId      = null;
  var _facingTile = 0;
  var _facingX    = -1;
  var _facingY    = -1;
  var _timer      = 0;
  var _opened     = false;
  // Sticky dismiss — Close click latches the currently-faced tile so the
  // peek doesn't re-show while the player is still facing the same corpse.
  // Cleared the moment they turn away or step off.
  var _dismissedX = -1;
  var _dismissedY = -1;
  var _container  = null;
  var _labelLayer = null;
  var _innerLabel = null;
  var _subLabel   = null;
  var _actionBtn  = null;
  var _closeBtn   = null;

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    _container = document.getElementById('corpse-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'corpse-peek-container';
      // NOTE: top:40% (not 50%) — lifts the whole corpse overlay ~10% of
       // viewport height above true-center so the Restock/Harvest action
       // button clears the MouseLook freelook ring hitbox (ViewportRing
       // RING_RADIUS_FRAC 0.315, MouseLook hitbox 0.328). At top:50% the
       // button's margin-top:130px placed it on the ring circumference and
       // hover events fought between the ring and the button DOM.
       _container.style.cssText =
        'position:absolute; top:40%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'z-index:18; pointer-events:none; opacity:0;' +
        'transition:opacity 0.3s ease;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    // ── Label layer (z-index:2) — flat overlay above 3D box ──────
    _labelLayer = document.getElementById('corpse-peek-labels');
    if (!_labelLayer) {
      _labelLayer = document.createElement('div');
      _labelLayer.id = 'corpse-peek-labels';
      _labelLayer.style.cssText =
        'position:absolute; top:0; left:0; width:100%; height:100%;' +
        'z-index:2; pointer-events:none;';
      _container.appendChild(_labelLayer);
    }

    // Inner label (emoji centred over box)
    _innerLabel = document.getElementById('corpse-peek-innerlabel');
    if (!_innerLabel) {
      _innerLabel = document.createElement('div');
      _innerLabel.id = 'corpse-peek-innerlabel';
      _innerLabel.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'font:bold 32px sans-serif; color:#a088c0;' +
        'text-shadow:0 0 12px rgba(140,100,180,0.5);' +
        'white-space:nowrap; pointer-events:none;' +
        'opacity:0; transition:opacity 0.3s ease 0.15s;';
      _labelLayer.appendChild(_innerLabel);
    }

    // Sub-label (below box)
    _subLabel = document.getElementById('corpse-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'corpse-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:60px; text-align:center;' +
        'font:20px monospace; color:rgba(160,140,180,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.8);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.4;';
      _labelLayer.appendChild(_subLabel);
    }

    // Action button — pointer-events starts 'none', enabled after lid opens
    _actionBtn = document.getElementById('corpse-peek-action');
    if (!_actionBtn) {
      _actionBtn = document.createElement('div');
      _actionBtn.id = 'corpse-peek-action';
      _actionBtn.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:130px; padding:12px 28px; min-height:48px;' +
        'font:bold 18px monospace; color:#d0b8e0;' +
        'background:rgba(40,20,50,0.85);' +
        'border:1.5px solid rgba(160,130,190,0.55); border-radius:10px;' +
        'cursor:pointer; pointer-events:none;' +
        'opacity:0; transition:opacity 0.3s ease 0.4s;' +
        'white-space:nowrap;' +
        'box-shadow:0 0 12px rgba(140,100,180,0.12);';
      _actionBtn.textContent = 'Restock';
      _actionBtn.addEventListener('click', _onActionClick);
      _actionBtn.addEventListener('mouseenter', function () {
        _actionBtn.style.borderColor = '#d0b8ff';
        _actionBtn.style.color       = '#fff';
        _actionBtn.style.boxShadow   = '0 0 18px rgba(160,120,200,0.35)';
        _actionBtn.style.background  = 'rgba(60,30,80,0.9)';
      });
      _actionBtn.addEventListener('mouseleave', function () {
        _actionBtn.style.borderColor = 'rgba(160,130,190,0.55)';
        _actionBtn.style.color       = '#d0b8e0';
        _actionBtn.style.boxShadow   = '0 0 12px rgba(140,100,180,0.12)';
        _actionBtn.style.background  = 'rgba(40,20,50,0.85)';
      });
      _labelLayer.appendChild(_actionBtn);
    }

    // Close button
    _closeBtn = document.getElementById('corpse-peek-close');
    if (!_closeBtn) {
      _closeBtn = document.createElement('div');
      _closeBtn.id = 'corpse-peek-close';
      // Close sits ABOVE the 3D box (bottom:100% + margin-bottom) so its
      // hitbox is well above the MouseLook freelook ring band that was
      // fighting the previous below-box placement.
      _closeBtn.style.cssText =
        'position:absolute; bottom:100%; left:50%; transform:translateX(-50%);' +
        'margin-bottom:80px; padding:10px 20px; min-height:44px;' +
        'font:16px monospace; color:rgba(160,140,180,0.55);' +
        'background:rgba(30,20,40,0.6);' +
        'border:1px solid rgba(160,140,180,0.25); border-radius:6px;' +
        'cursor:pointer; pointer-events:none;' +
        'opacity:0; transition:opacity 0.3s ease 0.5s;' +
        'white-space:nowrap;';
      _closeBtn.textContent = '\u2715 Close';
      _closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        // Latch the current tile as dismissed BEFORE _hide() clears
        // _facingX/_facingY, so update() knows not to re-show until the
        // player actually turns away or steps off this corpse.
        _dismissedX = _facingX;
        _dismissedY = _facingY;
        _hide();
      });
      _closeBtn.addEventListener('mouseenter', function () {
        _closeBtn.style.borderColor = 'rgba(160,140,180,0.55)';
        _closeBtn.style.color       = 'rgba(200,180,220,0.8)';
      });
      _closeBtn.addEventListener('mouseleave', function () {
        _closeBtn.style.borderColor = 'rgba(160,140,180,0.25)';
        _closeBtn.style.color       = 'rgba(160,140,180,0.55)';
      });
      _labelLayer.appendChild(_closeBtn);
    }
  }

  // ── Action button handler ──────────────────────────────────────

  function _onActionClick(e) {
    e.stopPropagation();
    if (!_active) return;

    // Flash feedback (same pattern as CratePeek)
    if (_actionBtn) {
      _actionBtn.style.background = 'rgba(160,80,200,0.35)';
      setTimeout(function () {
        if (_actionBtn) _actionBtn.style.background = 'rgba(40,20,50,0.85)';
      }, 150);
    }

    // Open the corpse-restock menu (deposits items + cards, seal flow).
    if (typeof Game !== 'undefined' && Game.openCorpseMenu) {
      Game.openCorpseMenu();
    } else if (typeof Game !== 'undefined' && Game.interact) {
      Game.interact();
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
    if (tile !== TILES.CORPSE) {
      // Player no longer facing any corpse tile — clear the dismiss latch
      // so the next corpse they walk up to can show normally.
      _dismissedX = -1;
      _dismissedY = -1;
      _hide(); return;
    }

    // Must have a registered, non-reanimated corpse at this tile
    if (typeof CorpseRegistry !== 'undefined') {
      var floorId = FloorManager.getCurrentFloorId();
      var corpse  = CorpseRegistry.getCorpseAt(fx, fy, floorId);
      if (!corpse || corpse.reanimated) {
        _dismissedX = -1;
        _dismissedY = -1;
        _hide(); return;
      }
    }

    // Dismiss latch: player closed this exact tile's peek and is still
    // facing it. Don't re-show. As soon as they face a different tile the
    // latch is cleared below.
    if (fx === _dismissedX && fy === _dismissedY) {
      return;
    }
    // Facing a tile other than the dismissed one — clear the latch.
    if (_dismissedX !== -1 && (fx !== _dismissedX || fy !== _dismissedY)) {
      _dismissedX = -1;
      _dismissedY = -1;
    }

    // Same tile already showing — hold steady
    if (_active && _facingTile === tile && _facingX === fx && _facingY === fy) {
      return;
    }

    // Different active tile — dismiss and reset debounce
    if (_active && (_facingX !== fx || _facingY !== fy)) {
      _hide();
    }

    // Facing a different tile than last frame (even if not active) — reset
    // debounce so the box doesn't pop from stale accumulated time.
    if (_facingX !== fx || _facingY !== fy) {
      _timer = 0;
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

    // Safety net: sweep any orphaned BoxAnim children left behind by a
    // previous race (e.g. stale destroy timeout that hit the wrong id).
    // BoxAnim wraps each instance in a <div class="box3d-wrap"> with id
    // "box3d-<n>", so we match both.
    if (_container) {
      var kids = _container.querySelectorAll('.box3d-wrap');
      for (var k = 0; k < kids.length; k++) {
        var kid = kids[k];
        if (typeof BoxAnim !== 'undefined' && BoxAnim.destroy && kid.id) {
          BoxAnim.destroy(kid.id);
        } else if (kid.parentNode) {
          kid.parentNode.removeChild(kid);
        }
      }
    }

    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-popup', { volume: 0.4 });

    _boxId   = BoxAnim.create('chest', _container, { spin: false });
    _active  = true;
    _opened  = false;
    _timer   = 0;

    // Eerie spectral colour scheme
    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.setProperty('--box-glow', 'rgba(140,100,180,0.5)');
      inst.style.setProperty('--box-dark',  '#1a1020');
      inst.style.setProperty('--box-dark2', '#140c1a');
      inst.style.setProperty('--box-light', '#4a3860');
      inst.style.setProperty('--box-floor', '#0a0810');
      inst.style.setProperty('--box-ceil',  '#2a2038');
      inst.style.pointerEvents = 'none';
      inst.style.position      = 'relative';
      inst.style.zIndex        = '1';
    }

    // Resolve corpse details
    var floorId = (typeof FloorManager !== 'undefined') ? FloorManager.getCurrentFloorId() : '';
    var corpse  = null;
    if (typeof CorpseRegistry !== 'undefined') {
      corpse = CorpseRegistry.getCorpseAt(fx, fy, floorId);
    }

    // Decide mode: restock, sealed, or harvest
    var isRestock = false;
    var isSealed  = false;
    if (typeof CrateSystem !== 'undefined' && CrateSystem.hasContainer(fx, fy, floorId)) {
      var container = CrateSystem.getContainer(fx, fy, floorId);
      if (container && !container.sealed) { isRestock = true; }
      else if (container && container.sealed) { isSealed = true; }
    }

    var displayEmoji = corpse
      ? (typeof CorpseRegistry !== 'undefined'
          ? CorpseRegistry.getDisplayEmoji(fx, fy, floorId)
          : '\uD83D\uDC80')
      : '\uD83D\uDC80';

    var line1  = corpse ? corpse.enemyName : 'fallen creature';
    var line2  = isRestock ? '\u2192 restock to reanimate'
               : isSealed  ? '\u2192 sealed \u2714'
               :              '\u2192 harvest for parts';

    var btnLabel = isRestock ? 'Restock' : 'Harvest';

    // Inner label
    if (_innerLabel) {
      _innerLabel.textContent = displayEmoji;
      _innerLabel.style.opacity = '0';
    }

    // Sub-label
    if (_subLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode(line1));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode(line2));
      _subLabel.style.color = 'rgba(160,140,180,0)';
    }

    // Action button — hidden and non-interactive until lid opens
    if (_actionBtn) {
      _actionBtn.textContent     = btnLabel;
      _actionBtn.style.opacity   = '0';
      _actionBtn.style.pointerEvents = 'none';
    }
    if (_closeBtn) {
      _closeBtn.style.opacity    = '0';
      _closeBtn.style.pointerEvents = 'none';
    }

    _container.style.opacity = '1';

    // Reveal after lid opens
    setTimeout(function () {
      if (_active && _boxId) {
        BoxAnim.open(_boxId);
        _opened = true;
        if (_innerLabel) _innerLabel.style.opacity = '1';
        if (_subLabel)   _subLabel.style.color = 'rgba(160,140,180,0.9)';
        if (_actionBtn) {
          _actionBtn.style.opacity      = '1';
          _actionBtn.style.pointerEvents = 'auto';
        }
        if (_closeBtn) {
          _closeBtn.style.opacity      = '1';
          _closeBtn.style.pointerEvents = 'auto';
        }
      }
    }, OPEN_DELAY);
  }

  function _hide() {
    if (!_active) { _timer = 0; return; }
    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-click', { volume: 0.3 });

    if (_opened && _boxId) BoxAnim.close(_boxId);

    _container.style.opacity = '0';
    if (_innerLabel) _innerLabel.style.opacity = '0';
    if (_subLabel)   _subLabel.style.color = 'rgba(160,140,180,0)';
    if (_actionBtn) {
      _actionBtn.style.opacity      = '0';
      _actionBtn.style.pointerEvents = 'none';
    }
    if (_closeBtn) {
      _closeBtn.style.opacity      = '0';
      _closeBtn.style.pointerEvents = 'none';
    }

    // Capture the specific box id in the closure so a stale timeout cannot
    // destroy a box created by a later _show() call. Null out _boxId here
    // so _show() starts fresh and _destroyBox() can't double-destroy.
    var toDestroy = _boxId;
    _boxId = null;
    setTimeout(function () {
      if (toDestroy && typeof BoxAnim !== 'undefined') {
        BoxAnim.destroy(toDestroy);
      }
    }, 350);

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

  // ── Public API ─────────────────────────────────────────────────

  function handleKey(key) {
    if (!_active) return false;
    if (key === 'Escape') { _hide(); return true; }
    return false;
  }

  /** Whether the peek box is currently visible. */
  function isActive() { return _active; }

  /** Force-hide immediately — called by _openCorpseMenu before opening menu. */
  function forceHide() { _hide(); }

  /**
   * Return the tile coordinates of the corpse being peeked at.
   * Used by Game.openCorpseMenu() to know which container to open.
   */
  function getTarget() {
    if (!_active) return null;
    var floorId = (typeof FloorManager !== 'undefined') ? FloorManager.getCurrentFloorId() : '';
    return { x: _facingX, y: _facingY, floorId: floorId };
  }

  return {
    init:      init,
    update:    update,
    handleKey: handleKey,
    isActive:  isActive,
    forceHide: forceHide,
    getTarget: getTarget
  };
})();
