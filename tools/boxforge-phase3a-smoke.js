#!/usr/bin/env node
// tools/boxforge-phase3a-smoke.js -- Phase 3a regression harness
// BOXFORGE_AGENT_ROADMAP 4.3
//
// For every sidecar in tools/templates/peeks/:
//   1. emit a peek module to a tmp path
//   2. pull the BF-DATA block back out
//   3. assert deep-equal with the source sidecar
//   4. assert bf-peek-sandbox captures a PeekShell.register() call
//      with matching variant + tileMatch
'use strict';

var fs   = require('fs');
var os   = require('os');
var path = require('path');

var S       = require('./cli/bf-shared');
var SANDBOX = require('./cli/bf-peek-sandbox');
var EMIT    = require('./cli/bf-emit');
var CSS     = require('./cli/bf-css-emit');

function parseArgs(argv) {
  var out = { _: [] };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--verbose' || a === '-v') { out.verbose = true; continue; }
    if (a === '--variant') { out.variant = argv[++i]; continue; }
    if (a === '--keep-tmp') { out.keepTmp = true; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    out._.push(a);
  }
  return out;
}

var args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(
    'boxforge-phase3a-smoke\n' +
    '  node tools/boxforge-phase3a-smoke.js\n' +
    '  node tools/boxforge-phase3a-smoke.js --variant crate\n' +
    '  node tools/boxforge-phase3a-smoke.js --verbose\n' +
    '  node tools/boxforge-phase3a-smoke.js --keep-tmp\n'
  );
  process.exit(0);
}

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  var keys = Object.keys(v).sort();
  return '{' + keys.map(function(k) { return JSON.stringify(k) + ':' + stableStringify(v[k]); }).join(',') + '}';
}

