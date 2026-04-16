// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-quest.js — Phase 0b quest authoring stubs
//
//  Commands:
//    add-quest       create or update a quest entry in a floor's
//                    .quest.json sidecar (tools/floor-payloads/<id>.quest.json)
//    place-waypoint  append/update a step's advanceWhen predicate
//                    on an existing quest in the sidecar
//    validate-quest  structural + referential checks on the sidecar
//                    (id uniqueness, walkable targets, i18n keys)
//
//  These are Phase 0b scaffolds — they write to tools/floor-payloads/
//  (NOT floor-data.json), which is then merged in by
//  tools/extract-floors.js on the next run. The commands are sidecar-
//  scoped; they honour --dry-run (S.isDryRun()) and print the JSON
//  they would have written to stdout.
//
//  See tools/floor-payloads/README.md for the .quest.json v1 schema.
//  See docs/QUEST_SYSTEM_ROADMAP.md Phase 0b for scope + acceptance
//  gates. Phase 1 will promote these from stubs to full writers.
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./shared');

var PAYLOAD_DIR = S.path.join(S.paths.TOOLS_DIR, 'floor-payloads');
var QUESTS_JSON_PATH = S.path.join(S.path.resolve(S.paths.TOOLS_DIR, '..'), 'data', 'quests.json');

var VALID_ID_RE       = /^[a-z0-9_.-]+$/;
var VALID_KINDS       = { main:1, faction:1, side:1, tutorial:1 };
var VALID_WAYPOINT_KINDS = { floor:1, item:1, npc:1, flag:1, readiness:1, combat:1 };

// ── Sidecar I/O ────────────────────────────────────────────────
function sidecarPath(floorId) {
  return S.path.join(PAYLOAD_DIR, floorId + '.quest.json');
}

function readSidecar(floorId) {
  var p = sidecarPath(floorId);
  if (!S.fs.existsSync(p)) {
    return { version: 1, floorId: floorId, quests: [] };
  }
  try {
    var parsed = JSON.parse(S.fs.readFileSync(p, 'utf8'));
    if (!parsed.quests) parsed.quests = [];
    if (!parsed.floorId) parsed.floorId = floorId;
    if (!parsed.version) parsed.version = 1;
    return parsed;
  } catch (e) {
    S.fail(2, 'unreadable sidecar ' + p + ': ' + e.message);
  }
}

function writeSidecar(floorId, sidecar) {
  if (!S.fs.existsSync(PAYLOAD_DIR)) S.fs.mkdirSync(PAYLOAD_DIR, { recursive: true });
  var p = sidecarPath(floorId);
  var json = JSON.stringify(sidecar, null, 2) + '\n';
  if (S.isDryRun()) {
    // Dispatcher's --dry-run path suppresses S.saveFloors, but we
    // write to floor-payloads/ — honour the same contract by NOT
    // touching disk and emitting the payload for inspection.
    process.stdout.write(JSON.stringify({
      dryRun: true, action: 'write-sidecar', path: p, would: sidecar
    }, null, 2) + '\n');
    return;
  }
  S.fs.writeFileSync(p, json);
}

// ── Quest id collision check (sidecar + data/quests.json) ──────
function collectKnownIds() {
  var ids = {};
  // data/quests.json
  if (S.fs.existsSync(QUESTS_JSON_PATH)) {
    try {
      var qj = JSON.parse(S.fs.readFileSync(QUESTS_JSON_PATH, 'utf8'));
      var src = qj.quests;
      if (Array.isArray(src)) {
        src.forEach(function (q) { if (q && q.id) ids[q.id] = 'data/quests.json'; });
      } else if (src && typeof src === 'object') {
        Object.keys(src).forEach(function (k) { ids[k] = 'data/quests.json'; });
      }
    } catch (_e) { /* ignored */ }
  }
  // all sidecars
  if (S.fs.existsSync(PAYLOAD_DIR)) {
    S.fs.readdirSync(PAYLOAD_DIR).forEach(function (file) {
      if (!file.endsWith('.quest.json')) return;
      try {
        var p = JSON.parse(S.fs.readFileSync(S.path.join(PAYLOAD_DIR, file), 'utf8'));
        if (p && Array.isArray(p.quests)) {
          p.quests.forEach(function (q) { if (q && q.id) ids[q.id] = file; });
        }
      } catch (_e) { /* ignored */ }
    });
  }
  return ids;
}

