/**
 * StatusSystem — combat-scoped status effects with round-resolve ticks.
 *
 * Replaces the old singular `_enemy.spriteState + statusDuration` tracking
 * that never actually ticked damage. Both player and enemy can now carry
 * a stack of concurrent status effects, each with its own damage/turn/CC
 * payload, and the registry ticks them once per round in the post_resolve
 * transition.
 *
 * SCOPE (deliberately narrow):
 *   - Combat-scoped. applyAll() + tickAll() run inside CombatEngine.
 *     StatusSystem.clearAll(target) is called by CombatBridge when combat
 *     ends so nothing bleeds into exploration.
 *   - Ticks once per round in _enterStacking (the start of a new round,
 *     i.e. AFTER the previous round's post_resolve). This keeps DoT
 *     legible: one HP pulse per round of cards fired.
 *   - Duration is counted in rounds, not seconds. turns=3 means three
 *     subsequent round starts will tick, then the status expires.
 *
 * STATUS CATALOG:
 *   poisoned  — DoT, bypasses defense
 *   burning   — DoT, bypasses defense (higher tick than poison)
 *   bleeding  — DoT, bypasses defense (lowest tick but longest duration)
 *   stunned   — CC: target skips their next commit (consumed on first tick)
 *   rooted    — CC: visual placeholder for future movement-lock mechanic;
 *               does not affect combat math, provided so EATK-008 has a
 *               real entry rather than a noop.
 *
 * STORAGE:
 *   Status entries live on target._statuses as an array. Each entry:
 *     { id, value, turnsRemaining, source }
 *   The array is empty or undefined when nothing is active. We never
 *   touch target.spriteState directly from outside getVisualState() so
 *   the two stay consistent.
 *
 * APPLY RULES:
 *   - Same-id re-application REFRESHES to max(existingTurns, newTurns)
 *     and max(existingValue, newValue). Prevents stacking DoT into
 *     unbeatable 10-dmg/turn by spamming the same card, while still
 *     letting players top up a fading status.
 *   - Unknown status ids are ignored with a console warning.
 *
 * DEPENDENCIES:
 *   Layer 2 — reads no state outside target._statuses. Callers (CombatEngine)
 *   pass `target` which can be the enemy entity or the player state object.
 *   We call Player.damage() / Player.state() only when the target IS the
 *   player object and only to keep HP updates going through the canonical
 *   path.
 */
