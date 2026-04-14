// ═══════════════════════════════════════════════════════════════
//  bv-save-patcher.js — Direct file write (File System Access API)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-edit-state.js, bv-floor-data.js
//
//  Exposes globals:
//    ENGINE_DIR_HANDLE, FS_API_AVAILABLE, SAVE_PENDING
//    floorBlockoutFileName, formatGridLiteral, patchGridInSource,
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

  if (oldText == null) {
    showCopyToast('Could not read ' + fileName + ' — click "Pick engine/…" first');
    document.getElementById('btn-save-dir').style.display = 'inline-block';
    return;
  }

  var newText = patchGridInSource(oldText, currentFloor.grid);
  if (newText == null) {
    showCopyToast('Could not locate `var GRID = [...]` block in ' + fileName);
    return;
  }
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
