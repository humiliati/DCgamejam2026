/**
 * DayCycle — In-game time system with day/night phases.
 *
 * Time advances via floor transitions (not wall-clock). Each transition
 * ticks forward a configurable amount of in-game minutes. Dungeon floors
 * advance more time (you're down there a while); buildings less.
 *
 * Phases:
 *   DAWN      (06:00–08:00)  Shops opening, NPCs emerging
 *   MORNING   (08:00–12:00)  Peak activity, Hero Day barks
 *   AFTERNOON (12:00–17:00)  Normal activity
 *   DUSK      (17:00–19:00)  Shops closing, curfew warnings
 *   NIGHT     (19:00–06:00)  Empty streets, locked houses, muffled barks
 *
 * Hero Day: The game starts on a Hero Day (day 0). Heroes cycle every
 * HERO_DAY_INTERVAL days. On Hero Day, the carnage manifest runs when
 * the player enters a dungeon and bark pools switch to heroday variants.
 *
 * Layer 1 — depends on: nothing (pure state)
 */
var DayCycle = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  CONSTANTS
  // ═══════════════════════════════════════════════════════════════

  var PHASES = Object.freeze({
    DAWN:      'dawn',
    MORNING:   'morning',
    AFTERNOON: 'afternoon',
    DUSK:      'dusk',
    NIGHT:     'night'
  });

  // Phase boundaries (in-game hour, 24h clock)
  var PHASE_BOUNDS = [
    { phase: PHASES.DAWN,      start:  6 },
    { phase: PHASES.MORNING,   start:  8 },
    { phase: PHASES.AFTERNOON, start: 12 },
    { phase: PHASES.DUSK,      start: 17 },
    { phase: PHASES.NIGHT,     start: 19 }
    // Night wraps to dawn at 6
  ];

  // Time advancement per floor transition type (in-game minutes)
  var ADVANCE = Object.freeze({
    DUNGEON_ENTER:   45,   // Entering a dungeon floor
    DUNGEON_DEEPER:  30,   // Going deeper within dungeon
    DUNGEON_EXIT:    20,   // Returning up from dungeon
    BUILDING_ENTER:  10,   // Entering a building
    BUILDING_EXIT:    5,   // Leaving a building
    EXTERIOR_MOVE:   15,   // Moving between exterior zones
    REST:           480,   // Sleeping at inn/home (8 hours)
    HERO_DAY_SKIP:  720    // Dawn-to-dawn skip on Hero Day events
  });

  // Hero Day recurrence
  var HERO_DAY_INTERVAL = 3;   // Every 3 in-game days

  // ═══════════════════════════════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════════════════════════════

  var _day = 0;            // Current in-game day (0 = first day)
  var _hour = 6;           // Current hour (0–23, float)
  var _minute = 0;         // Current minute (0–59)
  var _phase = PHASES.DAWN;
  var _isHeroDay = true;   // Day 0 starts as Hero Day

  // Callbacks
  var _onPhaseChange = null;
  var _onDayChange = null;
  var _onHeroDayStart = null;
  var _onTired  = null;   // fires once at 21:00 (tired warning)
  var _onCurfew = null;   // fires once at 02:00 (forced home)

  // Per-day fire-once flags
  var _tiredFiredToday  = false;
  var _curfewFiredToday = false;

  // Time-freeze state for interior floors
  var _paused = false;

  // Night-lock state: floor IDs that are locked at night
  var _nightLockedFloors = {};

  // ═══════════════════════════════════════════════════════════════
  //  TIME RESOLUTION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Resolve which phase the current time falls into.
   */
  function _resolvePhase(hour) {
    // Work backwards through bounds — night wraps around midnight
    if (hour >= 19 || hour < 6)  return PHASES.NIGHT;
    if (hour >= 17)              return PHASES.DUSK;
    if (hour >= 12)              return PHASES.AFTERNOON;
    if (hour >= 8)               return PHASES.MORNING;
    return PHASES.DAWN;
  }

  /**
   * Advance in-game time by the given number of minutes.
   * Handles day rollover and phase transitions.
   * Respects the pause flag (interior time-freeze).
   *
   * @param {number} minutes - In-game minutes to advance
   */
  function advanceTime(minutes) {
    // Interior time-freeze: don't advance time on depth-2 floors
    if (_paused) return;

    var totalMinutes = _hour * 60 + _minute + minutes;
    var oldPhase = _phase;

    // Handle day rollover (1440 minutes per day)
    while (totalMinutes >= 1440) {
      totalMinutes -= 1440;
      _day++;

      // Check Hero Day
      _isHeroDay = (_day % HERO_DAY_INTERVAL === 0);
      if (_onDayChange) _onDayChange(_day);
      if (_isHeroDay && _onHeroDayStart) _onHeroDayStart(_day);
    }

    _hour = Math.floor(totalMinutes / 60);
    _minute = totalMinutes % 60;

    var newPhase = _resolvePhase(_hour);
    if (newPhase !== _phase) {
      _phase = newPhase;
      if (_onPhaseChange) _onPhaseChange(newPhase, oldPhase);
    }

    // Tired check: fire once at 19:00 (7pm, night phase start)
    // Player gets the TIRED debuff warning at dusk/night boundary.
    // If they're not in bed by midnight, they lose the WELL_RESTED window.
    if (_phase === PHASES.NIGHT && _hour >= 19 && !_tiredFiredToday) {
      _tiredFiredToday = true;
      if (_onTired) _onTired(_day);
    }

    // Curfew check: fire once at 02:00 (2am, post-midnight)
    if (_phase === PHASES.NIGHT && _hour >= 0 && _hour < 6 && !_curfewFiredToday) {
      _curfewFiredToday = true;
      if (_onCurfew) _onCurfew(_day);
    }

    // Reset both flags at dawn
    if (newPhase === PHASES.DAWN && oldPhase === PHASES.NIGHT) {
      _tiredFiredToday  = false;
      _curfewFiredToday = false;
    }
  }

  /**
   * Advance time based on a floor transition.
   * Automatically determines how much time to advance based on
   * source/target floor depths.
   *
   * Interior time-freeze (DOC-7 §5.5): Time does NOT advance for depth-2
   * transitions (entering or exiting buildings). This prevents curfew
   * from triggering during indoor exploration.
   *
   * @param {string} fromFloor - Source floor ID
   * @param {string} toFloor - Target floor ID
   */
  function onFloorTransition(fromFloor, toFloor) {
    var fromDepth = fromFloor ? fromFloor.split('.').length : 1;
    var toDepth = toFloor ? toFloor.split('.').length : 1;

    // Skip time advance for depth-2 transitions (interior time-freeze)
    if (toDepth === 2 || fromDepth === 2) {
      return;
    }

    var minutes;

    if (toDepth >= 3 && fromDepth < 3) {
      // Entering dungeon from surface
      minutes = ADVANCE.DUNGEON_ENTER;
    } else if (toDepth >= 3 && fromDepth >= 3) {
      // Moving within dungeon
      minutes = toDepth > fromDepth ? ADVANCE.DUNGEON_DEEPER : ADVANCE.DUNGEON_EXIT;
    } else if (toDepth === 1 && fromDepth >= 3) {
      // Exiting dungeon to surface
      minutes = ADVANCE.DUNGEON_EXIT;
    } else {
      // Exterior-to-exterior
      minutes = ADVANCE.EXTERIOR_MOVE;
    }

    advanceTime(minutes);
  }

  // ═══════════════════════════════════════════════════════════════
  //  HERO DAY
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if today is a Hero Day.
   */
  function isHeroDay() {
    return _isHeroDay;
  }

  /**
   * Get the number of days until the next Hero Day.
   */
  function daysUntilHeroDay() {
    if (_isHeroDay) return 0;
    return HERO_DAY_INTERVAL - (_day % HERO_DAY_INTERVAL);
  }

  // ═══════════════════════════════════════════════════════════════
  //  NIGHT LOCKING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Register a floor ID as night-lockable.
   * These buildings lock their doors at night and unlock at dawn.
   *
   * @param {string} floorId - Building floor ID to lock at night
   * @param {Object} [opts]
   * @param {string} [opts.muffledBarkPool] - Bark pool for muffled sounds through door
   */
  function registerNightLock(floorId, opts) {
    _nightLockedFloors[floorId] = {
      muffledBarkPool: (opts && opts.muffledBarkPool) || null
    };
  }

  /**
   * Check if a floor is currently night-locked.
   * @param {string} floorId
   * @returns {boolean}
   */
  function isNightLocked(floorId) {
    if (!_nightLockedFloors[floorId]) return false;
    return _phase === PHASES.NIGHT || _phase === PHASES.DUSK;
  }

  /**
   * Get the muffled bark pool for a night-locked floor (if any).
   * @param {string} floorId
   * @returns {string|null}
   */
  function getMuffledBarkPool(floorId) {
    var entry = _nightLockedFloors[floorId];
    if (!entry) return null;
    return entry.muffledBarkPool;
  }

  // ═══════════════════════════════════════════════════════════════
  //  ATMOSPHERE HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a 0–1 sun intensity value for lighting/atmosphere.
   * Peak at noon (1.0), zero at night (0.0).
   */
  function getSunIntensity() {
    if (_phase === PHASES.NIGHT) return 0;
    if (_phase === PHASES.DAWN) {
      // Ramp up from 0.1 to 0.5 over dawn
      return 0.1 + (_hour - 6) / 2 * 0.4;
    }
    if (_phase === PHASES.DUSK) {
      // Ramp down from 0.5 to 0.1 over dusk
      return 0.5 - (_hour - 17) / 2 * 0.4;
    }
    if (_phase === PHASES.MORNING) {
      // Ramp up from 0.5 to 1.0
      return 0.5 + (_hour - 8) / 4 * 0.5;
    }
    // AFTERNOON: ramp down from 1.0 to 0.5
    return 1.0 - (_hour - 12) / 5 * 0.5;
  }

  /**
   * Get a fog/sky tint multiplier per channel (RGB) for the current phase.
   * Returned as {r, g, b} multipliers in [0, 1].
   */
  function getAtmosphereTint() {
    switch (_phase) {
      case PHASES.DAWN:
        return { r: 0.85, g: 0.70, b: 0.65 };   // Warm pink/orange
      case PHASES.MORNING:
        return { r: 0.95, g: 0.95, b: 1.00 };   // Neutral bright
      case PHASES.AFTERNOON:
        return { r: 1.00, g: 0.95, b: 0.85 };   // Warm golden
      case PHASES.DUSK:
        return { r: 0.80, g: 0.55, b: 0.45 };   // Deep orange/red
      case PHASES.NIGHT:
        return { r: 0.35, g: 0.40, b: 0.60 };   // Cool blue
      default:
        return { r: 1, g: 1, b: 1 };
    }
  }

  /**
   * Get the bark pool suffix for the current time of day.
   * NPCs can have time-specific bark pools: "ambient.promenade.morning", etc.
   * Returns the time suffix or null for default pool.
   */
  function getBarkTimeSuffix() {
    if (_isHeroDay && (_phase === PHASES.DAWN || _phase === PHASES.MORNING)) {
      return 'heroday';
    }
    switch (_phase) {
      case PHASES.DAWN:
      case PHASES.MORNING:
        return 'morning';
      case PHASES.DUSK:
        return 'dusk';
      case PHASES.NIGHT:
        return 'night';
      default:
        return null;  // afternoon = use default pool
    }
  }

  /**
   * Get the day-of-cycle bark suffix.
   * Hero Day = day 0 of cycle (handled by getBarkTimeSuffix → 'heroday').
   * Day 1 after hero = post-carnage cleanup day → 'day1'.
   * Day 2 after hero = routine/prep day → 'day2'.
   * Returns null on hero days (already handled) or if no suffix applies.
   */
  function getDayCycleSuffix() {
    var dayInCycle = _day % HERO_DAY_INTERVAL;
    if (dayInCycle === 0) return null;  // hero day — handled by time suffix
    if (dayInCycle === 1) return 'day1';
    return 'day2';
  }

  // ═══════════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initialize. Game starts at dawn on Hero Day (day 0).
   */
  function init() {
    _day = 0;
    _hour = 6;
    _minute = 0;
    _phase = PHASES.DAWN;
    _isHeroDay = true;
    _paused = false;
    _tiredFiredToday = false;
    _curfewFiredToday = false;
    _nightLockedFloors = {};
    console.log('[DayCycle] Initialized — Day 0 (Hero Day), Dawn');
  }

  /**
   * Set time explicitly (for save/load or debug).
   */
  function setTime(day, hour, minute) {
    _day = day;
    _hour = hour;
    _minute = minute || 0;
    _isHeroDay = (_day % HERO_DAY_INTERVAL === 0);
    _phase = _resolvePhase(_hour);
  }

  /**
   * Pause/unpause the clock (interior time-freeze).
   * When paused, advanceTime() becomes a no-op.
   * @param {boolean} paused
   */
  function setPaused(paused) {
    _paused = paused;
  }

  /**
   * Check if the clock is paused.
   * @returns {boolean}
   */
  function isPaused() {
    return _paused;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CALLBACKS
  // ═══════════════════════════════════════════════════════════════

  function setOnPhaseChange(fn)    { _onPhaseChange = fn; }
  function setOnDayChange(fn)      { _onDayChange = fn; }
  function setOnHeroDayStart(fn)   { _onHeroDayStart = fn; }
  function setOnTired(fn)          { _onTired = fn; }
  function setOnCurfew(fn)         { _onCurfew = fn; }

  // ═══════════════════════════════════════════════════════════════
  //  QUERIES
  // ═══════════════════════════════════════════════════════════════

  // Day-of-week names (game starts Monday — a work day for a Gleaner)
  var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Suit symbols for hero-day cycle. Order matches DungeonSchedule
  // JAM_CONTRACTS: club leads the arc (day 0 starting crisis at 2.2),
  // then spade (day 3), then diamond (day 6). Each hero day corresponds
  // to a dungeon faction's suit on a 3-day cadence.
  var HERO_SUITS = [
    { sym: '\u2663', color: '#66cc66', name: 'club'    },  // ♣ green dungeon — day 0 crisis
    { sym: '\u2660', color: '#8888ff', name: 'spade'   },  // ♠ blue dungeon  — day 3
    { sym: '\u2666', color: '#ff6666', name: 'diamond' }   // ♦ red dungeon   — day 6
  ];

  function getDay()     { return _day; }
  function getHour()    { return _hour; }
  function getMinute()  { return _minute; }
  function getPhase()   { return _phase; }
  function getTimeString() {
    var h = Math.floor(_hour);
    var m = Math.floor(_minute);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /**
   * Get abbreviated day-of-week name (Mon–Sun).
   * Day 0 = Monday (work week start, fitting for a Gleaner).
   * @returns {string}
   */
  function getDayOfWeek() {
    return DAY_NAMES[_day % 7];
  }

  /**
   * Get full day-of-week name (Monday–Sunday).
   * @returns {string}
   */
  function getDayOfWeekFull() {
    return DAY_NAMES_FULL[_day % 7];
  }

  /**
   * Get the suit data for a given day (hero-day cycle).
   * On non-hero days returns null. On hero days returns { sym, color, name }.
   * @param {number} [dayNum] - Defaults to current day
   * @returns {Object|null}
   */
  function getDaySuit(dayNum) {
    if (dayNum === undefined) dayNum = _day;
    if (dayNum % HERO_DAY_INTERVAL !== 0) return null;
    var idx = Math.floor(dayNum / HERO_DAY_INTERVAL) % HERO_SUITS.length;
    return HERO_SUITS[idx];
  }

  /**
   * Get a display label for the current day — suit symbol on hero days,
   * abbreviated day name otherwise.
   * @returns {string}
   */
  function getDayLabel() {
    var suit = getDaySuit(_day);
    return suit ? suit.sym : DAY_NAMES[_day % 7];
  }

  /**
   * Get the color for the current day label — suit color on hero days,
   * null otherwise (caller uses default color).
   * @returns {string|null}
   */
  function getDayLabelColor() {
    var suit = getDaySuit(_day);
    return suit ? suit.color : null;
  }

  /**
   * Get a phase icon emoji for HUD display.
   * @returns {string}
   */
  function getPhaseIcon() {
    switch (_phase) {
      case PHASES.DAWN:      return '\u2600';  // ☀ (sunrise)
      case PHASES.MORNING:   return '\u2600';  // ☀
      case PHASES.AFTERNOON: return '\u2600';  // ☀
      case PHASES.DUSK:      return '\uD83C\uDF05';  // 🌅
      case PHASES.NIGHT:     return '\uD83C\uDF19';  // 🌙
      default:               return '\u2600';
    }
  }

  /**
   * Get the phase that follows the current one in the day cycle.
   * @returns {string} Next phase name
   */
  function getNextPhase() {
    for (var i = 0; i < PHASE_BOUNDS.length; i++) {
      if (PHASE_BOUNDS[i].phase === _phase) {
        return PHASE_BOUNDS[(i + 1) % PHASE_BOUNDS.length].phase;
      }
    }
    return PHASES.DAWN;
  }

  /**
   * Get fractional progress (0–1) through the current phase.
   * Used by skybox for smooth color interpolation between phases.
   * @returns {number} 0 at phase start, 1 at phase end
   */
  function getPhaseProgress() {
    var startHour = 0;
    var endHour = 24;
    for (var i = 0; i < PHASE_BOUNDS.length; i++) {
      if (PHASE_BOUNDS[i].phase === _phase) {
        startHour = PHASE_BOUNDS[i].start;
        var nextIdx = (i + 1) % PHASE_BOUNDS.length;
        endHour = PHASE_BOUNDS[nextIdx].start;
        break;
      }
    }
    // Handle night wrapping (19–6 spans midnight)
    var phaseLen, elapsed;
    if (endHour <= startHour) {
      phaseLen = (24 - startHour) + endHour;
      elapsed = _hour >= startHour ? (_hour - startHour) : (24 - startHour + _hour);
    } else {
      phaseLen = endHour - startHour;
      elapsed = _hour - startHour;
    }
    return phaseLen > 0 ? Math.max(0, Math.min(1, elapsed / phaseLen)) : 0;
  }

  /**
   * Is the current hour in the "tired" range (19:00–05:59)?
   * @returns {boolean}
   */
  function isTiredHour() {
    return _phase === PHASES.NIGHT;
  }

  /**
   * Is the current hour in the "curfew" range (00:00–05:59, post-midnight)?
   * @returns {boolean}
   */
  function isCurfewHour() {
    return _phase === PHASES.NIGHT && _hour >= 0 && _hour < 6;
  }

  // ═══════════════════════════════════════════════════════════════
  //  TUNABLE SURFACE (Lighting Test-Harness §1)
  // ═══════════════════════════════════════════════════════════════

  // Mutable advance-minute overrides. The frozen ADVANCE constant
  // is the baseline; _advanceOverrides patches on top.
  var _advanceOverrides = {};

  // Phase force: when non-null, getPhase() returns this instead of
  // the time-resolved phase. advanceTime still ticks the clock, but
  // downstream consumers see a frozen phase for rendering/barks.
  var _phaseForce = null;

  // Sun angle override: when non-null, getSunIntensity() returns a
  // value derived from this angle instead of the time-based calc.
  var _sunAngleOverride = null;

  // Store the original getPhase for internal use
  var _resolvedPhase = getPhase;

  // Wrap getPhase to support forced phase
  var _origGetPhase = getPhase;
  getPhase = function () {
    if (_phaseForce) return _phaseForce;
    return _origGetPhase();
  };

  // Wrap getSunIntensity to support sun angle override
  if (typeof getSunIntensity === 'function') {
    var _origGetSunIntensity = getSunIntensity;
    getSunIntensity = function () {
      if (_sunAngleOverride != null) {
        // Map angle 0–360 to intensity 0–1 with peak at 90 (noon)
        var a = (+_sunAngleOverride % 360 + 360) % 360;
        return Math.max(0, Math.sin(a * Math.PI / 180));
      }
      return _origGetSunIntensity();
    };
  }

  /**
   * Get the effective advance minutes for a transition type, with
   * any harness overrides applied.
   */
  function getEffectiveAdvance(type) {
    if (_advanceOverrides[type] != null) return +_advanceOverrides[type];
    return ADVANCE[type] || 0;
  }

  function getTunables() {
    var adv = {};
    for (var k in ADVANCE) {
      if (ADVANCE.hasOwnProperty(k)) {
        adv[k] = (_advanceOverrides[k] != null) ? +_advanceOverrides[k] : ADVANCE[k];
      }
    }
    return {
      ADVANCE:           adv,
      HERO_DAY_INTERVAL: HERO_DAY_INTERVAL,
      phaseForce:        _phaseForce,
      sunAngleOverride:  _sunAngleOverride
    };
  }

  function setTunables(patch) {
    if (!patch || typeof patch !== 'object') return;
    if (patch.ADVANCE && typeof patch.ADVANCE === 'object') {
      for (var k in patch.ADVANCE) {
        if (patch.ADVANCE.hasOwnProperty(k) && ADVANCE.hasOwnProperty(k)) {
          _advanceOverrides[k] = +patch.ADVANCE[k];
        }
      }
    }
    if (patch.phaseForce !== undefined) {
      if (patch.phaseForce === null || patch.phaseForce === 'auto') {
        _phaseForce = null;
      } else {
        _phaseForce = patch.phaseForce;
      }
    }
    if (patch.sunAngleOverride !== undefined) {
      _sunAngleOverride = (patch.sunAngleOverride === null) ? null : +patch.sunAngleOverride;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  return Object.freeze({
    // Constants
    PHASES:               PHASES,
    ADVANCE:              ADVANCE,
    HERO_DAY_INTERVAL:    HERO_DAY_INTERVAL,

    // Lifecycle
    init:                 init,
    advanceTime:          advanceTime,
    onFloorTransition:    onFloorTransition,
    setTime:              setTime,
    setPaused:            setPaused,
    isPaused:             isPaused,

    // Hero Day
    isHeroDay:            isHeroDay,
    daysUntilHeroDay:     daysUntilHeroDay,

    // Night locking
    registerNightLock:    registerNightLock,
    isNightLocked:        isNightLocked,
    getMuffledBarkPool:   getMuffledBarkPool,

    // Atmosphere
    getSunIntensity:      getSunIntensity,
    getAtmosphereTint:    getAtmosphereTint,
    getBarkTimeSuffix:    getBarkTimeSuffix,
    getDayCycleSuffix:    getDayCycleSuffix,

    // Callbacks
    setOnPhaseChange:     setOnPhaseChange,
    setOnDayChange:       setOnDayChange,
    setOnHeroDayStart:    setOnHeroDayStart,
    setOnTired:           setOnTired,
    setOnCurfew:          setOnCurfew,

    // Queries
    getDay:               getDay,
    getHour:              getHour,
    getMinute:            getMinute,
    getPhase:             getPhase,
    getTimeString:        getTimeString,
    getNextPhase:         getNextPhase,
    getPhaseProgress:     getPhaseProgress,
    getDayOfWeek:         getDayOfWeek,
    getDayOfWeekFull:     getDayOfWeekFull,
    getDaySuit:           getDaySuit,
    getDayLabel:          getDayLabel,
    getDayLabelColor:     getDayLabelColor,
    getPhaseIcon:         getPhaseIcon,
    isTiredHour:          isTiredHour,
    isCurfewHour:         isCurfewHour,

    // Tunable surface
    getEffectiveAdvance:  getEffectiveAdvance,
    getTunables:          getTunables,
    setTunables:          setTunables
  });
})();
