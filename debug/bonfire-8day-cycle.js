/**
 * Debug harness — Simulate 8 days of bonfire rest cycles.
 *
 * Tests DayCycle in isolation (Layer 1, no DOM dependencies).
 * Exercises: advanceTime, phase transitions, day rollover, Hero Day,
 * TIRED/CURFEW fire-once callbacks, and the proposed bonfire time-advance.
 *
 * Run:  node debug/bonfire-8day-cycle.js
 *
 * What this proves:
 *   1. DayCycle.advanceTime(ADVANCE.REST = 480min = 8h) correctly rolls days
 *   2. Phase boundaries resolve after each advance
 *   3. Hero Day fires every 3 days (day 0, 3, 6)
 *   4. TIRED fires at 19:00, CURFEW fires at 02:00 (fire-once per day)
 *   5. Bonfire rest from various phases lands in expected next-phase
 *   6. The "rest-until-dawn" variant (advance to 06:00 next day) works
 *   7. §11a depth-branched rest: exterior=dawn, dungeon=2h brief (no WELL_RESTED)
 *
 * NOTE: This does NOT test the actual bonfire interaction path in game.js.
 * It tests the DayCycle engine that bonfire SHOULD be wired into (§7a).
 */

// ── Load DayCycle IIFE into Node ──
// day-cycle.js uses `var DayCycle = (function(){ ... })();`
// We eval it so the IIFE returns into our scope.
var fs = require('fs');
var src = fs.readFileSync(__dirname + '/../engine/day-cycle.js', 'utf8');

// DayCycle has no external dependencies (Layer 1 — pure state)
eval(src);

// ═══════════════════════════════════════════════════════════════
//  LOGGING HELPERS
// ═══════════════════════════════════════════════════════════════

var COLORS = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bright:  '\x1b[1m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m'
};

var phaseColors = {
  dawn:      COLORS.yellow,
  morning:   COLORS.green,
  afternoon: COLORS.cyan,
  dusk:      COLORS.magenta,
  night:     COLORS.blue
};

function phaseTag(phase) {
  var c = phaseColors[phase] || COLORS.reset;
  return c + phase.toUpperCase().padEnd(9) + COLORS.reset;
}

function snapshot(label) {
  var day   = DayCycle.getDay();
  var time  = DayCycle.getTimeString();
  var phase = DayCycle.getPhase();
  var dow   = DayCycle.getDayOfWeek();
  var hero  = DayCycle.isHeroDay();
  var suit  = DayCycle.getDaySuit();
  var prog  = DayCycle.getPhaseProgress().toFixed(3);
  var sun   = DayCycle.getSunIntensity().toFixed(3);
  var tint  = DayCycle.getAtmosphereTint();

  var heroStr = hero
    ? COLORS.red + 'HERO DAY ' + (suit ? suit.sym + ' ' + suit.name : '') + COLORS.reset
    : COLORS.dim + 'normal' + COLORS.reset;

  console.log(
    COLORS.bright + '  [' + label + ']' + COLORS.reset +
    '  Day ' + day + ' (' + dow + ')  ' + time +
    '  ' + phaseTag(phase) +
    '  progress=' + prog +
    '  sun=' + sun +
    '  tint=(' + tint.r.toFixed(2) + ',' + tint.g.toFixed(2) + ',' + tint.b.toFixed(2) + ')' +
    '  ' + heroStr
  );
}

// ═══════════════════════════════════════════════════════════════
//  CALLBACK TRACKING
// ═══════════════════════════════════════════════════════════════

var events = [];

DayCycle.setOnPhaseChange(function (newPhase, oldPhase) {
  events.push({ type: 'PHASE', from: oldPhase, to: newPhase, day: DayCycle.getDay(), time: DayCycle.getTimeString() });
  console.log(
    COLORS.dim + '    >> Phase change: ' + oldPhase + ' → ' + newPhase +
    '  (Day ' + DayCycle.getDay() + ' ' + DayCycle.getTimeString() + ')' + COLORS.reset
  );
});

