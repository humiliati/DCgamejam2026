// DOC-107 Phase 4 — UIPrefs API harness (v2)
// Loads tools/phase4-quest-chain-copy.js (fresh copy, bindfs-cache-safe)
// and exercises the UIPrefs API.
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

// Stub localStorage
var _ls = {};
var localStorageStub = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null; },
  setItem: function (k, v) { _ls[k] = String(v); },
  removeItem: function (k) { delete _ls[k]; },
  clear: function () { _ls = {}; }
};

// Stub QuestRegistry
var QuestRegistryStub = {
  getQuest: function (id) {
    if (id === 'main_q1') return { id: 'main_q1', kind: 'main' };
    if (id === 'side_q1') return { id: 'side_q1', kind: 'side' };
    return null;
  }
};

// Stub QuestTypes
var QuestTypesStub = {
  STATE: { LOCKED: 'LOCKED', ACTIVE: 'ACTIVE', COMPLETED: 'COMPLETED', FAILED: 'FAILED', EXPIRED: 'EXPIRED' },
  isValidId: function (id) { return typeof id === 'string' && id.length > 0; }
};

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

var qcPath = path.join(__dirname, 'phase4-quest-chain-copy.js');
var qcSrc = fs.readFileSync(qcPath, 'utf8');
console.log('[harness] quest-chain copy bytes:', qcSrc.length);

try {
  vm.runInContext(qcSrc, sandbox, { filename: 'phase4-quest-chain-copy.js' });
} catch (e) {
  console.error('[harness] FAILED to parse:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}

var QC = sandbox.QuestChain;
if (!QC) {
  console.error('[harness] QuestChain global not exposed');
  process.exit(1);
}

function assertEq(actual, expected, msg) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) throw new Error('[' + msg + '] expected ' + e + ' got ' + a);
  console.log('  OK', msg, '=', a);
}

console.log('\n[T1] Default prefs');
var p1 = QC.getUIPrefs();
assertEq(p1.markers, true, 'markers default');
assertEq(p1.hintVerbosity, 'subtle', 'hintVerbosity default');
assertEq(p1.waypointFlair, 'pulsing', 'waypointFlair default');
assertEq(p1.sidequestOptIn, 'all', 'sidequestOptIn default');

console.log('\n[T2] SUBTLE_IDLE_MS');
assertEq(QC.SUBTLE_IDLE_MS, 90000, 'SUBTLE_IDLE_MS');

console.log('\n[T3] setUIPrefs clamps invalid');
QC.setUIPrefs({ hintVerbosity: 'NOPE', waypointFlair: 'glitter' });
var p3 = QC.getUIPrefs();
assertEq(p3.hintVerbosity, 'subtle', 'invalid hintVerbosity clamped');
assertEq(p3.waypointFlair, 'pulsing', 'invalid waypointFlair clamped');

console.log('\n[T4] setUIPrefs accepts valid');
QC.setUIPrefs({ markers: false, hintVerbosity: 'off', waypointFlair: 'simple', sidequestOptIn: 'main-only' });
var p4 = QC.getUIPrefs();
assertEq(p4.markers, false, 'markers');
assertEq(p4.hintVerbosity, 'off', 'hintVerbosity');
assertEq(p4.waypointFlair, 'simple', 'waypointFlair');
assertEq(p4.sidequestOptIn, 'main-only', 'sidequestOptIn');

console.log('\n[T5] Persistence blob');
var rawBlob = localStorageStub.getItem('gleaner_settings_v1');
if (!rawBlob) throw new Error('T5: localStorage empty');
var parsedBlob = JSON.parse(rawBlob);
assertEq(parsedBlob.quest.markers, false, 'persisted markers');
assertEq(parsedBlob.quest.hintVerbosity, 'off', 'persisted hintVerbosity');
assertEq(parsedBlob.quest.waypointFlair, 'simple', 'persisted waypointFlair');
assertEq(parsedBlob.quest.sidequestOptIn, 'main-only', 'persisted sidequestOptIn');

console.log('\n[T6] loadUIPrefs');
QC.setUIPrefs({ markers: true, hintVerbosity: 'explicit', waypointFlair: 'trail', sidequestOptIn: 'all' });
var raw2 = JSON.parse(localStorageStub.getItem('gleaner_settings_v1'));
QC.setUIPrefs({ markers: false });
localStorageStub.setItem('gleaner_settings_v1', JSON.stringify(raw2));
QC.loadUIPrefs();
var p6 = QC.getUIPrefs();
assertEq(p6.markers, true, 'restored markers');
assertEq(p6.hintVerbosity, 'explicit', 'restored hintVerbosity');
assertEq(p6.waypointFlair, 'trail', 'restored waypointFlair');
assertEq(p6.sidequestOptIn, 'all', 'restored sidequestOptIn');

console.log('\n[T7] prefs-change event');
var changeCount = 0;
var lastPrefs = null;
QC.on('prefs-change', function (prefs) {
  changeCount++;
  lastPrefs = prefs;
});
QC.setUIPrefs({ hintVerbosity: 'subtle' });
assertEq(changeCount, 1, 'listener fired once');
assertEq(lastPrefs.hintVerbosity, 'subtle', 'listener prefs');
QC.setUIPrefs({ hintVerbosity: 'subtle' });
assertEq(changeCount, 1, 'no-op does not re-fire');

console.log('\n[T8] loadUIPrefs missing blob');
localStorageStub.clear();
QC.loadUIPrefs();
console.log('  OK no throw on empty');

console.log('\n[T9] loadUIPrefs malformed');
localStorageStub.setItem('gleaner_settings_v1', '{not json');
QC.loadUIPrefs();
console.log('  OK no throw on malformed');

console.log('\n[T10] markers/verbosity off returns null');
QC.init({});
QC.setUIPrefs({ markers: false });
assertEq(QC.getCurrentMarker('1'), null, 'markers=false null');
QC.setUIPrefs({ markers: true, hintVerbosity: 'off' });
assertEq(QC.getCurrentMarker('1'), null, 'hintVerbosity=off null');

console.log('\nALL PHASE 4 UIPREFS TESTS PASSED');
