// ═══════════════════════════════════════════════════════════════
//  bv-save-patcher.js — Direct file write (File System Access API)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-edit-state.js, bv-floor-data.js
//
//  Exposes globals:
//    ENGINE_DIR_HANDLE, FS_API_AVAILABLE, SAVE_PENDING
//    floorBlockoutFileName, formatGridLiteral, patchGridInSource,
//    patchSpawnInSource, patchDoorTargetsInSource,
//    makeUnifiedDiff, renderDiffHTML, requestEngineDir, readFloorFileViaHandle,
//    prepareSaveCurrentFloor, closeSaveModal, confirmSaveWrite, downloadPendingSave
//
//  External refs: showCopyToast() [bv-clipboard-utils]
// ═══════════════════════════════════════════════════════════════
'use strict';

var ENGINE_DIR_HANDLE = null;   // cached FileSystemDirectoryHandle for engine/
var FS_API_AVAILABLE = (typeof window !== 'undefined' &&
                        typeof window.showDirectoryPicker === 'function');

function floorBlockoutFileName(floorId) {
  // Floor id "1.1.1" → "floor-blockout-1-1-1.js"
  return 'floor-blockout-' + String(floorId).replace(/\./g, '-') + '.js';
}

function formatGridLiteral(grid) {
  // Emit `var GRID = [ ... ];` body with each row on one line, 2-space indent,
  // trailing `// yNN` row labels so hand-editing remains readable.
  var pad2 = function(n){ return (n < 10 ? ' ' : '') + n; };
  var maxW = 0;
  for (var y = 0; y < grid.length; y++) maxW = Math.max(maxW, grid[y].length);
  var cellW = String(Math.max.apply(null, [0].concat(grid.flat ? grid.flat() : []))).length;
  if (!cellW) cellW = 1;
  var lines = ['  var GRID = ['];
  for (var y = 0; y < grid.length; y++) {
    var row = grid[y];
    var cells = [];
    for (var x = 0; x < row.length; x++) {
      var s = String(row[x]);
      cells.push(' '.repeat(Math.max(0, cellW - s.length)) + s);
    }
    var comma = (y < grid.length - 1) ? ',' : '';
    lines.push('    [' + cells.join(',') + ']' + comma + ' // y' + pad2(y));
  }
  lines.push('  ];');
  return lines.join('\n');
}

function patchGridInSource(source, grid) {
  // Replace the first `var GRID = [ ... ];` block (robust to whitespace, newlines, comments).
  var re = /(^|\n)([ \t]*var\s+GRID\s*=\s*\[)[\s\S]*?\n[ \t]*\];/;
  var m = source.match(re);
  if (!m) return null;
  var replacement = formatGridLiteral(grid);
  return source.replace(re, '\n' + replacement);
}

// ── Spawn patch ────────────────────────────────────────────────
// Rewrites `var SPAWN = { x: N, y: N, dir: N };` in-place. Returns
// the patched source or `source` unchanged if no SPAWN declaration
// is found — spawn rewriting is best-effort so hand-authored files
// without an explicit `var SPAWN` (rare) don't block the save.
function patchSpawnInSource(source, spawn) {
  if (!spawn) return source;
  var re = /var\s+SPAWN\s*=\s*\{[^{}]*\}\s*;/;
  if (!re.test(source)) return source;
  var x = spawn.x | 0;
  var y = spawn.y | 0;
  var dir = spawn.dir | 0;
  var replacement = 'var SPAWN = { x: ' + x + ', y: ' + y + ', dir: ' + dir + ' };';
  return source.replace(re, replacement);
}