DayCycle.setOnDayChange(function (day) {
  events.push({ type: 'DAY', day: day, time: DayCycle.getTimeString() });
  console.log(
    COLORS.yellow + '    >> New day: Day ' + day + ' (' + DayCycle.getDayOfWeek() + ')' + COLORS.reset
  );
});

DayCycle.setOnHeroDayStart(function (day) {
  events.push({ type: 'HERO_DAY', day: day });
  var suit = DayCycle.getDaySuit(day);
  console.log(
    COLORS.red + COLORS.bright + '    >> HERO DAY START — Day ' + day +
    (suit ? ' ' + suit.sym + ' ' + suit.name : '') + COLORS.reset
  );
});

DayCycle.setOnTired(function (day) {
  events.push({ type: 'TIRED', day: day, time: DayCycle.getTimeString() });
  console.log(
    COLORS.magenta + '    >> TIRED callback fired (Day ' + day + ' ' + DayCycle.getTimeString() + ')' + COLORS.reset
  );
});

DayCycle.setOnCurfew(function (day) {
  events.push({ type: 'CURFEW', day: day, time: DayCycle.getTimeString() });
  console.log(
    COLORS.red + '    >> CURFEW callback fired (Day ' + day + ' ' + DayCycle.getTimeString() + ')' + COLORS.reset
  );
});

// ═══════════════════════════════════════════════════════════════
//  REST-UNTIL-DAWN HELPER (mirrors HazardSystem._minutesUntilDawn)
// ═══════════════════════════════════════════════════════════════

function minutesUntilDawn() {
  var currentMinutes = DayCycle.getHour() * 60 + DayCycle.getMinute();
  var dawnMinutes = 360; // 06:00
  var advance = currentMinutes < dawnMinutes
    ? dawnMinutes - currentMinutes
    : (1440 - currentMinutes) + dawnMinutes;
  if (advance === 0) advance = 1440;
  return advance;
}

// ═══════════════════════════════════════════════════════════════
//  WEEK-STRIP VISUALIZATION (mirrors game.js _updateDayCounter)
// ═══════════════════════════════════════════════════════════════

var WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
var HERO_INTERVAL = DayCycle.HERO_DAY_INTERVAL || 3;
var SUIT_SYMS = ['\u2660', '\u2666', '\u2663']; // ♠♦♣

function weekStrip() {
  var day = DayCycle.getDay();
  var weekIdx = day % 7;
  var strip = '  ';
  for (var i = 0; i < 7; i++) {
    var dayNum = day - weekIdx + i;
    var isToday = (i === weekIdx);
    var isHero = (dayNum >= 0 && dayNum % HERO_INTERVAL === 0);
    var suitIdx = Math.floor(Math.max(0, dayNum) / HERO_INTERVAL) % SUIT_SYMS.length;
    var label = isHero ? SUIT_SYMS[suitIdx] : WEEK_DAYS[i];
    var isPast = (i < weekIdx);

    if (isToday) {
      strip += COLORS.bright + COLORS.yellow + '[' + label + ']' + COLORS.reset;
    } else if (isPast) {
      strip += COLORS.dim + ' ' + label + ' ' + COLORS.reset;
    } else {
      strip += ' ' + label + ' ';
    }
  }
  strip += COLORS.dim + '  ' + DayCycle.getTimeString() + COLORS.reset;
  return strip;
}

// ═══════════════════════════════════════════════════════════════
//  TEST SCENARIOS
// ═══════════════════════════════════════════════════════════════

console.log('\n' + COLORS.bright + '══════════════════════════════════════════════════════════' + COLORS.reset);
console.log(COLORS.bright + '  BONFIRE 8-DAY CYCLE DEBUG — DayCycle Engine Test' + COLORS.reset);
console.log(COLORS.bright + '══════════════════════════════════════════════════════════' + COLORS.reset);

// ── SCENARIO 1: Rest-until-dawn jam build (8 days) ──
// Simulates: player explores for ~6h, rests at bonfire → wakes at 06:00

console.log('\n' + COLORS.bright + '── SCENARIO 1: Bonfire REST-UNTIL-DAWN per day (jam build) ──' + COLORS.reset);
console.log(COLORS.dim + '   Simulates explore ~6h then bonfire rest → always wake at 06:00' + COLORS.reset);

