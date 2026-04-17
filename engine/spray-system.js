/**
 * SpraySystem — continuous hose-spray cleaning interaction (PW-3).
 *
 * When the player holds the interact button while carrying the hose
 * (HoseState.isActive()) and facing a tile that has a GrimeGrid, the
 * spray system fires a cleaning tick every TICK_MS milliseconds.
 *
 * Each tick:
 *   1. Resolves the aimed tile (Player facing direction + 1 tile)
 *   2. Looks up the GrimeGrid for that tile
 *   3. Computes a sweep center that oscillates across the grid over time
 *   4. Applies the active brush kernel (base, fan, or cyclone) centered
 *      on the sweep point, scaled by HoseState.getPressureMult()
 *   5. Calls TorchHitResolver.onHoseHit() for collateral torch damage
 *   6. Plays spray SFX + WaterCursorFX bursts for juice
 *
 * The spray system does NOT replace the existing CleaningSystem.scrub()
 * interaction — that's the non-hose (rag/mop) path. SpraySystem only
 * activates when the hose is attached.
 *
 * Brush types (selected by equipped nozzle item, PW-5 wires equip slot):
 *   - 'base'    : circular 3×3 kernel (default, no nozzle)
 *   - 'fan'     : wide horizontal 1×5 kernel, +40% floor efficiency
 *   - 'cyclone' : oscillating offset, reveals hidden grime, -20% wall eff
 *
 * The non-hose interact path (CleaningSystem.scrub) is unmodified — the
 * existing game.js interact handler already checks CleaningSystem.isDirty
 * and scrubs per-tile. SpraySystem is an additive layer on top.
 *
 * Layer 3 — depends on: TILES, Player, MovementController, FloorManager,
 *           HoseState, GrimeGrid, InputManager,
 *           TorchHitResolver (soft), WaterCursorFX (soft),
 *           AudioSystem (soft), Toast (soft), SessionStats (soft), i18n (soft)
 */
