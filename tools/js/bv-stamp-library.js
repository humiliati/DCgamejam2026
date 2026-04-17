// ═══════════════════════════════════════════════════════════════
//  bv-stamp-library.js — Persistent named stamp library
//  Added Pass 0.2 (post-extraction feature #4)
//  Enhanced: categories, built-in stamps, category filter (April 2026)
//
//  Captures the current CLIPBOARD as a named, persisted stamp that
//  can be re-loaded into the clipboard later. Stamps survive page
//  reloads via localStorage.  Built-in stamps are loaded from
//  stamps.json (merged at init, never overwritten by user saves).
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
//  the right edge.  Panel has category filter pills at top.
// ═══════════════════════════════════════════════════════════════
'use strict';

var STAMP_LIB = (function() {
  var KEY = 'bv.stamps.v1';
  var _userStamps = [];   // [{id, name, w, h, tiles, category, sourceFloorName, created}]
  var _builtinStamps = []; // loaded from stamps.json — never saved to localStorage
  var _panelEl = null;
  var _visible = false;
  var _activeCategory = null; // null = show all

  // ── Category config ──
  var CATEGORIES = [
    { id: 'sprint',   label: 'Sprint',   color: '#f84' },
    { id: 'room',     label: 'Room',     color: '#8cf' },
    { id: 'corridor', label: 'Corridor', color: '#af8' },
    { id: 'wall',     label: 'Wall',     color: '#da8' },
    { id: 'lighting', label: 'Light',    color: '#fe8' },
    { id: 'user',     label: 'My Stamps', color: '#ccc' }
  ];

  // ── Load / save ──
  function _loadUser() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (Array.isArray(data)) _userStamps = data;
    } catch (e) { console.warn('[stamps] load failed', e); _userStamps = []; }
  }
  function _save() {
    try { localStorage.setItem(KEY, JSON.stringify(_userStamps)); }
    catch (e) { console.warn('[stamps] save failed', e); }
  }
  function _newId() {
    return 's' + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36);
  }

  // ── Built-in stamp loader ──
  function _loadBuiltins() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'stamps.json', false); // sync — runs at init before UI
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) {
        var data = JSON.parse(xhr.responseText);
        // stamps.json is {key: {w, h, cells, category, builtin, meta}}
        for (var key in data) {
          if (key.charAt(0) === '_') continue; // skip _comment etc.
          var raw = data[key];
          if (!raw || !raw.cells || !raw.w) continue;
          _builtinStamps.push({
            id: 'builtin:' + key,
            name: key.replace(/_/g, ' '),
            w: raw.w,
            h: raw.h,
            tiles: raw.cells,
            category: raw.category || 'room',
            builtin: true,
            sourceFloorId: (raw.meta && raw.meta.sourceFloor) || null,
            sourceFloorName: null,
            description: (raw.meta && raw.meta.origin) || '',
            created: 0
          });
        }
      }
    } catch (e) {
      console.warn('[stamps] failed to load stamps.json:', e);
    }
  }

  // ── Combined list ──
  function _allStamps() {
    // User stamps first, then built-ins
    return _userStamps.concat(_builtinStamps);
  }
  function _filteredStamps() {
    var all = _allStamps();
    if (!_activeCategory) return all;
    if (_activeCategory === 'user') {
      return all.filter(function(s) { return !s.builtin; });
    }
    return all.filter(function(s) {
      return s.category === _activeCategory;
    });
  }

  function list() { return _allStamps(); }

  function captureFromClipboard(categoryOverride) {
    if (!CLIPBOARD.tiles || !CLIPBOARD.w || !CLIPBOARD.h) {
      alert('Clipboard is empty. Copy a selection first (Lasso \u2192 Ctrl+C).');
      return null;
    }
    var suggested = CLIPBOARD.w + 'x' + CLIPBOARD.h +
      (CLIPBOARD.sourceFloorId ? ' @' + CLIPBOARD.sourceFloorId : '');
    var name = prompt('Stamp name:', suggested);
    if (name === null) return null;
    name = (name || '').trim() || suggested;

    var category = categoryOverride || 'user';
    var stamp = {
      id: _newId(),
      name: name,
      w: CLIPBOARD.w,
      h: CLIPBOARD.h,
      tiles: CLIPBOARD.tiles.map(function(row) { return row.slice(); }),
      category: category,
      builtin: false,
      sourceFloorId: CLIPBOARD.sourceFloorId || null,
      sourceFloorName: CLIPBOARD.sourceFloorName || null,
      created: Date.now()
    };
    _userStamps.unshift(stamp);
    _save();
    if (_visible) renderPanel();
    return stamp;
  }

  function remove(id) {
    // Cannot remove built-in stamps
    if (typeof id === 'string' && id.indexOf('builtin:') === 0) return false;
    var i = _userStamps.findIndex(function(s) { return s.id === id; });
    if (i < 0) return false;
    _userStamps.splice(i, 1);
    _save();
    if (_visible) renderPanel();
    return true;
  }

  function rename(id, newName) {
    if (typeof id === 'string' && id.indexOf('builtin:') === 0) return false;
    var s = _userStamps.find(function(x) { return x.id === id; });
    if (!s) return false;
    s.name = (newName || '').trim() || s.name;
    _save();
    if (_visible) renderPanel();
    return true;
  }

  function loadToClipboard(id) {
    var all = _allStamps();
    var s = all.find(function(x) { return x.id === id; });
    if (!s) return false;
    CLIPBOARD.tiles = s.tiles.map(function(r) { return r.slice(); });
    CLIPBOARD.w = s.w;
    CLIPBOARD.h = s.h;
    CLIPBOARD.source = 'stamp';
    CLIPBOARD.sourceFloorId = s.sourceFloorId;
    CLIPBOARD.sourceFloorName = s.sourceFloorName;
    if (typeof updateClipboardBadge === 'function') updateClipboardBadge();
    if (typeof EDIT !== 'undefined' && EDIT.active) {
      if (typeof selectTool === 'function') selectTool('paste');
      else { EDIT.tool = 'paste'; if (typeof updateEditUI === 'function') updateEditUI(); }
    }
    if (typeof draw === 'function') draw();
    return true;
  }

  // ── UI: thumbnail ──
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

  // ── UI: panel ──
  function _ensurePanel() {
    if (_panelEl) return _panelEl;
    var el = document.createElement('div');
    el.id = 'stamp-panel';
    el.style.cssText = [
      'position:fixed', 'top:80px', 'right:8px', 'width:280px',
      'max-height:75vh', 'overflow-y:auto', 'background:#1a1a1a',
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

    // ── Header ──
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
    header.innerHTML = '<strong style="color:#e8c547">\u2605 Stamp Library</strong>';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Close panel';
    closeBtn.style.cssText = 'background:#333;color:#ccc;border:1px solid #555;border-radius:3px;padding:1px 8px;cursor:pointer;';
    closeBtn.addEventListener('click', hidePanel);
    header.appendChild(closeBtn);
    el.appendChild(header);

    // ── Category filter pills ──
    var pillRow = document.createElement('div');
    pillRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px;';
    // "All" pill
    var allPill = document.createElement('button');
    allPill.textContent = 'All';
    allPill.style.cssText = _pillStyle(!_activeCategory ? '#e8c547' : '#555', !_activeCategory);
    allPill.addEventListener('click', function() { _activeCategory = null; renderPanel(); });
    pillRow.appendChild(allPill);
    // Category pills
    CATEGORIES.forEach(function(cat) {
      var pill = document.createElement('button');
      pill.textContent = cat.label;
      var isActive = _activeCategory === cat.id;
      pill.style.cssText = _pillStyle(isActive ? cat.color : '#555', isActive);
      pill.addEventListener('click', function() {
        _activeCategory = (_activeCategory === cat.id) ? null : cat.id;
        renderPanel();
      });
      pillRow.appendChild(pill);
    });
    el.appendChild(pillRow);

    // ── Capture button ──
    var capBtn = document.createElement('button');
    capBtn.textContent = '\u2605 Save clipboard as stamp';
    capBtn.title = 'Capture the current clipboard as a named, persisted stamp';
    capBtn.style.cssText = 'display:block;width:100%;margin-bottom:8px;padding:6px;background:#2a4a6a;color:#cfe;border:1px solid #4a6a8a;border-radius:3px;cursor:pointer;font:inherit;';
    capBtn.addEventListener('click', function() { captureFromClipboard(); });
    el.appendChild(capBtn);

    // ── Stamp list ──
    var stamps = _filteredStamps();
    if (!stamps.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'color:#777;font-style:italic;text-align:center;padding:12px;';
      if (_activeCategory) {
        empty.textContent = 'No stamps in this category.';
      } else {
        empty.textContent = 'No stamps yet. Copy a lasso selection, then click Save above.';
      }
      el.appendChild(empty);
      return;
    }

    // Thumbnail grid: 3 across for compact view
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;';

    stamps.forEach(function(stamp) {
      var card = document.createElement('div');
      var borderColor = '#333';
      if (stamp.builtin) {
        var catDef = CATEGORIES.find(function(c) { return c.id === stamp.category; });
        if (catDef) borderColor = catDef.color;
      }
      card.style.cssText = 'background:#222;border:1px solid ' + borderColor + ';border-radius:4px;padding:3px;cursor:pointer;text-align:center;';

      var thumb = document.createElement('canvas');
      thumb.width = 72; thumb.height = 56;
      thumb.style.cssText = 'display:block;margin:0 auto 2px;border-radius:2px;';
      _drawThumb(thumb, stamp);
      card.appendChild(thumb);

      var label = document.createElement('div');
      label.style.cssText = 'font-size:9px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;';
      label.textContent = stamp.name;
      label.title = stamp.name + ' (' + stamp.w + '\u00d7' + stamp.h + ')' +
        (stamp.description ? '\n' + stamp.description : '');
      card.appendChild(label);

      var dims = document.createElement('div');
      dims.style.cssText = 'font-size:8px;color:#888;line-height:1.2;';
      dims.textContent = stamp.w + '\u00d7' + stamp.h;
      if (stamp.builtin) {
        var tag = document.createElement('span');
        tag.textContent = ' \u2605';
        tag.style.color = borderColor;
        dims.appendChild(tag);
      }
      card.appendChild(dims);

      // Click = load into clipboard
      card.addEventListener('click', function() { loadToClipboard(stamp.id); });

      // Right-click menu for user stamps
      if (!stamp.builtin) {
        card.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          var action = prompt('Action for "' + stamp.name + '":\n  rename = enter new name\n  delete = type "delete"', '');
          if (action === null) return;
          if (action.toLowerCase() === 'delete') {
            if (confirm('Delete stamp "' + stamp.name + '"?')) remove(stamp.id);
          } else if (action.trim()) {
            rename(stamp.id, action.trim());
          }
        });
      }

      grid.appendChild(card);
    });

    el.appendChild(grid);
  }

  function _pillStyle(color, active) {
    return 'font:10px Consolas,monospace;padding:2px 7px;border-radius:10px;cursor:pointer;' +
      'border:1px solid ' + color + ';' +
      'background:' + (active ? color : 'transparent') + ';' +
      'color:' + (active ? '#111' : color) + ';';
  }

  function showPanel() { _visible = true; _ensurePanel().style.display = 'block'; renderPanel(); _syncBtn(); }
  function hidePanel() { _visible = false; if (_panelEl) _panelEl.style.display = 'none'; _syncBtn(); }
  function togglePanel() { if (_visible) hidePanel(); else showPanel(); }

  function _syncBtn() {
    var b = document.getElementById('btn-stamps');
    if (b) b.classList.toggle('tool-active', _visible);
  }

  function _injectButton() {
    var anchor = document.getElementById('btn-copy');
    if (!anchor || document.getElementById('btn-stamps')) return;
    var b = document.createElement('button');
    b.id = 'btn-stamps';
    b.textContent = '\u2605 Stamps';
    b.title = 'Open the stamp library (save & re-apply clipboard templates)';
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
    b.addEventListener('click', togglePanel);
  }

  function _init() {
    _loadBuiltins();
    _loadUser();
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
