// ═══════════════════════════════════════════════════════════════
//  tools/cli/bf-help-meta.js — Centralized command metadata
//  Phase 2 of BOXFORGE_AGENT_ROADMAP — mirrors tools/cli/help-meta.js
//
//  Single source of truth for `bf help` (CLI) and
//  `window.BoxForgeHelpMeta` (browser). Every public action in the
//  command vocabulary should have an entry here with
//  { description, args, example }.
//
//  DUAL-MODE: this file is loaded by the Node CLI via require() AND
//  by the browser (peek-workbench.html / boxforge.html) via a plain
//  <script> tag that attaches to window.BoxForgeHelpMeta. No other
//  deps — safe at any load order.
// ═══════════════════════════════════════════════════════════════
(function (root) {
'use strict';

function A(name, about, required) {
  return { name: name, about: about, required: !!required };
}

var META = {

  // ── bf-list-templates.js ─────────────────────────────────────
  'list-templates': {
    description: 'List every template in tools/templates/peeks/ with status, variant, and shell dims.',
    args: [
      A('--json',   'Emit as JSON (for agents) instead of human-readable text.', false),
      A('--status <s>', 'Filter to one of: shipped | primitive | broken.', false)
    ],
    example: 'node tools/boxforge-cli.js list-templates'
  },

  // ── bf-describe.js ───────────────────────────────────────────
  'describe': {
    description: 'Print descriptor block + shell dims + phase map for one template.',
    args: [
      A('--variant <name>', 'Variant slug (matches tools/templates/peeks/<name>.boxforge.json).', true),
      A('--json',           'Emit as JSON (for agents) instead of human-readable text.', false)
    ],
    example: 'node tools/boxforge-cli.js describe --variant chest'
  },

  // ── bf-list-peeks.js ─────────────────────────────────────────
  'list-peeks': {
    description: 'Scan engine/*-peek.js and report variant, line count, BoxForge provenance, and whether a matching .boxforge.json exists.',
    args: [
      A('--json',   'Emit as JSON (for agents) instead of human-readable text.', false),
      A('--orphans', 'Only list peek modules that DO NOT have a matching .boxforge.json sidecar.', false)
    ],
    example: 'node tools/boxforge-cli.js list-peeks'
  },

  // ── bf-stamps.js (Phase 5) ──────────────────────────────────
  'list-stamps': {
    description: 'List every registered parametric stamp with its base sidecar, tunables, and worked examples drawn from DOC-112 §3.',
    args: [
      A('--json', 'Emit as JSON (for agents) instead of human-readable text.', false)
    ],
    example: 'node tools/boxforge-cli.js list-stamps'
  },

  'apply-stamp': {
    description: 'Generate a new .boxforge.json sidecar by applying a parametric stamp to its base primitive. Writes to tools/templates/peeks/<variant>.boxforge.json unless --out is given.',
    args: [
      A('--name <stamp>',          'Stamp name (e.g. braizer or stamp-braizer). Required.', true),
      A('--variant <slug>',        'Kebab-case variant name for the new sidecar. Required.', true),
      A('--tile-match <NAME>',     'TILES.* constant string the peek binds to (e.g. HEARTH). Required for engine wiring but blank-permitted while prototyping.', false),
      A('--bw <n>',                '[braizer] Shell width (px).', false),
      A('--bh <n>',                '[braizer] Shell height (px).', false),
      A('--bd <n>',                '[braizer] Shell depth (px).', false),
      A('--flame-color <#rgb>',    '[braizer] Top flame tone (hex).', false),
      A('--embers-color <#rgb>',   '[braizer] Side embers tone (hex).', false),
      A('--lit <bool>',            '[braizer] Initial lit state (true|false).', false),
      A('--plate-w <n>',           '[flat-sprite] Plate width (px, floor-plan X). Maps to shell.bw.', false),
      A('--plate-h <n>',           '[flat-sprite] Plate depth (px, floor-plan Z). Maps to shell.bd.', false),
      A('--thickness <n>',         '[flat-sprite] Plate height off floor (px, keep small). Maps to shell.bh.', false),
      A('--sprite-id <id>',        '[flat-sprite] Sprite asset hint. Recorded in meta.audit for engine-side asset lookup.', false),
      A('--sprite-tint-hex <#rgb>','[flat-sprite] Top-surface tint (hex). Retints Top pane + Lid + glow family + label.', false),
      A('--wear-state <s>',        '[flat-sprite] pristine | worn | damaged | broken. Sets Top pane alpha (100/85/60/35).', false),
      A('--occupant <bool>',       '[flat-sprite] Occupant overlay. true = Lid visible (triage-bed/cot with patient); false = empty plate.', false),
      A('--inner-label <text>',    'Descriptor innerLabelTpl override (e.g. "\u25b8 Re-arm plate"). Blank = no action label.', false),
      A('--biome-tag <slug>',      'Biome tag applied to every pane.', false),
      A('--peek-type <kind>',      'gated | action | full | micro (default depends on stamp).', false),
      A('--out <path>',            'Alternate output path (relative to repo root). Default: tools/templates/peeks/<variant>.boxforge.json.', false),
      A('--overwrite',             'Replace an existing sidecar at the target path.', false),
      A('--print',                 'Print the generated project to stdout instead of writing.', false),
      A('--force',                 'Override the shipped-base gate. Required when the stamp\x27s base template is not templateStatus=shipped. Output is auto-tagged templateStatus=broken with an audit trail noting the broken-base derivation.', false)
    ],
    example: 'node tools/boxforge-cli.js apply-stamp --name flat-sprite --variant table --tile-match TABLE --plate-w 180 --plate-h 120 --thickness 80 --sprite-tint-hex "#8b5a2b" --peek-type micro'
  },

  // ── bf-help.js ───────────────────────────────────────────────
  'help': {
    description: 'Print help for all commands, or one command\x27s args + example.',
    args: [
      A('<command>',    'Optional. If omitted, lists every command.', false),
      A('--json',       'Emit as JSON (for agents) instead of human-readable text.', false)
    ],
    example: 'node tools/boxforge-cli.js help describe'
  }
};

// ── Public API ────────────────────────────────────────────────
function list() { return Object.keys(META).sort(); }
function get(name) { return META[name] || null; }

// Formatter: human-readable block for one command.
function formatBlock(name) {
  var m = META[name];
  if (!m) return 'help: unknown command "' + name + '" (try `bf help` for the full list)\n';
  var lines = [];
  lines.push(name);
  lines.push('  ' + m.description);
  if (m.args && m.args.length) {
    lines.push('');
    lines.push('  Arguments:');
    var nameW = 0;
    m.args.forEach(function(a) { if (a.name.length > nameW) nameW = a.name.length; });
    m.args.forEach(function(a) {
      var pad = '                                '.slice(0, nameW - a.name.length);
      var tag = a.required ? ' (required)' : '';
      lines.push('    ' + a.name + pad + '  ' + a.about + tag);
    });
  } else {
    lines.push('');
    lines.push('  Arguments: (none)');
  }
  lines.push('');
  lines.push('  Example:');
  lines.push('    ' + m.example);
  lines.push('');
  return lines.join('\n');
}

// Formatter: flat list of all command names.
function formatIndex() {
  var names = list();
  var lines = [];
  lines.push('bf help <command>  — show args + example for one command.');
  lines.push('bf help            — this list.');
  lines.push('');
  lines.push('Available commands:');
  names.forEach(function(n) {
    var m = META[n];
    lines.push('  ' + n + (m && m.description ? '  — ' + m.description : ''));
  });
  lines.push('');
  lines.push('Global flags: --dry-run (preview without writing), --help / -h.');
  return lines.join('\n') + '\n';
}

var API = {
  META: META,
  list: list,
  get: get,
  formatBlock: formatBlock,
  formatIndex: formatIndex
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  root.BoxForgeHelpMeta = API;
}

})(typeof window !== 'undefined' ? window : this);
