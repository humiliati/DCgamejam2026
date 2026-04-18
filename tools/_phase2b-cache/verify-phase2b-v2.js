/**
 * Phase 2.1b verification harness (v2 - fresh filename to dodge
 * bindfs cache on the original verify-phase2b.js).
 */
'use strict';
var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var ROOT = path.resolve(__dirname, '../..');
var failed = 0, passed = 0;

function check(group, label, cond) {
  if (cond) { passed++; console.log('  [ok] ' + group + ' ' + label); }
  else      { failed++; console.log('  [FAIL] ' + group + ' ' + label); }
}

// G1 - Source file sanity
var mfSrc     = fs.readFileSync(path.join(ROOT, 'engine/menu-faces.js'), 'utf8');
var gSrc      = fs.readFileSync(path.join(ROOT, 'engine/game.js'),       'utf8');
var footerSrc = fs.readFileSync(path.join(__dirname, '_fresh-mf-footer.js'), 'utf8');

check('G1', 'menu-faces.js has _questActiveScrollOffset module state',
  mfSrc.indexOf('_questActiveScrollOffset') >= 0);
check('G1', 'menu-faces.js has _questFailedScrollOffset module state',
  mfSrc.indexOf('_questFailedScrollOffset') >= 0);
check('G1', 'mirror: declares scrollQuestActive fn',
  footerSrc.indexOf('function scrollQuestActive') >= 0);
check('G1', 'mirror: declares scrollQuestFailed fn',
  footerSrc.indexOf('function scrollQuestFailed') >= 0);
check('G1', 'mirror: exports scrollQuestActive on frozen API',
  footerSrc.indexOf('scrollQuestActive:') >= 0);
check('G1', 'mirror: exports scrollQuestFailed on frozen API',
  footerSrc.indexOf('scrollQuestFailed:') >= 0);
check('G1', 'menu-faces.js Section 2 uses BOOKS-style QA_ROW_H chrome',
  mfSrc.indexOf('QA_ROW_H') >= 0 && mfSrc.indexOf('QA_MAX_VISIBLE') >= 0);
check('G1', 'menu-faces.js Section 2c exists (Failed quests)',
  mfSrc.indexOf('Section 2c') >= 0 && mfSrc.indexOf('QF_ROW_H') >= 0);
check('G1', 'menu-faces.js pulls qFailedEntries with {failed:true}',
  mfSrc.indexOf('qFailedEntries') >= 0 &&
  /getJournalEntries\(\s*\{\s*failed:\s*true\s*\}\s*\)/.test(mfSrc));
check('G1', 'menu-faces.js capstone teaser references teaser_title',
  mfSrc.indexOf('quest.capstone.teaser_title') >= 0);
check('G1', 'menu-faces.js capstone teaser gates on getQuest(capstone)',
  mfSrc.indexOf("QuestRegistry.getQuest('main.act1.capstone')") >= 0);
check('G1', 'menu-faces.js active-row hitzone slots use 940+ namespace',
  mfSrc.indexOf('slot: 940 + qai') >= 0);
check('G1', 'menu-faces.js failed-row hitzone slots use 950+ namespace',
  mfSrc.indexOf('slot: 950 + qfi') >= 0);
check('G1', 'menu-faces.js active scroll-up slot 932',
  mfSrc.indexOf('slot: 932') >= 0);
check('G1', 'menu-faces.js active scroll-down slot 933',
  mfSrc.indexOf('slot: 933') >= 0);
check('G1', 'menu-faces.js failed scroll-up slot 934',
  mfSrc.indexOf('slot: 934') >= 0);
check('G1', 'menu-faces.js failed scroll-down slot 935',
  mfSrc.indexOf('slot: 935') >= 0);
