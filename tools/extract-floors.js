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
  // Engine module stubs — only need to exist as globals so IIFE evals don't crash
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
        // Pass 5b.2: proc-gen slot manifest. Declared in the parent
        // blockout file. Shape: [{ id, kind, label, doorCoord,
        // biomeHint?, maxDepth? }]. Kinds: 'template' | 'composed' |
        // 'random'. The world-designer renders these as ghost nodes;
        // FloorManager + GridGen consume them at runtime to drive the
        // proc-gen descent pipeline.
        procGenChildren: Array.isArray(d.procGenChildren) ? d.procGenChildren.slice() : [],
        spawn: d.spawn || null,
        biome: d.biome || '',
        shops: d.shops || [],
        // Pass 5a: entities round-trip. Builders don't yet emit
        // entities — preserve any that floor-data.json already
        // carries (CLI-created or placed via bv-bo-floor) so that
        // re-running extract doesn't wipe them. Merged downstream.
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
// Engine builders don't emit `entities[]` yet — they are populated
// purely by CLI place-entity / bv-bo-floor.placeEntity. If we just
// overwrote floor-data.json every extract would wipe that state.
// Preserve the previous entities array (and any CLI-only floors
// that don't exist in the engine yet).
try {
  if (fs.existsSync(outPath)) {
    var prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    var prevFloors = (prev && prev.floors) || {};
    Object.keys(prevFloors).forEach(function(id) {
      var p = prevFloors[id];
      if (!floors[id]) {
        // CLI-only floor (no engine builder) — carry forward whole.
        floors[id] = p;
        console.log('  KEEP (CLI-only): "' + id + '"');
        return;
      }
      // Engine-extracted — merge entities only (grid wins from engine).
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

var _floorPayload = JSON.stringify({
  generated: new Date().toISOString(),
  floorCount: Object.keys(floors).length,
  floors: floors
}, null, 2);
fs.writeFileSync(outPath, _floorPayload);
console.log('\nDone: ' + Object.keys(floors).length + ' floors -> tools/floor-data.json');

// Sidecar .js wrapper — lets world-designer.html load floor data when opened
// as file:// (Chromium blocks fetch() against file:// origins with CORS).
var _jsPath = path.join(__dirname, 'floor-data.js');
fs.writeFileSync(_jsPath,
  '// AUTO-GENERATED by tools/extract-floors.js — do not edit by hand.\n' +
  '// Sidecar wrapper so world-designer.html works under file:// (bypasses\n' +
  '// Chromium CORS fetch block). Keep in sync with floor-data.json.\n' +
  'window.FLOOR_DATA = ' + _floorPayload + ';\n');
console.log('Done: floor-data.js sidecar -> tools/floor-data.js');

// ─────────────────────────────────────────────────────────────────────
//  TILE SCHEMA EXTRACTION (Phase 3)
//  Introspects TILES global — pulls constants + predicate flags live from
//  engine/tiles.js so the visualizer never drifts behind new tile IDs.
//  Color/glyph/category metadata lives here (editor-only concern).
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
    WINDOW_MURDERHOLE:{color:'#334455',glyph:'m',cat:'freeform'}
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
//  CARD + ENEMY + STRING MANIFESTS (Phase 3b)
//  Lean sidecar indexes for entity palette + display-name resolution.
//  These stay in separate files (lazy-load friendly); floor-data.json
//  remains the hot path the visualizer loads on every boot.
// ─────────────────────────────────────────────────────────────────────
console.log('\nExtracting card manifest from data/cards.json...');
try {
  var rawCards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8'));
  var cards = rawCards
    .filter(function(c) { return c && c.id; })   // drop section-comment entries
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
  // enemies.json may be array or object keyed by id — normalize
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
