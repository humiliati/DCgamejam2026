/**
 * ArchPeek — Double-door peek animation for ARCH_DOORWAY portal tiles.
 *
 * 3-phase animation sequence:
 *   Phase 1 (closed): Player faces an ARCH_DOORWAY with a doorTarget.
 *     Doors appear closed. Sub-label + "Enter" button visible.
 *   Phase 2 (hovered): Mouse hovers over the Enter button.
 *     Doors crack open (~23°/33°). Labels appear on door leaves.
 *   Phase 3 (opened + transition): Forward arrow pressed OR button clicked.
 *     Doors swing fully open (101°/104°), glow sources appear,
 *     door contract SFX plays, floor transition fires.
 *     Backward arrow at any point → close animation + cleanup.
 *
 * CSS from BoxForge v2.1 DOUBLE_DOORS_ANIMATION reference.
 * DOM: 5 structural panes, 2 door leaves, 4 glow sources.
 *
 * Modular:
 *   - Biome reskin via CSS custom properties from target floor colors
 *   - Floor labels: "to [Floor Name]" on each door leaf
 *   - Action button: Magic Remote clickable
 *
 * Layer 3 (same as DoorPeek)
 * Depends on: TILES, Player, MovementController, FloorManager, i18n,
 *             InputManager (for forward/back edge detection)
 */
