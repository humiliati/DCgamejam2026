/**
 * DebugLightingPanel — runtime lighting-tuning drawer.
 *
 * Mounts a collapsible right-hand panel over the game canvas with
 * slider + number-input pairs for every exposed tunable across the
 * lighting subsystem. Knobs call setTunables() on the relevant module
 * each oninput so changes are visible immediately while the designer
 * walks a floor.
 *
 * Inert unless mounted by DebugBoot when `?lightPanel=1`.
 *
 * Spec: LIGHTING_TEST_HARNESS_SPEC §2–3
 *
 * Layer 5 — depends on: LightOrbs (L2), Lighting (L1), WeatherSystem (L1.5),
 *           DayCycle (L1), SpatialContract (L1), Toast (L2, optional)
 */
var DebugLightingPanel = (function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────
  var _root = null;
  var _styleEl = null;
  var _defaults = {};   // module → getTunables() snapshot at mount
  var STORAGE_KEY = 'testharness.lighting.panel';

  // ── CSS (injected once on mount) ────────────────────────────────
  var CSS = [
    '.lt-drawer{position:fixed;top:0;right:0;width:320px;height:100vh;z-index:9999;',
    'font-family:"Courier New",monospace;font-size:11px;color:#e0f0ff;',
    'background:rgba(8,10,22,0.94);border-left:2px solid #2afce0;',
    'box-shadow:-4px 0 24px rgba(42,252,224,0.15);display:flex;flex-direction:column;',
    'transition:transform 0.25s ease;overflow:hidden}',
    '.lt-drawer.collapsed{transform:translateX(278px)}',

    '.lt-hdr{display:flex;align-items:center;gap:8px;padding:10px 12px;',
    'border-bottom:1px solid rgba(42,252,224,0.25);background:rgba(12,6,25,0.85);flex-shrink:0}',
    '.lt-hdr h2{font-size:13px;color:#fcff1a;letter-spacing:2px;text-transform:uppercase;',
    'flex:1;margin:0}',
    '.lt-hdr button{font-family:"Courier New",monospace;font-size:11px;',
    'background:rgba(42,252,224,0.1);border:1px solid rgba(42,252,224,0.45);',
    'color:#2afce0;padding:4px 8px;cursor:pointer;letter-spacing:1px}',
    '.lt-hdr button:hover{background:rgba(252,80,198,0.2);border-color:#fc50c6;color:#fff}',
    '.lt-tog{background:none!important;border:none!important;font-size:16px!important;',
    'padding:2px 6px!important;color:#2afce0!important;cursor:pointer}',
    '.lt-tog:hover{color:#fcff1a!important}',

    '.lt-presets{display:flex;gap:6px;align-items:center;padding:8px 12px;',
    'border-bottom:1px solid rgba(42,252,224,0.15);background:rgba(0,0,0,0.25);flex-shrink:0}',
    '.lt-presets select{flex:1;font-family:"Courier New",monospace;font-size:11px;',
    'background:rgba(0,0,0,0.5);border:1px solid rgba(42,252,224,0.4);color:#2afce0;padding:4px 6px}',
    '.lt-presets button{font-family:"Courier New",monospace;font-size:10px;',
    'background:rgba(42,252,224,0.08);border:1px solid rgba(42,252,224,0.35);',
    'color:#2afce0;padding:3px 6px;cursor:pointer;letter-spacing:1px}',
    '.lt-presets button:hover{background:rgba(252,80,198,0.2);border-color:#fc50c6;color:#fff}',

    '.lt-body{flex:1;overflow-y:auto;padding:8px 12px 16px;scrollbar-width:thin;',
    'scrollbar-color:rgba(42,252,224,0.4) rgba(0,0,0,0.3)}',
    '.lt-body::-webkit-scrollbar{width:8px}',
    '.lt-body::-webkit-scrollbar-track{background:rgba(0,0,0,0.3)}',
    '.lt-body::-webkit-scrollbar-thumb{background:rgba(42,252,224,0.4);border-radius:4px}',

    '.lt-body details{margin-bottom:6px;border:1px solid rgba(42,252,224,0.15);',
    'border-radius:3px;background:rgba(0,0,0,0.2)}',
    '.lt-body details[open]{border-color:rgba(42,252,224,0.35)}',
    '.lt-body summary{padding:8px 10px;cursor:pointer;font-size:11px;letter-spacing:2px;',
    'text-transform:uppercase;color:#2afce0;user-select:none;list-style:none}',
    '.lt-body summary::-webkit-details-marker{display:none}',
    '.lt-body summary::before{content:"▸ ";color:rgba(42,252,224,0.6)}',
    '.lt-body details[open]>summary::before{content:"▾ "}',
    '.lt-body summary:hover{background:rgba(42,252,224,0.06)}',

    '.lt-sec{padding:6px 10px 10px}',
    '.lt-kr{display:flex;align-items:center;gap:6px;margin-bottom:6px}',
    '.lt-kr label{flex:0 0 110px;font-size:10px;color:#b7a8e0;text-transform:none;',
    'letter-spacing:0.5px;margin:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '.lt-kr label.lt-star::before{content:"⭐";font-size:8px;margin-right:3px}',
    '.lt-kr input[type="range"]{flex:1;min-width:60px;accent-color:#2afce0;cursor:pointer;height:14px}',
    '.lt-kr input[type="number"]{width:52px;background:rgba(0,0,0,0.5);',
    'border:1px solid rgba(42,252,224,0.35);color:#2afce0;',
    'font-family:"Courier New",monospace;font-size:10px;padding:2px 4px;text-align:right}',
    '.lt-kr input[type="number"]:focus{border-color:#fcff1a;outline:none}',
    '.lt-rv{flex:0 0 auto;background:none;border:none;color:rgba(42,252,224,0.5);',
    'cursor:pointer;font-size:12px;padding:0 2px;line-height:1}',
    '.lt-rv:hover{color:#fcff1a}',

    '.lt-kt{width:100%;border-collapse:collapse;margin-top:4px}',
    '.lt-kt th,.lt-kt td{font-size:10px;padding:2px 4px;text-align:center;',
    'border-bottom:1px solid rgba(42,252,224,0.1)}',
    '.lt-kt th{color:#2afce0;text-transform:uppercase;letter-spacing:1px}',
    '.lt-kt td input{width:48px;background:rgba(0,0,0,0.5);',
    'border:1px solid rgba(42,252,224,0.25);color:#e0f0ff;',
    'font-family:"Courier New",monospace;font-size:10px;padding:2px 3px;text-align:right}',
    '.lt-kt td input:focus{border-color:#fcff1a;outline:none}',

    '.lt-tr{display:flex;align-items:center;gap:8px;margin-bottom:5px}',
    '.lt-tr input[type="checkbox"]{accent-color:#fc50c6;cursor:pointer}',
    '.lt-tr span{font-size:10px;color:#d6cff0}',

    '.lt-sr{display:flex;align-items:center;gap:6px;margin-bottom:6px}',
    '.lt-sr label{flex:0 0 110px;font-size:10px;color:#b7a8e0;margin:0;text-transform:none}',
    '.lt-sr select{flex:1;background:rgba(0,0,0,0.5);border:1px solid rgba(42,252,224,0.35);',
    'color:#2afce0;font-family:"Courier New",monospace;font-size:10px;padding:3px 4px}'
  ].join('\n');

  // ── Knob descriptor catalog ─────────────────────────────────────
  // { key, label, min, max, step, star?, module }
  // step drives the slider resolution; number input allows finer.

  var ORB_KNOBS = [
    { key: 'BASE_RADIUS_PX',     label: 'Base radius px',     min: 40,   max: 200,  step: 1,     star: false },
    { key: 'MAX_RADIUS_PX',      label: 'Max radius px',      min: 120,  max: 600,  step: 1,     star: false },
    { key: 'MIN_RADIUS_PX',      label: 'Min radius px',      min: 1,    max: 12,   step: 0.5,   star: false },
    { key: 'MIN_ALPHA',           label: 'Min alpha',          min: 0.005,max: 0.1,  step: 0.005, star: false },
    { key: 'ALPHA_BOOST',         label: 'Alpha boost',        min: 0,    max: 4,    step: 0.05,  star: true  },
    { key: 'RENDER_DIST',         label: 'Render dist',        min: 12,   max: 80,   step: 1,     star: true  },
    { key: 'SCATTER_LERP',        label: 'Scatter lerp',       min: 0,    max: 0.8,  step: 0.02,  star: false },
    { key: 'SCATTER_ALPHA_MUL',   label: 'Scatter alpha mul',  min: 0,    max: 1,    step: 0.05,  star: false },
    { key: 'SCATTER_RADIUS_MUL',  label: 'Scatter radius mul', min: 0.2,  max: 1.5,  step: 0.05,  star: false },
    { key: 'FLICKER_SMOOTH_TAU',  label: 'Flicker smooth tau', min: 0.02, max: 1.0,  step: 0.02,  star: true  },
    { key: 'WASH_START_DIST',     label: 'Wash start dist',    min: 0,    max: 6,    step: 0.1,   star: true  },
    { key: 'WASH_PEAK_DIST',      label: 'Wash peak dist',     min: 0.1,  max: 2,    step: 0.05,  star: false },
    { key: 'WASH_MAX_ALPHA',      label: 'Wash max alpha',     min: 0,    max: 0.5,  step: 0.01,  star: true  },
    { key: 'DAY_DIM',             label: 'Day dim',            min: 0,    max: 1,    step: 0.05,  star: false },
    { key: 'DUSK_DIM',            label: 'Dusk dim',           min: 0,    max: 1,    step: 0.05,  star: false },
    { key: 'NIGHT_DIM',           label: 'Night dim',          min: 0,    max: 1,    step: 0.05,  star: false },
    { key: 'DAWN_DIM',            label: 'Dawn dim',           min: 0,    max: 1,    step: 0.05,  star: false }
  ];

  var ORB_KINDS = ['torch', 'bonfire', 'hearth', 'lantern', 'brazier'];
  var KIND_SUBKNOBS = [
    { key: 'radiusMul', label: 'radius', min: 0.3, max: 3.0, step: 0.05 },
    { key: 'alphaMul',  label: 'alpha',  min: 0.2, max: 1.5, step: 0.05 },
    { key: 'yOffset',   label: 'yOff',   min: -0.3, max: 0.8, step: 0.05 }
  ];

  // ── DOM builders ────────────────────────────────────────────────

  function _el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  /**
   * Build a range+number knob row. Returns { row, range, num, revert }.
   * The `onChange` callback fires on both slider and number input.
   */
  function _knobRow(knob, value, onChange) {
    var row = _el('div', 'lt-kr');

    var lbl = _el('label', knob.star ? 'lt-star' : '');
    lbl.textContent = knob.label;
    lbl.title = knob.key;
    row.appendChild(lbl);

    var range = document.createElement('input');
    range.type = 'range';
    range.min = knob.min;
    range.max = knob.max;
    range.step = knob.step;
    range.value = value;
    row.appendChild(range);

    var num = document.createElement('input');
    num.type = 'number';
    num.min = knob.min;
    num.max = knob.max;
    num.step = knob.step;
    num.value = _fmt(value, knob.step);
    row.appendChild(num);

    var rv = _el('button', 'lt-rv', '↺');
    rv.title = 'Revert to default (' + value + ')';
    row.appendChild(rv);

    // Sync range↔number
    range.addEventListener('input', function () {
      num.value = _fmt(+range.value, knob.step);
      onChange(knob.key, +range.value);
    });
    num.addEventListener('input', function () {
      range.value = num.value;
      onChange(knob.key, +num.value);
    });

    // Revert
    var defaultVal = value;
    rv.addEventListener('click', function () {
      range.value = defaultVal;
      num.value = _fmt(defaultVal, knob.step);
      onChange(knob.key, defaultVal);
    });

    return { row: row, range: range, num: num, revert: rv, defaultVal: defaultVal };
  }

  /** Format a number to match the slider step precision. */
  function _fmt(val, step) {
    if (step >= 1) return String(Math.round(val));
    var d = String(step).split('.')[1];
    var prec = d ? d.length : 2;
    return (+val).toFixed(prec);
  }

  // ── Section: LightOrbs scalar knobs ─────────────────────────────

  function _buildOrbsSection(container) {
    if (typeof LightOrbs === 'undefined') {
      container.textContent = 'LightOrbs not loaded';
      return;
    }
    var tun = LightOrbs.getTunables();
    _defaults.LightOrbs = JSON.parse(JSON.stringify(tun));

    ORB_KNOBS.forEach(function (knob) {
      var val = tun[knob.key];
      if (val == null) val = knob.min;
      var kr = _knobRow(knob, val, function (key, v) {
        var patch = {};
        patch[key] = v;
        LightOrbs.setTunables(patch);
      });
      container.appendChild(kr.row);
    });
  }

  // ── Section: LightOrbs per-kind table ───────────────────────────

  function _buildKindsSection(container) {
    if (typeof LightOrbs === 'undefined') {
      container.textContent = 'LightOrbs not loaded';
      return;
    }
    var tun = LightOrbs.getTunables();

    var tbl = _el('table', 'lt-kt');
    var thead = _el('tr');
    thead.appendChild(_el('th', '', 'kind'));
    KIND_SUBKNOBS.forEach(function (sk) {
      thead.appendChild(_el('th', '', sk.label));
    });
    tbl.appendChild(thead);

    ORB_KINDS.forEach(function (kind) {
      var tr = _el('tr');
      tr.appendChild(_el('td', '', kind));
      var kdata = tun.kind[kind] || {};

      KIND_SUBKNOBS.forEach(function (sk) {
        var td = document.createElement('td');
        var inp = document.createElement('input');
        inp.type = 'number';
        inp.min = sk.min;
        inp.max = sk.max;
        inp.step = sk.step;
        inp.value = _fmt(kdata[sk.key] || 0, sk.step);

        inp.addEventListener('input', (function (k, s) {
          return function () {
            var patch = { kind: {} };
            patch.kind[k] = {};
            patch.kind[k][s] = +inp.value;
            LightOrbs.setTunables(patch);
          };
        })(kind, sk.key));

        td.appendChild(inp);
        tr.appendChild(td);
      });

      tbl.appendChild(tr);
    });
    container.appendChild(tbl);
  }

  // ── Section: Lighting — flicker freq/amp ────────────────────────

  var FLICKER_KNOBS = [
    { key: 'torch',          label: 'Torch freq',        min: 2,    max: 40,   step: 0.5, group: 'FLICKER_FREQ' },
    { key: 'bonfire_slow',   label: 'Bonfire slow freq',  min: 1,    max: 20,   step: 0.5, group: 'FLICKER_FREQ' },
    { key: 'bonfire_fast',   label: 'Bonfire fast freq',  min: 5,    max: 60,   step: 1,   group: 'FLICKER_FREQ' },
    { key: 'hearth_primary', label: 'Hearth 1° freq',     min: 5,    max: 60,   step: 1,   group: 'FLICKER_FREQ' },
    { key: 'hearth_second',  label: 'Hearth 2° freq',     min: 5,    max: 80,   step: 1,   group: 'FLICKER_FREQ' },
    { key: 'hearth_third',   label: 'Hearth 3° freq',     min: 1,    max: 30,   step: 0.5, group: 'FLICKER_FREQ' },
    { key: 'torch',          label: 'Torch amp',          min: 0,    max: 1,    step: 0.01, group: 'FLICKER_AMP' },
    { key: 'bonfire_slow',   label: 'Bonfire slow amp',   min: 0,    max: 0.5,  step: 0.01, group: 'FLICKER_AMP' },
    { key: 'bonfire_fast',   label: 'Bonfire fast amp',   min: 0,    max: 0.3,  step: 0.005,group: 'FLICKER_AMP' },
    { key: 'hearth_primary', label: 'Hearth 1° amp',      min: 0,    max: 0.5,  step: 0.01, group: 'FLICKER_AMP' },
    { key: 'hearth_second',  label: 'Hearth 2° amp',      min: 0,    max: 0.3,  step: 0.01, group: 'FLICKER_AMP' },
    { key: 'hearth_third',   label: 'Hearth 3° amp',      min: 0,    max: 0.3,  step: 0.01, group: 'FLICKER_AMP' }
  ];

  function _buildFlickerSection(container) {
    if (typeof Lighting === 'undefined' || !Lighting.getTunables) {
      container.textContent = 'Lighting.getTunables not available';
      return;
    }
    var tun = Lighting.getTunables();
    _defaults.Lighting = JSON.parse(JSON.stringify(tun));

    FLICKER_KNOBS.forEach(function (knob) {
      var val = tun[knob.group] ? tun[knob.group][knob.key] : 0;
      if (val == null) val = knob.min;
      var kr = _knobRow(knob, val, function (key, v) {
        var patch = {};
        patch[knob.group] = {};
        patch[knob.group][key] = v;
        Lighting.setTunables(patch);
      });
      container.appendChild(kr.row);
    });
  }

  // ── Section: Lighting — grid lightmap ───────────────────────────

  var GRID_KNOBS = [
    { key: 'GRID_LIGHTMAP_RADIUS', label: 'Lightmap radius', min: 2, max: 12, step: 1, star: false },
    { key: 'FALLOFF_EXPONENT',     label: 'Falloff exponent', min: 1, max: 4,  step: 0.5, star: false },
    { key: 'WALL_DARKNESS_MUL',    label: 'Wall darkness mul', min: 0, max: 3, step: 0.1, star: false }
  ];

  function _buildGridSection(container) {
    if (typeof Lighting === 'undefined' || !Lighting.getTunables) {
      container.textContent = 'Lighting.getTunables not available';
      return;
    }
    var tun = Lighting.getTunables();

    GRID_KNOBS.forEach(function (knob) {
      var val = tun[knob.key];
      if (val == null) val = knob.min;
      var kr = _knobRow(knob, val, function (key, v) {
        var patch = {};
        patch[key] = v;
        Lighting.setTunables(patch);
      });
      container.appendChild(kr.row);
    });
  }

  // ── Section: Weather modifiers ──────────────────────────────────

  function _buildWeatherSection(container) {
    if (typeof WeatherSystem === 'undefined' || !WeatherSystem.getTunables) {
      container.textContent = 'WeatherSystem not available';
      return;
    }
    var tun = WeatherSystem.getTunables();
    _defaults.WeatherSystem = JSON.parse(JSON.stringify(tun));

    // Particle density scale
    var kr = _knobRow(
      { key: 'particleDensityScale', label: 'Particle density', min: 0.1, max: 2.0, step: 0.05, star: true },
      tun.particleDensityScale || 1.0,
      function (key, v) { WeatherSystem.setTunables({ particleDensityScale: v }); }
    );
    container.appendChild(kr.row);

    // MAX_PARTICLES
    kr = _knobRow(
      { key: 'MAX_PARTICLES', label: 'Max particles', min: 50, max: 800, step: 10, star: false },
      tun.MAX_PARTICLES || 300,
      function (key, v) { WeatherSystem.setTunables({ MAX_PARTICLES: v }); }
    );
    container.appendChild(kr.row);

    // Preset force dropdown
    var sr = _el('div', 'lt-sr');
    var srl = _el('label', '', 'Force preset');
    sr.appendChild(srl);
    var sel = document.createElement('select');
    ['auto','clear','light_rain','heavy_rain','hearth_smoke','indoor_dust',
     'lantern_haze','cellar_drip','dungeon_dust','boardwalk_wind'].forEach(function (p) {
      var o = document.createElement('option');
      o.value = p; o.textContent = p;
      sel.appendChild(o);
    });
    sel.value = tun.presetForce || 'auto';
    sel.addEventListener('change', function () {
      WeatherSystem.setTunables({ presetForce: sel.value === 'auto' ? null : sel.value });
    });
    sr.appendChild(sel);
    container.appendChild(sr);
  }

  // ── Section: Day cycle ──────────────────────────────────────────

  function _buildDayCycleSection(container) {
    if (typeof DayCycle === 'undefined' || !DayCycle.getTunables) {
      container.textContent = 'DayCycle not available';
      return;
    }
    var tun = DayCycle.getTunables();
    _defaults.DayCycle = JSON.parse(JSON.stringify(tun));

    // Phase force dropdown
    var sr = _el('div', 'lt-sr');
    sr.appendChild(_el('label', '', 'Force phase'));
    var sel = document.createElement('select');
    ['auto','dawn','morning','afternoon','dusk','night'].forEach(function (p) {
      var o = document.createElement('option');
      o.value = p; o.textContent = p;
      sel.appendChild(o);
    });
    sel.value = tun.phaseForce || 'auto';
    sel.addEventListener('change', function () {
      DayCycle.setTunables({ phaseForce: sel.value === 'auto' ? null : sel.value });
    });
    sr.appendChild(sel);
    container.appendChild(sr);

    // Sun angle override
    var kr = _knobRow(
      { key: 'sunAngleOverride', label: 'Sun angle override', min: 0, max: 360, step: 5, star: false },
      tun.sunAngleOverride || 90,
      function (key, v) { DayCycle.setTunables({ sunAngleOverride: v }); }
    );
    container.appendChild(kr.row);
  }

  // ── Section: Spatial contract ───────────────────────────────────

  function _buildSpatialSection(container) {
    if (typeof SpatialContract === 'undefined' || !SpatialContract.getTunables) {
      container.textContent = 'SpatialContract not available';
      return;
    }
    // getTunables takes current contract — try to get from Raycaster
    var contract = null;
    if (typeof Raycaster !== 'undefined' && Raycaster.getContract) {
      contract = Raycaster.getContract();
    }
    var tun = SpatialContract.getTunables(contract);
    _defaults.SpatialContract = JSON.parse(JSON.stringify(tun));

    // wallHeight
    var kr = _knobRow(
      { key: 'wallHeight', label: 'Wall height', min: 0.5, max: 3.0, step: 0.05, star: false },
      tun.wallHeight,
      function (key, v) {
        SpatialContract.setTunables({ wallHeight: v });
        _applySpatialOverrides();
      }
    );
    container.appendChild(kr.row);

    // fogDistance
    kr = _knobRow(
      { key: 'fogDistance', label: 'Fog distance', min: 2, max: 30, step: 0.5, star: false },
      tun.fogDistance,
      function (key, v) {
        SpatialContract.setTunables({ fogDistance: v });
        _applySpatialOverrides();
      }
    );
    container.appendChild(kr.row);

    // renderDistance
    kr = _knobRow(
      { key: 'renderDistance', label: 'Render distance', min: 8, max: 40, step: 1, star: false },
      tun.renderDistance,
      function (key, v) {
        SpatialContract.setTunables({ renderDistance: v });
        _applySpatialOverrides();
      }
    );
    container.appendChild(kr.row);

    // fogModel dropdown
    var sr = _el('div', 'lt-sr');
    sr.appendChild(_el('label', '', 'Fog model'));
    var fogSel = document.createElement('select');
    ['fade','clamp','darkness'].forEach(function (m) {
      var o = document.createElement('option');
      o.value = m; o.textContent = m.toUpperCase();
      fogSel.appendChild(o);
    });
    fogSel.value = tun.fogModel || 'fade';
    fogSel.addEventListener('change', function () {
      SpatialContract.setTunables({ fogModel: fogSel.value });
      _applySpatialOverrides();
    });
    sr.appendChild(fogSel);
    container.appendChild(sr);

    // ceilingType dropdown
    sr = _el('div', 'lt-sr');
    sr.appendChild(_el('label', '', 'Ceiling type'));
    var ceilSel = document.createElement('select');
    ['sky','solid','void'].forEach(function (m) {
      var o = document.createElement('option');
      o.value = m; o.textContent = m.toUpperCase();
      ceilSel.appendChild(o);
    });
    ceilSel.value = tun.ceilingType || 'sky';
    ceilSel.addEventListener('change', function () {
      SpatialContract.setTunables({ ceilingType: ceilSel.value });
      _applySpatialOverrides();
    });
    sr.appendChild(ceilSel);
    container.appendChild(sr);
  }

  /**
   * After a SpatialContract override, resolve the contract and push
   * it into the raycaster so it takes effect next frame.
   */
  function _applySpatialOverrides() {
    if (typeof Raycaster === 'undefined' || !Raycaster.getContract || !Raycaster.setContract) return;
    var base = Raycaster.getContract();
    if (!base) return;
    var resolved = SpatialContract.resolveContract(base);
    if (resolved && resolved !== base) {
      Raycaster.setContract(resolved);
    }
  }

  // ── Section: Debug overlays ─────────────────────────────────────

  function _buildDebugSection(container) {
    var toggles = [
      { label: 'LightOrbs debug counters', check: function () {
          return typeof LightOrbs !== 'undefined';
        }, set: function (on) {
          if (typeof LightOrbs !== 'undefined') LightOrbs.setDebug(on);
        }
      },
      { label: 'Freeze flicker (tau=999)', check: function () {
          return typeof LightOrbs !== 'undefined';
        }, set: function (on) {
          if (typeof LightOrbs !== 'undefined') {
            LightOrbs.setTunables({ FLICKER_SMOOTH_TAU: on ? 999 : (_defaults.LightOrbs ? _defaults.LightOrbs.FLICKER_SMOOTH_TAU : 0.38) });
          }
        }
      }
    ];

    toggles.forEach(function (t) {
      if (t.check && !t.check()) return;
      var tr = _el('div', 'lt-tr');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.addEventListener('change', function () { t.set(cb.checked); });
      tr.appendChild(cb);
      tr.appendChild(_el('span', '', t.label));
      container.appendChild(tr);
    });
  }

  // ── Master reset ────────────────────────────────────────────────

  function _resetAll() {
    if (_defaults.LightOrbs && typeof LightOrbs !== 'undefined') {
      LightOrbs.setTunables(_defaults.LightOrbs);
    }
    if (_defaults.Lighting && typeof Lighting !== 'undefined') {
      Lighting.setTunables(_defaults.Lighting);
    }
    if (_defaults.WeatherSystem && typeof WeatherSystem !== 'undefined') {
      WeatherSystem.setTunables(_defaults.WeatherSystem);
    }
    if (_defaults.DayCycle && typeof DayCycle !== 'undefined') {
      DayCycle.setTunables(_defaults.DayCycle);
    }
    if (typeof SpatialContract !== 'undefined' && SpatialContract.clearTunables) {
      SpatialContract.clearTunables();
    }
    // Rebuild UI with fresh defaults
    unmount();
    mount();
    if (typeof Toast !== 'undefined' && Toast.show) {
      Toast.show('LIGHTING RESET');
    }
  }

  // ── Preset copy (diff vs defaults → clipboard) ─────────────────

  function _copyPresetJSON() {
    var diff = {};
    if (typeof LightOrbs !== 'undefined') {
      var cur = LightOrbs.getTunables();
      var def = _defaults.LightOrbs || {};
      var orbDiff = _diffFlat(cur, def);
      if (Object.keys(orbDiff).length) diff.LightOrbs = orbDiff;
    }
    if (typeof Lighting !== 'undefined' && Lighting.getTunables) {
      var curL = Lighting.getTunables();
      var defL = _defaults.Lighting || {};
      var lDiff = _diffFlat(curL, defL);
      if (Object.keys(lDiff).length) diff.Lighting = lDiff;
    }
    var json = JSON.stringify(diff, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json);
    }
    if (typeof Toast !== 'undefined' && Toast.show) {
      Toast.show('PRESET JSON COPIED');
    }
    console.log('[LT] Preset diff:', json);
  }

  function _diffFlat(cur, def) {
    var d = {};
    for (var k in cur) {
      if (!cur.hasOwnProperty(k)) continue;
      if (typeof cur[k] === 'object' && cur[k] !== null) {
        var sub = _diffFlat(cur[k], def[k] || {});
        if (Object.keys(sub).length) d[k] = sub;
      } else if (cur[k] !== def[k]) {
        d[k] = cur[k];
      }
    }
    return d;
  }

  // ── Mount / unmount ─────────────────────────────────────────────

  function mount() {
    if (_root) return;
    if (typeof document === 'undefined') return;

    // Inject style
    _styleEl = document.createElement('style');
    _styleEl.textContent = CSS;
    document.head.appendChild(_styleEl);

    // Build drawer
    _root = _el('div', 'lt-drawer collapsed');
    _root.id = 'debug-lighting-panel';

    // Header
    var hdr = _el('div', 'lt-hdr');
    var tog = _el('button', 'lt-tog', '◀');
    tog.title = 'Collapse / expand';
    hdr.appendChild(tog);
    hdr.appendChild(_el('h2', '', 'Lighting'));
    var resetBtn = _el('button', '', 'Reset');
    resetBtn.title = 'Reset all knobs to compile-time defaults';
    resetBtn.addEventListener('click', _resetAll);
    hdr.appendChild(resetBtn);
    _root.appendChild(hdr);

    // Preset bar
    var pbar = _el('div', 'lt-presets');
    var psel = document.createElement('select');
    psel.appendChild(_el('option', '', '(none)'));
    pbar.appendChild(psel);
    var copyBtn = _el('button', '', 'Copy');
    copyBtn.title = 'Copy diff-vs-defaults JSON to clipboard';
    copyBtn.addEventListener('click', _copyPresetJSON);
    pbar.appendChild(copyBtn);
    _root.appendChild(pbar);

    // Body
    var body = _el('div', 'lt-body');

    // Section builder helper
    function addSection(id, title, buildFn) {
      var det = document.createElement('details');
      det.id = 'lt-sec-' + id;
      var sum = document.createElement('summary');
      sum.textContent = title;
      det.appendChild(sum);
      var sec = _el('div', 'lt-sec');
      buildFn(sec);
      det.appendChild(sec);
      det.addEventListener('toggle', _saveState);
      body.appendChild(det);
    }

    addSection('orbs',    'Orbs (LightOrbs)',        _buildOrbsSection);
    addSection('kinds',   'Per-kind overrides',       _buildKindsSection);
    addSection('flicker', 'Flicker (Lighting)',       _buildFlickerSection);
    addSection('grid',    'Grid lightmap (Lighting)', _buildGridSection);
    addSection('weather', 'Weather modifiers',        _buildWeatherSection);
    addSection('daycycle','Day cycle',                _buildDayCycleSection);
    addSection('spatial', 'Spatial contract',         _buildSpatialSection);
    addSection('debug',   'Debug overlays',           _buildDebugSection);

    _root.appendChild(body);
    document.body.appendChild(_root);

    // Toggle collapse
    tog.addEventListener('click', function () {
      var isCollapsed = _root.classList.toggle('collapsed');
      tog.textContent = isCollapsed ? '◀' : '▶';
      _saveState();
    });

    // Restore persisted state
    _restoreState();

    console.log('%c[DebugLightingPanel] mounted — 8 sections', 'color:#2afce0');
  }

  function unmount() {
    if (!_root) return;
    if (_root.parentNode) _root.parentNode.removeChild(_root);
    if (_styleEl && _styleEl.parentNode) _styleEl.parentNode.removeChild(_styleEl);
    _root = null;
    _styleEl = null;
  }

  // ── localStorage persistence ────────────────────────────────────

  function _saveState() {
    if (!_root) return;
    var state = { collapsed: _root.classList.contains('collapsed'), sections: {} };
    var dets = _root.querySelectorAll('details');
    for (var i = 0; i < dets.length; i++) {
      state.sections[dets[i].id] = dets[i].open;
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* ignore */ }
  }

  function _restoreState() {
    if (!_root) return;
    try {
      var state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!state) return;
      if (state.collapsed === false) {
        _root.classList.remove('collapsed');
        var tog = _root.querySelector('.lt-tog');
        if (tog) tog.textContent = '▶';
      }
      if (state.sections) {
        var dets = _root.querySelectorAll('details');
        for (var i = 0; i < dets.length; i++) {
          if (state.sections[dets[i].id] === true)  dets[i].open = true;
          if (state.sections[dets[i].id] === false) dets[i].open = false;
        }
      }
    } catch (e) { /* ignore */ }
  }

  // ── Public API ──────────────────────────────────────────────────
  return Object.freeze({
    mount:     mount,
    unmount:   unmount,
    isMounted: function () { return _root !== null; }
  });
})();