// ── doorTargets patch ──────────────────────────────────────────
// Two authored styles are supported:
//   (1) Inline inside build()'s return:
//         doorTargets: {
//           '9,12': '2',
//           '9,2':  '2.2.1'
//         },
//   (2) Top-level scaffold variable:
//         var DOOR_TARGETS = { '9,12': '2' };
// Comments inside the braces are dropped on rewrite (acceptable —
// the map is data; hand-authored comments should move to the
// surrounding prose block).
function _sq(s) {
  // Single-quoted JS string literal (codebase convention in blockout files).
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function _formatDoorTargetsBody(doorTargets, itemIndent) {
  var keys = Object.keys(doorTargets || {}).sort(function(a, b) {
    // Stable-ish sort: by y then x then string
    var pa = a.split(','), pb = b.split(',');
    var ya = +pa[1], yb = +pb[1], xa = +pa[0], xb = +pb[0];
    if (ya !== yb) return ya - yb;
    if (xa !== xb) return xa - xb;
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  if (keys.length === 0) return null;  // signal: empty -> use {} literal
  var lines = [];
  // Pad key strings to common width so values line up.
  var maxKeyLen = 0;
  for (var i = 0; i < keys.length; i++) {
    maxKeyLen = Math.max(maxKeyLen, _sq(keys[i]).length);
  }
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var kStr = _sq(k);
    var pad = ' '.repeat(Math.max(0, maxKeyLen - kStr.length));
    var comma = (i < keys.length - 1) ? ',' : '';
    lines.push(itemIndent + kStr + pad + ': ' + _sq(doorTargets[k]) + comma);
  }
  return lines.join('\n');
}

function patchDoorTargetsInSource(source, doorTargets) {
  if (!doorTargets) return source;

  // (1) Inline inside build() return — `doorTargets: { ... }`
  var mInline = source.match(/([ \t]*)doorTargets\s*:\s*\{[^{}]*\}/);
  if (mInline) {
    var baseIndent = mInline[1] || '      ';
    var itemIndent = baseIndent + '  ';
    var body = _formatDoorTargetsBody(doorTargets, itemIndent);
    var lit;
    if (body == null) {
      lit = 'doorTargets: {}';
    } else {
      lit = 'doorTargets: {\n' + body + '\n' + baseIndent + '}';
    }
    return source.replace(/[ \t]*doorTargets\s*:\s*\{[^{}]*\}/, baseIndent + lit);
  }

  // (2) Scaffold top-level — `var DOOR_TARGETS = { ... };`
  var mVar = source.match(/var\s+DOOR_TARGETS\s*=\s*\{[^{}]*\}\s*;/);
  if (mVar) {
    var body2 = _formatDoorTargetsBody(doorTargets, '    ');
    var lit2;
    if (body2 == null) {
      lit2 = 'var DOOR_TARGETS = {};';
    } else {
      lit2 = 'var DOOR_TARGETS = {\n' + body2 + '\n  };';
    }
    return source.replace(/var\s+DOOR_TARGETS\s*=\s*\{[^{}]*\}\s*;/, lit2);
  }

  // No door-targets block found — return unchanged. Builder must
  // opt-in by adding the literal manually; the save patcher won't
  // inject a new block (that's a scaffold concern, not a patch).
  return source;
}

function makeUnifiedDiff(oldText, newText, contextLines) {
  contextLines = contextLines == null ? 3 : contextLines;
  var a = oldText.split('\n'), b = newText.split('\n');
  // Naive LCS-based diff — grids are small, this is fine.
  var n = a.length, m = b.length;
  var dp = [];
  for (var i = 0; i <= n; i++) {
    dp.push(new Int32Array(m + 1));
  }
  for (var i = n - 1; i >= 0; i--) {
    for (var j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i+1][j+1] + 1;
      else dp[i][j] = Math.max(dp[i+1][j], dp[i][j+1]);
    }
  }
  var ops = [];
  var i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({op:'=', line:a[i]}); i++; j++; }
    else if (dp[i+1][j] >= dp[i][j+1]) { ops.push({op:'-', line:a[i]}); i++; }
    else { ops.push({op:'+', line:b[j]}); j++; }
  }
  while (i < n) { ops.push({op:'-', line:a[i++]}); }
  while (j < m) { ops.push({op:'+', line:b[j++]}); }
  // Compress into hunks with `contextLines` of context around changes.
  var hunks = [];
  var k = 0;
  while (k < ops.length) {
    if (ops[k].op === '=') { k++; continue; }
    var start = Math.max(0, k - contextLines);
    var end = k;
    while (end < ops.length && (ops[end].op !== '=' || end - k < contextLines * 2)) {
      if (ops[end].op !== '=') k = end;
      end++;
    }
    end = Math.min(ops.length, k + contextLines + 1);
    hunks.push(ops.slice(start, end));
    k = end;
  }
  return hunks;
}

function renderDiffHTML(hunks, fileName) {
  if (hunks.length === 0) return '<span class="diff-meta">No changes to write.</span>';
  var esc = function(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var out = ['<span class="diff-meta">--- a/' + esc(fileName) + '</span>',
             '<span class="diff-meta">+++ b/' + esc(fileName) + '</span>'];
  for (var h = 0; h < hunks.length; h++) {
    out.push('<span class="diff-hunk">@@ hunk ' + (h+1) + ' @@</span>');
    var ops = hunks[h];
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      var prefix = o.op === '+' ? '+' : o.op === '-' ? '-' : ' ';
      var cls = o.op === '+' ? 'diff-add' : o.op === '-' ? 'diff-del' : '';
      var ln = esc(prefix + o.line);
      out.push(cls ? '<span class="' + cls + '">' + ln + '</span>' : ln);
    }
  }
  return out.join('\n');
}

