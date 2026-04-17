// ═══════════════════════════════════════════════════════════════
//  bv-tile-picker.js — Tile palette (all tiles, grouped by category)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//  Enhanced: search filter + recently-used row (April 2026)
//
//  Depends on: bv-tile-schema.js (TILE_SCHEMA, CAT_ORDER, CAT_LABELS),
//              bv-edit-state.js (EDIT, updateEditUI)
//
//  Exposes globals:
//    buildTilePicker()
//    tilePickerTrackRecent(tileId) — call after painting to track MRU
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Recently-used tile tracking ───────────────────────────────
var _TP_RECENT_KEY = 'bv.tilePicker.recent.v1';
var _TP_RECENT_MAX = 8;
var _tpRecentIds = [];  // tile IDs, newest first

(function _loadRecent() {
  try {
    var raw = localStorage.getItem(_TP_RECENT_KEY);
    if (raw) {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) _tpRecentIds = arr.slice(0, _TP_RECENT_MAX);
    }
  } catch (e) { /* ignore */ }
})();

function _tpSaveRecent() {
  try { localStorage.setItem(_TP_RECENT_KEY, JSON.stringify(_tpRecentIds)); }
  catch (e) { /* ignore */ }
}

/**
 * Track a tile as recently used. Call this after painting a tile.
 * Moves the tile to the front of the MRU list and caps at _TP_RECENT_MAX.
 */
function tilePickerTrackRecent(tileId) {
  tileId = parseInt(tileId, 10);
  if (isNaN(tileId) || !TILE_SCHEMA[tileId]) return;
  var idx = _tpRecentIds.indexOf(tileId);
  if (idx >= 0) _tpRecentIds.splice(idx, 1);
  _tpRecentIds.unshift(tileId);
  if (_tpRecentIds.length > _TP_RECENT_MAX) _tpRecentIds.length = _TP_RECENT_MAX;
  _tpSaveRecent();
}

// ── Search state ──────────────────────────────────────────────
var _tpSearchQuery = '';