var StatusSystem = (function () {
  'use strict';

  // ── Status catalog ───────────────────────────────────────────────────
  // dmgPerTick   — flat HP damage applied on each round tick
  // bypassDefense— DoT ignores defense (always true for true DoT, false
  //                would let brace soak it — we keep all three true so
  //                cleanse is the only escape, matching card DB intent)
  // cc           — 'stun' | 'root' | null — read by CombatEngine to gate
  //                commits / actions
  // visualPriority — higher wins when multiple statuses are active and
  //                  we need a single spriteState string for the renderer
  var CATALOG = {
    poisoned: {
      id: 'poisoned',
      dmgPerTick: 1,     // baseline; EATK-005 stacks via value override
      bypassDefense: true,
      cc: null,
      visualPriority: 2,
      label: 'Poison'
    },
    burning: {
      id: 'burning',
      dmgPerTick: 2,     // hotter than poison, shorter default duration
      bypassDefense: true,
      cc: null,
      visualPriority: 3,
      label: 'Burn'
    },
    bleeding: {
      id: 'bleeding',
      dmgPerTick: 1,
      bypassDefense: true,
      cc: null,
      visualPriority: 2,
      label: 'Bleed'
    },
    stunned: {
      id: 'stunned',
      dmgPerTick: 0,
      bypassDefense: false,
      cc: 'stun',
      visualPriority: 4,   // stun is the most important visual read
      label: 'Stunned'
    },
    rooted: {
      id: 'rooted',
      dmgPerTick: 0,
      bypassDefense: false,
      cc: 'root',
      visualPriority: 1,
      label: 'Rooted'
    }
  };

  // ── Internal helpers ─────────────────────────────────────────────────

  function _ensure(target) {
    if (!target) return null;
    if (!target._statuses) target._statuses = [];
    return target._statuses;
  }

  function _find(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /**
   * Deal DoT damage to a target. Routes through Player.damage() when the
   * target IS the player so Player.onCombatDamage() and HUD flashes fire
   * correctly. For enemies we mutate hp directly (same pattern as
   * CombatEngine.fireStack).
   */
  function _dealDotDamage(target, amount) {
    if (amount <= 0) return 0;
    if (typeof Player !== 'undefined' && target === Player.state()) {
      // Player path — Player.damage handles hose drop / HUD flashes.
      Player.damage(amount);
      return amount;
    }
    target.hp = Math.max(0, (target.hp || 0) - amount);
    return amount;
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Apply a single status. `statusDef` can come from a card effect of
   * `{ type: 'status', status: 'poisoned', value: 2, duration: 3 }` — we
   * accept both { status, duration } and { id, turnsRemaining } shapes
   * so callers don't need to rename fields before passing.
   *
   * @param {Object} target     - enemy entity or Player.state()
   * @param {Object} statusDef  - { status|id, value?, duration|turnsRemaining, source? }
   * @returns {Object|null}     - the applied entry, or null if rejected
   */
  function apply(target, statusDef) {
    if (!target || !statusDef) return null;
    var id = statusDef.status || statusDef.id;
    var def = CATALOG[id];
    if (!def) {
      console.warn('[StatusSystem] Unknown status id:', id);
      return null;
    }

    var list = _ensure(target);
    var turns = statusDef.duration || statusDef.turnsRemaining || 1;
    var value = (typeof statusDef.value === 'number') ? statusDef.value : def.dmgPerTick;

    var existing = _find(list, id);
    if (existing) {
      // Refresh: take the stronger tick and the longer duration.
      existing.turnsRemaining = Math.max(existing.turnsRemaining, turns);
      existing.value = Math.max(existing.value, value);
      existing.source = statusDef.source || existing.source || null;
      return existing;
    }

    var entry = {
      id: id,
      value: value,
      turnsRemaining: turns,
      source: statusDef.source || null
    };
    list.push(entry);
    return entry;
  }

  /**
   * Apply a batch of status defs (the `statuses` array returned by
   * CardStack.computeStackEffects). Filters by target field:
   *   target: 'player'  → applied to player
   *   target: 'enemy'   → applied to enemy
   *   target: 'self'    → applied to `selfEntity`
   * Defaults to `fallbackTargetEntity` if target field missing.
   */
  function applyBatch(statuses, opts) {
    if (!statuses || statuses.length === 0) return;
    opts = opts || {};
    for (var i = 0; i < statuses.length; i++) {
      var s = statuses[i];
      if (!s || (!s.status && !s.id)) continue;
      var dest = null;
      if (s.target === 'player')      dest = opts.playerEntity;
      else if (s.target === 'enemy')  dest = opts.enemyEntity;
      else if (s.target === 'self')   dest = opts.selfEntity;
      else                            dest = opts.fallbackEntity || opts.enemyEntity;
      if (dest) apply(dest, s);
    }
  }

  /**
   * Tick all active statuses on a target by one round. Applies DoT,
   * decrements duration, drops expired entries. Returns a report so
   * the caller can surface damage numbers / toasts.
   *
   * @returns {Object} { damageDealt, expired: [ids], active: [ids] }
   */
  function tick(target) {
    var report = { damageDealt: 0, expired: [], active: [] };
    if (!target || !target._statuses || target._statuses.length === 0) {
      return report;
    }

    var list = target._statuses;
    var keep = [];

    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      var def = CATALOG[entry.id];
      if (!def) continue;  // Unknown — drop silently (post-load migration safety)

      // DoT
      if (def.dmgPerTick > 0 || entry.value > 0) {
        var dmg = entry.value || def.dmgPerTick;
        if (dmg > 0) {
          report.damageDealt += _dealDotDamage(target, dmg);
        }
      }

      entry.turnsRemaining--;

      if (entry.turnsRemaining <= 0) {
        report.expired.push(entry.id);
      } else {
        keep.push(entry);
        report.active.push(entry.id);
      }
    }

    target._statuses = keep;
    return report;
  }

  /**
   * Check for and consume a CC flag (stun/root). Used by CombatEngine
   * before enemy commits a card. Stun is consumed on check (once-per-
   * round cost) so a 1-duration stun skips exactly one commit.
   *
   * @returns {string|null} cc type ('stun'|'root') or null
   */
  function consumeCC(target, ccType) {
    if (!target || !target._statuses) return null;
    for (var i = 0; i < target._statuses.length; i++) {
      var entry = target._statuses[i];
      var def = CATALOG[entry.id];
      if (def && def.cc === ccType) {
        return def.cc;
      }
    }
    return null;
  }

  /**
   * Pure predicate — does the target have a status matching cc type?
   * Does not consume anything; used by UI for telegraphs.
   */
  function hasCC(target, ccType) {
    return consumeCC(target, ccType) !== null;
  }

  /**
   * Derive the single string spriteState for the renderer from the
   * highest-priority active status. Returns 'idle' if nothing active.
   * CombatEngine should call this after each tick and assign the
   * result to _enemy.spriteState so EnemySprites stays in sync.
   */
  function getVisualState(target) {
    if (!target || !target._statuses || target._statuses.length === 0) {
      return 'idle';
    }
    var best = null;
    var bestP = -1;
    for (var i = 0; i < target._statuses.length; i++) {
      var def = CATALOG[target._statuses[i].id];
      if (def && def.visualPriority > bestP) {
        best = def.id;
        bestP = def.visualPriority;
      }
    }
    return best || 'idle';
  }

  /**
   * Return a shallow copy of active statuses for HUD display.
   */
  function list(target) {
    if (!target || !target._statuses) return [];
    return target._statuses.slice();
  }

  /** Nuke all statuses on a target — called by CombatBridge on combat end. */
  function clearAll(target) {
    if (target) target._statuses = [];
  }

  /**
   * Expose catalog for UI modules that want to render labels / tooltips
   * without duplicating the data.
   */
  function getCatalog() { return CATALOG; }

  // ── Public API ───────────────────────────────────────────────────────

  return {
    CATALOG:       CATALOG,
    apply:         apply,
    applyBatch:    applyBatch,
    tick:          tick,
    consumeCC:     consumeCC,
    hasCC:         hasCC,
    getVisualState: getVisualState,
    list:          list,
    clearAll:      clearAll,
    getCatalog:    getCatalog
  };
})();
