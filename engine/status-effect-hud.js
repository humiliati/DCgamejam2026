/**
 * StatusEffectHUD — renders buff/debuff icon rows in the debrief feed panel.
 *
 * Layer 2 (depends on StatusEffect from Layer 1).
 *
 * Two rows anchored below the resource gauges in the debrief feed:
 *   - Buff row (top):   warm colors, positive effects
 *   - Debuff row (bot): warning colors, negative effects
 *
 * Each icon is clickable → expanded description in status bar tooltip.
 * Row flash animation on apply/remove (color pulse from effect definition).
 *
 * The HUD polls StatusEffect.getBuffs/getDebuffs each frame-update
 * (called from Game render loop). DOM rebuilds only when the active
 * set changes (signature check).
 */
var StatusEffectHUD = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  DOM ELEMENTS
  // ═══════════════════════════════════════════════════════════════

  var _containerEl = null;   // Wrapper div injected into debrief feed
  var _buffRowEl   = null;   // Buff icon row
  var _debuffRowEl = null;   // Debuff icon row
  var _lastSig     = '';     // Signature string for dirty check

  // Flash animation state
  var _flashQueue  = [];     // [{ rowEl, color, startTime }]
  var FLASH_DURATION = 400;  // ms per flash pulse
  var FLASH_COUNT    = 2;    // number of pulses

  // ═══════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════

  function init() {
    _createDOM();
    _lastSig = '';

    // Wire StatusEffect callbacks for flash triggers
    if (typeof StatusEffect !== 'undefined') {
      StatusEffect.setOnApply(function (def, instance) {
        var rowEl = def.type === 'buff' ? _buffRowEl : _debuffRowEl;
        _queueFlash(rowEl, def.flashColor || def.color || '#ffffff');
        _rebuild();
      });

      StatusEffect.setOnRemove(function (def, reason) {
        var rowEl = def.type === 'buff' ? _buffRowEl : _debuffRowEl;
        // White flash for removal (inert)
        _queueFlash(rowEl, reason === 'transition' ? '#ffffff' : '#ffffff');
        _rebuild();
      });

      StatusEffect.setOnTransition(function (fromDef, toDef) {
        // Flash both rows on paired transition
        if (_buffRowEl)   _queueFlash(_buffRowEl, '#ffffff');
        if (_debuffRowEl) _queueFlash(_debuffRowEl, toDef.flashColor || toDef.color || '#A0522D');
        _rebuild();
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DOM CREATION
  // ═══════════════════════════════════════════════════════════════

  function _createDOM() {
    // Find debrief feed content area to inject after gauges
    var debriefEl = document.getElementById('debrief-content');

    // Create wrapper
    _containerEl = document.createElement('div');
    _containerEl.id = 'status-effect-hud';
    _containerEl.style.cssText =
      'padding:2px 8px;font-size:16px;line-height:1.6;' +
      'font-family:var(--font-terminal,monospace);';

    // Buff row
    _buffRowEl = document.createElement('div');
    _buffRowEl.className = 'se-row se-buff-row';
    _buffRowEl.style.cssText =
      'min-height:20px;transition:background 0.15s;border-radius:2px;padding:1px 4px;';

    // Debuff row
    _debuffRowEl = document.createElement('div');
    _debuffRowEl.className = 'se-row se-debuff-row';
    _debuffRowEl.style.cssText =
      'min-height:20px;transition:background 0.15s;border-radius:2px;padding:1px 4px;';

    _containerEl.appendChild(_buffRowEl);
    _containerEl.appendChild(_debuffRowEl);

    // Insert into debrief feed if available, otherwise into viewport
    if (debriefEl) {
      debriefEl.appendChild(_containerEl);
    } else {
      // Fallback: append to debrief-feed directly
      var feedEl = document.getElementById('debrief-feed');
      if (feedEl) {
        feedEl.appendChild(_containerEl);
      } else {
        // Last resort: viewport overlay
        var viewport = document.getElementById('viewport');
        if (viewport) {
          _containerEl.style.cssText +=
            'position:absolute;top:160px;left:8px;z-index:15;pointer-events:auto;';
          viewport.appendChild(_containerEl);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  REBUILD (called on change or from update)
  // ═══════════════════════════════════════════════════════════════

  function _rebuild() {
    if (typeof StatusEffect === 'undefined') return;
    if (!_buffRowEl || !_debuffRowEl) return;

    var buffs   = StatusEffect.getBuffs();
    var debuffs = StatusEffect.getDebuffs();

    // Build signature for dirty check
    var sig = _buildSignature(buffs, debuffs);
    if (sig === _lastSig) return;
    _lastSig = sig;

    // Render buff row
    _buffRowEl.innerHTML = _renderIcons(buffs);

    // Render debuff row
    _debuffRowEl.innerHTML = _renderIcons(debuffs);
  }

  function _buildSignature(buffs, debuffs) {
    var parts = [];
    for (var i = 0; i < buffs.length; i++) {
      parts.push('b:' + buffs[i].id + ':' + (buffs[i].daysRemaining || buffs[i].condition || '?'));
    }
    for (var j = 0; j < debuffs.length; j++) {
      parts.push('d:' + debuffs[j].id + ':' + (debuffs[j].daysRemaining || debuffs[j].condition || '?'));
    }
    return parts.join(',');
  }

  /**
   * Render a row of effect icons as HTML.
   * Each icon is a clickable span with data-effect-id for tooltip lookup.
   */
  function _renderIcons(effects) {
    if (effects.length === 0) return '';

    var html = '';
    for (var i = 0; i < effects.length; i++) {
      var e = effects[i];
      var def = e.def;
      if (!def) continue;

      var durLabel = '';
      if (typeof e.daysRemaining === 'number') {
        durLabel = e.daysRemaining;
      }

      html += '<span class="se-icon" data-effect-id="' + e.id + '" ' +
              'style="cursor:pointer;margin-right:6px;color:' + (def.color || '#ccc') + '" ' +
              'title="' + _escapeAttr(def.label + ': ' + def.description) + '">' +
              def.emoji;
      if (durLabel !== '') {
        html += '<sub style="font-size:10px;color:' + (def.color || '#ccc') + '">' + durLabel + '</sub>';
      }
      html += '</span>';
    }
    return html;
  }

  function _escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ═══════════════════════════════════════════════════════════════
  //  FLASH ANIMATION
  // ═══════════════════════════════════════════════════════════════

  function _queueFlash(rowEl, color) {
    if (!rowEl) return;
    _flashQueue.push({
      rowEl:     rowEl,
      color:     color,
      startTime: performance.now(),
      pulses:    FLASH_COUNT
    });
  }

  /**
   * Tick flash animations (called from game render loop).
   */
  function _tickFlash(now) {
    for (var i = _flashQueue.length - 1; i >= 0; i--) {
      var f = _flashQueue[i];
      var elapsed = now - f.startTime;
      var totalDuration = FLASH_DURATION * f.pulses;

      if (elapsed >= totalDuration) {
        // Done — clear background
        f.rowEl.style.background = 'transparent';
        _flashQueue.splice(i, 1);
        continue;
      }

      // Pulse: sine wave between 0 and 1
      var phase = (elapsed % FLASH_DURATION) / FLASH_DURATION;
      var intensity = Math.sin(phase * Math.PI);

      f.rowEl.style.background = _colorWithAlpha(f.color, intensity * 0.35);
    }
  }

  function _colorWithAlpha(hexOrColor, alpha) {
    // Handle hex colors
    if (hexOrColor.charAt(0) === '#') {
      var r = parseInt(hexOrColor.substr(1, 2), 16);
      var g = parseInt(hexOrColor.substr(3, 2), 16);
      var b = parseInt(hexOrColor.substr(5, 2), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')';
    }
    // Already rgba or named — just return with alpha
    return hexOrColor;
  }

  // ═══════════════════════════════════════════════════════════════
  //  UPDATE (called from game render loop)
  // ═══════════════════════════════════════════════════════════════

  function update(now) {
    _rebuild();
    _tickFlash(now || performance.now());
  }

  // ═══════════════════════════════════════════════════════════════
  //  TOOLTIP EXPANSION (click handler)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Expand effect description in status bar when icon is clicked.
   * Wired via event delegation on the container.
   */
  function _onIconClick(e) {
    var target = e.target.closest ? e.target.closest('.se-icon') : null;
    if (!target && e.target.className === 'se-icon') target = e.target;
    if (!target) return;

    var effectId = target.getAttribute('data-effect-id');
    if (!effectId || typeof StatusEffect === 'undefined') return;

    var def = StatusEffect.getDef(effectId);
    if (!def) return;

    // Show in status bar tooltip if available
    if (typeof StatusBar !== 'undefined' && StatusBar.showTooltip) {
      StatusBar.showTooltip(def.emoji + ' ' + def.label + ' - ' + def.description);
    }
  }

  // Attach click delegation after DOM creation
  function _wireClickHandler() {
    if (_containerEl) {
      _containerEl.addEventListener('click', _onIconClick);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  return Object.freeze({
    init:   function () {
      init();
      _wireClickHandler();
    },
    update: update
  });

})();
