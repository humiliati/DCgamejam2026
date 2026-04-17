/* ============================================================
   tools/npc-designer.js — DOC-110 Phase 1 MVP
   ============================================================
   Vanilla-JS companion to tools/npc-designer.html. Loads
   window.NPCS_DATA (data/npcs.js) + window.FLOOR_DATA
   (tools/floor-data.js), drives the sidebar + tabbed editor,
   and exports a mutated data/npcs.json via a download blob.

   Architecture — one IIFE `NpcDesigner` exposing init() + a
   few debug hooks. No external deps, no build step.

   Sub-modules (functions scoped inside the IIFE):
     _State ........... central mutable state
     _Loader .......... read sidecars, build indices
     _Sidebar ......... filter chips + search + NPC list
     _Tabs ............ tab switcher
     _IdentityTab ..... form bindings for Identity tab
     _PlacementTab .... form bindings + mini-map canvas
     _BehaviorTab ..... form bindings + patrol list widget
     _StubTabs ........ read/write for deferred tabs
     _Save ............ diff-to-original, blob download
     _Toast ........... bottom-right toast
   ============================================================ */
'use strict';

var NpcDesigner = (function () {

  // ────────────────────────────────────────────────────────────
  // State
  // ────────────────────────────────────────────────────────────

  var _state = {
    /** Parsed original payload — never mutated. Used for diff. */
    original: null,
    /** Deep-cloned working copy — all edits go here. */
    working: null,
    /** Map: npcId → npc ref (points into working.npcsByFloor[*]) */
    byId: {},
    /** Map: floorId → FLOOR_DATA.floors[id] (for minimap). */
    floors: {},
    /** Array of floor ids (sorted). */
    floorIds: [],
    /** Per-NPC dirty fingerprint. id → true|undefined. */
    dirty: {},
    /** Currently selected npc id. */
    activeId: null,
    /** Active tab key. */
    activeTab: 'identity',
    /** Search/filter state. */
    filter: { text: '', floor: null },
    /** Minimap cached render params. */
    mmCache: null
  };

  // ────────────────────────────────────────────────────────────
  // DOM helpers
  // ────────────────────────────────────────────────────────────

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ────────────────────────────────────────────────────────────
  // Loader — hydrate state from window.NPCS_DATA + window.FLOOR_DATA
  // ────────────────────────────────────────────────────────────

  function _loadData() {
    if (typeof window.NPCS_DATA !== 'object' || !window.NPCS_DATA) {
      _fatal('data/npcs.js did not expose window.NPCS_DATA. Run `node tools/extract-npcs.js` first.');
      return false;
    }
    if (typeof window.FLOOR_DATA !== 'object' || !window.FLOOR_DATA) {
      _fatal('tools/floor-data.js did not expose window.FLOOR_DATA. Run `node tools/extract-floors.js` first.');
      return false;
    }

    _state.original = clone(window.NPCS_DATA);
    _state.working  = clone(window.NPCS_DATA);

    // Index by id
    var byId = {};
    var floors = _state.working.npcsByFloor || {};
    Object.keys(floors).forEach(function (fid) {
      (floors[fid] || []).forEach(function (n) { byId[n.id] = n; });
    });
    _state.byId = byId;

    // Floor references (for minimap)
    _state.floors = window.FLOOR_DATA.floors || {};
    _state.floorIds = Object.keys(_state.floors).sort(_sortFloorIds);

    return true;
  }

  function _sortFloorIds(a, b) {
    var pa = a.split('.').map(Number);
    var pb = b.split('.').map(Number);
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var da = pa[i] == null ? -1 : pa[i];
      var db = pb[i] == null ? -1 : pb[i];
      if (da !== db) return da - db;
    }
    return 0;
  }

  function _fatal(msg) {
    console.error('[npc-designer] ' + msg);
    var s = $('#status-indicator');
    if (s) { s.textContent = 'ERROR'; s.className = 'status err'; }
    _toast('err', msg);
  }

  // ────────────────────────────────────────────────────────────
  // Sidebar — floor filter chips + search + NPC list
  // ────────────────────────────────────────────────────────────

  function _renderFloorChips() {
    var root = $('#floor-chips');
    root.innerHTML = '';

    // "All" chip
    var all = _makeChip('All', null);
    root.appendChild(all);

    // One chip per floor that actually has NPCs
    var npcFloors = Object.keys(_state.working.npcsByFloor || {}).sort(_sortFloorIds);
    npcFloors.forEach(function (fid) {
      var count = (_state.working.npcsByFloor[fid] || []).length;
      var label = fid + ' · ' + count;
      root.appendChild(_makeChip(label, fid));
    });
    _updateChipHighlights();
  }

  function _makeChip(label, floorId) {
    var c = document.createElement('div');
    c.className = 'nd-chip';
    c.textContent = label;
    c.dataset.floor = floorId == null ? '' : floorId;
    c.addEventListener('click', function () {
      _state.filter.floor = floorId;
      _updateChipHighlights();
      _renderNpcList();
    });
    return c;
  }

  function _updateChipHighlights() {
    $$('#floor-chips .nd-chip').forEach(function (c) {
      var active = (c.dataset.floor || null) === (_state.filter.floor || null);
      c.classList.toggle('active', active);
    });
  }

  function _renderNpcList() {
    var root = $('#npc-list');
    root.innerHTML = '';

    var floors = _state.working.npcsByFloor || {};
    var floorIds = Object.keys(floors).sort(_sortFloorIds);

    var text = _state.filter.text.toLowerCase().trim();
    var floorFilter = _state.filter.floor;

    var matched = 0;
    floorIds.forEach(function (fid) {
      if (floorFilter && fid !== floorFilter) return;
      var list = (floors[fid] || []).slice().sort(function (a, b) {
        return (a.id || '').localeCompare(b.id || '');
      });
      var visible = list.filter(function (n) {
        if (!text) return true;
        var haystack = (n.id + ' ' + (n.name || '') + ' ' + (n.emoji || '') +
          ' ' + (n.role || '') + ' ' + (n.type || '') + ' ' + (n.factionId || '')).toLowerCase();
        return haystack.indexOf(text) !== -1;
      });
      if (visible.length === 0) return;

      var hdr = document.createElement('div');
      hdr.className = 'nd-list-floor';
      hdr.innerHTML = '<span>' + _escape(fid) + '</span>' +
        '<span class="count">' + visible.length + '</span>';
      root.appendChild(hdr);

      visible.forEach(function (n) {
        matched++;
        root.appendChild(_makeListItem(n));
      });
    });

    if (matched === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'padding:20px; text-align:center; color:var(--muted); font-size:11px;';
      empty.textContent = 'No NPCs match.';
      root.appendChild(empty);
    }
  }

  function _makeListItem(n) {
    var li = document.createElement('div');
    li.className = 'nd-list-item';
    li.dataset.id = n.id;
    if (n.id === _state.activeId) li.classList.add('selected');
    if (_state.dirty[n.id]) li.classList.add('dirty');

    li.innerHTML =
      '<span class="emoji">' + _escape(n.emoji || '•') + '</span>' +
      '<span class="name" title="' + _escape(n.id) + '">' + _escape(n.name || n.id) + '</span>' +
      '<span class="role">' + _escape((n.role || n.type || '').slice(0, 10)) + '</span>';
    li.addEventListener('click', function () { _selectNpc(n.id); });
    return li;
  }

  function _escape(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ────────────────────────────────────────────────────────────
  // Selection + editor header
  // ────────────────────────────────────────────────────────────

  function _selectNpc(id) {
    var n = _state.byId[id];
    if (!n) { _toast('warn', 'NPC not found: ' + id); return; }
    _state.activeId = id;

    // UI swap
    $('#empty-state').style.display = 'none';
    $('#editor-body').style.display = 'flex';

    // Header
    $('#hdr-emoji').textContent = n.emoji || '•';
    $('#hdr-name').textContent = n.name || n.id;
    $('#hdr-id').textContent = n.id + ' · ' + (n.floorId || '?') + ' · ' + (n.type || '?');

    // Rebuild list (highlights move)
    _renderNpcList();

    // Paint active tab
    _paintActiveTab();
  }

  function _paintActiveTab() {
    var n = _state.byId[_state.activeId];
    if (!n) return;
    switch (_state.activeTab) {
      case 'identity':  _IdentityTab.paint(n); break;
      case 'placement': _PlacementTab.paint(n); break;
      case 'behavior':  _BehaviorTab.paint(n); break;
      case 'dialogue':  _StubTabs.paintDialogue(n); break;
      case 'commerce':  _StubTabs.paintCommerce(n); break;
      case 'reanim':    _StubTabs.paintReanim(n); break;
    }
  }

  // ────────────────────────────────────────────────────────────
  // Tab router
  // ────────────────────────────────────────────────────────────

  function _wireTabs() {
    $$('.nd-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        var key = t.dataset.tab;
        if (!key) return;
        _state.activeTab = key;
        $$('.nd-tab').forEach(function (x) {
          x.classList.toggle('active', x.dataset.tab === key);
        });
        $$('.nd-tab-body').forEach(function (body) {
          body.classList.toggle('hidden', body.id !== 'tab-' + key);
        });
        _paintActiveTab();
      });
    });
  }

  // ────────────────────────────────────────────────────────────
  // Dirty tracking
  // ────────────────────────────────────────────────────────────

  function _markDirty(npc) {
    if (!npc) return;
    _state.dirty[npc.id] = true;
    _updateStatus();
    _renderNpcList();
    // Rebuild preview if Identity tab is active
    if (_state.activeTab === 'identity') _IdentityTab.refreshPreview(npc);
  }

  function _updateStatus() {
    var count = Object.keys(_state.dirty).length;
    var s = $('#status-indicator');
    if (count === 0) {
      s.textContent = 'saved';
      s.className = 'status';
    } else {
      s.textContent = count + ' edit' + (count === 1 ? '' : 's') + ' unsaved';
      s.className = 'status dirty';
    }
  }

  // ────────────────────────────────────────────────────────────
  // _IdentityTab
  // ────────────────────────────────────────────────────────────

  var _IdentityTab = (function () {
    function paint(n) {
      $('#f-id').value = n.id || '';
      $('#f-name').value = n.name || '';
      $('#f-emoji').value = n.emoji || '';
      $('#f-type').value = n.type || 'interactive';
      $('#f-role').value = n.role || '';
      $('#f-faction').value = n.factionId || '';
      $('#f-talkable').checked = !!n.talkable;
      $('#f-blocksMovement').checked = !!n.blocksMovement;
      _StackEditor.paint(n);
      _SpriteEditor.paint(n);
      refreshPreview(n);
    }

    function refreshPreview(n) {
      var preview = {
        id: n.id, name: n.name, emoji: n.emoji,
        type: n.type, role: n.role,
        factionId: n.factionId,
        talkable: n.talkable,
        blocksMovement: n.blocksMovement
      };
      if (n.stack) preview.stack = n.stack;
      if (n.sprites && _spritesHaveAny(n.sprites)) preview.sprites = n.sprites;
      $('#identity-preview').textContent = JSON.stringify(preview, null, 2);
    }

    function _spritesHaveAny(sp) {
      if (!sp || typeof sp !== 'object') return false;
      var slots = Object.keys(sp);
      for (var i = 0; i < slots.length; i++) {
        var intents = sp[slots[i]];
        if (!intents) continue;
        var keys = Object.keys(intents);
        for (var j = 0; j < keys.length; j++) {
          var arr = intents[keys[j]];
          if (Array.isArray(arr) && arr.length > 0) return true;
        }
      }
      return false;
    }

    function wire() {
      $('#f-name').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.name = e.target.value;
        $('#hdr-name').textContent = n.name || n.id;
        _markDirty(n);
      });
      $('#f-emoji').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.emoji = e.target.value || null;
        $('#hdr-emoji').textContent = n.emoji || '•';
        _markDirty(n);
      });
      $('#f-type').addEventListener('change', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.type = e.target.value;
        _markDirty(n);
      });
      $('#f-role').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.role = e.target.value || null;
        _markDirty(n);
      });
      $('#f-faction').addEventListener('change', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.factionId = e.target.value || null;
        _markDirty(n);
      });
      $('#f-talkable').addEventListener('change', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.talkable = !!e.target.checked;
        _markDirty(n);
      });
      $('#f-blocksMovement').addEventListener('change', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.blocksMovement = !!e.target.checked;
        _markDirty(n);
      });
    }

    return { paint: paint, refreshPreview: refreshPreview, wire: wire };
  })();

  // ────────────────────────────────────────────────────────────
  // _StackEditor — triple-emoji stack authoring (SPRITE_STACK_ROADMAP §3)
  //   n.stack === null      → composer mode (runtime-generated via NpcComposer)
  //   n.stack === {obj}     → pinned override (hand-authored stack)
  // ────────────────────────────────────────────────────────────

  var _StackEditor = (function () {

    /** Produce a simple deterministic seed from the NPC id. */
    function _seedFromId(id) {
      var h = 2166136261 >>> 0; // FNV-1a init
      for (var i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h;
    }

    /** Composer-generated defaults (via NpcComposer if available; else sensible fallback). */
    function _defaultStack(n) {
      if (typeof NpcComposer !== 'undefined' && NpcComposer && typeof NpcComposer.compose === 'function') {
        try {
          return clone(NpcComposer.compose(_seedFromId(n.id || 'npc'), n.role || null));
        } catch (e) { /* fall through */ }
      }
      return {
        head: n.emoji || '🧑',
        torso: '🧥',
        legs: '👖',
        hat: null,
        frontWeapon: null,
        backWeapon: null,
        tintHue: null,
        corpse: '💀'
      };
    }

    function paint(n) {
      var pinned = !!n.stack;

      // Mode radio
      $$('#stack-mode input[name="stack-mode"]').forEach(function (r) {
        r.checked = r.value === (pinned ? 'pinned' : 'composer');
      });
      $$('#stack-mode label').forEach(function (l) {
        l.classList.toggle('selected', l.dataset.val === (pinned ? 'pinned' : 'composer'));
      });

      // Grid enable/disable
      var grid = $('#stack-grid');
      var tintRow = $('#stack-tint-row');
      if (grid) grid.classList.toggle('disabled', !pinned);
      if (tintRow) tintRow.classList.toggle('disabled', !pinned);

      var s = pinned ? n.stack : _defaultStack(n);

      // Primary slots
      $('#stack-head').value  = s.head  || '';
      $('#stack-torso').value = s.torso || '';
      $('#stack-legs').value  = s.legs  || '';

      // Hat
      var hat = s.hat || { char: '', scale: 0.6, behind: false };
      $('#stack-hat').value = hat.char || '';
      $('#stack-hatScale').value = hat.scale != null ? hat.scale : 0.6;
      $('#stack-hatBehind').checked = !!hat.behind;

      // Front weapon
      var fw = s.frontWeapon || { char: '', scale: 0.8, offsetX: 0.15 };
      $('#stack-frontWeapon').value = fw.char || '';
      $('#stack-frontWeaponScale').value = fw.scale != null ? fw.scale : 0.8;
      $('#stack-frontWeaponOffsetX').value = fw.offsetX != null ? fw.offsetX : 0.15;

      // Back weapon
      var bw = s.backWeapon || { char: '', scale: 0.8, offsetX: -0.15 };
      $('#stack-backWeapon').value = bw.char || '';
      $('#stack-backWeaponScale').value = bw.scale != null ? bw.scale : 0.8;
      $('#stack-backWeaponOffsetX').value = bw.offsetX != null ? bw.offsetX : -0.15;

      // Corpse
      $('#stack-corpse').value = s.corpse || '';

      // Tint
      var tintNull = (s.tintHue == null);
      $('#stack-tintHue-null').checked = tintNull;
      $('#stack-tintHue').disabled = tintNull;
      var hue = tintNull ? 0 : s.tintHue;
      $('#stack-tintHue').value = hue;
      $('#stack-tint-value').textContent = tintNull ? '—' : (hue + '°');
      $('#stack-tint-swatch').style.background = tintNull
        ? 'repeating-linear-gradient(45deg,#1a1d22,#1a1d22 4px,#0a0c0e 4px,#0a0c0e 8px)'
        : 'hsl(' + hue + ', 55%, 55%)';
    }

    function _ensurePinned(n) {
      if (!n.stack) n.stack = _defaultStack(n);
      return n.stack;
    }

    function _updateSubLayer(n, key, charVal, defaults) {
      var s = _ensurePinned(n);
      if (!charVal) {
        s[key] = null;
      } else {
        if (!s[key]) s[key] = { char: charVal };
        else s[key].char = charVal;
        // Fill defaults for any missing modifier
        Object.keys(defaults).forEach(function (k) {
          if (s[key][k] == null) s[key][k] = defaults[k];
        });
      }
    }

    function wire() {
      // Mode radios
      $$('#stack-mode input[name="stack-mode"]').forEach(function (r) {
        r.addEventListener('change', function () {
          var n = _state.byId[_state.activeId]; if (!n) return;
          if (r.value === 'composer') {
            n.stack = null;
          } else {
            if (!n.stack) n.stack = _defaultStack(n);
          }
          paint(n);
          _markDirty(n);
        });
      });

      // Primary slots
      ['head', 'torso', 'legs'].forEach(function (slot) {
        $('#stack-' + slot).addEventListener('input', function (e) {
          var n = _state.byId[_state.activeId]; if (!n || !n.stack) return;
          n.stack[slot] = e.target.value || null;
          _markDirty(n);
        });
      });

      // Corpse
      $('#stack-corpse').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack) return;
        n.stack.corpse = e.target.value || null;
        _markDirty(n);
      });

      // Hat char + modifiers
      $('#stack-hat').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack) return;
        _updateSubLayer(n, 'hat', e.target.value, { scale: 0.6, behind: false });
        _markDirty(n);
      });
      $('#stack-hatScale').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack || !n.stack.hat) return;
        var v = parseFloat(e.target.value);
        if (!isNaN(v)) { n.stack.hat.scale = v; _markDirty(n); }
      });
      $('#stack-hatBehind').addEventListener('change', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack || !n.stack.hat) return;
        n.stack.hat.behind = !!e.target.checked;
        _markDirty(n);
      });

      // Front weapon
      $('#stack-frontWeapon').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack) return;
        _updateSubLayer(n, 'frontWeapon', e.target.value, { scale: 0.8, offsetX: 0.15 });
        _markDirty(n);
      });
      $('#stack-frontWeaponScale').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack || !n.stack.frontWeapon) return;
        var v = parseFloat(e.target.value);
        if (!isNaN(v)) { n.stack.frontWeapon.scale = v; _markDirty(n); }
      });
      $('#stack-frontWeaponOffsetX').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack || !n.stack.frontWeapon) return;
        var v = parseFloat(e.target.value);
        if (!isNaN(v)) { n.stack.frontWeapon.offsetX = v; _markDirty(n); }
      });

      // Back weapon
      $('#stack-backWeapon').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack) return;
        _updateSubLayer(n, 'backWeapon', e.target.value, { scale: 0.8, offsetX: -0.15 });
        _markDirty(n);
      });
      $('#stack-backWeaponScale').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack || !n.stack.backWeapon) return;
        var v = parseFloat(e.target.value);
        if (!isNaN(v)) { n.stack.backWeapon.scale = v; _markDirty(n); }
      });
      $('#stack-backWeaponOffsetX').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack || !n.stack.backWeapon) return;
        var v = parseFloat(e.target.value);
        if (!isNaN(v)) { n.stack.backWeapon.offsetX = v; _markDirty(n); }
      });

      // Tint slider + no-tint checkbox
      $('#stack-tintHue').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack) return;
        if ($('#stack-tintHue-null').checked) return;
        var v = parseInt(e.target.value, 10);
        n.stack.tintHue = isNaN(v) ? null : v;
        $('#stack-tint-value').textContent = v + '°';
        $('#stack-tint-swatch').style.background = 'hsl(' + v + ', 55%, 55%)';
        _markDirty(n);
      });
      $('#stack-tintHue-null').addEventListener('change', function (e) {
        var n = _state.byId[_state.activeId]; if (!n || !n.stack) return;
        if (e.target.checked) {
          n.stack.tintHue = null;
          $('#stack-tintHue').disabled = true;
          $('#stack-tint-value').textContent = '—';
          $('#stack-tint-swatch').style.background =
            'repeating-linear-gradient(45deg,#1a1d22,#1a1d22 4px,#0a0c0e 4px,#0a0c0e 8px)';
        } else {
          var v = parseInt($('#stack-tintHue').value, 10) || 0;
          n.stack.tintHue = v;
          $('#stack-tintHue').disabled = false;
          $('#stack-tint-value').textContent = v + '°';
          $('#stack-tint-swatch').style.background = 'hsl(' + v + ', 55%, 55%)';
        }
        _markDirty(n);
      });
    }

    return { paint: paint, wire: wire };
  })();

  // ────────────────────────────────────────────────────────────
  // _SpriteEditor — per-slot × per-intent frame series
  //   n.sprites === null     → no commissions (fallback to emoji stack)
  //   n.sprites === {obj}    → { [slot]: { [intent]: [assetId, ...] } }
  // ────────────────────────────────────────────────────────────

  var _SpriteEditor = (function () {

    var SLOTS = [
      { key: 'head',        label: 'Head' },
      { key: 'torso',       label: 'Torso' },
      { key: 'legs',        label: 'Legs' },
      { key: 'hat',         label: 'Hat' },
      { key: 'frontWeapon', label: 'Front Wpn' },
      { key: 'backWeapon',  label: 'Back Wpn' }
    ];
    var INTENTS = [
      { key: 'locomotion',  label: 'Locomotion',  short: 'walk' },
      { key: 'interaction', label: 'Interaction', short: 'interact' },
      { key: 'dialogue',    label: 'Dialogue',    short: 'talk' },
      { key: 'combat',      label: 'Combat',      short: 'combat' }
    ];

    /** UI-only state — which cell is selected, and local preview URLs. */
    var _sel = null;                     // { slot, intent } or null
    var _previewCache = {};              // assetId → dataURL (session only)

    function _ensureSprites(n) {
      if (n.sprites) return n.sprites;
      var out = {};
      SLOTS.forEach(function (s) {
        var intentMap = {};
        INTENTS.forEach(function (i) { intentMap[i.key] = []; });
        out[s.key] = intentMap;
      });
      n.sprites = out;
      return out;
    }

    function _getSeries(n, slotKey, intentKey) {
      if (!n.sprites) return [];
      var slot = n.sprites[slotKey]; if (!slot) return [];
      var arr = slot[intentKey]; if (!Array.isArray(arr)) return [];
      return arr;
    }

    function _countCell(n, slotKey, intentKey) {
      return _getSeries(n, slotKey, intentKey).length;
    }

    function paint(n) {
      _renderGrid(n);
      // Close editor if it was open for a different NPC
      _closeEditor();
    }

    function _renderGrid(n) {
      var grid = $('#sprite-grid');
      grid.innerHTML = '';

      // Header row: empty corner + 4 intent labels
      var corner = document.createElement('div');
      corner.className = 'sp-hdr';
      corner.textContent = 'slot / intent';
      grid.appendChild(corner);
      INTENTS.forEach(function (i) {
        var h = document.createElement('div');
        h.className = 'sp-hdr';
        h.textContent = i.label;
        grid.appendChild(h);
      });

      // Slot rows
      SLOTS.forEach(function (s) {
        var lbl = document.createElement('div');
        lbl.className = 'sp-slot';
        lbl.textContent = s.label;
        grid.appendChild(lbl);

        INTENTS.forEach(function (i) {
          var cell = document.createElement('div');
          cell.className = 'sp-cell';
          cell.dataset.slot = s.key;
          cell.dataset.intent = i.key;

          var count = _countCell(n, s.key, i.key);
          if (count > 0) cell.classList.add('has-frames');
          if (_sel && _sel.slot === s.key && _sel.intent === i.key) cell.classList.add('active');

          var cn = document.createElement('div');
          cn.className = 'count';
          cn.textContent = count > 0 ? count : '·';
          cell.appendChild(cn);

          var cl = document.createElement('div');
          cl.className = 'label';
          cl.textContent = count === 1 ? 'frame' : 'frames';
          cell.appendChild(cl);

          cell.addEventListener('click', function () {
            _openEditor(s.key, i.key);
          });

          grid.appendChild(cell);
        });
      });
    }

    function _openEditor(slotKey, intentKey) {
      var n = _state.byId[_state.activeId]; if (!n) return;
      _sel = { slot: slotKey, intent: intentKey };
      _ensureSprites(n);

      var slotLabel = _labelForSlot(slotKey);
      var intentLabel = _labelForIntent(intentKey);
      $('#frame-editor-title').textContent = slotLabel + ' · ' + intentLabel;

      var box = $('#frame-editor');
      box.classList.remove('hidden');

      _renderFrameList(n);
      _renderGrid(n);  // re-render to highlight active cell

      // Pre-fill suggested asset ID
      $('#frame-new-id').value = _suggestAssetId(n, slotKey, intentKey, _countCell(n, slotKey, intentKey));
      $('#frame-new-id').focus();
    }

    function _closeEditor() {
      _sel = null;
      var box = $('#frame-editor');
      if (box) box.classList.add('hidden');
    }

    function _renderFrameList(n) {
      var ul = $('#frame-list');
      ul.innerHTML = '';
      if (!_sel) return;

      var series = _getSeries(n, _sel.slot, _sel.intent);
      if (series.length === 0) {
        var empty = document.createElement('li');
        empty.className = 'nd-frame-empty';
        empty.textContent = 'No frames yet. Add an asset ID below or browse for a PNG to preview.';
        // Re-style the row since it's using .nd-frame-empty (not the grid layout)
        empty.style.display = 'block';
        empty.style.gridTemplateColumns = 'none';
        ul.appendChild(empty);
        return;
      }

      series.forEach(function (assetId, idx) {
        var li = document.createElement('li');

        var idxCell = document.createElement('span');
        idxCell.className = 'idx';
        idxCell.textContent = String(idx).padStart(2, '0');
        li.appendChild(idxCell);

        var preview = document.createElement('div');
        preview.className = 'preview';
        if (_previewCache[assetId]) {
          var img = document.createElement('img');
          img.src = _previewCache[assetId];
          preview.appendChild(img);
        } else {
          preview.textContent = '□';
        }
        li.appendChild(preview);

        var idInput = document.createElement('input');
        idInput.className = 'asset-id';
        idInput.type = 'text';
        idInput.value = assetId;
        idInput.addEventListener('input', function (e) {
          var n2 = _state.byId[_state.activeId]; if (!n2) return;
          var newId = e.target.value.trim();
          if (!newId) return;
          var series2 = _getSeries(n2, _sel.slot, _sel.intent);
          // Migrate any cached preview to the new key
          if (_previewCache[series2[idx]] && !_previewCache[newId]) {
            _previewCache[newId] = _previewCache[series2[idx]];
            delete _previewCache[series2[idx]];
          }
          series2[idx] = newId;
          _markDirty(n2);
        });
        li.appendChild(idInput);

        var browse = document.createElement('button');
        browse.className = 'browse-btn';
        browse.textContent = 'Browse…';
        browse.addEventListener('click', function () {
          _pickFileFor(assetId, idx);
        });
        li.appendChild(browse);

        var remove = document.createElement('button');
        remove.className = 'remove-btn';
        remove.textContent = '✕';
        remove.title = 'Remove frame';
        remove.addEventListener('click', function () {
          var n2 = _state.byId[_state.activeId]; if (!n2) return;
          var series2 = _getSeries(n2, _sel.slot, _sel.intent);
          series2.splice(idx, 1);
          _renderFrameList(n2);
          _renderGrid(n2);
          _markDirty(n2);
        });
        li.appendChild(remove);

        ul.appendChild(li);
      });
    }

    function _pickFileFor(assetId, idx) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/*';
      input.addEventListener('change', function () {
        var f = input.files && input.files[0]; if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          _previewCache[assetId] = reader.result;
          var n2 = _state.byId[_state.activeId];
          if (n2) _renderFrameList(n2);
        };
        reader.readAsDataURL(f);
      });
      input.click();
    }

    function _suggestAssetId(n, slotKey, intentKey, nextIdx) {
      var intentShort = INTENTS.filter(function (i) { return i.key === intentKey; })[0];
      var short = intentShort ? intentShort.short : intentKey;
      var pad = String(nextIdx).padStart(2, '0');
      return 'NPC-' + (n.id || 'unknown') + '_' + slotKey + '_' + short + '_' + pad;
    }

    function _labelForSlot(k) {
      var s = SLOTS.filter(function (x) { return x.key === k; })[0];
      return s ? s.label : k;
    }
    function _labelForIntent(k) {
      var s = INTENTS.filter(function (x) { return x.key === k; })[0];
      return s ? s.label : k;
    }

    function _buildManifestFragment(n) {
      var out = {};
      if (!n.sprites) return out;
      SLOTS.forEach(function (s) {
        var slot = n.sprites[s.key]; if (!slot) return;
        INTENTS.forEach(function (i) {
          var arr = slot[i.key]; if (!Array.isArray(arr)) return;
          arr.forEach(function (assetId) {
            if (!assetId) return;
            // Default asset path: assets/sprites/npcs/<assetId>.png
            out[assetId] = 'assets/sprites/npcs/' + assetId + '.png';
          });
        });
      });
      return out;
    }

    function _previewManifest() {
      var n = _state.byId[_state.activeId]; if (!n) return;
      var frag = _buildManifestFragment(n);
      var count = Object.keys(frag).length;
      if (count === 0) {
        _toast('warn', 'No sprite commissions on this NPC yet.');
        return;
      }
      $('#identity-preview').textContent = JSON.stringify(frag, null, 2);
      _toast('ok', 'Manifest preview (' + count + ' assets) loaded into Raw Preview.');
    }

    function _exportManifest() {
      var n = _state.byId[_state.activeId]; if (!n) return;
      var frag = _buildManifestFragment(n);
      var count = Object.keys(frag).length;
      if (count === 0) {
        _toast('warn', 'No sprite commissions to export.');
        return;
      }
      var payload = {
        _meta: {
          generator: 'npc-designer.js',
          npcId: n.id,
          generatedAt: new Date().toISOString(),
          note: 'Merge these entries into assets/sprites/manifest.js (SPRITE_MANIFEST)'
        },
        entries: frag
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'manifest-fragment-' + n.id + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 500);
      _toast('ok', 'Manifest fragment downloaded (' + count + ' assets).');
    }

    function wire() {
      // Close button
      $('#frame-editor-close').addEventListener('click', _closeEditor);

      // Add frame
      $('#frame-add-btn').addEventListener('click', function () {
        var n = _state.byId[_state.activeId]; if (!n || !_sel) return;
        var id = $('#frame-new-id').value.trim();
        if (!id) { _toast('warn', 'Asset ID required.'); return; }
        var series = _ensureSprites(n)[_sel.slot][_sel.intent];
        series.push(id);
        $('#frame-new-id').value = _suggestAssetId(n, _sel.slot, _sel.intent, series.length);
        _renderFrameList(n);
        _renderGrid(n);
        _markDirty(n);
      });
      // Enter key in input adds frame
      $('#frame-new-id').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); $('#frame-add-btn').click(); }
      });

      // Manifest buttons
      $('#btn-manifest-preview').addEventListener('click', _previewManifest);
      $('#btn-manifest-export').addEventListener('click', _exportManifest);
    }

    return { paint: paint, wire: wire };
  })();

  // ────────────────────────────────────────────────────────────
  // _PlacementTab (includes mini-map)
  // ────────────────────────────────────────────────────────────

  var _PlacementTab = (function () {
    var MM_CELL = 8;   // px per tile

    function paint(n) {
      // Populate floor dropdown if empty
      var sel = $('#f-floorId');
      if (sel.options.length === 0) {
        _state.floorIds.forEach(function (fid) {
          var opt = document.createElement('option');
          opt.value = fid; opt.textContent = fid;
          sel.appendChild(opt);
        });
      }
      sel.value = n.floorId || _state.floorIds[0];

      $('#f-x').value = n.x != null ? n.x : 0;
      $('#f-y').value = n.y != null ? n.y : 0;

      // Facing radio
      var f = n.facing || 'east';
      $$('#facing-radio input').forEach(function (r) {
        r.checked = r.value === f;
      });
      $$('#facing-radio label').forEach(function (l) {
        l.classList.toggle('selected', l.dataset.val === f);
      });

      _drawMinimap(n);
      _updateMinimapInfo(n);
    }

    function _updateMinimapInfo(n) {
      var floor = _state.floors[n.floorId];
      $('#minimap-floor-id').textContent = n.floorId || '—';
      if (floor && floor.grid) {
        $('#minimap-dims').textContent = floor.gridW + ' × ' + floor.gridH;
        $('#minimap-biome').textContent = floor.biome || '—';
      } else {
        $('#minimap-dims').textContent = '— (no floor data)';
        $('#minimap-biome').textContent = '—';
      }
    }

    function _drawMinimap(n) {
      var canvas = $('#placement-minimap');
      var ctx = canvas.getContext('2d');
      var floor = _state.floors[n.floorId];

      if (!floor || !floor.grid) {
        ctx.fillStyle = '#0a0c0e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#567';
        ctx.font = '11px Consolas, monospace';
        ctx.fillText('No grid data for floor ' + n.floorId, 12, 20);
        return;
      }

      var w = floor.gridW, h = floor.gridH;
      var cell = Math.min(MM_CELL, Math.floor(Math.min(canvas.width / w, canvas.height / h)));
      cell = Math.max(2, cell);
      canvas.width = w * cell;
      canvas.height = h * cell;

      // Clear
      ctx.fillStyle = '#0a0c0e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Tiles — very coarse: walkable=dark, wall=grey, door=orange, etc.
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var t = floor.grid[y][x];
          ctx.fillStyle = _tileColor(t);
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }

      // Other NPCs on floor
      var list = _state.working.npcsByFloor[n.floorId] || [];
      list.forEach(function (o) {
        if (o.id === n.id) return;
        ctx.fillStyle = '#7a7';
        ctx.beginPath();
        ctx.arc(o.x * cell + cell / 2, o.y * cell + cell / 2, Math.max(2, cell / 2 - 1), 0, 2 * Math.PI);
        ctx.fill();
      });

      // Spawn point
      if (floor.spawn) {
        ctx.fillStyle = '#c96';
        ctx.beginPath();
        ctx.arc(floor.spawn.x * cell + cell / 2, floor.spawn.y * cell + cell / 2,
          Math.max(2, cell / 2), 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#0006';
        ctx.stroke();
      }

      // Selected NPC (highlight)
      if (n.x != null && n.y != null) {
        ctx.fillStyle = '#8ad';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        var cx = n.x * cell + cell / 2;
        var cy = n.y * cell + cell / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(3, cell / 2 + 1), 0, 2 * Math.PI);
        ctx.fill(); ctx.stroke();
        // Facing tick
        var fx = cx, fy = cy;
        var len = cell;
        switch (n.facing) {
          case 'east':  fx += len; break;
          case 'south': fy += len; break;
          case 'west':  fx -= len; break;
          case 'north': fy -= len; break;
        }
        ctx.strokeStyle = '#8ad';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(fx, fy); ctx.stroke();
      }

      _state.mmCache = { cell: cell, w: w, h: h, floorId: n.floorId };
    }

    function _tileColor(t) {
      // Minimal palette — solid = wall, 0/1/2 are walkable.
      // We don't need to faithfully theme biomes for MVP.
      if (t == null) return '#0a0c0e';
      if (t === 0 || t === 1) return '#1a1d22';   // floor / open
      if (t === 2) return '#1d2026';              // grass-ish
      if (t >= 100 && t < 200) return '#2a2e33';  // walls
      if (t >= 200 && t < 220) return '#2a3a2a';  // nature walls
      if (t >= 300 && t < 400) return '#3a2d1a';  // doors / stairs
      return '#23272e';
    }

    function wire() {
      $('#f-floorId').addEventListener('change', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        var oldFid = n.floorId;
        var newFid = e.target.value;
        if (oldFid === newFid) return;
        // Move record between floor buckets in working copy
        var fromList = _state.working.npcsByFloor[oldFid] || [];
        var idx = fromList.indexOf(n);
        if (idx !== -1) fromList.splice(idx, 1);
        if (!_state.working.npcsByFloor[newFid]) _state.working.npcsByFloor[newFid] = [];
        _state.working.npcsByFloor[newFid].push(n);
        n.floorId = newFid;
        $('#hdr-id').textContent = n.id + ' · ' + newFid + ' · ' + (n.type || '?');
        _markDirty(n);
        _renderFloorChips();
        _renderNpcList();
        paint(n);
      });
      $('#f-x').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        var v = parseInt(e.target.value, 10);
        if (isNaN(v)) return;
        n.x = v;
        _drawMinimap(n);
        _markDirty(n);
      });
      $('#f-y').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        var v = parseInt(e.target.value, 10);
        if (isNaN(v)) return;
        n.y = v;
        _drawMinimap(n);
        _markDirty(n);
      });
      $$('#facing-radio input').forEach(function (r) {
        r.addEventListener('change', function () {
          var n = _state.byId[_state.activeId]; if (!n) return;
          n.facing = r.value;
          $$('#facing-radio label').forEach(function (l) {
            l.classList.toggle('selected', l.dataset.val === r.value);
          });
          _drawMinimap(n);
          _markDirty(n);
        });
      });

      // Click-to-pin on minimap
      $('#placement-minimap').addEventListener('click', function (evt) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        var mm = _state.mmCache; if (!mm) return;
        var rect = evt.currentTarget.getBoundingClientRect();
        var px = evt.clientX - rect.left;
        var py = evt.clientY - rect.top;
        var tx = Math.floor(px / mm.cell);
        var ty = Math.floor(py / mm.cell);
        if (tx < 0 || ty < 0 || tx >= mm.w || ty >= mm.h) return;
        n.x = tx; n.y = ty;
        $('#f-x').value = tx;
        $('#f-y').value = ty;
        _drawMinimap(n);
        _markDirty(n);
      });
    }

    return { paint: paint, wire: wire, draw: _drawMinimap };
  })();

  // ────────────────────────────────────────────────────────────
  // _BehaviorTab
  // ────────────────────────────────────────────────────────────

  var _BehaviorTab = (function () {
    function paint(n) {
      $('#f-stepInterval').value = n.stepInterval != null ? n.stepInterval : 0;
      $('#f-verbArchetype').value = n.verbArchetype || '';
      $('#f-barkPool').value = n.barkPool || '';
      $('#f-barkRadius').value = n.barkRadius != null ? n.barkRadius : 0;
      $('#f-barkInterval').value = n.barkInterval != null ? n.barkInterval : 0;
      _renderPatrolList(n);
    }

    function _renderPatrolList(n) {
      var ul = $('#patrol-list');
      ul.innerHTML = '';
      var pts = n.patrolPoints || [];
      if (pts.length === 0) {
        var empty = document.createElement('li');
        empty.style.cssText = 'color:var(--muted); font-style:italic; padding:8px;';
        empty.textContent = 'No patrol points — NPC is stationary.';
        ul.appendChild(empty);
        return;
      }
      pts.forEach(function (p, i) {
        var li = document.createElement('li');
        li.innerHTML =
          '<span class="idx">' + (i + 1) + '.</span>' +
          '<span class="coord">(' + p.x + ', ' + p.y + ')</span>' +
          '<span class="face">' + (p.facing || 'east') + '</span>' +
          '<button data-idx="' + i + '" title="Remove">✕</button>';
        li.querySelector('button').addEventListener('click', function () {
          n.patrolPoints.splice(i, 1);
          if (n.patrolPoints.length === 0) n.patrolPoints = null;
          _markDirty(n);
          _renderPatrolList(n);
        });
        ul.appendChild(li);
      });
    }

    function wire() {
      $('#f-stepInterval').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        var v = parseInt(e.target.value, 10); if (isNaN(v)) return;
        n.stepInterval = v; _markDirty(n);
      });
      $('#f-verbArchetype').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.verbArchetype = e.target.value || null; _markDirty(n);
      });
      $('#f-barkPool').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.barkPool = e.target.value || null; _markDirty(n);
      });
      $('#f-barkRadius').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        var v = parseInt(e.target.value, 10); if (isNaN(v)) return;
        n.barkRadius = v; _markDirty(n);
      });
      $('#f-barkInterval').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        var v = parseInt(e.target.value, 10); if (isNaN(v)) return;
        n.barkInterval = v; _markDirty(n);
      });

      $('#btn-patrol-add').addEventListener('click', function () {
        var n = _state.byId[_state.activeId]; if (!n) return;
        var x = parseInt($('#f-patrol-x').value, 10);
        var y = parseInt($('#f-patrol-y').value, 10);
        var face = $('#f-patrol-facing').value;
        if (isNaN(x) || isNaN(y)) {
          _toast('warn', 'Enter integer X and Y.');
          return;
        }
        if (!Array.isArray(n.patrolPoints)) n.patrolPoints = [];
        n.patrolPoints.push({ x: x, y: y, facing: face });
        _markDirty(n);
        _renderPatrolList(n);
        $('#f-patrol-x').value = '';
        $('#f-patrol-y').value = '';
      });
      $('#btn-patrol-clear').addEventListener('click', function () {
        var n = _state.byId[_state.activeId]; if (!n) return;
        if (!n.patrolPoints || n.patrolPoints.length === 0) return;
        if (!confirm('Clear all ' + n.patrolPoints.length + ' patrol points?')) return;
        n.patrolPoints = null;
        _markDirty(n);
        _renderPatrolList(n);
      });
    }

    return { paint: paint, wire: wire };
  })();

  // ────────────────────────────────────────────────────────────
  // _StubTabs — Dialogue / Commerce / Reanim-Tier
  // ────────────────────────────────────────────────────────────

  var _StubTabs = (function () {
    function paintDialogue(n) {
      $('#f-dialoguePool').value = n.dialoguePool || '';
      $('#f-dialogueTreeId').value = n.dialogueTreeId || '';
    }
    function paintCommerce(n) {
      $('#f-gateCheck').value = n.gateCheck ? JSON.stringify(n.gateCheck, null, 2) : '';
    }
    function paintReanim(n) {
      $('#f-verbSet').value = n.verbSet || '';
      $('#f-verbFaction').value = n.verbFaction || '';
    }

    function wire() {
      $('#f-dialoguePool').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.dialoguePool = e.target.value || null; _markDirty(n);
      });
      $('#f-gateCheck').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        var txt = e.target.value.trim();
        if (!txt) { n.gateCheck = null; _markDirty(n); return; }
        try {
          n.gateCheck = JSON.parse(txt);
          e.target.style.borderColor = 'var(--border-mid)';
          _markDirty(n);
        } catch (err) {
          e.target.style.borderColor = 'var(--err)';
          // Don't mark dirty on parse failure — keeps previous value intact.
        }
      });
      $('#f-verbSet').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.verbSet = e.target.value || null; _markDirty(n);
      });
      $('#f-verbFaction').addEventListener('input', function (e) {
        var n = _state.byId[_state.activeId]; if (!n) return;
        n.verbFaction = e.target.value || null; _markDirty(n);
      });
    }

    return {
      paintDialogue: paintDialogue,
      paintCommerce: paintCommerce,
      paintReanim: paintReanim,
      wire: wire
    };
  })();

  // ────────────────────────────────────────────────────────────
  // Save — diff + blob download
  // ────────────────────────────────────────────────────────────

  // ── DOC-110 Phase 1.1 — Schema validation ───────────────────────────
  // Walks every NPC in the bundle and runs each through
  // SchemaValidator.validateActor(), returning a flat failure list.
  // Injects discriminator fields (kind='npc', floorId=<key>) the same
  // way tools/validate-npcs-preflight.js does — NPCs inside the bundle
  // are grouped by floor and don't carry those fields on disk.
  //
  // Graceful degradation: if SchemaValidator or ACTOR_SCHEMA is not
  // loaded, returns { skipped: true } so _download() can fall through
  // without blocking the user. (Prevents a half-installed tooling
  // state from locking authors out of their own save flow.)
  function _validateBundle(bundle) {
    if (typeof SchemaValidator === 'undefined' || !SchemaValidator ||
        typeof window.ACTOR_SCHEMA !== 'object' || !window.ACTOR_SCHEMA) {
      return { ok: true, skipped: true, failures: [], checked: 0 };
    }
    var schema = window.ACTOR_SCHEMA;
    var byFloor = bundle.npcsByFloor || {};
    var fids = Object.keys(byFloor);
    var failures = [];
    var checked = 0;
    for (var i = 0; i < fids.length; i++) {
      var fid = fids[i];
      var list = byFloor[fid] || [];
      for (var j = 0; j < list.length; j++) {
        var npc = list[j];
        checked++;
        var candidate = Object.assign({}, npc);
        if (candidate.kind == null)    candidate.kind    = 'npc';
        if (candidate.floorId == null) candidate.floorId = fid;
        var res;
        try {
          res = SchemaValidator.validate(schema, candidate, schema);
        } catch (e) {
          res = { ok: false, errors: [{ path: '', keyword: 'throw',
            message: String(e && e.message || e) }] };
        }
        if (!res.ok) {
          failures.push({
            floorId: fid,
            id:      npc.id || '(no id)',
            errors:  res.errors || []
          });
        }
      }
    }
    return { ok: failures.length === 0, skipped: false, failures: failures, checked: checked };
  }

  // Format a validation report into a confirm()-friendly multi-line
  // string. Capped at 8 NPCs / 1 error each to keep the dialog
  // readable — full details are always dumped to the console.
  function _formatValidationReport(report) {
    var lines = [];
    lines.push('Schema validation FAILED for ' + report.failures.length +
      ' of ' + report.checked + ' NPC(s):');
    lines.push('');
    var cap = Math.min(report.failures.length, 8);
    for (var i = 0; i < cap; i++) {
      var f = report.failures[i];
      var first = f.errors[0] || { path: '', keyword: '?', message: 'unknown' };
      lines.push('  [' + f.floorId + '] ' + f.id + '  →  ' +
        (first.path || '/') + '  ' + first.message);
    }
    if (report.failures.length > cap) {
      lines.push('  …and ' + (report.failures.length - cap) + ' more (see console).');
    }
    lines.push('');
    lines.push('OK = download anyway (data/npcs.json will load but the ' +
      'runtime may reject these NPCs). Cancel = fix them first.');
    return lines.join('\n');
  }

  function _download() {
    // Re-sort each floor's NPC list by id for stable diffs (matches
    // extract-npcs.js output).
    var sorted = {};
    var floorIds = Object.keys(_state.working.npcsByFloor).sort(_sortFloorIds);
    floorIds.forEach(function (fid) {
      sorted[fid] = (_state.working.npcsByFloor[fid] || []).slice().sort(function (a, b) {
        return (a.id || '').localeCompare(b.id || '');
      });
    });

    var out = {
      _meta: {
        generatedFrom: _state.working._meta ? _state.working._meta.generatedFrom : 'tools/npc-designer.html (DOC-110 P1 MVP)',
        generatedAt: new Date().toISOString(),
        generator: 'tools/npc-designer.html (DOC-110 P1 MVP)',
        schemaRef: 'tools/actor-schema.json',
        note: 'Hand-edited via NPC Designer. data/npcs.json is the sole runtime source of truth (DOC-110 Ch.5, 2026-04-17). Run tools/extract-npcs.js to normalise field order and refresh the sidecar.',
        floorCount: floorIds.length,
        npcCount: floorIds.reduce(function (acc, f) { return acc + sorted[f].length; }, 0),
        editedCount: Object.keys(_state.dirty).length
      },
      npcsByFloor: sorted
    };

    // ── Schema validation gate (DOC-110 P1.1) ────────────────────────
    var report = _validateBundle(out);
    if (report.skipped) {
      console.warn('[NpcDesigner] Schema validator not loaded — download proceeded without validation.');
    } else if (!report.ok) {
      // Log full details to console, show summary in confirm().
      console.group('[NpcDesigner] Schema validation failures (' +
        report.failures.length + ' / ' + report.checked + ' NPCs)');
      for (var i = 0; i < report.failures.length; i++) {
        var f = report.failures[i];
        console.warn('[' + f.floorId + '] ' + f.id, f.errors);
      }
      console.groupEnd();
      var proceed = confirm(_formatValidationReport(report));
      if (!proceed) {
        _toast('warn', 'Download cancelled — ' + report.failures.length +
          ' NPC(s) fail schema. See console for details.');
        return;
      }
      // Annotate the meta so downstream consumers can detect it.
      out._meta.validation = {
        ok: false,
        failureCount: report.failures.length,
        overriddenAt: new Date().toISOString()
      };
    } else {
      out._meta.validation = { ok: true, checked: report.checked };
    }

    var text = JSON.stringify(out, null, 2) + '\n';
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'npcs.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);

    var okSuffix = report.skipped ? ' (validation skipped)'
                 : report.ok     ? ' (schema OK)'
                                 : ' ⚠ override — ' + report.failures.length + ' schema failure(s)';
    _toast(report.ok || report.skipped ? 'good' : 'warn',
      'Downloaded npcs.json (' + out._meta.npcCount + ' NPCs, ' +
      Object.keys(_state.dirty).length + ' edited)' + okSuffix +
      '. Save to data/npcs.json then re-run extract-npcs.js.');

    // Reset dirty tracking after download (user committed to the file).
    _state.dirty = {};
    _updateStatus();
    _renderNpcList();
  }

  function _revert() {
    if (Object.keys(_state.dirty).length === 0) {
      _toast('', 'Nothing to revert.');
      return;
    }
    if (!confirm('Discard ' + Object.keys(_state.dirty).length + ' unsaved edit(s)?')) return;
    _state.working = clone(_state.original);
    var byId = {};
    Object.keys(_state.working.npcsByFloor || {}).forEach(function (fid) {
      (_state.working.npcsByFloor[fid] || []).forEach(function (n) { byId[n.id] = n; });
    });
    _state.byId = byId;
    _state.dirty = {};
    _updateStatus();
    _renderFloorChips();
    _renderNpcList();
    if (_state.activeId && _state.byId[_state.activeId]) {
      _selectNpc(_state.activeId);
    } else {
      $('#empty-state').style.display = 'flex';
      $('#editor-body').style.display = 'none';
      _state.activeId = null;
    }
    _toast('good', 'Reverted to last loaded state.');
  }

  // ────────────────────────────────────────────────────────────
  // Import — CSV / JSON roster (DOC-110 Phase 1.1)
  // ────────────────────────────────────────────────────────────
  //
  // Accepts three on-disk shapes:
  //   1. Full bundle:   { _meta, npcsByFloor: { "0": [...], ... } }
  //   2. Flat array:    [ { kind:'npc', id, floorId, ... }, ... ]
  //   3. CSV:           header row → field names, rows → NPCs.
  //
  // Every candidate is routed through SchemaValidator.validate()
  // against window.ACTOR_SCHEMA *before* it touches _state.working.
  // Validation failures are rejected with a per-row reason dumped
  // to the console; the user sees a roll-up in a confirm() summary.
  //
  // ID collisions prompt a single choice for the whole batch:
  //   OK      → overwrite (keep existing disk order, swap fields)
  //   Cancel  → rename (append _imported_N suffix via _uniqueId)
  //
  // Skip-all can be achieved by cancelling the outer "proceed?"
  // prompt after the summary.

  function _importTriggerFile() {
    var el = $('#import-file-input');
    if (!el) return;
    el.value = '';                      // reset so selecting same file re-fires change
    el.click();
  }

  function _importOnFile(evt) {
    var file = evt.target && evt.target.files && evt.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      _importFromText(String(reader.result || ''), file.name);
    };
    reader.onerror = function () {
      _toast('err', 'Failed to read ' + file.name);
    };
    reader.readAsText(file);
  }

  function _importFromText(text, filename) {
    var parsed;
    try {
      parsed = _parseImport(text, filename);
    } catch (e) {
      console.error('[NpcDesigner] Import parse failure', e);
      _toast('err', 'Parse failed: ' + (e && e.message || e));
      return;
    }
    if (!parsed.items.length) {
      _toast('warn', 'No NPC rows found in ' + filename + '.');
      return;
    }
    _processImportBatch(parsed.items, parsed.sourceKind, filename);
  }

  // Return { items: [{floorId, npc}], sourceKind: 'json-bundle'|'json-flat'|'csv' }
  function _parseImport(text, filename) {
    var trimmed = (text || '').replace(/^\ufeff/, '').trim();
    if (!trimmed) throw new Error('empty file');

    var looksJson = trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[';
    if (looksJson) {
      var obj = JSON.parse(trimmed);
      if (Array.isArray(obj)) {
        return { items: _flattenFlatArray(obj), sourceKind: 'json-flat' };
      }
      if (obj && obj.npcsByFloor && typeof obj.npcsByFloor === 'object') {
        return { items: _flattenBundle(obj.npcsByFloor), sourceKind: 'json-bundle' };
      }
      throw new Error('JSON root is neither an array nor a { npcsByFloor } bundle');
    }

    // Fall back to CSV
    return { items: _parseCsvRows(trimmed), sourceKind: 'csv' };
  }

  function _flattenBundle(byFloor) {
    var out = [];
    Object.keys(byFloor).forEach(function (fid) {
      (byFloor[fid] || []).forEach(function (npc) {
        var cand = Object.assign({}, npc);
        if (cand.floorId == null) cand.floorId = fid;
        if (cand.kind == null)    cand.kind    = 'npc';
        out.push({ floorId: String(cand.floorId), npc: cand });
      });
    });
    return out;
  }

  function _flattenFlatArray(arr) {
    return arr.filter(function (n) { return n && typeof n === 'object'; })
              .map(function (n) {
      var cand = Object.assign({}, n);
      if (cand.kind == null) cand.kind = 'npc';
      return { floorId: String(cand.floorId != null ? cand.floorId : ''), npc: cand };
    });
  }

  // ── CSV parser ──
  // Supports RFC-4180-ish quoted fields with escaped "" inside
  // quotes. Header row is mandatory. Column names become property
  // names. Empty cells become undefined (not empty-string) so the
  // schema's default values kick in.
  function _parseCsvRows(text) {
    var lines = _splitCsvRecords(text);
    if (!lines.length) throw new Error('CSV has no rows');
    var header = lines[0].map(function (h) { return h.trim(); });
    if (!header.length) throw new Error('CSV header row is empty');
    var out = [];
    for (var i = 1; i < lines.length; i++) {
      var row = lines[i];
      if (!row.length || (row.length === 1 && row[0] === '')) continue; // skip blank
      var obj = {};
      for (var c = 0; c < header.length; c++) {
        var key = header[c];
        if (!key) continue;
        var raw = row[c];
        if (raw === undefined || raw === '') continue;
        obj[key] = _csvCoerce(key, raw);
      }
      if (obj.kind == null) obj.kind = 'npc';
      out.push({ floorId: String(obj.floorId != null ? obj.floorId : ''), npc: obj });
    }
    return out;
  }

  // Walk the CSV text character-by-character — handles quoted
  // fields, doubled-quote escapes, and \r\n / \n line endings.
  function _splitCsvRecords(text) {
    var records = [];
    var cur = [''];
    var field = 0;
    var inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cur[field] += '"'; i++; }
          else { inQ = false; }
        } else {
          cur[field] += ch;
        }
        continue;
      }
      if (ch === '"') { inQ = true; continue; }
      if (ch === ',') { field++; cur[field] = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') {
        records.push(cur);
        cur = ['']; field = 0;
        continue;
      }
      cur[field] += ch;
    }
    if (cur.length && !(cur.length === 1 && cur[0] === '')) records.push(cur);
    return records;
  }

  // Per-field type coercion. Boolean + integer + numeric + JSON
  // (for nested patrolPoints / stack / sprites values). Strings
  // fall through unchanged.
  var _CSV_INT_FIELDS    = { x:1, y:1, stepInterval:1, barkInterval:1 };
  var _CSV_NUM_FIELDS    = { barkRadius:1 };
  var _CSV_BOOL_FIELDS   = { talkable:1, blocksMovement:1, home16Locked:1 };
  var _CSV_OBJ_FIELDS    = { patrolPoints:1, stack:1, sprites:1, gateCheck:1,
                             verbSet:1, brain:1 };

  function _csvCoerce(key, raw) {
    var v = String(raw);
    if (_CSV_BOOL_FIELDS[key]) {
      var lc = v.toLowerCase();
      if (lc === 'true' || lc === '1' || lc === 'yes') return true;
      if (lc === 'false' || lc === '0' || lc === 'no' || lc === '') return false;
      return v;
    }
    if (_CSV_INT_FIELDS[key]) {
      var i = parseInt(v, 10); return isNaN(i) ? v : i;
    }
    if (_CSV_NUM_FIELDS[key]) {
      var f = parseFloat(v);   return isNaN(f) ? v : f;
    }
    if (_CSV_OBJ_FIELDS[key]) {
      try { return JSON.parse(v); }
      catch (e) { return v; } // leave as string so schema flags it
    }
    if (v === 'null') return null;
    return v;
  }

  // ── Batch processor — validate → resolve collisions → merge ──
  function _processImportBatch(items, sourceKind, filename) {
    // 1. Per-item schema validation
    var valid = [];
    var failed = [];
    var schema = typeof window !== 'undefined' && window.ACTOR_SCHEMA;
    var validator = typeof SchemaValidator !== 'undefined' && SchemaValidator;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var cand = Object.assign({}, it.npc);
      if (cand.kind == null)    cand.kind    = 'npc';
      if (cand.floorId == null && it.floorId) cand.floorId = it.floorId;
      if (validator && schema) {
        var res;
        try { res = validator.validate(schema, cand, schema); }
        catch (e) { res = { ok: false, errors: [{ path: '', keyword: 'throw',
          message: String(e && e.message || e) }] }; }
        if (!res.ok) {
          failed.push({ row: i + 1, id: cand.id || '(no id)', errors: res.errors });
          continue;
        }
      }
      valid.push(cand);
    }

    // 2. Split valid into { new, collisions }
    var added = [];
    var collisions = [];
    for (var j = 0; j < valid.length; j++) {
      var n = valid[j];
      if (n.id && _state.byId[n.id]) collisions.push(n);
      else                           added.push(n);
    }

    // 3. Collision resolution prompt (batch-wide choice)
    var collisionMode = 'rename';
    if (collisions.length > 0) {
      var overwrite = confirm(collisions.length + ' NPC(s) in ' + filename +
        ' collide with existing ids. OK = overwrite in place, Cancel = rename (append _imported_N).');
      collisionMode = overwrite ? 'overwrite' : 'rename';
    }

    // 4. Summary gate
    var summaryLines = [
      'Import from ' + filename + ' (' + sourceKind + ')',
      '',
      '  parsed rows ....... ' + items.length,
      '  passed schema ..... ' + valid.length,
      '  failed schema ..... ' + failed.length,
      '  new ids ........... ' + added.length,
      '  collisions ........ ' + collisions.length + ' (' + collisionMode + ')',
      ''
    ];
    if (failed.length) {
      summaryLines.push('First failure: row ' + failed[0].row + ' ("' +
        failed[0].id + '") → ' + (failed[0].errors[0] && failed[0].errors[0].message || '?'));
      summaryLines.push('');
    }
    summaryLines.push('Proceed with import? (Failed rows are always skipped; see console for full details.)');
    if (failed.length) {
      console.group('[NpcDesigner] Import validation failures (' + failed.length + ')');
      failed.forEach(function (f) { console.warn('row ' + f.row, f.id, f.errors); });
      console.groupEnd();
    }
    if (!added.length && !collisions.length) {
      _toast('warn', 'Nothing to import — all ' + items.length + ' rows failed schema.');
      return;
    }
    if (!confirm(summaryLines.join('\n'))) {
      _toast('', 'Import cancelled.');
      return;
    }

    // 5. Merge
    var mergedCount = 0;
    added.forEach(function (npc) {
      var fid = String(npc.floorId || _state.floorIds[0] || '0');
      if (!_state.working.npcsByFloor[fid]) _state.working.npcsByFloor[fid] = [];
      _state.working.npcsByFloor[fid].push(npc);
      _state.byId[npc.id] = npc;
      _state.dirty[npc.id] = true;
      mergedCount++;
    });
    collisions.forEach(function (npc) {
      var fid = String(npc.floorId || _state.floorIds[0] || '0');
      if (!_state.working.npcsByFloor[fid]) _state.working.npcsByFloor[fid] = [];
      if (collisionMode === 'overwrite') {
        // Find existing and replace in-place (preserves floor + order)
        var existing = _state.byId[npc.id];
        var existingFid = String(existing.floorId || fid);
        var list = _state.working.npcsByFloor[existingFid] || [];
        var idx = list.indexOf(existing);
        if (idx >= 0) list[idx] = npc;
        else list.push(npc);
        _state.byId[npc.id] = npc;
        _state.dirty[npc.id] = true;
        mergedCount++;
      } else {
        // Rename + append
        var originalId = npc.id;
        npc.id = _uniqueId(originalId + '_imported');
        _state.working.npcsByFloor[fid].push(npc);
        _state.byId[npc.id] = npc;
        _state.dirty[npc.id] = true;
        mergedCount++;
      }
    });

    _renderFloorChips();
    _renderNpcList();
    _updateStatus();
    _toast('good', 'Imported ' + mergedCount + ' NPC(s) from ' + filename +
      (failed.length ? ' (' + failed.length + ' rejected)' : ''));
  }

  // ────────────────────────────────────────────────────────────
  // Stamp from archetype (P1.1.2 — bulk-add)
  // ────────────────────────────────────────────────────────────
  //
  // Reads tools/archetype-registry.js (window.ARCHETYPE_REGISTRY) and
  // stamps N NPCs from a chosen archetype onto a target floor. Each
  // stamp:
  //   • clones archetype.defaults
  //   • rotates emoji from archetype.emojiPool
  //   • jitters barkInterval by ±barkIntervalJitter
  //   • substitutes {n} in idPattern + namePattern using a per-archetype
  //     suffix counter that surveys existing _state.byId for collisions
  //   • validates against window.ACTOR_SCHEMA (if loaded) — rejects fail
  //   • grid-spreads positions 3 wide × N tall from the anchor
  // Collisions on id are avoided via _uniqueId. Batch is gated behind a
  // confirm() showing the built count + any rejections.

  var _stampState = { open: false };

  function _stampOpen() {
    var panel = $('#stamp-panel');
    if (!panel) return;
    var reg = typeof window !== 'undefined' && window.ARCHETYPE_REGISTRY;
    if (!reg || !Array.isArray(reg.archetypes) || !reg.archetypes.length) {
      _toast('err', 'archetype-registry.js not loaded or empty.');
      return;
    }
    var sel = $('#stamp-archetype'); sel.innerHTML = '';
    reg.archetypes.forEach(function (a) {
      var o = document.createElement('option');
      o.value = a.id;
      o.textContent = a.displayName + '  (' + a.category + ')';
      sel.appendChild(o);
    });
    sel.onchange = _stampSyncDesc;

    var fs = $('#stamp-floor'); fs.innerHTML = '';
    var preferred = _state.filter.floor || _state.floorIds[0];
    _state.floorIds.forEach(function (fid) {
      var o = document.createElement('option');
      o.value = fid; o.textContent = fid;
      if (fid === preferred) o.selected = true;
      fs.appendChild(o);
    });

    _stampSyncDesc();
    panel.classList.remove('hidden');
    _stampState.open = true;
  }

  function _stampSyncDesc() {
    var reg = window.ARCHETYPE_REGISTRY;
    if (!reg) return;
    var id = $('#stamp-archetype').value;
    var a = reg.archetypes.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    $('#stamp-desc').textContent = a.description || '';
    if (Array.isArray(a.recommendedCount) && a.recommendedCount.length === 2) {
      var lo = a.recommendedCount[0], hi = a.recommendedCount[1];
      $('#stamp-count').value = lo;
      $('#stamp-count').min = 1;
      $('#stamp-count').max = Math.max(hi, 25);
      $('#stamp-count-hint').textContent = 'recommended ' + lo + '–' + hi;
    } else {
      $('#stamp-count-hint').textContent = '';
    }
  }

  function _stampClose() {
    var panel = $('#stamp-panel');
    if (panel) panel.classList.add('hidden');
    _stampState.open = false;
  }

  function _stampApply() {
    var reg = window.ARCHETYPE_REGISTRY;
    if (!reg) { _toast('err', 'Archetype registry unavailable.'); return; }
    var archId = $('#stamp-archetype').value;
    var archetype = reg.archetypes.filter(function (x) { return x.id === archId; })[0];
    if (!archetype) { _toast('err', 'Archetype not found: ' + archId); return; }

    var count = Math.max(1, Math.min(25, parseInt($('#stamp-count').value, 10) || 1));
    var floorId = String($('#stamp-floor').value);
    var ax = Math.max(0, Math.min(127, parseInt($('#stamp-x').value, 10) || 0));
    var ay = Math.max(0, Math.min(127, parseInt($('#stamp-y').value, 10) || 0));

    // idPattern may reference {floorId} and {n}
    var idPattern = (archetype.idPattern || (archetype.id + '_{n}')).replace('{floorId}', floorId);

    // Find the highest existing {n} suffix for this archetype+floor
    // prefix so we don't stomp existing ids even before _uniqueId runs.
    var prefix = idPattern.replace('{n}', '');
    var maxN = 0;
    Object.keys(_state.byId).forEach(function (id) {
      if (id.indexOf(prefix) !== 0) return;
      var m = id.substring(prefix.length).match(/^(\d+)/);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    });

    var built = [];
    var stampFailures = [];
    var schema = typeof window !== 'undefined' && window.ACTOR_SCHEMA;
    var validator = typeof SchemaValidator !== 'undefined' && SchemaValidator;

    for (var i = 0; i < count; i++) {
      var n = maxN + i + 1;
      var npc = JSON.parse(JSON.stringify(archetype.defaults || {}));
      npc.floorId = floorId;
      // Grid spread: 3 wide × N tall
      npc.x = Math.min(127, ax + (i % 3));
      npc.y = Math.min(127, ay + Math.floor(i / 3));
      if (Array.isArray(archetype.emojiPool) && archetype.emojiPool.length) {
        npc.emoji = archetype.emojiPool[i % archetype.emojiPool.length];
      } else {
        npc.emoji = npc.emoji || '🧑';
      }
      if (archetype.barkIntervalJitter && typeof npc.barkInterval === 'number') {
        var j = Math.round((Math.random() - 0.5) * 2 * archetype.barkIntervalJitter);
        npc.barkInterval = Math.max(1000, npc.barkInterval + j);
      }
      npc.id   = _uniqueId(idPattern.replace('{n}', String(n)));
      npc.name = (archetype.namePattern || (archetype.displayName + ' {n}')).replace('{n}', String(n));

      if (validator && schema) {
        var res;
        try { res = validator.validate(schema, npc, schema); }
        catch (e) { res = { ok: false, errors: [{ path: '', keyword: 'throw', message: String(e.message || e) }] }; }
        if (!res.ok) {
          stampFailures.push({ idx: i, id: npc.id, errors: res.errors });
          continue;
        }
      }
      built.push(npc);
    }

    if (stampFailures.length) {
      console.group('[NpcDesigner] Stamp schema failures (' + stampFailures.length + ')');
      stampFailures.forEach(function (f) { console.warn('stamp', f.idx, f.id, f.errors); });
      console.groupEnd();
    }
    if (!built.length) {
      _toast('warn', 'Stamp produced 0 valid NPCs (all ' + count + ' rejected).');
      return;
    }

    var ok = confirm('Stamp ' + built.length + ' "' + archetype.displayName +
      '" NPC(s) onto floor ' + floorId + ' starting at (' + ax + ',' + ay + ')?' +
      (stampFailures.length ? '\n(' + stampFailures.length + ' rejected by schema — see console)' : ''));
    if (!ok) { _toast('', 'Stamp cancelled.'); return; }

    built.forEach(function (npc) {
      if (!_state.working.npcsByFloor[floorId]) _state.working.npcsByFloor[floorId] = [];
      _state.working.npcsByFloor[floorId].push(npc);
      _state.byId[npc.id] = npc;
      _state.dirty[npc.id] = true;
    });

    _renderFloorChips();
    _renderNpcList();
    _updateStatus();
    _stampClose();
    _toast('good', 'Stamped ' + built.length + ' "' + archetype.id +
      '" NPC(s) on floor ' + floorId +
      (stampFailures.length ? ' (' + stampFailures.length + ' rejected)' : ''));
  }

  // ────────────────────────────────────────────────────────────
  // New / Duplicate / Delete
  // ────────────────────────────────────────────────────────────

  function _newNpc() {
    var fid = _state.filter.floor || _state.floorIds[0] || '0';
    var id = _uniqueId('npc_new');
    var npc = {
      kind: 'npc',
      id: id,
      type: 'interactive',
      floorId: fid,
      x: 0, y: 0, facing: 'south',
      name: 'New NPC',
      emoji: '🙂',
      role: null,
      patrolPoints: null,
      stepInterval: 0,
      barkPool: null,
      barkRadius: 0,
      barkInterval: 0,
      talkable: true,
      dialoguePool: null,
      dialogueTreeId: null,
      factionId: null,
      blocksMovement: false,
      gateCheck: null,
      verbArchetype: null,
      verbSet: null,
      verbFaction: null
    };
    if (!_state.working.npcsByFloor[fid]) _state.working.npcsByFloor[fid] = [];
    _state.working.npcsByFloor[fid].push(npc);
    _state.byId[id] = npc;
    _markDirty(npc);
    _renderFloorChips();
    _selectNpc(id);
    _toast('good', 'Created ' + id + ' on floor ' + fid);
  }

  function _duplicate() {
    var n = _state.byId[_state.activeId]; if (!n) return;
    var copy = clone(n);
    copy.id = _uniqueId(n.id + '_copy');
    copy.name = (n.name || n.id) + ' (copy)';
    _state.working.npcsByFloor[n.floorId].push(copy);
    _state.byId[copy.id] = copy;
    _markDirty(copy);
    _renderFloorChips();
    _selectNpc(copy.id);
    _toast('good', 'Duplicated as ' + copy.id);
  }

  function _deleteActive() {
    var n = _state.byId[_state.activeId]; if (!n) return;
    if (!confirm('Delete ' + n.id + ' (' + n.name + ') from floor ' + n.floorId + '?')) return;
    var list = _state.working.npcsByFloor[n.floorId] || [];
    var idx = list.indexOf(n);
    if (idx !== -1) list.splice(idx, 1);
    delete _state.byId[n.id];
    _state.dirty[n.id] = true; // Mark as edited so save is offered
    _state.activeId = null;
    $('#empty-state').style.display = 'flex';
    $('#editor-body').style.display = 'none';
    _renderFloorChips();
    _renderNpcList();
    _updateStatus();
    _toast('warn', 'Deleted ' + n.id);
  }

  function _uniqueId(base) {
    var id = base, n = 1;
    while (_state.byId[id]) id = base + '_' + (++n);
    return id;
  }

  // ────────────────────────────────────────────────────────────
  // Toast
  // ────────────────────────────────────────────────────────────

  var _toastTimer = null;
  function _toast(kind, msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'nd-toast show ' + (kind || '');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 3200);
  }

  // ────────────────────────────────────────────────────────────
  // Init
  // ────────────────────────────────────────────────────────────

  function init() {
    if (!_loadData()) return;

    _renderFloorChips();
    _renderNpcList();
    _wireTabs();
    _IdentityTab.wire();
    _StackEditor.wire();
    _SpriteEditor.wire();
    _PlacementTab.wire();
    _BehaviorTab.wire();
    _StubTabs.wire();

    // Search
    $('#search-input').addEventListener('input', function (e) {
      _state.filter.text = e.target.value;
      _renderNpcList();
    });

    // Header buttons
    $('#btn-download').addEventListener('click', _download);
    $('#btn-revert').addEventListener('click', _revert);
    $('#btn-new-npc').addEventListener('click', _newNpc);

    // Import (.json bundle / flat array / .csv)
    var _btnImport = $('#btn-import');
    var _importInput = $('#import-file-input');
    if (_btnImport && _importInput) {
      _btnImport.addEventListener('click', _importTriggerFile);
      _importInput.addEventListener('change', _importOnFile);
    }

    // Stamp from archetype (bulk add)
    var _btnStamp = $('#btn-stamp');
    if (_btnStamp) {
      _btnStamp.addEventListener('click', function () {
        if (_stampState.open) _stampClose();
        else                  _stampOpen();
      });
      var _btnStampClose  = $('#btn-stamp-close');
      var _btnStampCancel = $('#btn-stamp-cancel');
      var _btnStampApply  = $('#btn-stamp-apply');
      if (_btnStampClose)  _btnStampClose .addEventListener('click', _stampClose);
      if (_btnStampCancel) _btnStampCancel.addEventListener('click', _stampClose);
      if (_btnStampApply)  _btnStampApply .addEventListener('click', _stampApply);
      // Esc closes the panel
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && _stampState.open) _stampClose();
      });
    }

    // Editor-header buttons
    $('#btn-duplicate').addEventListener('click', _duplicate);
    $('#btn-delete').addEventListener('click', _deleteActive);

    // Warn on unload
    window.addEventListener('beforeunload', function (e) {
      if (Object.keys(_state.dirty).length === 0) return;
      e.preventDefault();
      e.returnValue = 'Unsaved NPC edits will be lost.';
      return e.returnValue;
    });

    _updateStatus();
    var s = $('#status-indicator');
    s.textContent = (_state.working._meta ? _state.working._meta.npcCount : '?') + ' NPCs loaded';
    s.className = 'status';

    console.log('[npc-designer] Initialised. ' +
      (_state.working._meta ? _state.working._meta.npcCount : '?') + ' NPCs across ' +
      Object.keys(_state.working.npcsByFloor || {}).length + ' floors.');
  }

  // Public surface (debugging hooks)
  return {
    init: init,
    _debug: function () {
      return {
        state: _state,
        pickRandom: function () {
          var ids = Object.keys(_state.byId);
          return ids[Math.floor(Math.random() * ids.length)];
        }
      };
    }
  };
})();

// Auto-boot when DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', NpcDesigner.init);
} else {
  NpcDesigner.init();
}
