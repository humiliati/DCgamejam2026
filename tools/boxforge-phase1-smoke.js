#!/usr/bin/env node
/**
 * BoxForge Phase 1 round-trip smoke test.
 *
 * Exit criterion for BOXFORGE_AGENT_ROADMAP §4.1:
 *   - Every shipped template produces a valid PeekDescriptor
 *   - peek-workbench.html and boxforge.html agree on DEFAULTS + shared OVERRIDES
 *   - validateProject() accepts the output of serializeProject() for every template
 *
 * We can't instantiate the full editor DOM in Node, but the descriptor registry,
 * resolveDescriptor, buildMeta and validateProject are all pure functions. This
 * script yanks them out of the HTML via a bounded regex, evals them in a sandbox,
 * and exercises every template name in TEMPLATE_STATUS.
 *
 * Usage:  node tools/boxforge-phase1-smoke.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var HERE = __dirname;
var WORKBENCH = path.join(HERE, 'peek-workbench.html');
var BOXFORGE  = path.join(HERE, 'boxforge.html');

// ──────────────────────────────────────────────────────────────
//  Extract pure-logic sections from an HTML file into a sandbox.
// ──────────────────────────────────────────────────────────────
function extractSandbox(htmlPath) {
  var src = fs.readFileSync(htmlPath, 'utf8');

  // Each section below is pulled with a conservative regex anchored on a
  // distinctive opening line + closing brace on its own line.
  function slice(name, re) {
    var m = src.match(re);
    if (!m) throw new Error('Could not extract `' + name + '` from ' + htmlPath);
    return m[0];
  }

  var STATUS_BLOCK = slice('TEMPLATE_STATUS',
    /var TEMPLATE_STATUS = \{[\s\S]*?\};/);
  var GET_STATUS   = slice('getTemplateStatus',
    /function getTemplateStatus\(name\) \{[\s\S]*?\n {2}\}/);
  var DEFAULTS     = slice('PEEK_DESCRIPTOR_DEFAULTS',
    /var PEEK_DESCRIPTOR_DEFAULTS = \{[\s\S]*?\n {2}\};/);
  var OVERRIDES    = slice('PEEK_DESCRIPTOR_VARIANT_OVERRIDES',
    /var PEEK_DESCRIPTOR_VARIANT_OVERRIDES = \{[\s\S]*?\n {2}\};/);
  var RESOLVE      = slice('resolveDescriptor',
    /function resolveDescriptor\(templateName\) \{[\s\S]*?\n {2}\}/);
  var BUILD_META   = slice('buildMeta',
    /function buildMeta\(templateName\) \{[\s\S]*?\n {2}\}/);

  // Pull the five validator helpers + validateProject itself. These live in
  // a contiguous block so a single slice from `_validateFormat` through the
  // closing brace of `validateProject` is the safest grab.
  var VALIDATORS = slice('validators',
    /function _validateFormat\(data, errors\) \{[\s\S]*?function validateProject\(data\) \{[\s\S]*?\n {2}\}/);

  var code = [
    STATUS_BLOCK,
    GET_STATUS,
    DEFAULTS,
    OVERRIDES,
    RESOLVE,
    BUILD_META,
    VALIDATORS,
    // Publish a few handles the tests need.
    'this.TEMPLATE_STATUS = TEMPLATE_STATUS;',
    'this.PEEK_DESCRIPTOR_DEFAULTS = PEEK_DESCRIPTOR_DEFAULTS;',
    'this.PEEK_DESCRIPTOR_VARIANT_OVERRIDES = PEEK_DESCRIPTOR_VARIANT_OVERRIDES;',
    'this.resolveDescriptor = resolveDescriptor;',
    'this.buildMeta = buildMeta;',
    'this.validateProject = validateProject;'
  ].join('\n\n');

  var sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: path.basename(htmlPath) + '#extracted' });
  return sandbox;
}

// ──────────────────────────────────────────────────────────────
//  Build a minimal serialized payload with a given template.
//  Mirrors the fields serializeProject() emits, but with static
//  shell/panes/glows data because those come from DOM state in
//  the real editor.
// ──────────────────────────────────────────────────────────────
function fakeSerialize(sandbox, tplName) {
  var descriptor = sandbox.resolveDescriptor(tplName);
  var meta = sandbox.buildMeta(tplName);
  return {
    _format: 'boxforge',
    _version: 4,
    templateName: tplName,
    templateStatus: tplName ? sandbox.TEMPLATE_STATUS[tplName] || null : null,
    descriptor: descriptor,
    meta: meta,
    shell: { bw: 200, bh: 200, bd: 100, persp: 800, rx: -25, ry: 20 },
    colors: {},
    panes: [{ id: 1, face: 'front', name: 'test' }],
    glows: [],
    orbConfig: null,
    pyramidConfig: null,
    phaseAnims: {},
    phaseMode: 'box',
    orbOnly: false,
    pyrPrimary: false,
    currentState: 'closed'
  };
}

// ──────────────────────────────────────────────────────────────
//  Tests
// ──────────────────────────────────────────────────────────────
var failures = [];
function fail(msg) { failures.push(msg); console.error('✗ ' + msg); }
function pass(msg) { console.log('✓ ' + msg); }

console.log('── BoxForge Phase 1 round-trip smoke test ──');

var wb = extractSandbox(WORKBENCH);
var bf = extractSandbox(BOXFORGE);

// 1. DEFAULTS match between the two files (modulo JSON equality)
(function checkDefaultsAgree() {
  var a = JSON.stringify(wb.PEEK_DESCRIPTOR_DEFAULTS);
  var b = JSON.stringify(bf.PEEK_DESCRIPTOR_DEFAULTS);
  if (a === b) pass('DEFAULTS identical across peek-workbench.html and boxforge.html');
  else fail('DEFAULTS diverge:\n  wb: ' + a + '\n  bf: ' + b);
})();

// 2. Every OVERRIDE key shared between the two files must match.
(function checkSharedOverridesAgree() {
  var wbKeys = Object.keys(wb.PEEK_DESCRIPTOR_VARIANT_OVERRIDES);
  var bfKeys = Object.keys(bf.PEEK_DESCRIPTOR_VARIANT_OVERRIDES);
  var shared = wbKeys.filter(function(k) { return bfKeys.indexOf(k) >= 0; });
  var mismatched = [];
  shared.forEach(function(k) {
    var a = JSON.stringify(wb.PEEK_DESCRIPTOR_VARIANT_OVERRIDES[k]);
    var b = JSON.stringify(bf.PEEK_DESCRIPTOR_VARIANT_OVERRIDES[k]);
    if (a !== b) mismatched.push(k + '\n    wb: ' + a + '\n    bf: ' + b);
  });
  if (mismatched.length === 0) pass('Shared OVERRIDES agree for ' + shared.length + ' templates');
  else fail('Shared OVERRIDES mismatched:\n  - ' + mismatched.join('\n  - '));

  // Surface the asymmetric diff too — informational.
  var wbOnly = wbKeys.filter(function(k) { return bfKeys.indexOf(k) < 0; });
  var bfOnly = bfKeys.filter(function(k) { return wbKeys.indexOf(k) < 0; });
  if (wbOnly.length) console.log('  · wb-only:', wbOnly.join(', '));
  if (bfOnly.length) console.log('  · bf-only:', bfOnly.join(', '));
})();

// 3. resolveDescriptor(name) is idempotent & pure — two calls produce equal output.
(function checkResolveIdempotent() {
  var names = Object.keys(wb.TEMPLATE_STATUS);
  var broken = [];
  names.forEach(function(n) {
    var a = JSON.stringify(wb.resolveDescriptor(n));
    var b = JSON.stringify(wb.resolveDescriptor(n));
    if (a !== b) broken.push(n);
  });
  if (broken.length === 0) pass('resolveDescriptor idempotent for ' + names.length + ' templates');
  else fail('resolveDescriptor non-idempotent: ' + broken.join(', '));
})();

// 4. Every shipped template produces a valid descriptor (validate.ok === true).
function runValidation(name, sandbox, label) {
  var names = Object.keys(sandbox.TEMPLATE_STATUS);
  var bad = [];
  var warned = 0;
  names.forEach(function(n) {
    var payload = fakeSerialize(sandbox, n);
    var res = sandbox.validateProject(payload);
    if (!res.ok) bad.push(n + ' → [' + res.errors.join('; ') + ']');
    if (res.warnings.length) warned += res.warnings.length;
  });
  if (bad.length === 0) {
    pass(label + ': all ' + names.length + ' templates validate (' + warned + ' warnings total)');
  } else {
    fail(label + ' validation failures:\n  - ' + bad.join('\n  - '));
  }
}
runValidation('peek-workbench.html', wb, 'peek-workbench.html');
runValidation('boxforge.html',       bf, 'boxforge.html');

// 5. Load-a-serialize: validate(fakeSerialize(T)) is stable after a JSON round-trip.
(function checkJsonRoundTrip() {
  function oneSandbox(sandbox, label) {
    var names = Object.keys(sandbox.TEMPLATE_STATUS);
    var broken = [];
    names.forEach(function(n) {
      var a = fakeSerialize(sandbox, n);
      var b = JSON.parse(JSON.stringify(a)); // serialize + parse round-trip
      if (JSON.stringify(a) !== JSON.stringify(b)) broken.push(n);
      var resA = sandbox.validateProject(a);
      var resB = sandbox.validateProject(b);
      if (resA.ok !== resB.ok) broken.push(n + ' (validate divergence)');
    });
    if (broken.length === 0) pass(label + ': JSON round-trip stable for ' + names.length + ' templates');
    else fail(label + ' JSON round-trip broken: ' + broken.join(', '));
  }
  oneSandbox(wb, 'peek-workbench.html');
  oneSandbox(bf, 'boxforge.html');
})();

// 6. Validator rejects obviously bad payloads.
(function checkValidatorRejects() {
  var bad = [
    { name: 'null',          payload: null },
    { name: 'wrong format',  payload: { _format: 'lol', _version: 4 } },
    { name: 'negative delay', payload: (function() {
        var p = fakeSerialize(wb, 'Chest'); p.descriptor.showDelay = -5; return p;
      })()
    },
    { name: 'bad entryAnim',  payload: (function() {
        var p = fakeSerialize(wb, 'Chest'); p.descriptor.juice.entryAnim = 'flop'; return p;
      })()
    },
    { name: 'bad meta.status', payload: (function() {
        var p = fakeSerialize(wb, 'Chest'); p.meta.status = 'cursed'; return p;
      })()
    }
  ];
  var bypasses = [];
  bad.forEach(function(c) {
    var res = wb.validateProject(c.payload);
    if (res.ok) bypasses.push(c.name);
  });
  if (bypasses.length === 0) pass('Validator rejects all 5 intentionally-broken payloads');
  else fail('Validator accepted broken payloads: ' + bypasses.join(', '));
})();

// ──────────────────────────────────────────────────────────────
//  Exit
// ──────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error('\n✗ ' + failures.length + ' failure(s)');
  process.exit(1);
} else {
  console.log('\n✓ Phase 1 round-trip smoke test passed');
}
