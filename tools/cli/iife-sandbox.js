// ═══════════════════════════════════════════════════════════════
//  tools/cli/iife-sandbox.js — Headless loader for one (or all)
//  engine/floor-blockout-*.js IIFEs.
//  Slice C2 — Track C (agent-feedback closeouts)
//
//  The main engine is a browser-first IIFE stack; extract-floors.js
//  solved "load all floors into a Node VM" for the batch extractor.
//  This module lifts the same stub bag so per-file `bo ingest` can
//  parse a single floor without rebuilding floor-data.json wholesale.
//
//  Shared consumers:
//    * tools/extract-floors.js   (batch — can be migrated later)
//    * tools/cli/commands-ingest.js (Slice C2)
//
//  Public API:
//    createSandbox()       → { sandbox, loadFile(relPath) }
//    extractFloor(sandbox, floorId) → normalized floor record or null
// ═══════════════════════════════════════════════════════════════
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var ROOT = path.resolve(__dirname, '..', '..');

// ── Canvas / DOM stubs (copied from tools/extract-floors.js) ───
// Kept small on purpose: any engine module that touches DOM during
// IIFE evaluation needs a benign no-op target.
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
  return { getContext: fakeCtx, width: 0, height: 0, style: {},
    classList: { add: function() {}, remove: function() {}, toggle: function() {}, contains: function() { return false; } },
    addEventListener: function() {}, appendChild: function() {}, setAttribute: function() {},
    innerHTML: '', textContent: '', toDataURL: function() { return ''; } };
}

function createSandbox() {
  var sandbox = vm.createContext({
    console: console, Math: Math, parseInt: parseInt, parseFloat: parseFloat,
    String: String, Array: Array, Object: Object, JSON: JSON,
    Error: Error, TypeError: TypeError, RangeError: RangeError,
    isNaN: isNaN, isFinite: isFinite, Infinity: Infinity, NaN: NaN,
    Uint8ClampedArray: Uint8ClampedArray, Uint8Array: Uint8Array,
    Float32Array: Float32Array, Float64Array: Float64Array, Int32Array: Int32Array,
    Map: Map, Set: Set, Promise: Promise, Proxy: Proxy,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: setInterval, clearInterval: clearInterval,
    performance: { now: function() { return Date.now(); } },
    document: { getElementById: fakeEl, createElement: fakeEl, addEventListener: function() {},
      querySelectorAll: function() { return []; }, querySelector: function() { return null; },
      body: { appendChild: function() {} } },
    window: { addEventListener: function() {}, requestAnimationFrame: function() {},
      innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1 },
    Image: function() { this.onload = null; this.src = ''; },
    AudioContext: function() { this.createGain = function() { return { gain: { value: 1 }, connect: function() {} }; };
      this.destination = {}; this.state = 'running'; this.resume = function() { return Promise.resolve(); }; },
    webkitAudioContext: null,
    Audio: function() { this.play = function() {}; this.pause = function() {}; },
    requestAnimationFrame: function() {},
    fetch: function() { return Promise.resolve({ ok: false, json: function() { return Promise.resolve({}); } }); },
    navigator: { userAgent: 'node', language: 'en-US' },
    localStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },
    // Engine module stubs — only need to exist as globals so IIFE evals don't crash
    MovementController: { dirToAngle: function(d) { return d * Math.PI / 2; }, getGridPos: function() { return { x: 0, y: 0 }; },
      getAngle: function() { return 0; }, isMoving: function() { return false; }, WALK_TIME: 500, ROT_TIME: 250 },
    GridGen: { generate: function(w, h) { var g = []; for (var y = 0; y < h; y++) { g[y] = []; for (var x = 0; x < w; x++) g[y][x] = 0; } return { grid: g, rooms: [], doors: {} }; } },
    DoorContracts: { resolve: function() { return null; }, spawnForEntry: function() { return { x: 0, y: 0, dir: 0 }; } },
    DoorContractAudio: { getSequence: function() { return []; } },
    DoorSprites: { setTexture: function() {}, setExteriorFace: function() {}, registerFacade: function() {},
      getExteriorFace: function() { return 0; }, clearFloor: function() {} },
    DoorAnimator: { reset: function() {} },
    Lighting: { cast: function() {}, addLightSource: function() {}, clearFloor: function() {} },
    SpatialContract: { exterior: function() { return { wallH: 2 }; }, interior: function() { return { wallH: 2 }; },
      nestedDungeon: function() { return { wallH: 1 }; }, computeDoorHeights: function() { return {}; } },
    TextureAtlas: { getTexture: function() { return null; } },
    Raycaster: { setFloor: function() {} },
    Minimap: { setFloor: function() {}, pushFloor: function() {}, popFloor: function() {} },
    HUD: { show: function() {}, hide: function() {}, update: function() {} },
    TransitionFX: { fadeIn: function() {}, fadeOut: function() {}, isActive: function() { return false; } },
    Skybox: { setFloor: function() {} },
    Player: { getX: function() { return 0; }, getY: function() { return 0; }, setPos: function() {},
      getStats: function() { return {}; }, hasItem: function() { return false; } },
    EnemyAI: { spawn: function() {}, clearFloor: function() {}, getEnemies: function() { return []; },
      spawnEnemies: function() { return []; }, assignBarkPools: function() {} },
    CombatEngine: {}, SynergyEngine: {},
    CardAuthority: { getGold: function() { return 0; }, on: function() {}, off: function() {} },
    CardTransfer: {}, CardSystem: { getCardById: function() { return null; } },
    LootTables: { roll: function() { return []; } },
    WorldItems: { placeFloorItems: function() {}, clearFloor: function() {} },
    Pathfind: { findPath: function() { return []; } },
    SessionStats: { record: function() {} }, Salvage: {},
    BreakableSpawner: { populate: function() {}, clear: function() {} },
    SeededRNG: { seed: function() {}, random: function() { return Math.random(); },
      randInt: function(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; },
      pick: function(arr) { return arr && arr.length ? arr[0] : null; },
      shuffle: function(a) { return a; },
      beginRun: function() {}, deriveFloor: function() {}, currentSeed: function() { return null; }, runSeed: function() { return null; } },
    AudioSystem: { play: function() {}, playMusic: function() {}, stopMusic: function() {} },
    UISprites: {},
    i18n: { t: function(k) { return k; } },
    GameLoop: { isRunning: function() { return false; } },
    ScreenManager: { current: function() { return 'game'; } },
    Toast: { show: function() {} },
    DialogBox: { show: function() {}, isOpen: function() { return false; } },
    MenuBox: {}, SplashScreen: {}, MouseLook: {}, InputPoll: {}, InteractPrompt: {},
    BuildingRegistry: { get: function() { return null; }, getAll: function() { return {}; } },
    TorchState: { clearFloor: function() {}, init: function() {}, registerFloor: function() {} },
    BonfireSprites: { clearFloor: function() {}, init: function() {} },
    WindowSprites: { clearFloor: function() {}, init: function() {} },
    DumpTruckSprites: { clearFloor: function() {}, init: function() {} },
    DumpTruckSpawner: { populate: function() {}, clear: function() {} },
    CobwebSystem: { clearFloor: function() {}, init: function() {} },
    DetritusSprites: { clearFloor: function() {}, init: function() {} },
    CorpseRegistry: { clearFloor: function() {}, register: function() {} }
  });
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;

  function loadFile(relPath) {
    var absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) return { ok: false, reason: 'missing: ' + relPath };
    try {
      var code = fs.readFileSync(absPath, 'utf8');
      vm.runInContext(code, sandbox, { filename: relPath, timeout: 5000 });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: (e && e.message) || String(e) };
    }
  }

  return { sandbox: sandbox, loadFile: loadFile };
}

