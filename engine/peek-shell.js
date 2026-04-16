/**
 * PeekShell — shared outer frame for tile-interaction peek surfaces.
 *
 * Context: the game currently has 9+ separate peek modules (DoorPeek, CratePeek,
 * ChestPeek, CorpsePeek, MerchantPeek, BookshelfPeek, BarCounterPeek,
 * TorchPeek, PuzzlePeek) that each re-implement the same boilerplate:
 * dwell-detect the facing tile, fade a container in/out, route Escape to hide,
 * manage z-index layering, provide an exit affordance. PeekShell is the shared
 * chrome so each peek drops its bespoke framing and keeps only its inner
 * content renderer + interaction handler.
 *
 * Design references:
 *   - docs/MINIGAME_ROADMAP.md §0 (Phase 0 — interaction tableau unification)
 *   - docs/MINIGAME_ROADMAP.md §4.6 (worldPressure / viewportMode axes)
 *   - docs/PEEK_SYSTEM_ROADMAP.md §2 (PeekDescriptor schema reference)
 *   - docs/UNIFIED_RESTOCK_SURFACE_ROADMAP.md §8b (PeekShell scope note)
 *   - docs/RAYCASTER_PAUSE_RESUME_ADR.md §2.4 (takeover pause/resume wiring)
 *
 * This module owns:
 *   - Dwell-detection FSM (IDLE → SHOWING → OPEN → CLOSING → IDLE)
 *   - DOM container #peek-shell-root positioned absolute center, z-index 18
 *   - [×] corner exit target (44×44 Magic Remote hitbox, top-right of shell)
 *   - Key routing: Escape/Backspace/Back/GoBack dismisses; Enter/OK forwards to
 *     the mounted surface's onInteract; arbitrary others forward to onKey.
 *   - Pointer routing: [×] intercept first, then forward to surface.onPointer.
 *   - worldPressure + viewportMode declaration per MINIGAME_ROADMAP §4.6.
 *   - Auto-pause of Raycaster on 'takeover' viewportMode (parallels MinigameExit).
 *   - Fade in/out timing (FADE_MS), entry grace to suppress accidental
 *     exit clicks right after mount (GRACE_MS).
 *
 * Each peek surface registers a descriptor via PeekShell.register(tileMatch, desc)
 * OR drives the shell directly via mount({...})/unmount(). The descriptor path
 * is the sugar layer — it uses dwell detection every frame to auto-mount when
 * the player faces a matching tile. Direct mount() is the explicit path (e.g.
 * RestockBridge opening a slot row on button press).
 *
 * Each descriptor provides:
 *   - tileMatch:    function(tile) — true if this descriptor owns the tile
 *   - contentEl:    function(ctx)  — DOM element to render inside the shell
 *                                    (ownership retained by the caller; shell
 *                                    attaches/detaches but never destroys).
 *                                    Alternatively, a string returns HTML that
 *                                    the shell wraps in a div and owns.
 *   - worldPressure: 'safe' | 'invulnerable' | 'warning' | 'critical'
 *   - viewportMode:  'overlay' | 'dimmed' | 'takeover'
 *   - captures:      boolean — true → minigame-style key capture; false → tile peek
 *   - showDelay:     ms (default 300) — debounce before mount on facing match
 *   - onMount:       function(ctx)   — after DOM attach, before fade in
 *   - onInteract:    function(ctx)   — Enter/OK pressed while mounted
 *   - onKey:         function(key,ctx) → boolean — non-standard key handler
 *   - onPointer:     function(ptr,ctx) → boolean — click fell through [×] check
 *   - onUnmount:     function(ctx, reason) — reason ∈ {'user_exit','face_away',
 *                                            'forced','interact_handoff'}
 *   - juice:         { entryAnim, sfxMount, sfxUnmount, sfxInteract } (soft)
 *
 * Lifecycle guarantee: only ONE PeekShell surface is mounted at a time. If a
 * descriptor tries to mount while another is active, the previous mount is
 * torn down first (with reason='face_away' for dwell-driven swaps, or the
 * caller's own reason for explicit remounts).
 *
 * Layer 2 — depends on: HUD (soft), InputManager (soft), AudioSystem (soft),
 *                       Raycaster (soft, for takeover pause/resume)
 */
