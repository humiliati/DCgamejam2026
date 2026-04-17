#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  tools/cli/bf-seed-from-html.js  —  One-shot seeder
//  Phase 2 of BOXFORGE_AGENT_ROADMAP §4.2
//
//  For every built-in template registered in TEMPLATES_STATUS
//  (tools/boxforge.html), this runs the template fn against a
//  fresh vm-sandbox'd copy of the BoxForge editor state and writes
//  a v4 .boxforge.json payload to  tools/templates/peeks/<slug>.boxforge.json.
//
//  The output is what `serializeProject()` in boxforge.html would
//  produce immediately after clicking the template button: the same
//  shell/colors/panes/glows/orbConfig/pyramidConfig/phaseAnims/
//  phaseMode/orbOnly/pyrPrimary plus the Phase 0 templateName/status
//  pair and the Phase 1 descriptor/meta blocks.
//
//  Usage:
//    node tools/cli/bf-seed-from-html.js           # write all 15 files
//    node tools/cli/bf-seed-from-html.js --dry-run # print plan, don't write
//    node tools/cli/bf-seed-from-html.js --only Chest  # single template
// ═══════════════════════════════════════════════════════════════
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var HERE           = __dirname;
var TOOLS_DIR      = path.resolve(HERE, '..');
var BOXFORGE_HTML  = path.join(TOOLS_DIR, 'boxforge.html');
var TEMPLATES_DIR  = path.join(TOOLS_DIR, 'templates', 'peeks');

function fail(code, msg) {
  process.stderr.write('[bf-seed] ' + msg + '\n');
  process.exit(code);
}

function parseArgs(argv) {
  var out = { _: [] };
  var i = 0;
  while (i < argv.length) {
    var a = argv[i];
    if (a.slice(0, 2) === '--') {
      var key = a.slice(2);
      var next = argv[i + 1];
      if (next === undefined || next.slice(0, 2) === '--') { out[key] = true; i++; }
      else { out[key] = next; i += 2; }
    } else { out._.push(a); i++; }
  }
  return out;
}

// ── HTML extraction ────────────────────────────────────────────
function slice(src, name, re) {
  var m = src.match(re);
  if (!m) fail(2, 'could not extract `' + name + '` from boxforge.html');
  return m[0];
}

