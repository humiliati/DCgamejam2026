/**
 * DOC-107 follow-up — verify main.act1.capstone flag-setter quest data.
 *
 * Checks:
 *   G1 quests.json parses cleanly
 *   G2 main.act1.capstone present + shape matches _templates.main
 *   G3 step advanceWhen references `hero_defeated`
 *   G4 rewards.flags declares `act2_unlocked: true` + `act1_complete: true`
 *   G5 i18n keys present in data/strings/en.js
 *   G6 QuestRegistry (fresh mirror) loads the corpus, hasStep + flagReferenced respond correctly
 */
'use strict';
var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var ROOT = path.resolve(__dirname, '../..');
var failed = 0, passed = 0;

function check(group, label, cond) {
  if (cond) { passed++; console.log('  \u2713 ' + group + ' ' + label); }
  else      { failed++; console.log('  \u2717 ' + group + ' ' + label); }
}

// G1 — JSON parse
var questsText = fs.readFileSync(path.join(ROOT, 'data/quests.json'), 'utf8');
var questsJson;
try { questsJson = JSON.parse(questsText); check('G1', 'quests.json parses', true); }
catch (e) { check('G1', 'quests.json parses', false); console.log('    ' + e.message); process.exit(1); }

// G2 — main.act1.capstone present + shape
var cap = questsJson.quests.filter(function (q) { return q.id === 'main.act1.capstone'; })[0];
check('G2', 'main.act1.capstone exists', !!cap);
check('G2', 'kind == main',              cap && cap.kind === 'main');
check('G2', 'act == 1',                  cap && cap.act === 1);
check('G2', 'title uses i18n key',       cap && cap.title === 'quest.main.capstone.title');
check('G2', 'summary uses i18n key',     cap && cap.summary === 'quest.main.capstone.summary');
check('G2', 'has exactly 1 step',        cap && Array.isArray(cap.steps) && cap.steps.length === 1);

// G3 — step predicate
var s = cap && cap.steps && cap.steps[0];
check('G3', 'step has id',               s && s.id === 'step.hero_defeat');
check('G3', 'step.kind == flag',         s && s.kind === 'flag');
check('G3', 'advanceWhen.kind == flag',  s && s.advanceWhen && s.advanceWhen.kind === 'flag');
check('G3', 'advanceWhen.flag == hero_defeated', s && s.advanceWhen.flag === 'hero_defeated');
check('G3', 'advanceWhen.value == true', s && s.advanceWhen.value === true);

// G4 — rewards
var r = cap && cap.rewards;
check('G4', 'rewards.flags.act2_unlocked === true', r && r.flags && r.flags.act2_unlocked === true);
check('G4', 'rewards.flags.act1_complete === true',  r && r.flags && r.flags.act1_complete === true);
check('G4', 'rewards.gold === 0 (pure flag-setter)', r && r.gold === 0);

// G5 — i18n keys
var enText = fs.readFileSync(path.join(ROOT, 'data/strings/en.js'), 'utf8');
check('G5', "i18n 'quest.main.capstone.title' present",        enText.indexOf("'quest.main.capstone.title'")        >= 0);
check('G5', "i18n 'quest.main.capstone.summary' present",      enText.indexOf("'quest.main.capstone.summary'")      >= 0);
check('G5', "i18n 'quest.main.capstone.step.1.label' present", enText.indexOf("'quest.main.capstone.step.1.label'") >= 0);

// G6 — run the fresh QuestRegistry mirror against the real quests.json
var ctx = { console: console, window: {} };
vm.createContext(ctx);

var qTypesSrc = fs.readFileSync(path.join(ROOT, 'tools/_doc116-cache/_fresh-quest-types.js'),    'utf8');
var qRegSrc   = fs.readFileSync(path.join(ROOT, 'tools/_doc116-cache/_fresh-quest-registry.js'), 'utf8');
vm.runInContext(qTypesSrc, ctx);
vm.runInContext(qRegSrc, ctx);

ctx.QuestRegistry.init(questsJson);
check('G6', 'QuestRegistry.init succeeds',              ctx.QuestRegistry.initialized === true);
check('G6', "getQuest('main.act1.capstone') non-null",  !!ctx.QuestRegistry.getQuest('main.act1.capstone'));
check('G6', "hasStep(id, 'step.hero_defeat') true",     ctx.QuestRegistry.hasStep('main.act1.capstone', 'step.hero_defeat') === true);
check('G6', "hasStep(id, 0) true",                      ctx.QuestRegistry.hasStep('main.act1.capstone', 0) === true);
check('G6', "hasStep(id, 1) false (only 1 step)",       ctx.QuestRegistry.hasStep('main.act1.capstone', 1) === false);
check('G6', "flagReferenced('hero_defeated') true",     ctx.QuestRegistry.flagReferenced('hero_defeated') === true);
// flagReferenced scans advanceWhen, NOT rewards — this is the documented semantic.
check('G6', "flagReferenced('act2_unlocked') false (predicate scan, not rewards)",
  ctx.QuestRegistry.flagReferenced('act2_unlocked') === false);

var total = passed + failed;
console.log('');
if (failed === 0) console.log('ALL GREEN   (total ' + passed + '/' + total + ')');
else              console.log('FAILED      (' + failed + '/' + total + ' failing)');
process.exit(failed === 0 ? 0 : 1);
