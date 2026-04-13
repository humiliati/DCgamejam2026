/**
 * DoorPeek — Single-door peek for doors, stairs, and trapdoors.
 *
 * 3-phase animation (matches ArchPeek phasing):
 *   Phase 1 (closed):  Player faces a transition tile. Door appears closed.
 *   Phase 2 (cracked): Auto-advances on adjacency (~350ms). Door cracks −41°.
 *   Phase 3 (opened):  Forward arrow / button click. Door swings −92°, glow
 *                      appears, floor transition fires. Back arrow cancels.
 *
 * CSS from BoxForge v1.0 SINGLE_DOOR_ANIMATION reference.
 * Self-contained — no BoxAnim dependency.
 *
 * Handles: DOOR, BOSS_DOOR, DOOR_BACK, DOOR_EXIT, DOOR_FACADE,
 *          STAIRS_DN, STAIRS_UP, TRAPDOOR_DN, TRAPDOOR_UP.
 *
 * Modular:
 *   - Biome reskin via CSS custom properties from target floor colors
 *   - Direction-aware glow: warm amber (advance) / cool blue (retreat)
 *   - Night-lock support (DayCycle): locked variant, no Enter button
 *   - Boss door red glow
 *   - Door leaf label: floor name in vertical writing mode
 *   - Action button: Magic Remote clickable
 *
 * Layer 3 (after InteractPrompt)
 * Depends on: TILES, Player, MovementController, FloorManager, i18n,
 *             InputManager (for forward/back edge detection)
 */