// — State held by the save modal while the user confirms the diff.
var SAVE_PENDING = null;   // {fileName, oldText, newText, fileHandle}

async function requestEngineDir() {
  if (!FS_API_AVAILABLE) {
    showCopyToast('Direct write not supported — use Download fallback');
    return null;
  }
  try {
    var handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    ENGINE_DIR_HANDLE = handle;
    document.getElementById('btn-save-dir').style.display = 'none';
    showCopyToast('Linked to "' + handle.name + '/" — direct writes enabled');
    return handle;
  } catch (err) {
    if (err && err.name === 'AbortError') return null;
    console.warn('Directory pick failed:', err);
    showCopyToast('Directory pick cancelled or denied');
    return null;
  }
}

async function readFloorFileViaHandle(floorId) {
  if (!ENGINE_DIR_HANDLE) return null;
  var name = floorBlockoutFileName(floorId);
  try {
    var fh = await ENGINE_DIR_HANDLE.getFileHandle(name);
    var f = await fh.getFile();
    return { fileName: name, fileHandle: fh, text: await f.text() };
  } catch (err) {
    console.warn('[save] read failed for', name, err);
    return null;
  }
}


// ── Pass 5a: scaffold new floor-blockout-<id>.js ───────────────
// Called when prepareSaveCurrentFloor() can't find an existing
// engine file for the current floor — e.g. a floor created via
// bv-bo-floor.createFloor or via the CLI's create-floor command.
// Generates a full IIFE from the in-memory FLOORS entry, matching
// the convention used by the hand-authored floor-blockout-*.js
// files (var W/H, var GRID labeled rows, var SPAWN, build()
// returning {grid,rooms,doors,doorTargets,gridW,gridH,biome,
// shops,entities}, trailing FloorManager.registerFloorBuilder).
function scaffoldFloorBlockoutSource(floorId, floor) {
  if (!floor || !floor.grid || !floor.grid.length) return null;
  var W = floor.grid[0].length;
  var H = floor.grid.length;
  var gridLiteral = formatGridLiteral(floor.grid);
  var spawn = floor.spawn || { x: W>>1, y: H>>1, dir: 0 };
  var biome = floor.biome || '';
  var doorTargets = floor.doorTargets || {};
  var entities = Array.isArray(floor.entities) ? floor.entities : [];
  var rooms = Array.isArray(floor.rooms) ? floor.rooms : [];
  var shops = Array.isArray(floor.shops) ? floor.shops : [];

  var depth = String(floorId).split('.').length;
  var depthLabel = depth === 1 ? 'exterior'
                 : depth === 2 ? 'interior'
                 : 'nested dungeon';

  var lines = [];
  lines.push('/**');
  lines.push(' * Floor Blockout ' + floorId + (biome ? ' — ' + biome : '') + ' (depth ' + depth + ', ' + depthLabel + ')');
  lines.push(' *');
  lines.push(' * Scaffolded by tools/js/bv-save-patcher.js (Pass 5a).');
  lines.push(' * Edit freely — the grid block is patched in-place on future saves.');
  lines.push(' */');
  lines.push('(function () {');
  lines.push("  'use strict';");
  lines.push('');
  lines.push('  var W = ' + W + ';');
  lines.push('  var H = ' + H + ';');
  lines.push('');
  lines.push('  // prettier-ignore');
  lines.push(gridLiteral);
  lines.push('');
  lines.push('  var SPAWN = { x: ' + (spawn.x|0) + ', y: ' + (spawn.y|0) + ', dir: ' + (spawn.dir|0) + ' };');
  lines.push('');
  lines.push('  var ROOMS = ' + JSON.stringify(rooms) + ';');
  lines.push('  var DOOR_TARGETS = ' + JSON.stringify(doorTargets) + ';');
  lines.push('  var SHOPS = ' + JSON.stringify(shops) + ';');
  lines.push('  var ENTITIES = ' + JSON.stringify(entities) + ';');
  lines.push('');
  lines.push('  function build() {');
  lines.push('    var grid = [];');
  lines.push('    for (var y = 0; y < H; y++) grid[y] = GRID[y].slice();');
  lines.push('    return {');
  lines.push('      grid: grid,');
  lines.push('      rooms: ROOMS.slice(),');
  lines.push('      doors: {},');
  lines.push('      doorTargets: JSON.parse(JSON.stringify(DOOR_TARGETS)),');
  lines.push('      gridW: W, gridH: H,');
  lines.push('      spawn: { x: SPAWN.x, y: SPAWN.y, dir: SPAWN.dir },');
  lines.push("      biome: '" + biome.replace(/'/g, "\\'") + "',");
  lines.push('      shops: SHOPS.slice(),');
  lines.push('      entities: ENTITIES.slice()');
  lines.push('    };');
  lines.push('  }');
  lines.push('');
  lines.push("  FloorManager.registerFloorBuilder('" + floorId + "', build);");
  lines.push('})();');
  lines.push('');
  return lines.join('\n');
}

async function prepareSaveCurrentFloor() {
  if (!currentFloor || !currentFloorId) return;
  var fileName = floorBlockoutFileName(currentFloorId);
  var oldText = null, fileHandle = null;

  if (FS_API_AVAILABLE && ENGINE_DIR_HANDLE) {
    var read = await readFloorFileViaHandle(currentFloorId);
    if (read) { oldText = read.text; fileHandle = read.fileHandle; }
  }

  if (oldText == null) {
    // Fallback: fetch the file via its relative URL (works on both file:// and http(s)).
    try {
      var resp = await fetch('../engine/' + fileName);
      if (resp.ok) oldText = await resp.text();
    } catch (err) { /* fall through */ }
  }

  var isScaffold = false;
  if (oldText == null) {
    // Pass 5a: floor has no engine file yet (CLI- or browser-created).
    // Scaffold a complete floor-blockout-<id>.js from current state
    // and route through the normal save-modal diff/confirm flow.
    var scaffolded = scaffoldFloorBlockoutSource(currentFloorId, currentFloor);
    if (scaffolded == null) {
      showCopyToast('Cannot scaffold ' + fileName + ' — floor has no grid');
      return;
    }
    oldText = '';   // empty "before" → diff shows entire new file
    var hunksS = makeUnifiedDiff(oldText, scaffolded, 3);
    document.getElementById('save-diff').innerHTML = renderDiffHTML(hunksS, fileName);
    SAVE_PENDING = {
      fileName: fileName, oldText: oldText, newText: scaffolded,
      fileHandle: null, isScaffold: true
    };
    document.getElementById('save-modal').classList.add('open');
    return;
  }

  var newText = patchGridInSource(oldText, currentFloor.grid);
  if (newText == null) {
    showCopyToast('Could not locate `var GRID = [...]` block in ' + fileName);
    return;
  }
  // Chain metadata patches — each returns `source` unchanged if the
  // target block isn't present, so hand-authored files without
  // SPAWN / doorTargets continue to work.
  newText = patchSpawnInSource(newText, currentFloor.spawn);
  newText = patchDoorTargetsInSource(newText, currentFloor.doorTargets);

  if (newText === oldText) {
    showCopyToast('No changes to write — ' + fileName + ' is already up-to-date');
    return;
  }

  var hunks = makeUnifiedDiff(oldText, newText, 3);
  document.getElementById('save-diff').innerHTML = renderDiffHTML(hunks, fileName);
  SAVE_PENDING = { fileName: fileName, oldText: oldText, newText: newText, fileHandle: fileHandle };
  document.getElementById('save-modal').classList.add('open');
}

function closeSaveModal() {
  document.getElementById('save-modal').classList.remove('open');
  SAVE_PENDING = null;
}

async function confirmSaveWrite() {
  if (!SAVE_PENDING) return;
  var p = SAVE_PENDING;
  // Pass 5a: new-floor scaffold — acquire a create-handle if we have
  // the engine directory picker handle cached.
  if (!p.fileHandle && p.isScaffold && ENGINE_DIR_HANDLE) {
    try {
      p.fileHandle = await ENGINE_DIR_HANDLE.getFileHandle(p.fileName, { create: true });
    } catch (e) {
      console.warn('[save] create handle failed:', e);
    }
  }
  if (p.fileHandle) {
    try {
      var writable = await p.fileHandle.createWritable();
      await writable.write(p.newText);
      await writable.close();
      showCopyToast('Wrote ' + p.fileName);
      // Re-baseline originalGrid so the dirty counter resets without losing undo history.
      EDIT.originalGrid = snapshotGrid(currentFloor.grid);
      updateEditUI();
      closeSaveModal();
      return;
    } catch (err) {
      console.warn('[save] write failed:', err);
      showCopyToast('Write failed — falling back to download');
    }
  }
  downloadPendingSave();
}

function downloadPendingSave() {
  if (!SAVE_PENDING) return;
  var p = SAVE_PENDING;
  var blob = new Blob([p.newText], { type: 'text/javascript' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = p.fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  showCopyToast('Downloaded ' + p.fileName + ' — drop into engine/');
  EDIT.originalGrid = snapshotGrid(currentFloor.grid);
  updateEditUI();
  closeSaveModal();
}
