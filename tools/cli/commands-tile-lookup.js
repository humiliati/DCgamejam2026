// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-tile-lookup.js — Tile schema lookup
//  Pass 0.3 split: tile, tile-name, tile-schema, find-tiles
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./shared');

module.exports = {
  'tile': function(args, raw, schema) {
    var ref = args.name != null ? args.name : args.ref;
    if (ref == null) S.fail(1, 'tile needs --name <NAME> or --ref <id|name>');
    var id = S.resolveTile(ref, schema);
    if (id == null || !schema[id]) S.fail(2, 'unknown tile: ' + ref);
    process.stdout.write(String(id) + '\n');
  },

  'tile-name': function(args, raw, schema) {
    var id;
    if (args.id != null) id = parseInt(args.id, 10);
    else if (args.ref != null) id = S.resolveTile(args.ref, schema);
    else S.fail(1, 'tile-name needs --id <n> or --ref <name|id>');
    var s = schema[id];
    if (!s) S.fail(2, 'unknown tile id: ' + id);
    process.stdout.write((s.name || ('TILE_' + id)) + '\n');
  },

  'tile-schema': function(args, raw, schema) {
    if (args.ref != null || args.name != null || args.id != null) {
      var id;
      if (args.id != null) id = parseInt(args.id, 10);
      else id = S.resolveTile(args.ref != null ? args.ref : args.name, schema);
      var s = schema[id];
      if (!s) S.fail(2, 'unknown tile: ' + (args.ref||args.name||args.id));
      process.stdout.write(JSON.stringify(Object.assign({ id: id }, s), null, 2) + '\n');
    } else {
      var all = [];
      Object.keys(schema).forEach(function(id) {
        all.push(Object.assign({ id: +id }, schema[id]));
      });
      all.sort(function(a,b){ return a.id - b.id; });
      process.stdout.write(JSON.stringify(all, null, 2) + '\n');
    }
  },

  'find-tiles': function(args, raw, schema) {
    var nameQ = args.name != null ? String(args.name) : null;
    var nameRe = null;
    if (nameQ) {
      var m = nameQ.match(/^\/(.+)\/([imsu]*)$/);
      if (m) {
        try { nameRe = new RegExp(m[1], m[2] || 'i'); }
        catch (e) { S.fail(1, 'bad --name regex: ' + nameQ); }
      }
    }
    var cat = args.category != null ? String(args.category) : (args.cat != null ? String(args.cat) : null);
    var glyph = args.glyph != null ? String(args.glyph) : null;
    var flagKeys = ['walk','opq','opaque','hazard','isDoor','isFreeform','isFloating','isCrenellated','isFloatingMoss','isFloatingLid','isFloatingBackFace','isWindow','isTorch'];
    function parseFlag(v) {
      if (v === true || v === 'true' || v === '1') return true;
      if (v === 'false' || v === '0') return false;
      return null;
    }
    var flags = {};
    flagKeys.forEach(function(k) {
      if (args[k] != null) {
        var src = (k === 'opaque') ? 'opq' : k;
        var pv = parseFlag(args[k]);
        if (pv === null) S.fail(1, 'bad --' + k + ' (expected true|false): ' + args[k]);
        flags[src] = pv;
      }
    });
    var out = [];
    Object.keys(schema).forEach(function(id) {
      var s = schema[id]; if (!s) return;
      var name = s.name || '';
      if (nameRe) { if (!nameRe.test(name)) return; }
      else if (nameQ) { if (String(name).toUpperCase().indexOf(nameQ.toUpperCase()) < 0) return; }
      if (cat != null) {
        var sc = s.category || s.cat;
        if (String(sc) !== cat) return;
      }
      for (var k in flags) { if (!!s[k] !== flags[k]) return; }
      if (glyph != null && s.glyph !== glyph) return;
      out.push({
        id: +id,
        name: s.name || null,
        category: s.category || s.cat || null,
        glyph: s.glyph || null,
        walk: s.walk === true, opaque: s.opq === true, hazard: s.hazard === true,
        isDoor: s.isDoor === true, isFreeform: s.isFreeform === true,
        isFloating: s.isFloating === true, isWindow: s.isWindow === true,
        isTorch: s.isTorch === true, color: s.color || null
      });
    });
    out.sort(function(a,b){ return a.id - b.id; });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  }
};
