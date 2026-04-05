/**
 * DamageFloaters — ephemeral numeric popups for combat damage events.
 *
 * Layer 2. Depends only on the DOM. Soft-consumed by CombatBridge via
 * typeof guards so combat keeps working if this module isn't loaded.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Design
 * ──────────────────────────────────────────────────────────────────────
 * Two fixed anchor zones over the combat viewport:
 *
 *   • enemy zone  — upper-center of #view-canvas. Outgoing damage
 *                   (player hits enemy) floats here, red.
 *   • player zone — lower-center just above the HUD frame. Incoming
 *                   damage (enemy hits player) floats here, yellow.
 *
 * Each floater is a short-lived <div> that translates up 60px while
 * fading out over ~900ms, then self-removes. Concurrent floaters on
 * the same zone stagger horizontally so they don't stack on top of
 * each other.
 *
 * Kinds (visual treatment):
 *   player-dealt   — red "-N"  over enemy zone     (outgoing hit)
 *   enemy-dealt    — yellow "-N" over player zone  (incoming hit)
 *   crit           — gold, larger "-N" + "CRIT"    (player-side only)
 *   blocked        — gray "-N" with strike-through over player zone
 *   heal           — green "+N" over player zone
 *   whiff          — gray "MISS" over player zone  (enemy whiffed)
 *
 * API
 * ──────────────────────────────────────────────────────────────────────
 *   init()                     — create container + inject styles (idempotent)
 *   show({ amount, kind })     — spawn a floater
 *   reset()                    — clear all active floaters (combat end)
 *   isInitialized()            — whether init has run
 */