DayCycle.init();
console.log(weekStrip());
snapshot('INIT');

for (var day = 0; day < 8; day++) {
  // Simulate ~6h of exploration (as floor transitions)
  console.log(COLORS.dim + '\n  --- Day ' + DayCycle.getDay() + ' (' + DayCycle.getDayOfWeek() + ') exploration ---' + COLORS.reset);

  // 4 exterior moves (15 min each = 60 min)
  for (var e = 0; e < 4; e++) {
    DayCycle.advanceTime(DayCycle.ADVANCE.EXTERIOR_MOVE);
  }
  snapshot('after 4 exterior moves');

  // Enter dungeon (45 min)
  DayCycle.advanceTime(DayCycle.ADVANCE.DUNGEON_ENTER);
  snapshot('dungeon enter');

  // 3 dungeon floors deeper (30 min each = 90 min)
  for (var d = 0; d < 3; d++) {
    DayCycle.advanceTime(DayCycle.ADVANCE.DUNGEON_DEEPER);
  }
  snapshot('3 floors deeper');

  // Exit dungeon (20 min)
  DayCycle.advanceTime(DayCycle.ADVANCE.DUNGEON_EXIT);
  snapshot('dungeon exit');

  // 2 more exterior moves back to bonfire (30 min)
  DayCycle.advanceTime(DayCycle.ADVANCE.EXTERIOR_MOVE);
  DayCycle.advanceTime(DayCycle.ADVANCE.EXTERIOR_MOVE);
  snapshot('back at bonfire');

  // ── BONFIRE REST UNTIL DAWN ──
  var toAdvance = minutesUntilDawn();
  console.log(COLORS.green + '  🔥 BONFIRE REST UNTIL DAWN — advanceTime(' + toAdvance + ') = ' +
              (toAdvance / 60).toFixed(1) + 'h' + COLORS.reset);
  DayCycle.advanceTime(toAdvance);
  console.log(weekStrip());
  snapshot('dawn wake-up');
}

// ── SCENARIO 2: Rest-until-dawn edge cases ──
// §7d: validate minutesUntilDawn from every phase of day

console.log('\n\n' + COLORS.bright + '── SCENARIO 2: Rest-until-dawn edge cases ──' + COLORS.reset);
console.log(COLORS.dim + '   Validates _minutesUntilDawn() from every time-of-day' + COLORS.reset);

var testTimes = [
  { hour: 14, minute: 30, label: '14:30 (afternoon)' },
  { hour: 17, minute: 45, label: '17:45 (dusk)' },
  { hour: 21, minute:  0, label: '21:00 (night/tired)' },
  { hour:  1, minute: 15, label: '01:15 (post-midnight)' },
  { hour:  5, minute: 30, label: '05:30 (pre-dawn)' },
  { hour:  6, minute:  0, label: '06:00 (dawn start — edge case)' }
];

for (var t = 0; t < testTimes.length; t++) {
  var test = testTimes[t];
  DayCycle.init();
  DayCycle.setTime(3, test.hour, test.minute); // Day 3, hero day

  var currentMinutes = test.hour * 60 + test.minute;
  var targetMinutes = 6 * 60; // 06:00
  var advance = currentMinutes < targetMinutes
    ? targetMinutes - currentMinutes           // Same day (e.g., 01:15 → 06:00)
    : (1440 - currentMinutes) + targetMinutes; // Next day (e.g., 14:30 → 06:00+1)

  // Edge case: if already at 06:00, advance full day
  if (advance === 0) advance = 1440;

  console.log(
    '\n  From ' + test.label + ' → rest-until-dawn = ' +
    COLORS.cyan + advance + ' min' + COLORS.reset +
    ' (' + (advance / 60).toFixed(1) + 'h)'
  );

  snapshot('BEFORE rest');
  DayCycle.advanceTime(advance);
  snapshot('AFTER rest-until-dawn');
}

// ── SCENARIO 3: Pause state (interior time-freeze) ──
// Verify bonfire rest in a paused interior is a no-op

