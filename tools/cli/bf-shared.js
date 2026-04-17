// ═══════════════════════════════════════════════════════════════
//  tools/cli/bf-shared.js — Shared helpers for boxforge-cli commands
//  Phase 2 of BOXFORGE_AGENT_ROADMAP — mirrors tools/cli/shared.js
//
//  The canonical data store for BoxForge peeks is the directory
//    tools/templates/peeks/<variant>.boxforge.json
//  Each file is a serialized window.BoxForge.serialize() output,
//  conforming to the v4 schema defined in Phase 1 (§4.1).
//
//  Every command module requires this and destructures what it
//  needs. The dispatcher (tools/boxforge-cli.js) composes command
//  modules into a single COMMANDS map.
//
//  --dry-run flag flows through setDryRun()/isDryRun() the same way
//  shared.js wires it for blockout-cli — so Phase 3's bf ingest /
//  bf emit mutators get dry-run for free.
// ═══════════════════════════════════════════════════════════════
'use strict';

var fs   = require('fs');
var path = require('path');

var TOOLS_DIR      = path.resolve(__dirname, '..');
var REPO_DIR       = path.resolve(TOOLS_DIR, '..');
var ENGINE_DIR     = path.join(REPO_DIR, 'engine');
var TEMPLATES_DIR  = path.join(TOOLS_DIR, 'templates', 'peeks');
var WORKBENCH_HTML = path.join(TOOLS_DIR, 'peek-workbench.html');
var BOXFORGE_HTML  = path.join(TOOLS_DIR, 'boxforge.html');

// ── Process ────────────────────────────────────────────────────
function fail(code, msg) {
  process.stderr.write('[boxforge-cli] ' + msg + '\n');
  process.exit(code);
}

// ── Args ───────────────────────────────────────────────────────
// Mirrors shared.parseArgs — long-only flags, positional under _.
function parseArgs(argv) {
  var out = { _: [] };
  var i = 0;
  while (i < argv.length) {
    var a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; i++; continue; }
    if (a.slice(0, 2) === '--') {
      var key = a.slice(2);
      var next = argv[i + 1];
      if (next === undefined || next.slice(0, 2) === '--') {
        out[key] = true; i++;
      } else {
        out[key] = next; i += 2;
      }
    } else {
      out._.push(a); i++;
    }
  }
  return out;
}

// ── Dry-run mode (Slice C1 analogue) ───────────────────────────
var _dryRun = false;
var _saveCallCount = 0;
function setDryRun(flag) { _dryRun = !!flag; _saveCallCount = 0; }
function isDryRun()      { return _dryRun; }
function saveCallCount() { return _saveCallCount; }

// ── Filesystem: templates/peeks/ ───────────────────────────────
function ensureTemplatesDir() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
}

function peekFilePath(variant) {
  // Variants are slugified (kebab-case). Filename: <variant>.boxforge.json.
  var name = String(variant || '').replace(/[^a-zA-Z0-9_\-]/g, '-');
  if (!name) fail(1, 'empty variant name');
  return path.join(TEMPLATES_DIR, name + '.boxforge.json');
}

function loadPeekFile(variant) {
  var p = peekFilePath(variant);
  if (!fs.existsSync(p)) fail(2, 'no template file for variant "' + variant + '" at ' + p);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(2, 'failed to parse ' + p + ': ' + e.message);
  }
}

function savePeekFile(variant, data) {
  if (_dryRun) { _saveCallCount++; return; }
  ensureTemplatesDir();
  var p = peekFilePath(variant);
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

function listPeekFiles() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs.readdirSync(TEMPLATES_DIR)
    .filter(function(f) { return /\.boxforge\.json$/.test(f); })
    .sort();
}

function loadAllPeeks() {
  return listPeekFiles().map(function(f) {
    var variant = f.replace(/\.boxforge\.json$/, '');
    var p = path.join(TEMPLATES_DIR, f);
    var data = null;
    try {
      data = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      return { file: f, variant: variant, error: e.message, data: null };
    }
    return { file: f, variant: variant, data: data, path: p };
  });
}

// ── Filesystem: engine/*-peek.js ───────────────────────────────
function listEnginePeeks() {
  if (!fs.existsSync(ENGINE_DIR)) return [];
  return fs.readdirSync(ENGINE_DIR)
    .filter(function(f) { return /-peek\.js$/.test(f); })
    .sort();
}