var ArchPeek = (function () {
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
  var _targetId   = null;  // Destination floor ID (stored on show for phase 3)
  var _timer      = 0;
  var _transitioning = false; // Lock: phase 3 fired, waiting for cleanup
  var _container  = null;
  var _wrap       = null;
  var _subLabel   = null;
  var _actionBtn  = null;
  var _labelLayer = null;
  var _styleInjected = false;

  // Forward/back edge tracking (ArchPeek runs after InputPoll, so we
  // can't consume downEdge. Track our own edges via isDown deltas.)
  var _prevForward = false;
  var _prevBack    = false;

  // ── CSS injection ────────────────────────────────────────────────

  function _injectCSS() {
    if (_styleInjected) return;
    _styleInjected = true;

    var css =
      '/* === ArchPeek: double-doors variant (600x570, depth 92) === */\n' +
      '.box3d-wrap.double-doors-variant {\n' +
      '  --dd-w: 600px; --dd-h: 570px;\n' +
      '  --box-d: 46px; --box-half: -46px;\n' +
      '  --bevel-w: 2px;\n' +
      '  --box-dark: #0a0a08; --box-dark2: #000000;\n' +
      '  --box-light: #3a4030; --box-floor: #1a1812;\n' +
      '  --box-ceil: #2a3020;\n' +
      '  --box-glow: rgba(220,200,160,0.6);\n' +
      '  --dd-door-light: #6e4828; --dd-door-dark: #502a0a;\n' +
      '  --dd-door2-light: #5e4026; --dd-door2-dark: #402208;\n' +
      '  --dd-jam-bg: linear-gradient(to top, #1c2212, #3a4030 40%, #1c2212 70%, #1c2212);\n' +
      '  --dd-lintel-bg: linear-gradient(to top, #0c1202, #2a3020 40%, #0c1202 70%, #0c1202);\n' +
      '  --perspective: 800px;\n' +
      '  perspective: 800px;\n' +
      '  width: 600px; height: 570px;\n' +
      '  position: relative;\n' +
      '  transform-style: preserve-3d;\n' +
      '}\n' +
      '.box3d-wrap.double-doors-variant .box3d-scene {\n' +
      '  width: 600px; height: 570px;\n' +
      '  transform: rotateX(5deg) rotateY(-7deg);\n' +
      '  transform-style: preserve-3d;\n' +
      '  position: relative;\n' +
      '}\n' +
      '.box3d-wrap.double-doors-variant .box3d-spin {\n' +
      '  width: 600px; height: 570px;\n' +
      '  transform-style: preserve-3d;\n' +
      '  position: relative;\n' +
      '}\n' +
      '.double-doors-variant .box3d-body {\n' +
      '  width: 600px; height: 570px;\n' +
      '  transform-style: preserve-3d;\n' +
      '  position: relative;\n' +
      '}\n' +
      '\n' +
      '/* Back (hidden - void shows through glow) */\n' +
      '.box3d-wrap.double-doors-variant .bf-back {\n' +
      '  width: 600px; height: 570px;\n' +
      '  background: transparent;\n' +
      '  transform: translateZ(-46px) translate(0px,0px);\n' +
      '  display: none; position: absolute;\n' +
      '}\n' +
      '/* Left Jam */\n' +
      '.box3d-wrap.double-doors-variant .bf-left {\n' +
      '  width: 92px; height: 570px;\n' +
      '  left: 254px; top: 0px;\n' +
      '  background: var(--dd-jam-bg);\n' +
      '  transform: translate(-304px,0px) rotateY(90deg) translateZ(0px);\n' +
      '  position: absolute;\n' +
      '}\n' +
      '/* Right Jam */\n' +
      '.box3d-wrap.double-doors-variant .bf-right {\n' +
      '  width: 92px; height: 570px;\n' +
      '  left: 254px; top: 0px;\n' +
      '  background: var(--dd-jam-bg);\n' +
      '  transform: translate(302px,0px) rotateY(90deg) translateZ(0px);\n' +
      '  position: absolute;\n' +
      '}\n' +
      '/* Lintel (top) */\n' +
      '.box3d-wrap.double-doors-variant .bf-top {\n' +
      '  width: 600px; height: 92px;\n' +
      '  left: 0px; top: 239px;\n' +
      '  background: var(--dd-lintel-bg);\n' +
      '  transform: translate(0px,2px) rotateX(90deg) translateZ(285px) translateY(0px);\n' +
      '  position: absolute;\n' +
      '}\n' +
      '/* Sill (bottom) */\n' +
      '.box3d-wrap.double-doors-variant .bf-bottom {\n' +
      '  width: 600px; height: 92px;\n' +
      '  left: 0px; top: 239px;\n' +
      '  background: repeating-linear-gradient(0deg, transparent 0px, transparent 11px, rgba(0,0,0,0.35) 11px, rgba(0,0,0,0.35) 12px), repeating-linear-gradient(90deg, transparent 0px, transparent 11px, rgba(0,0,0,0.35) 11px, rgba(0,0,0,0.35) 12px), var(--box-floor);\n' +
      '  transform: translate(0px,1px) rotateX(90deg) translateZ(-285px) translateY(0px);\n' +
      '  position: absolute;\n' +
      '}\n' +
      '\n' +
      '/* Lid: Left Door (300x570, hinge: left) */\n' +
      '.box3d-wrap.double-doors-variant .box3d-lid-wrap--0 {\n' +
      '  position: absolute; transform-style: preserve-3d;\n' +
      '  width: 300px; height: 570px;\n' +
      '  left: 150px; top: 0px;\n' +
      '  transform: translateZ(46px) translate(-150px,0px);\n' +
      '}\n' +
      '.box3d-wrap.double-doors-variant .box3d-lid--0 {\n' +
      '  width: 300px; height: 570px;\n' +
      '  background: repeating-linear-gradient(0deg, var(--dd-door-light) 0px, var(--dd-door-light) 8px, var(--dd-door-dark) 8px, var(--dd-door-dark) 9px);\n' +
      '  transform-origin: 0px center;\n' +
      '  transition: transform 0.4s cubic-bezier(0.33, 1, 0.68, 1);\n' +
      '  position: relative;\n' +
      '}\n' +
      '.box3d-wrap.double-doors-variant.hovered .box3d-lid--0 {\n' +
      '  transform: rotateY(-23deg);\n' +
      '}\n' +
      '.box3d-wrap.double-doors-variant.opened .box3d-lid--0 {\n' +
      '  transform: rotateY(-101deg);\n' +
      '}\n' +
      '\n' +
      '/* Lid: Right Door (300x570, hinge: right) */\n' +
      '.box3d-wrap.double-doors-variant .box3d-lid-wrap--1 {\n' +
      '  position: absolute; transform-style: preserve-3d;\n' +
      '  width: 300px; height: 570px;\n' +
      '  left: 150px; top: 0px;\n' +
      '  transform: translateZ(46px) translate(150px,0px);\n' +
      '}\n' +
      '.box3d-wrap.double-doors-variant .box3d-lid--1 {\n' +
      '  width: 300px; height: 570px;\n' +
      '  background: repeating-linear-gradient(0deg, var(--dd-door2-light) 0px, var(--dd-door2-light) 8px, var(--dd-door2-dark) 8px, var(--dd-door2-dark) 9px);\n' +
      '  transform-origin: 300px center;\n' +
      '  transition: transform 0.4s cubic-bezier(0.33, 1, 0.68, 1);\n' +
      '  position: relative;\n' +
      '}\n' +
      '.box3d-wrap.double-doors-variant.hovered .box3d-lid--1 {\n' +
      '  transform: rotateY(33deg);\n' +
      '}\n' +
      '.box3d-wrap.double-doors-variant.opened .box3d-lid--1 {\n' +
      '  transform: rotateY(104deg);\n' +
      '}\n' +
      '\n' +
      '/* Glow sources */\n' +
      '.double-doors-glow {\n' +
      '  position: absolute;\n' +
      '  width: 840px; height: 798px;\n' +
      '  left: calc(50% - 420px);\n' +
      '  top: calc(50% - 399px);\n' +
      '  background: radial-gradient(ellipse, var(--box-glow) 0%, transparent 70%);\n' +
      '  filter: blur(18px);\n' +
      '  pointer-events: none;\n' +
      '  opacity: 0; transition: opacity 0.4s ease 0.15s;\n' +
      '}\n' +
      '.box3d-wrap.double-doors-variant.opened .double-doors-glow {\n' +
      '  opacity: 1;\n' +
      '}\n' +
      '.double-doors-glow--0 { transform: translateZ(0px) rotateX(90deg); }\n' +
      '.double-doors-glow--1 { transform: translateZ(0px) rotateX(0deg); }\n' +
      '.double-doors-glow--2 { transform: translateZ(0px) rotateY(60deg); }\n' +
      '.double-doors-glow--3 { transform: translateZ(0px) rotateY(120deg); }\n' +
      '\n' +
      '/* Door leaf labels */\n' +
      '.dd-leaf-label {\n' +
      '  position: absolute; top: 50%; left: 50%;\n' +
      '  transform: translate(-50%, -50%);\n' +
      '  font: bold 28px monospace;\n' +
      '  color: rgba(220,200,160,0.8);\n' +
      '  text-shadow: 0 0 12px rgba(200,180,140,0.4);\n' +
      '  white-space: nowrap; pointer-events: none;\n' +
      '  writing-mode: vertical-rl;\n' +
      '  opacity: 0; transition: opacity 0.3s ease;\n' +
      '}\n' +
      '.dd-leaf-label--left { text-orientation: mixed; direction: rtl; }\n' +
      '.dd-leaf-label--right { text-orientation: mixed; direction: ltr; }\n' +
      '.box3d-wrap.double-doors-variant.hovered .dd-leaf-label,\n' +
      '.box3d-wrap.double-doors-variant.opened .dd-leaf-label {\n' +
      '  opacity: 1;\n' +
      '}\n' +
      '\n' +
      '/* Fade-in for the whole container */\n' +
      '#arch-peek-container {\n' +
      '  transition: opacity 0.3s ease;\n' +
      '}\n';

    var el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ── DOM builder ────────────────────────────────────────────────────

  function _buildWrap() {
    var wrap = document.createElement('div');
    wrap.className = 'box3d-wrap double-doors-variant';

    wrap.innerHTML =
      '<div class="box3d-scene">' +
        '<div class="box3d-spin">' +
          '<div class="box3d-body">' +
            '<div class="bf-back"></div>' +
            '<div class="bf-left"></div>' +
            '<div class="bf-right"></div>' +
            '<div class="bf-top"></div>' +
            '<div class="bf-bottom"></div>' +
            '<div class="box3d-lid-wrap--0">' +
              '<div class="box3d-lid--0">' +
                '<span class="dd-leaf-label dd-leaf-label--left"></span>' +
              '</div>' +
            '</div>' +
            '<div class="box3d-lid-wrap--1">' +
              '<div class="box3d-lid--1">' +
                '<span class="dd-leaf-label dd-leaf-label--right"></span>' +
              '</div>' +
            '</div>' +
            '<div class="double-doors-glow double-doors-glow--0"></div>' +
            '<div class="double-doors-glow double-doors-glow--1"></div>' +
            '<div class="double-doors-glow double-doors-glow--2"></div>' +
            '<div class="double-doors-glow double-doors-glow--3"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    return wrap;
  }

  // ── Biome reskin ──────────────────────────────────────────────────

  function _applyBiomeSkin(wrap, targetFloor) {
    var colors = null;
    if (typeof FloorManager !== 'undefined' && FloorManager.getBiomeColors) {
      colors = FloorManager.getBiomeColors(targetFloor);
    }
    if (!colors) return;

    wrap.style.setProperty('--dd-door-light', colors.door);
    wrap.style.setProperty('--dd-door-dark', colors.doorDark);
    wrap.style.setProperty('--dd-door2-light', colors.door);
    wrap.style.setProperty('--dd-door2-dark', colors.doorDark);

    var jBg = 'linear-gradient(to top, ' + colors.wallDark + ', ' +
      colors.wallLight + ' 40%, ' + colors.wallDark + ' 70%, ' + colors.wallDark + ')';
    wrap.style.setProperty('--dd-jam-bg', jBg);
    wrap.style.setProperty('--dd-lintel-bg', jBg);

    wrap.style.setProperty('--box-floor', colors.floor);
    wrap.style.setProperty('--box-ceil', colors.ceil);
    wrap.style.setProperty('--box-glow', 'rgba(220,200,160,0.6)');
  }

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    _injectCSS();

    _container = document.getElementById('arch-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'arch-peek-container';
      _container.style.cssText =
        'position:absolute; top:40%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'z-index:18; pointer-events:none; opacity:0;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    _labelLayer = document.getElementById('arch-peek-labels');
    if (!_labelLayer) {
      _labelLayer = document.createElement('div');
      _labelLayer.id = 'arch-peek-labels';
      _labelLayer.style.cssText =
        'position:absolute; top:0; left:0; width:100%; height:100%;' +
        'z-index:2; pointer-events:none;';
      _container.appendChild(_labelLayer);
    }

    _subLabel = document.getElementById('arch-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'arch-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:60px; text-align:center;' +
        'font:20px monospace; color:rgba(180,170,150,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.7);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.4;';
      _labelLayer.appendChild(_subLabel);
    }

    _actionBtn = document.getElementById('arch-peek-action');
    if (!_actionBtn) {
      _actionBtn = document.createElement('button');
      _actionBtn.id = 'arch-peek-action';
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

      // Hover over button → cycle the crack animation (visual feedback).
      // Phase 2 is auto-applied on adjacency, so hover replays the
      // close/open cycle as a tactile cue that the button is interactive.
      _actionBtn.addEventListener('mouseenter', function () {
        if (_phase >= 1 && _phase < 3 && _wrap) {
          _wrap.classList.add('hovered');
          _phase = 2;
        }
        _actionBtn.style.borderColor = '#dcc8a0';
        _actionBtn.style.color = '#fff';
        _actionBtn.style.background = 'rgba(140,120,60,0.6)';
      });
      _actionBtn.addEventListener('mouseleave', function () {
        if (_phase === 2 && _wrap) {
          _wrap.classList.remove('hovered');
          // Snap back to closed briefly, then re-crack (adjacency auto-opens)
          _phase = 1;
          setTimeout(function () {
            if (_active && _phase === 1 && _wrap) {
              _wrap.classList.add('hovered');
              _phase = 2;
            }
          }, 200);
        }
        _actionBtn.style.borderColor = 'rgba(200,170,100,0.4)';
        _actionBtn.style.color = '#dcc8a0';
        _actionBtn.style.background = 'rgba(100,80,40,0.5)';
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
    if (_phase === 3 || _transitioning || !_active) return;

    _phase = 3;
    _transitioning = true;

    // Apply opened state (doors swing fully, glow appears)
    if (_wrap) {
      _wrap.classList.remove('hovered');
      _wrap.classList.add('opened');
    }

    // UI feedback for the swing animation — the real DoorContractAudio
    // sequence (DoorOpen → Ascend/Descend → DoorClose) fires inside
    // FloorTransition.tryInteractDoor() once the delay expires.
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('ui-confirm', { volume: 0.4 });
    }

    // After the CSS animation plays, fire the floor transition
    setTimeout(function () {
      if (!_transitioning) return; // cancelled by back press

      // Fire transition via FloorTransition
      if (typeof FloorTransition !== 'undefined' && FloorTransition.tryInteractDoor) {
        FloorTransition.tryInteractDoor(_facingX, _facingY);
      }

      // Cleanup after transition overlay takes over
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

    // ── Input edge detection (forward / back) ──
    var IM = (typeof InputManager !== 'undefined') ? InputManager : null;
    var fwdDown = IM ? IM.isDown('step_forward') : false;
    var backDown = IM ? IM.isDown('step_back') : false;
    var fwdEdge = fwdDown && !_prevForward;
    var backEdge = backDown && !_prevBack;
    _prevForward = fwdDown;
    _prevBack = backDown;

    // If phase 3 is in progress, only allow back to cancel
    if (_transitioning) {
      if (backEdge) {
        _transitioning = false;
        _hide();
      }
      return;
    }

    // ── Back arrow at any phase → close and cleanup ──
    if (_active && backEdge) {
      _hide();
      return;
    }

    // ── Forward arrow while active → trigger phase 3 ──
    if (_active && fwdEdge && _phase >= 1) {
      _triggerPhase3();
      return;
    }

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

    // Only fire for ARCH_DOORWAY tiles that have a doorTarget
    if (tile !== TILES.ARCH_DOORWAY) { _hide(); return; }
    var dtKey = fx + ',' + fy;
    if (!floorData.doorTargets || !floorData.doorTargets[dtKey]) { _hide(); return; }

    // Already showing this exact tile
    if (_active && _facingTile === tile && _facingX === fx && _facingY === fy) {
      return;
    }

    // New tile or first encounter — debounce
    _facingTile = tile;
    _facingX = fx;
    _facingY = fy;
    _timer += dt;

    if (_timer >= SHOW_DELAY) {
      _show(tile, fx, fy, floorData);
    }
  }

  // ── Show (phase 1: closed doors) ──────────────────────────────

  function _show(tile, fx, fy, floorData) {
    if (_active) _destroyWrap();

    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-popup', { volume: 0.4 });

    _active = true;
    _phase = 1;   // Phase 1: closed
    _timer = 0;
    _transitioning = false;

    // Resolve target floor
    var currentId = FloorManager.getFloor();
    _targetId = null;
    var key = fx + ',' + fy;
    if (floorData.doorTargets && floorData.doorTargets[key]) {
      _targetId = floorData.doorTargets[key];
    }

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

    // Build DOM — doors start CLOSED (no .hovered, no .opened)
    _wrap = _buildWrap();
    _wrap.style.zIndex = '1';
    _wrap.style.pointerEvents = 'none';
    _container.insertBefore(_wrap, _labelLayer);

    // Biome reskin from target floor
    if (_targetId) _applyBiomeSkin(_wrap, _targetId);

    // Door leaf labels
    var leftLabel = _wrap.querySelector('.dd-leaf-label--left');
    var rightLabel = _wrap.querySelector('.dd-leaf-label--right');
    var labelText = targetLabel ? ('to ' + targetLabel) : 'Enter';
    if (leftLabel) leftLabel.textContent = labelText;
    if (rightLabel) rightLabel.textContent = labelText;

    // Sub-label
    if (_subLabel && currentLabel && targetLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode('exiting ' + currentLabel));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode('\u21b3 ' + targetLabel));
      _subLabel.style.color = 'rgba(180,170,150,0)';
    } else if (_subLabel) {
      _subLabel.textContent = '';
    }

    // Show button immediately (phase 1 — player can hover or press forward)
    if (_actionBtn) {
      _actionBtn.style.display = '';
      _actionBtn.textContent = 'Enter';
    }

    // Fade in container
    _container.style.opacity = '1';

    // Fade in sub-label + button after brief settle, then auto-crack
    // doors open (phase 1→2). This is the adjacency animation — player
    // sees doors swing to crack position automatically. Forward input
    // or button click triggers phase 3 (full open + transition).
    setTimeout(function () {
      if (_active && _phase >= 1) {
        if (_subLabel) _subLabel.style.color = 'rgba(180,170,150,0.9)';
        if (_actionBtn) _actionBtn.style.opacity = '1';

        // Auto-advance to phase 2 (crack open) after labels appear
        setTimeout(function () {
          if (_active && _phase === 1 && _wrap) {
            _wrap.classList.add('hovered');
            _phase = 2;
          }
        }, 200);
      }
    }, 150);
  }

  // ── Hide (close + cleanup) ────────────────────────────────────

  function _hide() {
    if (!_active) { _timer = 0; return; }

    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-click', { volume: 0.3 });

    // Reverse animation: opened → hovered → closed → fade out
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
