/**
 * StackPreview — live player-facing readout of the stack the player is
 * currently building. Answers the question "what will fire if I thrust
 * right now?" without the player having to mentally multiply str +
 * stack bonus + mono bonus + thrust + suit RPS.
 *
 * This module is intentionally read-only: it never mutates CardStack,
 * CombatEngine, or SynergyEngine. It snapshots their state each frame
 * during the stacking/selecting phase and renders a small HUD panel.
 *
 * Render data shown:
 *   - Estimated damage (mirrors fireStack math exactly — thrust is now
 *     applied once at the sum level so str/cards/stack bonus all scale
 *     linearly with thrust, as the original design intended)
 *   - Suit RPS label against the current enemy (⚔️ strong / ⚠️ weak)
 *   - Mono-suit bonus chip when all cards share a suit
 *   - Shared synergy tags that unlock further stacking
 *   - Thrust reading (current multiplier + cap)
 *   - Incoming enemy damage (after the player's stack defense would
 *     absorb it) so the player can plan trades
 *
 * Lifecycle:
 *   init()           → once at boot, mounts DOM into #combat-overlay
 *   show() / hide()  → called by combat-bridge when combat starts/ends
 *   tick()           → called once per frame during combat update
 *
 * This module has NO required dependencies — every cross-module call
 * is guarded with typeof checks, so running with the module disabled
 * (script tag removed) is a no-op.
 */