// ── BoxForge HTML logic extraction ─────────────────────────────
//
// Pull the Phase-0 TEMPLATE_STATUS map + Phase-1 descriptor registry
// out of peek-workbench.html / boxforge.html and eval them in a vm
// sandbox so commands can resolve descriptors without reading DOM state.
// Reused from tools/boxforge-phase1-smoke.js — the regex shapes are
// deliberately conservative (anchored on distinctive opening lines).
var vm = require('vm');
var _cachedSandbox = null;

function getBoxForgeSandbox() {
  if (_cachedSandbox) return _cachedSandbox;
  // Prefer peek-workbench.html (canonical, 17 templates); fall back to boxforge.html.
  var htmlPath = fs.existsSync(WORKBENCH_HTML) ? WORKBENCH_HTML : BOXFORGE_HTML;
  if (!fs.existsSync(htmlPath)) fail(2, 'neither peek-workbench.html nor boxforge.html found in tools/');
  var src = fs.readFileSync(htmlPath, 'utf8');

  function slice(name, re) {
    var m = src.match(re);
    if (!m) fail(2, 'could not extract `' + name + '` from ' + path.basename(htmlPath));
    return m[0];
  }

  var code = [
    slice('TEMPLATE_STATUS',    /var TEMPLATE_STATUS = \{[\s\S]*?\};/),
    slice('getTemplateStatus',  /function getTemplateStatus\(name\) \{[\s\S]*?\n {2}\}/),
    slice('DEFAULTS',           /var PEEK_DESCRIPTOR_DEFAULTS = \{[\s\S]*?\n {2}\};/),
    slice('OVERRIDES',          /var PEEK_DESCRIPTOR_VARIANT_OVERRIDES = \{[\s\S]*?\n {2}\};/),
    slice('resolveDescriptor',  /function resolveDescriptor\(templateName\) \{[\s\S]*?\n {2}\}/),
    slice('buildMeta',          /function buildMeta\(templateName\) \{[\s\S]*?\n {2}\}/),
    slice('validators',         /function _validateFormat\(data, errors\) \{[\s\S]*?function validateProject\(data\) \{[\s\S]*?\n {2}\}/),
    'this.TEMPLATE_STATUS = TEMPLATE_STATUS;',
    'this.PEEK_DESCRIPTOR_DEFAULTS = PEEK_DESCRIPTOR_DEFAULTS;',
    'this.PEEK_DESCRIPTOR_VARIANT_OVERRIDES = PEEK_DESCRIPTOR_VARIANT_OVERRIDES;',
    'this.getTemplateStatus = getTemplateStatus;',
    'this.resolveDescriptor = resolveDescriptor;',
    'this.buildMeta = buildMeta;',
    'this.validateProject = validateProject;'
  ].join('\n\n');

  var sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: path.basename(htmlPath) + '#extracted' });
  _cachedSandbox = sandbox;
  return sandbox;
}

// ── Pretty-print helpers ───────────────────────────────────────
function writeJson(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

function writeLines(lines) {
  process.stdout.write(lines.join('\n') + '\n');
}

module.exports = {
  fs: fs, path: path,
  paths: {
    TOOLS_DIR:      TOOLS_DIR,
    REPO_DIR:       REPO_DIR,
    ENGINE_DIR:     ENGINE_DIR,
    TEMPLATES_DIR:  TEMPLATES_DIR,
    WORKBENCH_HTML: WORKBENCH_HTML,
    BOXFORGE_HTML:  BOXFORGE_HTML
  },
  fail: fail,
  parseArgs: parseArgs,
  setDryRun: setDryRun, isDryRun: isDryRun, saveCallCount: saveCallCount,
  ensureTemplatesDir: ensureTemplatesDir,
  peekFilePath: peekFilePath,
  loadPeekFile: loadPeekFile,
  savePeekFile: savePeekFile,
  listPeekFiles: listPeekFiles,
  loadAllPeeks: loadAllPeeks,
  listEnginePeeks: listEnginePeeks,
  getBoxForgeSandbox: getBoxForgeSandbox,
  writeJson: writeJson,
  writeLines: writeLines
};
