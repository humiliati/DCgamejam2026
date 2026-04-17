// ═══════════════════════════════════════════════════════════════
//  tools/cli/bf-stamps.js — Parametric stamp registry + commands
//  Phase 5 of BOXFORGE_AGENT_ROADMAP (§5.1 – §5.9 land incrementally).
//
//  Mirrors tools/cli/commands-stamps.js (the BO track):
//    - Each stamp is a named parametric generator that loads a base
//      sidecar from tools/templates/peeks/ and produces a mutated
//      project ready to save as tools/templates/peeks/<variant>.boxforge.json.
//    - `list-stamps` prints the registry (tunables + worked examples).
//    - `apply-stamp --name <stamp> --variant <v> [tunables]` writes a
//      new sidecar. Validates the output via boxforge-cli's
//      validateProject before saving so a malformed stamp cannot
//      poison tools/templates/peeks/.
//    - `--dry-run` flows through bf-shared.savePeekFile for free.
//
//  Phase 5.1 shipped `stamp-braizer` (from torch-box) — fire-inside-a-
//  vessel archetype covering HEARTH, BONFIRE, CITY_BONFIRE, ANVIL,
//  SOUP_KITCHEN, INCINERATOR (DOC-112 §3.1 / §3.2 / §3.4 / §3.5).
//
//  Phase 5.2 adds `stamp-flat-sprite` (from corpse) — flat horizontal
//  plate + central sprite overlay. Covers every low-silhouette floor
//  object: TABLE, BENCH, COT, NEST, STRETCHER_DOCK, TRIAGE_BED,
//  MORGUE_TABLE, TRAP_PRESSURE_PLATE, TRAP_TRIPWIRE (DOC-112 §3.2
//  / §3.3 / §3.5 / §3.6).
//
//  Honesty-pass 2026-04-17: applyStampCmd now enforces a shipped-base
//  gate. Non-shipped bases are refused unless --force is passed, in
//  which case the output is auto-tagged templateStatus=broken with an
//  audit trail. This prevents "primitive"-status stamped outputs from
//  silently propagating rot from a broken base primitive.
//
//  Subsequent slices (§5.3 – §5.8) register additional stamps in
//  STAMPS under this same pattern; no wiring changes required.
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./bf-shared');

// ── Registry ────────────────────────────────────────────────────
//
// Each entry:
//   base        — variant slug of the primitive sidecar to clone
//   derivation  — one-line description of the resulting shape
//   tunables    — { key: { default, about } } — knobs the agent can pass
//   examples    — worked examples drawn from DOC-112 §3 (used by
//                 list-stamps + bf-help-meta)
//   apply(opts) — takes resolved tunables, returns a project object.
//                 Must NOT save; apply-stamp is the chokepoint.

var STAMP_BRAIZER_EXAMPLES = [
  { variant: 'hearth',        tileMatch: 'HEARTH',       tileId: 29, bw: 360, bh: 300, bd: 180, flameColor: '#ff7722', embersColor: '#bb3311', lit: true, peekType: 'gated',  note: 'interior fireplace — cozy rest action when lit' },
  { variant: 'bonfire',       tileMatch: 'BONFIRE',      tileId: 18, bw: 300, bh: 280, bd: 300, flameColor: '#ff8822', embersColor: '#cc4411', lit: true, peekType: 'gated',  note: 'checkpoint pyre — respawn + heal on face' },
  { variant: 'city-bonfire',  tileMatch: 'CITY_BONFIRE', tileId: 69, bw: 420, bh: 360, bd: 420, flameColor: '#ee7711', embersColor: '#aa3300', lit: true, peekType: 'gated',  note: 'Olympic-model community pyre — town-square variant' },
  { variant: 'anvil',         tileMatch: 'ANVIL',        tileId: 43, bw: 240, bh: 140, bd: 180, flameColor: '#ff5500', embersColor: '#663322', lit: true, peekType: 'action', note: 'foundry anvil + coal glow — forge minigame bookend' },
  { variant: 'soup-kitchen',  tileMatch: 'SOUP_KITCHEN', tileId: 47, bw: 300, bh: 260, bd: 200, flameColor: '#ffaa44', embersColor: '#884422', lit: true, peekType: 'action', note: 'soup cauldron on brazier — ladle minigame bookend' },
  { variant: 'incinerator',   tileMatch: 'INCINERATOR',  tileId: 58, bw: 280, bh: 360, bd: 200, flameColor: '#ff4422', embersColor: '#442211', lit: true, peekType: 'action', note: 'disposal grate — burn-sequence menu' }
];

