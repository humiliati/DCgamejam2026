// ═══════════════════════════════════════════════════════════════
//  bv-stamp-library.js — Persistent named stamp library
//  Added Pass 0.2 (post-extraction feature #4)
//
//  Captures the current CLIPBOARD as a named, persisted stamp that
//  can be re-loaded into the clipboard later. Stamps survive page
//  reloads via localStorage.
//
//  Depends on: bv-clipboard.js (CLIPBOARD), bv-tile-schema.js
//              (TILE_SCHEMA), bv-edit-state.js (EDIT), bv-toolbar.js
//              (selectTool — wired via callback because toolbar
//              loads AFTER this file; fall back to direct EDIT.tool
//              mutation if not present yet).
//
//  Exposes globals:
//    STAMP_LIB — public API
//
//  UI: a "★ Stamps" toolbar button is injected next to Copy at
//  DOMContentLoaded; clicking it toggles a floating panel pinned to
//  the right edge.
// ═══════════════════════════════════════════════════════════════
'use strict';

var STAMP_LIB = (function() {
  var KEY = 'bv.stamps.v1';
  var _stamps = [];   // [{id, name, w, h, tiles, sourceFloorName, created}]
  var _panelEl = null;
  var _visible = false;

  function _load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (Array.isArray(data)) _stamps = data;
    } catch (e) { console.warn('[stamps] load failed', e); _stamps = []; }
  }
  function _save() {
    try { localStorage.setItem(KEY, JSON.stringify(_stamps)); }
    catch (e) { console.warn('[stamps] save failed', e); }
  }
  function _newId() {
    return 's' + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36);
  }

  function list() { return _stamps.slice(); }

  function captureFromClipboard() {
    if (!CLIPBOARD.tiles || !CLIPBOARD.w || !CLIPBOARD.h) {
      alert('Clipboard is empty. Copy a selection first (Lasso → Ctrl+C).');
      return null;
    }
    var suggested = CLIPBOARD.w + 'x' + CLIPBOARD.h +
      (CLIPBOARD.sourceFloorId ? ' @' + CLIPBOARD.sourceFloorId : '');
    var name = prompt('Stamp name:', suggested);
    if (name === null) return null;               // cancelled
    name = (name || '').trim() || suggested;
    var stamp = {
      id: _newId(),
      name: name,
      w: CLIPBOARD.w,
      h: CLIPBOARD.h,
      // Deep-copy so later clipboard mutations don't poison the stamp.
      tiles: CLIPBOARD.tiles.map(function(row) { return row.slice(); }),
      sourceFloorId: CLIPBOARD.sourceFloorId || null,
      sourceFloorName: CLIPBOARD.sourceFloorName || null,
      created: Date.now()
    };
    _stamps.unshift(stamp);   // newest first
    _save();
    if (_visible) renderPanel();
    return stamp;
  }

  function remove(id) {
    var i = _stamps.findIndex(function(s) { return s.id === id; });
    if (i < 0) return false;
    _stamps.splice(i, 1);
    _save();
    if (_visible) renderPanel();
    return true;
  }

  function rename(id, newName) {
    var s = _stamps.find(function(x) { return x.id === id; });
    if (!s) return false;
    s.name = (newName || '').trim() || s.name;
    _save();
    if (_visible) renderPanel();
    return true;
  }

  function loadToClipboard(id) {
    var s = _stamps.find(function(x) { return x.id === id; });
    if (!s) return false;
    CLIPBOARD.tiles = s.tiles.map(function(r) { return r.slice(); });
    CLIPBOARD.w = s.w;
    CLIPBOARD.h = s.h;
    CLIPBOARD.source = 'stamp';
    CLIPBOARD.sourceFloorId = s.sourceFloorId;
    CLIPBOARD.sourceFloorName = s.sourceFloorName;
    if (typeof updateClipboardBadge === 'function') updateClipboardBadge();
    // Auto-switch to paste tool if we're in edit mode so the hover
    // ghost appears immediately. Fall back to a direct EDIT.tool
    // mutation if selectTool isn't wired yet (load order).
    if (typeof EDIT !== 'undefined' && EDIT.active) {
      if (typeof selectTool === 'function') selectTool('paste');
      else { EDIT.tool = 'paste'; if (typeof updateEditUI === 'function') updateEditUI(); }
    }
    if (typeof draw === 'function') draw();
    return true;
  }

  // ── UI ──
  function _drawThumb(canvas, stamp) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    var cell = Math.max(1, Math.floor(Math.min(W / stamp.w, H / stamp.h)));
    var offX = Math.floor((W - cell * stamp.w) / 2);
    var offY = Math.floor((H - cell * stamp.h) / 2);
    for (var y = 0; y < stamp.h; y++) {
      for (var x = 0; x < stamp.w; x++) {
        var t = stamp.tiles[y][x];
        var schema = (typeof TILE_SCHEMA !== 'undefined') ? TILE_SCHEMA[t] : null;
        ctx.fillStyle = schema ? schema.color : '#ff00ff';
        ctx.fillRect(offX + x * cell, offY + y * cell, cell, cell);
      }
    }
  }

  function _ensurePanel() {
    if (_panelEl) return _panelEl;
    var el = document.createElement('div');
    el.id = 'stamp-panel';
    el.style.cssText = [
      'position:fixed', 'top:80px', 'right:8px', 'width:260px',
      'max-height:70vh', 'overflow-y:auto', 'background:#1a1a1a',
      'border:1px solid #444', 'border-radius:6px', 'padding:8px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.5)', 'z-index:500',
      'color:#ddd', 'font:12px Consolas,monospace', 'display:none'
    ].join(';');
    document.body.appendChild(el);
    _panelEl = el;
    return el;
  }

  function renderPanel() {
    var el = _ensurePanel();
    el.innerHTML = '';

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
    header.innerHTML = '<strong style="color:#e8c547">★ Stamp Library</strong>';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.title = 'Close panel';
    closeBtn.style.cssText = 'background:#333;color:#ccc;border:1px solid #555;border-radius:3px;padding:1px 8px;cursor:pointer;';
    closeBtn.addEventListener('click', hidePanel);
    header.appendChild(closeBtn);
    el.appendChild(header);

    var capBtn = document.createElement('button');
    capBtn.textContent = '★ Save clipboard as stamp';
    capBtn.title = 'Capture the current clipboard as a named, persisted stamp';
    capBtn.style.cssText = 'display:block;width:100%;margin-bottom:8px;padding:6px;background:#2a4a6a;color:#cfe;border:1px solid #4a6a8a;border-radius:3px;cursor:pointer;';
    capBtn.addEventListener('click', captureFromClipboard);
    el.appendChild(capBtn);

    if (!_stamps.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'color:#777;font-style:italic;text-align:center;padding:12px;';
      empty.textContent = 'No stamps yet. Copy a lasso selection, then click Save above.';
      el.appendChild(empty);
      return;
    }

    _stamps.forEach(function(stamp) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:4px;border:1px solid #333;border-radius:3px;margin-bottom:4px;background:#222;';

      var thumb = document.createElement('canvas');
      thumb.width = 40; thumb.height = 40;
      thumb.style.cssText = 'border:1px solid #444;flex:0 0 auto;cursor:pointer;';
      thumb.title = 'Load into clipboard + paste tool';
      thumb.addEventListener('click', function() { loadToClipboard(stamp.id); });
      _drawThumb(thumb, stamp);
      row.appendChild(thumb);

      var mid = document.createElement('div');
      mid.style.cssText = 'flex:1 1 auto;min-width:0;';
      var name = document.createElement('div');
      name.textContent = stamp.name;
      name.style.cssText = 'color:#eee;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      name.title = stamp.name + ' — double-click to rename';
      name.addEventListener('dblclick', function() {
        var n = prompt('Rename stamp:', stamp.name);
        if (n !== null) rename(stamp.id, n);
      });
      var meta = document.createElement('div');
      meta.style.cssText = 'color:#888;font-size:10px;';
      meta.textContent = stamp.w + '×' + stamp.h +
        (stamp.sourceFloorId ? ' · ' + stamp.sourceFloorId : '');
      mid.appendChild(name);
      mid.appendChild(meta);
      row.appendChild(mid);

      var actions = document.createElement('div');
      actions.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:0 0 auto;';
      var applyBtn = document.createElement('button');
      applyBtn.textContent = 'Apply';
      applyBtn.title = 'Load into clipboard and switch to paste tool';
      applyBtn.style.cssText = 'font-size:10px;padding:2px 6px;background:#2a4a2a;color:#cfc;border:1px solid #4a6a4a;border-radius:2px;cursor:pointer;';
      applyBtn.addEventListener('click', function() { loadToClipboard(stamp.id); });
      var delBtn = document.createElement('button');
      delBtn.textContent = 'Del';
      delBtn.title = 'Delete this stamp';
      delBtn.style.cssText = 'font-size:10px;padding:2px 6px;background:#4a2a2a;color:#fcc;border:1px solid #6a4a4a;border-radius:2px;cursor:pointer;';
      delBtn.addEventListener('click', function() {
        if (confirm('Delete stamp "' + stamp.name + '"?')) remove(stamp.id);
      });
      actions.appendChild(applyBtn);
      actions.appendChild(delBtn);
      row.appendChild(actions);

      el.appendChild(row);
    });
  }

  function showPanel() { _visible = true; _ensurePanel().style.display = 'block'; renderPanel(); _syncBtn(); }
  function hidePanel() { _visible = false; if (_panelEl) _panelEl.style.display = 'none'; _syncBtn(); }
  function togglePanel() { if (_visible) hidePanel(); else showPanel(); }

  function _syncBtn() {
    var b = document.getElementById('btn-stamps');
    if (b) b.classList.toggle('tool-active', _visible);
  }

  function _injectButton() {
    // Insert a "★ Stamps" toolbar button next to btn-copy.
    var anchor = document.getElementById('btn-copy');
    if (!anchor || document.getElementById('btn-stamps')) return;
    var b = document.createElement('button');
    b.id = 'btn-stamps';
    b.textContent = '★ Stamps';
    b.title = 'Open the stamp library (save & re-apply clipboard templates)';
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
    b.addEventListener('click', togglePanel);
  }

  function _init() {
    _load();
    _injectButton();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  return {
    list: list,
    captureFromClipboard: captureFromClipboard,
    loadToClipboard: loadToClipboard,
    remove: remove,
    rename: rename,
    showPanel: showPanel,
    hidePanel: hidePanel,
    togglePanel: togglePanel,
    renderPanel: renderPanel
  };
})();
