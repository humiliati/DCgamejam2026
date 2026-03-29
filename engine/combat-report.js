/**
 * CombatReport — end-of-combat XP/action summary overlay.
 *
 * Shows a click-through report after combat ends with:
 *   - Enemy name + emoji
 *   - XP earned
 *   - Cards played summary
 *   - Damage dealt / taken
 *   - Loot preview (if victory)
 *
 * DOM-driven overlay, styled with CRT theme.
 * Auto-dismisses on click/tap or [OK] key.
 *
 * Layer 2 (after CombatBridge, before NchWidget transition)
 * Depends on: i18n, InputManager (optional)
 */
var CombatReport = (function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────
  var FADE_IN   = 200;  // ms
  var AUTO_DISMISS = 8000; // ms max display time

  // ── State ─────────────────────────────────────────────────────────
  var _el         = null;   // #combat-report
  var _contentEl  = null;   // #cr-content
  var _visible    = false;
  var _timer      = 0;
  var _onDismiss  = null;   // Callback when report is dismissed
  var _data       = null;   // Current report data

  // ── Combat tracking (accumulated during combat) ──────────────────
  var _tracking = {
    cardsPlayed:   0,
    damageDealt:   0,
    damageTaken:   0,
    roundCount:    0,
    cardNames:     [],
    enemy:         null,
    result:        ''
  };

  // ── Init ──────────────────────────────────────────────────────────

  function init() {
    _el        = document.getElementById('combat-report');
    _contentEl = document.getElementById('cr-content');

    if (_el) {
      _el.addEventListener('click', function (e) {
        e.stopPropagation();
        dismiss();
      });
    }
  }

  // ── Tracking API (call during combat) ─────────────────────────────

  function beginTracking(enemy) {
    _tracking.cardsPlayed = 0;
    _tracking.damageDealt = 0;
    _tracking.damageTaken = 0;
    _tracking.roundCount  = 0;
    _tracking.cardNames   = [];
    _tracking.enemy       = enemy;
    _tracking.result      = '';
  }

  function trackCardPlayed(card, playerDmg, enemyDmg) {
    _tracking.cardsPlayed++;
    _tracking.roundCount++;
    _tracking.damageDealt += (playerDmg || 0);
    _tracking.damageTaken += (enemyDmg || 0);
    if (card && card.name) {
      _tracking.cardNames.push(card.emoji + ' ' + card.name);
    }
  }

  function endTracking(result) {
    _tracking.result = result;
  }

  // ── Show report ───────────────────────────────────────────────────

  /**
   * Show the combat report.
   * @param {Object} [opts]
   * @param {number} [opts.xpEarned] - XP awarded
   * @param {Object} [opts.loot] - Loot dropped (if any)
   * @param {Function} [opts.onDismiss] - Called when report is dismissed
   */
  function show(opts) {
    opts = opts || {};

    if (!_el || !_contentEl) return;

    _onDismiss = opts.onDismiss || null;
    _timer = 0;
    _visible = true;

    _data = {
      enemy:       _tracking.enemy,
      result:      _tracking.result,
      cardsPlayed: _tracking.cardsPlayed,
      damageDealt: _tracking.damageDealt,
      damageTaken: _tracking.damageTaken,
      roundCount:  _tracking.roundCount,
      cardNames:   _tracking.cardNames.slice(),
      xpEarned:    opts.xpEarned || 0,
      loot:        opts.loot || null
    };

    _render();

    _el.style.display = 'flex';
    _el.style.opacity = '0';
    // Trigger fade-in
    requestAnimationFrame(function () {
      _el.style.opacity = '1';
    });
  }

  // ── Render content ────────────────────────────────────────────────

  function _render() {
    if (!_contentEl || !_data) return;

    var d = _data;
    var enemy = d.enemy || {};
    var html = '';

    // Header
    var resultLabel = d.result === 'victory'
      ? i18n.t('combat.report_victory', 'VICTORY')
      : d.result === 'defeat'
        ? i18n.t('combat.report_defeat', 'DEFEAT')
        : i18n.t('combat.report_fled', 'ESCAPED');
    var resultClass = d.result === 'victory' ? 'cr-victory'
      : d.result === 'defeat' ? 'cr-defeat' : 'cr-fled';

    html += '<div class="cr-header ' + resultClass + '">' + resultLabel + '</div>';

    // Enemy info
    html += '<div class="cr-enemy">';
    html += '<span class="cr-emoji">' + (enemy.emoji || '?') + '</span> ';
    html += '<span class="cr-name">' + _escape(enemy.name || 'Unknown') + '</span>';
    html += '</div>';

    html += '<hr class="cr-divider">';

    // Stats grid
    html += '<div class="cr-stats">';
    html += _statRow('Rounds', d.roundCount);
    html += _statRow('Cards Played', d.cardsPlayed);
    html += _statRow('Damage Dealt', d.damageDealt);
    html += _statRow('Damage Taken', d.damageTaken);
    html += '</div>';

    // XP
    if (d.xpEarned > 0) {
      html += '<hr class="cr-divider">';
      html += '<div class="cr-xp">+' + d.xpEarned + ' XP</div>';
    }

    // Loot
    if (d.loot) {
      html += '<hr class="cr-divider">';
      html += '<div class="cr-loot">';
      if (d.loot.type === 'card' && d.loot.card) {
        html += d.loot.card.emoji + ' ' + _escape(d.loot.card.name);
      } else if (d.loot.amount) {
        html += '💰 ' + d.loot.amount + 'g';
      }
      html += '</div>';
    }

    // Cards used
    if (d.cardNames.length > 0) {
      html += '<hr class="cr-divider">';
      html += '<div class="cr-cards-header">Cards Used</div>';
      html += '<div class="cr-cards-list">';
      for (var i = 0; i < d.cardNames.length; i++) {
        html += '<span class="cr-card-tag">' + _escape(d.cardNames[i]) + '</span>';
      }
      html += '</div>';
    }

    // Dismiss prompt
    html += '<div class="cr-prompt">[ ' + i18n.t('combat.report_dismiss', 'Click to continue') + ' ]</div>';

    _contentEl.innerHTML = html;
  }

  function _statRow(label, value) {
    return '<div class="cr-stat-row">' +
      '<span class="cr-stat-label">' + label + '</span>' +
      '<span class="cr-stat-value">' + value + '</span>' +
      '</div>';
  }

  // ── Dismiss ───────────────────────────────────────────────────────

  function dismiss() {
    if (!_visible) return;
    _visible = false;

    if (_el) {
      _el.style.opacity = '0';
      setTimeout(function () {
        if (_el) _el.style.display = 'none';
      }, 200);
    }

    if (_onDismiss) {
      var cb = _onDismiss;
      _onDismiss = null;
      cb();
    }
  }

  // ── Update (for auto-dismiss timer) ───────────────────────────────

  function update(dt) {
    if (!_visible) return;
    _timer += dt;
    if (_timer >= AUTO_DISMISS) {
      dismiss();
    }
  }

  function isVisible() { return _visible; }

  // ── Handle keyboard/pointer dismiss ───────────────────────────────

  function handleInput() {
    if (_visible) {
      dismiss();
      return true;
    }
    return false;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function _escape(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    init:            init,
    beginTracking:   beginTracking,
    trackCardPlayed: trackCardPlayed,
    endTracking:     endTracking,
    show:            show,
    dismiss:         dismiss,
    update:          update,
    isVisible:       isVisible,
    handleInput:     handleInput
  };
})();