var STAMP_FLAT_SPRITE_EXAMPLES = [
  { variant: 'table',                tileMatch: 'TABLE',               tileId: 28, plateW: 180, plateH: 120, thickness: 80, spriteTintHex: '#8b5a2b', wearState: 'pristine', occupant: false, peekType: 'micro',  note: 'common-room table — cozy-quip toast on face' },
  { variant: 'bench',                tileMatch: 'BENCH',               tileId: 41, plateW: 200, plateH: 80,  thickness: 40, spriteTintHex: '#a67843', wearState: 'worn',     occupant: false, peekType: 'gated',  note: 'promenade bench — nap action when tired' },
  { variant: 'cot',                  tileMatch: 'COT',                 tileId: 48, plateW: 180, plateH: 100, thickness: 25, spriteTintHex: '#c2b280', wearState: 'worn',     occupant: false, peekType: 'gated',  note: 'barracks cot — nap when tired' },
  { variant: 'nest',                 tileMatch: 'NEST',                tileId: 50, plateW: 120, plateH: 120, thickness: 30, spriteTintHex: '#6b4423', wearState: 'worn',     occupant: false, peekType: 'action', note: 'hatched nest — sweep cleanup clicky' },
  { variant: 'stretcher-dock',       tileMatch: 'STRETCHER_DOCK',      tileId: 55, plateW: 220, plateH: 120, thickness: 50, spriteTintHex: '#7a7a82', wearState: 'pristine', occupant: false, peekType: 'action', note: 'dock stretcher + unload bodies' },
  { variant: 'triage-bed',           tileMatch: 'TRIAGE_BED',          tileId: 56, plateW: 200, plateH: 120, thickness: 50, spriteTintHex: '#e0d5c0', wearState: 'pristine', occupant: true,  peekType: 'gated',  note: 'medical triage bed — occupied / empty phase (occupant flag)' },
  { variant: 'morgue-table',         tileMatch: 'MORGUE_TABLE',        tileId: 57, plateW: 220, plateH: 100, thickness: 70, spriteTintHex: '#b8b8bc', wearState: 'pristine', occupant: false, peekType: 'action', note: 'steel slab — deposit body for report' },
  { variant: 'trap-pressure-plate',  tileMatch: 'TRAP_PRESSURE_PLATE', tileId: 97, plateW: 100, plateH: 100, thickness: 15, spriteTintHex: '#505560', wearState: 'pristine', occupant: false, peekType: 'action', note: 'disarmed plate — "Re-arm plate" action; returns TRAP_ARMED' },
  { variant: 'trap-tripwire',        tileMatch: 'TRAP_TRIPWIRE',       tileId: 99, plateW: 200, plateH: 10,  thickness: 5,  spriteTintHex: '#303030', wearState: 'pristine', occupant: false, peekType: 'micro',  note: 'thin floor strip — cut / step-over / reset hint' }
];

