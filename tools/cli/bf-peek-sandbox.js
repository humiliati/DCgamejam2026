// ═══════════════════════════════════════════════════════════════
//  tools/cli/bf-peek-sandbox.js — Headless vm harness that loads
//  engine/<variant>-peek.js and captures the PeekShell.register(...)
//  descriptor without touching the DOM or booting the raycaster.
//
//  Phase 3a of BOXFORGE_AGENT_ROADMAP.
//
//  Mirrors tools/cli/iife-sandbox.js: the engine code is a browser-
//  first IIFE stack, so we evaluate it in a vm sandbox with benign
//  stubs for every engine global a peek might touch at load-time.
//
//  Why: `bf ingest` prefers to read the `/* BF-DATA-START ... BF-DATA-END */`
//  block embedded by `bf emit`, but we also want a structured way to
//  observe the PeekShell descriptor that the module registered — for
//  validation, for rediscovering tileMatch, and for future legacy
//  ingest paths that walk from shipped peek → sidecar (Phase 3b).
//
//  Public API:
//    createPeekSandbox()            → { sandbox, loadFile(relPath), registrations }
//    loadPeekModule(relPath)        → { ok, registrations, error }
//    BF_DATA_RE                     → regex for the BF-DATA block
// ═══════════════════════════════════════════════════════════════
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var ROOT = path.resolve(__dirname, '..', '..');

// Regex used across ingest/emit to locate the sidecar JSON embedded
// in a peek module. Exported so bf-ingest and bf-emit agree.
var BF_DATA_RE = /\/\*\s*BF-DATA-START\s*\n([\s\S]*?)\nBF-DATA-END\s*\*\//;

function fakeCtx() {
  return new Proxy({}, { get: function(t, p) {
    if (p === 'createImageData') return function(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; };
    if (p === 'getImageData')    return function(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; };
    if (p === 'measureText')     return function() { return { width: 0 }; };
    if (p === 'canvas')          return { width: 64, height: 64, toDataURL: function() { return ''; } };
    return function() { return fakeCtx(); };
  }, set: function() { return true; } });
}

function fakeEl() {
  var el;
  el = {
    getContext: fakeCtx, width: 0, height: 0, style: {},
    classList: { add: function() {}, remove: function() {}, toggle: function() {}, contains: function() { return false; } },
    addEventListener: function() {}, removeEventListener: function() {},
    appendChild: function(c) { return c; }, removeChild: function(c) { return c; },
    setAttribute: function() {}, getAttribute: function() { return null; }, removeAttribute: function() {},
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    innerHTML: '', textContent: '', value: '',
    getBoundingClientRect: function() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus: function() {}, blur: function() {}, click: function() {},
    toDataURL: function() { return ''; },
    children: [], childNodes: [], parentNode: null, parentElement: null,
    dataset: {}
  };
  return el;
}