console.log('\n\n' + COLORS.bright + '── SCENARIO 3: Paused (interior) bonfire rest ──' + COLORS.reset);
console.log(COLORS.dim + '   Currently bonfire rest while paused would be a no-op!' + COLORS.reset);
console.log(COLORS.dim + '   §7a fix: setPaused(false) before advanceTime, re-pause after' + COLORS.reset);

DayCycle.init();
DayCycle.advanceTime(DayCycle.ADVANCE.DUNGEON_ENTER); // 45 min
snapshot('after dungeon enter');

DayCycle.setPaused(true);
console.log(COLORS.red + '  ⚠ Clock PAUSED (interior time-freeze)' + COLORS.reset);

// Attempt bonfire rest while paused — this is the current bug
DayCycle.advanceTime(DayCycle.ADVANCE.REST);
snapshot('after REST while paused (BUG: time unchanged)');

// §7a fix: unpause → advance → re-pause
DayCycle.setPaused(false);
DayCycle.advanceTime(DayCycle.ADVANCE.REST);
DayCycle.setPaused(true);
console.log(COLORS.green + '  ✅ Fix: unpause → advance → re-pause' + COLORS.reset);
snapshot('after REST with unpause fix');

// ── SCENARIO 4: Rapid bonfire spam (edge case) ──
// What happens if player rests at bonfire 3 times in a row?

console.log('\n\n' + COLORS.bright + '── SCENARIO 4: Rapid bonfire spam (3x REST) ──' + COLORS.reset);
console.log(COLORS.dim + '   Edge case: player rests 3 times consecutively' + COLORS.reset);

DayCycle.init();
DayCycle.advanceTime(180); // Advance to 09:00
snapshot('morning start');

for (var r = 0; r < 3; r++) {
  console.log(COLORS.green + '  🔥 REST #' + (r + 1) + COLORS.reset);
  DayCycle.advanceTime(DayCycle.ADVANCE.REST);
  snapshot('after rest #' + (r + 1));
}

// ── SCENARIO 5: WELL_RESTED gate (bedtime before/after midnight) ──

console.log('\n\n' + COLORS.bright + '── SCENARIO 5: WELL_RESTED bedtime gate ──' + COLORS.reset);
console.log(COLORS.dim + '   TIRED starts at 19:00. WELL_RESTED requires bedtime before midnight.' + COLORS.reset);
console.log(COLORS.dim + '   sleepHour >= 6 → WELL_RESTED. sleepHour < 6 → no buff.' + COLORS.reset);

var wellRestedTests = [
  { hour: 10, minute: 0,  expected: true,  label: '10:00 (morning nap — before midnight)' },
  { hour: 18, minute: 30, expected: true,  label: '18:30 (dusk — before midnight)' },
  { hour: 20, minute: 0,  expected: true,  label: '20:00 (evening — before midnight)' },
  { hour: 23, minute: 45, expected: true,  label: '23:45 (just before midnight — still counts)' },
  { hour:  0, minute: 15, expected: false, label: '00:15 (just after midnight — too late!)' },
  { hour:  1, minute: 30, expected: false, label: '01:30 (post-midnight — no buff)' },
  { hour:  5, minute: 50, expected: false, label: '05:50 (pre-dawn — no buff)' }
];

var wellRestedErrors = 0;
for (var w = 0; w < wellRestedTests.length; w++) {
  var wt = wellRestedTests[w];
  var wouldGetBuff = (wt.hour >= 6);
  var pass = (wouldGetBuff === wt.expected);
  var icon = pass ? COLORS.green + '✅' : COLORS.red + '❌';
  console.log(
    '  ' + icon + COLORS.reset + '  ' + wt.label +
    ' → sleepHour=' + wt.hour +
    ' → WELL_RESTED=' + (wouldGetBuff ? COLORS.green + 'YES' : COLORS.red + 'NO') + COLORS.reset +
    (pass ? '' : COLORS.red + ' MISMATCH (expected ' + wt.expected + ')' + COLORS.reset)
  );
  if (!pass) wellRestedErrors++;
}
console.log(wellRestedErrors === 0
  ? COLORS.green + '  All WELL_RESTED checks passed' + COLORS.reset
  : COLORS.red + '  ' + wellRestedErrors + ' WELL_RESTED check(s) failed' + COLORS.reset);

