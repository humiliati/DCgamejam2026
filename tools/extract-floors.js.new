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
        spawn: d.spawn || null,
        biome: d.biome || '',
        shops: d.shops || []
      };
      console.log('  OK: "' + id + '" -- ' + floors[id].gridW + 'x' + floors[id].gridH);
    }
  } catch(e) {
    console.warn('  FAIL "' + id + '": ' + e.message);
  }
}

var outPath = path.join(__dirname, 'floor-data.json');
fs.writeFileSync(outPath, JSON.stringify({
  generated: new Date().toISOString(),
  floorCount: Object.keys(floors).length,
  floors: floors
}, null, 2));
console.log('\nDone: ' + Object.keys(floors).length + ' floors -> tools/floor-data.json');