// ── Commands ───────────────────────────────────────────────────
module.exports = {

  'add-quest': function (args, raw /*, schema */) {
    if (!args.floor) S.fail(1, 'add-quest needs --floor');
    if (!args.id)    S.fail(1, 'add-quest needs --id');
    if (!args.kind)  S.fail(1, 'add-quest needs --kind (main|faction|side|tutorial)');

    if (!VALID_ID_RE.test(args.id)) S.fail(1, 'bad --id: must match /^[a-z0-9_.-]+$/');
    if (!VALID_KINDS[args.kind])    S.fail(1, 'bad --kind: must be one of main|faction|side|tutorial');

    S.requireFloor(raw, args.floor);

    var sidecar = readSidecar(args.floor);
    var known = collectKnownIds();
    var existingIdx = -1;
    for (var i = 0; i < sidecar.quests.length; i++) {
      if (sidecar.quests[i].id === args.id) { existingIdx = i; break; }
    }
    // Collision with a DIFFERENT file only errors when the id is NOT
    // already present in this sidecar (update case is legal).
    if (existingIdx === -1 && known[args.id] && known[args.id] !== (args.floor + '.quest.json')) {
      S.fail(1, 'quest id "' + args.id + '" already exists in ' + known[args.id]);
    }

    var quest = {
      id:    args.id,
      kind:  args.kind,
      title: args.title || ('quest.' + args.kind + '.' + args.id + '.title'),
      hook:  args.hook  || ('quest.' + args.kind + '.' + args.id + '.hook'),
      summary: args.summary || ('quest.' + args.kind + '.' + args.id + '.summary'),
      giver: {
        npcId:   args.giver || null,
        floorId: args.floor
      },
      prereq:  { flags: {}, minReadiness: null, minReputation: {} },
      steps:   [],
      rewards: { gold: 0, items: [], favor: {}, flags: {} },
      markerColor: args.color || null
    };

    if (existingIdx !== -1) {
      // update: preserve any fields already filled in by hand
      var prev = sidecar.quests[existingIdx];
      Object.keys(quest).forEach(function (k) {
        if (prev[k] !== undefined) quest[k] = prev[k];
      });
      // but always take the new cli-provided kind/title/etc
      quest.kind  = args.kind;
      if (args.title)   quest.title   = args.title;
      if (args.hook)    quest.hook    = args.hook;
      if (args.summary) quest.summary = args.summary;
      if (args.giver)   quest.giver.npcId = args.giver;
      if (args.color)   quest.markerColor = args.color;
      sidecar.quests[existingIdx] = quest;
    } else {
      sidecar.quests.push(quest);
    }

    writeSidecar(args.floor, sidecar);
    process.stdout.write(JSON.stringify({
      action:  existingIdx !== -1 ? 'update-quest' : 'add-quest',
      floor:   args.floor,
      questId: args.id,
      kind:    args.kind,
      sidecar: sidecarPath(args.floor),
      dryRun:  S.isDryRun()
    }, null, 2) + '\n');
  },

  'place-waypoint': function (args, raw /*, schema */) {
    if (!args.floor)  S.fail(1, 'place-waypoint needs --floor');
    if (!args.quest)  S.fail(1, 'place-waypoint needs --quest <id>');
    if (!args.step)   S.fail(1, 'place-waypoint needs --step <id>');
    if (!args.kind)   args.kind = 'floor';
    if (!VALID_WAYPOINT_KINDS[args.kind]) {
      S.fail(1, 'bad --kind: must be one of ' + Object.keys(VALID_WAYPOINT_KINDS).join('|'));
    }

    var f = S.requireFloor(raw, args.floor);
    var sidecar = readSidecar(args.floor);
    var q = null;
    for (var i = 0; i < sidecar.quests.length; i++) {
      if (sidecar.quests[i].id === args.quest) { q = sidecar.quests[i]; break; }
    }
    if (!q) S.fail(1, 'quest "' + args.quest + '" not found in ' + sidecarPath(args.floor) + ' — run add-quest first');

    var predicate = { kind: args.kind };
    if (args.kind === 'floor') {
      if (!args.at) S.fail(1, 'place-waypoint --kind floor needs --at <x,y>');
      var at = S.parseCoord(args.at, '--at');
      if (at.y < 0 || at.y >= f.grid.length || at.x < 0 || at.x >= f.grid[at.y].length) {
        S.fail(1, 'out of bounds: ' + at.x + ',' + at.y);
      }
      predicate.floorId = args.floor;
      predicate.x       = at.x;
      predicate.y       = at.y;
      predicate.radius  = args.radius ? (+args.radius | 0) : 1;
    } else if (args.kind === 'item') {
      if (!args.item) S.fail(1, 'place-waypoint --kind item needs --item <itemId>');
      predicate.itemId = args.item;
    } else if (args.kind === 'npc') {
      if (!args.npc) S.fail(1, 'place-waypoint --kind npc needs --npc <npcId>');
      predicate.npcId = args.npc;
      if (args.branch) predicate.branch = args.branch;
    } else if (args.kind === 'flag') {
      if (!args.flag) S.fail(1, 'place-waypoint --kind flag needs --flag <name>');
      predicate.flag  = args.flag;
      predicate.value = args.value !== undefined ? args.value : true;
    } else if (args.kind === 'readiness') {
      predicate.tier = args.tier || '0.25';
    } else if (args.kind === 'combat') {
      if (!args.enemy) S.fail(1, 'place-waypoint --kind combat needs --enemy <id>');
      predicate.enemyId = args.enemy;
    }

    // Upsert step
    if (!Array.isArray(q.steps)) q.steps = [];
    var stepIdx = -1;
    for (var j = 0; j < q.steps.length; j++) {
      if (q.steps[j].id === args.step) { stepIdx = j; break; }
    }
    var step = stepIdx !== -1 ? q.steps[stepIdx] : {
      id: args.step,
      kind: args.kind,
      label: 'quest.' + q.kind + '.' + q.id + '.' + args.step + '.label'
    };
    step.kind = args.kind;
    step.advanceWhen = predicate;
    if (args.label) step.label = args.label;
    if (stepIdx === -1) q.steps.push(step);
    else q.steps[stepIdx] = step;

    writeSidecar(args.floor, sidecar);
    process.stdout.write(JSON.stringify({
      action:  stepIdx !== -1 ? 'update-waypoint' : 'add-waypoint',
      floor:   args.floor,
      questId: args.quest,
      stepId:  args.step,
      kind:    args.kind,
      advanceWhen: predicate,
      sidecar: sidecarPath(args.floor),
      dryRun:  S.isDryRun()
    }, null, 2) + '\n');
  },

  'validate-quest': function (args, raw, schema) {
    if (!args.floor) S.fail(1, 'validate-quest needs --floor');
    var f = S.requireFloor(raw, args.floor);
    var sidecar = readSidecar(args.floor);

    var errors = [];
    var warnings = [];
    var seenIds = {};

    if (sidecar.floorId !== args.floor) {
      errors.push('sidecar floorId "' + sidecar.floorId + '" does not match filename "' + args.floor + '"');
    }
    if ((sidecar.version | 0) !== 1) {
      warnings.push('unexpected version ' + sidecar.version + ' (current schema is v1)');
    }

    (sidecar.quests || []).forEach(function (q, qi) {
      var where = 'quests[' + qi + '] (' + (q.id || '<no id>') + ')';
      if (!q.id || !VALID_ID_RE.test(q.id)) {
        errors.push(where + ': invalid id (must match /^[a-z0-9_.-]+$/)');
      }
      if (!VALID_KINDS[q.kind]) {
        errors.push(where + ': invalid kind "' + q.kind + '"');
      }
      if (q.id) {
        if (seenIds[q.id]) errors.push(where + ': duplicate id within file');
        seenIds[q.id] = true;
      }
      if (q.title && !/^quest\./.test(q.title)) {
        warnings.push(where + ': title "' + q.title + '" is not an i18n key (should start with "quest.")');
      }

      (q.steps || []).forEach(function (s, si) {
        var swhere = where + ' > steps[' + si + '] (' + (s.id || '<no id>') + ')';
        if (!s.id || !VALID_ID_RE.test(s.id)) {
          errors.push(swhere + ': invalid step id');
        }
        if (!s.advanceWhen) {
          errors.push(swhere + ': missing advanceWhen predicate');
          return;
        }
        if (!VALID_WAYPOINT_KINDS[s.advanceWhen.kind]) {
          errors.push(swhere + ': invalid advanceWhen.kind "' + s.advanceWhen.kind + '"');
        }
        if (s.advanceWhen.kind === 'floor') {
          var aw = s.advanceWhen;
          if (aw.floorId && aw.floorId !== args.floor) {
            warnings.push(swhere + ': floor waypoint targets "' + aw.floorId + '" but sidecar is for "' + args.floor + '"');
          }
          if (typeof aw.x !== 'number' || typeof aw.y !== 'number') {
            errors.push(swhere + ': floor waypoint missing numeric x,y');
          } else if (aw.y < 0 || aw.y >= f.grid.length || aw.x < 0 || aw.x >= f.grid[aw.y].length) {
            errors.push(swhere + ': waypoint (' + aw.x + ',' + aw.y + ') is out of bounds');
          } else {
            var tileId = f.grid[aw.y][aw.x];
            var tileMeta = schema[tileId];
            if (tileMeta && tileMeta.walk === false) {
              warnings.push(swhere + ': waypoint tile (' + tileId + '/' + (tileMeta.name || '?') + ') is not walkable');
            }
          }
        }
      });
    });

    var ok = errors.length === 0;
    process.stdout.write(JSON.stringify({
      action:  'validate-quest',
      floor:   args.floor,
      sidecar: sidecarPath(args.floor),
      ok:      ok,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors:   errors,
      warnings: warnings,
      questCount: (sidecar.quests || []).length
    }, null, 2) + '\n');
    if (!ok) process.exitCode = 2;
  }

};