var PeekShell = (function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY_DEFAULT = 300;   // ms debounce on facing match before mount
  var HIDE_DELAY         = 120;   // ms debounce on face-away before unmount
  var FADE_MS            = 240;   // ms fade in/out
  var GRACE_MS           = 300;   // ms after mount during which [×] is ignored

  var CLOSE_SIZE         = 44;    // [×] hitbox edge length (Magic Remote target)
  var CLOSE_VISUAL       = 36;    // Visible circle diameter inside the hitbox
  var CLOSE_MARGIN       = 12;    // Distance from shell edge
  var DIM_ALPHA          = 0.5;   // viewportMode 'dimmed' world-behind opacity

  // ── Colors ──────────────────────────────────────────────────────
  var CLOSE_BG           = 'rgba(20,15,25,0.85)';
  var CLOSE_BG_HOVER     = 'rgba(60,20,20,0.92)';
  var CLOSE_GLYPH        = '#e8d8c8';
  var CLOSE_GLYPH_HOT    = '#ffffff';
  var CLOSE_BORDER       = 'rgba(200,180,120,0.45)';
  var CLOSE_BORDER_HOT   = '#f0d070';

  // ── Descriptor registry ─────────────────────────────────────────
  // Insertion order is iteration order — descriptors registered earlier win on
  // match ambiguity. In practice tileMatch functions should be disjoint.
  var _registry = [];

  // ── State ───────────────────────────────────────────────────────
  var _active        = false;       // true between mount() and unmount()
  var _mountedDesc   = null;        // descriptor for the currently mounted surface
  var _mountedCtx    = null;        // caller-provided context passed to callbacks
  var _mountedEl     = null;        // DOM node the shell is presenting
  var _ownsEl        = false;       // true if shell created the inner element (string path)

  var _viewportMode  = 'overlay';   // active mount's viewportMode
  var _worldPressure = 'safe';      // active mount's worldPressure (for registry enumeration)
  var _captures      = false;       // active mount's captures flag
  var _kindId        = '';          // identifier for harness telemetry

  var _graceT        = 0;           // ms remaining of entry grace
  var _fadeT         = 0;           // ms of fade-in elapsed (caps at FADE_MS)
  var _fadingOut     = false;       // currently in CLOSING state
  var _fadeOutT      = 0;           // ms of fade-out elapsed

  // Dwell tracking for auto-mount (descriptor-driven only)
  var _dwellTile     = 0;
  var _dwellX        = -1;
  var _dwellY        = -1;
  var _dwellT        = 0;           // accumulated ms facing the same tile
  var _hideT         = 0;           // accumulated ms facing away from mounted tile

  // DOM
  var _root          = null;        // shell container (absolutely positioned)
  var _contentWrap   = null;        // inner wrap the caller's el gets attached to
  var _closeBtn      = null;        // [×] DOM button
  var _styleInjected = false;

  // Close-button hover state (for render-less style toggling)
  var _closeHovered  = false;

  // ── Style injection ─────────────────────────────────────────────

  function _injectCSS() {
    if (_styleInjected) return;
    _styleInjected = true;

    var css =
      '/* === PeekShell: shared outer frame === */\n' +
      '#peek-shell-root {\n' +
      '  position: absolute;\n' +
      '  top: 50%; left: 50%;\n' +
      '  transform: translate(-50%, -50%);\n' +
      '  z-index: 18;\n' +
      '  pointer-events: none;\n' +
      '  opacity: 0;\n' +
      '  transition: opacity ' + FADE_MS + 'ms ease;\n' +
      '  max-width: 90vw;\n' +
      '  max-height: 85vh;\n' +
      '}\n' +
      '#peek-shell-root.ps-open {\n' +
      '  opacity: 1;\n' +
      '}\n' +
      '#peek-shell-root.ps-closing {\n' +
      '  opacity: 0;\n' +
      '}\n' +
      '#peek-shell-content {\n' +
      '  position: relative;\n' +
      '  pointer-events: none;\n' +
      '}\n' +
      '#peek-shell-content.ps-captures {\n' +
      '  pointer-events: auto;\n' +
      '}\n' +
      '#peek-shell-close {\n' +
      '  position: absolute;\n' +
      '  top: -' + (CLOSE_SIZE + CLOSE_MARGIN) + 'px;\n' +
      '  right: 0;\n' +
      '  width: ' + CLOSE_SIZE + 'px;\n' +
      '  height: ' + CLOSE_SIZE + 'px;\n' +
      '  border-radius: 50%;\n' +
      '  background: transparent;\n' +
      '  border: none;\n' +
      '  padding: 0;\n' +
      '  cursor: pointer;\n' +
      '  pointer-events: auto;\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  justify-content: center;\n' +
      '  outline: none;\n' +
      '  opacity: 0;\n' +
      '  transition: opacity 200ms ease;\n' +
      '}\n' +
      '#peek-shell-close.ps-close-visible {\n' +
      '  opacity: 1;\n' +
      '}\n' +
      '#peek-shell-close.ps-close-grace {\n' +
      '  opacity: 0.5;\n' +
      '  cursor: default;\n' +
      '}\n' +
      '#peek-shell-close-circle {\n' +
      '  width: ' + CLOSE_VISUAL + 'px;\n' +
      '  height: ' + CLOSE_VISUAL + 'px;\n' +
      '  border-radius: 50%;\n' +
      '  background: ' + CLOSE_BG + ';\n' +
      '  border: 1.25px solid ' + CLOSE_BORDER + ';\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  justify-content: center;\n' +
      '  color: ' + CLOSE_GLYPH + ';\n' +
      '  font: bold 22px monospace;\n' +
      '  line-height: 1;\n' +
      '  transition: background 180ms ease, border-color 180ms ease, color 180ms ease;\n' +
      '  user-select: none;\n' +
      '}\n' +
      '#peek-shell-close:hover:not(.ps-close-grace) #peek-shell-close-circle {\n' +
      '  background: ' + CLOSE_BG_HOVER + ';\n' +
      '  border-color: ' + CLOSE_BORDER_HOT + ';\n' +
      '  color: ' + CLOSE_GLYPH_HOT + ';\n' +
      '}\n' +
      /* viewportMode 'dimmed' backdrop — renders behind the shell */
      '#peek-shell-backdrop {\n' +
      '  position: absolute;\n' +
      '  top: 0; left: 0; width: 100%; height: 100%;\n' +
      '  z-index: 17;\n' +
      '  pointer-events: none;\n' +
      '  background: rgba(5,3,10,' + (1 - DIM_ALPHA) + ');\n' +
      '  opacity: 0;\n' +
      '  transition: opacity ' + FADE_MS + 'ms ease;\n' +
      '}\n' +
      '#peek-shell-backdrop.ps-backdrop-visible {\n' +
      '  opacity: 1;\n' +
      '}\n';

    var el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ── DOM boot ────────────────────────────────────────────────────

  function _ensureDOM() {
    if (_root) return;
    _injectCSS();

    var vp = document.getElementById('viewport');
    if (!vp) {
      if (typeof console !== 'undefined') {
        console.warn('[PeekShell] #viewport not found — cannot mount shell DOM');
      }
      return;
    }

    // Backdrop (dimmed viewport darken layer)
    var backdrop = document.getElementById('peek-shell-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'peek-shell-backdrop';
      vp.appendChild(backdrop);
    }

    // Root shell
    _root = document.createElement('div');
    _root.id = 'peek-shell-root';
    vp.appendChild(_root);

    // Content wrap — caller's element (or shell-owned wrapper) lives here
    _contentWrap = document.createElement('div');
    _contentWrap.id = 'peek-shell-content';
    _root.appendChild(_contentWrap);

    // Close button
    _closeBtn = document.createElement('button');
    _closeBtn.id = 'peek-shell-close';
    _closeBtn.setAttribute('aria-label', 'Close');
    _closeBtn.innerHTML = '<div id="peek-shell-close-circle">\u00D7</div>';
    _closeBtn.addEventListener('click', _onCloseClick);
    _closeBtn.addEventListener('mouseenter', function () { _closeHovered = true; });
    _closeBtn.addEventListener('mouseleave', function () { _closeHovered = false; });
    _root.appendChild(_closeBtn);
  }

  // ── Registry ────────────────────────────────────────────────────

  /**
   * Register a peek descriptor for dwell-driven auto-mount.
   *
   * @param {Object} desc — see module header for full schema.
   * @returns {Function} unregister — call to remove the descriptor.
   */
  function register(desc) {
    if (!desc || typeof desc.tileMatch !== 'function') {
      if (typeof console !== 'undefined') {
        console.warn('[PeekShell] register() requires desc.tileMatch function');
      }
      return function noop() {};
    }
    _registry.push(desc);
    return function unregister() {
      var i = _registry.indexOf(desc);
      if (i >= 0) _registry.splice(i, 1);
    };
  }

  function _findDescriptor(tile) {
    for (var i = 0; i < _registry.length; i++) {
      var d = _registry[i];
      try {
        if (d.tileMatch(tile)) return d;
      } catch (e) {
        if (typeof console !== 'undefined') {
          console.warn('[PeekShell] descriptor tileMatch threw', e);
        }
      }
    }
    return null;
  }

  // ── Mount / unmount ─────────────────────────────────────────────

  /**
   * Mount a surface. The explicit entry point — descriptor.onMount(ctx) fires
   * after the element is attached but before the fade-in completes.
   *
   * @param {Object} desc  — descriptor (or a one-shot object with the same shape).
   * @param {Object} [ctx] — context object passed to descriptor callbacks.
   */
  function mount(desc, ctx) {
    if (!desc) return;
    _ensureDOM();
    if (!_root) return;

    // If already mounted, tear down first (callers must expect this)
    if (_active) {
      _unmountInternal('forced');
    }

    _active        = true;
    _mountedDesc   = desc;
    _mountedCtx    = ctx || {};
    _viewportMode  = desc.viewportMode  || 'overlay';
    _worldPressure = desc.worldPressure || 'safe';
    _captures      = !!desc.captures;
    _kindId        = desc.kindId || desc.name || '';
    _graceT        = GRACE_MS;
    _fadeT         = 0;
    _fadingOut     = false;
    _fadeOutT      = 0;
    _closeHovered  = false;

    // Build / attach content
    var el = null;
    _ownsEl = false;
    if (typeof desc.contentEl === 'function') {
      try { el = desc.contentEl(_mountedCtx); }
      catch (e) {
        if (typeof console !== 'undefined') console.error('[PeekShell] contentEl threw', e);
      }
    } else if (typeof desc.content === 'function') {
      try { el = desc.content(_mountedCtx); }
      catch (e) {
        if (typeof console !== 'undefined') console.error('[PeekShell] content threw', e);
      }
    }
    if (typeof el === 'string') {
      var wrap = document.createElement('div');
      wrap.innerHTML = el;
      el = wrap;
      _ownsEl = true;
    }
    _mountedEl = el;
    if (_mountedEl) _contentWrap.appendChild(_mountedEl);

    // captures flag toggles pointer-events on the content wrap
    if (_captures) _contentWrap.classList.add('ps-captures');
    else _contentWrap.classList.remove('ps-captures');

    // viewportMode: dimmed → show backdrop; takeover → raycaster pause
    var backdrop = document.getElementById('peek-shell-backdrop');
    if (_viewportMode === 'dimmed' && backdrop) {
      backdrop.classList.add('ps-backdrop-visible');
    } else if (backdrop) {
      backdrop.classList.remove('ps-backdrop-visible');
    }
    if (_viewportMode === 'takeover' &&
        typeof Raycaster !== 'undefined' && Raycaster.pause) {
      Raycaster.pause();
    }

    // Fire onMount hook
    if (typeof desc.onMount === 'function') {
      try { desc.onMount(_mountedCtx); }
      catch (e) {
        if (typeof console !== 'undefined') console.error('[PeekShell] onMount threw', e);
      }
    }

    // Fade in + close button enter with grace
    _root.classList.remove('ps-closing');
    _root.classList.add('ps-open');
    if (_closeBtn) {
      _closeBtn.classList.add('ps-close-visible');
      _closeBtn.classList.add('ps-close-grace');
    }

    // Juice: mount SFX
    var sfx = desc.juice && desc.juice.sfxMount;
    if (sfx && typeof AudioSystem !== 'undefined' && AudioSystem.play) {
      try { AudioSystem.play(sfx, { volume: 0.4 }); } catch (e) {}
    }
  }

  /**
   * Unmount the current surface. Idempotent — safe to call when already inactive.
   * Fires descriptor.onUnmount(ctx, reason) with the provided reason.
   *
   * @param {string} [reason='user_exit'] — one of:
   *        'user_exit'        player clicked [×] / pressed Back
   *        'face_away'        dwell detector saw player turn / move away
   *        'forced'           another surface is mounting over this one
   *        'interact_handoff' onInteract elected to close (transition firing)
   */
  function unmount(reason) {
    _unmountInternal(reason || 'user_exit');
  }

  function _unmountInternal(reason) {
    if (!_active) return;
    var desc = _mountedDesc;
    var ctx  = _mountedCtx;
    var el   = _mountedEl;
    var owns = _ownsEl;

    // Fire onUnmount hook BEFORE tearing down DOM so the surface can read state
    if (desc && typeof desc.onUnmount === 'function') {
      try { desc.onUnmount(ctx, reason); }
      catch (e) {
        if (typeof console !== 'undefined') console.error('[PeekShell] onUnmount threw', e);
      }
    }

    // Fade out — DOM cleanup deferred so the transition is visible
    if (_root) {
      _root.classList.remove('ps-open');
      _root.classList.add('ps-closing');
    }
    if (_closeBtn) {
      _closeBtn.classList.remove('ps-close-visible');
      _closeBtn.classList.remove('ps-close-grace');
    }
    var backdrop = document.getElementById('peek-shell-backdrop');
    if (backdrop) backdrop.classList.remove('ps-backdrop-visible');

    _active        = false;
    _mountedDesc   = null;
    _mountedCtx    = null;
    _fadingOut     = true;
    _fadeOutT      = 0;
    _captures      = false;
    _graceT        = 0;

    // Juice: unmount SFX
    var sfx = desc && desc.juice && desc.juice.sfxUnmount;
    if (sfx && typeof AudioSystem !== 'undefined' && AudioSystem.play) {
      try { AudioSystem.play(sfx, { volume: 0.35 }); } catch (e) {}
    }

    // Raycaster resume — always call regardless of viewportMode (idempotent)
    if (typeof Raycaster !== 'undefined' && Raycaster.resume) {
      Raycaster.resume();
    }

    // Detach inner element after fade completes. If the shell built the wrapper
    // (string path), drop it entirely; otherwise just detach so caller keeps
    // ownership of their DOM tree.
    setTimeout(function () {
      if (el && el.parentNode === _contentWrap) {
        _contentWrap.removeChild(el);
      }
      if (owns && el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
      // If another mount landed during the fade, don't clobber it
      if (!_active) {
        _mountedEl = null;
        _ownsEl    = false;
      }
      _fadingOut = false;
    }, FADE_MS + 40);

    _viewportMode  = 'overlay';
    _worldPressure = 'safe';
    _kindId        = '';
  }

  // ── Close-button click ──────────────────────────────────────────

  function _onCloseClick(e) {
    if (e) e.stopPropagation();
    if (!_active) return;
    if (_graceT > 0) return;           // respect entry grace
    _unmountInternal('user_exit');
  }

  // ── Per-frame update ────────────────────────────────────────────

  /**
   * Advance the shell one frame.
   *
   * @param {number} dt     — ms elapsed since last call
   * @param {Object} [face] — { tile, x, y } describing what the player is facing
   *                          this frame. Pass null when no facing is meaningful
   *                          (e.g. during transition, combat, menu open).
   *                          When provided and _registry is non-empty, dwell
   *                          detection auto-mounts / auto-dismisses descriptor
   *                          surfaces.
   */
  function update(dt, face) {
    if (!dt || dt < 0) dt = 0;

    // Grace countdown + fade in tick
    if (_active) {
      if (_graceT > 0) {
        _graceT = Math.max(0, _graceT - dt);
        if (_graceT === 0 && _closeBtn) {
          _closeBtn.classList.remove('ps-close-grace');
        }
      }
      if (_fadeT < FADE_MS) _fadeT = Math.min(FADE_MS, _fadeT + dt);
    } else if (_fadingOut) {
      _fadeOutT += dt;
    }

    // Dwell detection for descriptor-driven auto-mount. Explicit mounts never
    // use this path — they call mount() directly and stay mounted until
    // unmount() is called.
    if (!face || !_registry.length) {
      _resetDwell();
      return;
    }

    // Same-tile streak tracking
    if (face.tile === _dwellTile && face.x === _dwellX && face.y === _dwellY) {
      _dwellT += dt;
    } else {
      _dwellTile = face.tile;
      _dwellX    = face.x;
      _dwellY    = face.y;
      _dwellT    = dt;
      _hideT     = 0;
    }

    // If the player is facing a tile that matches a registered descriptor, and
    // we've dwelt long enough, auto-mount. If we're already mounted on this
    // same tile, do nothing. If mounted on a different tile, swap.
    var desc = _findDescriptor(face.tile);

    if (desc) {
      var delay = typeof desc.showDelay === 'number' ? desc.showDelay : SHOW_DELAY_DEFAULT;
      if (!_active && _dwellT >= delay) {
        mount(desc, {
          tile: face.tile,
          x:    face.x,
          y:    face.y
        });
      }
      // If mounted on a different descriptor for a different tile, swap
      if (_active && _mountedDesc &&
          (_mountedDesc !== desc ||
           (_mountedCtx && (_mountedCtx.x !== face.x || _mountedCtx.y !== face.y)))) {
        _unmountInternal('face_away');
        // Immediate remount — same frame, so the next frame sees a clean mount
        mount(desc, { tile: face.tile, x: face.x, y: face.y });
      }
      _hideT = 0;
      return;
    }

    // No matching descriptor — if mounted via descriptor, dismiss after debounce.
    // Explicit mounts (no descriptor in registry, but ad-hoc mount()) stay
    // mounted; we can tell the two apart because explicit mounts set
    // _mountedDesc to an ephemeral object that isn't in _registry.
    if (_active && _mountedDesc && _registry.indexOf(_mountedDesc) >= 0) {
      _hideT += dt;
      if (_hideT >= HIDE_DELAY) {
        _unmountInternal('face_away');
      }
    }
  }

  function _resetDwell() {
    _dwellTile = 0;
    _dwellX    = -1;
    _dwellY    = -1;
    _dwellT    = 0;
    _hideT     = 0;
  }

  // ── Key routing ─────────────────────────────────────────────────

  /**
   * First-responder key handler. Game.js calls this BEFORE its own key logic
   * runs; if it returns true, the shell consumed the key.
   *
   * Escape/Backspace/Back/GoBack → unmount with reason 'user_exit'.
   * Enter/OK → forward to descriptor.onInteract(ctx); if the handler returns
   *            the literal string 'handoff', unmount with reason
   *            'interact_handoff' (use when the interact kicks off a floor
   *            transition that will replace this surface).
   * Any other key → forward to descriptor.onKey(key, ctx); consumed iff the
   *            handler returns true.
   *
   * When `captures: true`, unknown keys are silently consumed to prevent the
   * mounted surface from letting camera/move keys leak through to the player.
   *
   * @param {string} key
   * @returns {boolean} true if the shell consumed the key
   */
  function handleKey(key) {
    if (!_active) return false;
    if (_graceT > 0) {
      // Consume dismissal keys silently during grace so an accidental press
      // right after mount doesn't immediately close the shell.
      if (key === 'Escape' || key === 'Backspace' ||
          key === 'Back'   || key === 'GoBack') {
        return true;
      }
    }

    if (key === 'Escape' || key === 'Backspace' ||
        key === 'Back'   || key === 'GoBack') {
      _unmountInternal('user_exit');
      return true;
    }

    var desc = _mountedDesc;
    if (!desc) return false;

    if (key === 'Enter' || key === 'OK') {
      if (typeof desc.onInteract === 'function') {
        var r;
        try { r = desc.onInteract(_mountedCtx); }
        catch (e) {
          if (typeof console !== 'undefined') console.error('[PeekShell] onInteract threw', e);
        }
        if (r === 'handoff') _unmountInternal('interact_handoff');
        return true;
      }
    }

    if (typeof desc.onKey === 'function') {
      try {
        var consumed = desc.onKey(key, _mountedCtx);
        if (consumed) return true;
      } catch (e) {
        if (typeof console !== 'undefined') console.error('[PeekShell] onKey threw', e);
      }
    }

    // captures:true surfaces eat everything by default so stray keys don't
    // leak back to the player/movement system while the shell is framing a
    // captured-input body.
    if (_captures) return true;

    return false;
  }

  // ── Pointer routing ─────────────────────────────────────────────

  /**
   * First-responder pointer handler. The [×] button's own DOM click listener
   * handles the exit path — this function only forwards non-[×] clicks to
   * descriptor.onPointer for surfaces that want raw pointer data.
   *
   * @returns {boolean} true if the shell consumed the click
   */
  function handlePointerClick() {
    if (!_active) return false;
    if (_graceT > 0) return false;
    var desc = _mountedDesc;
    if (!desc || typeof desc.onPointer !== 'function') return false;

    var ptr = null;
    if (typeof InputManager !== 'undefined' && InputManager.getPointer) {
      ptr = InputManager.getPointer();
    }
    if (!ptr) return false;

    try {
      var consumed = desc.onPointer(ptr, _mountedCtx);
      return !!consumed;
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[PeekShell] onPointer threw', e);
      return false;
    }
  }

  // ── Introspection ───────────────────────────────────────────────

  function isActive()      { return _active; }
  function isInGrace()     { return _active && _graceT > 0; }
  function isFading()      { return _fadingOut; }
  function getKindId()     { return _kindId; }
  function getViewportMode()  { return _viewportMode; }
  function getWorldPressure() { return _worldPressure; }
  function capturesInput() { return _captures; }
  function getMountedContext() { return _mountedCtx; }

  /**
   * Registry enumeration for harness / registry tooling. Returns a frozen
   * array of shallow-copied descriptor summaries suitable for asserting
   * worldPressure + viewportMode declarations.
   */
  function enumerate() {
    var out = [];
    for (var i = 0; i < _registry.length; i++) {
      var d = _registry[i];
      out.push(Object.freeze({
        kindId:        d.kindId || d.name || ('#' + i),
        worldPressure: d.worldPressure || 'safe',
        viewportMode:  d.viewportMode  || 'overlay',
        captures:      !!d.captures,
        showDelay:     typeof d.showDelay === 'number' ? d.showDelay : SHOW_DELAY_DEFAULT,
        hasInteract:   typeof d.onInteract === 'function',
        hasKey:        typeof d.onKey === 'function',
        hasPointer:    typeof d.onPointer === 'function'
      }));
    }
    return Object.freeze(out);
  }

  // ── Public API ──────────────────────────────────────────────────

  return Object.freeze({
    register:          register,
    mount:             mount,
    unmount:           unmount,
    update:            update,
    handleKey:         handleKey,
    handlePointerClick: handlePointerClick,
    isActive:          isActive,
    isInGrace:         isInGrace,
    isFading:          isFading,
    getKindId:         getKindId,
    getViewportMode:   getViewportMode,
    getWorldPressure:  getWorldPressure,
    capturesInput:     capturesInput,
    getMountedContext: getMountedContext,
    enumerate:         enumerate,
    // Exposed for test harness only — NOT for surface authors
    _CONFIG: Object.freeze({
      SHOW_DELAY_DEFAULT: SHOW_DELAY_DEFAULT,
      HIDE_DELAY:         HIDE_DELAY,
      FADE_MS:            FADE_MS,
      GRACE_MS:           GRACE_MS,
      CLOSE_SIZE:         CLOSE_SIZE
    })
  });
})();
