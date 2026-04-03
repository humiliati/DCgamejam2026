/**
 * MorningReport — dawn tooltip with per-group DungeonSchedule status.
 *
 * Fires at the start of each new day (after DungeonSchedule.onDayChange
 * resolves any hero groups). Shows a staggered Toast sequence:
 *   1) "Day N" header
 *   2) Per-group status (hero day today / N days away / resolved ✓/✗)
 *   3) Combo streak status (if any)
 *
 * Layer 2 — depends on: DungeonSchedule, Toast, i18n
 *
 * R-5 of READINESS_BAR_ROADMAP.md
 */
var MorningReport = (function () {
  'use strict';

  var _lastDay = -1;   // Prevent double-fire on same day
  var _enabled = true;

  // ── Group suit icons (mirrors game.js _GROUP_SUITS) ──────────
  var _SUIT_ICONS = {
    soft_cellar: '\u2660',  // ♠
    heros_wake:  '\u2666',  // ♦
    heart:       '\u2665'   // ♥
  };

  /**
   * Called from game.js after DungeonSchedule.onDayChange(newDay).
   * Fires a sequence of Toasts summarizing the day's schedule.
   *
   * @param {number} day — the new day number
   */
  function onDayChange(day) {
    if (!_enabled) return;
    if (day === _lastDay) return;
    _lastDay = day;

    if (typeof DungeonSchedule === 'undefined') return;
    if (typeof Toast === 'undefined') return;

    var schedule = DungeonSchedule.getSchedule();
    if (!schedule || schedule.length === 0) return;

    var delay = 0;
    var BASE = 400;  // ms between toasts

    // ── Day header ─────────────────────────────────────────────
    _toast(delay, '\u2600 Day ' + day, 'info');  // ☀ Day N
    delay += BASE;

    // ── Per-group status ───────────────────────────────────────
    for (var i = 0; i < schedule.length; i++) {
      var g = schedule[i];
      var suit = _SUIT_ICONS[g.groupId] || '\u25C6';
      var msg = '';

      if (g.resolved) {
        // Already done — show result
        var icon = g.result && g.result.passed !== false ? '\u2713' : '\u2717';
        msg = suit + ' ' + g.label + ': ' + icon + ' resolved';
      } else if (g.actualDay === day) {
        // Hero day is TODAY
        msg = suit + ' ' + g.label + ': \u2694\uFE0F HERO DAY!';
        _toast(delay, msg, 'warning');
        delay += BASE;
        continue;
      } else {
        // Upcoming
        var daysLeft = g.actualDay - day;
        var shifted = !g.onSchedule ? ' \u26A0' : '';
        msg = suit + ' ' + g.label + ': ' + daysLeft + ' day' +
              (daysLeft !== 1 ? 's' : '') + ' away' + shifted;
      }

      _toast(delay, msg, 'info');
      delay += BASE;
    }

    // ── Combo streak ───────────────────────────────────────────
    var combo = DungeonSchedule.getCombo();
    if (combo.streak > 0) {
      var stars = '';
      for (var s = 0; s < Math.min(combo.streak, 3); s++) stars += '\u2605';
      _toast(delay, stars + ' Streak: \u00D7' + combo.multiplier.toFixed(1), 'success');
    } else if (combo.maxStreak > 0) {
      _toast(delay, '\u26A0 Streak broken. Rebuild with next group.', 'warning');
    }
  }

  /**
   * Schedule a Toast at a delay.
   */
  function _toast(delayMs, msg, style) {
    if (delayMs <= 0) {
      Toast.show(msg, style);
    } else {
      setTimeout(function () {
        if (typeof Toast !== 'undefined') Toast.show(msg, style);
      }, delayMs);
    }
  }

  /**
   * Enable/disable morning reports (e.g., during tutorial).
   */
  function setEnabled(enabled) {
    _enabled = !!enabled;
  }

  /**
   * Reset for new game.
   */
  function reset() {
    _lastDay = -1;
  }

  return Object.freeze({
    onDayChange: onDayChange,
    setEnabled:  setEnabled,
    reset:       reset
  });
})();
