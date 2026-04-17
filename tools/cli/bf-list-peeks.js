// ═══════════════════════════════════════════════════════════════
//  tools/cli/bf-list-peeks.js — `bf list-peeks`
//  Phase 2 of BOXFORGE_AGENT_ROADMAP §4.2
//
//  Scan engine/*-peek.js, report:
//    - variant   (filename minus -peek.js)
//    - lines     (raw line count — cheap health signal)
//    - provenance (does the module reference window.BoxForge /
//                  boxforge.html header comment?)
//    - sidecar    (is there a matching tools/templates/peeks/<slug>.boxforge.json?)
//
//  Flags:
//    --json        emit as JSON
//    --orphans     only print peek modules with NO matching .boxforge.json
//
//  Read-only. Does not require BoxForge sandbox extraction.
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./bf-shared');

var BOXFORGE_MARKERS = ['window.BoxForge', 'BoxForge', 'boxforge.html', 'BOXFORGE_AGENT_ROADMAP'];

function _detectProvenance(src) {
  var head = src.slice(0, 4096);
  var hits = [];
  BOXFORGE_MARKERS.forEach(function(m) {
    if (head.indexOf(m) >= 0) hits.push(m);
  });
  return hits.length ? hits : null;
}

function _candidateSidecars(baseSlug, sidecarSlugs) {
  return sidecarSlugs.filter(function(s) {
    return s === baseSlug || s.indexOf(baseSlug + '-') === 0 || s.indexOf(baseSlug) === 0;
  });
}

function run(args) {
  var files = S.listEnginePeeks();
  var peekEntries = S.loadAllPeeks();
  var sidecarSlugs = peekEntries.map(function(e) { return e.variant; });
  var onlyOrphans = !!args.orphans;

  var rows = files.map(function(f) {
    var full = S.path.join(S.paths.ENGINE_DIR, f);
    var src = '';
    try { src = S.fs.readFileSync(full, 'utf8'); } catch (e) { src = ''; }
    var lines = src ? src.split(/\r?\n/).length : 0;
    var provenance = _detectProvenance(src);
    var baseSlug = f.replace(/-peek\.js$/, '');
    var sidecars = _candidateSidecars(baseSlug, sidecarSlugs);
    return {
      file: f,
      path: S.path.relative(process.cwd(), full),
      variant: baseSlug,
      lines: lines,
      provenance: provenance,
      hasSidecar: sidecars.length > 0,
      sidecars: sidecars
    };
  });

  var filtered = onlyOrphans ? rows.filter(function(r) { return !r.hasSidecar; }) : rows;

  if (args.json) {
    S.writeJson({
      ok: true,
      action: 'list-peeks',
      enginePath: S.path.relative(process.cwd(), S.paths.ENGINE_DIR),
      onlyOrphans: onlyOrphans,
      count: filtered.length,
      totalScanned: rows.length,
      peeks: filtered
    });
    return;
  }

  if (!rows.length) {
    process.stdout.write('(no *-peek.js files in ' + S.path.relative(process.cwd(), S.paths.ENGINE_DIR) + ')\n');
    return;
  }
  if (!filtered.length) {
    process.stdout.write('(no matches - ' + rows.length + ' peek module(s) scanned, all have sidecars)\n');
    return;
  }

  var wVar = 7, wLn = 5, wSide = 10, wProv = 10;
  filtered.forEach(function(r) {
    if (r.variant.length > wVar) wVar = r.variant.length;
    if (String(r.lines).length > wLn) wLn = String(r.lines).length;
    var sideStr = r.hasSidecar ? r.sidecars.join(',') : '(orphan)';
    if (sideStr.length > wSide) wSide = sideStr.length;
    var provStr = r.provenance ? r.provenance.join(',') : '-';
    if (provStr.length > wProv) wProv = provStr.length;
  });

  function pad(s, w) { s = String(s == null ? '' : s); while (s.length < w) s += ' '; return s; }
  function dashes(w) { var s = ''; while (s.length < w) s += '-'; return s; }

  var out = [];
  out.push(pad('VARIANT', wVar) + '  ' + pad('LINES', wLn) + '  ' + pad('SIDECAR(s)', wSide) + '  ' + 'PROVENANCE');
  out.push(dashes(wVar) + '  ' + dashes(wLn) + '  ' + dashes(wSide) + '  ' + dashes(wProv));
  filtered.forEach(function(r) {
    var side = r.hasSidecar ? r.sidecars.join(',') : '(orphan)';
    var prov = r.provenance ? r.provenance.join(',') : '-';
    out.push(pad(r.variant, wVar) + '  ' + pad(r.lines, wLn) + '  ' + pad(side, wSide) + '  ' + prov);
  });
  out.push('');
  out.push(filtered.length + ' peek module(s)' + (onlyOrphans ? ' (orphans only)' : '') +
    ' out of ' + rows.length + ' in ' + S.path.relative(process.cwd(), S.paths.ENGINE_DIR));
  S.writeLines(out);
}

module.exports = {
  'list-peeks': run
};
