/**
 * DebugNozzlePanel — harness-era nozzle hotkey HUD.
 *
 * Mounts a small fixed-position overlay in the bottom-left of the document
 * that lists the five spray nozzle types and binds number keys 1–5 to
 * SpraySystem.setNozzleType(). Inert unless mounted by DebugBoot when the
 * test-harness launches with `?nozzlePanel=1`.
 *
 * Spec: PRESSURE_WASHING_PWS_TEARDOWN_BRIEF §10.4
 *
 * Layer 5 — depends on: SpraySystem (Layer 1/3), Toast (Layer 2),
 *                        ScreenManager (Layer 2, optional guard)
 */
var DebugNozzlePanel = (function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var ROWS = [
    { key: '1', type: 'base',    label: 'base'    },
    { key: '2', type: 'cone',    label: 'cone'    },
    { key: '3', type: 'beam',    label: 'beam'    },
    { key: '4', type: 'fan',     label: 'fan'     },
    { key: '5', type: 'cyclone', label: 'cyclone' }
  ];

  var BORDER = '#2afce0';  // cyan — matches harness theme
  var ACCENT = '#fcff1a';  // yellow — active row highlight
  var POLL_MS = 1000;      // active-row refresh cadence

  // ── State ───────────────────────────────────────────────────────
  var _root = null;
  var _rowEls = [];
  var _onKey = null;
  var _pollHandle = 0;
  var _lastActive = null;

  // ── Mount / unmount ─────────────────────────────────────────────

  function mount() {
    if (_root) return;  // idempotent
    if (typeof document === 'undefined') return;

    _root = document.createElement('div');
    _root.id = 'debug-nozzle-panel';
    _root.style.cssText = [
      'position:fixed',
      'left:8px',
      'bottom:8px',
      'z-index:9999',
      'font-family:ui-monospace,Menlo,Consolas,monospace',
      'font-size:11px',
      'line-height:1.3',
      'color:#e0f8ff',
      'background:rgba(8,12,20,0.82)',
      'border:1px solid ' + BORDER,
      'border-radius:4px',
      'padding:6px 8px',
      'min-width:108px',
      'max-width:160px',
      'pointer-events:none',
      'user-select:none',
      'box-shadow:0 0 12px rgba(42,252,224,0.25)'
    ].join(';');

    var title = document.createElement('div');
    title.textContent = 'NOZZLE';
    title.style.cssText = 'color:' + BORDER + ';font-weight:bold;' +
      'letter-spacing:1px;margin-bottom:4px;border-bottom:1px dashed ' +
      BORDER + ';padding-bottom:3px;';
    _root.appendChild(title);

    _rowEls = [];
    for (var i = 0; i < ROWS.length; i++) {
      var r = ROWS[i];
      var el = document.createElement('div');
      el.setAttribute('data-nozzle', r.type);
      el.style.cssText = 'padding:1px 2px;';
      el.innerHTML = '<span style="color:' + BORDER + ';">' + r.key +
        '</span>&nbsp;<span class="lbl">' + r.label + '</span>';
      _root.appendChild(el);
      _rowEls.push(el);
    }

    document.body.appendChild(_root);

    _onKey = _handleKey;
    window.addEventListener('keydown', _onKey, true);

    _refreshActive();
    _pollHandle = setInterval(_refreshActive, POLL_MS);
  }

  function unmount() {
    if (!_root) return;
    if (_pollHandle) { clearInterval(_pollHandle); _pollHandle = 0; }
    if (_onKey) { window.removeEventListener('keydown', _onKey, true); _onKey = null; }
    if (_root.parentNode) _root.parentNode.removeChild(_root);
    _root = null;
    _rowEls = [];
    _lastActive = null;
  }

  // ── Key handling ────────────────────────────────────────────────

  function _handleKey(ev) {
    // Ignore when typing into a form control
    var ae = document.activeElement;
    if (ae) {
      var tag = ae.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
          ae.isContentEditable) return;
    }

    // Skip when a modal screen is open
    if (typeof ScreenManager !== 'undefined' && ScreenManager.current) {
      var cur = ScreenManager.current();
      if (cur && cur !== 'game' && cur !== 'play') return;
    }

    // Modifier keys shouldn't trigger
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    var k = ev.key;
    for (var i = 0; i < ROWS.length; i++) {
      if (ROWS[i].key === k) {
        var type = ROWS[i].type;
        if (typeof SpraySystem !== 'undefined' && SpraySystem.setNozzleType) {
          SpraySystem.setNozzleType(type);
        }
        if (typeof Toast !== 'undefined' && Toast.show) {
          Toast.show('NOZZLE: ' + type.toUpperCase());
        }
        _refreshActive();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    }
  }

  // ── Active-row highlight ────────────────────────────────────────

  function _refreshActive() {
    if (!_root) return;
    var active = null;
    if (typeof SpraySystem !== 'undefined' && SpraySystem.getNozzleType) {
      active = SpraySystem.getNozzleType();
    }
    if (active === _lastActive) return;
    _lastActive = active;
    for (var i = 0; i < _rowEls.length; i++) {
      var el = _rowEls[i];
      var isActive = (el.getAttribute('data-nozzle') === active);
      el.style.color = isActive ? ACCENT : '#e0f8ff';
      el.style.background = isActive ? 'rgba(252,255,26,0.08)' : 'transparent';
      el.style.fontWeight = isActive ? 'bold' : 'normal';
    }
  }

  // ── Public API ──────────────────────────────────────────────────
  return Object.freeze({
    mount:    mount,
    unmount:  unmount,
    isMounted: function () { return _root !== null; }
  });
})();
