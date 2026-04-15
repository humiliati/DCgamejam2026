// bv-help.js — Help modal with tabbed reference for keyboard/tools,
// overlays, save behavior, validation, meta editor, agent API, workflows,
// and the planned world-designer -> BO-V handoff.
//
// Opens on: click #btn-help, press '?' or F1
// Closes on: click #help-close, Escape key, or backdrop click.
//
// Content is authored here (not HTML) so it can evolve with the tool
// without touching the page skeleton. Each tab is a pure function that
// returns an HTMLElement; tabs are rebuilt lazily on first open.

(function() {
  'use strict';

  var modal = null;
  var body = null;
  var tabsEl = null;
  var currentTab = 'controls';
  var built = false;

  // -------------- tab definitions --------------
  // Each entry: { id, label, render: () => HTMLElement }
  var TABS = [
    { id: 'controls',   label: 'Controls',    render: renderControls },
    { id: 'overlays',   label: 'Overlays',    render: renderOverlays },
    { id: 'save',       label: 'Save & Diff', render: renderSave },
    { id: 'validate',   label: 'Validation',  render: renderValidate },
    { id: 'meta',       label: 'Meta Panel',  render: renderMeta },
    { id: 'agent',      label: 'Agent API',   render: renderAgent },
    { id: 'workflows',  label: 'Workflows',   render: renderWorkflows },
    { id: 'newfloor',   label: 'New Floor',   render: renderNewFloor }
  ];

  // -------------- DOM helpers --------------
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k === 'text') e.textContent = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (kids) {
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (c == null) continue;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return e;
  }

  function table(headers, rows) {
    var thead = el('thead', null, [
      el('tr', null, headers.map(function(h) { return el('th', null, [h]); }))
    ]);
    var tbody = el('tbody', null, rows.map(function(r) {
      return el('tr', null, r.map(function(cell) {
        if (cell && cell.nodeType) return el('td', null, [cell]);
        return el('td', null, [String(cell)]);
      }));
    }));
    return el('table', { class: 'help-table' }, [thead, tbody]);
  }

  function kbd(txt) { return el('kbd', null, [txt]); }
  function code(txt) { return el('code', null, [txt]); }
  function section(title, kids) {
    return el('section', { class: 'help-section' }, [
      el('h4', null, [title])
    ].concat(kids));
  }
  function p(txt) { return el('p', null, [txt]); }
  function pHtml(html) { return el('p', { html: html }); }

  // -------------- tab renderers --------------
  function renderControls() {
    return el('div', null, [
      section('Tools', [
        p('Toggle edit mode with E (or the Edit button). Tool shortcuts only work in edit mode.'),
        table(['Tool', 'Key', 'Behavior'], [
          ['Paint',       kbd('P'), 'Click / drag to paint. Stroke = one undo step.'],
          ['Rectangle',   kbd('R'), 'Drag to fill a rect. Hold Shift for outline-only.'],
          ['Line',        kbd('N'), 'Drag for a Bresenham line (5000-cell cap).'],
          ['Bucket fill', kbd('F'), 'Flood-fill 4-connected same-tile cells.'],
          ['Replace all', kbd('X'), 'Click a cell — all same-ID tiles on the floor become paint tile.'],
          ['Lasso',       kbd('L'), 'Drag rect to select. Drag inside = move. Enter / Esc commit / cancel.'],
          ['Paste',       kbd('V'), 'Green clipboard ghost follows cursor; click to stamp.']
        ])
      ]),
      section('Brush & quick-select', [
        pHtml('Cycle brush size with <kbd>[</kbd> / <kbd>]</kbd>. Sizes: 1×1, 2×2, 3×3, 5×5 (Paint / Rect / Line).'),
        pHtml('Number keys <kbd>0</kbd>–<kbd>9</kbd> quick-select common tiles: 0 EMPTY · 1 WALL · 2 DOOR · 3 TREE · 4 SHRUB · 5 ROAD · 6 PATH · 7 GRASS · 8 FENCE · 9 PILLAR.'),
        pHtml('<kbd>Right-click</kbd> a cell to eyedropper-pick its tile into the brush.')
      ]),
      section('Selection & clipboard', [
        table(['Action', 'Shortcut'], [
          ['Copy selection',           kbd('Ctrl+C')],
          ['Cut selection (fill tile)', kbd('Ctrl+X')],
          ['Paste at cursor',          el('span', null, [kbd('Ctrl+V'), ' or ', kbd('V')])],
          ['Commit / cancel float',    el('span', null, [kbd('Enter'), ' / ', kbd('Esc')])]
        ]),
        p('Clipboard survives floor switches. Badge next to the brush picker shows a thumbnail + W×H + source floor; badge turns amber when source ≠ current floor. Click the badge to jump back.')
      ]),
      section('History', [
        table(['Action', 'Shortcut'], [
          ['Undo',       kbd('Ctrl+Z')],
          ['Redo',       el('span', null, [kbd('Ctrl+Shift+Z'), ' / ', kbd('Ctrl+Y')])],
          ['Revert all', 'Revert button (confirms)']
        ]),
        p('Every floor has its own undo/redo stack. Switching floors parks the outgoing stack under its floor id.')
      ]),
      section('View & camera', [
        table(['Action', 'Input'], [
          ['Pan',                 'Left-drag (view), Shift+drag (edit), middle-drag'],
          ['Zoom',                'Scroll wheel (zooms toward cursor)'],
          ['Fit to screen',       kbd('F')],
          ['Toggle grid lines',   kbd('G')],
          ['Toggle legend',       el('span', null, [kbd('L'), ' (view mode only)'])]
        ])
      ])
    ]);
  }

  function renderOverlays() {
    return el('div', null, [
      section('Toggles', [
        table(['Overlay', 'Toggle', 'What it shows'], [
          ['Grid lines',    kbd('G'),                                          'Cell-boundary grid.'],
          ['Room boxes',    el('span', null, [kbd('R'), ' (view mode)']),      'Yellow dashed rectangles with an optional center marker.'],
          ['Door targets',  kbd('D'),                                          'Red diamonds labeled with destination floor id.'],
          ['Tile IDs',      kbd('I'),                                          'Per-cell text overlay: numeric ID or tile glyph.'],
          ['Legend panel',  el('span', null, [kbd('L'), ' (view mode)']),      'Swatch + name list; click a row to set the paint tile.']
        ])
      ]),
      section('Always-on', [
        table(['Marker', 'Look', 'Meaning'], [
          ['Spawn',        'Magenta circle', 'The floor\u2019s current SPAWN position.'],
          ['Entry/stairs', 'Colored borders', 'Drawn from the floor\u2019s doors object (stairsUp, stairsDn, doorExit).'],
          ['Dirty cells',  'Red border (edit mode only)', 'Any cell that differs from the loaded grid.']
        ])
      ]),
      section('Tooltip', [
        p('Hover any cell to see tile name, ID, category, walkability, opacity, room membership, door target, and exterior-face direction. In edit mode, modified cells also show the original tile they replaced.')
      ])
    ]);
  }

  function renderSave() {
    return el('div', null, [
      section('Direct file write (preferred)', [
        pHtml('<kbd>Ctrl+S</kbd> or the <b>Save</b> button patches the floor\u2019s <code>engine/floor-blockout-*.js</code> file in place, with a color-coded diff modal for confirmation.'),
        pHtml('<b>As of 2026-04-14, the patcher rewrites three blocks</b> (before: only GRID):'),
        el('ul', null, [
          el('li', null, [code('var GRID = [[...]]'), ' — the grid literal']),
          el('li', null, [code('var SPAWN = { x, y, dir }'), ' — spawn position + direction']),
          el('li', null, [code('doorTargets: { ... }'), ' — inline in ', code('registerFloorBuilder'), ' return, OR scaffold ', code('var DOOR_TARGETS = { ... }')])
        ]),
        p('Everything else in the file (ROOMS, build(), script guards, registration, header comment) is preserved byte-for-byte. The save modal shows three options: Cancel, Download instead, Write to file.'),
        p('First save of a session prompts you to pick your engine/ directory via File System Access API. The browser remembers the handle for the page session.'),
        p('On file:// or browsers without the File System Access API, save falls back to a Blob download of the patched file.')
      ]),
      section('Clipboard export (legacy)', [
        el('ul', null, [
          el('li', null, [el('b', null, ['Copy Full']), ' — whole grid as a JS array literal, ready to paste into a floor builder.']),
          el('li', null, [el('b', null, ['Copy Diff']), ' — only changed cells; unchanged cells render as ', code('..'), ', unchanged rows collapse to a comment. Good for code review.'])
        ])
      ])
    ]);
  }

  function renderValidate() {
    return el('div', null, [
      section('Per-floor checks', [
        table(['Check', 'Severity', 'What it catches'], [
          ['spawn-missing',       'err',  'Floor has no spawn (and isn\u2019t floor "0"\u2019s legacy fallback).'],
          ['spawn-oob',           'err',  'Spawn coords fall outside grid dimensions.'],
          ['spawn-blocked',       'err',  'Spawn lands on a non-walkable tile.'],
          ['unreachable',         'warn', 'Walkable cells a BFS from spawn can\u2019t reach (grouped).'],
          ['door-fallback',       'info', 'Door tile has no explicit doorTargets entry (engine uses parent/child convention).'],
          ['exterior-no-entry',   'warn', 'Depth-1 exterior floor has no ARCH_DOORWAY or door tile.']
        ])
      ]),
      section('Cross-floor checks', [
        table(['Check', 'Severity', 'What it catches'], [
          ['door-target-missing', 'err',  'doorTargets entry points to a floor that isn\u2019t in FLOORS.'],
          ['no-return-door',      'warn', 'Target floor has no door tiles — one-way transition.']
        ])
      ]),
      section('Severity colors', [
        pHtml('<span class="help-sev err">ERR</span> blocks the floor from shipping · <span class="help-sev warn">WARN</span> should be reviewed · <span class="help-sev info">INFO</span> intentional fallback.'),
        p('Click any row in the report to jump the camera to the flagged cell and paint a severity-colored border on the issue region. The first cell also pulses with a translucent fill. Esc or Close clears the overlay.')
      ])
    ]);
  }

  function renderMeta() {
    return el('div', null, [
      section('Metadata panel', [
        pHtml('Toggle with <kbd>M</kbd> or the Meta button. Panel sits top-right of the canvas.'),
        el('ul', null, [
          el('li', null, [el('b', null, ['Spawn']), ' — current (x, y) coords + a Move button. Click Move, then click anywhere on the grid to set the new spawn.']),
          el('li', null, [el('b', null, ['Door targets']), ' — one row per door-like tile on the floor with a target-floor dropdown. ', code('(fallback)'), ' at the top of the list deletes the explicit entry so the engine uses parent/child convention. \u2192 button centers the camera on the door.'])
        ])
      ]),
      section('Persistence', [
        pHtml('All meta edits land in the per-floor undo stack as <code>{ type: "meta" }</code> entries — roll them back with <kbd>Ctrl+Z</kbd>/<kbd>Ctrl+Shift+Z</kbd> the same as paint operations.'),
        pHtml('<b>Ctrl+S persists spawn + doorTargets directly</b> to the floor source. "Copy meta JSON" is no longer required for those fields; it\u2019s retained for manual paste into sibling floors or migrations.')
      ])
    ]);
  }

  function renderAgent() {
    var actions = 'describe, floodFill, getFloor, listFloors, paint, paintLine, paintRect, redo, replaceAllOfType, resize, save, selectFloor, setDoorTarget, setSpawn, stampClipboard, undo, validate, renderAscii, diffAscii, describeCell, reportValidation, captureFloor, tile, tileName, tileSchema, findTiles, stampRoom, stampCorridor, stampTorchRing, saveStamp, applyStamp, listStamps, deleteStamp, exportStamps, importStamps';
    return el('div', null, [
      section('In-page router: window.BO.run({ action, ... })', [
        p('Every action maps 1:1 to an existing editor primitive — agent edits land in the same undo stack, validation loop, and dirty counter as human edits.'),
        pHtml('Returns <code>{ ok:true, action, result }</code> on success or <code>{ ok:false, error, action }</code> on failure. Any action accepts optional <code>postValidate: \'current\' | \'all\'</code> to append a validation report.'),
        p('Tile references accept either numeric IDs or case-insensitive schema names (\'WALL\', \'DOOR\', \'ROAD\'). Missing floor field targets the currently-loaded floor.'),
        el('details', null, [
          el('summary', null, ['All actions']),
          el('p', { class: 'help-actions-list' }, [actions])
        ])
      ]),
      section('Perception (no vision required)', [
        pHtml('<code>renderAscii</code> — grid as ASCII glyphs with reverse-lookup legend. <code>diffAscii</code> — compare to a prior snapshot. <code>describeCell</code> — tooltip payload for one cell. <code>reportValidation</code> — headless validation. <code>captureFloor</code> — base64 PNG for vision-capable agents.')
      ]),
      section('Tile lookup', [
        pHtml('<code>BO.tile(\'WALL\')</code> → id · <code>BO.tileName(1)</code> → name · <code>BO.tileSchema(\'WALL\')</code> → full entry · <code>BO.findTiles({ isDoor:true })</code> → filtered array. Filters: name (string or /regex/flags), category, glyph, walk, opaque, hazard, isDoor, isFreeform, isFloating, isCrenellated, isFloatingMoss, isFloatingLid, isFloatingBackFace, isWindow, isTorch.')
      ]),
      section('Stamp library', [
        pHtml('Parametric: <code>stampRoom</code>, <code>stampCorridor</code>, <code>stampTorchRing</code>. Named registry: <code>saveStamp</code> / <code>applyStamp</code> (with <code>rotate</code>, <code>flipH</code>) / <code>listStamps</code> / <code>deleteStamp</code>. Cross-session: <code>exportStamps</code> / <code>importStamps</code>. Browser registry is in-memory; CLI persists to <code>tools/stamps.json</code>.')
      ]),
      section('Node CLI — tools/blockout-cli.js', [
        p('Same vocabulary as BO.run, but mutates tools/floor-data.json directly. Useful for batch edits, CI, and agents that can\u2019t keep a browser open.'),
        p('CLI does NOT rewrite engine/floor-blockout-*.js — direct-write requires the browser\u2019s File System Access API. Use BO.run({action:"save"}) or the Save button for the round-trip to engine source.')
      ])
    ]);
  }

  function renderWorkflows() {
    return el('div', null, [
      section('Editing an existing floor', [
        el('ol', null, [
          el('li', null, ['Run ', code('node tools/extract-floors.js'), ' to refresh the sidecars.']),
          el('li', null, ['Open the visualizer, select the floor.']),
          el('li', null, [pHtml('Press <kbd>E</kbd> to enter edit mode.')]),
          el('li', null, ['Paint / rect / line / bucket / lasso / replace as needed.']),
          el('li', null, [pHtml('<kbd>Ctrl+S</kbd> → pick engine/ dir (first time only) → confirm diff → Write to file.')]),
          el('li', null, ['Re-run the game — the change is live.'])
        ])
      ]),
      section('Fixing validator errors', [
        el('ol', null, [
          el('li', null, ['Click ', el('b', null, ['Validate']), ' — issues surface with severity colors.']),
          el('li', null, ['Click any row to jump the camera to the flagged cell.']),
          el('li', null, [pHtml('For door-target issues: press <kbd>M</kbd> to open the Meta panel, pick the correct floor from the dropdown, <kbd>Ctrl+S</kbd>.')]),
          el('li', null, [pHtml('For spawn issues: use <b>Move</b> in Meta panel, click the new spawn cell, <kbd>Ctrl+S</kbd>.')]),
          el('li', null, ['Re-run Validate to confirm.'])
        ])
      ]),
      section('Authoring a window scene', [
        el('ol', null, [
          el('li', null, ['Select an interior floor with windows (depth 2, e.g. "1.1" Coral Bazaar).']),
          el('li', null, ['Click any row in the Windows panel to open the scene editor.']),
          el('li', null, ['Click ', el('b', null, ['Jump to parent floor']), '.']),
          el('li', null, [pHtml('Press <kbd>L</kbd>, drag a selection, <kbd>Ctrl+C</kbd>.')]),
          el('li', null, ['Re-click the window row on the interior, click ', el('b', null, ['Stamp clipboard at (0,0)']), '.']),
          el('li', null, ['Paint to adjust, then ', el('b', null, ['Download window-scenes.json']), ' to export.'])
        ])
      ])
    ]);
  }

  function renderNewFloor() {
    return el('div', null, [
      section('Current state (manual)', [
        el('ol', null, [
          el('li', null, ['Pick an existing floor of similar size as a starting point.']),
          el('li', null, ['Use resize controls to adjust dimensions.']),
          el('li', null, ['Paint / lasso / bucket the new layout.']),
          el('li', null, [el('b', null, ['Copy Full']), ' → paste into a new ', code('engine/floor-blockout-*.js'), ' file.']),
          el('li', null, ['Register with ', code('FloorManager.registerFloorBuilder(\'ID\', builderFn)'), '.']),
          el('li', null, ['Add the ', code('<script>'), ' tag to ', code('index.html'), ' at the correct layer.']),
          el('li', null, ['Re-run ', code('extract-floors.js'), ' so the new floor appears in the dropdown.'])
        ])
      ]),
      section('Planned: World Designer \u2192 BO-V handoff', [
        el('div', { class: 'help-planned' }, [
          pHtml('<b>Coming soon.</b> The <code>tools/world-designer.html</code> tool will own floor birth: create a node in the world graph, declare its biome + depth + intended connections. World Designer then launches BO-V with a <b>seed payload</b>:'),
          el('ul', null, [
            el('li', null, ['Biome-default starting grid (walls, floor tile, exterior/interior framing, border treatment).']),
            el('li', null, ['Pre-stamped required tiles per BLOCKOUT_REFRESH_PLAN \u00a77 (gate arches, boss doors, DOOR_FACADE entrances where the plan requires).']),
            el('li', null, ['Pinned door targets — the connections declared in the world graph arrive as validated ', code('doorTargets'), ' entries you can\u2019t accidentally delete.']),
            el('li', null, ['Dimensions from the world graph\u2019s floor-size policy (e.g. Floor 3 = 48\u00d732 decompression zone).'])
          ]),
          pHtml('Contributor\u2019s job in BO-V: cut the shape, place buildings, route walkable paths. Save writes the scaffold <code>engine/floor-blockout-ID.js</code>, registers the script tag, and updates the sidecars in one round-trip.'),
          pHtml('Tracked in <code>tools/short-roadmap.md</code>. References: <code>BLOCKOUT_REFRESH_PLAN</code> \u00a78 Phase F · <code>Biome Plan.html</code> v5 \u00a7 Floor palettes.')
        ])
      ])
    ]);
  }

  // -------------- shell --------------
  function ensureBuilt() {
    if (built) return;
    modal  = document.getElementById('help-modal');
    body   = document.getElementById('help-body');
    tabsEl = document.getElementById('help-tabs');
    if (!modal || !body || !tabsEl) return;

    for (var i = 0; i < TABS.length; i++) {
      (function(t) {
        var b = document.createElement('button');
        b.className = 'help-tab-btn' + (t.id === currentTab ? ' active' : '');
        b.textContent = t.label;
        b.setAttribute('data-tab', t.id);
        b.addEventListener('click', function() { switchTab(t.id); });
        tabsEl.appendChild(b);
      }(TABS[i]));
    }

    // Backdrop click closes
    modal.addEventListener('click', function(ev) {
      if (ev.target === modal) close();
    });
    var closeBtn = document.getElementById('help-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    renderTab(currentTab);
    built = true;
  }

  function switchTab(id) {
    currentTab = id;
    var btns = tabsEl.querySelectorAll('.help-tab-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-tab') === id);
    }
    renderTab(id);
  }

  function renderTab(id) {
    var tab = null;
    for (var i = 0; i < TABS.length; i++) if (TABS[i].id === id) { tab = TABS[i]; break; }
    if (!tab) return;
    body.innerHTML = '';
    try {
      body.appendChild(tab.render());
    } catch (e) {
      body.appendChild(el('div', { class: 'help-error' },
        ['Help content failed to render: ' + (e && e.message ? e.message : String(e))]));
    }
    body.scrollTop = 0;
  }

  function open(tabId) {
    ensureBuilt();
    if (!modal) return;
    if (tabId) switchTab(tabId);
    modal.classList.add('open');
  }

  function close() {
    if (modal) modal.classList.remove('open');
  }

  function isOpen() { return !!(modal && modal.classList.contains('open')); }

  // -------------- wire-up --------------
  function init() {
    var btn = document.getElementById('btn-help');
    if (btn) btn.addEventListener('click', function() { open(); });

    // Keyboard: '?' or F1 opens; Escape closes.
    // Skip when user is typing in an input / select / textarea.
    window.addEventListener('keydown', function(ev) {
      var t = ev.target;
      var tag = t && t.tagName;
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
      if (typing) return;

      // '?' — usually Shift+/ — or F1 opens
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.key === '?' || ev.key === 'F1')) {
        ev.preventDefault();
        open();
        return;
      }
      // Esc closes help (before other Esc handlers eat it)
      if (ev.key === 'Escape' && isOpen()) {
        ev.stopPropagation();
        ev.preventDefault();
        close();
      }
    }, true); // capture phase so Esc beats other handlers
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for agent workflows + debugging
  window.BOHelp = { open: open, close: close, isOpen: isOpen, switchTab: switchTab };
})();