var STAMPS = {
  'braizer': {
    base: 'torch-box',
    derivation: 'Box shell + top-mounted flame/glow pane (fire-inside-a-vessel archetype).',
    tunables: {
      bw:          { default: 300,       about: 'Shell width (px, non-negative).' },
      bh:          { default: 250,       about: 'Shell height (px, non-negative).' },
      bd:          { default: 200,       about: 'Shell depth (px, non-negative).' },
      flameColor:  { default: '#ff7722', about: 'Top flame tone (hex). Retints top/back/front orb panes + ember lid + glow.' },
      embersColor: { default: '#cc3300', about: 'Side embers tone (hex). Retints left/right/bottom orb panes.' },
      lit:         { default: true,      about: 'Initial lit state. false hides the ember lid and shows the cold cap.' },
      biomeTag:    { default: '',        about: 'Biome tag applied to every pane (blank = no biome constraint).' },
      peekType:    { default: 'gated',   about: 'Peek classification: gated (ambient) | action (minigame bookend) | full | micro.' },
      tileMatch:   { default: '',        about: 'TILES.* constant string (e.g. "HEARTH"). Sets descriptor.tileMatch.' }
    },
    examples: STAMP_BRAIZER_EXAMPLES,
    apply: applyBraizer
  },
  'flat-sprite': {
    base: 'corpse',
    derivation: 'Flat horizontal plate + central sprite overlay (low-silhouette floor-object archetype).',
    tunables: {
      plateW:        { default: 200,       about: 'Plate width (px, non-negative). Maps to shell.bw.' },
      plateH:        { default: 100,       about: 'Plate depth (px, non-negative, floor-plan extent). Maps to shell.bd.' },
      thickness:     { default: 20,        about: 'Plate height off floor (px, non-negative). Maps to shell.bh — keep small for "flat" read.' },
      spriteId:      { default: '',        about: 'Optional sprite asset hint. Recorded in meta.audit; engine can parse for asset lookup.' },
      spriteTintHex: { default: '#c0a080', about: 'Top-surface tint (hex). Retints Top pane + Lid (occupant) + glow family + label.' },
      wearState:     { default: 'pristine', about: 'pristine | worn | damaged | broken — sets Top pane alpha (100/85/60/35).' },
      occupant:      { default: false,     about: 'Occupant overlay. When true, Lid pane alpha=100 (visible); when false, alpha=0 (empty plate).' },
      innerLabel:    { default: '',        about: 'Descriptor innerLabelTpl override (e.g. "\u25b8 Re-arm plate"). Blank = no action label.' },
      biomeTag:      { default: '',        about: 'Biome tag applied to every pane (blank = no biome constraint).' },
      peekType:      { default: 'micro',   about: 'Peek classification: micro (cozy quip) | gated (context) | action (minigame) | full.' },
      tileMatch:     { default: '',        about: 'TILES.* constant string (e.g. "TABLE"). Sets descriptor.tileMatch.' }
    },
    examples: STAMP_FLAT_SPRITE_EXAMPLES,
    apply: applyFlatSprite
  }
};

// ── stamp-braizer application ──────────────────────────────────

function applyBraizer(opts) {
  var base = S.loadPeekFile('torch-box');
  var project = JSON.parse(JSON.stringify(base));  // deep clone so we never mutate the cached base

  var t = STAMPS['braizer'].tunables;

  var bw = coerceNumber(opts.bw, t.bw.default);
  var bh = coerceNumber(opts.bh, t.bh.default);
  var bd = coerceNumber(opts.bd, t.bd.default);
  var flameColor  = coerceString(opts.flameColor,  t.flameColor.default);
  var embersColor = coerceString(opts.embersColor, t.embersColor.default);
  var lit         = coerceBool(opts.lit, t.lit.default);
  var biomeTag    = coerceString(opts.biomeTag, t.biomeTag.default);
  var peekType    = coerceString(opts.peekType, t.peekType.default);
  var tileMatch   = coerceString(opts.tileMatch, t.tileMatch.default);
  var variant     = String(opts.variant || '');
  if (!variant) throw new Error('apply-stamp: variant is required');
  if (!/^[a-z][a-z0-9\-]*$/.test(variant)) {
    throw new Error('apply-stamp: variant "' + variant + '" must be kebab-case (lowercase, digits, hyphen; starts with a letter)');
  }

  if (bw < 0 || bh < 0 || bd < 0) throw new Error('apply-stamp: bw/bh/bd must be non-negative');

  // Shell dims — validator requires bw, bh, bd, persp to be non-negative numbers.
  // persp/rx/ry inherit from the torch-box base so perspective stays sensible.
  project.shell.bw = bw;
  project.shell.bh = bh;
  project.shell.bd = bd;

  // Pane retint by name. Flame panes get the bright hero tone, embers
  // panes get the darker side tone, the handle/unlit-cap stay as-is.
  var FLAME_PANES  = { 'Back Orb': 1, 'Top Orb': 1, 'Front Orb': 1, 'Ember Lid': 1 };
  var EMBERS_PANES = { 'Left Orb': 1, 'Right Orb': 1, 'Bot Orb': 1 };
  project.panes.forEach(function(pane) {
    if (FLAME_PANES[pane.name])       pane.color = flameColor;
    else if (EMBERS_PANES[pane.name]) pane.color = embersColor;
    // lit ↔ unlit visual swap — keep alpha intent crisp.
    if (pane.name === 'Ember Lid') pane.alpha = lit ? 80 : 0;
    if (pane.name === 'Unlit Cap') pane.alpha = lit ? 0 : 100;
    pane.biomeTag = biomeTag;
  });

  // Glow family picks up the flame tone so the lighting reads as the
  // hearth/brazier light source rather than a leftover torch hint.
  if (project.colors) {
    project.colors.cGlow = flameColor;
  }

  // Descriptor — sidecar values win over resolved defaults via bf-emit.
  project.descriptor = Object.assign({}, project.descriptor, {
    variant: variant,
    tileMatch: tileMatch,
    glowColor: hexToRgba(flameColor, 0.5),
    labelColor: flameColor
  });

  // Template metadata. Status stays "primitive" until the engine
  // module + gallery entry land — upgrading to "shipped" is the
  // ship-gate for the downstream slice that wires the peek into game.
  project.templateName   = titleCase(variant);
  project.templateStatus = 'primitive';

  project.meta = Object.assign({}, project.meta || {}, {
    status: 'primitive',
    audit:  'stamp-braizer(bw=' + bw + ',bh=' + bh + ',bd=' + bd + ',lit=' + lit + ')',
    owner:  (project.meta && project.meta.owner)        || '',
    lastVerified: (project.meta && project.meta.lastVerified) || ''
  });

  // Root-level peekType — the v4 validator cross-ref only enforces
  // that 'face-js' peeks declare a jsHandoffModule, so 'gated' / 'action'
  // / 'full' / 'micro' are all safe here.
  project.peekType = peekType;

  return project;
}

