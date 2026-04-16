/**
 * ClickyMinigame — generic tile-targeted tap minigame (Tier 1 clicky).
 *
 * Shares shape with BarCounterPeek but parameterized across multiple
 * tile types via a recipe registry. Each registered recipe defines:
 *   - tileId            : TILES.* constant the recipe binds to
 *   - walkable          : false → targets the facing-tile (WELL/ANVIL/
 *                          SOUP_KITCHEN/BARREL). true → targets the tile
 *                          the player is standing on (FUNGAL_PATCH).
 *   - menu              : default drink/action menu array or
 *                          biomeMenus object keyed by floorData.biome.
 *   - maxTaps           : taps per visit before the tile depletes
 *                          (phase P2 → P3).
 *   - onTap(ctx)        : fires once per successful tap. Receives
 *                          { x, y, item, floorData, tapsRemaining }.
 *   - format(ctx)       : billboard text while tile is active (P2).
 *   - formatEmpty(ctx)  : billboard text when tile is depleted (P3).
 *   - peek              : true → show billboard on approach. false → only
 *                          react to explicit interact from Game._interact.
 *   - showDelay         : ms debounce before billboard appears (default 300).
 *
 * Per-tile phase state:
 *   P1 idle           — no player contact, no billboard
 *   P2 active/tap     — player adjacent/standing, taps remaining
 *   P3 depleted       — maxTaps consumed, billboard shows "empty"
 *   P4 reset          — floor re-enter clears tap counters back to P1
 *
 * Tap counts are keyed by "floorId|x,y" so sibling floors don't leak
 * state and a player leaving and returning the same floor gets a full
 * reset (parity with BarCounterPeek's floor-change reset behaviour).
 *
 * Layer 3 — depends on: TILES, Player, MovementController, FloorManager,
 *           Toast, AudioSystem, HUD (optional)
 */