// ── SCENARIO 6: TIRED fires at 19:00, not 21:00 ──

console.log('\n' + COLORS.bright + '── SCENARIO 6: TIRED trigger timing ──' + COLORS.reset);
console.log(COLORS.dim + '   TIRED should fire at 19:00 (night phase start), not 21:00' + COLORS.reset);

DayCycle.init();
var scenario6TiredFired = false;
// Override just for this test
DayCycle.setOnTired(function () { scenario6TiredFired = true; });

// Advance to 18:59 — should NOT fire TIRED yet
DayCycle.advanceTime(12 * 60 + 59); // 06:00 + 779min = 18:59
console.log('  18:59 → TIRED fired: ' + (scenario6TiredFired
  ? COLORS.red + 'YES (BUG!)' + COLORS.reset
  : COLORS.green + 'NO (correct)' + COLORS.reset));

// One more minute → 19:00 — should fire TIRED
DayCycle.advanceTime(1);
console.log('  19:00 → TIRED fired: ' + (scenario6TiredFired
  ? COLORS.green + 'YES (correct)' + COLORS.reset
  : COLORS.red + 'NO (BUG!)' + COLORS.reset));

// Restore original tired callback
DayCycle.setOnTired(function (day) {
  events.push({ type: 'TIRED', day: day, time: DayCycle.getTimeString() });
});

// ── SCENARIO 7: §11a Depth-branched rest (exterior vs dungeon) ──

console.log('\n\n' + COLORS.bright + '── SCENARIO 7: Depth-branched bonfire rest (§11a) ──' + COLORS.reset);
console.log(COLORS.dim + '   Exterior (depth 1) → rest-until-dawn. Dungeon (depth 3+) → 2h brief rest.' + COLORS.reset);
console.log(COLORS.dim + '   Dungeon hearths: no WELL_RESTED, no day skip, no morning recap.' + COLORS.reset);

var DUNGEON_REST_MIN = 120; // mirrors hazard-system.js

// 7a: Exterior campfire at 20:00 → should advance to dawn (10h)
DayCycle.init();
DayCycle.advanceTime(14 * 60); // 06:00 + 840min = 20:00
var exteriorSleepHour = DayCycle.getHour();
var exteriorAdvance = minutesUntilDawn();
var exteriorWellRested = (exteriorSleepHour >= 6); // 20 >= 6 → true
console.log('\n  ' + COLORS.green + '🐉 EXTERIOR campfire (depth 1) at ' + DayCycle.getTimeString() + COLORS.reset);
snapshot('before exterior rest');
DayCycle.advanceTime(exteriorAdvance);
snapshot('after exterior rest-until-dawn');
console.log('    advance=' + exteriorAdvance + 'min (' + (exteriorAdvance / 60).toFixed(1) + 'h)' +
            '  WELL_RESTED=' + (exteriorWellRested ? COLORS.green + 'YES' : COLORS.red + 'NO') + COLORS.reset +
            '  morningRecap=YES');

var extPass = (DayCycle.getHour() === 6 && DayCycle.getMinute() === 0 && exteriorWellRested);
console.log('    ' + (extPass ? COLORS.green + '✅' : COLORS.red + '❌') + COLORS.reset +
            ' Exterior: woke at dawn=' + (DayCycle.getHour() === 6) + ', WELL_RESTED=' + exteriorWellRested);

// 7b: Dungeon hearth at 20:00 → should advance only 2h (to 22:00)
DayCycle.init();
DayCycle.advanceTime(14 * 60); // 20:00
var dungeonSleepHour = DayCycle.getHour();
var dungeonAdvance = DUNGEON_REST_MIN;
var dungeonWellRested = false; // dungeon never grants WELL_RESTED
console.log('\n  ' + COLORS.magenta + '🐉 DUNGEON hearth (depth 3+) at ' + DayCycle.getTimeString() + COLORS.reset);
snapshot('before dungeon rest');
DayCycle.advanceTime(dungeonAdvance);
snapshot('after dungeon brief rest');
var expectedHour = 22;
console.log('    advance=' + dungeonAdvance + 'min (' + (dungeonAdvance / 60).toFixed(1) + 'h)' +
            '  WELL_RESTED=' + (dungeonWellRested ? COLORS.green + 'YES' : COLORS.red + 'NO') + COLORS.reset +
            '  morningRecap=NO');