// ── stamp-flat-sprite application ──────────────────────────────
//
// Base: corpse.boxforge.json (6 panes: Back/Left/Right/Top/Bottom/Lid,
// 4 glows: Floor glow + 3 Cross). For a flat-sprite peek the shell is
// very thin (bh = thickness), so Back/Left/Right read as hairline edges
// and Top/Bottom dominate. Top pane = the sprite surface; Lid pane =
// optional occupant overlay (triage-bed, cot-with-patient, etc.).

function applyFlatSprite(opts) {
  var base = S.loadPeekFile('corpse');
  var project = JSON.parse(JSON.stringify(base));  // deep clone — never mutate cached base

  var t = STAMPS['flat-sprite'].tunables;

  var plateW     = coerceNumber(opts.plateW,    t.plateW.default);
  var plateH     = coerceNumber(opts.plateH,    t.plateH.default);
  var thickness  = coerceNumber(opts.thickness, t.thickness.default);
  var spriteId   = coerceString(opts.spriteId,      t.spriteId.default);
  var spriteTint = coerceString(opts.spriteTintHex, t.spriteTintHex.default);
  var wearState  = coerceString(opts.wearState,     t.wearState.default);
  var occupant   = coerceBool  (opts.occupant,      t.occupant.default);
  var innerLabel = coerceString(opts.innerLabel,    t.innerLabel.default);
  var biomeTag   = coerceString(opts.biomeTag,      t.biomeTag.default);
  var peekType   = coerceString(opts.peekType,      t.peekType.default);
  var tileMatch  = coerceString(opts.tileMatch,     t.tileMatch.default);
  var variant    = String(opts.variant || '');

  if (!variant) throw new Error('apply-stamp: variant is required');
  if (!/^[a-z][a-z0-9\-]*$/.test(variant)) {
    throw new Error('apply-stamp: variant "' + variant + '" must be kebab-case (lowercase, digits, hyphen; starts with a letter)');
  }
  if (plateW < 0 || plateH < 0 || thickness < 0) {
    throw new Error('apply-stamp: plate-w / plate-h / thickness must be non-negative');
  }

  var WEAR_ALPHA = { 'pristine': 100, 'worn': 85, 'damaged': 60, 'broken': 35 };
  if (!Object.prototype.hasOwnProperty.call(WEAR_ALPHA, wearState)) {
    throw new Error('apply-stamp: wear-state must be one of: pristine | worn | damaged | broken');
  }
  var wearAlpha = WEAR_ALPHA[wearState];

  // Shell — plateW→bw, plateH→bd, thickness→bh. persp/rx/ry inherit from corpse.
  project.shell.bw = plateW;
  project.shell.bh = thickness;
  project.shell.bd = plateH;

  // Pane retint by name. Top = sprite surface (read as "the thing on the plate"),
  // Lid = occupant overlay (hidden when empty). Back/Left/Right/Bottom keep their
  // structural corpse tones so a thin shell still has edge definition.
  project.panes.forEach(function(pane) {
    if (pane.name === 'Top') {
      pane.color = spriteTint;
      pane.alpha = wearAlpha;
    } else if (pane.name === 'Lid') {
      pane.color = spriteTint;
      pane.alpha = occupant ? 100 : 0;
    }
    pane.biomeTag = biomeTag;
  });

  // Glow family picks up the sprite tint — reads as the peek's pickup ring.
  // Cross glows dim to avoid visual noise on tiny plates (was 60, → 25).
  project.glows.forEach(function(g) {
    g.color = spriteTint;
    if (g.name && g.name.indexOf('Cross') === 0) g.alpha = 25;
  });

  if (project.colors) {
    project.colors.cGlow = spriteTint;
  }

  // Descriptor — clear the corpse-inherited "▸ Search" prompt so flat-sprites
  // default to no action label; --inner-label brings it back for variants that
  // need it (e.g. trap-pressure-plate → "▸ Re-arm plate").
  project.descriptor = Object.assign({}, project.descriptor, {
    variant:       variant,
    tileMatch:     tileMatch,
    glowColor:     hexToRgba(spriteTint, 0.4),
    labelColor:    spriteTint,
    innerLabelTpl: innerLabel,
    subLabelTpl:   ''
  });

  // Template metadata — always bumps corpse's "broken" status up to "primitive"
  // since applyFlatSprite produces a validator-clean sidecar by construction.
  project.templateName   = titleCase(variant);
  project.templateStatus = 'primitive';

  var auditBits = [
    'pW=' + plateW,
    'pH=' + plateH,
    'th=' + thickness,
    'wear=' + wearState,
    'occupant=' + occupant
  ];
  if (spriteId) auditBits.push('sprite=' + spriteId);

  project.meta = Object.assign({}, project.meta || {}, {
    status: 'primitive',
    audit:  'stamp-flat-sprite(' + auditBits.join(',') + ')',
    owner:  (project.meta && project.meta.owner)        || '',
    lastVerified: (project.meta && project.meta.lastVerified) || ''
  });

  // Root-level peekType — the v4 validator only enforces cross-ref when
  // peekType === 'face-js' (requires jsHandoffModule), so micro/gated/action/full
  // are all safe.
  project.peekType = peekType;

  return project;
}