var ClickyMinigame = (function () {
  'use strict';

  var MC = typeof MovementController !== 'undefined' ? MovementController : null;

  // ── Config defaults ─────────────────────────────────────────────
  var DEFAULT_SHOW_DELAY = 300;
  var HIDE_DELAY         = 200;

  // ── Recipe registry ─────────────────────────────────────────────

  // tileId → recipe (see header)
  var _recipes = {};

  function registerRecipe(tileId, recipe) {
    if (tileId === undefined || tileId === null) {
      console.warn('[ClickyMinigame] registerRecipe: missing tileId');
      return;
    }
    _recipes[tileId] = recipe;
  }

  function _getRecipe(tileId) {
    return _recipes[tileId] || null;
  }

  function _resolveMenu(recipe, floorData) {
    if (recipe.biomeMenus) {
      var biome = (floorData && floorData.biome) || 'default';
      return recipe.biomeMenus[biome] || recipe.biomeMenus['default'] || recipe.menu || [];
    }
    return recipe.menu || [];
  }

  function _pickItem(recipe, x, y, floorData) {
    var menu = _resolveMenu(recipe, floorData);
    if (!menu || !menu.length) return null;
    var idx = ((x * 7 + y * 13) & 0x7fffffff) % menu.length;
    return menu[idx];
  }

  // ── Per-tile tap state ──────────────────────────────────────────

  var _tapCounts = {};         // "floorId|x,y" → taps remaining
  var _currentFloorId = null;

  function _key(floorId, x, y) { return floorId + '|' + x + ',' + y; }

  function _getTaps(recipe, floorId, x, y) {
    var k = _key(floorId, x, y);
    if (_tapCounts[k] === undefined) _tapCounts[k] = recipe.maxTaps || 3;
    return _tapCounts[k];
  }

  function _consumeTap(recipe, floorId, x, y) {
    var k = _key(floorId, x, y);
    if (_tapCounts[k] === undefined) _tapCounts[k] = recipe.maxTaps || 3;
    if (_tapCounts[k] > 0) { _tapCounts[k]--; return true; }
    return false;
  }

  function _maybeResetFloor(floorId) {
    if (floorId !== _currentFloorId) {
      _tapCounts = {};
      _currentFloorId = floorId;
    }
  }

  // ── Billboard (peek) ────────────────────────────────────────────

  var _active    = false;
  var _timer     = 0;
  var _hideTimer = 0;
  var _targetX   = -1;
  var _targetY   = -1;
  var _targetTile = -1;
  var _currentItem = null;

  function _show(tileId, x, y, floorData) {
    var recipe = _getRecipe(tileId);
    if (!recipe || recipe.peek === false) return;
    if (_active && x === _targetX && y === _targetY) return;

    var item = _pickItem(recipe, x, y, floorData);
    if (!item) return;

    _currentItem   = item;
    _targetTile    = tileId;
    _targetX       = x;
    _targetY       = y;
    _active        = true;
    _hideTimer     = 0;

    _renderBillboard(recipe, floorData);
  }

  function _hide() {
    if (!_active) return;
    _active = false;
    _currentItem = null;
    _targetX = -1;
    _targetY = -1;
    _targetTile = -1;
  }

  function _renderBillboard(recipe, floorData) {
    if (!_currentItem || typeof Toast === 'undefined') return;
    var floorId = _currentFloorId;
    var taps = _getTaps(recipe, floorId, _targetX, _targetY);
    var ctx = {
      item: _currentItem,
      tapsRemaining: taps,
      maxTaps: recipe.maxTaps || 3,
      x: _targetX, y: _targetY,
      floorData: floorData
    };

    if (taps > 0) {
      var msg = recipe.format
        ? recipe.format(ctx)
        : (_currentItem.emoji || '•') + ' ' + (_currentItem.name || 'Use') +
          ' (' + taps + '/' + ctx.maxTaps + ') — tap to use';
      Toast.show(msg, 'info');
    } else {
      var emptyMsg = recipe.formatEmpty
        ? recipe.formatEmpty(ctx)
        : (_currentItem.emoji || '•') + ' Depleted — come back next visit.';
      Toast.show(emptyMsg, 'warning');
    }
  }

  // ── Interact (called from Game._interact) ───────────────────────

  /**
   * Attempt to tap the minigame at (x,y) of given tileId. Returns true
   * on successful tap, false on empty / no recipe.
   */
  function tryTap(tileId, x, y, floorData) {
    var recipe = _getRecipe(tileId);
    if (!recipe) return false;

    var floorId = (typeof FloorManager !== 'undefined' && FloorManager.getFloor)
      ? FloorManager.getFloor() : '';
    _maybeResetFloor(floorId);

    var item = _pickItem(recipe, x, y, floorData);
    if (!item) return false;

    if (!_consumeTap(recipe, floorId, x, y)) {
      if (typeof Toast !== 'undefined') {
        var emptyCtx = { item: item, tapsRemaining: 0, maxTaps: recipe.maxTaps || 3,
                         x: x, y: y, floorData: floorData };
        var emsg = recipe.formatEmpty
          ? recipe.formatEmpty(emptyCtx)
          : (item.emoji || '•') + ' Depleted — come back next visit.';
        Toast.show(emsg, 'warning');
      }
      if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-blop');
      return false;
    }

    // Apply recipe's tap callback
    var tapsAfter = _getTaps(recipe, floorId, x, y);
    if (typeof recipe.onTap === 'function') {
      recipe.onTap({
        x: x, y: y,
        item: item,
        floorData: floorData,
        tapsRemaining: tapsAfter,
        maxTaps: recipe.maxTaps || 3
      });
    }

    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play(recipe.sound || 'pickup-success');
    }

    // Update billboard if we're peeking this tile
    if (_active && _targetX === x && _targetY === y) {
      _renderBillboard(recipe, floorData);
    }
    return true;
  }

  // ── Update (per-frame peek logic) ───────────────────────────────

  function update(dt) {
    if (!MC || typeof FloorManager === 'undefined' || typeof Player === 'undefined') return;

    var floorData = FloorManager.getFloorData && FloorManager.getFloorData();
    if (!floorData) { if (_active) _hide(); return; }

    var floorId = FloorManager.getFloor ? FloorManager.getFloor() : '';
    _maybeResetFloor(floorId);

    var p = Player.getPos();
    var dir = Player.getDir();

    // ── Standing-tile branch (walkable recipes like FUNGAL_PATCH) ──
    var standTile = _safeTile(floorData, p.x, p.y);
    var standRecipe = _getRecipe(standTile);
    if (standRecipe && standRecipe.walkable) {
      _handlePeek(standTile, p.x, p.y, standRecipe, floorData, dt);
      return;
    }

    // ── Facing-tile branch (WELL / ANVIL / SOUP_KITCHEN / BARREL) ──
    var fx = p.x + MC.DX[dir];
    var fy = p.y + MC.DY[dir];
    var faceTile = _safeTile(floorData, fx, fy);
    var faceRecipe = _getRecipe(faceTile);
    if (faceRecipe && !faceRecipe.walkable) {
      _handlePeek(faceTile, fx, fy, faceRecipe, floorData, dt);
      return;
    }

    // Nothing in scope — drain hide timer
    _timer = 0;
    if (_active) {
      _hideTimer += dt;
      if (_hideTimer >= HIDE_DELAY) _hide();
    }
  }

  function _safeTile(floorData, x, y) {
    if (!floorData || !floorData.grid) return -1;
    if (x < 0 || y < 0 || x >= floorData.gridW || y >= floorData.gridH) return -1;
    var row = floorData.grid[y];
    if (!row) return -1;
    return row[x];
  }

  function _handlePeek(tileId, x, y, recipe, floorData, dt) {
    if (recipe.peek === false) return;
    _hideTimer = 0;
    if (_active && x === _targetX && y === _targetY && tileId === _targetTile) return;
    _timer += dt;
    var delay = recipe.showDelay || DEFAULT_SHOW_DELAY;
    if (_timer >= delay) {
      _show(tileId, x, y, floorData);
      _timer = 0;
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    init: function () {
      console.log('[ClickyMinigame] Initialised');
    },
    update: update,
    tryTap: tryTap,
    registerRecipe: registerRecipe,
    getRecipe: _getRecipe,
    hasRecipe: function (tileId) { return !!_recipes[tileId]; },
    isActive: function () { return _active; },
    getTarget: function () {
      if (!_active) return null;
      return { x: _targetX, y: _targetY, tile: _targetTile, item: _currentItem };
    },
    resetTaps: function () { _tapCounts = {}; },
    forceHide: function () { _hide(); }
  };
})();
