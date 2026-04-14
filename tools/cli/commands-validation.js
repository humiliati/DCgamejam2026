// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-validation.js — Validation commands
//  Pass 0.3 split: validate, report-validation (alias)
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./shared');

function validateFloor(floorId, floor, schema) {
  var issues = [];
  if (!floor || !floor.grid) return issues;
  var gw = floor.grid[0] ? floor.grid[0].length : 0;
  var gh = floor.grid.length;
  var sp = floor.spawn;
  if (!sp) {
    if (floorId !== '0') issues.push({ severity:'err', kind:'spawn-missing', floorId:floorId, msg:'No spawn defined' });
  } else {
    if (sp.x < 0 || sp.y < 0 || sp.x >= gw || sp.y >= gh) {
      issues.push({ severity:'err', kind:'spawn-oob', floorId:floorId, msg:'Spawn ('+sp.x+','+sp.y+') outside grid '+gw+'x'+gh });
    } else {
      var spTile = floor.grid[sp.y][sp.x];
      var sch = schema[spTile];
      if (sch && sch.walk === false) {
        issues.push({ severity:'err', kind:'spawn-blocked', floorId:floorId, msg:'Spawn on non-walkable tile: ' + (sch.name||spTile), cells:[{x:sp.x,y:sp.y}] });
      }
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