// ── Helpers ────────────────────────────────────────────────────

function coerceNumber(v, dfl) {
  if (v === undefined || v === null || v === true) return dfl;
  var n = +v;
  if (!isFinite(n)) throw new Error('expected numeric value, got ' + JSON.stringify(v));
  return n;
}

function coerceString(v, dfl) {
  if (v === undefined || v === null || v === true) return dfl;
  return String(v);
}

function coerceBool(v, dfl) {
  if (v === undefined || v === null) return dfl;
  if (v === true || v === 'true'  || v === '1' || v === 1) return true;
  if (v === false || v === 'false' || v === '0' || v === 0) return false;
  return !!v;
}

function titleCase(slug) {
  return String(slug).split(/[-_]/).map(function(w) {
    if (!w.length) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function hexToRgba(hex, alpha) {
  var h = String(hex || '').replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(function(c) { return c + c; }).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 'rgba(255,119,34,' + alpha + ')'; // soft fallback
  var r = parseInt(h.substr(0, 2), 16);
  var g = parseInt(h.substr(2, 2), 16);
  var b = parseInt(h.substr(4, 2), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// ── Commands ───────────────────────────────────────────────────

function listStamps(args) {
  var entries = Object.keys(STAMPS).sort().map(function(name) {
    var s = STAMPS[name];
    var tunables = {};
    Object.keys(s.tunables).forEach(function(k) {
      tunables[k] = { default: s.tunables[k].default, about: s.tunables[k].about };
    });
    var examples = s.examples.map(function(ex) {
      return { variant: ex.variant, tileMatch: ex.tileMatch, tileId: ex.tileId, peekType: ex.peekType, note: ex.note };
    });
    return {
      name:       'stamp-' + name,
      base:       s.base,
      derivation: s.derivation,
      tunables:   tunables,
      examples:   examples
    };
  });

  if (args && args.json) {
    process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
    return;
  }

  var lines = [];
  lines.push('bf stamp roster (' + entries.length + ' registered):');
  entries.forEach(function(e) {
    lines.push('');
    lines.push('  ' + e.name + '  (base: ' + e.base + ')');
    lines.push('    ' + e.derivation);
    lines.push('    tunables:');
    Object.keys(e.tunables).forEach(function(k) {
      var tu = e.tunables[k];
      lines.push('      --' + kebab(k) + '  (default: ' + JSON.stringify(tu.default) + ')  ' + tu.about);
    });
    lines.push('    worked examples (DOC-112 §3):');
    e.examples.forEach(function(ex) {
      lines.push('      ' + ex.variant.padEnd(20) +
                 ' -> tile ' + ex.tileMatch + ' (id ' + ex.tileId + ')' +
                 ' peek=' + ex.peekType +
                 '  ' + ex.note);
    });
  });
  lines.push('');
  process.stdout.write(lines.join('\n'));
}

function kebab(k) {
  return k.replace(/[A-Z]/g, function(c) { return '-' + c.toLowerCase(); });
}

function applyStampCmd(args) {
  var rawName = args.name ? String(args.name) : null;
  if (!rawName) S.fail(1, 'apply-stamp needs --name <stamp>  (try: node tools/boxforge-cli.js list-stamps)');
  var name = rawName.replace(/^stamp-/, '');
  var stamp = STAMPS[name];
  if (!stamp) S.fail(2, 'unknown stamp: "' + rawName + '" (known: ' + Object.keys(STAMPS).map(function(k){return 'stamp-'+k;}).join(', ') + ')');

  var variant = args.variant ? String(args.variant) : null;
  if (!variant) S.fail(1, 'apply-stamp needs --variant <name>');

  // ── Base-status gate (post-honesty-pass 2026-04-17) ─────────────
  // Stamps inherit pane geometry, glow positioning, juice, and phase
  // animations from their base sidecar. Stamping from a non-shipped
  // base propagates broken pane/glow/juice choices to every output.
  // Require --force to stamp from non-shipped bases; force-stamped
  // outputs are auto-tagged templateStatus=broken with an audit trail.
  var baseStatus = 'unknown';
  try {
    var baseProject = S.loadPeekFile(stamp.base);
    baseStatus = (baseProject && baseProject.templateStatus) ||
                 (baseProject && baseProject.meta && baseProject.meta.status) || 'unknown';
  } catch (eBase) {
    S.fail(2, 'apply-stamp: could not load base sidecar for stamp-' + name +
              ' (base: ' + stamp.base + '): ' + (eBase.message || String(eBase)));
  }
  var forceBroken = false;
  if (baseStatus !== 'shipped') {
    if (!args.force) {
      S.fail(3,
        'apply-stamp: base template "' + stamp.base + '" has status "' + baseStatus + '" (only "shipped" bases are trusted).\n' +
        '  Stamping from a non-shipped base propagates broken pane/glow/juice choices to every output.\n' +
        '  To proceed anyway (output will be auto-tagged templateStatus=broken), pass --force.\n' +
        '  Preferred fix: craft "' + stamp.base + '" to templateStatus=shipped first, then re-run this stamp.'
      );
    }
    forceBroken = true;
  }

  var outPath = args.out ? String(args.out) : null;
  var overwrite = !!args.overwrite;

  // If --out is not supplied, the default is tools/templates/peeks/<variant>.boxforge.json
  // via S.savePeekFile. If --out IS supplied, we write to that path verbatim.
  var destPath = outPath ? (S.path.isAbsolute(outPath) ? outPath : S.path.join(S.paths.REPO_DIR, outPath))
                         : S.peekFilePath(variant);

  if (S.fs.existsSync(destPath) && !overwrite && !args.print && !S.isDryRun()) {
    S.fail(1, 'apply-stamp: target exists at ' + S.path.relative(S.paths.REPO_DIR, destPath) +
             ' — pass --overwrite to replace (or --print / --dry-run to preview)');
  }

  var opts = {
    variant:       variant,
    // ── stamp-braizer knobs ──
    bw:            args.bw,
    bh:            args.bh,
    bd:            args.bd,
    flameColor:    args['flame-color'],
    embersColor:   args['embers-color'],
    lit:           args.lit,
    // ── stamp-flat-sprite knobs ──
    plateW:        args['plate-w'],
    plateH:        args['plate-h'],
    thickness:     args.thickness,
    spriteId:      args['sprite-id'],
    spriteTintHex: args['sprite-tint-hex'],
    wearState:     args['wear-state'],
    occupant:      args.occupant,
    innerLabel:    args['inner-label'],
    // ── shared ──
    biomeTag:      args['biome-tag'],
    peekType:      args['peek-type'],
    tileMatch:     args['tile-match']
  };

  var project;
  try {
    project = stamp.apply(opts);
  } catch (e) {
    S.fail(2, 'apply-stamp: ' + (e.message || String(e)));
  }

  // Force-broken tagging: non-shipped-base stamps must not advertise as
  // primitive. Flip both templateStatus and meta.status and append an
  // audit trail so the roster honestly reports the derivation.
  if (forceBroken) {
    project.templateStatus = 'broken';
    project.meta = project.meta || {};
    project.meta.status = 'broken';
    var honestyNote = 'derived from ' + baseStatus + ' base \'' + stamp.base +
                      '\' via stamp-' + name +
                      '; awaiting crafted shipped base [stamp-base-gate --force]';
    var prevAudit = project.meta.audit || '';
    project.meta.audit = prevAudit ? (prevAudit + '; ' + honestyNote) : honestyNote;
  }

  // Validate before writing — a malformed stamp must never poison the sidecar dir.
  var sb = S.getBoxForgeSandbox();
  var vres = sb.validateProject(project);
  if (!vres || !vres.ok) {
    var errs = (vres && vres.errors) || ['unknown validation error'];
    S.fail(2, 'apply-stamp: generated sidecar failed validation:\n  - ' + errs.join('\n  - '));
  }

  if (args.print) {
    process.stdout.write(JSON.stringify(project, null, 2) + '\n');
    return;
  }

  // Dry-run path goes through savePeekFile → increments counter without writing.
  // Non-dry-run writes: if --out supplied, writeFileSync to that path;
  // otherwise savePeekFile to tools/templates/peeks/<variant>.boxforge.json.
  if (S.isDryRun()) {
    S.savePeekFile(variant, project);  // counter bump only
  } else if (outPath) {
    var dir = S.path.dirname(destPath);
    if (!S.fs.existsSync(dir)) S.fs.mkdirSync(dir, { recursive: true });
    S.fs.writeFileSync(destPath, JSON.stringify(project, null, 2) + '\n');
  } else {
    S.savePeekFile(variant, project);
  }

  process.stdout.write(JSON.stringify({
    ok:             true,
    action:         'apply-stamp',
    stamp:          'stamp-' + name,
    base:           stamp.base,
    baseStatus:     baseStatus,
    forceBroken:    forceBroken,
    variant:        variant,
    dryRun:         S.isDryRun(),
    wrote:          S.isDryRun() ? null : S.path.relative(S.paths.REPO_DIR, destPath),
    target:         S.path.relative(S.paths.REPO_DIR, destPath),
    shell:          project.shell,
    descriptor: {
      variant:   project.descriptor.variant,
      tileMatch: project.descriptor.tileMatch
    },
    peekType:       project.peekType,
    templateStatus: project.templateStatus,
    warnings:       vres.warnings || []
  }, null, 2) + '\n');
}

module.exports = {
  'list-stamps':     listStamps,
  'apply-stamp':     applyStampCmd,
  _STAMPS:           STAMPS,
  _applyBraizer:     applyBraizer,
  _applyFlatSprite:  applyFlatSprite,
  _helpers: {
    coerceNumber: coerceNumber,
    coerceString: coerceString,
    coerceBool:   coerceBool,
    titleCase:    titleCase,
    hexToRgba:    hexToRgba
  }
};