function buildTilePicker() {
  var el = document.getElementById('tile-picker');
  if (!EDIT.active) { el.style.display = 'none'; return; }

  var biomeTileIds = {};
  var biomeTileList = [];
  var payload = null;
  if (typeof FLOORS !== 'undefined' && typeof currentFloorId === 'string' &&
      FLOORS[currentFloorId] && FLOORS[currentFloorId]._payload) {
    payload = FLOORS[currentFloorId]._payload;
  }
  if (payload && payload.biome && payload.biome.palette) {
    var pal = payload.biome.palette;
    var lists = [pal.wall, pal.floor, pal.light, pal.ceiling];
    for (var li = 0; li < lists.length; li++) {
      if (!Array.isArray(lists[li])) continue;
      for (var pi = 0; pi < lists[li].length; pi++) {
        var tid = lists[li][pi];
        if (!biomeTileIds[tid]) { biomeTileIds[tid] = true; biomeTileList.push(tid); }
      }
    }
    if (payload.biome.accentTiles) {
      for (var ai = 0; ai < payload.biome.accentTiles.length; ai++) {
        var atid = payload.biome.accentTiles[ai];
        if (!biomeTileIds[atid]) { biomeTileIds[atid] = true; biomeTileList.push(atid); }
      }
    }
    if (payload.biome.breakableSet) {
      for (var bi = 0; bi < payload.biome.breakableSet.length; bi++) {
        var btid = payload.biome.breakableSet[bi];
        if (!biomeTileIds[btid]) { biomeTileIds[btid] = true; biomeTileList.push(btid); }
      }
    }
  }

  var query = _tpSearchQuery.toLowerCase().trim();
  function matchesSearch(tileId) {
    if (!query) return true;
    var s = TILE_SCHEMA[tileId];
    if (!s) return false;
    return s.name.toLowerCase().indexOf(query) >= 0;
  }

  var groups = {};
  for (var id in TILE_SCHEMA) {
    var s = TILE_SCHEMA[id];
    if (!groups[s.cat]) groups[s.cat] = [];
    groups[s.cat].push(parseInt(id));
  }

  var html = '';

  // ── Search bar ────────────────────────────────────────────
  html += '<div class="tp-search-row">';
  html += '<input type="text" id="tp-search-input" class="tp-search" placeholder="Search tiles..." value="' + _escAttr(_tpSearchQuery) + '">';
  if (_tpSearchQuery) {
    html += '<button class="tp-search-clear" id="tp-search-clear" title="Clear search">&times;</button>';
  }
  html += '</div>';

  // ── Recently Used row ─────────────────────────────────────
  if (_tpRecentIds.length > 0 && !query) {
    html += '<span class="tp-row tp-recent-row"><span class="tp-cat" style="color:#8cf;">\u25d4 Recent</span>';
    for (var ri = 0; ri < _tpRecentIds.length; ri++) {
      var rid = _tpRecentIds[ri];
      var rs = TILE_SCHEMA[rid];
      if (!rs) continue;
      var rsel = rid === EDIT.paintTile ? ' selected' : '';
      html += '<span class="tp-tile' + rsel + '" data-tile="' + rid + '" style="background:' + rs.color + ';outline:1px solid #8cf;" title="' + rs.name + ' [' + rid + '] (recent)"><span class="tp-label">' + rs.name + '</span></span>';
    }
    html += '</span>';
  }

  // ── Biome group ───────────────────────────────────────────
  if (biomeTileList.length > 0) {
    var filteredBiome = query ? biomeTileList.filter(matchesSearch) : biomeTileList;
    if (filteredBiome.length > 0) {
      var biomeName = (payload && payload.biome && payload.biome.name) ? payload.biome.name : 'biome';
      html += '<span class="tp-row tp-biome-row"><span class="tp-cat" style="color:#fc8;">\u2605 ' + biomeName + '</span>';
      for (var bti = 0; bti < filteredBiome.length; bti++) {
        var bid = filteredBiome[bti];
        var bs = TILE_SCHEMA[bid];
        if (!bs) continue;
        var bsel = bid === EDIT.paintTile ? ' selected' : '';
        html += '<span class="tp-tile' + bsel + '" data-tile="' + bid + '" style="background:' + bs.color + ';outline:1px solid #fc8;" title="' + bs.name + ' [' + bid + '] (biome)"><span class="tp-label">' + bs.name + '</span></span>';
      }
      html += '</span>';
    }
  }

  // ── Standard category groups ──────────────────────────────
  var totalVisible = 0;
  CAT_ORDER.forEach(function(cat) {
    if (!groups[cat]) return;
    var tiles = groups[cat].slice().sort(function(a,b){return a-b;});
    if (query) tiles = tiles.filter(matchesSearch);
    if (tiles.length === 0) return;
    totalVisible += tiles.length;
    html += '<span class="tp-row"><span class="tp-cat">' + (CAT_LABELS[cat] || cat) + '</span>';
    tiles.forEach(function(tid) {
      var s = TILE_SCHEMA[tid];
      var sel = tid === EDIT.paintTile ? ' selected' : '';
      html += '<span class="tp-tile' + sel + '" data-tile="' + tid + '" style="background:' + s.color + '" title="' + s.name + ' [' + tid + ']"><span class="tp-label">' + s.name + '</span></span>';
    });
    html += '</span>';
  });

  // ── No results ────────────────────────────────────────────
  if (query && totalVisible === 0) {
    html += '<div class="tp-no-results">No tiles match "' + _escHtml(query) + '"</div>';
  }

  el.innerHTML = html;
  el.style.display = 'block';

  // ── Wire tile click handlers ──────────────────────────────
  el.querySelectorAll('.tp-tile').forEach(function(tile) {
    tile.addEventListener('click', function() {
      EDIT.paintTile = parseInt(this.dataset.tile);
      tilePickerTrackRecent(EDIT.paintTile);
      updateEditUI();
      buildTilePicker();
    });
  });

  // ── Wire search input ─────────────────────────────────────
  var searchInput = document.getElementById('tp-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      _tpSearchQuery = this.value;
      var cursorPos = this.selectionStart;
      buildTilePicker();
      var newInput = document.getElementById('tp-search-input');
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(cursorPos, cursorPos);
      }
    });
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        _tpSearchQuery = '';
        buildTilePicker();
      }
    });
  }
  var clearBtn = document.getElementById('tp-search-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      _tpSearchQuery = '';
      buildTilePicker();
      var newInput = document.getElementById('tp-search-input');
      if (newInput) newInput.focus();
    });
  }
}

function _escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _escAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