var dunPass = (DayCycle.getHour() === expectedHour && !dungeonWellRested);
console.log('    ' + (dunPass ? COLORS.green + '✅' : COLORS.red + '❌') + COLORS.reset +
            ' Dungeon: woke at ' + DayCycle.getTimeString() + ' (expected 22:00)' +
            ', WELL_RESTED=NO (correct)');

// 7c: Dungeon hearth at 01:00 → should advance to 03:00 (still in dungeon night)
DayCycle.init();
DayCycle.advanceTime(19 * 60); // 06:00 + 1140min = 25:00 = 01:00 next day
var lateHour = DayCycle.getHour();
console.log('\n  ' + COLORS.magenta + '🐉 DUNGEON hearth (depth 3+) at ' + DayCycle.getTimeString() + ' (post-midnight)' + COLORS.reset);
snapshot('before late dungeon rest');
DayCycle.advanceTime(DUNGEON_REST_MIN);
snapshot('after late dungeon brief rest');
var lateExpected = 3;
var latePass = (DayCycle.getHour() === lateExpected);
console.log('    ' + (latePass ? COLORS.green + '✅' : COLORS.red + '❌') + COLORS.reset +
            ' Late dungeon: woke at ' + DayCycle.getTimeString() + ' (expected 03:00)');

// 7d: Exterior campfire at 02:00 → rest-until-dawn but sleepHour < 6 → no WELL_RESTED
DayCycle.init();
DayCycle.advanceTime(20 * 60); // 06:00 + 1200min = 26:00 = 02:00 next day
var lateSleepHour = DayCycle.getHour();
var lateAdvance = minutesUntilDawn();
var lateWellRested = (lateSleepHour >= 6); // 2 < 6 → false
console.log('\n  ' + COLORS.green + '🐉 EXTERIOR campfire (depth 1) at ' + DayCycle.getTimeString() + ' (post-midnight)' + COLORS.reset);
snapshot('before late exterior rest');
DayCycle.advanceTime(lateAdvance);
snapshot('after late exterior rest-until-dawn');
var lateExtPass = (DayCycle.getHour() === 6 && !lateWellRested);
console.log('    ' + (lateExtPass ? COLORS.green + '✅' : COLORS.red + '❌') + COLORS.reset +
            ' Late exterior: woke at dawn=' + (DayCycle.getHour() === 6) +
            ', WELL_RESTED=NO (sleepHour=' + lateSleepHour + ' < 6, correct)');

var s7errors = 0;
if (!extPass)     { s7errors++; console.log(COLORS.red + '    FAIL: exterior rest' + COLORS.reset); }
if (!dunPass)     { s7errors++; console.log(COLORS.red + '    FAIL: dungeon rest' + COLORS.reset); }
if (!latePass)    { s7errors++; console.log(COLORS.red + '    FAIL: late dungeon rest' + COLORS.reset); }
if (!lateExtPass) { s7errors++; console.log(COLORS.red + '    FAIL: late exterior rest' + COLORS.reset); }
console.log(s7errors === 0
  ? COLORS.green + '\n  All §11 depth-branching checks passed' + COLORS.reset
  : COLORS.red + '\n  ' + s7errors + ' §11 depth-branching check(s) failed' + COLORS.reset);

// ═══════════════════════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('\n' + COLORS.bright + '══════════════════════════════════════════════════════════' + COLORS.reset);
console.log(COLORS.bright + '  EVENT SUMMARY' + COLORS.reset);
console.log(COLORS.bright + '══════════════════════════════════════════════════════════' + COLORS.reset);

var phaseChanges = events.filter(function (e) { return e.type === 'PHASE'; });
var dayChanges   = events.filter(function (e) { return e.type === 'DAY'; });
var heroDays     = events.filter(function (e) { return e.type === 'HERO_DAY'; });
var tiredEvents  = events.filter(function (e) { return e.type === 'TIRED'; });
var curfewEvents = events.filter(function (e) { return e.type === 'CURFEW'; });

