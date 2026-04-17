// DOC-107 Phase 4 — UIPrefs API harness
// Loads engine/quest-chain.js in a minimal stub environment and exercises
// getUIPrefs / setUIPrefs / loadUIPrefs / _persistUIPrefs round-tripping.
//
// Run from the project root:
//   node tools/phase4-uiprefs-harness.js
//
// Expects exit code 0 on pass. Any assertion failure throws.

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

// ── Stub localStorage ───────────────────────────────────────────────
var _ls = {};
var localStorageStub = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null; },
  setItem: function (k, v) { _ls[k] = String(v); },
  removeItem: function (k) { delete _ls[k]; },
  clear: function () { _ls = {}; }
};

// ── Stub QuestRegistry for side-quest filter test ───────────────────
var QuestRegistryStub = {
  getQuest: function (id) {
    if (id === 'main_q1') return { id: 'main_q1', kind: 'main' };
    if (id === 'side_q1') return { id: 'side_q1', kind: 'side' };
    return null;
  }
};

// ── Stub QuestTypes (frozen enum mirror from engine/quest-types.js) ──
var QuestTypesStub = {
  STATE: { LOCKED: 'LOCKED', ACTIVE: 'ACTIVE', COMPLETED: 'COMPLETED', FAILED: 'FAILED', EXPIRED: 'EXPIRED' },
  isValidId: function (id) { return typeof id === 'string' && id.length > 0; }
};

// ── Build sandbox ───────────────────────────────────────────────────
var sandbox = {
  console: console,
  localStorage: localStorageStub,
  QuestRegistry: QuestRegistryStub,
  QuestTypes: QuestTypesStub,
  Date: Date,
  Object: Object,
  Array: Array,
  String: String,
  Math: Math,
  JSON: JSON
};
vm.createContext(sandbox);

// ── Load quest-chain.js (via fresh tools/ copy — bindfs-cache-safe) ──
var qcPath = path.join(__dirname, 'phase4-quest-chain-copy.js');
var qcSrc = fs.readFileSync(qcPath, 'utf8');
console.log('[harness] quest-chain.js source bytes:', qcSrc.length);

try {
  vm.runInContext(qcSrc, sandbox, { filename: 'quest-chain.js' });
} catch (e) {
  console.error('[harness] FAILED to parse quest-chain.js:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}

var QC = sandbox.QuestChain;
if (!QC) {
  console.error('[harness] QuestChain global not exposed on sandbox');
  process.exit(1);
}

// ── Assertions ──────────────────────────────────────────────────────
function assertEq(actual, expected, msg) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error('[' + msg + '] expected ' + e + ' got ' + a);
  }
  console.log('  OK', msg, '=', a);
}

console.log('\n[T1] Default prefs match documented defaults');
var p1 = QC.getUIPrefs();
assertEq(p1.markers, true, 'markers default');
assertEq(p1.hintVerbosity, 'subtle', 'hintVerbosity default');
assertEq(p1.waypointFlair, 'pulsing', 'waypointFlair default');
assertEq(p1.sidequestOptIn, 'all', 'sidequestOptIn default');

console.log('\n[T2] SUBTLE_IDLE_MS exported and is 90s');
assertEq(QC.SUBTLE_IDLE_MS, 90000, 'SUBTLE_IDLE_MS');

console.log('\n[T3] setUIPrefs clamps invalid values to defaults');
QC.setUIPrefs({ hintVerbosity: 'NOPE', waypointFlair: 'glitter' });
var p3 = QC.getUIPrefs();
assertEq(p3.hintVerbosity, 'subtle', 'invalid hintVerbosity → default');
assertEq(p3.waypointFlair, 'pulsing', 'invalid waypointFlair → default');

console.log('\n[T4] setUIPrefs accepts valid values and persists');
QC.setUIPrefs({ markers: false, hintVerbosity: 'off', waypointFlair: 'simple', sidequestOptIn: 'main-only' });
var p4 = QC.getUIPrefs();
assertEq(p4.markers, false, 'markers set false');
assertEq(p4.hintVerbosity, 'off', 'hintVerbosity set off');
assertEq(p4.waypointFlair, 'simple', 'waypointFlair set simple');
assertEq(p4.sidequestOptIn, 'main-only', 'sidequestOptIn set main-only');

console.log('\n[T5] Persistence blob written to localStorage');
var rawBlob = localStorageStub.getItem('gleaner_settings_v1');
if (!rawBlob) { throw new Error('[T5] localStorage empty after setUIPrefs'); }
var parsedBlob = JSON.parse(rawBlob);
assertEq(parsedBlob.quest.markers, false, 'persisted markers');
assertEq(parsedBlob.quest.hintVerbosity, 'off', 'persisted hintVerbosity');
assertEq(parsedBlob.quest.waypointFlair, 'simple', 'persisted waypointFlair');
assertEq(parsedBlob.quest.sidequestOptIn, 'main-only', 'persisted sidequestOptIn');

console.log('\n[T6] loadUIPrefs pulls from localStorage');
QC.setUIPrefs({ markers: true, hintVerbosity: 'explicit', waypointFlair: 'trail', sidequestOptIn: 'all' });
var raw2 = JSON.parse(localStorageStub.getItem('gleaner_settings_v1'));
// Now clobber and reload
QC.setUIPrefs({ markers: false });  // make in-mem differ from storage
localStorageStub.setItem('gleaner_settings_v1', JSON.stringify(raw2));
QC.loadUIPrefs();
var p6 = QC.getUIPrefs();
assertEq(p6.markers, true, 'loadUIPrefs restored markers');
assertEq(p6.hintVerbosity, 'explicit', 'loadUIPrefs restored hintVerbosity');
assertEq(p6.waypointFlair, 'trail', 'loadUIPrefs restored waypointFlair');
assertEq(p6.sidequestOptIn, 'all', 'loadUIPrefs restored sidequestOptIn');

console.log('\n[T7] prefs-change event fires on mutation');
var changeCount = 0;
var lastPrefs = null;
QC.on('prefs-change', function (prefs) {
  changeCount++;
  lastPrefs = prefs;
});
QC.setUIPrefs({ hintVerbosity: 'subtle' });
assertEq(changeCount, 1, 'listener fired once');
assertEq(lastPrefs.hintVerbosity, 'subtle', 'listener received new prefs');
// No-op set should NOT fire
QC.setUIPrefs({ hintVerbosity: 'subtle' });
assertEq(changeCount, 1, 'no-op set does not re-fire');

console.log('\n[T8] loadUIPrefs handles missing blob gracefully');
localStorageStub.clear();
QC.loadUIPrefs();
// No exception = pass
console.log('  OK no-throw on empty localStorage');

console.log('\n[T9] loadUIPrefs handles malformed JSON gracefully');
localStorageStub.setItem('gleaner_settings_v1', '{not json');
QC.loadUIPrefs();
console.log('  OK no-throw on malformed JSON');

console.log('\n[T10] Markers/verbosity off → getCurrentMarker returns null');
QC.init({});
QC.setUIPrefs({ markers: false });
var m10a = QC.getCurrentMarker('1');
assertEq(m10a, null, 'markers=false → null');
QC.setUIPrefs({ markers: true, hintVerbosity: 'off' });
var m10b = QC.getCurrentMarker('1');
assertEq(m10b, null, 'hintVerbosity=off → null');

console.log('\n✅ ALL PHASE 4 UIPREFS TESTS PASSED');