var DoorPeek = (function () {
  'use strict';

  var MC = typeof MovementController !== 'undefined' ? MovementController : null;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY  = 300;   // ms before box appears (debounce jitter)
  var OPEN_TO_TRANSITION_DELAY = 500; // ms after phase 3 before firing transition

  // ── State ──────────────────────────────────────────────────────
  var _active     = false;
  var _phase      = 0;     // 0=inactive, 1=closed, 2=hover-crack, 3=opened
  var _facingTile = 0;
  var _facingX    = -1;
  var _facingY    = -1;
  var _targetId   = null;
  var _direction  = 'advance';
  var _isStair    = false; // true for STAIRS_*/TRAPDOOR_* (dispatch to tryInteractStairs)
  var _nightLocked = false;
  var _timer      = 0;
  var _transitioning = false;
  var _container  = null;
  var _wrap       = null;
  var _subLabel   = null;
  var _actionBtn  = null;
  var _labelLayer = null;
  var _styleInjected = false;

  // Forward/back edge tracking (DoorPeek runs after InputPoll)
  var _prevForward = false;
  var _prevBack    = false;

  // ── CSS injection ────────────────────────────────────────────────

  function _injectCSS() {
    if (_styleInjected) return;
    _styleInjected = true;

    var css =
      '/* === DoorPeek: single door variant (390x586, depth 92) === */\n' +
      '.box3d-wrap.single-door-variant {\n' +
      '  --sd-w: 390px; --sd-h: 586px;\n' +
      '  --box-d: 46px; --box-half: -46px;\n' +
      '  --bevel-w: 2px;\n' +
      '  --box-dark: #0a0a08; --box-dark2: #000000;\n' +
      '  --box-light: #3a4030; --box-floor: #1a1812;\n' +
      '  --box-ceil: #2a3020;\n' +
      '  --box-glow: rgba(220,200,160,0.6);\n' +
      '  --sd-door-light: #3a4030; --sd-door-dark: #1c2212;\n' +
      '  --sd-jam-bg: linear-gradient(to top, #0a0a08, #3a4030);\n' +
      '  --sd-jam-inner: linear-gradient(to top, #1c2212, #3a4030);\n' +
      '  --sd-lintel-bg: linear-gradient(to top, #0a0a08, #3a4030);\n' +
      '  --sd-lintel-inner: linear-gradient(to top, #1c2212, #3a4030);\n' +
      '  --perspective: 502px;\n' +
      '  perspective: 502px;\n' +
      '  width: 390px; height: 586px;\n' +
      '  position: relative;\n' +
      '  transform-style: preserve-3d;\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .box3d-scene {\n' +
      '  width: 390px; height: 586px;\n' +
      '  transform: rotateX(-12deg) rotateY(-21deg);\n' +
      '  transform-style: preserve-3d;\n' +
      '  position: relative;\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .box3d-spin {\n' +
      '  width: 390px; height: 586px;\n' +
      '  transform-style: preserve-3d;\n' +
      '  position: relative;\n' +
      '}\n' +
      '.single-door-variant .box3d-body {\n' +
      '  width: 390px; height: 586px;\n' +
      '  transform-style: preserve-3d;\n' +
      '  position: relative;\n' +
      '}\n' +
      '\n' +
      '/* Back (hidden) */\n' +
      '.box3d-wrap.single-door-variant .bf-back {\n' +
      '  width: 390px; height: 586px;\n' +
      '  background: transparent;\n' +
      '  transform: translateZ(-46px) translate(0px,0px);\n' +
      '  display: none; position: absolute;\n' +
      '}\n' +
      '\n' +
      '/* Left Jam */\n' +
      '.box3d-wrap.single-door-variant .bf-left {\n' +
      '  width: 92px; height: 586px;\n' +
      '  left: 149px; top: 0px;\n' +
      '  background: var(--sd-jam-bg);\n' +
      '  transform: translate(-180px,7px) rotateY(90deg) translateZ(0px);\n' +
      '  position: absolute; transform-style: preserve-3d;\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-left > .sub-edge-back {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 92px; height: 586px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translateZ(-2px) translate(0px,0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-left > .sub-edge-left {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 4px; height: 586px;\n' +
      '  left: 44px; top: 0px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(-46px,0px) rotateY(90deg) translateZ(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-left > .sub-edge-right {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 4px; height: 586px;\n' +
      '  left: 44px; top: 0px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(46px,0px) rotateY(90deg) translateZ(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-left > .sub-edge-top {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 92px; height: 4px;\n' +
      '  left: 0px; top: 291px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(0px,0px) rotateX(90deg) translateZ(293px) translateY(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-left > .sub-edge-bottom {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 92px; height: 4px;\n' +
      '  left: 0px; top: 291px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(0px,0px) rotateX(90deg) translateZ(-293px) translateY(0px);\n' +
      '}\n' +
      '\n' +
      '/* Right Jam */\n' +
      '.box3d-wrap.single-door-variant .bf-right {\n' +
      '  width: 92px; height: 586px;\n' +
      '  left: 149px; top: 0px;\n' +
      '  background: var(--sd-jam-bg);\n' +
      '  transform: translate(195px,5px) rotateY(90deg) translateZ(0px);\n' +
      '  position: absolute; transform-style: preserve-3d;\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-right > .sub-edge-back {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 92px; height: 586px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translateZ(-15px) translate(0px,0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-right > .sub-edge-left {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 30px; height: 586px;\n' +
      '  left: 31px; top: 0px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(-46px,0px) rotateY(90deg) translateZ(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-right > .sub-edge-right {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 30px; height: 586px;\n' +
      '  left: 31px; top: 0px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(46px,0px) rotateY(90deg) translateZ(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-right > .sub-edge-top {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 92px; height: 30px;\n' +
      '  left: 0px; top: 278px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(0px,0px) rotateX(90deg) translateZ(293px) translateY(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-right > .sub-edge-bottom {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 92px; height: 30px;\n' +
      '  left: 0px; top: 278px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(0px,0px) rotateX(90deg) translateZ(-293px) translateY(0px);\n' +
      '}\n' +
      '\n' +
      '/* Lintel (top) */\n' +
      '.box3d-wrap.single-door-variant .bf-top {\n' +
      '  width: 390px; height: 87px;\n' +
      '  left: 0px; top: 249.5px;\n' +
      '  background: var(--sd-lintel-bg);\n' +
      '  transform: translate(14px,16px) rotateX(90deg) translateZ(293px) translateY(0px);\n' +
      '  position: absolute; transform-style: preserve-3d;\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-top > .sub-edge-back {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 390px; height: 87px;\n' +
      '  background: var(--sd-lintel-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translateZ(-15px) translate(0px,0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-top > .sub-edge-left {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 30px; height: 87px;\n' +
      '  left: 180px; top: 0px;\n' +
      '  background: var(--sd-lintel-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(-195px,0px) rotateY(90deg) translateZ(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-top > .sub-edge-right {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 30px; height: 87px;\n' +
      '  left: 180px; top: 0px;\n' +
      '  background: var(--sd-lintel-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(195px,0px) rotateY(90deg) translateZ(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-top > .sub-edge-top {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 390px; height: 30px;\n' +
      '  left: 0px; top: 28.5px;\n' +
      '  background: var(--sd-lintel-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(0px,0px) rotateX(90deg) translateZ(43.5px) translateY(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-top > .sub-edge-bottom {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 390px; height: 30px;\n' +
      '  left: 0px; top: 28.5px;\n' +
      '  background: var(--sd-lintel-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(0px,0px) rotateX(90deg) translateZ(-43.5px) translateY(0px);\n' +
      '}\n' +
      '\n' +
      '/* Sill (bottom) */\n' +
      '.box3d-wrap.single-door-variant .bf-bottom {\n' +
      '  width: 390px; height: 192px;\n' +
      '  left: 0px; top: 197px;\n' +
      '  background: var(--sd-lintel-bg);\n' +
      '  transform: translate(17px,6px) rotateX(90deg) translateZ(-293px) translateY(0px);\n' +
      '  position: absolute; transform-style: preserve-3d;\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-bottom > .sub-edge-back {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 390px; height: 192px;\n' +
      '  background: var(--sd-lintel-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translateZ(-2px) translate(0px,0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-bottom > .sub-edge-left {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 4px; height: 192px;\n' +
      '  left: 193px; top: 0px;\n' +
      '  background: var(--sd-lintel-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(-195px,0px) rotateY(90deg) translateZ(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-bottom > .sub-edge-right {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 4px; height: 192px;\n' +
      '  left: 193px; top: 0px;\n' +
      '  background: var(--sd-lintel-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(195px,0px) rotateY(90deg) translateZ(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-bottom > .sub-edge-top {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 390px; height: 4px;\n' +
      '  left: 0px; top: 94px;\n' +
      '  background: var(--sd-lintel-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(0px,0px) rotateX(90deg) translateZ(96px) translateY(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-bottom > .sub-edge-bottom {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 390px; height: 4px;\n' +
      '  left: 0px; top: 94px;\n' +
      '  background: var(--sd-lintel-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(0px,0px) rotateX(90deg) translateZ(-96px) translateY(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .bf-bottom > .sub-child-0 {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 390px; height: 79px;\n' +
      '  left: 0px; top: 56.5px;\n' +
      '  background: var(--sd-lintel-bg);\n' +
      '  opacity: 0.95;\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translateZ(10px) translate(-10px,0px);\n' +
      '}\n' +
      '\n' +
      '/* Lid: Door Panel (390x564, hinge: left) */\n' +
      '.box3d-wrap.single-door-variant .box3d-lid-wrap {\n' +
      '  position: absolute; transform-style: preserve-3d;\n' +
      '  width: 390px; height: 564px;\n' +
      '  left: 0px; top: 11px;\n' +
      '  transform: translateZ(46px) translate(15px,-5px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .box3d-lid {\n' +
      '  width: 390px; height: 564px;\n' +
      '  background: repeating-linear-gradient(0deg, var(--sd-door-light) 0px, var(--sd-door-light) 8px, var(--sd-door-dark) 8px, var(--sd-door-dark) 9px);\n' +
      '  transform-origin: 0px center;\n' +
      '  transition: transform 0.4s cubic-bezier(0.33, 1, 0.68, 1);\n' +
      '  position: relative; transform-style: preserve-3d;\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant.hovered .box3d-lid {\n' +
      '  transform: rotateY(-41deg);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant.opened .box3d-lid {\n' +
      '  transform: rotateY(-92deg);\n' +
      '}\n' +
      '/* Lid sub-edge bevels */\n' +
      '.box3d-wrap.single-door-variant .box3d-lid > .sub-edge-back {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 390px; height: 564px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translateZ(-17px) translate(0px,0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .box3d-lid > .sub-edge-left {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 34px; height: 564px;\n' +
      '  left: 178px; top: 0px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(-195px,0px) rotateY(90deg) translateZ(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .box3d-lid > .sub-edge-right {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 34px; height: 564px;\n' +
      '  left: 178px; top: 0px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(195px,0px) rotateY(90deg) translateZ(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .box3d-lid > .sub-edge-top {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 390px; height: 34px;\n' +
      '  left: 0px; top: 265px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(0px,0px) rotateX(90deg) translateZ(282px) translateY(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .box3d-lid > .sub-edge-bottom {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 390px; height: 34px;\n' +
      '  left: 0px; top: 265px;\n' +
      '  background: var(--sd-jam-inner);\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translate(0px,0px) rotateX(90deg) translateZ(-282px) translateY(0px);\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant .box3d-lid > .sub-child-0 {\n' +
      '  position: absolute; pointer-events: none;\n' +
      '  width: 388px; height: 566px;\n' +
      '  left: 1px; top: -1px;\n' +
      '  background: var(--sd-lintel-bg);\n' +
      '  opacity: 0.95;\n' +
      '  border: 1px solid rgba(255,255,255,0.08);\n' +
      '  transform-style: preserve-3d;\n' +
      '  transform: translateZ(17px) translate(0px,0px);\n' +
      '}\n' +
      '\n' +
      '/* Glow sources */\n' +
      '.single-door-glow {\n' +
      '  position: absolute;\n' +
      '  background: radial-gradient(ellipse, var(--box-glow) 0%, transparent 70%);\n' +
      '  filter: blur(18px);\n' +
      '  pointer-events: none;\n' +
      '  opacity: 0; transition: opacity 0.4s ease 0.15s;\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant.opened .single-door-glow {\n' +
      '  opacity: 1;\n' +
      '}\n' +
      '.single-door-glow--0 {\n' +
      '  width: 546px; height: 820px;\n' +
      '  left: calc(50% - 273px - 9px); top: calc(50% - 410px + 285px);\n' +
      '  transform: translateZ(0px) rotateX(90deg);\n' +
      '}\n' +
      '.single-door-glow--1 {\n' +
      '  width: 546px; height: 820px;\n' +
      '  left: calc(50% - 273px); top: calc(50% - 410px);\n' +
      '  transform: translateZ(0px) rotateX(0deg);\n' +
      '}\n' +
      '.single-door-glow--2 {\n' +
      '  width: 347px; height: 522px;\n' +
      '  left: calc(50% - 173.5px); top: calc(50% - 261px + 44px);\n' +
      '  transform: translateZ(-127px) rotateY(60deg);\n' +
      '}\n' +
      '.single-door-glow--3 {\n' +
      '  width: 320px; height: 481px;\n' +
      '  left: calc(50% - 160px + 1px); top: calc(50% - 240.5px - 4px);\n' +
      '  transform: translateZ(-186px) rotateY(120deg);\n' +
      '}\n' +
      '\n' +
      '/* Door leaf label */\n' +
      '.sd-leaf-label {\n' +
      '  position: absolute; top: 50%; left: 50%;\n' +
      '  transform: translate(-50%, -50%);\n' +
      '  font: bold 24px monospace;\n' +
      '  color: rgba(220,200,160,0.8);\n' +
      '  text-shadow: 0 0 12px rgba(200,180,140,0.4);\n' +
      '  white-space: nowrap; pointer-events: none;\n' +
      '  writing-mode: vertical-rl; text-orientation: mixed;\n' +
      '  opacity: 0; transition: opacity 0.3s ease;\n' +
      '}\n' +
      '.box3d-wrap.single-door-variant.hovered .sd-leaf-label,\n' +
      '.box3d-wrap.single-door-variant.opened .sd-leaf-label {\n' +
      '  opacity: 1;\n' +
      '}\n' +
      '\n' +
      '/* Container fade */\n' +
      '#door-peek-container { transition: opacity 0.3s ease; }\n';

    var el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ── DOM builder ────────────────────────────────────────────────────

  function _buildWrap() {
    var w = document.createElement('div');
    w.className = 'box3d-wrap single-door-variant';

    // 5 sub-edge children template for structural panes
    var SE = '<div class="sub-edge-back"></div>' +
             '<div class="sub-edge-left"></div>' +
             '<div class="sub-edge-right"></div>' +
             '<div class="sub-edge-top"></div>' +
             '<div class="sub-edge-bottom"></div>';

    w.innerHTML =
      '<div class="box3d-scene">' +
        '<div class="box3d-spin">' +
          '<div class="box3d-body">' +
            '<div class="bf-back"></div>' +
            '<div class="bf-left">' + SE + '</div>' +
            '<div class="bf-right">' + SE + '</div>' +
            '<div class="bf-top">' + SE + '</div>' +
            '<div class="bf-bottom">' + SE + '<div class="sub-child-0"></div></div>' +
            '<div class="box3d-lid-wrap">' +
              '<div class="box3d-lid">' + SE +
                '<div class="sub-child-0"></div>' +
                '<span class="sd-leaf-label"></span>' +
              '</div>' +
            '</div>' +
            '<div class="single-door-glow single-door-glow--0"></div>' +
            '<div class="single-door-glow single-door-glow--1"></div>' +
            '<div class="single-door-glow single-door-glow--2"></div>' +
            '<div class="single-door-glow single-door-glow--3"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    return w;
  }

  // ── Biome reskin ──────────────────────────────────────────────────

  function _applyBiomeSkin(wrap, targetFloor) {
    var colors = null;
    if (typeof FloorManager !== 'undefined' && FloorManager.getBiomeColors) {
      colors = FloorManager.getBiomeColors(targetFloor);
    }
    if (!colors) return;

    wrap.style.setProperty('--sd-door-light', colors.door);
    wrap.style.setProperty('--sd-door-dark', colors.doorDark);

    var jamBg = 'linear-gradient(to top, ' + colors.wallDark + ', ' + colors.wallLight + ')';
    wrap.style.setProperty('--sd-jam-bg', jamBg);
    wrap.style.setProperty('--sd-jam-inner', jamBg);
    wrap.style.setProperty('--sd-lintel-bg', jamBg);
    wrap.style.setProperty('--sd-lintel-inner', jamBg);

    wrap.style.setProperty('--box-floor', colors.floor);
    wrap.style.setProperty('--box-ceil', colors.ceil);
  }

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    _injectCSS();

    _container = document.getElementById('door-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'door-peek-container';
      _container.style.cssText =
        'position:absolute; top:40%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'z-index:18; pointer-events:none; opacity:0;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    _labelLayer = document.getElementById('door-peek-labels');
    if (!_labelLayer) {
      _labelLayer = document.createElement('div');
      _labelLayer.id = 'door-peek-labels';
      _labelLayer.style.cssText =
        'position:absolute; top:0; left:0; width:100%; height:100%;' +
        'z-index:2; pointer-events:none;';
      _container.appendChild(_labelLayer);
    }

    _subLabel = document.getElementById('door-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'door-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:60px; text-align:center;' +
        'font:20px monospace; color:rgba(180,170,150,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.7);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.4;';
      _labelLayer.appendChild(_subLabel);
    }

    _actionBtn = document.getElementById('door-peek-action');
    if (!_actionBtn) {
      _actionBtn = document.createElement('button');
      _actionBtn.id = 'door-peek-action';
      _actionBtn.style.cssText =
        'position:absolute; top:100%; left:50%;' +
        'transform:translateX(-50%);' +
        'margin-top:130px; min-height:48px;' +
        'font:bold 18px monospace; color:#dcc8a0;' +
        'background:rgba(100,80,40,0.5);' +
        'border:2px solid rgba(200,170,100,0.4);' +
        'border-radius:8px; padding:12px 28px;' +
        'text-shadow:0 0 8px rgba(200,170,100,0.4);' +
        'cursor:pointer; pointer-events:auto;' +
        'opacity:0; transition:opacity 0.3s ease;' +
        'white-space:nowrap; outline:none;';
      _actionBtn.textContent = 'Enter';

      // Hover over button → cycle crack animation
      _actionBtn.addEventListener('mouseenter', function () {
        if (_phase >= 1 && _phase < 3 && _wrap) {
          _wrap.classList.add('hovered');
          _phase = 2;
        }
        _actionBtn.style.color = '#fff';
        _actionBtn.style.background = _direction === 'advance'
          ? 'rgba(140,120,60,0.6)' : 'rgba(80,120,180,0.6)';
        _actionBtn.style.borderColor = _direction === 'advance'
          ? '#dcc8a0' : '#c0d8f0';
      });
      _actionBtn.addEventListener('mouseleave', function () {
        if (_phase === 2 && _wrap) {
          _wrap.classList.remove('hovered');
          _phase = 1;
          setTimeout(function () {
            if (_active && _phase === 1 && _wrap) {
              _wrap.classList.add('hovered');
              _phase = 2;
            }
          }, 200);
        }
        _actionBtn.style.color = _direction === 'advance' ? '#dcc8a0' : '#c0d8f0';
        _actionBtn.style.background = _direction === 'advance'
          ? 'rgba(100,80,40,0.5)' : 'rgba(60,80,120,0.5)';
        _actionBtn.style.borderColor = _direction === 'advance'
          ? 'rgba(200,170,100,0.4)' : 'rgba(140,180,220,0.4)';
      });

      // Phase 3: click button → full open + transition
      _actionBtn.addEventListener('click', function (e) {
        if (e) e.stopPropagation();
        _triggerPhase3();
      });

      _labelLayer.appendChild(_actionBtn);
    }
  }

  // ── Phase 3: full open + fire transition ───────────────────────

  function _triggerPhase3() {
    if (_phase === 3 || _transitioning || !_active || _nightLocked) return;

    _phase = 3;
    _transitioning = true;

    if (_wrap) {
      _wrap.classList.remove('hovered');
      _wrap.classList.add('opened');
    }

    // UI feedback — real DoorContractAudio sequence fires via FloorTransition
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('ui-confirm', { volume: 0.4 });
    }

    setTimeout(function () {
      if (!_transitioning) return; // cancelled by back press

      // Stairs dispatch to tryInteractStairs; doors to tryInteractDoor
      if (typeof FloorTransition !== 'undefined') {
        if (_isStair && FloorTransition.tryInteractStairs) {
          FloorTransition.tryInteractStairs(_facingX, _facingY);
        } else if (FloorTransition.tryInteractDoor) {
          FloorTransition.tryInteractDoor(_facingX, _facingY);
        }
      }

      setTimeout(function () {
        _destroyWrap();
        _resetState();
        if (_container) _container.style.opacity = '0';
      }, 300);
    }, OPEN_TO_TRANSITION_DELAY);
  }

  // ── Per-frame check ──────────────────────────────────────────

  function update(dt) {
    if (!_container) return;
    if (!MC) MC = (typeof MovementController !== 'undefined') ? MovementController : null;
    if (!MC) return;
    if (typeof FloorManager === 'undefined') return;

    // ── Input edge detection ──
    var IM = (typeof InputManager !== 'undefined') ? InputManager : null;
    var fwdDown = IM ? IM.isDown('step_forward') : false;
    var backDown = IM ? IM.isDown('step_back') : false;
    var fwdEdge = fwdDown && !_prevForward;
    var backEdge = backDown && !_prevBack;
    _prevForward = fwdDown;
    _prevBack = backDown;

    if (_transitioning) {
      if (backEdge) { _transitioning = false; _hide(); }
      return;
    }
    if (_active && backEdge) { _hide(); return; }
    if (_active && fwdEdge && _phase >= 1) { _triggerPhase3(); return; }

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
    if (!TILES.isDoor(tile) &&
        tile !== TILES.STAIRS_DN && tile !== TILES.STAIRS_UP &&
        tile !== TILES.TRAPDOOR_DN && tile !== TILES.TRAPDOOR_UP) {
      _hide(); return;
    }

    if (_active && _facingTile === tile && _facingX === fx && _facingY === fy) {
      return;
    }

    _facingTile = tile;
    _facingX = fx;
    _facingY = fy;
    _timer += dt;

    if (_timer >= SHOW_DELAY) {
      _show(tile, fx, fy, floorData);
    }
  }

  // ── Show (phase 1: closed) ──────────────────────────────────

  function _show(tile, fx, fy, floorData) {
    if (_active) _destroyWrap();

    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-popup', { volume: 0.4 });

    _active = true;
    _phase = 1;
    _timer = 0;
    _transitioning = false;

    // ── Classify tile ──
    _isStair = (tile === TILES.STAIRS_DN || tile === TILES.STAIRS_UP ||
                tile === TILES.TRAPDOOR_DN || tile === TILES.TRAPDOOR_UP);

    // ── Direction + target resolution (preserved from original DoorPeek) ──
    var currentId = FloorManager.getFloor();
    _targetId = null;
    _direction = 'advance';
    _nightLocked = false;

    if (tile === TILES.DOOR || tile === TILES.BOSS_DOOR || tile === TILES.DOOR_FACADE) {
      _direction = 'advance';
      var key = fx + ',' + fy;
      if (floorData.doorTargets && floorData.doorTargets[key]) {
        _targetId = floorData.doorTargets[key];
      }
    } else if (tile === TILES.DOOR_BACK || tile === TILES.DOOR_EXIT) {
      _direction = 'retreat';
      var exitKey = fx + ',' + fy;
      if (floorData.doorTargets && floorData.doorTargets[exitKey]) {
        _targetId = floorData.doorTargets[exitKey];
      }
    } else if (tile === TILES.STAIRS_DN || tile === TILES.TRAPDOOR_DN) {
      _direction = 'advance';
    } else if (tile === TILES.STAIRS_UP || tile === TILES.TRAPDOOR_UP) {
      _direction = 'retreat';
    }

    // ── Labels ──
    var targetLabel = '';
    if (_targetId && typeof FloorManager.getFloorLabel === 'function') {
      targetLabel = FloorManager.getFloorLabel(_targetId);
    }
    if (!targetLabel && _targetId) targetLabel = _targetId;

    var currentLabel = '';
    if (typeof FloorManager.getFloorLabel === 'function') {
      currentLabel = FloorManager.getFloorLabel(currentId);
    }
    if (!currentLabel) currentLabel = currentId;

    // ── Night-lock ──
    if (_targetId && typeof DayCycle !== 'undefined' && DayCycle.isNightLocked(_targetId)) {
      _nightLocked = true;
      var mPool = DayCycle.getMuffledBarkPool(_targetId);
      if (mPool && typeof BarkLibrary !== 'undefined') {
        BarkLibrary.fire(mPool);
      }
    }

    // ── Display label ──
    var displayLabel;
    if (_nightLocked) {
      displayLabel = '\uD83D\uDD12 Closed';
    } else {
      displayLabel = targetLabel;
      if (!displayLabel) {
        if (tile === TILES.STAIRS_DN || tile === TILES.TRAPDOOR_DN)
          displayLabel = (typeof i18n !== 'undefined') ? i18n.t('interact.descend', '\u25BC Descend') : '\u25BC Descend';
        else if (tile === TILES.STAIRS_UP || tile === TILES.TRAPDOOR_UP)
          displayLabel = (typeof i18n !== 'undefined') ? i18n.t('interact.ascend', '\u25B2 Ascend') : '\u25B2 Ascend';
        else if (tile === TILES.BOSS_DOOR)
          displayLabel = (typeof i18n !== 'undefined') ? i18n.t('interact.enter', '\u26A0 Boss') : '\u26A0 Boss';
        else
          displayLabel = _direction === 'advance'
            ? ((typeof i18n !== 'undefined') ? i18n.t('interact.enter', '\u25BA Enter') : '\u25BA Enter')
            : ((typeof i18n !== 'undefined') ? i18n.t('interact.exit', '\u25C4 Exit') : '\u25C4 Exit');
      }
    }

    // ── Glow color ──
    var glowColor;
    if (_nightLocked) {
      glowColor = 'rgba(100,100,140,0.4)';
    } else if (tile === TILES.BOSS_DOOR) {
      glowColor = 'rgba(220,60,40,0.5)';
    } else if (_direction === 'advance') {
      glowColor = 'rgba(255,200,80,0.6)';
    } else {
      glowColor = 'rgba(160,200,255,0.5)';
    }

    // ── Build DOM ──
    _wrap = _buildWrap();
    _wrap.style.zIndex = '1';
    _wrap.style.pointerEvents = 'none';
    _container.insertBefore(_wrap, _labelLayer);

    // Biome reskin
    if (_targetId) _applyBiomeSkin(_wrap, _targetId);
    _wrap.style.setProperty('--box-glow', glowColor);

    // Door leaf label
    var leafLabel = _wrap.querySelector('.sd-leaf-label');
    if (leafLabel) leafLabel.textContent = displayLabel;

    // Sub-label
    if (_nightLocked && _subLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode(targetLabel || 'building'));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode('come back in the morning'));
      _subLabel.style.color = 'rgba(180,170,150,0)';
    } else if (_subLabel && currentLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode('exiting ' + currentLabel));
      _subLabel.appendChild(document.createElement('br'));
      var arrow = _direction === 'advance' ? '\u21b3 ' : '\u21b0 ';
      _subLabel.appendChild(document.createTextNode(arrow + (targetLabel || (_isStair ? (_direction === 'advance' ? 'deeper' : 'above') : 'soon'))));
      _subLabel.style.color = 'rgba(180,170,150,0)';
    } else if (_subLabel) {
      _subLabel.textContent = '';
    }

    // Action button
    if (_actionBtn) {
      _actionBtn.style.opacity = '0';
      if (_nightLocked) {
        _actionBtn.style.display = 'none';
      } else {
        _actionBtn.style.display = '';
        if (_isStair) {
          _actionBtn.textContent = _direction === 'advance' ? 'Descend' : 'Ascend';
        } else {
          _actionBtn.textContent = _direction === 'advance' ? 'Enter' : 'Exit';
        }
        if (_direction === 'advance') {
          _actionBtn.style.color = '#dcc8a0';
          _actionBtn.style.background = 'rgba(100,80,40,0.5)';
          _actionBtn.style.borderColor = 'rgba(200,170,100,0.4)';
          _actionBtn.style.textShadow = '0 0 8px rgba(200,170,100,0.4)';
        } else {
          _actionBtn.style.color = '#c0d8f0';
          _actionBtn.style.background = 'rgba(60,80,120,0.5)';
          _actionBtn.style.borderColor = 'rgba(140,180,220,0.4)';
          _actionBtn.style.textShadow = '0 0 8px rgba(140,180,220,0.4)';
        }
      }
    }

    // Fade in
    _container.style.opacity = '1';

    // Auto-crack (phase 1→2) after brief settle
    setTimeout(function () {
      if (_active && _phase >= 1) {
        if (_subLabel) _subLabel.style.color = 'rgba(180,170,150,0.9)';
        if (_actionBtn && _actionBtn.style.display !== 'none') {
          _actionBtn.style.opacity = '1';
        }
        // Auto-advance to phase 2
        setTimeout(function () {
          if (_active && _phase === 1 && _wrap) {
            _wrap.classList.add('hovered');
            _phase = 2;
          }
        }, 200);
      }
    }, 150);
  }

  // ── Hide ──────────────────────────────────────────────────────

  function _hide() {
    if (!_active) { _timer = 0; return; }

    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-click', { volume: 0.3 });

    if (_wrap) {
      _wrap.classList.remove('opened', 'hovered');
    }
    _container.style.opacity = '0';
    if (_subLabel) _subLabel.style.color = 'rgba(180,170,150,0)';
    if (_actionBtn) _actionBtn.style.opacity = '0';

    setTimeout(function () {
      _destroyWrap();
    }, 400);

    _resetState();
  }

  function _resetState() {
    _active = false;
    _phase = 0;
    _facingTile = 0;
    _facingX = -1;
    _facingY = -1;
    _targetId = null;
    _direction = 'advance';
    _isStair = false;
    _nightLocked = false;
    _timer = 0;
    _transitioning = false;
  }

  function _destroyWrap() {
    if (_wrap && _wrap.parentNode) {
      _wrap.parentNode.removeChild(_wrap);
    }
    _wrap = null;
  }

  // ── Public API ─────────────────────────────────────────────────

  function forceHide() { _hide(); }

  return Object.freeze({
    init: init,
    update: update,
    forceHide: forceHide,
    isActive: function () { return _active; },
    getPhase: function () { return _phase; }
  });
})();