var StackPreview = (function () {
  'use strict';

  var _root       = null;   // Outer <div id="stack-preview">
  var _dmgEl      = null;   // Big damage numeral
  var _dmgBreak   = null;   // Breakdown line "2 str +3 +mono +thrust"
  var _suitEl     = null;   // Suit RPS chip
  var _monoEl     = null;   // Mono-suit chip
  var _tagsEl     = null;   // Shared-tag chip strip
  var _thrustEl   = null;   // Thrust readout "1.2× / 1.5×"
  var _incomingEl = null;   // Incoming enemy damage readout
  var _visible    = false;
  var _active     = false;  // true while combat is running

  // ── DOM construction ──────────────────────────────────────────────

  function init() {
    if (_root) return;

    var host = document.getElementById('combat-overlay');
    if (!host) {
      console.warn('[StackPreview] #combat-overlay not found — preview disabled');
      return;
    }

    _root = document.createElement('div');
    _root.id = 'stack-preview';
    _root.style.cssText = [
      'position:absolute',
      'top:48px',
      'right:32px',
      'min-width:220px',
      'max-width:320px',
      'padding:12px 16px',
      'background:rgba(12,18,14,0.82)',
      'border:1px solid rgba(102,255,170,0.35)',
      'border-radius:6px',
      'font-family:var(--font-terminal, monospace)',
      'color:var(--phosphor-bright, #66ffaa)',
      'text-shadow:0 0 6px var(--phosphor-glow, rgba(51,255,136,0.25))',
      'pointer-events:none',
      'display:none',
      'line-height:1.25',
      'z-index:5'
    ].join(';');

    // ── Big damage numeral ──
    var dmgRow = document.createElement('div');
    dmgRow.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px';

    var dmgLabel = document.createElement('span');
    dmgLabel.textContent = 'STACK';
    dmgLabel.style.cssText = 'font-size:12px;letter-spacing:0.15em;opacity:0.7';
    dmgRow.appendChild(dmgLabel);

    _dmgEl = document.createElement('span');
    _dmgEl.style.cssText = 'font-size:32px;font-weight:bold;color:#ffe066;text-shadow:0 0 10px rgba(255,224,102,0.5)';
    _dmgEl.textContent = '0';
    dmgRow.appendChild(_dmgEl);

    _root.appendChild(dmgRow);

    // ── Breakdown line ──
    _dmgBreak = document.createElement('div');
    _dmgBreak.style.cssText = 'font-size:11px;opacity:0.65;margin-bottom:8px;min-height:14px';
    _root.appendChild(_dmgBreak);

    // ── Suit RPS chip ──
    _suitEl = document.createElement('div');
    _suitEl.style.cssText = 'font-size:13px;margin-bottom:3px;min-height:16px';
    _root.appendChild(_suitEl);

    // ── Mono-suit chip ──
    _monoEl = document.createElement('div');
    _monoEl.style.cssText = 'font-size:13px;margin-bottom:3px;min-height:16px';
    _root.appendChild(_monoEl);

    // ── Shared tags strip ──
    _tagsEl = document.createElement('div');
    _tagsEl.style.cssText = 'font-size:11px;opacity:0.85;margin-bottom:6px;min-height:14px;letter-spacing:0.05em';
    _root.appendChild(_tagsEl);

    // ── Thrust + incoming footer ──
    var footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;opacity:0.7;border-top:1px solid rgba(102,255,170,0.2);padding-top:5px';

    _thrustEl = document.createElement('span');
    _thrustEl.textContent = '⚡ 1.0×';
    footer.appendChild(_thrustEl);

    _incomingEl = document.createElement('span');
    _incomingEl.textContent = '';
    _incomingEl.style.cssText = 'color:#ff8866';
    footer.appendChild(_incomingEl);

    _root.appendChild(footer);
    host.appendChild(_root);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  function show() {
    _active = true;
    if (!_root) init();
    if (!_root) return;
    _root.style.display = 'block';
    _visible = true;
    refresh();
  }

  function hide() {
    _active = false;
    if (_root) _root.style.display = 'none';
    _visible = false;
  }

  function isVisible() { return _visible; }

  // ── Per-frame tick (called from CombatBridge.update) ──────────────

  function tick() {
    if (!_active || !_root) return;

    // Only show during phases where the player is actively building.
    // countdown = narration, resolving/post_resolve = damage exchange,
    // victory/defeat = combat ending. Preview is meaningless in those.
    if (typeof CombatEngine === 'undefined' || !CombatEngine.isActive()) {
      if (_visible) { _root.style.display = 'none'; _visible = false; }
      return;
    }
    var phase = CombatEngine.getPhase();
    var shouldShow = (phase === 'stacking' || phase === 'selecting');
    if (shouldShow && !_visible) {
      _root.style.display = 'block';
      _visible = true;
    } else if (!shouldShow && _visible) {
      _root.style.display = 'none';
      _visible = false;
    }
    if (!_visible) return;

    refresh();
  }

  /**
   * Pure computation — returns the live damage estimate and breakdown
   * for whatever stack is currently built, without touching the DOM.
   * Mirrors CombatEngine.fireStack's damage pipeline exactly so any
   * consumer (StackPreview HUD, CardFan accessibility label, combat
   * log) reads from one source of truth.
   *
   * Returns null when there's no active combat or no player/enemy.
   */
  function getEstimate() {
    if (typeof CardStack === 'undefined' || typeof CombatEngine === 'undefined') return null;
    if (!CombatEngine.isActive || !CombatEngine.isActive()) return null;

    var enemy  = CombatEngine.getEnemy();
    var pState = (typeof Player !== 'undefined') ? Player.state() : null;
    if (!enemy || !pState) return null;

    var fx = CardStack.computeStackEffects();
    var stackSize = fx.stackSize || 0;

    if (stackSize === 0) {
      return {
        hasStack: false,
        damage: pState.str || 0,
        stackSize: 0,
        str: pState.str || 0,
        cardDmg: 0,
        stackSizeBonus: 0,
        thrust: fx.thrust || 1,
        suitMult: 1.0,
        suitLabel: '',
        suitAdv: null,
        mono: { monoSuit: false, suit: null, bonus: 0 },
        advantage: CombatEngine.getAdvantage(),
        sharedTags: [],
        fx: fx
      };
    }

    var dmg = (pState.str || 0) + (fx.damage || 0);
    var stackSizeBonus = 0;
    if (stackSize > 1) {
      stackSizeBonus = stackSize - 1;
      dmg += stackSizeBonus;
    }

    var thrust = fx.thrust || 1;
    if (thrust > 1.01) dmg = Math.floor(dmg * thrust);

    var suitMult = 1.0, suitLabel = '', suitAdv = null;
    if (typeof SynergyEngine !== 'undefined') {
      suitAdv = SynergyEngine.computeStackAdvantage(fx.cards || [], enemy);
      if (suitAdv) {
        suitMult = suitAdv.multiplier;
        suitLabel = suitAdv.label || '';
      }
    }
    if (suitMult !== 1.0) dmg = Math.max(1, Math.floor(dmg * suitMult));

    var mono = { monoSuit: false, suit: null, bonus: 0 };
    if (typeof SynergyEngine !== 'undefined') {
      mono = SynergyEngine.checkMonoSuitBonus(fx.cards || []);
      if (mono.monoSuit && mono.bonus > 0) dmg += mono.bonus;
    }

    var adv = CombatEngine.getAdvantage();
    if (adv === 'ambush')     dmg = Math.floor(dmg * 1.5);
    else if (adv === 'alert') dmg = Math.floor(dmg * 0.7);

    return {
      hasStack: true,
      damage: Math.max(0, dmg),
      stackSize: stackSize,
      str: pState.str || 0,
      cardDmg: fx.damage || 0,
      stackSizeBonus: stackSizeBonus,
      thrust: thrust,
      suitMult: suitMult,
      suitLabel: suitLabel,
      suitAdv: suitAdv,
      mono: mono,
      advantage: adv,
      sharedTags: fx.sharedTags || [],
      fx: fx
    };
  }

  /**
   * Recompute the preview DOM from the current estimate. Cheap to call
   * each frame — every consumer reads via getEstimate which is a pure
   * function over CardStack/CombatEngine state.
   */
  function refresh() {
    if (!_root || !_visible) return;

    var est = getEstimate();
    if (!est) return;

    if (!est.hasStack) {
      _dmgEl.textContent = String(est.str);
      _dmgBreak.textContent = 'base str only — drop a card to stack';
      _suitEl.textContent = '';
      _monoEl.textContent = '';
      _tagsEl.textContent = '';
      _thrustEl.textContent = '⚡ ' + _formatThrust(est.thrust);
      _incomingEl.textContent = _computeIncomingText(0);
      return;
    }

    _dmgEl.textContent = String(est.damage);

    var parts = [];
    if (est.str) parts.push(est.str + ' str');
    if (est.cardDmg) parts.push('+' + est.cardDmg + ' cards');
    if (est.stackSizeBonus) parts.push('+' + est.stackSizeBonus + ' stack');
    if (est.mono.monoSuit && est.mono.bonus > 0) parts.push('+' + est.mono.bonus + ' mono');
    if (est.thrust > 1.01) parts.push('×' + est.thrust.toFixed(2) + ' thrust');
    if (est.suitMult !== 1.0) parts.push('×' + est.suitMult.toFixed(2) + ' suit');
    if (est.advantage === 'ambush') parts.push('×1.5 ambush');
    else if (est.advantage === 'alert') parts.push('×0.7 alert');
    _dmgBreak.textContent = parts.join(' ');

    if (est.suitAdv && est.suitMult > 1.01) {
      _suitEl.innerHTML = '<span style="color:#88ff88">⚔️ ' + _esc(est.suitLabel || 'advantageous') + '</span>';
    } else if (est.suitAdv && est.suitMult < 0.99) {
      _suitEl.innerHTML = '<span style="color:#ff8866">⚠️ ' + _esc(est.suitLabel || 'resisted') + '</span>';
    } else {
      _suitEl.innerHTML = '<span style="opacity:0.5">— neutral suit</span>';
    }

    if (est.mono.monoSuit && est.mono.bonus > 0) {
      var sym = (typeof SynergyEngine !== 'undefined' && SynergyEngine.getSymbol)
        ? SynergyEngine.getSymbol(est.mono.suit) : '';
      _monoEl.innerHTML = '<span style="color:#ffcc44">★ mono ' + _esc(sym) + ' +' + est.mono.bonus + '</span>';
    } else {
      _monoEl.textContent = '';
    }

    if (est.sharedTags.length > 0) {
      var chips = est.sharedTags.map(function (t) { return '[' + _esc(t) + ']'; }).join(' ');
      _tagsEl.innerHTML = '<span style="opacity:0.8">tags: ' + chips + '</span>';
    } else {
      _tagsEl.textContent = '';
    }

    _thrustEl.textContent = '⚡ ' + _formatThrust(est.thrust);
    _incomingEl.textContent = _computeIncomingText(est.fx.defense || 0);
  }

  /**
   * Compute the "incoming X dmg" footer text. Reads the enemy's
   * committed stack effects and subtracts whatever defense the player's
   * current stack provides. Returns '' when no enemy commit yet.
   */
  function _computeIncomingText(playerDef) {
    if (typeof CardStack === 'undefined' || !CardStack.computeEnemyStackEffects) return '';
    var efx = CardStack.computeEnemyStackEffects();
    if (!efx || !efx.damage) return '';
    var incoming = Math.max(0, efx.damage - (playerDef || 0));
    return '← ' + incoming + ' dmg';
  }

  function _formatThrust(t) {
    var val = (typeof t === 'number' && t > 0) ? t : 1;
    return val.toFixed(2) + '×';
  }

  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    init:        init,
    show:        show,
    hide:        hide,
    tick:        tick,
    refresh:     refresh,
    getEstimate: getEstimate,
    isVisible:   isVisible
  };
})();
