/**
 * HUD — updates on-screen HUD elements (HP, energy, floor, cards).
 */
var HUD = (function () {
  'use strict';

  var _els = {};

  var _prevBattery = -1;  // Track previous battery for spent animation

  function init() {
    _els.hp = document.getElementById('hud-hp');
    _els.hpFill = document.getElementById('hud-hp-fill');
    _els.energy = document.getElementById('hud-energy');
    _els.energyFill = document.getElementById('hud-energy-fill');
    _els.floor = document.getElementById('hud-floor');
    _els.advantage = document.getElementById('hud-advantage');
    _els.combatOverlay = document.getElementById('combat-overlay');
    _els.combatLog = document.getElementById('combat-log');
    _els.floorTransition = document.getElementById('floor-transition');
    _els.floorTransitionText = document.getElementById('floor-transition-text');
    _els.batteryPips = document.getElementById('hud-battery-pips');
    _els.cardSlots = [];
    for (var i = 0; i < 5; i++) {
      _els.cardSlots.push(document.getElementById('card-' + i));
    }
  }

  function updatePlayer(player) {
    if (_els.hp) {
      _els.hp.textContent = player.hp + '/' + player.maxHp;
      var pct = (player.hp / player.maxHp * 100);
      _els.hpFill.style.width = pct + '%';
      _els.hpFill.style.background = pct < 30 ? '#f44' : pct < 60 ? '#fa4' : '#e44';
    }
    if (_els.energy) {
      _els.energy.textContent = player.energy + '/' + player.maxEnergy;
      _els.energyFill.style.width = (player.energy / player.maxEnergy * 100) + '%';
    }
    // Battery pips — always-visible compact row
    _updateBatteryPips(player);
  }

  /**
   * Render battery as discrete pip elements.
   * Detects spent pips (decrease from previous) and applies brief animation.
   * Uses signature check to skip DOM rebuild when nothing changed.
   */
  function _updateBatteryPips(player) {
    if (!_els.batteryPips) return;
    var cur = (typeof player.battery === 'number') ? player.battery : 0;
    var max = player.maxBattery || 10;

    // Signature check — skip rebuild if nothing changed
    var sig = cur + '/' + max;
    if (_els.batteryPips.dataset && _els.batteryPips.dataset.sig === sig) return;
    _els.batteryPips.dataset.sig = sig;

    // Detect which pips were just spent (for animation)
    var oldBat = _prevBattery;
    var spentFrom = (oldBat > cur && oldBat <= max) ? cur : -1;
    var spentCount = (spentFrom >= 0) ? (oldBat - cur) : 0;
    _prevBattery = cur;

    var html = '';
    for (var i = 0; i < max; i++) {
      var cls = 'hud-bat-pip';
      if (i < cur) {
        cls += ' full';
      } else if (spentFrom >= 0 && i >= spentFrom && i < spentFrom + spentCount) {
        cls += ' empty spent';
      } else {
        cls += ' empty';
      }
      html += '<span class="' + cls + '"></span>';
    }
    _els.batteryPips.innerHTML = html;
  }

  function updateFloor(floorNum, label) {
    if (_els.floor) {
      _els.floor.textContent = label ? (floorNum + ' - ' + label) : floorNum;
    }
  }

  function updateCards(hand) {
    for (var i = 0; i < 5; i++) {
      var slot = _els.cardSlots[i];
      if (!slot) continue;
      var card = hand ? hand[i] : null;
      if (card) {
        slot.classList.remove('empty');
        slot.children[0].textContent = card.emoji || '?';
        slot.children[1].textContent = card.name || '';
      } else {
        slot.classList.add('empty');
        slot.children[0].textContent = '-';
        slot.children[1].textContent = '';
      }
    }
  }

  function showCombatLog(text) {
    if (_els.combatOverlay) _els.combatOverlay.classList.add('active');
    if (_els.combatLog) _els.combatLog.textContent = text;
  }

  function hideCombat() {
    if (_els.combatOverlay) _els.combatOverlay.classList.remove('active');
  }

  function showFloorTransition(text) {
    if (_els.floorTransition) {
      _els.floorTransitionText.textContent = text || 'Descending...';
      _els.floorTransition.classList.add('active');
    }
  }

  function hideFloorTransition() {
    if (_els.floorTransition) _els.floorTransition.classList.remove('active');
  }

  function setAdvantage(text) {
    if (_els.advantage) _els.advantage.textContent = text || '';
  }

  /** Update only the battery pip row (lightweight, for mid-combat use). */
  function updateBattery(player) {
    _updateBatteryPips(player || ((typeof Player !== 'undefined') ? Player.state() : {}));
  }

  // ── C2: Readiness HUD bar (canvas-rendered) ──────────────────────
  // Rendered on dungeon floors (depth ≥ 3) showing floor readiness %.
  // Small bar in the upper-right corner of the viewport.
  //
  // §1.3 Animated behaviors (READINESS_BAR_ROADMAP):
  //   a) Interaction sweep — 200ms bright highlight preview during action
  //   b) Fill pump — 400ms ease-out lerp to new value + glow expansion
  //   c) Rescind slide — 800ms overshoot decay back to actual value
  //   d) Overhealing glow — teal overflow segment with aggressive pulse

  // ── Bar geometry ───────────────────────────────────────────────
  var _rdyW   = 120;  // Full width
  var _rdyH   = 14;   // Height (slightly taller for readability)
  var _rdyPad = 12;   // Right padding
  var _rdyY   = 10;   // Top offset
  var _rdyRad = 4;    // Corner radius

  // ── Colors (constellation tracer port) ─────────────────────────
  var _RDY_GOLD      = 'rgba(212,168,67,0.85)';   // Tether fill
  var _RDY_GOLD_GLOW = 'rgba(212,168,67,0.25)';   // Bloom halo
  var _RDY_SNAP      = 'rgba(255,220,100,1.0)';    // Sweep/flash highlight
  var _RDY_TEAL      = 'rgba(100,220,180,0.85)';   // Overhealing
  var _RDY_TEAL_GLOW = 'rgba(100,220,180,0.40)';   // Overheal pulse
  var _RDY_BG        = 'rgba(10,8,18,0.7)';         // Background
  var _RDY_TRACK     = 'rgba(60,55,50,0.8)';        // Empty track
  var _RDY_WARN      = '#ff9800';                    // Mid warning
  var _RDY_DANGER    = '#f44336';                    // Low danger

  // ── Animation state ────────────────────────────────────────────
  var _rdyPrevScore   = -1;     // Last known actual score
  var _rdyDisplayVal  = 0;      // Currently displayed fill (animated)
  var _rdyPrevFloor   = null;   // Reset animation on floor change

  // Sweep: bright preview highlight during readiness action
  var _rdySweepActive = false;
  var _rdySweepT      = 0;      // 0–1 progress through 200ms sweep
  var _rdySweepTarget = 0;      // projected new fill pct

  // Pump: ease-out lerp from old fill to new fill
  var _rdyPumpActive  = false;
  var _rdyPumpT       = 0;      // 0–1 progress through 400ms pump
  var _rdyPumpFrom    = 0;      // start value
  var _rdyPumpTo      = 0;      // end value (includes overshoot)

  // Rescind: overshoot decays back to actual value
  var _rdyRescindActive = false;
  var _rdyRescindT      = 0;    // 0–1 progress through 800ms decay
  var _rdyOvershoot     = 0;    // current overshoot amount

  // Glow: expansion during pump
  var _rdyGlowScale   = 1.0;
  var _rdyGlowT       = 0;

  // Tier crossing tracker (for notch tones)
  var _rdyLastTier    = -1;     // last crossed tier (0.25, 0.50, 0.75, 1.0)

  // Shimmer: idle sine-wave alpha on filled portion
  var _rdyShimmerPhase = 0;

  // ── Celebration state (tier-4 crossing) ─────────────────────────
  // Coin rain + constellation resolve + bar pulse.
  // Spawns a burst of gold particles that rain from the bar,
  // plus twinkling star sprites that trace the bar outline.
  var _celebActive     = false;
  var _celebT          = 0;      // 0→1 over 2400ms
  var _celebCoins      = [];     // { x, y, vx, vy, size, alpha, spin, emoji }
  var _celebStars      = [];     // { x, y, phase, size, alpha }
  var _celebPulseT     = 0;      // bar throb phase (0→1 over 600ms, repeats 3×)
  var _celebPulseCount = 0;
  var _celebPending    = false;  // set by tier crossing, consumed by render
  var _CELEB_DUR       = 2400;   // total celebration ms
  var _CELEB_PULSE_DUR = 600;    // per-pulse ms
  var _CELEB_PULSE_MAX = 3;      // number of pulse repetitions
  var _CELEB_COIN_COUNT = 18;    // particles to spawn
  var _CELEB_STAR_COUNT = 8;     // twinkling stars around bar
  var _COIN_EMOJIS      = ['\uD83E\uDE99', '\u2728', '\u2B50', '\uD83D\uDCAB']; // 🪙 ✨ ⭐ 💫

  function _spawnCelebration(barX, barY, barW, barH) {
    _celebActive = true;
    _celebT = 0;
    _celebPulseT = 0;
    _celebPulseCount = 0;
    _celebCoins = [];
    _celebStars = [];

    // Coins: erupt upward from bar, then rain down
    for (var i = 0; i < _CELEB_COIN_COUNT; i++) {
      _celebCoins.push({
        x:     barX + Math.random() * barW,
        y:     barY + barH * 0.5,
        vx:    (Math.random() - 0.5) * 2.5,
        vy:    -(2.5 + Math.random() * 3.0),    // upward burst
        size:  8 + Math.random() * 6,
        alpha: 0.9 + Math.random() * 0.1,
        spin:  Math.random() * Math.PI * 2,
        emoji: _COIN_EMOJIS[Math.floor(Math.random() * _COIN_EMOJIS.length)]
      });
    }

    // Stars: fixed twinkle points along the bar perimeter
    for (var s = 0; s < _CELEB_STAR_COUNT; s++) {
      var edge = Math.random();
      var sx, sy;
      if (edge < 0.5) {
        // Top/bottom edges
        sx = barX + Math.random() * barW;
        sy = edge < 0.25 ? barY - 4 : barY + barH + 4;
      } else {
        // Left/right edges
        sx = edge < 0.75 ? barX - 4 : barX + barW + 4;
        sy = barY + Math.random() * barH;
      }
      _celebStars.push({
        x: sx, y: sy,
        phase: Math.random() * Math.PI * 2,
        size: 6 + Math.random() * 5,
        alpha: 0
      });
    }
  }

  function _advanceCelebration(dt, ctx, barX, barY, barW, barH) {
    if (!_celebActive) return;

    _celebT += dt / _CELEB_DUR;
    if (_celebT >= 1) {
      _celebActive = false;
      return;
    }

    // ── Coin particles ──────────────────────────────────────────
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < _celebCoins.length; i++) {
      var c = _celebCoins[i];
      c.vy += 0.12;  // gravity
      c.x += c.vx;
      c.y += c.vy;
      c.spin += 0.08;

      // Fade out in last 40% of celebration
      if (_celebT > 0.6) {
        c.alpha = Math.max(0, c.alpha - dt * 0.003);
      }

      if (c.alpha <= 0) continue;

      ctx.globalAlpha = c.alpha;
      ctx.font = Math.round(c.size) + 'px serif';
      ctx.save();
      ctx.translate(c.x, c.y);
      // Gentle wobble (not full rotation — emojis look bad rotated)
      var wobble = Math.sin(c.spin) * 0.15;
      ctx.rotate(wobble);
      ctx.fillText(c.emoji, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // ── Twinkling stars ─────────────────────────────────────────
    ctx.save();
    for (var s = 0; s < _celebStars.length; s++) {
      var st = _celebStars[s];
      st.phase += dt * 0.008;

      // Fade in over first 20%, hold, fade out in last 30%
      if (_celebT < 0.2) {
        st.alpha = _celebT / 0.2;
      } else if (_celebT > 0.7) {
        st.alpha = (1 - _celebT) / 0.3;
      } else {
        st.alpha = 1;
      }

      var twinkle = 0.5 + 0.5 * Math.sin(st.phase);
      ctx.globalAlpha = st.alpha * twinkle;
      ctx.fillStyle = _RDY_SNAP; // bright gold
      ctx.beginPath();
      // 4-point star shape
      var sz = st.size * (0.7 + 0.3 * twinkle);
      _drawStar4(ctx, st.x, st.y, sz);
      ctx.fill();
    }
    ctx.restore();

    // ── Bar pulse (exaggerated throb) ───────────────────────────
    _celebPulseT += dt / _CELEB_PULSE_DUR;
    if (_celebPulseT >= 1) {
      _celebPulseT = 0;
      _celebPulseCount++;
    }
  }

  /** Draw a 4-pointed star (diamond sparkle). */
  function _drawStar4(ctx, cx, cy, r) {
    var inner = r * 0.3;
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + inner, cy - inner);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx + inner, cy + inner);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - inner, cy + inner);
    ctx.lineTo(cx - r, cy);
    ctx.lineTo(cx - inner, cy - inner);
    ctx.closePath();
  }

  /**
   * Extra credit coin drip — drop a single coin from the bar.
   * Reuses the celebration coin array so the render loop picks it up.
   */
  function _spawnExtraCreditCoin(barX, barY, barW, barH) {
    // If no celebration is active, start a lightweight one just for the coin
    if (!_celebActive) {
      _celebActive = true;
      _celebT = 0.5; // skip the star/pulse phase — just coins
      _celebPulseCount = _CELEB_PULSE_MAX; // no bar pulse for drip
      _celebCoins = [];
      _celebStars = [];
    }
    // Drop a single coin from a random X along the bar
    _celebCoins.push({
      x:     barX + Math.random() * barW,
      y:     barY + barH,
      vx:    (Math.random() - 0.5) * 0.8,
      vy:    0.3 + Math.random() * 0.5,   // gentle downward drift
      size:  9 + Math.random() * 4,
      alpha: 0.95,
      spin:  Math.random() * Math.PI * 2,
      emoji: '\uD83E\uDE99' // 🪙
    });
    // Reset celebration timer so it stays alive long enough for the coin to fall
    if (_celebT > 0.85) _celebT = 0.7;
  }

  // ── Animation timing constants ─────────────────────────────────
  var _RDY_SWEEP_DUR   = 200;   // ms — interaction preview
  var _RDY_PUMP_DUR    = 400;   // ms — fill lerp
  var _RDY_PUMP_HOLD   = 200;   // ms — hold at peak before rescind
  var _RDY_RESCIND_DUR = 800;   // ms — overshoot decay
  var _RDY_GLOW_DUR    = 400;   // ms — glow expand + contract
  var _RDY_OVERSHOOT   = 0.08;  // overshoot amount (8% visual emphasis)

  // ── Ease functions ─────────────────────────────────────────────
  function _easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function _easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }

  /**
   * Render the readiness progress bar on the canvas.
   * Called every frame from game.js render loop.
   *
   * §1 of READINESS_BAR_ROADMAP — constellation-tracer FX adapted.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW - Viewport width
   * @param {number} vpH - Viewport height
   * @param {string} floorId - Current floor ID
   */
  function renderReadinessBar(ctx, vpW, vpH, floorId) {
    if (!floorId) return;
    var depth = floorId.split('.').length;
    if (depth < 3) return;

    // ── Score query ────────────────────────────────────────────
    var actualScore = 0;
    var target = 0.6;
    var hasOrder = false;

    if (typeof WorkOrderSystem !== 'undefined') {
      var progress = WorkOrderSystem.getProgress(floorId);
      if (progress) {
        actualScore = progress.score;
        target = progress.target;
        hasOrder = true;
      }
    }

    if (!hasOrder && typeof ReadinessCalc !== 'undefined') {
      actualScore = ReadinessCalc.getScore(floorId);
    }

    actualScore = Math.max(0, actualScore);

    // ── Floor change reset ─────────────────────────────────────
    if (floorId !== _rdyPrevFloor) {
      _rdyPrevFloor = floorId;
      _rdyPrevScore = actualScore;
      _rdyDisplayVal = actualScore;
      _rdySweepActive = false;
      _rdyPumpActive = false;
      _rdyRescindActive = false;
      _rdyOvershoot = 0;
      _rdyGlowScale = 1.0;
      _rdyLastTier = _getTier(actualScore);
      _celebActive = false;
      _celebPending = false;
    }

    // ── Detect score change → trigger pump ─────────────────────
    var frameDt = 16; // approximate frame delta (60fps)
    if (typeof performance !== 'undefined' && performance._lastRdyFrame) {
      frameDt = Math.min(performance.now() - performance._lastRdyFrame, 100);
    }
    if (typeof performance !== 'undefined') {
      performance._lastRdyFrame = performance.now();
    }

    if (actualScore !== _rdyPrevScore && !_rdyPumpActive) {
      var delta = actualScore - _rdyPrevScore;
      if (delta > 0.001) {
        // Score increased → pump with overshoot
        _rdyPumpActive = true;
        _rdyPumpT = 0;
        _rdyPumpFrom = _rdyDisplayVal;
        _rdyPumpTo = actualScore + _RDY_OVERSHOOT;
        _rdyOvershoot = _RDY_OVERSHOOT;
        _rdyGlowScale = 1.0;
        _rdyGlowT = 0;
        _rdySweepActive = false; // sweep replaced by pump

        // Tier crossing check
        _checkTierCrossing(_rdyPrevScore, actualScore);

        // Extra credit coin drip — single coin per increment above 1.0
        if (actualScore > 1.0 && _rdyPrevScore >= 1.0) {
          _spawnExtraCreditCoin(vpW - _rdyW - _rdyPad, _rdyY, _rdyW, _rdyH);
        }
      } else if (delta < -0.001) {
        // Score decreased (rare — hero trashed floor) → snap down
        _rdyDisplayVal = actualScore;
        _rdyOvershoot = 0;
      }
      _rdyPrevScore = actualScore;
    }

    // ── Advance pump animation ─────────────────────────────────
    if (_rdyPumpActive) {
      _rdyPumpT += frameDt / _RDY_PUMP_DUR;
      if (_rdyPumpT >= 1) {
        _rdyPumpT = 1;
        _rdyPumpActive = false;
        _rdyDisplayVal = _rdyPumpTo;
        // Start rescind after hold
        _rdyRescindActive = true;
        _rdyRescindT = -(_RDY_PUMP_HOLD / _RDY_RESCIND_DUR); // negative = hold phase
      } else {
        _rdyDisplayVal = _rdyPumpFrom + (_rdyPumpTo - _rdyPumpFrom) * _easeOutCubic(_rdyPumpT);
      }

      // Glow expansion during pump
      _rdyGlowT += frameDt / _RDY_GLOW_DUR;
      if (_rdyGlowT < 0.5) {
        _rdyGlowScale = 1.0 + 0.05 * (_rdyGlowT / 0.5); // expand to 1.05
      } else if (_rdyGlowT < 1.0) {
        _rdyGlowScale = 1.05 - 0.05 * ((_rdyGlowT - 0.5) / 0.5); // contract back
      } else {
        _rdyGlowScale = 1.0;
      }
    }

    // ── Advance rescind animation ──────────────────────────────
    if (_rdyRescindActive) {
      _rdyRescindT += frameDt / _RDY_RESCIND_DUR;
      if (_rdyRescindT >= 1) {
        _rdyRescindActive = false;
        _rdyOvershoot = 0;
        _rdyDisplayVal = actualScore;
      } else if (_rdyRescindT > 0) {
        // Decay overshoot with ease-in-out
        _rdyOvershoot = _RDY_OVERSHOOT * (1 - _easeInOutSine(_rdyRescindT));
        _rdyDisplayVal = actualScore + _rdyOvershoot;
      }
      // During negative T (hold phase), displayVal stays at pump peak
    }

    // ── Idle shimmer ───────────────────────────────────────────
    _rdyShimmerPhase += frameDt * 0.003; // slow oscillation
    if (_rdyShimmerPhase > Math.PI * 2) _rdyShimmerPhase -= Math.PI * 2;
    var shimmerAlpha = 0.05 * Math.sin(_rdyShimmerPhase);

    // ── Compute fill widths ────────────────────────────────────
    var displayPct = Math.max(0, _rdyDisplayVal);
    var corePct    = Math.min(1, displayPct);
    var extraPct   = Math.max(0, displayPct - 1);

    var barX = vpW - _rdyW - _rdyPad;
    var barY = _rdyY;
    var coreFillW = Math.round(corePct * _rdyW);
    var extraFillW = Math.round(Math.min(1, extraPct) * _rdyW);

    // ── Spawn pending celebration ────────────────────────────────
    if (_celebPending) {
      _celebPending = false;
      _spawnCelebration(barX, barY, _rdyW, _rdyH);
    }

    // ── Celebration bar pulse scale ────────────────────────────
    var celebScale = 1.0;
    if (_celebActive && _celebPulseCount < _CELEB_PULSE_MAX) {
      var pulseT = _celebPulseT; // 0→1 per pulse cycle
      // Ease-out sine throb: scale 1.0 → 1.12 → 1.0
      celebScale = 1.0 + 0.12 * Math.sin(pulseT * Math.PI);
    }

    // ── Render ─────────────────────────────────────────────────
    ctx.save();

    // Apply celebration pulse — scale around bar center
    if (celebScale > 1.001) {
      var barCX = barX + _rdyW * 0.5;
      var barCY = barY + _rdyH * 0.5;
      ctx.translate(barCX, barCY);
      ctx.scale(celebScale, celebScale);
      ctx.translate(-barCX, -barCY);
    }

    // Glow halo (expanded during pump)
    if (_rdyGlowScale > 1.001 || coreFillW > 0) {
      var glowExpand = (_rdyGlowScale - 1.0) * _rdyW * 0.5;
      ctx.fillStyle = _RDY_GOLD_GLOW;
      ctx.globalAlpha = 0.3 + shimmerAlpha;
      ctx.fillRect(
        barX - 2 - glowExpand,
        barY - 2 - glowExpand,
        _rdyW + 4 + glowExpand * 2,
        _rdyH + 4 + glowExpand * 2
      );
    }

    ctx.globalAlpha = 0.85;

    // Background
    ctx.fillStyle = _RDY_BG;
    ctx.fillRect(barX - 2, barY - 2, _rdyW + 4, _rdyH + 4);

    // Empty track
    ctx.fillStyle = _RDY_TRACK;
    ctx.fillRect(barX, barY, _rdyW, _rdyH);

    // Filled bar — gold, with color tiers
    var coreColor = corePct >= target ? _RDY_GOLD
                  : corePct >= 0.4    ? _RDY_WARN
                  :                     _RDY_DANGER;
    ctx.fillStyle = coreColor;
    ctx.globalAlpha = 0.85 + shimmerAlpha;
    ctx.fillRect(barX, barY, coreFillW, _rdyH);

    // Sweep highlight (interaction preview)
    if (_rdySweepActive) {
      _rdySweepT += frameDt / _RDY_SWEEP_DUR;
      if (_rdySweepT >= 1) {
        _rdySweepActive = false;
      } else {
        var sweepX = barX + Math.round(_rdySweepT * _rdySweepTarget * _rdyW);
        ctx.fillStyle = _RDY_SNAP;
        ctx.globalAlpha = 0.8 * (1 - _rdySweepT); // fade out
        ctx.fillRect(sweepX - 1, barY, 3, _rdyH);
      }
    }

    // Pump flash at leading edge
    if (_rdyPumpActive && _rdyPumpT < 0.3) {
      var flashAlpha = 0.9 * (1 - _rdyPumpT / 0.3);
      ctx.fillStyle = _RDY_SNAP;
      ctx.globalAlpha = flashAlpha;
      ctx.fillRect(barX + coreFillW - 3, barY, 6, _rdyH);
    }

    ctx.globalAlpha = 0.85;

    // Overhealing segment (teal, below main bar)
    if (extraPct > 0) {
      var extraH = 4;
      // Aggressive pulse for overhealing (±15% alpha)
      var overhealPulse = 0.15 * Math.sin(_rdyShimmerPhase * 3);
      ctx.fillStyle = _RDY_TEAL;
      ctx.globalAlpha = 0.85 + overhealPulse;
      ctx.fillRect(barX, barY + _rdyH + 1, extraFillW, extraH);

      // Teal glow
      ctx.fillStyle = _RDY_TEAL_GLOW;
      ctx.globalAlpha = 0.2 + overhealPulse * 0.5;
      ctx.fillRect(barX - 1, barY + _rdyH, extraFillW + 2, extraH + 2);
    }

    ctx.globalAlpha = 0.85;

    // Target marker line
    if (hasOrder || target > 0) {
      var targetX = barX + Math.round(target * _rdyW);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(targetX, barY - 1);
      ctx.lineTo(targetX, barY + _rdyH + 1);
      ctx.stroke();
    }

    // Percentage label
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = extraPct > 0 ? 'rgba(100,220,180,0.95)' : '#e0d8c8';
    var labelPct = Math.round(actualScore * 100); // show actual, not animated
    var pctLabel = labelPct + '%';
    if (extraPct > 0) pctLabel += ' \u2605';
    ctx.fillText(pctLabel, barX - 6, barY + 1);

    // "READINESS" label
    ctx.textAlign = 'left';
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(200,190,170,0.7)';
    ctx.fillText('READINESS', barX, barY + _rdyH + (extraPct > 0 ? 8 : 4));

    ctx.restore();

    // ── Celebration overlay (coins + stars — drawn ABOVE bar) ──
    _advanceCelebration(frameDt, ctx, barX, barY, _rdyW, _rdyH);
  }

  /**
   * Trigger an interaction sweep preview on the readiness bar.
   * Called by cleaning, restocking, trap-rearm systems when an action starts.
   * The sweep shows a preview highlight across the projected new fill.
   *
   * @param {number} projectedScore — the score the bar will reach after this action
   */
  function triggerReadinessSweep(projectedScore) {
    _rdySweepActive = true;
    _rdySweepT = 0;
    _rdySweepTarget = Math.min(1, Math.max(0, projectedScore));
  }

  /**
   * Get the quarter-tier (0.25 steps) for a score.
   */
  function _getTier(score) {
    if (score >= 1.0) return 4;
    if (score >= 0.75) return 3;
    if (score >= 0.50) return 2;
    if (score >= 0.25) return 1;
    return 0;
  }

  /**
   * Check if a tier boundary was crossed and play notch tone.
   */
  function _checkTierCrossing(oldScore, newScore) {
    var oldTier = _getTier(oldScore);
    var newTier = _getTier(newScore);
    if (newTier > oldTier) {
      _rdyLastTier = newTier;
      // Play tier tone (stub audio calls)
      if (typeof AudioSystem !== 'undefined' && AudioSystem.playSFX) {
        if (newTier === 4) {
          AudioSystem.playSFX('readiness-fanfare');
          // Celebration FX — coin rain + bar pulse (spawned on next render)
          _celebPending = true;
          // Dragonfire exit Toast (delayed 400ms so celebration lands first)
          setTimeout(function () {
            if (typeof Toast !== 'undefined') {
              Toast.show(
                '\uD83D\uDD25 ' + (typeof i18n !== 'undefined'
                  ? i18n.t('readiness.exit_enabled', 'Dragonfire exit enabled!')
                  : 'Dragonfire exit enabled!'),
                'success'
              );
            }
          }, 400);
        } else {
          AudioSystem.playSFX('readiness-notch');
        }
      }
    }
  }

  return {
    init: init,
    updatePlayer: updatePlayer,
    updateBattery: updateBattery,
    updateFloor: updateFloor,
    updateCards: updateCards,
    showCombatLog: showCombatLog,
    hideCombat: hideCombat,
    showFloorTransition: showFloorTransition,
    hideFloorTransition: hideFloorTransition,
    setAdvantage: setAdvantage,
    renderReadinessBar: renderReadinessBar,
    triggerReadinessSweep: triggerReadinessSweep
  };
})();