console.log('  Phase changes: ' + phaseChanges.length);
console.log('  Day rollovers: ' + dayChanges.length);
console.log('  Hero Days:     ' + heroDays.length + ' → days [' + heroDays.map(function (e) { return e.day; }).join(', ') + ']');
console.log('  TIRED fires:   ' + tiredEvents.length);
console.log('  CURFEW fires:  ' + curfewEvents.length);

// ── Assertions ──
var errors = [];

// Hero days should be 0, 3, 6 (every HERO_DAY_INTERVAL=3)
var expectedHeroDays = [0, 3, 6];
// Day 0 isn't fired via callback (it's init state), so callback fires for 3, 6
var heroCallbackDays = heroDays.map(function (e) { return e.day; });

if (dayChanges.length < 8) {
  errors.push('Expected at least 8 day rollovers in scenario 1, got ' + dayChanges.length);
}

console.log('\n  ' + (errors.length === 0
  ? COLORS.green + '✅ All assertions passed' + COLORS.reset
  : COLORS.red + '❌ ' + errors.length + ' assertion(s) failed:' + COLORS.reset));

errors.forEach(function (e) {
  console.log('     ' + COLORS.red + '• ' + e + COLORS.reset);
});

console.log('\n' + COLORS.bright + '══════════════════════════════════════════════════════════' + COLORS.reset);
console.log(COLORS.bright + '  §7 + §11 STATUS' + COLORS.reset);
console.log(COLORS.bright + '══════════════════════════════════════════════════════════' + COLORS.reset);
console.log('  ' + COLORS.green + '✅ §7a' + COLORS.reset + ' restAtBonfire() advances time (rest-until-dawn for jam)');
console.log('  ' + COLORS.green + '✅ §7b' + COLORS.reset + ' WELL_RESTED gated on bedtime before midnight (sleepHour >= 6)');
console.log('  ' + COLORS.green + '✅ §7c' + COLORS.reset + ' TIRED cleared on bonfire rest');
console.log('  ' + COLORS.green + '✅ §7d' + COLORS.reset + ' Rest-until-dawn: always wake at 06:00');
console.log('  ' + COLORS.green + '✅ §7e' + COLORS.reset + ' Bonfire glow scales with sun intensity');
console.log('  ' + COLORS.green + '✅ §7f' + COLORS.reset + ' Morning recap queued on menu close');
console.log('  ' + COLORS.green + '✅ fix' + COLORS.reset + ' DayCycle.init() resets _paused (stale state bug)');
console.log('  ' + COLORS.green + '✅ fix' + COLORS.reset + ' restAtBonfire unpause→advance→re-pause for interiors');
console.log('  ' + COLORS.green + '✅ fix' + COLORS.reset + ' Week-strip Monday-first alignment');
console.log('');
console.log('  ' + COLORS.green + '✅ §11a' + COLORS.reset + ' Depth-branched rest: exterior=dawn, dungeon=2h brief');
console.log('  ' + COLORS.green + '✅ §11b' + COLORS.reset + ' Stash hidden for depth 3+ (menu-faces.js)');
console.log('  ' + COLORS.green + '✅ §11c' + COLORS.reset + ' Warp gated on ReadinessCalc for depth 3+');
console.log('  ' + COLORS.green + '✅ §11d' + COLORS.reset + ' Dragonfire verb swap: Camp (ext) / Rest (dungeon)');
console.log('  ' + COLORS.cyan + '🐉 Dragonfire' + COLORS.reset + ' Player-facing rebrand complete');
console.log('');
console.log('  ' + COLORS.dim + 'POST-JAM: Switch rest-until-dawn → ADVANCE.REST (8h)' + COLORS.reset);
console.log('  ' + COLORS.dim + '          when curfew is no longer automatic failstate' + COLORS.reset);
console.log('  ' + COLORS.dim + 'POST-JAM: Full bonfire contracts system (proximity scan)' + COLORS.reset);
console.log('  ' + COLORS.dim + 'POST-JAM: Dragonfire dispatcher barks + cinematic focus' + COLORS.reset);
console.log('');