function firstDiffPath(a, b, prefix) {
  prefix = prefix || '$';
  if (stableStringify(a) === stableStringify(b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return prefix;
  }
  var ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  var keys = {};
  ka.forEach(function(k) { keys[k] = 1; });
  kb.forEach(function(k) { keys[k] = 1; });
  var all = Object.keys(keys).sort();
  for (var i = 0; i < all.length; i++) {
    var k = all[i];
    var d = firstDiffPath(a[k], b[k], prefix + '.' + k);
    if (d) return d;
  }
  return prefix;
}

var TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-phase3a-'));
var report = { pass: [], fail: [] };

function pickVariants() {
  if (args.variant) return [String(args.variant)];
  return S.listPeekFiles().map(function(f) {
    return f.replace(/\.boxforge\.json$/, '');
  });
}

function roundTripOne(variant) {
  var tStart = Date.now();
  var result = { variant: variant, steps: [], ok: true, errors: [] };

  var srcPath = S.peekFilePath(variant);
  if (!fs.existsSync(srcPath)) {
    result.ok = false;
    result.errors.push('source sidecar missing: ' + srcPath);
    return result;
  }
  var srcJson = fs.readFileSync(srcPath, 'utf8');
  var srcData;
  try { srcData = JSON.parse(srcJson); }
  catch (e) {
    result.ok = false;
    result.errors.push('source sidecar unparseable: ' + e.message);
    return result;
  }
  result.steps.push('loaded ' + srcJson.length + 'B');

  var outPath = path.join(TMP_ROOT, variant + '-peek.js');
  var sb = S.getBoxForgeSandbox();
  var vres = sb.validateProject(srcData);
  if (!vres.ok) {
    result.ok = false;
    result.errors.push('validateProject failed: ' + (vres.errors || []).join('; '));
    return result;
  }

  var templateName = srcData.templateName || variant;
  var resolved = sb.resolveDescriptor(templateName) || {};
  var descriptor = Object.assign({}, resolved, srcData.descriptor || {});
  descriptor.variant = (srcData.descriptor && srcData.descriptor.variant) || variant;
  if (srcData.descriptor && srcData.descriptor.tileMatch) descriptor.tileMatch = srcData.descriptor.tileMatch;
  var meta = srcData.meta || sb.buildMeta(templateName) || null;

  var cssRes, htmlStr;
  try {
    cssRes  = CSS.emitCSS(srcData, templateName);
    htmlStr = CSS.emitHTML(srcData, templateName);
  } catch (e) {
    result.ok = false;
    result.errors.push('emitCSS/emitHTML threw: ' + (e && e.message || e));
    return result;
  }

  var sidecarJson = JSON.stringify(srcData, null, 2);
  var source = EMIT._renderPeekModule({
    variant: variant,
    templateName: templateName,
    descriptor: descriptor,
    meta: meta,
    css: cssRes.css,
    html: htmlStr,
    sidecarJson: sidecarJson
  });

  fs.writeFileSync(outPath, source);
  result.steps.push('emitted ' + source.length + 'B');

  var emittedSrc = fs.readFileSync(outPath, 'utf8');
  var ext = SANDBOX.extractBfData(emittedSrc);
  if (!ext.ok) {
    result.ok = false;
    result.errors.push('extractBfData failed: ' + ext.error);
    return result;
  }
  var roundTripped = ext.data;
  result.steps.push('BF-DATA ok');

  var a = stableStringify(srcData);
  var b = stableStringify(roundTripped);
  if (a !== b) {
    result.ok = false;
    result.errors.push('round-trip diverged at ' + firstDiffPath(srcData, roundTripped));
    return result;
  }
  result.steps.push('deep-equal');

  var cap = SANDBOX.loadPeekModule(outPath);
  if (!cap.ok) {
    result.ok = false;
    result.errors.push('sandbox load failed: ' + cap.error);
    return result;
  }
  if (!cap.registrations.length) {
    result.ok = false;
    result.errors.push('sandbox captured zero PeekShell.register calls');
    return result;
  }
  var reg = cap.registrations[0];
  if (reg.variant !== descriptor.variant) {
    result.ok = false;
    result.errors.push('variant mismatch: expected ' + descriptor.variant + ', got ' + reg.variant);
    return result;
  }
  if (descriptor.tileMatch && reg.tileMatch !== descriptor.tileMatch) {
    result.ok = false;
    result.errors.push('tileMatch mismatch: expected ' + descriptor.tileMatch + ', got ' + reg.tileMatch);
    return result;
  }
  result.steps.push('shellCheck ' + reg.variant + '/' + (reg.tileMatch || '-'));

  result.elapsedMs = Date.now() - tStart;
  return result;
}

var variants = pickVariants();
if (!variants.length) {
  process.stderr.write('[phase3a-smoke] no sidecars\n');
  process.exit(2);
}

process.stdout.write('[phase3a-smoke] running ' + variants.length + ' round-trips in ' + TMP_ROOT + '\n');

variants.forEach(function(v) {
  var r = roundTripOne(v);
  if (r.ok) {
    report.pass.push(r);
    if (args.verbose) process.stdout.write('  ok ' + v + ' (' + r.elapsedMs + 'ms) ' + r.steps.join(' -> ') + '\n');
    else              process.stdout.write('  ok ' + v + '\n');
  } else {
    report.fail.push(r);
    process.stdout.write('  FAIL ' + v + '\n');
    r.errors.forEach(function(e) { process.stdout.write('      ' + e + '\n'); });
    if (r.steps.length) process.stdout.write('      steps: ' + r.steps.join(' -> ') + '\n');
  }
});

if (!args.keepTmp) {
  try {
    fs.readdirSync(TMP_ROOT).forEach(function(f) { fs.unlinkSync(path.join(TMP_ROOT, f)); });
    fs.rmdirSync(TMP_ROOT);
  } catch (e) { /* ignore */ }
} else {
  process.stdout.write('[phase3a-smoke] kept tmp: ' + TMP_ROOT + '\n');
}

var n = variants.length;
if (report.fail.length === 0) {
  process.stdout.write('\n[phase3a-smoke] ALL ' + n + ' VARIANTS PASSED\n');
  process.exit(0);
} else {
  process.stdout.write('\n[phase3a-smoke] ' + report.fail.length + '/' + n + ' FAILED\n');
  process.exit(1);
}
