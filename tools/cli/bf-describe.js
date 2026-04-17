// ═══════════════════════════════════════════════════════════════
//  tools/cli/bf-describe.js — `bf describe --variant <name>`
//  Phase 2 of BOXFORGE_AGENT_ROADMAP §4.2
//
//  Print a human- or agent-readable summary of one .boxforge.json:
//    - descriptor block (PeekSystem §2.1 schema — juice, glowColor, ...)
//    - shell dims (bw × bh × bd, perspective, initial rx/ry)
//    - phase map (anim toggles per p1/p2/p3 — squish/bounce/poke/spin/tilt/glow)
//    - effect stack (orb? pyramid? phaseMode, orbOnly, pyrPrimary)
//
//  Flags:
//    --variant <name>  (required — slug matches peekFilePath())
//    --json            emit JSON instead of the human block
//
//  Read-only. Surfaces the Phase-1 validator verdict so broken sidecars
//  are flagged up front.
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./bf-shared');

function _variantSlug(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9_\-]+/g, '-').replace(/^-+|-+$/g, '');
}

function _phaseRow(key, p) {
  p = p || {};
  var cells = ['squish','bounce','poke','spin','tilt','glow'].map(function(k) {
    var v = p[k];
    return (v == null ? '.' : String(v));
  });
  return key + ':  ' + cells.join(' / ');
}

function _effects(d) {
  var fx = [];
  if (d.orbConfig)             fx.push('orb');
  if (d.pyramidConfig)         fx.push('pyramid');
  if (d.phaseMode === 'orb')   fx.push('phaseMode=orb');
  if (d.orbOnly)               fx.push('orb-only');
  if (d.pyrPrimary)            fx.push('pyr-primary');
  return fx.length ? fx.join(', ') : '(none)';
}

function _describeOrb(cfg) {
  if (!cfg) return null;
  function one(p) {
    if (!p) return null;
    return { size: p.size, speed: p.speed, rings: p.rings, slices: p.slices, palette: p.palette, state: p.state };
  }
  return { p1: one(cfg.p1), p2: one(cfg.p2), p3: one(cfg.p3) };
}

function _describePyr(cfg) {
  if (!cfg) return null;
  function one(p) {
    if (!p) return null;
    return { size: p.size, height: p.height, spread: p.spread, speed: p.speed,
             color1: p.color1, color2: p.color2, color3: p.color3, glow: p.glow };
  }
  return {
    shape:    cfg.shape,
    invert:   !!cfg.invert,
    spinning: cfg.spinning !== false,
    p1: one(cfg.p1), p2: one(cfg.p2), p3: one(cfg.p3)
  };
}

function _validate(data) {
  var sb = S.getBoxForgeSandbox();
  try {
    return sb.validateProject(data);
  } catch (e) {
    return { ok: false, errors: ['validator threw: ' + (e && e.message || e)], warnings: [] };
  }
}