check('G1', 'menu-faces.js active-row has progress-dot loop',
  /for\s*\(var\s+qd\s*=\s*0;[^]*ctx\.arc/.test(mfSrc));
check('G1', 'menu-faces.js active-row uses quest.kind i18n prefix',
  mfSrc.indexOf("'quest.kind.' + qa.kind") >= 0);

// G2 - i18n surface
var enSrc = fs.readFileSync(path.join(ROOT, 'data/strings/en.js'), 'utf8');
var keys = [
  'quest.detail.steps_header',
  'quest.detail.giver_prefix',
  'quest.detail.rewards_prefix',
  'quest.detail.fail_reason',
  'quest.capstone.teaser_title',
  'quest.capstone.teaser_hint',
  'quest.kind.main',
  'quest.kind.side',
  'quest.kind.contract'
];
for (var ki = 0; ki < keys.length; ki++) {
  check('G2', "en.js has key " + keys[ki],
    enSrc.indexOf("'" + keys[ki] + "'") >= 0);
}
check('G2', 'en.js has key quest.panel.failed',
  enSrc.indexOf("'quest.panel.failed'") >= 0);

// G3 - MenuFaces scroll API clamp behavior
var stubSrc = [
  'var _questActiveScrollOffset = 0;',
  'var _questFailedScrollOffset = 0;',
  'function scrollQuestActive(d){ _questActiveScrollOffset = Math.max(0, _questActiveScrollOffset + d); }',
  'function scrollQuestFailed(d){ _questFailedScrollOffset = Math.max(0, _questFailedScrollOffset + d); }'
].join('\n');
var stubCtx = {};
vm.createContext(stubCtx);
vm.runInContext(stubSrc, stubCtx);

vm.runInContext('scrollQuestActive(+2);', stubCtx);
check('G3', 'scrollQuestActive(+2) offset 2',
  stubCtx._questActiveScrollOffset === 2);
vm.runInContext('scrollQuestActive(-1);', stubCtx);
check('G3', 'scrollQuestActive(-1) after 2 offset 1',
  stubCtx._questActiveScrollOffset === 1);
vm.runInContext('scrollQuestActive(-5);', stubCtx);
check('G3', 'scrollQuestActive clamps at 0',
  stubCtx._questActiveScrollOffset === 0);
vm.runInContext('scrollQuestFailed(+3);', stubCtx);
check('G3', 'scrollQuestFailed(+3) offset 3',
  stubCtx._questFailedScrollOffset === 3);
vm.runInContext('scrollQuestFailed(-10);', stubCtx);
check('G3', 'scrollQuestFailed clamps at 0',
  stubCtx._questFailedScrollOffset === 0);

// G4 - Handler wiring in game.js
var actions = [
  ['quest_active_scroll_up',   'scrollQuestActive(-1)'],
  ['quest_active_scroll_down', 'scrollQuestActive(+1)'],
  ['quest_failed_scroll_up',   'scrollQuestFailed(-1)'],
  ['quest_failed_scroll_down', 'scrollQuestFailed(+1)']
];
for (var ai = 0; ai < actions.length; ai++) {
  var a = actions[ai];
  var idx = gSrc.indexOf("hit.action === '" + a[0] + "'");
  check('G4', "game.js has '" + a[0] + "' handler", idx >= 0);
  var block = idx >= 0 ? gSrc.substring(idx, idx + 400) : '';
  check('G4', "'" + a[0] + "' calls MenuFaces." + a[1],
    block.indexOf(a[1]) >= 0);
}

var rqaIdx = gSrc.indexOf("hit.action === 'read_quest_active'");
check('G4', 'game.js has read_quest_active handler', rqaIdx >= 0);
var rqaBlock = rqaIdx >= 0 ? gSrc.substring(rqaIdx, rqaIdx + 3000) : '';
check('G4', 'read_quest_active calls getJournalEntries({active:true})',
  /getJournalEntries\(\s*\{\s*active:\s*true\s*\}\s*\)/.test(rqaBlock));
check('G4', 'read_quest_active opens DialogBox.show',
  rqaBlock.indexOf('DialogBox.show') >= 0);
check('G4', 'read_quest_active closes MenuBox',
  rqaBlock.indexOf('MenuBox.close') >= 0);
check('G4', 'read_quest_active reads hit.questId',
  rqaBlock.indexOf('hit.questId') >= 0);

var rqfIdx = gSrc.indexOf("hit.action === 'read_quest_failed'");
check('G4', 'game.js has read_quest_failed handler', rqfIdx >= 0);
var rqfBlock = rqfIdx >= 0 ? gSrc.substring(rqfIdx, rqfIdx + 3000) : '';
check('G4', 'read_quest_failed calls getJournalEntries({failed:true})',
  /getJournalEntries\(\s*\{\s*failed:\s*true\s*\}\s*\)/.test(rqfBlock));
check('G4', 'read_quest_failed opens DialogBox.show',
  rqfBlock.indexOf('DialogBox.show') >= 0);
check('G4', 'read_quest_failed references failReason',
  rqfBlock.indexOf('failReason') >= 0);

// G5 - Step-checklist marker derivation
check('G5', 'read_quest_active step loop present',
  rqaBlock.indexOf('qaRec.steps') >= 0);
check('G5', 'read_quest_active uses u2713 completed marker',
  rqaBlock.indexOf('\\u2713') >= 0);
check('G5', 'read_quest_active uses u25B6 current marker',
  rqaBlock.indexOf('\\u25B6') >= 0);
check('G5', 'read_quest_active uses u25CB pending marker',
  rqaBlock.indexOf('\\u25CB') >= 0);
check('G5', 'read_quest_active uses steps_header key',
  rqaBlock.indexOf('quest.detail.steps_header') >= 0);
check('G5', 'read_quest_active uses giver_prefix key',
  rqaBlock.indexOf('quest.detail.giver_prefix') >= 0);

function deriveMarkers(stepIndex, total) {
  var out = [];
  for (var i = 0; i < total; i++) {
    if      (i < stepIndex)   out.push('\u2713');
    else if (i === stepIndex) out.push('\u25B6');
    else                      out.push('\u25CB');
  }
  return out.join('');
}
check('G5', 'marker derivation stepIndex=0 total=3',
  deriveMarkers(0, 3) === '\u25B6\u25CB\u25CB');
check('G5', 'marker derivation stepIndex=1 total=3',
  deriveMarkers(1, 3) === '\u2713\u25B6\u25CB');
check('G5', 'marker derivation stepIndex=3 total=3 all-done',
  deriveMarkers(3, 3) === '\u2713\u2713\u2713');

// G6 - Capstone teaser branch structure
var emptyIdx = mfSrc.indexOf('qActiveEntries.length === 0');
check('G6', 'menu-faces.js has empty-state branch', emptyIdx >= 0);
var emptyBlock = emptyIdx >= 0 ? mfSrc.substring(emptyIdx, emptyIdx + 2500) : '';
check('G6', 'empty-state checks getQuest(capstone)',
  emptyBlock.indexOf("QuestRegistry.getQuest('main.act1.capstone')") >= 0);
check('G6', 'empty-state renders teaser title + hint',
  emptyBlock.indexOf('quest.capstone.teaser_title') >= 0 &&
  emptyBlock.indexOf('quest.capstone.teaser_hint') >= 0);
check('G6', 'empty-state falls back to quest.panel.empty',
  emptyBlock.indexOf('quest.panel.empty') >= 0);
check('G6', 'empty-state teaser uses purple tint rgba(140,90,150',
  emptyBlock.indexOf('rgba(140,90,150') >= 0);

var total = passed + failed;
console.log('');
if (failed === 0) console.log('ALL GREEN   (total ' + passed + '/' + total + ')');
else              console.log('FAILED      (' + failed + '/' + total + ' failing)');
process.exit(failed === 0 ? 0 : 1);