// ── Bootstrap the common prefix for any floor ingest ─────────
// Loads tiles.js + floor-manager.js. Returns the harness. Callers
// then loadFile('engine/floor-blockout-<id>.js') themselves.
function bootstrapForIngest() {
  var h = createSandbox();
  var prefix = [
    'engine/tiles.js',
    'engine/floor-manager.js'
  ];
  for (var i = 0; i < prefix.length; i++) {
    var r = h.loadFile(prefix[i]);
    if (!r.ok) throw new Error('iife-sandbox: failed to load ' + prefix[i] + ' — ' + r.reason);
  }
  return h;
}

// ── Extract a single floor by id (post-loadFile) ─────────────
// Calls FloorManager._testGetBuilders()[floorId] and normalizes the
// result into the same shape tools/floor-data.json uses, so callers
// can Object.assign(raw.floors, { [id]: extractFloor(...) }).
function extractFloor(sandbox, floorId) {
  var FM = sandbox.FloorManager;
  if (!FM || typeof FM._testGetBuilders !== 'function') {
    throw new Error('FloorManager._testGetBuilders not in sandbox (did tiles.js + floor-manager.js load?)');
  }
  var builders = FM._testGetBuilders();
  if (!builders[floorId]) return null;
  var d = builders[floorId]();
  if (!d || !d.grid || d.grid.length < 1) return null;
  return {
    floorId: d.floorId || floorId,
    grid: d.grid,
    gridW: d.gridW || (d.grid[0] ? d.grid[0].length : 0),
    gridH: d.gridH || d.grid.length,
    rooms: d.rooms || [],
    doors: d.doors || {},
    doorTargets: d.doorTargets || {},
    doorFaces: d.doorFaces || {},
    procGenChildren: Array.isArray(d.procGenChildren) ? d.procGenChildren.slice() : [],
    spawn: d.spawn || null,
    biome: d.biome || '',
    shops: d.shops || [],
    entities: Array.isArray(d.entities) ? d.entities.slice() : []
  };
}

module.exports = {
  createSandbox: createSandbox,
  bootstrapForIngest: bootstrapForIngest,
  extractFloor: extractFloor,
  ROOT: ROOT
};
