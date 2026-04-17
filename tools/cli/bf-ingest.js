// ═══════════════════════════════════════════════════════════════
//  tools/cli/bf-ingest.js — `bf ingest`
//
//  Phase 3a of BOXFORGE_AGENT_ROADMAP.
//
//  Reads a peek module at engine/<variant>-peek.js (or an explicit
//  --from path) and reconstructs its `.boxforge.json` sidecar from
//  the embedded `/* BF-DATA-START\n{...}\nBF-DATA-END */` block that
//  `bf emit` writes at the bottom of every generated peek.
//
//  The block-based path is fast, deterministic, and round-trip safe
//  across all peeks emitted by `bf emit`. Legacy peeks authored
//  before Phase 3a (chest/torch/corpse) do not carry a BF-DATA block;
//  ingesting them is the subject of Phase 3b (CSS decoder + PeekShell
//  harvest from the sandbox in bf-peek-sandbox.js).
//
//  Usage:
//    bf ingest --from engine/<v>-peek.js                # merge → sidecar
//    bf ingest --variant <v>                            # derives --from
//    bf ingest --from engine/<v>-peek.js --print        # stdout, no write
//    bf ingest --from engine/<v>-peek.js --dry-run      # suppressed write
//    bf ingest --from engine/<v>-peek.js --overwrite    # force even if sidecar exists
//
//  Exit codes: 0 ok, 1 usage, 2 runtime.
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./bf-shared');
var SANDBOX = require('./bf-peek-sandbox');

function fileNameForVariant(variant) {
  return variant + '-peek.js';
}

function variantFromFileName(name) {
  var m = /^(.+)-peek\.js$/.exec(S.path.basename(String(name)));
  return m ? m[1] : null;
}

function run(args) {
  var fromPath = args.from ? String(args.from) : null;
  var variant  = args.variant ? String(args.variant) : null;

  // Derive the missing half.
  if (fromPath && !variant) variant = variantFromFileName(fromPath);
  if (variant && !fromPath) fromPath = S.path.join('engine', fileNameForVariant(variant));
  if (!variant || !fromPath) {
    S.fail(1, 'ingest needs --variant <name> or --from <path> (or both)');
  }

  // Normalize to absolute path anchored at the project root, matching
  // the convention in tools/cli/commands-ingest.js#absFromPath.
  var absFromPath = S.path.isAbsolute(fromPath) ? fromPath : S.path.join(SANDBOX.ROOT, fromPath);
  if (!S.fs.existsSync(absFromPath)) {
    S.fail(2, 'ingest: file not found: ' + absFromPath);
  }
  var relFromRoot = S.path.relative(SANDBOX.ROOT, absFromPath);

  // Primary path: pull the BF-DATA block out of the source.
  var src = S.fs.readFileSync(absFromPath, 'utf8');
  var bf = SANDBOX.extractBfData(src);
  if (!bf.ok) {
    S.fail(2, 'ingest: ' + bf.error + ' in ' + relFromRoot +
             ' (Phase 3b will add a CSS-decode fallback for legacy peeks)');
  }
  var data = bf.data;

  // Normalize + validate via the shared BoxForge vm-sandbox.
  var sb = S.getBoxForgeSandbox();
  var vres = sb.validateProject(data);
  if (!vres || !vres.ok) {
    var errs = (vres && vres.errors) || ['unknown validation error'];
    S.fail(2, 'ingest: validation failed for BF-DATA in ' + relFromRoot + ':\n  - ' + errs.join('\n  - '));
  }

  // Harvest the PeekShell descriptor too, so the sidecar's
  // descriptor.variant / tileMatch stay consistent with the shipped
  // module's runtime registration. Non-fatal on failure.
  var shellCheck = { captured: null, error: null };
  try {
    var cap = SANDBOX.loadPeekModule(relFromRoot);
    if (cap.ok && cap.registrations.length) {
      var reg = cap.registrations[0];
      shellCheck.captured = {
        tileMatch: reg.tileMatch || null,
        showDelay: typeof reg.showDelay === 'number' ? reg.showDelay : null,
        viewportMode: reg.viewportMode || null,
        kindId: reg.kindId || null
      };
    } else if (!cap.ok) {
      shellCheck.error = cap.error;
    }
  } catch (e) {
    shellCheck.error = (e && e.message) || String(e);
  }

  // --print: stdout only, do not touch sidecar.
  if (args.print) {
    process.stdout.write(JSON.stringify({
      ok: true, action: 'ingest', variant: variant,
      source: relFromRoot, valid: true,
      shellCheck: shellCheck, data: data
    }, null, 2) + '\n');
    return;
  }

  // Safety: refuse to clobber without --overwrite, unless the existing
  // sidecar is byte-identical to what we'd write (a no-op round-trip).
  var targetPath = S.peekFilePath(variant);
  var existsAlready = S.fs.existsSync(targetPath);
  if (existsAlready && !args.overwrite) {
    var existing = S.fs.readFileSync(targetPath, 'utf8');
    var wouldBe = JSON.stringify(data, null, 2) + '\n';
    if (existing !== wouldBe) {
      S.fail(1, 'ingest: sidecar exists and differs at ' +
        S.path.relative(SANDBOX.ROOT, targetPath) +
        ' — pass --overwrite to replace (or --print / --dry-run to preview)');
    }
  }

  // Delegate the write to bf-shared so --dry-run suppression and
  // saveCallCount tracking flow through the dispatcher envelope.
  S.savePeekFile(variant, data);

  process.stdout.write(JSON.stringify({
    ok: true,
    action: 'ingest',
    variant: variant,
    source: relFromRoot,
    dryRun: !!S.isDryRun(),
    wrote: S.isDryRun() ? null : S.path.relative(SANDBOX.ROOT, targetPath),
    descriptor: data.descriptor || null,
    shellCheck: shellCheck,
    panes: (data.panes || []).length,
    glows: (data.glows || []).length
  }, null, 2) + '\n');
}

module.exports = {
  'ingest': run,
  // Helpers exported for the smoke harness:
  '_fileNameForVariant':   fileNameForVariant,
  '_variantFromFileName':  variantFromFileName
};