function run(args) {
  var variantRaw = args.variant;
  if (!variantRaw || variantRaw === true) {
    S.fail(1, 'missing --variant <name>');
  }
  var variant = _variantSlug(variantRaw);
  var data;
  try {
    data = S.loadPeekFile(variant);
  } catch (e) {
    // loadPeekFile already calls fail() on miss; if we get here something else broke.
    throw e;
  }

  var descriptor = data.descriptor || {};
  var meta       = data.meta || {};
  var shell      = data.shell || {};
  var phaseAnims = data.phaseAnims || {};
  var verdict    = _validate(data);

  if (args.json) {
    S.writeJson({
      ok: true,
      action: 'describe',
      variant: variant,
      file: S.path.relative(process.cwd(), S.peekFilePath(variant)),
      templateName: data.templateName || null,
      templateStatus: data.templateStatus || null,
      descriptor: descriptor,
      meta: meta,
      shell: shell,
      colors: data.colors || {},
      phaseAnims: phaseAnims,
      phaseMode: data.phaseMode || 'box',
      orbOnly: !!data.orbOnly,
      pyrPrimary: !!data.pyrPrimary,
      orb: _describeOrb(data.orbConfig),
      pyramid: _describePyr(data.pyramidConfig),
      paneCount: Array.isArray(data.panes) ? data.panes.length : 0,
      glowCount: Array.isArray(data.glows) ? data.glows.length : 0,
      validate: verdict
    });
    return;
  }

  var juice = descriptor.juice || {};
  var out = [];
  out.push('Variant:       ' + variant);
  out.push('Template:      ' + (data.templateName || '(anonymous)'));
  out.push('Status:        ' + (data.templateStatus || meta.status || '-'));
  out.push('File:          ' + S.path.relative(process.cwd(), S.peekFilePath(variant)));
  out.push('');
  out.push('── Descriptor ──────────────────────────────');
  out.push('  variant:        ' + (descriptor.variant || '-'));
  out.push('  tileMatch:      ' + (descriptor.tileMatch || '-'));
  out.push('  showDelay:      ' + (descriptor.showDelay != null ? descriptor.showDelay : '-') + ' ms');
  out.push('  openDelay:      ' + (descriptor.openDelay != null ? descriptor.openDelay : '-') + ' ms');
  out.push('  holdTime:       ' + (descriptor.holdTime  != null ? descriptor.holdTime  : '-') + ' ms');
  out.push('  glowColor:      ' + (descriptor.glowColor || '-'));
  out.push('  labelColor:     ' + (descriptor.labelColor || '-'));
  out.push('  innerLabelTpl:  ' + (descriptor.innerLabelTpl || '-'));
  out.push('  subLabelTpl:    ' + (descriptor.subLabelTpl || '-'));
  out.push('  buildContext:   ' + (descriptor.buildContext || '-'));
  out.push('  jsHandoffModule:' + (descriptor.jsHandoffModule || '-'));
  out.push('  juice.entryAnim:  ' + (juice.entryAnim || '-'));
  out.push('  juice.openAnim:   ' + (juice.openAnim  || '-'));
  out.push('  juice.glowPulse:  ' + (juice.glowPulse ? 'on' : 'off'));
  out.push('  juice.particles:  ' + (juice.particles ? 'on' : 'off'));
  out.push('  juice.sound:      ' + (juice.sound || '-'));
  out.push('  juice.haptic:     ' + (juice.haptic || '-'));
  out.push('');
  out.push('── Shell ───────────────────────────────────');
  out.push('  dims:      ' + (shell.bw||'-') + '  ×  ' + (shell.bh||'-') + '  ×  ' + (shell.bd||'-'));
  out.push('  persp:     ' + (shell.persp != null ? shell.persp : '-'));
  out.push('  rx / ry:   ' + (shell.rx != null ? shell.rx : '-') + '° / ' + (shell.ry != null ? shell.ry : '-') + '°');
  out.push('  panes:     ' + (Array.isArray(data.panes) ? data.panes.length : 0));
  out.push('  glows:     ' + (Array.isArray(data.glows) ? data.glows.length : 0));
  out.push('');
  out.push('── Phase map  (squish/bounce/poke/spin/tilt/glow) ──');
  out.push('  ' + _phaseRow('p1', phaseAnims.p1));
  out.push('  ' + _phaseRow('p2', phaseAnims.p2));
  out.push('  ' + _phaseRow('p3', phaseAnims.p3));
  out.push('');
  out.push('── Effects ─────────────────────────────────');
  out.push('  stack:     ' + _effects(data));
  if (data.orbConfig) {
    var o = data.orbConfig;
    out.push('  orb:');
    ['p1','p2','p3'].forEach(function(pk) {
      var p = o[pk] || {};
      out.push('    ' + pk + ': size=' + (p.size||'-') + '  speed=' + (p.speed||'-') +
               '  rings=' + (p.rings||'-') + '  slices=' + (p.slices||'-') +
               '  palette=' + (p.palette||'-') + '  state=' + (p.state||'-'));
    });
  }
  if (data.pyramidConfig) {
    var py = data.pyramidConfig;
    out.push('  pyramid:  shape=' + (py.shape||'-') + '  invert=' + !!py.invert + '  spinning=' + (py.spinning !== false));
    ['p1','p2','p3'].forEach(function(pk) {
      var p = py[pk] || {};
      out.push('    ' + pk + ': size=' + (p.size||'-') + '  speed=' + (p.speed||'-') +
               '  colors=' + (p.color1||'-') + '/' + (p.color2||'-') + '/' + (p.color3||'-'));
    });
  }
  out.push('');
  out.push('── Validation ──────────────────────────────');
  out.push('  ok:        ' + (verdict.ok ? 'YES' : 'NO'));
  if (verdict.errors && verdict.errors.length) {
    out.push('  errors:');
    verdict.errors.forEach(function(e) { out.push('    ✗ ' + e); });
  }
  if (verdict.warnings && verdict.warnings.length) {
    out.push('  warnings:');
    verdict.warnings.forEach(function(w) { out.push('    ⚠ ' + w); });
  }
  out.push('');
  S.writeLines(out);
}

module.exports = {
  'describe': run
};
