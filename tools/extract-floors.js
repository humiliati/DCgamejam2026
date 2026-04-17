#!/usr/bin/env node
/**
 * extract-floors.js — Extracts raw floor blockout grids into floor-data.json.
 * Uses FloorManager._testGetBuilders() to call raw builders (no post-processing).
 *
 * Usage:  node tools/extract-floors.js
 * Output: tools/floor-data.json
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.resolve(__dirname, '..');
var ENGINE = path.join(ROOT, 'engine');

// Minimal stubs for canvas/document
function fakeCtx() {
  return new Proxy({}, { get: function(t,p) {
    if (p === 'createImageData') return function(w,h){ return {data:new Uint8ClampedArray(w*h*4),width:w,height:h}; };
    if (p === 'getImageData') return function(x,y,w,h){ return {data:new Uint8ClampedArray(w*h*4)}; };
    if (p === 'measureText') return function(){ return {width:0}; };
    if (p === 'canvas') return { width:64, height:64, toDataURL:function(){return '';} };
    return function(){ return fakeCtx(); };
  }, set: function(){ return true; }});
}
function fakeEl() {
  return { getContext:fakeCtx, width:0, height:0, style:{},
    classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false;}},
    addEventListener:function(){}, appendChild:function(){}, setAttribute:function(){},
    innerHTML:'', textContent:'', toDataURL:function(){return '';} };
}

// Sandbox with all engine globals stubbed
var sandbox = vm.createContext({
  console:console, Math:Math, parseInt:parseInt, parseFloat:parseFloat,
  String:String, Array:Array, Object:Object, JSON:JSON,
  Error:Error, TypeError:TypeError, RangeError:RangeError,
  isNaN:isNaN, isFinite:isFinite, Infinity:Infinity, NaN:NaN,
  Uint8ClampedArray:Uint8ClampedArray, Uint8Array:Uint8Array,
  Float32Array:Float32Array, Float64Array:Float64Array, Int32Array:Int32Array,
  Map:Map, Set:Set, Promise:Promise, Proxy:Proxy,
  setTimeout:setTimeout, clearTimeout:clearTimeout,
  setInterval:setInterval, clearInterval:clearInterval,
  performance:{now:function(){return Date.now();}},
  document:{getElementById:fakeEl, createElement:fakeEl, addEventListener:function(){},
    querySelectorAll:function(){return [];}, querySelector:function(){return null;},
    body:{appendChild:function(){}}},
  window:{addEventListener:function(){},requestAnimationFrame:function(){},
    innerWidth:1920,innerHeight:1080,devicePixelRatio:1},
  Image:function(){this.onload=null;this.src='';},
  AudioContext:function(){this.createGain=function(){return{gain:{value:1},connect:function(){}};};
    this.destination={};this.state='running';this.resume=function(){return Promise.resolve();};},
  webkitAudioContext:null,
  Audio:function(){this.play=function(){};this.pause=function(){};},
  requestAnimationFrame:function(){},
  fetch:function(){return Promise.resolve({ok:false,json:function(){return Promise.resolve({});}});},
  navigator:{userAgent:'node',language:'en-US'},
  localStorage:{getItem:function(){return null;},setItem:function(){},removeItem:function(){}},
  MovementController:{dirToAngle:function(d){return d*Math.PI/2;},getGridPos:function(){return{x:0,y:0};},
    getAngle:function(){return 0;},isMoving:function(){return false;},WALK_TIME:500,ROT_TIME:250},
  GridGen:{generate:function(w,h){var g=[];for(var y=0;y<h;y++){g[y]=[];for(var x=0;x<w;x++)g[y][x]=0;}return{grid:g,rooms:[],doors:{}};}},
  DoorContracts:{resolve:function(){return null;},spawnForEntry:function(){return{x:0,y:0,dir:0};}},
  DoorContractAudio:{getSequence:function(){return [];}},
  DoorSprites:{setTexture:function(){},setExteriorFace:function(){},registerFacade:function(){},
    getExteriorFace:function(){return 0;},clearFloor:function(){}},
  DoorAnimator:{reset:function(){}},
  Lighting:{cast:function(){},addLightSource:function(){},clearFloor:function(){}},
  SpatialContract:{exterior:function(){return{wallH:2};},interior:function(){return{wallH:2};},
    nestedDungeon:function(){return{wallH:1};},computeDoorHeights:function(){return{};}},
  TextureAtlas:{getTexture:function(){return null;}},
  Raycaster:{setFloor:function(){}},
  Minimap:{setFloor:function(){},pushFloor:function(){},popFloor:function(){}},
  HUD:{show:function(){},hide:function(){},update:function(){}},
  TransitionFX:{fadeIn:function(){},fadeOut:function(){},isActive:function(){return false;}},
  Skybox:{setFloor:function(){}},
  Player:{getX:function(){return 0;},getY:function(){return 0;},setPos:function(){},
    getStats:function(){return{};},hasItem:function(){return false;}},
  EnemyAI:{spawn:function(){},clearFloor:function(){},getEnemies:function(){return[];},
    spawnEnemies:function(){return[];},assignBarkPools:function(){}},
  CombatEngine:{},SynergyEngine:{},
  CardAuthority:{getGold:function(){return 0;},on:function(){},off:function(){}},
  CardTransfer:{},CardSystem:{getCardById:function(){return null;}},
  LootTables:{roll:function(){return[];}},
  WorldItems:{placeFloorItems:function(){},clearFloor:function(){}},
  Pathfind:{findPath:function(){return[];}},
  SessionStats:{record:function(){}},Salvage:{},
  BreakableSpawner:{populate:function(){},clear:function(){}},
  SeededRNG:{seed:function(){},random:function(){return Math.random();},
    randInt:function(a,b){return Math.floor(Math.random()*(b-a+1))+a;},
    pick:function(arr){return arr&&arr.length?arr[0]:null;},
    shuffle:function(a){return a;}},
  AudioSystem:{play:function(){},playMusic:function(){},stopMusic:function(){}},
  UISprites:{},
  i18n:{t:function(k){return k;}},
  GameLoop:{isRunning:function(){return false;}},
  ScreenManager:{current:function(){return 'game';}},
  Toast:{show:function(){}},
  DialogBox:{show:function(){},isOpen:function(){return false;}},
  MenuBox:{},SplashScreen:{},MouseLook:{},InputPoll:{},InteractPrompt:{},
  BuildingRegistry:{get:function(){return null;},getAll:function(){return{};}},
  TorchState:{clearFloor:function(){},init:function(){},registerFloor:function(){}},
  BonfireSprites:{clearFloor:function(){},init:function(){}},
  WindowSprites:{clearFloor:function(){},init:function(){}},
  DumpTruckSprites:{clearFloor:function(){},init:function(){}},
  DumpTruckSpawner:{populate:function(){},clear:function(){}},
  CobwebSystem:{clearFloor:function(){},init:function(){}},
  DetritusSprites:{clearFloor:function(){},init:function(){}},
  CorpseRegistry:{clearFloor:function(){},register:function(){}}
});
sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;

function loadFile(relPath) {
  var absPath = path.join(ROOT, relPath);
  if (!fs.existsSync(absPath)) { return false; }
  try {
    var code = fs.readFileSync(absPath, 'utf8');
    vm.runInContext(code, sandbox, { filename: relPath, timeout: 5000 });
    return true;
  } catch (e) {
    console.warn('  WARN: ' + relPath + ' -- ' + String(e.message||e).split('\n')[0]);
    return false;
  }
}

console.log('Loading...');
loadFile('engine/tiles.js');
loadFile('engine/floor-manager.js');
fs.readdirSync(ENGINE).filter(function(f){return /^floor-blockout-/.test(f);}).sort()
  .forEach(function(f){ loadFile('engine/' + f); });

var FM = sandbox.FloorManager;
if (!FM || typeof FM._testGetBuilders !== 'function') {
  console.error('FATAL: FloorManager._testGetBuilders not available');
  process.exit(1);
}

console.log('\nExtracting via _testGetBuilders...\n');
var builders = FM._testGetBuilders();
var floors = {};

for (var id in builders) {
  try {
    var d = builders[id]();
    if (d && d.grid && d.grid.length > 1) {
      floors[id] = {
        floorId: d.floorId || id,
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
        entities: Array.isArray(d.entities) ? d.entities.slice() : null
      };
      console.log('  OK: "' + id + '" -- ' + floors[id].gridW + 'x' + floors[id].gridH);
    }
  } catch(e) {
    console.warn('  FAIL "' + id + '": ' + e.message);
  }
}

var outPath = path.join(__dirname, 'floor-data.json');

// ── Pass 5a: merge entities from previous floor-data.json ────────
try {
  if (fs.existsSync(outPath)) {
    var prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    var prevFloors = (prev && prev.floors) || {};
    Object.keys(prevFloors).forEach(function(id) {
      var p = prevFloors[id];
      if (!floors[id]) {
        floors[id] = p;
        console.log('  KEEP (CLI-only): "' + id + '"');
        return;
      }
      if (!floors[id].entities && Array.isArray(p.entities)) {
        floors[id].entities = p.entities.slice();
      }
    });
  }
} catch (e) {
  console.warn('  WARN: could not merge previous floor-data.json: ' + e.message);
}

// Normalize: any floor without entities[] gets an empty array.
Object.keys(floors).forEach(function(id) {
  if (!Array.isArray(floors[id].entities)) floors[id].entities = [];
});

// ── M3: merge payload sidecars from tools/floor-payloads/ ─────────
var payloadDir = path.join(__dirname, 'floor-payloads');
var payloadCount = 0;
var questPayloadCount = 0;
var questCount = 0;
// Phase 6: top-level aggregate of distributed anchors lifted from
// *.quest.json sidecars. Flat {anchorId: spec} map. At runtime
// FloorManager.getDistributedAnchors() returns this blob and
// QuestRegistry.init unions it with data/quests.json.anchors.
var _sidecarAnchors = {};
var _sidecarAnchorSources = {};   // {anchorId: <sidecar filename>} for collision reporting
var sidecarAnchorCount = 0;
var sidecarAnchorCollisions = 0;
try {
  if (fs.existsSync(payloadDir)) {
    fs.readdirSync(payloadDir).forEach(function(file) {
      if (!file.endsWith('.json')) return;

      // Phase 0b: quest sidecars (<floorId>.quest.json) merge into
      // floors[fid].quests rather than floors[fid]._payload. They
      // must be routed FIRST because .quest.json also ends in .json.
      if (file.endsWith('.quest.json')) {
        try {
          var qp = JSON.parse(fs.readFileSync(path.join(payloadDir, file), 'utf8'));
          var qfid = qp.floorId || file.replace(/\.quest\.json$/, '');
          if (floors[qfid]) {
            var qlist = Array.isArray(qp.quests) ? qp.quests : [];
            floors[qfid].quests = qlist;
            questPayloadCount++;
            questCount += qlist.length;
          } else {
            console.log('  quest sidecar ' + file + ': floor "' + qfid + '" not found in blockouts — skipped');
          }
          // Phase 6: harvest optional anchors block — distributed
          // anchor defs live next to the floor they describe. Union
          // into the flat top-level map with loud collision detection.
          if (qp.anchors && typeof qp.anchors === 'object' && !Array.isArray(qp.anchors)) {
            Object.keys(qp.anchors).forEach(function (aid) {
              var spec = qp.anchors[aid];
              if (!spec || typeof spec !== 'object') {
                console.warn('  WARN: sidecar ' + file + ' anchor "' + aid + '" is not an object — skipped');
                return;
              }
              if (Object.prototype.hasOwnProperty.call(_sidecarAnchors, aid)) {
                sidecarAnchorCollisions++;
                console.warn('  ERROR: sidecar anchor "' + aid + '" defined in BOTH "' +
                             _sidecarAnchorSources[aid] + '" AND "' + file + '" — first-seen wins');
                return;
              }
              _sidecarAnchors[aid] = spec;
              _sidecarAnchorSources[aid] = file;
              sidecarAnchorCount++;
            });
          }
        } catch (qe) {
          console.warn('  WARN: could not parse quest sidecar ' + file + ': ' + qe.message);
        }
        return;
      }

      try {
        var p = JSON.parse(fs.readFileSync(path.join(payloadDir, file), 'utf8'));
        var fid = p.floorId || file.replace(/\.json$/, '');
        if (floors[fid]) {
          floors[fid]._payload = p;
          payloadCount++;
        } else {
          console.log('  payload ' + file + ': floor "' + fid + '" not found in blockouts — skipped');
        }
      } catch (pe) {
        console.warn('  WARN: could not parse payload ' + file + ': ' + pe.message);
      }
    });
    if (payloadCount > 0) console.log('  Merged ' + payloadCount + ' payload sidecar(s) into floor data');
    if (questPayloadCount > 0) console.log('  Merged ' + questPayloadCount + ' quest sidecar(s) (' + questCount + ' quests) into floor data');
    if (sidecarAnchorCount > 0) console.log('  Harvested ' + sidecarAnchorCount + ' distributed anchor(s) from quest sidecars' +
                                            (sidecarAnchorCollisions ? ' (' + sidecarAnchorCollisions + ' collision(s) — see WARN above)' : ''));
  }
} catch (e) {
  console.warn('  WARN: payload scan failed: ' + e.message);
}

// Normalize: any floor without quests[] gets an empty array.
Object.keys(floors).forEach(function(id) {
  if (!Array.isArray(floors[id].quests)) floors[id].quests = [];
});

var _floorPayload = JSON.stringify({
  generated: new Date().toISOString(),
  floorCount: Object.keys(floors).length,
  payloadCount: payloadCount,
  questPayloadCount: questPayloadCount,
  questCount: questCount,
  sidecarAnchorCount: sidecarAnchorCount,
  sidecarAnchorCollisions: sidecarAnchorCollisions,
  _sidecarAnchors: _sidecarAnchors,
  _sidecarAnchorSources: _sidecarAnchorSources,
  floors: floors
}, null, 2);
fs.writeFileSync(outPath, _floorPayload);
console.log('\nDone: ' + Object.keys(floors).length + ' floors -> tools/floor-data.json');

// Sidecar .js wrapper
var _jsPath = path.join(__dirname, 'floor-data.js');
fs.writeFileSync(_jsPath,
  '// AUTO-GENERATED by tools/extract-floors.js — do not edit by hand.\n' +
  '// Sidecar wrapper so world-designer.html works under file:// (bypasses\n' +
  '// Chromium CORS fetch block). Keep in sync with floor-data.json.\n' +
  'window.FLOOR_DATA = ' + _floorPayload + ';\n');
console.log('Done: floor-data.js sidecar -> tools/floor-data.js');

// ─────────────────────────────────────────────────────────────────────
//  QUEST SIDECARS (DOC-107 Phase 6) — slim runtime blob
//
//  The main floor-data.js sidecar above is consumed by world-designer.html
//  under file://, but the GAME runtime (index.html) does NOT load it
//  (it carries hundreds of KB of grid data the engine doesn't need —
//  each floor has its own engine/floor-blockout-*.js IIFE instead).
//
//  Phase 6 needs a runtime path for distributed anchors to reach
//  FloorManager.getDistributedAnchors() at boot. So we emit a SECOND
//  slim sidecar — data/quest-sidecars.js — that contains only the
//  quest-relevant slice:
//
//    window.QUEST_SIDECARS = {
//      generated:        <iso>,
//      anchors:          { anchorId: spec, ... },   // distributed anchor union
//      anchorSources:    { anchorId: 'N.N.quest.json', ... },
//      floorQuests:      { floorId:  [quest, ...], ... },
//      anchorCount:      N,
//      collisionCount:   N
//    };
//
//  Loaded from index.html as a Layer 5 (data) script, BEFORE
//  engine/quest-registry.js runs init(). FloorManager exposes
//  getDistributedAnchors()/getQuestAnchors() which read this blob.
// ─────────────────────────────────────────────────────────────────────
var floorQuestsOut = {};
Object.keys(floors).forEach(function (fid) {
  if (Array.isArray(floors[fid].quests) && floors[fid].quests.length > 0) {
    floorQuestsOut[fid] = floors[fid].quests;
  }
});
var _questSidecarPayload = JSON.stringify({
  generated:      new Date().toISOString(),
  anchors:        _sidecarAnchors,
  anchorSources:  _sidecarAnchorSources,
  floorQuests:    floorQuestsOut,
  anchorCount:    sidecarAnchorCount,
  collisionCount: sidecarAnchorCollisions
}, null, 2);
var _questSidecarPath = path.join(ROOT, 'data', 'quest-sidecars.js');
fs.writeFileSync(_questSidecarPath,
  '// AUTO-GENERATED by tools/extract-floors.js — do not edit by hand.\n' +
  '// DOC-107 Phase 6: distributed anchors + per-floor quest defs harvested\n' +
  '// from tools/floor-payloads/*.quest.json. Loaded by index.html at Layer 5\n' +
  '// (data) and read at boot by FloorManager.getDistributedAnchors() and\n' +
  '// FloorManager.getQuestAnchors(). QuestRegistry.init unions these with\n' +
  '// data/quests.json.anchors; central wins on collision (Phase 6 policy).\n' +
  'window.QUEST_SIDECARS = ' + _questSidecarPayload + ';\n');
console.log('Done: quest-sidecars.js -> data/quest-sidecars.js ('
            + sidecarAnchorCount + ' anchor(s), '
            + Object.keys(floorQuestsOut).length + ' floor(s) with quests)');

// ─────────────────────────────────────────────────────────────────────
//  TILE SCHEMA EXTRACTION (Phase 3)
// ─────────────────────────────────────────────────────────────────────
console.log('\nExtracting tile schema from engine/tiles.js...');
var T_ = sandbox.TILES;
if (!T_) {
  console.warn('  WARN: TILES global not loaded - skipping schema');
} else {
  var META = {
    EMPTY:{color:'#1a1a1a',glyph:'.',cat:'floor'},
    WALL:{color:'#6b5b4f',glyph:'#',cat:'structure'},
    DOOR:{color:'#d4a44a',glyph:'D',cat:'door'},
    DOOR_BACK:{color:'#b8863a',glyph:'B',cat:'door'},
    DOOR_EXIT:{color:'#c97a30',glyph:'X',cat:'door'},
    STAIRS_DN:{color:'#5577cc',glyph:'v',cat:'door'},
    STAIRS_UP:{color:'#77aaee',glyph:'^',cat:'door'},
    CHEST:{color:'#cc9933',glyph:'C',cat:'interact'},
    TRAP:{color:'#cc3333',glyph:'T',cat:'hazard'},
    WATER:{color:'#2255aa',glyph:'~',cat:'terrain'},
    PILLAR:{color:'#888888',glyph:'O',cat:'structure'},
    BREAKABLE:{color:'#8b6b3a',glyph:'%',cat:'structure'},
    SHOP:{color:'#44bb88',glyph:'$',cat:'interact'},
    SPAWN:{color:'#ff44ff',glyph:'S',cat:'meta'},
    BOSS_DOOR:{color:'#ff2222',glyph:'!',cat:'door'},
    FIRE:{color:'#ff6622',glyph:'f',cat:'hazard'},
    SPIKES:{color:'#cc4444',glyph:'s',cat:'hazard'},
    POISON:{color:'#44cc44',glyph:'p',cat:'hazard'},
    BONFIRE:{color:'#ff8800',glyph:'*',cat:'interact'},
    CORPSE:{color:'#775544',glyph:'c',cat:'interact'},
    COLLECTIBLE:{color:'#ffdd44',glyph:'o',cat:'interact'},
    TREE:{color:'#2d6b2d',glyph:'Y',cat:'nature'},
    SHRUB:{color:'#4a8a3a',glyph:'h',cat:'nature'},
    PUZZLE:{color:'#aa66cc',glyph:'?',cat:'interact'},
    LOCKED_DOOR:{color:'#aa2222',glyph:'L',cat:'door'},
    BOOKSHELF:{color:'#7a5533',glyph:'b',cat:'furnish'},
    BAR_COUNTER:{color:'#5a4a3a',glyph:'=',cat:'furnish'},
    BED:{color:'#6a4a6a',glyph:'B',cat:'furnish'},
    TABLE:{color:'#7a6a4a',glyph:'t',cat:'furnish'},
    HEARTH:{color:'#cc5500',glyph:'H',cat:'freeform'},
    TORCH_LIT:{color:'#ffaa22',glyph:'i',cat:'light'},
    TORCH_UNLIT:{color:'#555533',glyph:'j',cat:'light'},
    ROAD:{color:'#7a7a6a',glyph:'=',cat:'terrain'},
    PATH:{color:'#9a8a6a',glyph:':',cat:'terrain'},
    GRASS:{color:'#3a7a3a',glyph:',',cat:'terrain'},
    FENCE:{color:'#8a7a5a',glyph:'|',cat:'structure'},
    TERMINAL:{color:'#33aa55',glyph:'>',cat:'interact'},
    MAILBOX:{color:'#5577bb',glyph:'M',cat:'interact'},
    DUMP_TRUCK:{color:'#667788',glyph:'K',cat:'freeform'},
    DETRITUS:{color:'#6a5a4a',glyph:'~',cat:'terrain'},
    WELL:{color:'#4466aa',glyph:'W',cat:'infra'},
    BENCH:{color:'#7a6a4a',glyph:'_',cat:'infra'},
    NOTICE_BOARD:{color:'#aa8844',glyph:'N',cat:'infra'},
    ANVIL:{color:'#555566',glyph:'A',cat:'infra'},
    BARREL:{color:'#7a5533',glyph:'Q',cat:'infra'},
    CHARGING_CRADLE:{color:'#5588aa',glyph:'Z',cat:'infra'},
    SWITCHBOARD:{color:'#887744',glyph:'~',cat:'infra'},
    SOUP_KITCHEN:{color:'#aa6633',glyph:'U',cat:'infra'},
    COT:{color:'#6a5a5a',glyph:'-',cat:'infra'},
    ROOST:{color:'#5a4a3a',glyph:'r',cat:'creature'},
    NEST:{color:'#6a5a3a',glyph:'n',cat:'creature'},
    DEN:{color:'#5a4a4a',glyph:'d',cat:'creature'},
    FUNGAL_PATCH:{color:'#44aa77',glyph:'g',cat:'creature'},
    ENERGY_CONDUIT:{color:'#66aacc',glyph:'E',cat:'creature'},
    TERRITORIAL_MARK:{color:'#aa5533',glyph:'x',cat:'creature'},
    STRETCHER_DOCK:{color:'#887766',glyph:'+',cat:'economy'},
    TRIAGE_BED:{color:'#778877',glyph:'+',cat:'economy'},
    MORGUE_TABLE:{color:'#667766',glyph:'+',cat:'economy'},
    INCINERATOR:{color:'#884422',glyph:'I',cat:'economy'},
    REFRIG_LOCKER:{color:'#668899',glyph:'R',cat:'economy'},
    ROOF_EAVE_L:{color:'#8b4513',glyph:'/',cat:'floating'},
    ROOF_SLOPE_L:{color:'#9b5523',glyph:'/',cat:'floating'},
    ROOF_PEAK:{color:'#ab6533',glyph:'^',cat:'floating'},
    ROOF_SLOPE_R:{color:'#9b5523',glyph:'\\',cat:'floating'},
    ROOF_EAVE_R:{color:'#8b4513',glyph:'\\',cat:'floating'},
    CANOPY:{color:'#1a5a1a',glyph:'@',cat:'floating'},
    CANOPY_MOSS:{color:'#2a6a1a',glyph:'@',cat:'floating'},
    ROOF_CRENEL:{color:'#7a6a5a',glyph:'W',cat:'floating'},
    PERGOLA:{color:'#6a5a3a',glyph:'=',cat:'floating'},
    CITY_BONFIRE:{color:'#ee7711',glyph:'*',cat:'freeform'},
    PERGOLA_BEAM:{color:'#8a7a4a',glyph:'-',cat:'freeform'},
    ARCH_DOORWAY:{color:'#d4a44a',glyph:'A',cat:'freeform'},
    PORTHOLE:{color:'#aaaacc',glyph:'O',cat:'freeform'},
    WINDOW_TAVERN:{color:'#5599bb',glyph:'w',cat:'freeform'},
    DOOR_FACADE:{color:'#bb8833',glyph:'F',cat:'freeform'},
    TRAPDOOR_DN:{color:'#5566aa',glyph:'v',cat:'freeform'},
    TRAPDOOR_UP:{color:'#7788cc',glyph:'^',cat:'freeform'},
    WINDOW_SHOP:{color:'#66aabb',glyph:'w',cat:'freeform'},
    WINDOW_BAY:{color:'#77bbcc',glyph:'b',cat:'freeform'},
    WINDOW_SLIT:{color:'#556677',glyph:'i',cat:'freeform'},
    WINDOW_ALCOVE:{color:'#8899aa',glyph:'a',cat:'freeform'},
    WINDOW_COMMERCIAL:{color:'#88ccdd',glyph:'c',cat:'freeform'},
    WINDOW_ARROWSLIT:{color:'#445566',glyph:'v',cat:'freeform'},
    WINDOW_MURDERHOLE:{color:'#334455',glyph:'m',cat:'freeform'},
    // DOC-112 / BOXFORGE Phase 5.0 — mechanism-before-fire trap family.
    TRAP_PRESSURE_PLATE:{color:'#aa6644',glyph:'p',cat:'hazard'},
    TRAP_DART_LAUNCHER: {color:'#887755',glyph:'d',cat:'hazard'},
    TRAP_TRIPWIRE:      {color:'#996633',glyph:'-',cat:'hazard'},
    TRAP_SPIKE_PIT:     {color:'#554433',glyph:'v',cat:'hazard'},
    TRAP_TELEPORT_DISC: {color:'#6644aa',glyph:'o',cat:'hazard'},
    COBWEB:             {color:'#bbbbcc',glyph:'w',cat:'creature'}
  };
  var tileSchema = {};
  var missing = [];
  var maxId = -1;
  Object.keys(T_).forEach(function(key) {
    var v = T_[key];
    if (typeof v !== 'number') return;
    var meta = META[key] || {color:'#ff00ff',glyph:'?',cat:'meta'};
    if (!META[key]) missing.push(key+'='+v);
    tileSchema[v] = {
      id: v, name: key, category: meta.cat, color: meta.color, glyph: meta.glyph,
      walk: !!T_.isWalkable(v),
      opq:  !!T_.isOpaque(v),
      hazard: !!(T_.isHazard && T_.isHazard(v)),
      isDoor: !!(T_.isDoor && T_.isDoor(v)),
      isFreeform: !!(T_.isFreeform && T_.isFreeform(v)),
      isFloating: !!(T_.isFloating && T_.isFloating(v)),
      isCrenellated: !!(T_.isCrenellated && T_.isCrenellated(v)),
      isFloatingMoss: !!(T_.isFloatingMoss && T_.isFloatingMoss(v)),
      isFloatingLid: !!(T_.isFloatingLid && T_.isFloatingLid(v)),
      isFloatingBackFace: !!(T_.isFloatingBackFace && T_.isFloatingBackFace(v)),
      isWindow: !!(T_.isWindow && T_.isWindow(v)),
      isTorch: !!(T_.isTorch && T_.isTorch(v))
    };
    if (v > maxId) maxId = v;
  });
  if (missing.length) console.warn('  WARN: no META for: ' + missing.join(', '));
  var CAT_ORDER = ['floor','terrain','nature','structure','door','freeform','floating','furnish','interact','hazard','light','infra','creature','economy','meta'];
  var CAT_LABELS = {floor:'Floor',structure:'Structure',door:'Doors/Stairs',terrain:'Terrain',nature:'Nature',furnish:'Furnishing',interact:'Interactive',hazard:'Hazard',light:'Lighting',freeform:'Freeform',floating:'Floating/Roof',infra:'Infrastructure',creature:'Creature',economy:'Economy',meta:'Meta'};
  var schemaOut = path.join(__dirname, 'tile-schema.json');
  fs.writeFileSync(schemaOut, JSON.stringify({
    generated: new Date().toISOString(),
    source: 'engine/tiles.js',
    tileCount: Object.keys(tileSchema).length,
    maxId: maxId,
    catOrder: CAT_ORDER,
    catLabels: CAT_LABELS,
    tiles: tileSchema
  }, null, 2));
  console.log('  OK: ' + Object.keys(tileSchema).length + ' tiles (max id ' + maxId + ') -> tools/tile-schema.json');
}

// ─────────────────────────────────────────────────────────────────────
//  CARD + ENEMY MANIFESTS
// ─────────────────────────────────────────────────────────────────────
console.log('\nExtracting card manifest from data/cards.json...');
try {
  var rawCards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8'));
  var cards = rawCards
    .filter(function(c) { return c && c.id; })
    .map(function(c) {
      return {
        id: c.id,
        name: c.name || c.id,
        emoji: c.emoji || '',
        suit: c.suit || null,
        rarity: c.rarity || null,
        cost: c.cost || null,
        starter: !!c.starterDeck,
        description: c.description || ''
      };
    });
  var bySuit = {}; cards.forEach(function(c){ bySuit[c.suit||'_']=(bySuit[c.suit||'_']||0)+1; });
  fs.writeFileSync(path.join(__dirname, 'card-manifest.json'), JSON.stringify({
    generated: new Date().toISOString(),
    source: 'data/cards.json',
    cardCount: cards.length,
    bySuit: bySuit,
    cards: cards
  }, null, 2));
  console.log('  OK: ' + cards.length + ' cards -> tools/card-manifest.json');
} catch (e) {
  console.warn('  WARN: card manifest failed - ' + e.message);
}

console.log('\nExtracting enemy manifest from data/enemies.json...');
try {
  var rawEnemies = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));
  var enemyArr = Array.isArray(rawEnemies) ? rawEnemies : Object.keys(rawEnemies).map(function(k){
    var v = rawEnemies[k]; if (!v.id) v.id = k; return v;
  });
  var enemies = enemyArr.filter(function(e){return e && e.id;}).map(function(e) {
    return {
      id: e.id,
      name: e.name || e.id,
      emoji: e.emoji || '',
      tier: e.tier || null,
      hp: e.hp || null,
      biomes: e.biomes || [],
      family: e.family || null
    };
  });
  fs.writeFileSync(path.join(__dirname, 'enemy-manifest.json'), JSON.stringify({
    generated: new Date().toISOString(),
    source: 'data/enemies.json',
    enemyCount: enemies.length,
    enemies: enemies
  }, null, 2));
  console.log('  OK: ' + enemies.length + ' enemies -> tools/enemy-manifest.json');
} catch (e) {
  console.warn('  WARN: enemy manifest failed - ' + e.message);
}

// ─────────────────────────────────────────────────────────────────────
//  NPC MANIFEST  (DOC-110 Phase 0 Chapter 3 — SHIPPED 2026-04-16)
//
//  Cross-tool API surface (NPC_TOOLING_ROADMAP §5.4 + §7).
//  Shape:
//    { generated, source, npcCount, floorCount,
//      npcs:        [ { id, name, type, floorId, x, y, faction,
//                       role, archetype, talkable, barkPool, ... } ],
//      byFloor:     { floorId  -> [npcId, ...] },
//      byFaction:   { faction  -> [npcId, ...] },
//      byArchetype: { roleOrArchetype -> [npcId, ...] },
//      byType:      { npcType  -> [npcId, ...] },
//      byBarkPool:  { poolKey  -> [npcId, ...] },
//      orphans:     { noBarkPool: [], noDialogue: [] }    // light QA hints
//    }
//
//  Consumers: P1 NPC Designer (Used-By badges), P2 Bark Workbench
//  (orphan + cross-ref panel), P7 Population Planner / coherence CI.
// ─────────────────────────────────────────────────────────────────────
console.log('\nExtracting NPC manifest from data/npcs.json...');
try {
  var rawNpcs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/npcs.json'), 'utf8'));
  var byFloor = (rawNpcs && rawNpcs.npcsByFloor) || {};
  var npcs = [];
  var idxByFloor = {};
  var idxByFaction = {};
  var idxByArchetype = {};
  var idxByType = {};
  var idxByBarkPool = {};
  var orphanNoBark = [];
  var orphanNoDialogue = [];

  Object.keys(byFloor).sort().forEach(function(fid) {
    var list = byFloor[fid] || [];
    list.forEach(function(n) {
      if (!n || !n.id) return;
      var faction   = n.factionId || 'unaligned';
      var archetype = n.verbArchetype || n.role || 'ambient';
      var ntype     = n.type || 'ambient';
      var entry = {
        id:           n.id,
        name:         n.name || n.id,
        emoji:        n.emoji || '',
        type:         ntype,
        floorId:      n.floorId || fid,
        x:            n.x,
        y:            n.y,
        facing:       n.facing || 'south',
        faction:      faction,
        role:         n.role || null,
        archetype:    n.verbArchetype || null,
        talkable:     !!n.talkable,
        barkPool:     n.barkPool || null,
        dialogueTreeId: n.dialogueTreeId || null,
        dialoguePool: n.dialoguePool || null,
        gateCheck:    !!n.gateCheck,
        blocksMovement: !!n.blocksMovement
      };
      npcs.push(entry);

      (idxByFloor[entry.floorId]   = idxByFloor[entry.floorId]   || []).push(entry.id);
      (idxByFaction[faction]       = idxByFaction[faction]       || []).push(entry.id);
      (idxByArchetype[archetype]   = idxByArchetype[archetype]   || []).push(entry.id);
      (idxByType[ntype]            = idxByType[ntype]            || []).push(entry.id);
      if (entry.barkPool) {
        (idxByBarkPool[entry.barkPool] = idxByBarkPool[entry.barkPool] || []).push(entry.id);
      } else {
        orphanNoBark.push(entry.id);
      }
      if (entry.talkable && !entry.dialogueTreeId && !entry.dialoguePool) {
        orphanNoDialogue.push(entry.id);
      }
    });
  });

  // Stable ordering for reviewable diffs.
  npcs.sort(function(a,b){ return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  Object.keys(idxByFloor).forEach(function(k){ idxByFloor[k].sort(); });
  Object.keys(idxByFaction).forEach(function(k){ idxByFaction[k].sort(); });
  Object.keys(idxByArchetype).forEach(function(k){ idxByArchetype[k].sort(); });
  Object.keys(idxByType).forEach(function(k){ idxByType[k].sort(); });
  Object.keys(idxByBarkPool).forEach(function(k){ idxByBarkPool[k].sort(); });
  orphanNoBark.sort();
  orphanNoDialogue.sort();

  fs.writeFileSync(path.join(__dirname, 'npc-manifest.json'), JSON.stringify({
    generated: new Date().toISOString(),
    source: 'data/npcs.json',
    schema: 'tools/actor-schema.json#/definitions/npcActor (v1.1.0)',
    npcCount: npcs.length,
    floorCount: Object.keys(idxByFloor).length,
    factionCount: Object.keys(idxByFaction).length,
    archetypeCount: Object.keys(idxByArchetype).length,
    npcs: npcs,
    byFloor: idxByFloor,
    byFaction: idxByFaction,
    byArchetype: idxByArchetype,
    byType: idxByType,
    byBarkPool: idxByBarkPool,
    orphans: {
      noBarkPool:  orphanNoBark,
      noDialogue:  orphanNoDialogue
    }
  }, null, 2));
  console.log('  OK: ' + npcs.length + ' NPCs across '
    + Object.keys(idxByFloor).length + ' floor(s) -> tools/npc-manifest.json');
  if (orphanNoBark.length) {
    console.log('       (' + orphanNoBark.length + ' NPC(s) without barkPool — see manifest.orphans.noBarkPool)');
  }
  if (orphanNoDialogue.length) {
    console.log('       (' + orphanNoDialogue.length + ' talkable NPC(s) without dialogue — see manifest.orphans.noDialogue)');
  }
} catch (e) {
  console.warn('  WARN: NPC manifest failed - ' + e.message);
}
