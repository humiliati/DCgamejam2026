// ═══════════════════════════════════════════════════════════════
//  tools/cli/bf-list-templates.js — `bf list-templates`
//  Phase 2 of BOXFORGE_AGENT_ROADMAP §4.2
//
//  Scan tools/templates/peeks/*.boxforge.json and emit a status line
//  per entry:  variant  status  dims (bw×bh×bd)  panes  glows  fx
//
//  Flags:
//    --json          emit a JSON payload instead of the table
//    --status <s>    filter to one of: shipped | primitive | broken
//
//  Read-only. Never touches floor-data.json (bf has its own corpus).
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./bf-shared');

function _fx(data) {
  var parts = [];
  if (data.orbConfig)       parts.push('orb');
  if (data.pyramidConfig)   parts.push('pyr');
  if (data.phaseMode === 'orb') parts.push('pmode=orb');
  if (data.orbOnly)         parts.push('orb-only');
  if (data.pyrPrimary)      parts.push('pyr-primary');
  return parts.length ? parts.join('+') : '-';
}

function _row(entry) {
  var d = entry.data || {};
  var sh = d.shell || {};
  return {
    variant: entry.variant,
    templateName: d.templateName || null,
    status: d.templateStatus || (d.meta && d.meta.status) || null,
    dims: {
      bw: sh.bw != null ? sh.bw : null,
      bh: sh.bh != null ? sh.bh : null,
      bd: sh.bd != null ? sh.bd : null
    },
    panes: Array.isArray(d.panes) ? d.panes.length : 0,
    glows: Array.isArray(d.glows) ? d.glows.length : 0,
    fx: _fx(d),
    file: entry.file,
    error: entry.error || null
  };
}

function _filter(rows, statusFilter) {
  if (!statusFilter) return rows;
  return rows.filter(function(r) { return r.status === statusFilter; });
}

function run(args) {
  var statusFilter = typeof args.status === 'string' ? args.status : null;
  if (statusFilter && ['shipped','primitive','broken'].indexOf(statusFilter) < 0) {
    S.fail(1, 'unknown --status "' + statusFilter + '" (must be shipped | primitive | broken)');
  }

  var entries = S.loadAllPeeks();
  var rows = entries.map(_row);
  rows = _filter(rows, statusFilter);

  if (args.json) {
    S.writeJson({
      ok: true,
      action: 'list-templates',
      statusFilter: statusFilter,
      count: rows.length,
      templates: rows
    });
    return;
  }

  if (!rows.length) {
    process.stdout.write('(no templates in ' + S.path.relative(process.cwd(), S.paths.TEMPLATES_DIR) + ')\n');
    return;
  }

  // Column widths
  var wVar = 8, wStat = 6, wDim = 14, wP = 2, wG = 2, wFx = 2;
  rows.forEach(function(r) {
    if (r.variant.length > wVar)            wVar  = r.variant.length;
    if (r.status && r.status.length > wStat) wStat = r.status.length;
    var dims = (r.dims.bw||'-') + 'x' + (r.dims.bh||'-') + 'x' + (r.dims.bd||'-');
    if (dims.length > wDim)                 wDim  = dims.length;
    if (String(r.panes).length > wP)        wP    = String(r.panes).length;
    if (String(r.glows).length > wG)        wG    = String(r.glows).length;
    if (r.fx.length > wFx)                  wFx   = r.fx.length;
  });

  function pad(s, w) { s = String(s == null ? '' : s); while (s.length < w) s += ' '; return s; }
  function dashes(w) { var s = ''; while (s.length < w) s += '-'; return s; }

  var out = [];
  out.push(pad('VARIANT', wVar) + '  ' + pad('STATUS', wStat) + '  ' + pad('DIMS (bw×bh×bd)', wDim) + '  ' + pad('P', wP) + '  ' + pad('G', wG) + '  ' + 'FX');
  out.push(dashes(wVar) + '  ' + dashes(wStat) + '  ' + dashes(wDim) + '  ' + dashes(wP) + '  ' + dashes(wG) + '  ' + '---');
  rows.forEach(function(r) {
    var dims = (r.dims.bw||'-') + 'x' + (r.dims.bh||'-') + 'x' + (r.dims.bd||'-');
    out.push(
      pad(r.variant, wVar) + '  ' +
      pad(r.status || '-', wStat) + '  ' +
      pad(dims, wDim) + '  ' +
      pad(r.panes, wP) + '  ' +
      pad(r.glows, wG) + '  ' +
      r.fx + (r.error ? '  ⚠ ' + r.error : '')
    );
  });
  out.push('');
  out.push(rows.length + ' template(s)' + (statusFilter ? ' with status=' + statusFilter : '') +
    ' in ' + S.path.relative(process.cwd(), S.paths.TEMPLATES_DIR));
  S.writeLines(out);
}

module.exports = {
  'list-templates': run
};