function buildSandbox() {
  if (!fs.existsSync(BOXFORGE_HTML)) fail(2, 'boxforge.html not found at ' + BOXFORGE_HTML);
  var src = fs.readFileSync(BOXFORGE_HTML, 'utf8');

  // Initial state (small lets/vars) — grabbed as exact lines by regex anchor.
  var INIT = [
    slice(src, '_nextId',         /var _nextId = 1;/),
    slice(src, 'shell',           /var shell = \{ bw: 200, bh: 200, bd: 100, persp: 800, rx: -25, ry: 20 \};/),
    slice(src, 'colors',          /var colors = \{ cDark: '#0b0b66'[\s\S]*?\};/),
    // panes starts empty and is filled by defaultPanes() later — the actual
    // line in source is `var panes = [];`.
    slice(src, 'panes',           /var panes = \[\];/),
    'var glows = [];',
    'var _nextGlowId = 1;',
    'var selectedPaneId = null;',
    'var selectedGlowId = null;',
    'var currentState = "closed";',
    'var orbConfig = null;',
    'var pyramidConfig = null;',
    'var orbOnly = false;',
    'var pyrPrimary = false;',
    'var phaseMode = "box";',
    slice(src, 'phaseAnims',      /var phaseAnims = \{\s*p1: \{ squish: 0, bounce: 0, poke: 0, spin: 0, tilt: 0, glow: 0 \},[\s\S]*?\};/),
    slice(src, 'ORB_PALETTES',    /var ORB_PALETTES = \{[\s\S]*?\n {2}\};/),
    slice(src, 'PYR_SHAPES',      /var PYR_SHAPES = \{[\s\S]*?\n {2}\};/),
    slice(src, 'ORB_PHASE_KEYS',  /var ORB_PHASE_KEYS = \[[\s\S]*?\];/),
    slice(src, 'PYR_PHASE_KEYS',  /var PYR_PHASE_KEYS = \[[\s\S]*?\];/)
  ];

  // Factories — each slice is a complete function declaration.
  var FACTORIES = [
    slice(src, '_gcPhase',          /function _gcPhase\(p, defaults\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'makeGlowChild',     /function makeGlowChild\(opts\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'makeGlow',          /function makeGlow\(opts\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'defaultGlows',      /function defaultGlows\(\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'defaultPhaseAnims', /function defaultPhaseAnims\(\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'makePyrPhase',      /function makePyrPhase\(opts\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'defaultOrbConfig',  /function defaultOrbConfig\(\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'makeOrbPhase',      /function makeOrbPhase\(opts\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'makePane',          /function makePane\(opts\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'makeAttachment',    /function makeAttachment\(opts\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'defaultPanes',      /function defaultPanes\(\) \{[\s\S]*?\n {2}\}/)
  ];

  // Phase 0 + 1 registries + helpers.
  var P01 = [
    slice(src, 'TEMPLATES',         /var TEMPLATES = \{[\s\S]*?\n {2}\};/),
    slice(src, 'TEMPLATE_STATUS',   /var TEMPLATE_STATUS = \{[\s\S]*?\};/),
    slice(src, 'getTemplateStatus', /function getTemplateStatus\(name\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'DEFAULTS',          /var PEEK_DESCRIPTOR_DEFAULTS = \{[\s\S]*?\n {2}\};/),
    slice(src, 'OVERRIDES',         /var PEEK_DESCRIPTOR_VARIANT_OVERRIDES = \{[\s\S]*?\n {2}\};/),
    slice(src, 'resolveDescriptor', /function resolveDescriptor\(templateName\) \{[\s\S]*?\n {2}\}/),
    slice(src, 'buildMeta',         /function buildMeta\(templateName\) \{[\s\S]*?\n {2}\}/)
  ];

  // Reset/apply/serialize helpers we implement ourselves — they emulate what
  // boxforge.html does when you click a template button + then save JSON.
  // We DON'T pull in serializeProject itself because it touches DOM state
  // (_activeTplName, etc.) that we can model more simply here.
  var HELPERS = [
    // Reset state to pristine before each template run.
    'function __resetState() {',
    '  _nextId = 1; _nextGlowId = 1;',
    '  shell = { bw: 200, bh: 200, bd: 100, persp: 800, rx: -25, ry: 20 };',
    '  colors = { cDark: "#0b0b66", cLight: "#6060e8", cFloor: "#0a0a4f", cCeil: "#2e2e2e", cGlow: "#8888ff" };',
    '  panes = defaultPanes();',
    '  glows = defaultGlows();',
    '  orbConfig = null; pyramidConfig = null;',
    '  orbOnly = false; pyrPrimary = false;',
    '  phaseMode = "box";',
    '  phaseAnims = defaultPhaseAnims();',
    '  currentState = "closed";',
    '}',
    // Snapshot all template-owned state into a plain JSON payload.
    'function __snapshot(name) {',
    '  return {',
    '    _format: "boxforge",',
    '    _version: 4,',
    '    templateName: name,',
    '    templateStatus: name ? (TEMPLATE_STATUS[name] || null) : null,',
    '    descriptor: resolveDescriptor(name),',
    '    meta: buildMeta(name),',
    '    shell: JSON.parse(JSON.stringify(shell)),',
    '    colors: JSON.parse(JSON.stringify(colors)),',
    '    panes: JSON.parse(JSON.stringify(panes)),',
    '    glows: JSON.parse(JSON.stringify(glows)),',
    '    orbConfig: orbConfig ? JSON.parse(JSON.stringify(orbConfig)) : null,',
    '    pyramidConfig: pyramidConfig ? JSON.parse(JSON.stringify(pyramidConfig)) : null,',
    '    phaseAnims: JSON.parse(JSON.stringify(phaseAnims)),',
    '    phaseMode: phaseMode,',
    '    orbOnly: orbOnly,',
    '    pyrPrimary: pyrPrimary,',
    '    currentState: currentState',
    '  };',
    '}',
    'function __runTemplate(name) {',
    '  __resetState();',
    '  var fn = TEMPLATES[name];',
    '  if (typeof fn !== "function") throw new Error("no template fn: " + name);',
    '  fn();',
    '  return __snapshot(name);',
    '}',
    'function __listTemplates() { return Object.keys(TEMPLATES); }',
    'this.__runTemplate = __runTemplate;',
    'this.__listTemplates = __listTemplates;',
    'this.TEMPLATES = TEMPLATES;',
    'this.TEMPLATE_STATUS = TEMPLATE_STATUS;'
  ];

  var code = INIT.concat(FACTORIES).concat(P01).concat(HELPERS).join('\n\n');
  var sandbox = {};
  vm.createContext(sandbox);
  try {
    vm.runInContext(code, sandbox, { filename: 'boxforge.html#seeder' });
  } catch (e) {
    // Drop the assembled code to a tmp file for post-mortem debugging.
    try {
      var dbg = path.join(require('os').tmpdir(), 'bf-seed-extract-' + Date.now() + '.js');
      fs.writeFileSync(dbg, code);
      process.stderr.write('[bf-seed] extraction dump → ' + dbg + '\n');
    } catch (_) {}
    fail(2, 'vm error while building sandbox: ' + e.message);
  }
  return sandbox;
}

// ── Slug helper — must match peekFilePath() in bf-shared.js ────
function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*\+\s*/g, '-plus-')   // 'Boss Door + Orb' → 'boss-door-plus-orb'
    .replace(/[()]/g, '')             // 'Torch (box)' → 'torch-box'
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Main ───────────────────────────────────────────────────────
function main() {
  var args = parseArgs(process.argv.slice(2));
  var dryRun = !!args['dry-run'];
  var only   = typeof args.only === 'string' ? args.only : null;

  var sandbox = buildSandbox();
  var names = sandbox.__listTemplates();
  if (only) {
    if (names.indexOf(only) < 0) fail(1, 'unknown template "' + only + '" (known: ' + names.join(', ') + ')');
    names = [only];
  }

  if (!fs.existsSync(TEMPLATES_DIR) && !dryRun) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }

  var wrote = 0;
  var skipped = 0;
  names.forEach(function(name) {
    var slug;
    try {
      slug = slugify(name);
      if (!slug) throw new Error('empty slug');
    } catch (e) {
      fail(2, 'slugify failed for "' + name + '": ' + e.message);
    }

    var payload;
    try {
      payload = sandbox.__runTemplate(name);
    } catch (e) {
      fail(2, 'template "' + name + '" threw: ' + e.message);
    }

    var outPath = path.join(TEMPLATES_DIR, slug + '.boxforge.json');
    if (dryRun) {
      var existed = fs.existsSync(outPath);
      process.stdout.write((existed ? 'would overwrite: ' : 'would create:    ') + path.relative(TOOLS_DIR, outPath) + ' (' + name + ')\n');
      skipped++;
    } else {
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
      process.stdout.write('wrote: ' + path.relative(TOOLS_DIR, outPath) + ' (' + name + ')\n');
      wrote++;
    }
  });

  if (dryRun) process.stdout.write('\n[dry-run] ' + skipped + ' template(s) planned; nothing written.\n');
  else        process.stdout.write('\nSeeded ' + wrote + ' template(s) into ' + path.relative(process.cwd(), TEMPLATES_DIR) + '\n');
}

if (require.main === module) main();

module.exports = { buildSandbox: buildSandbox, slugify: slugify };