var DamageFloaters = (function () {
  'use strict';

  var _container = null;
  var _stylesInjected = false;
  var _initialized = false;

  // Staggered horizontal offset per zone so floaters fired in quick
  // succession don't render on top of each other. Cycles 0→±1→±2.
  var _zoneStagger = { enemy: 0, player: 0 };

  // ── Style injection (once per page) ───────────────────────────────

  function _injectStyles() {
    if (_stylesInjected) return;
    var style = document.createElement('style');
    style.id = 'damage-floaters-styles';
    style.textContent = [
      '#damage-floaters {',
      '  position: absolute;',
      '  top: 0; left: 0; right: 0; bottom: 0;',
      '  pointer-events: none;',
      '  z-index: 45;',
      '  overflow: hidden;',
      '}',
      '.dmg-float {',
      '  position: absolute;',
      '  transform: translate(-50%, 0);',
      '  font-family: "Courier New", monospace;',
      '  font-weight: bold;',
      '  font-size: 42px;',
      '  line-height: 1;',
      '  text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 14px rgba(0,0,0,0.6);',
      '  white-space: nowrap;',
      '  animation: dmg-float-rise 900ms ease-out forwards;',
      '  will-change: transform, opacity;',
      '}',
      '.dmg-float.k-player-dealt { color: #ff5a4a; }',
      '.dmg-float.k-enemy-dealt  { color: #ffdc4a; }',
      '.dmg-float.k-crit         { color: #ffd24a; font-size: 56px; }',
      '.dmg-float.k-crit .dmg-crit-label {',
      '  display: block;',
      '  font-size: 18px;',
      '  letter-spacing: 0.25em;',
      '  color: #fff5a0;',
      '  margin-bottom: 2px;',
      '}',
      '.dmg-float.k-blocked {',
      '  color: #9aa4b0;',
      '  text-decoration: line-through;',
      '  text-decoration-thickness: 4px;',
      '  font-size: 36px;',
      '}',
      '.dmg-float.k-heal { color: #7aff8a; }',
      '.dmg-float.k-whiff {',
      '  color: #9aa4b0;',
      '  font-size: 30px;',
      '  letter-spacing: 0.2em;',
      '}',
      '@keyframes dmg-float-rise {',
      '  0%   { transform: translate(-50%, 0)    scale(0.6); opacity: 0; }',
      '  15%  { transform: translate(-50%, -8px) scale(1.15); opacity: 1; }',
      '  25%  { transform: translate(-50%, -14px) scale(1.0); opacity: 1; }',
      '  70%  { transform: translate(-50%, -48px) scale(1.0); opacity: 1; }',
      '  100% { transform: translate(-50%, -72px) scale(0.9); opacity: 0; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
    _stylesInjected = true;
  }

  // ── Container lifecycle ───────────────────────────────────────────

  function init() {
    if (_initialized) return;
    _injectStyles();

    // Parent onto #game-wrap if it exists (matches StackPreview's parenting
    // so resizes / CSS scale stay consistent). Fall back to body.
    var parent = document.getElementById('game-wrap') || document.body;

    _container = document.createElement('div');
    _container.id = 'damage-floaters';
    parent.appendChild(_container);

    _initialized = true;
  }

  function isInitialized() { return _initialized; }

  // ── Zone math ─────────────────────────────────────────────────────
  //
  // Zones are computed at show() time from the current container size
  // so they track any resize. Percentages chosen to sit where the eye
  // already is during combat — enemy sprite is ~40% down, card fan is
  // below ~80%, so the player anchor sits just above the card fan.

  function _resolveZonePoint(kind) {
    var w = _container.clientWidth || 800;
    var h = _container.clientHeight || 500;

    var zone;
    if (kind === 'enemy-dealt' || kind === 'blocked' ||
        kind === 'heal' || kind === 'whiff') {
      // player zone — bottom third, just above the HUD/fan
      zone = 'player';
      return {
        zone: zone,
        cx: w * 0.5,
        cy: h * 0.72
      };
    }
    // player-dealt / crit → enemy zone, upper-mid
    zone = 'enemy';
    return {
      zone: zone,
      cx: w * 0.5,
      cy: h * 0.32
    };
  }

  function _nextStaggerX(zone) {
    // Cycle offsets 0, +60, -60, +120, -120 so bursts fan out.
    var n = _zoneStagger[zone] || 0;
    _zoneStagger[zone] = (n + 1) % 6;
    var offsets = [0, 60, -60, 120, -120, 30];
    return offsets[n];
  }

  // ── Public: spawn a floater ───────────────────────────────────────
  //
  // opts:
  //   amount  — number (required for numeric kinds)
  //   kind    — 'player-dealt' | 'enemy-dealt' | 'crit' | 'blocked'
  //           | 'heal' | 'whiff'
  //
  // Silently no-ops if init() wasn't called so combat never crashes
  // on a missing module.

  function show(opts) {
    if (!_initialized || !_container) return;
    opts = opts || {};
    var kind = opts.kind || 'player-dealt';
    var amount = opts.amount;

    // Skip noisy zero-damage events — whiff has its own kind.
    if ((kind === 'player-dealt' || kind === 'enemy-dealt' ||
         kind === 'blocked' || kind === 'heal' || kind === 'crit') &&
        (typeof amount !== 'number' || amount === 0)) {
      return;
    }

    var point = _resolveZonePoint(kind);
    var dx = _nextStaggerX(point.zone);

    var el = document.createElement('div');
    el.className = 'dmg-float k-' + kind;
    el.style.left = (point.cx + dx) + 'px';
    el.style.top = point.cy + 'px';

    // Label text per kind
    var text;
    if (kind === 'heal') {
      text = '+' + amount;
    } else if (kind === 'whiff') {
      text = 'MISS';
    } else if (kind === 'crit') {
      el.innerHTML = '<span class="dmg-crit-label">CRIT</span>-' + amount;
      text = null;
    } else {
      text = '-' + amount;
    }
    if (text !== null) el.textContent = text;

    _container.appendChild(el);

    // Self-remove after animation completes. Use animationend with a
    // setTimeout fallback in case the element is detached mid-animation
    // (e.g. combat ends while the floater is still rising).
    var removed = false;
    var remove = function () {
      if (removed) return;
      removed = true;
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    el.addEventListener('animationend', remove);
    setTimeout(remove, 1100);
  }

  // ── Public: reset (combat end) ────────────────────────────────────

  function reset() {
    if (!_container) return;
    while (_container.firstChild) {
      _container.removeChild(_container.firstChild);
    }
    _zoneStagger.enemy = 0;
    _zoneStagger.player = 0;
  }

  return {
    init: init,
    show: show,
    reset: reset,
    isInitialized: isInitialized
  };
})();