function createPeekSandbox() {
  var registrations = [];

  var sandbox = {
    console: console, Math: Math, parseInt: parseInt, parseFloat: parseFloat,
    String: String, Array: Array, Object: Object, JSON: JSON,
    Error: Error, TypeError: TypeError, RangeError: RangeError,
    isNaN: isNaN, isFinite: isFinite, Infinity: Infinity, NaN: NaN,
    Uint8ClampedArray: Uint8ClampedArray, Uint8Array: Uint8Array,
    Float32Array: Float32Array, Float64Array: Float64Array, Int32Array: Int32Array,
    Map: Map, Set: Set, Promise: Promise, Proxy: Proxy, Date: Date,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: setInterval, clearInterval: clearInterval,
    performance: { now: function() { return Date.now(); } },
    document: {
      getElementById: fakeEl, createElement: fakeEl, createElementNS: fakeEl,
      createTextNode: function(t) { return { nodeValue: t, textContent: t }; },
      addEventListener: function() {}, removeEventListener: function() {},
      querySelectorAll: function() { return []; }, querySelector: function() { return null; },
      body: fakeEl(), head: fakeEl(),
      documentElement: fakeEl(),
      readyState: 'complete'
    },
    window: {
      addEventListener: function() {}, removeEventListener: function() {},
      requestAnimationFrame: function() { return 0; }, cancelAnimationFrame: function() {},
      innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
      setTimeout: setTimeout, clearTimeout: clearTimeout,
      location: { href: '', protocol: 'file:' }
    },
    requestAnimationFrame: function() { return 0; },
    cancelAnimationFrame: function() {},
    Image: function() { this.onload = null; this.src = ''; this.width = 0; this.height = 0; },
    Audio: function() { this.play = function() {}; this.pause = function() {}; },
    AudioContext: function() {
      this.createGain = function() { return { gain: { value: 1 }, connect: function() {} }; };
      this.destination = {}; this.state = 'running'; this.resume = function() { return Promise.resolve(); };
    },
    webkitAudioContext: null,
    fetch: function() { return Promise.resolve({ ok: false, json: function() { return Promise.resolve({}); } }); },
    navigator: { userAgent: 'node', language: 'en-US' },
    localStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },

    // PeekShell capture shim
    PeekShell: {
      register: function(desc) {
        registrations.push(desc);
        return function unregister() { /* no-op */ };
      },
      mount: function() {}, unmount: function() {},
      unmountNow: function() {}, update: function() {}, handleKey: function() { return false; },
      isActive: function() { return false; },
      getMounted: function() { return null; },
      _CONFIG: { SHOW_DELAY_DEFAULT: 300, HIDE_DELAY: 120, FADE_MS: 240, GRACE_MS: 300, CLOSE_SIZE: 44 }
    },

    // Engine globals referenced at peek IIFE load-time.
    TILES: new Proxy({}, { get: function(t, k) { return k === 'WALL' ? 1 : (typeof k === 'string' && /^[A-Z0-9_]+$/.test(k) ? 0 : undefined); } }),
    TileLookup: { lookup: function() { return null; }, byId: function() { return null; } },
    AudioSystem: { play: function() {}, playMusic: function() {}, stopMusic: function() {} },
    Raycaster: { pause: function() {}, resume: function() {}, isPaused: function() { return false; },
      setFloor: function() {}, getCanvas: function() { return fakeEl(); } },
    Player: { getX: function() { return 0; }, getY: function() { return 0; }, getDir: function() { return 0; },
      getStats: function() { return {}; }, hasItem: function() { return false; } },
    FloorManager: { getFloor: function() { return '1'; }, getCurrentTile: function() { return 0; } },
    Game: { interact: function() {}, openCorpseMenu: function() {}, getState: function() { return {}; } },
    CardAuthority: { getCard: function() { return null; }, on: function() {}, off: function() {} },
    CardSystem: { getCardById: function() { return null; } },
    CrateSystem: { getTorchState: function() { return 'unlit'; }, getPhase: function() { return 'loot'; },
      isHovered: function() { return false; }, isOpen: function() { return false; } },
    DayCycle: { getDay: function() { return 1; }, getPhase: function() { return 'day'; } },
    TorchState: { getState: function() { return 'unlit'; }, light: function() {}, douse: function() {} },
    CorpseRegistry: { get: function() { return null; }, clearFloor: function() {} },
    DragDrop: { register: function() {}, unregister: function() {} },
    MenuFaces: { attach: function() {}, detach: function() {} },
    BoxAnim: { play: function() {}, stop: function() {}, create: function() { return { play: function() {}, stop: function() {} }; } },
    HUD: { show: function() {}, hide: function() {} },
    Toast: { show: function() {} },
    DialogBox: { show: function() {}, isOpen: function() { return false; } },
    InputPoll: { on: function() {}, off: function() {} },
    i18n: { t: function(k) { return k; } },
    SessionStats: { record: function() {} },
    Lighting: { addLightSource: function() {}, clearFloor: function() {} },
    DoorContracts: { resolve: function() { return null; } },
    DoorSprites: { getExteriorFace: function() { return 0; } }
  };

  // window self-refs
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  // Mirror engine globals on window — peek IIFEs gate on window.PeekShell.
  var MIRROR = [
    'PeekShell','TILES','TileLookup','AudioSystem','Raycaster','Player',
    'FloorManager','Game','CardAuthority','CardSystem','CrateSystem',
    'DayCycle','TorchState','CorpseRegistry','DragDrop','MenuFaces','BoxAnim',
    'HUD','Toast','DialogBox','InputPoll','i18n','SessionStats','Lighting',
    'DoorContracts','DoorSprites'
  ];
  for (var i = 0; i < MIRROR.length; i++) sandbox.window[MIRROR[i]] = sandbox[MIRROR[i]];

  vm.createContext(sandbox);

  function loadFile(relPath) {
    var absPath = path.isAbsolute(relPath) ? relPath : path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) return { ok: false, reason: 'missing: ' + relPath };
    try {
      var code = fs.readFileSync(absPath, 'utf8');
      vm.runInContext(code, sandbox, { filename: relPath, timeout: 5000 });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: (e && e.message) || String(e) };
    }
  }

  return { sandbox: sandbox, loadFile: loadFile, registrations: registrations };
}

function loadPeekModule(relPath) {
  var h = createPeekSandbox();
  var r = h.loadFile(relPath);
  return {
    ok: !!r.ok,
    error: r.ok ? null : r.reason,
    registrations: h.registrations.slice()
  };
}

function extractBfData(src) {
  var m = BF_DATA_RE.exec(src);
  if (!m) return { ok: false, error: 'no BF-DATA block found' };
  try {
    var data = JSON.parse(m[1]);
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: 'BF-DATA block is not valid JSON: ' + ((e && e.message) || e) };
  }
}

module.exports = {
  createPeekSandbox: createPeekSandbox,
  loadPeekModule: loadPeekModule,
  extractBfData: extractBfData,
  BF_DATA_RE: BF_DATA_RE,
  ROOT: ROOT
};
