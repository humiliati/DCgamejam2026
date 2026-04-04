/**
 * DungeonSchedule — staggered per-group hero day schedule, death-shift,
 * combo multiplier, and arc summary.
 *
 * Owns the 8-day jam arc timeline. Each dungeon group (A, B, C) has its own
 * hero day. When a hero day arrives, this module snapshots readiness,
 * delegates to HeroRun.executeRun(), delivers the report to MailboxPeek,
 * and updates the combo streak.
 *
 * Death in a dungeon shifts only that group's hero day to tomorrow.
 * The combo streak tracks consecutive on-schedule, target-met completions.
 *
 * Layer 1 — pure state, no DOM.
 * Depends on: ReadinessCalc (Layer 1), HeroRun (Layer 1),
 *             MailboxPeek (Layer 3, optional), FloorManager (Layer 2, optional)
 *
 * See docs/READINESS_BAR_ROADMAP.md §9–§13 for full spec.
 */
var DungeonSchedule = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  JAM CONTRACT DEFAULTS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Default contracts for the 8-day jam arc.
   * Each entry becomes a DungeonContract at init().
   */
  var JAM_CONTRACTS = Object.freeze([
    {
      groupId:       'soft_cellar',
      label:         'Soft Cellar',
      floorIds:      ['1.3.1'],
      scheduledDay:  2,
      heroType:      'Seeker',
      comboEligible: true,
      target:        0.6               // 60% core readiness to pass
    },
    {
      groupId:       'heros_wake',
      label:         "Hero's Wake",
      floorIds:      ['2.2.1', '2.2.2'],
      scheduledDay:  5,
      heroType:      'Scholar',
      comboEligible: true,
      target:        0.6
    },
    {
      groupId:       'heart',
      label:         'Heart Dungeon',
      floorIds:      ['0.1.1'],         // Floor 0.N.N — placeholder ID
      scheduledDay:  8,
      heroType:      'Crusader',
      comboEligible: false,             // employer-managed, exempt from combo
      target:        0.6
    }
  ]);

  // ═══════════════════════════════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════════════════════════════

  var _contracts = [];        // DungeonContract[] — mutable copies
  var _comboStreak = 0;       // consecutive on-schedule, target-met groups
  var _maxStreak = 0;         // high watermark for arc summary
  var _currentDay = 0;        // last day we processed
  var _initialized = false;

  // ═══════════════════════════════════════════════════════════════
  //  COMBO
  // ═══════════════════════════════════════════════════════════════

  var COMBO_CAP = 3;
  var COMBO_BASE = 0.1;       // +0.1× per streak level

  function _comboMultiplier() {
    return 1.0 + Math.min(_comboStreak, COMBO_CAP) * COMBO_BASE;
  }

  // ═══════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initialize the schedule. Call once at game start.
   * @param {Array} [config] — override JAM_CONTRACTS for testing
   */
  function init(config) {
    var src = config || JAM_CONTRACTS;
    _contracts = [];
    for (var i = 0; i < src.length; i++) {
      var c = src[i];
      _contracts.push({
        groupId:       c.groupId,
        label:         c.label,
        floorIds:      c.floorIds.slice(),   // defensive copy
        scheduledDay:  c.scheduledDay,
        actualDay:     c.scheduledDay,        // may shift on death
        heroType:      c.heroType,
        comboEligible: c.comboEligible !== false,
        target:        c.target || 0.6,
        resolved:      false,
        onSchedule:    true,
        result:        null                   // { report, stars, coreScore }
      });
    }
    _comboStreak = 0;
    _maxStreak = 0;
    _currentDay = 0;
    _initialized = true;
    console.log('[DungeonSchedule] Initialized — ' + _contracts.length + ' groups');
  }

  // ═══════════════════════════════════════════════════════════════
  //  DAY CHANGE — called by DayCycle via game.js wiring
  // ═══════════════════════════════════════════════════════════════

  /**
   * Process a new day. Resolves any group whose actualDay matches.
   * @param {number} day — the new day number
   */
  function onDayChange(day) {
    if (!_initialized) return;
    _currentDay = day;

    for (var i = 0; i < _contracts.length; i++) {
      var contract = _contracts[i];
      if (contract.resolved) continue;
      if (contract.actualDay === day) {
        _resolveGroup(contract, day);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  RESOLVE GROUP — snapshot, hero run, report, combo
  // ═══════════════════════════════════════════════════════════════

  /**
   * Resolve a single dungeon group's hero day.
   * 1) Snapshot readiness for each floor
   * 2) Build floor data array for HeroRun
   * 3) Execute hero run
   * 4) Deliver report to MailboxPeek
   * 5) Update combo streak
   *
   * @param {Object} contract — the DungeonContract to resolve
   * @param {number} day
   */
  function _resolveGroup(contract, day) {
    console.log('[DungeonSchedule] Resolving group "' + contract.groupId +
                '" on day ' + day +
                ' (scheduled: ' + contract.scheduledDay +
                ', onSchedule: ' + contract.onSchedule + ')');

    // ── 1) Snapshot readiness ─────────────────────────────────
    var coreScore = 0;
    for (var i = 0; i < contract.floorIds.length; i++) {
      var fid = contract.floorIds[i];
      if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.snapshotFloor) {
        ReadinessCalc.snapshotFloor(fid);
      }
      // Average core score across floors in group
      if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.getCoreScore) {
        coreScore += ReadinessCalc.getCoreScore(fid);
      } else {
        coreScore += 1.0;  // fallback: assume ready
      }
    }
    coreScore = contract.floorIds.length > 0
      ? coreScore / contract.floorIds.length
      : 0;

    // ── 2) Build floor data for HeroRun ───────────────────────
    var dungeonFloors = [];
    for (var j = 0; j < contract.floorIds.length; j++) {
      var floorId = contract.floorIds[j];
      var readiness = 0;
      var crateCount = 4;
      var enemyCount = 3;
      var trapCount = 2;
      var puzzleCount = 1;

      if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.getScore) {
        readiness = Math.round(ReadinessCalc.getScore(floorId) * 100);
      }

      // Pull actual counts from cached floor data when available
      if (typeof FloorManager !== 'undefined' && FloorManager.getCachedFloorData) {
        var cached = FloorManager.getCachedFloorData(floorId);
        if (cached && cached.grid) {
          crateCount = _countTiles(cached, TILES.BREAKABLE) || 4;
          trapCount = _countTiles(cached, TILES.TRAP) || 2;
        }
        if (cached && cached.enemies) {
          enemyCount = cached.enemies.length || 3;
        }
      }

      var floorName = floorId;
      if (typeof i18n !== 'undefined' && i18n.t) {
        floorName = i18n.t('floor.' + floorId, floorId);
      }

      dungeonFloors.push({
        floorId:    floorId,
        name:       floorName,
        readiness:  readiness,
        crateCount: crateCount,
        enemyCount: enemyCount,
        trapCount:  trapCount,
        puzzleCount: puzzleCount
      });
    }

    // ── 3) Execute hero run ───────────────────────────────────
    var report = null;
    var meetsTarget = coreScore >= contract.target;

    if (typeof HeroRun !== 'undefined' && HeroRun.executeRun && dungeonFloors.length > 0) {
      report = HeroRun.executeRun(contract.heroType, dungeonFloors, day);
      report.day = day;
      report.groupId = contract.groupId;
      report.groupLabel = contract.label;
      report.onSchedule = contract.onSchedule;

      // Apply combo multiplier to payout
      var mult = _comboMultiplier();
      if (mult > 1.0 && report.totalPayout) {
        report.comboMultiplier = mult;
        report.totalPayout = Math.round(report.totalPayout * mult);
      }
    } else {
      // Fallback: create a minimal report
      report = {
        day:            day,
        heroType:       contract.heroType,
        heroEmoji:      (typeof HeroRun !== 'undefined' && HeroRun.getHeroEmoji)
                          ? HeroRun.getHeroEmoji(contract.heroType) : '⚔️',
        floors:         [],
        totalPayout:    0,
        chainBonus:     false,
        cardDrop:       null,
        isDeathReport:  false,
        rescueText:     null,
        groupId:        contract.groupId,
        groupLabel:     contract.label,
        onSchedule:     contract.onSchedule
      };
    }

    // ── 4) Deliver to MailboxPeek ─────────────────────────────
    if (typeof MailboxPeek !== 'undefined' && MailboxPeek.addReport) {
      MailboxPeek.addReport(report);
    }

    // Invalidate floor caches so re-entry shows carnage
    for (var k = 0; k < contract.floorIds.length; k++) {
      if (typeof FloorManager !== 'undefined' && FloorManager.invalidateCache) {
        FloorManager.invalidateCache(contract.floorIds[k]);
      }
    }

    // ── 5) Star rating ────────────────────────────────────────
    var stars = 0;
    if (coreScore >= 0.9)      stars = 5;
    else if (coreScore >= 0.8) stars = 4;
    else if (coreScore >= 0.6) stars = 3;
    else if (coreScore >= 0.4) stars = 2;
    else if (coreScore > 0)    stars = 1;

    // ── 6) Mark resolved ──────────────────────────────────────
    contract.resolved = true;
    contract.result = {
      report:    report,
      stars:     stars,
      coreScore: coreScore
    };

    // ── 7) Update combo streak ────────────────────────────────
    if (contract.comboEligible) {
      if (contract.onSchedule && meetsTarget) {
        _comboStreak++;
        if (_comboStreak > _maxStreak) _maxStreak = _comboStreak;
        console.log('[DungeonSchedule] Combo streak: ' + _comboStreak +
                    ' (multiplier: ' + _comboMultiplier().toFixed(1) + '×)');
      } else {
        var reason = !contract.onSchedule ? 'death-shifted' : 'below target';
        console.log('[DungeonSchedule] Combo BROKEN (' + reason +
                    '). Core: ' + (coreScore * 100).toFixed(0) +
                    '%, target: ' + (contract.target * 100) + '%');
        _comboStreak = 0;
      }
    }
    // Non-combo-eligible groups (Heart) don't affect streak at all

    console.log('[DungeonSchedule] Group "' + contract.groupId + '" resolved. ' +
                'Core: ' + (coreScore * 100).toFixed(0) + '%, ' +
                'Stars: ' + stars + ', ' +
                'Payout: ' + (report ? report.totalPayout : 0));
  }

  /**
   * Count tiles of a given type in cached floor data.
   * @param {Object} cached — { grid, gridW, gridH }
   * @param {number} tileType
   * @returns {number}
   */
  function _countTiles(cached, tileType) {
    if (!cached || !cached.grid) return 0;
    var count = 0;
    for (var y = 0; y < cached.gridH; y++) {
      for (var x = 0; x < cached.gridW; x++) {
        if (cached.grid[y][x] === tileType) count++;
      }
    }
    return count;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DEATH SHIFT — called from HazardSystem / CombatBridge
  // ═══════════════════════════════════════════════════════════════

  /**
   * Shift a group's hero day when the player dies in one of its floors.
   * Only the affected group shifts — other groups are untouched.
   *
   * Rules:
   *   - Find the group that owns the floor
   *   - If already resolved, no-op (hero already ran)
   *   - Set actualDay = currentDay + 1 (heroes come tomorrow)
   *   - Mark onSchedule = false (breaks combo eligibility)
   *   - If actualDay was already ≤ currentDay + 1, no further shift
   *
   * @param {string} floorId — the floor where the player died
   * @returns {Object|null} — shifted contract, or null if no match
   */
  function onPlayerDeath(floorId) {
    if (!_initialized) return null;

    var contract = _getContractForFloor(floorId);
    if (!contract) {
      console.log('[DungeonSchedule] Death on floor ' + floorId +
                  ' — no matching group found.');
      return null;
    }

    if (contract.resolved) {
      console.log('[DungeonSchedule] Death in "' + contract.groupId +
                  '" — already resolved, no shift.');
      return null;
    }

    var tomorrow = _currentDay + 1;

    // Don't shift if already scheduled for tomorrow or earlier
    if (contract.actualDay <= tomorrow) {
      console.log('[DungeonSchedule] Death in "' + contract.groupId +
                  '" — hero day already at day ' + contract.actualDay +
                  ', no further shift.');
      // Still mark off-schedule if this is the first death
      if (contract.onSchedule && contract.actualDay !== contract.scheduledDay) {
        contract.onSchedule = false;
      }
      return contract;
    }

    var oldDay = contract.actualDay;
    contract.actualDay = tomorrow;
    contract.onSchedule = false;

    console.log('[DungeonSchedule] DEATH SHIFT: "' + contract.groupId +
                '" hero day moved from day ' + oldDay + ' → day ' + tomorrow +
                ' (player died on floor ' + floorId + ')');

    return contract;
  }

  // ═══════════════════════════════════════════════════════════════
  //  QUERIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Find the contract that owns a given floor ID.
   * @param {string} floorId
   * @returns {Object|null}
   */
  function _getContractForFloor(floorId) {
    if (!floorId) return null;
    for (var i = 0; i < _contracts.length; i++) {
      var c = _contracts[i];
      for (var j = 0; j < c.floorIds.length; j++) {
        if (c.floorIds[j] === floorId) return c;
      }
    }
    return null;
  }

  /**
   * Get the full schedule for display (dispatcher board).
   * Returns a shallow copy of each contract (safe for UI reads).
   * @returns {Array}
   */
  function getSchedule() {
    var out = [];
    for (var i = 0; i < _contracts.length; i++) {
      var c = _contracts[i];
      out.push({
        groupId:       c.groupId,
        label:         c.label,
        floorIds:      c.floorIds,
        scheduledDay:  c.scheduledDay,
        actualDay:     c.actualDay,
        heroType:      c.heroType,
        comboEligible: c.comboEligible,
        target:        c.target,
        resolved:      c.resolved,
        onSchedule:    c.onSchedule,
        result:        c.result
      });
    }
    return out;
  }

  /**
   * Get the group ID that owns a floor.
   * @param {string} floorId
   * @returns {string|null}
   */
  function getGroupForFloor(floorId) {
    var c = _getContractForFloor(floorId);
    return c ? c.groupId : null;
  }

  /**
   * Get current combo state.
   * @returns {{ streak: number, multiplier: number, maxStreak: number }}
   */
  function getCombo() {
    return {
      streak:     _comboStreak,
      multiplier: _comboMultiplier(),
      maxStreak:  _maxStreak
    };
  }

  /**
   * Get days until the next hero day for a specific group.
   * Used by bonfire warp guard: "You can advance — heroes don't come for 3 days."
   * @param {string} groupId
   * @returns {number} — days remaining, or -1 if already resolved / not found
   */
  function getDaysUntilHeroDay(groupId) {
    for (var i = 0; i < _contracts.length; i++) {
      var c = _contracts[i];
      if (c.groupId === groupId) {
        if (c.resolved) return -1;
        return Math.max(0, c.actualDay - _currentDay);
      }
    }
    return -1;
  }

  /**
   * Get the next unresolved group (soonest hero day).
   * @returns {Object|null} — contract summary, or null if all resolved
   */
  function getNextGroup() {
    var best = null;
    for (var i = 0; i < _contracts.length; i++) {
      var c = _contracts[i];
      if (c.resolved) continue;
      if (!best || c.actualDay < best.actualDay) {
        best = c;
      }
    }
    if (!best) return null;
    return {
      groupId:      best.groupId,
      label:        best.label,
      floorIds:     best.floorIds,
      target:       best.target,
      actualDay:    best.actualDay,
      daysAway:     Math.max(0, best.actualDay - _currentDay),
      heroType:     best.heroType,
      onSchedule:   best.onSchedule
    };
  }

  /**
   * Get the full arc summary for victory screen / end-state.
   * @returns {{ groups: Array, combo: Object, totalPayout: number,
   *             allResolved: boolean, totalStars: number, maxStars: number }}
   */
  function getArcSummary() {
    var groups = [];
    var totalPayout = 0;
    var totalStars = 0;
    var maxStars = 0;
    var allResolved = true;

    for (var i = 0; i < _contracts.length; i++) {
      var c = _contracts[i];
      if (!c.resolved) allResolved = false;

      var stars = c.result ? c.result.stars : 0;
      var payout = (c.result && c.result.report) ? c.result.report.totalPayout : 0;
      totalPayout += payout;
      totalStars += stars;
      maxStars += 5;

      groups.push({
        groupId:      c.groupId,
        label:        c.label,
        resolved:     c.resolved,
        onSchedule:   c.onSchedule,
        stars:        stars,
        coreScore:    c.result ? c.result.coreScore : 0,
        payout:       payout,
        heroType:     c.heroType,
        comboEligible: c.comboEligible
      });
    }

    return {
      groups:       groups,
      combo:        getCombo(),
      totalPayout:  totalPayout,
      totalStars:   totalStars,
      maxStars:     maxStars,
      allResolved:  allResolved
    };
  }

  /**
   * Check if all groups have been resolved (arc complete).
   * @returns {boolean}
   */
  function isArcComplete() {
    for (var i = 0; i < _contracts.length; i++) {
      if (!_contracts[i].resolved) return false;
    }
    return _contracts.length > 0;
  }

  /**
   * Get the current day (as tracked by this module).
   * @returns {number}
   */
  function getCurrentDay() {
    return _currentDay;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  return Object.freeze({
    // Lifecycle
    init:                init,
    onDayChange:         onDayChange,
    onPlayerDeath:       onPlayerDeath,

    // Queries
    getSchedule:         getSchedule,
    getGroupForFloor:    getGroupForFloor,
    getCombo:            getCombo,
    getDaysUntilHeroDay: getDaysUntilHeroDay,
    getNextGroup:        getNextGroup,
    getArcSummary:       getArcSummary,
    isArcComplete:       isArcComplete,
    getCurrentDay:       getCurrentDay,

    // Config (frozen reference)
    JAM_CONTRACTS:       JAM_CONTRACTS
  });
})();
