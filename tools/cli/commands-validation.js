// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-validation.js — Validation commands
//  Pass 0.3 split: validate, report-validation (alias)
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./shared');

// Door-like tile name regex — matches DOOR, DOOR_EXIT, DOOR_BACK, STAIRS_UP, STAIRS_DN, BOSS_DOOR
var DOOR_NAME_RE = /^(DOOR(_EXIT|_BACK|_FACADE)?|STAIRS_(UP|DN)|BOSS_DOOR|LOCKED_DOOR|TRAPDOOR_(UP|DN))$/;

function isDoorLikeTile(sch) {
  if (!sch) return false;
  if (sch.isDoor) return true;
  return DOOR_NAME_RE.test(sch.name || '');
}

function depthOfFloorId(id) {
  if (!id) return 0;
  return String(id).split('.').length;
}

function validateFloor(floorId, floor, schema) {
  var issues = [];
  if (!floor || !floor.grid) return issues;
  var grid = floor.grid;
  var gw = grid[0] ? grid[0].length : 0;
  var gh = grid.length;
  var sp = floor.spawn;
  if (!sp) {
    if (floorId !== '0') issues.push({ severity:'err', kind:'spawn-missing', floorId:floorId, msg:'No spawn defined' });
  } else {
    if (sp.x < 0 || sp.y < 0 || sp.x >= gw || sp.y >= gh) {
      issues.push({ severity:'err', kind:'spawn-oob', floorId:floorId, msg:'Spawn ('+sp.x+','+sp.y+') outside grid '+gw+'x'+gh });
    } else {
      var spTile = grid[sp.y][sp.x];
      var sch = schema[spTile];
      if (sch && sch.walk === false) {
        issues.push({ severity:'err', kind:'spawn-blocked', floorId:floorId, msg:'Spawn on non-walkable tile: ' + (sch.name||spTile), cells:[{x:sp.x,y:sp.y}] });
      }
    }
  }

  // ── C6 rule: every door/stair tile needs a doorTargets entry ──
  var doorTargets = floor.doorTargets || {};
  for (var y = 0; y < gh; y++) {
    var row = grid[y]; if (!row) continue;
    for (var x = 0; x < gw; x++) {
      var ts = schema[row[x]];
      if (!isDoorLikeTile(ts)) continue;
      if (ts.name === 'DOOR_FACADE') continue; // decorative
      var key = x+','+y;
      if (!doorTargets[key]) {
        issues.push({ severity:'warn', kind:'door-no-target', floorId:floorId,
          msg:ts.name+' at ('+x+','+y+') has no doorTargets entry — engine will guess parent/child',
          cells:[{x:x,y:y}] });
      }
    }
  }

  // ── C6 rule: room interiors should not contain wall tiles ──
  var rooms = floor.rooms || [];
  for (var ri = 0; ri < rooms.length; ri++) {
    var rm = rooms[ri];
    var wallCells = [];
    for (var ry = rm.y; ry < rm.y + rm.h && ry < gh; ry++) {
      var rrow = grid[ry]; if (!rrow) continue;
      for (var rx = rm.x; rx < rm.x + rm.w && rx < gw; rx++) {
        var rsch = schema[rrow[rx]];
        if (rsch && rsch.name === 'WALL') wallCells.push({x:rx, y:ry});
      }
    }
    if (wallCells.length) {
      issues.push({ severity:'warn', kind:'room-has-walls', floorId:floorId,
        msg:'Room '+ri+' ('+rm.w+'x'+rm.h+' at '+rm.x+','+rm.y+') contains '+wallCells.length+' WALL tile'+(wallCells.length===1?'':'s'),
        cells:wallCells });
    }
  }

  return issues;
}

function validateCross(rawFloors) {
  var issues = [];
  var ids = Object.keys(rawFloors);
  ids.forEach(function(id) {
    var f = rawFloors[id]; if (!f) return;
    Object.keys(f.doorTargets || {}).forEach(function(k) {
      var tgt = f.doorTargets[k];
      if (!tgt) return;
      if (!rawFloors[tgt]) {
        var parts = k.split(','); var x = +parts[0]|0, y = +parts[1]|0;
        issues.push({ severity:'err', kind:'door-target-missing', floorId:id,
          msg:'Door at ('+x+','+y+') targets missing floor "'+tgt+'"', cells:[{x:x,y:y}] });
      }
    });
  });
  return issues;
}

function runValidate(args, raw, schema) {
  var scope = args.scope || (args.floor ? 'current' : 'all');
  var issues = [];
  if (scope === 'current') {
    if (!args.floor) S.fail(1, 'validate --scope current needs --floor');
    issues = validateFloor(args.floor, raw.floors[args.floor], schema);
  } else {
    Object.keys(raw.floors).forEach(function(id) {
      issues = issues.concat(validateFloor(id, raw.floors[id], schema));
    });
    issues = issues.concat(validateCross(raw.floors));
  }
  var txt = JSON.stringify({ scope: scope, issueCount: issues.length, issues: issues }, null, 2);
  if (args.out) {
    S.fs.writeFileSync(S.path.resolve(process.cwd(), args.out), txt);
    process.stdout.write('[blockout-cli] wrote ' + issues.length + ' issues -> ' + args.out + '\n');
  } else {
    process.stdout.write(txt + '\n');
  }
  if (issues.some(function(i) { return i.severity === 'err'; })) process.exit(2);
}

module.exports = {
  'validate': runValidate,
  'report-validation': runValidate,
  _validateFloor: validateFloor,
  _validateCross: validateCross
};
