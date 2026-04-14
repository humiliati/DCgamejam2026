// ═══════════════════════════════════════════════════════════════
//  bv-clipboard-utils.js — OS clipboard export (full grid / diff)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-edit-state.js, bv-floor-data.js, bv-lasso.js
//
//  Exposes globals:
//    gridToJSArray, gridToDiffArray, copyToClipboard, showCopyToast,
//    doCopyFull, doCopyDiff
//
//  External refs: FLOOR_NAMES [bv-floor-selection], countDirty [bv-edit-state],
//                 lassoCommit [bv-lasso]
// ═══════════════════════════════════════════════════════════════
'use strict';

function gridToJSArray(grid) {
  var lines = [];
  for (var y = 0; y < grid.length; y++) {
    var row = grid[y];
    lines.push('    [' + row.join(',') + ']' + (y < grid.length - 1 ? ',' : '') + ' //' + String(y).padStart(2));
  }
  return lines.join('\n');
}

function gridToDiffArray(currentGrid, originalGrid) {
  var lines = [];
  var PH = '..';
  var maxH = Math.max(currentGrid.length, originalGrid.length);
  for (var y = 0; y < currentGrid.length; y++) {
    var cur = currentGrid[y];
    var orig = originalGrid[y];
    if (!orig) {
      // Entirely new row
      lines.push('    [' + cur.join(',') + '], //' + String(y).padStart(2) + '  (NEW ROW)');
      continue;
    }
    var cells = [];
    var rowChanges = 0;
    var maxW = Math.max(cur.length, orig.length);
    for (var x = 0; x < cur.length; x++) {
      if (x >= orig.length || cur[x] !== orig[x]) {
        cells.push(String(cur[x]));
        rowChanges++;
      } else {
        cells.push(PH);
      }
    }
    if (rowChanges > 0) {
      lines.push('    [' + cells.join(',') + '], //' + String(y).padStart(2) + '  (' + rowChanges + ' changed)');
    } else {
      lines.push('    // row ' + y + ' \u2014 unchanged');
    }
  }
  return lines.join('\n');
}

function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text).then(function() {
    showCopyToast(label + ' copied');
  }).catch(function() {
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showCopyToast(label + ' copied');
  });
}

function showCopyToast(msg) {
  var el = document.getElementById('copy-toast');
  el.textContent = msg; el.style.display = 'block';
  setTimeout(function() { el.style.display = 'none'; }, 1200);
}

function doCopyFull() {
  if (!currentFloor) return;
  // Commit any floating lasso first
  if (LASSO.floating) lassoCommit();
  var gw = currentFloor.grid[0] ? currentFloor.grid[0].length : 0;
  var gh = currentFloor.grid.length;
  var header = '// Floor "' + currentFloorId + '" \u2014 ' + (FLOOR_NAMES[currentFloorId] || '') +
               ' (' + gw + 'x' + gh + ')\n';
  copyToClipboard(header + gridToJSArray(currentFloor.grid), 'Full grid');
}

function doCopyDiff() {
  if (!currentFloor || !EDIT.originalGrid) return;
  if (LASSO.floating) lassoCommit();
  var dc = countDirty();
  if (dc === 0) { showCopyToast('No changes to copy'); return; }
  var header = '// Floor "' + currentFloorId + '" DIFF \u2014 ' + dc + ' cells changed\n' +
               '// ".." = unchanged, numbers = new value\n';
  copyToClipboard(header + gridToDiffArray(currentFloor.grid, EDIT.originalGrid), 'Diff (' + dc + ' cells)');
}