var SpraySystem = (function () {
  'use strict';

  // ── Timing ──────────────────────────────────────────────────────
  var TICK_MS = 100;         // cleaning tick interval while spraying
  // Droplet burst cadence. 300ms was sparse — at 60fps that's one burst
  // every 18 frames and the beam looks "blinky". 80ms guarantees at least
  // one emission per cleaning tick (TICK_MS=100) and reads as a continuous
  // curtain of water deflection while still staying under the pool cap.
  var FX_BURST_MS = 80;      // water burst FX interval (visual juice)

  // ── Base cleaning strength ──────────────────────────────────────
  // Per tick, center of brush kernel subtracts this much grime (0–255).
  // With linear falloff, edge cells get roughly half.
  var BASE_STRENGTH = 42;    // ~6 ticks to fully clean center subcell (255/42≈6)

  // ── Sweep oscillation (fallback for d-pad-only play) ────────────
  // When no pointer is active the spray center sweeps in a Lissajous
  // pattern so d-pad players can still clean walls. When the Magic
  // Remote / mouse IS active, pointer-aim overrides this entirely.
  var SWEEP_FREQ_X = 0.9;    // Hz — horizontal sweep frequency
  var SWEEP_FREQ_Y = 1.3;    // Hz — vertical (slightly faster → covers area)

  // ── Nozzle efficiency multipliers ──────────────────────────────
  // Default stats per nozzle family. Data-driven items override these
  // via spray_modifier effects in items.json — _resolveNozzle() merges
  // item params on top of these defaults so every rarity tier works
  // without code changes.
  var NOZZLE_STATS = {
    base:    { wallEff: 1.0, floorEff: 1.0, radius: 1, shape: 'circle'  },
    cone:    { wallEff: 0.9, floorEff: 1.2, radius: 2, shape: 'ring'    },
    beam:    { wallEff: 1.5, floorEff: 0.7, radius: 0, shape: 'point'   },
    fan:     { wallEff: 1.0, floorEff: 1.4, radius: 2, shape: 'hline'   },
    cyclone: { wallEff: 0.8, floorEff: 1.0, radius: 1, shape: 'spiral'  }
  };

  // ── Pointer-aim state (squeegee stroke tracking) ────────────────
  // When pointer is active, we track the previous subcell so we can
  // interpolate a continuous stroke between ticks. This is what makes
  // fast sweeps lighter (fewer ticks per subcell) and slow sweeps
  // heavier (more ticks per subcell) — the MS Paint eraser feel.
  var _prevAim = null;       // { tileX, tileY, subX, subY } or null
  var _pointerWasActive = false;

  // Wall brush radius at 64×64 resolution.
  // radius 4 → 9-subcell diameter → ~56px stripe on close wall.
  // radius 3 → 7-subcell → ~44px. Good squeegee width.
  var WALL_BRUSH_RADIUS  = 4;
  var FLOOR_BRUSH_RADIUS = 1;  // floors stay coarse (4×4 grid)

  // ── State ──────────────────────────────────────────────────────
  var _active = false;       // true while player is holding spray
  var _sprayTime = 0;        // accumulated spray time (ms) for sweep phase
  var _lastTickTime = 0;     // timestamp of last cleaning tick
  var _lastFxTime = 0;       // timestamp of last burst FX
  var _lastToastTime = 0;    // throttle "tile cleaned!" toasts
  var _sfxPlaying = false;   // spray loop SFX state
  var _nozzleType = 'base';  // currently equipped nozzle

  // DOC-107 Phase 5 — fan-out hook called when a tile's cleanliness crosses
  // 1.0 (fully cleaned). Wired at Game.init to PickupActions.onMinigameExit
  // so quest predicates of kind:'minigame' / kindId:'pressure_wash' can
  // advance on each washed tile. Signature:
  //   onSubTargetComplete(subTargetId, floorId, tileX, tileY)
  // Left as a settable module-level slot (rather than exported property)
  // because Object.freeze'd exports cannot be mutated post-init.
  var _onSubTargetComplete = null;

  // Screen-space aim tracking for beam-hit droplet FX (Rung 1).
  // Independent from _prevAim (which is subcell-space, used for stroke
  // interpolation) — this tracks pixel position for velocity-driven
  // spray emission so fast pointer sweeps fling more water.
  var _lastScreenX = -9999;
  var _lastScreenY = -9999;

  // ── Helpers ────────────────────────────────────────────────────

  var MC = (typeof MovementController !== 'undefined') ? MovementController : null;

  function _facedTile() {
    if (typeof Player === 'undefined' || !MC) return null;
    var p   = Player.getPos();
    var dir = Player.getDir();
    return { x: p.x + MC.DX[dir], y: p.y + MC.DY[dir] };
  }

  function _floorId() {
    if (typeof FloorManager !== 'undefined') return FloorManager.getCurrentFloorId();
    return null;
  }

  function _floorData() {
    if (typeof FloorManager !== 'undefined') return FloorManager.getFloorData();
    return null;
  }

  function _tileAt(x, y) {
    var fd = _floorData();
    if (!fd || !fd.grid || !fd.grid[y]) return -1;
    return fd.grid[y][x];
  }

  function _isWall(tile) {
    if (typeof TILES === 'undefined') return false;
    return !TILES.isWalkable(tile) && tile !== TILES.DUMP_TRUCK;
  }

  // ── Nozzle resolution ──────────────────────────────────────────

  /** Subtype string → NOZZLE_STATS key mapping. */
  var _SUBTYPE_MAP = {
    nozzle_cone:    'cone',
    nozzle_beam:    'beam',
    nozzle_fan:     'fan',
    nozzle_cyclone: 'cyclone'
  };

  /**
   * Cached item-level overrides merged on top of NOZZLE_STATS defaults.
   * Reset each time the equipped nozzle changes (set in _resolveNozzle).
   * Systems that need per-tick spray_modifier params read _itemOverrides
   * instead of re-parsing effects every frame.
   */
  var _itemOverrides = null;

  /**
   * Read the equipped nozzle from CardAuthority. Returns 'base' if none.
   *
   * When a nozzle item is found, its effects[] array is scanned for
   * spray_modifier entries. Any params found are merged into a shallow
   * copy of the family's NOZZLE_STATS default and cached in _itemOverrides.
   * This lets rarity tiers tune wallEff, floorEff, radius, scroll_range,
   * gyro sensitivity, and signature perks purely through items.json data.
   */
  function _resolveNozzle() {
    _itemOverrides = null;

    if (typeof CardAuthority === 'undefined' || !CardAuthority.getEquipped) return 'base';
    var equipped = CardAuthority.getEquipped();
    if (!equipped) return 'base';

    for (var i = 0; i < equipped.length; i++) {
      var item = equipped[i];
      if (!item || !item.subtype) continue;

      var family = _SUBTYPE_MAP[item.subtype];
      if (!family) continue;

      // Start with a shallow copy of the family default
      var base = NOZZLE_STATS[family] || NOZZLE_STATS.base;
      var merged = {};
      for (var k in base) {
        if (base.hasOwnProperty(k)) merged[k] = base[k];
      }

      // Merge spray_modifier params from item effects
      if (item.effects) {
        for (var e = 0; e < item.effects.length; e++) {
          var eff = item.effects[e];
          if (eff && eff.type === 'spray_modifier' && eff.params) {
            for (var pk in eff.params) {
              if (eff.params.hasOwnProperty(pk)) {
                merged[pk] = eff.params[pk];
              }
            }
          }
        }
      }

      _itemOverrides = merged;
      return family;
    }
    return 'base';
  }

  /**
   * Get the resolved nozzle stats for the current equipped nozzle.
   * Returns item-level overrides if available, else the family default.
   * External systems (future gyro handler, HUD) can call this to read
   * data-driven params like scroll_range, gyro_yaw_effect, etc.
   */
  function getResolvedNozzleStats() {
    var family = NOZZLE_STATS[_nozzleType] || NOZZLE_STATS.base;
    return _itemOverrides || family;
  }

  // ── Sweep center computation ───────────────────────────────────

  /**
   * Compute the sweep center for a grime grid based on elapsed spray time.
   * Returns { subX, subY } in grid coordinates (0..res-1).
   *
   * The center follows a Lissajous figure that covers the full grid area
   * over ~2-3 seconds, ensuring even coverage without manual aiming.
   * If a pointer is active (Magic Remote / mouse), it overrides the sweep
   * with direct aim on the faced wall.
   */
  /**
   * Resolve the aimed subcell on the faced wall.
   *
   * Priority:
   *   1. Pointer-aim (Magic Remote / mouse) — uses Raycaster.castScreenRay
   *      to map screen cursor to wall UV → subcell. This IS the squeegee.
   *   2. Lissajous fallback — auto-sweep for d-pad-only play.
   *
   * Returns { subX, subY, tileX, tileY, pointerHit } or Lissajous result.
   */
  function _sweepCenter(res, elapsedSec) {
    // ── Pointer-aim path ──
    if (typeof InputManager !== 'undefined' && InputManager.getPointer) {
      var ptr = InputManager.getPointer();
      if (ptr && ptr.active && typeof Raycaster !== 'undefined' && Raycaster.castScreenRay) {
        var fd = _floorData();
        if (fd && fd.grid) {
          var hit = Raycaster.castScreenRay(ptr.x, ptr.y, fd.grid, fd.gridW, fd.gridH);
          if (hit && hit.grimeRes > 0) {
            return {
              subX: hit.subX,
              subY: hit.subY,
              tileX: hit.tileX,
              tileY: hit.tileY,
              pointerHit: true
            };
          }
        }
      }
    }

    // ── Lissajous fallback (d-pad play, or pointer not on a grimy wall) ──
    var nx = (Math.sin(elapsedSec * SWEEP_FREQ_X * Math.PI * 2) + 1) * 0.5;
    var ny = (Math.sin(elapsedSec * SWEEP_FREQ_Y * Math.PI * 2 + Math.PI * 0.25) + 1) * 0.5;
    var subX = Math.floor(nx * res);
    var subY = Math.floor(ny * res);
    if (subX >= res) subX = res - 1;
    if (subY >= res) subY = res - 1;
    return { subX: subX, subY: subY, pointerHit: false };
  }

  // ── Cyclone nozzle offset ──────────────────────────────────────
  // The cyclone nozzle applies an additional time-varying offset to the
  // sweep center, creating a spiral pattern that catches irregular grime.

  var CYCLONE_FREQ = 3.7;    // Hz — fast oscillation
  var CYCLONE_AMP  = 2;      // subcell amplitude

  function _cycloneOffset(elapsedSec) {
    var ox = Math.round(Math.sin(elapsedSec * CYCLONE_FREQ * Math.PI * 2) * CYCLONE_AMP);
    var oy = Math.round(Math.cos(elapsedSec * CYCLONE_FREQ * Math.PI * 2) * CYCLONE_AMP);
    return { dx: ox, dy: oy };
  }

  // ── Brush application ──────────────────────────────────────────

  /**
   * Apply the brush kernel to a grime grid at the aimed subcell.
   *
   * @param {string} fId   — floor id
   * @param {number} tx    — tile X
   * @param {number} ty    — tile Y
   * @param {Object} grid  — { data: Uint8Array, res: number }
   * @param {number} subX  — center subcell X
   * @param {number} subY  — center subcell Y
   * @param {number} strength — per-subcell cleaning power
   * @param {Object} nozzle — NOZZLE_STATS entry
   * @param {number} elapsedSec — for cyclone offset
   * @returns {number} total grime removed this tick
   */
  function _applyBrush(fId, tx, ty, grid, subX, subY, strength, nozzle, elapsedSec) {
    var res = grid.res;
    var removed = 0;

    // Cyclone: shift the aim center
    if (nozzle.shape === 'spiral') {
      var co = _cycloneOffset(elapsedSec);
      subX = Math.max(0, Math.min(res - 1, subX + co.dx));
      subY = Math.max(0, Math.min(res - 1, subY + co.dy));
    }

    var radius = nozzle.radius;

    if (nozzle.shape === 'point') {
      // Beam nozzle: single-subcell point (radius 0), full strength centre.
      // Higher rarities widen via scatter (radius > 0), but the core hit
      // is always concentrated — high wall damage, poor floor coverage.
      var pr = radius || 0;
      for (var pdy = -pr; pdy <= pr; pdy++) {
        var psy = subY + pdy;
        if (psy < 0 || psy >= res) continue;
        for (var pdx = -pr; pdx <= pr; pdx++) {
          var psx = subX + pdx;
          if (psx < 0 || psx >= res) continue;
          var pdist = Math.abs(pdx) + Math.abs(pdy); // Manhattan for tight cluster
          var pFall = 1.0 - (pdist / (pr + 1.5));    // sharper falloff than circle
          var pAmt  = (strength * Math.max(0, pFall)) | 0;
          if (pAmt < 1) continue;
          var pidx = psy * res + psx;
          var pBefore = grid.data[pidx];
          grid.data[pidx] = Math.max(0, pBefore - pAmt);
          removed += pBefore - grid.data[pidx];
        }
      }
    } else if (nozzle.shape === 'ring') {
      // Cone nozzle: hollow ring brush. Cleans the perimeter of a circle,
      // leaving the centre lighter. Ring width is ~1 subcell; outer radius
      // is nozzle.radius. Good floor coverage, slightly weaker on walls
      // because the impact is spread around the ring.
      var inner = Math.max(0, radius - 1);
      for (var rdy = -radius; rdy <= radius; rdy++) {
        var rsy = subY + rdy;
        if (rsy < 0 || rsy >= res) continue;
        for (var rdx = -radius; rdx <= radius; rdx++) {
          var rsx = subX + rdx;
          if (rsx < 0 || rsx >= res) continue;
          var rDist = Math.sqrt(rdx * rdx + rdy * rdy);
          // Only clean cells on the ring band (between inner and outer radius)
          if (rDist < inner || rDist > radius + 0.5) continue;
          var rFall = 1.0 - Math.abs(rDist - radius) / 1.5;
          var rAmt  = (strength * Math.max(0, rFall)) | 0;
          if (rAmt < 1) continue;
          var ridx = rsy * res + rsx;
          var rBefore = grid.data[ridx];
          grid.data[ridx] = Math.max(0, rBefore - rAmt);
          removed += rBefore - grid.data[ridx];
        }
      }
    } else if (nozzle.shape === 'hline') {
      // Fan nozzle: wide horizontal line, 1 row tall
      for (var dx = -radius; dx <= radius; dx++) {
        var sx = subX + dx;
        if (sx < 0 || sx >= res) continue;
        var dist = Math.abs(dx);
        var falloff = 1.0 - (dist / (radius + 1));
        var amount = (strength * falloff) | 0;
        if (amount < 1) continue;
        var idx = subY * res + sx;
        var before = grid.data[idx];
        grid.data[idx] = Math.max(0, before - amount);
        removed += before - grid.data[idx];
      }
    } else {
      // Circle (base) or spiral (cyclone, after offset applied above)
      for (var dy = -radius; dy <= radius; dy++) {
        var sy = subY + dy;
        if (sy < 0 || sy >= res) continue;
        for (var dx2 = -radius; dx2 <= radius; dx2++) {
          var sx2 = subX + dx2;
          if (sx2 < 0 || sx2 >= res) continue;
          var cheb = Math.max(Math.abs(dx2), Math.abs(dy));
          var falloff2 = 1.0 - (cheb / (radius + 1));
          var amount2 = (strength * falloff2) | 0;
          if (amount2 < 1) continue;
          var idx2 = sy * res + sx2;
          var before2 = grid.data[idx2];
          grid.data[idx2] = Math.max(0, before2 - amount2);
          removed += before2 - grid.data[idx2];
        }
      }
    }

    return removed;
  }

  // ── SFX management ─────────────────────────────────────────────

  // TODO:SFX spray-loop — continuous pressurised water hiss, seamless loop,
  // 1-2s source clip, volume 0.30-0.40. Two layers: (a) white-noise-based
  // high-pressure air, (b) lower-frequency water splatter rumble. Nozzle
  // type should pitch-shift: fan +2 semitones (wider spread = higher),
  // cyclone modulate ±1 semitone at CYCLONE_FREQ Hz for warble feel.
  function _startSpraySfx() {
    if (_sfxPlaying) return;
    _sfxPlaying = true;
    if (typeof AudioSystem !== 'undefined' && AudioSystem.loop) {
      AudioSystem.loop('spray-loop', { volume: 0.35 });
    } else if (typeof AudioSystem !== 'undefined' && AudioSystem.play) {
      AudioSystem.play('spray-loop', { volume: 0.35, loop: true });
    }
  }

  // TODO:SFX spray-stop — short depressurisation puff + water dribble tail,
  // 150-300ms one-shot, volume 0.25-0.35. Plays on top of spray-loop fadeout
  // (50ms linear ramp to 0). The dribble tail sells "nozzle released."
  function _stopSpraySfx() {
    if (!_sfxPlaying) return;
    _sfxPlaying = false;
    if (typeof AudioSystem !== 'undefined' && AudioSystem.stop) {
      AudioSystem.stop('spray-loop');
    }
  }

  // TODO:SFX spray-burst — short water splash impact, 80-150ms one-shot,
  // volume 0.20-0.30. Randomise from 3-4 variants to avoid repetition at
  // 300ms FX_BURST_MS interval. Wall hits: brighter / more reverb (hard
  // surface reflection). Floor hits: duller / wetter thud.
  //
  // Rung 1 (visual): beam-hit droplet FX at pointer-screen location.
  // Delegates to SprayDropletsFX which handles pooled physics + render.
  // We pass stroke velocity (screen-pixel delta since last burst) so the
  // droplet count and spread direction reflect how fast the player is
  // sweeping — static aim emits a gentle fan, fast sweeps fling a curtain.
  //
  // Tile args (tx, ty) are retained for the callsite contract but are no
  // longer the spawn coordinates — the pointer is the source of truth for
  // where the beam is actually impacting on screen.
  function _burstFx(tx, ty, isWall) {
    var sx = null, sy = null, vx = 0, vy = 0;

    if (typeof InputManager !== 'undefined' && InputManager.getPointer) {
      var ptr = InputManager.getPointer();
      if (ptr && ptr.active) {
        sx = ptr.x;
        sy = ptr.y;
        if (_lastScreenX > -9000) {
          vx = sx - _lastScreenX;
          vy = sy - _lastScreenY;
        }
        _lastScreenX = sx;
        _lastScreenY = sy;
      } else {
        _lastScreenX = -9999;
      }
    }

    if (sx != null && typeof SprayDropletsFX !== 'undefined' && SprayDropletsFX.spawn) {
      SprayDropletsFX.spawn(sx, sy, {
        strokeVx: vx,
        strokeVy: vy,
        surface:  isWall ? 'wall' : 'floor'
      });
    }
  }

  function _stat(key, delta) {
    if (typeof SessionStats !== 'undefined' && SessionStats.inc) {
      SessionStats.inc(key, delta || 1);
    }
  }

  // ── Stroke interpolation ────────────────────────────────────────
  // When the pointer moves between ticks, we Bresenham-interpolate
  // between _prevAim and the current aim so every subcell the cursor
  // crossed gets a brush hit. This gives continuous strokes and makes
  // fast sweeps naturally lighter (strength spread across more points).

  /**
   * Apply the brush at every subcell along the Bresenham line from
   * (x0,y0) to (x1,y1) on a single tile's grime grid.
   * Returns total grime removed.
   */
  function _strokeLine(fId, tx, ty, grid, x0, y0, x1, y1, strength, radius) {
    var removed = 0;
    var dx = Math.abs(x1 - x0);
    var dy = Math.abs(y1 - y0);
    var sx = (x0 < x1) ? 1 : -1;
    var sy = (y0 < y1) ? 1 : -1;
    var err = dx - dy;
    var steps = 0;
    var maxSteps = dx + dy + 1; // safety bound

    // Distribute strength across stroke length for velocity feel:
    // more subcells traversed → less cleaning per point → need more passes
    var strokeLen = Math.max(1, maxSteps);
    var perPoint = Math.max(1, Math.round(strength / Math.max(1, strokeLen / 3)));

    while (steps < maxSteps) {
      // Apply hard-edge kernel at this point
      if (typeof GrimeGrid !== 'undefined' && GrimeGrid.cleanKernelHard) {
        var res = grid.res;
        var r2 = radius * radius;
        for (var bdy = -radius; bdy <= radius; bdy++) {
          var sy2 = y0 + bdy;
          if (sy2 < 0 || sy2 >= res) continue;
          for (var bdx = -radius; bdx <= radius; bdx++) {
            var sx2 = x0 + bdx;
            if (sx2 < 0 || sx2 >= res) continue;
            if (bdx * bdx + bdy * bdy > r2) continue;
            var idx = sy2 * res + sx2;
            var before = grid.data[idx];
            grid.data[idx] = Math.max(0, before - perPoint);
            removed += before - grid.data[idx];
          }
        }
      }

      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 <  dx) { err += dx; y0 += sy; }
      steps++;
    }
    return removed;
  }

  // ── Core spray tick ────────────────────────────────────────────

  /**
   * Execute one cleaning tick. Called from update() when spray is active.
   *
   * Two paths:
   *   A) Pointer-aim (wall squeegee) — _sweepCenter returns pointerHit:true
   *      with the exact subcell the cursor is on. We stroke-interpolate
   *      from _prevAim to the new aim using hard-edge kernel. Fast cursor
   *      movement = strength spread thin = need more passes. Slow = deep
   *      clean in one pass. This IS the MS Paint eraser feel.
   *
   *   B) Lissajous fallback — d-pad play or floors. Uses _applyBrush with
   *      the existing soft/nozzle kernels.
   */
  function _sprayTick(now) {
    var fId = _floorId();
    if (!fId) return;

    var faced = _facedTile();
    if (!faced) return;

    var tile = _tileAt(faced.x, faced.y);
    if (tile < 0) return;

    if (typeof GrimeGrid === 'undefined') return;

    // Resolve nozzle and pressure — prefer item-level overrides
    var nozzle = _itemOverrides || NOZZLE_STATS[_nozzleType] || NOZZLE_STATS.base;
    var pressureMult = (typeof HoseState !== 'undefined')
      ? HoseState.getPressureMult() : 1.0;
    var elapsedSec = _sprayTime / 1000;

    // Determine what we're aimed at
    var gGrid = GrimeGrid.get(fId, faced.x, faced.y);
    var center = gGrid ? _sweepCenter(gGrid.res, elapsedSec) : null;

    // ── Pointer-aim path: wall squeegee ──
    // If _sweepCenter returned a pointer hit, we may be aiming at a
    // DIFFERENT tile than the simple faced tile (pointer can reach
    // adjacent walls within the FOV). Use the hit tile from the ray.
    var aimTileX = faced.x;
    var aimTileY = faced.y;
    var aimGrid = gGrid;
    var isPointerAim = false;

    if (center && center.pointerHit) {
      isPointerAim = true;
      aimTileX = center.tileX;
      aimTileY = center.tileY;
      // Re-fetch grid for the actual aimed tile (may differ from faced)
      aimGrid = GrimeGrid.get(fId, aimTileX, aimTileY);
    }

    var aimTile = _tileAt(aimTileX, aimTileY);
    var isWallTile = _isWall(aimTile);
    var effMult = isWallTile ? nozzle.wallEff : nozzle.floorEff;
    var strength = Math.round(BASE_STRENGTH * pressureMult * effMult);
    var brushRadius = isWallTile ? WALL_BRUSH_RADIUS : FLOOR_BRUSH_RADIUS;

    // ── Clean grime ──
    if (aimGrid && strength > 0 && center) {
      var removed = 0;

      if (isPointerAim) {
        // TODO:SFX wall-squeegee — wet rubber-on-glass squeak, loopable
        // while pointer is active on wall. 800ms-1.2s source clip, volume
        // 0.20-0.30. Pitch correlates with stroke speed: slow aim = lower
        // pitch (deliberate wipe), fast sweep = higher pitch (quick swipe).
        // Layer underneath spray-loop, not replacing it.

        // ── Path A: stroke interpolation with hard-edge kernel ──
        if (_prevAim && _prevAim.tileX === aimTileX && _prevAim.tileY === aimTileY) {
          // Same tile as last tick — interpolate stroke
          removed = _strokeLine(fId, aimTileX, aimTileY, aimGrid,
                                _prevAim.subX, _prevAim.subY,
                                center.subX, center.subY,
                                strength, brushRadius);
        } else {
          // New tile or first tick — single stamp
          GrimeGrid.cleanKernelHard(fId, aimTileX, aimTileY,
                                    center.subX, center.subY,
                                    strength, brushRadius);
          // Estimate removal for stats
          removed = strength * (brushRadius * 2 + 1);
        }

        _prevAim = {
          tileX: aimTileX,
          tileY: aimTileY,
          subX: center.subX,
          subY: center.subY
        };
      } else {
        // ── Path B: Lissajous auto-sweep (d-pad or floor) ──
        removed = _applyBrush(fId, aimTileX, aimTileY, aimGrid,
                              center.subX, center.subY,
                              strength, nozzle, elapsedSec);
        _prevAim = null;
      }

      if (removed > 0) {
        _stat('grimeRemoved', removed);

        var cleanliness = GrimeGrid.getTileCleanliness(fId, aimTileX, aimTileY);
        if (cleanliness >= 1.0 && (now - _lastToastTime > 2000)) {
          _lastToastTime = now;
          // TODO:SFX tile-clean-chime — bright ascending 3-note chime with
          // a watery shimmer tail, 300-500ms, volume 0.30-0.40. Positive
          // feedback sting — the "got it!" moment. Only fires once per tile
          // (2s throttle) so it won't stack.
          if (typeof Toast !== 'undefined') {
            Toast.show((typeof i18n !== 'undefined'
              ? i18n.t('toast.tile_clean', 'Tile cleaned!') : 'Tile cleaned!'), 'loot');
          }
          _stat('tilesFullyCleaned');

          // DOC-107 Phase 5 — fan out a 'tile_clean' subtarget event so
          // quest predicates tracking "wash N tiles" can advance. Wired
          // lazily at Game.init → PickupActions.onMinigameExit.
          if (typeof _onSubTargetComplete === 'function') {
            try {
              _onSubTargetComplete('tile_clean', fId, aimTileX, aimTileY);
            } catch (e) {
              if (typeof console !== 'undefined' && console.warn) {
                console.warn('[SpraySystem] onSubTargetComplete threw:', e);
              }
            }
          }
        }
      }
    }

    // ── Also scrub legacy blood layer if present (backward compat) ──
    if (typeof CleaningSystem !== 'undefined' && CleaningSystem.isDirty(aimTileX, aimTileY, fId)) {
      CleaningSystem.scrub(aimTileX, aimTileY, fId, 'brush');
    }

    // ── Torch collateral damage (§7) ──
    if (typeof TorchHitResolver !== 'undefined' && TorchHitResolver.onHoseHit) {
      TorchHitResolver.onHoseHit(fId, aimTileX, aimTileY);
    }

    // ── Burst FX at intervals ──
    if (now - _lastFxTime >= FX_BURST_MS) {
      _lastFxTime = now;
      _burstFx(aimTileX, aimTileY, isWallTile);
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Called every frame from game.js _render() loop.
   * Checks input state, manages spray activation, fires cleaning ticks.
   *
   * @param {number} frameDt — frame delta in milliseconds
   */
  function update(frameDt) {
    // Gate: hose must be active
    if (typeof HoseState === 'undefined' || !HoseState.isActive()) {
      if (_active) _stop();
      return;
    }

    // Gate: interact button must be held
    if (typeof InputManager === 'undefined' || !InputManager.isDown('interact')) {
      if (_active) _stop();
      return;
    }

    // Gate: must be facing a tile (not mid-turn, not in menu)
    var faced = _facedTile();
    if (!faced) {
      if (_active) _stop();
      return;
    }

    // Gate: must not be in combat or transition
    if (typeof CombatEngine !== 'undefined' && CombatEngine.isActive()) {
      if (_active) _stop();
      return;
    }
    if (typeof FloorTransition !== 'undefined' && FloorTransition.isTransitioning()) {
      if (_active) _stop();
      return;
    }

    // Gate: must not have a peek/menu overlay open.
    // When the player taps OK to open TorchPeek or RestockBridge,
    // the menu should capture input — spray defers to let the player
    // interact carefully (water-bottle extinguish preserves fuel).
    // Holding OK without a menu open → spray fires (destructive path).
    if (typeof TorchPeek !== 'undefined' && (TorchPeek.isActive() || TorchPeek.isInteracting())) {
      if (_active) _stop();
      return;
    }
    if (typeof RestockBridge !== 'undefined' && RestockBridge.isActive()) {
      if (_active) _stop();
      return;
    }
    if (typeof CorpsePeek !== 'undefined' && CorpsePeek.isActive()) {
      if (_active) _stop();
      return;
    }
    if (typeof CratePeek !== 'undefined' && CratePeek.isActive()) {
      if (_active) _stop();
      return;
    }

    // ── Start spray if not already active ──
    if (!_active) {
      _active = true;
      _sprayTime = 0;
      _lastTickTime = performance.now();
      _lastFxTime = 0;
      _nozzleType = _resolveNozzle();
      _startSpraySfx();
    }

    // ── Accumulate time and fire ticks ──
    var now = performance.now();
    _sprayTime += frameDt;

    if (now - _lastTickTime >= TICK_MS) {
      _lastTickTime = now;
      _sprayTick(now);
    }
  }

  /**
   * Stop spraying (button released, hose detached, combat started, etc.)
   */
  function _stop() {
    _active = false;
    _sprayTime = 0;
    _prevAim = null;
    _lastScreenX = -9999;   // reset so re-trigger doesn't read a stale velocity
    _lastScreenY = -9999;
    _stopSpraySfx();
  }

  /**
   * Check if the spray system is currently active (for HUD indicators etc.)
   */
  function isActive() { return _active; }

  /**
   * Get the current nozzle type string.
   */
  function getNozzleType() { return _nozzleType; }

  /**
   * Force-set nozzle type (for debug / testing).
   */
  function setNozzleType(type) {
    if (NOZZLE_STATS[type]) _nozzleType = type;
  }

  /**
   * No-op init — reserved for future setup (audio preload, etc.)
   */
  function init() {
    MC = (typeof MovementController !== 'undefined') ? MovementController : null;
  }

  /**
   * DOC-107 Phase 5 — wire the fan-out callback for tile-clean subtarget
   * events. Called once at Game.init with PickupActions.onMinigameExit
   * curried for the 'pressure_wash' kindId. Pass `null` to detach.
   */
  function setOnSubTargetComplete(fn) {
    if (fn === null) { _onSubTargetComplete = null; return true; }
    if (typeof fn !== 'function') return false;
    _onSubTargetComplete = fn;
    return true;
  }

  return Object.freeze({
    init:                  init,
    update:                update,
    isActive:              isActive,
    getNozzleType:         getNozzleType,
    setNozzleType:         setNozzleType,
    getResolvedNozzleStats: getResolvedNozzleStats,
    setOnSubTargetComplete: setOnSubTargetComplete,
    NOZZLE_STATS:          NOZZLE_STATS,
    BASE_STRENGTH:         BASE_STRENGTH
  });
})();
