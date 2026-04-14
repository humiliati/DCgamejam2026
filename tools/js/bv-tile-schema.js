// ═══════════════════════════════════════════════════════════════
//  bv-tile-schema.js — Tile schema for Blockout Visualizer
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Exposes globals:
//    TILE_SCHEMA  — map of tileId → {name,color,cat,walk,opq,glyph}
//    CAT_ORDER    — category display order
//    CAT_LABELS   — category id → human label
//
//  NOTE: These are intentionally mutable `var` globals (not frozen).
//  loadTileSchema() in bv-floor-data.js reassigns TILE_SCHEMA/CAT_ORDER/
//  CAT_LABELS after fetching tile-schema.json. All downstream modules
//  read bare names (e.g. TILE_SCHEMA[id]) so we preserve that shape.
// ═══════════════════════════════════════════════════════════════
'use strict';

var TILE_SCHEMA = {
  0:  { name: 'EMPTY',           color: '#1a1a1a', cat: 'floor',     walk: true,  opq: false, glyph: '.' },
  1:  { name: 'WALL',            color: '#6b5b4f', cat: 'structure', walk: false, opq: true,  glyph: '#' },
  2:  { name: 'DOOR',            color: '#d4a44a', cat: 'door',      walk: true,  opq: false, glyph: 'D' },
  3:  { name: 'DOOR_BACK',       color: '#b8863a', cat: 'door',      walk: true,  opq: false, glyph: 'B' },
  4:  { name: 'DOOR_EXIT',       color: '#c97a30', cat: 'door',      walk: true,  opq: false, glyph: 'X' },
  5:  { name: 'STAIRS_DN',       color: '#5577cc', cat: 'door',      walk: true,  opq: false, glyph: 'v' },
  6:  { name: 'STAIRS_UP',       color: '#77aaee', cat: 'door',      walk: true,  opq: false, glyph: '^' },
  7:  { name: 'CHEST',           color: '#cc9933', cat: 'interact',  walk: false, opq: true,  glyph: 'C' },
  8:  { name: 'TRAP',            color: '#cc3333', cat: 'hazard',    walk: true,  opq: false, glyph: 'T' },
  9:  { name: 'WATER',           color: '#2255aa', cat: 'terrain',   walk: true,  opq: false, glyph: '~' },
  10: { name: 'PILLAR',          color: '#888888', cat: 'structure', walk: false, opq: true,  glyph: 'O' },
  11: { name: 'BREAKABLE',       color: '#8b6b3a', cat: 'structure', walk: false, opq: true,  glyph: '%' },
  12: { name: 'SHOP',            color: '#44bb88', cat: 'interact',  walk: true,  opq: false, glyph: '$' },
  13: { name: 'SPAWN',           color: '#ff44ff', cat: 'meta',      walk: true,  opq: false, glyph: 'S' },
  14: { name: 'BOSS_DOOR',       color: '#ff2222', cat: 'door',      walk: true,  opq: false, glyph: '!' },
  15: { name: 'FIRE',            color: '#ff6622', cat: 'hazard',    walk: true,  opq: false, glyph: 'f' },
  16: { name: 'SPIKES',          color: '#cc4444', cat: 'hazard',    walk: true,  opq: false, glyph: 's' },
  17: { name: 'POISON',          color: '#44cc44', cat: 'hazard',    walk: true,  opq: false, glyph: 'p' },
  18: { name: 'BONFIRE',         color: '#ff8800', cat: 'interact',  walk: true,  opq: true,  glyph: '*' },
  19: { name: 'CORPSE',          color: '#775544', cat: 'interact',  walk: true,  opq: false, glyph: 'c' },
  20: { name: 'COLLECTIBLE',     color: '#ffdd44', cat: 'interact',  walk: true,  opq: false, glyph: 'o' },
  21: { name: 'TREE',            color: '#2d6b2d', cat: 'nature',    walk: false, opq: true,  glyph: 'Y' },
  22: { name: 'SHRUB',           color: '#4a8a3a', cat: 'nature',    walk: false, opq: true,  glyph: 'h' },
  23: { name: 'PUZZLE',          color: '#aa66cc', cat: 'interact',  walk: true,  opq: false, glyph: '?' },
  24: { name: 'LOCKED_DOOR',     color: '#aa2222', cat: 'door',      walk: false, opq: true,  glyph: 'L' },
  25: { name: 'BOOKSHELF',       color: '#7a5533', cat: 'furnish',   walk: false, opq: true,  glyph: 'b' },
  26: { name: 'BAR_COUNTER',     color: '#5a4a3a', cat: 'furnish',   walk: false, opq: true,  glyph: '=' },
  27: { name: 'BED',             color: '#6a4a6a', cat: 'furnish',   walk: false, opq: true,  glyph: 'B' },
  28: { name: 'TABLE',           color: '#7a6a4a', cat: 'furnish',   walk: false, opq: true,  glyph: 't' },
  29: { name: 'HEARTH',          color: '#cc5500', cat: 'freeform',  walk: false, opq: true,  glyph: 'H' },
  30: { name: 'TORCH_LIT',       color: '#ffaa22', cat: 'light',     walk: false, opq: true,  glyph: 'i' },
  31: { name: 'TORCH_UNLIT',     color: '#555533', cat: 'light',     walk: false, opq: true,  glyph: 'j' },
  32: { name: 'ROAD',            color: '#7a7a6a', cat: 'terrain',   walk: true,  opq: false, glyph: '=' },
  33: { name: 'PATH',            color: '#9a8a6a', cat: 'terrain',   walk: true,  opq: false, glyph: ':' },
  34: { name: 'GRASS',           color: '#3a7a3a', cat: 'terrain',   walk: true,  opq: false, glyph: ',' },
  35: { name: 'FENCE',           color: '#8a7a5a', cat: 'structure', walk: false, opq: true,  glyph: '|' },
  36: { name: 'TERMINAL',        color: '#33aa55', cat: 'interact',  walk: false, opq: true,  glyph: '>' },
  37: { name: 'MAILBOX',         color: '#5577bb', cat: 'interact',  walk: false, opq: true,  glyph: 'M' },
  38: { name: 'DUMP_TRUCK',      color: '#667788', cat: 'freeform',  walk: false, opq: true,  glyph: 'K' },
  39: { name: 'DETRITUS',        color: '#6a5a4a', cat: 'terrain',   walk: true,  opq: false, glyph: '~' },
  40: { name: 'WELL',            color: '#4466aa', cat: 'infra',     walk: false, opq: true,  glyph: 'W' },
  41: { name: 'BENCH',           color: '#7a6a4a', cat: 'infra',     walk: false, opq: true,  glyph: '_' },
  42: { name: 'NOTICE_BOARD',    color: '#aa8844', cat: 'infra',     walk: false, opq: true,  glyph: 'N' },
  43: { name: 'ANVIL',           color: '#555566', cat: 'infra',     walk: false, opq: true,  glyph: 'A' },
  44: { name: 'BARREL',          color: '#7a5533', cat: 'infra',     walk: false, opq: true,  glyph: 'Q' },
  45: { name: 'CHARGING_CRADLE', color: '#5588aa', cat: 'infra',     walk: false, opq: true,  glyph: 'Z' },
  46: { name: 'SWITCHBOARD',     color: '#887744', cat: 'infra',     walk: false, opq: true,  glyph: '~' },
  47: { name: 'SOUP_KITCHEN',    color: '#aa6633', cat: 'infra',     walk: false, opq: true,  glyph: 'U' },
  48: { name: 'COT',             color: '#6a5a5a', cat: 'infra',     walk: false, opq: true,  glyph: '-' },
  49: { name: 'ROOST',           color: '#5a4a3a', cat: 'creature',  walk: true,  opq: false, glyph: 'r' },
  50: { name: 'NEST',            color: '#6a5a3a', cat: 'creature',  walk: false, opq: true,  glyph: 'n' },
  51: { name: 'DEN',             color: '#5a4a4a', cat: 'creature',  walk: false, opq: true,  glyph: 'd' },
  52: { name: 'FUNGAL_PATCH',    color: '#44aa77', cat: 'creature',  walk: true,  opq: false, glyph: 'g' },
  53: { name: 'ENERGY_CONDUIT',  color: '#66aacc', cat: 'creature',  walk: false, opq: true,  glyph: 'E' },
  54: { name: 'TERRITORIAL_MARK',color: '#aa5533', cat: 'creature',  walk: true,  opq: false, glyph: 'x' },
  55: { name: 'STRETCHER_DOCK',  color: '#887766', cat: 'economy',   walk: false, opq: true,  glyph: '+' },
  56: { name: 'TRIAGE_BED',      color: '#778877', cat: 'economy',   walk: false, opq: true,  glyph: '+' },
  57: { name: 'MORGUE_TABLE',    color: '#667766', cat: 'economy',   walk: false, opq: true,  glyph: '+' },
  58: { name: 'INCINERATOR',     color: '#884422', cat: 'economy',   walk: false, opq: true,  glyph: 'I' },
  59: { name: 'REFRIG_LOCKER',   color: '#668899', cat: 'economy',   walk: false, opq: true,  glyph: 'R' },
  60: { name: 'ROOF_EAVE_L',     color: '#8b4513', cat: 'floating',  walk: true,  opq: true,  glyph: '/' },
  61: { name: 'ROOF_SLOPE_L',    color: '#9b5523', cat: 'floating',  walk: true,  opq: true,  glyph: '/' },
  62: { name: 'ROOF_PEAK',       color: '#ab6533', cat: 'floating',  walk: true,  opq: true,  glyph: '^' },
  63: { name: 'ROOF_SLOPE_R',    color: '#9b5523', cat: 'floating',  walk: true,  opq: true,  glyph: '\\' },
  64: { name: 'ROOF_EAVE_R',     color: '#8b4513', cat: 'floating',  walk: true,  opq: true,  glyph: '\\' },
  65: { name: 'CANOPY',          color: '#1a5a1a', cat: 'floating',  walk: true,  opq: true,  glyph: '@' },
  66: { name: 'CANOPY_MOSS',     color: '#2a6a1a', cat: 'floating',  walk: true,  opq: true,  glyph: '@' },
  67: { name: 'ROOF_CRENEL',     color: '#7a6a5a', cat: 'floating',  walk: true,  opq: true,  glyph: 'W' },
  68: { name: 'PERGOLA',         color: '#6a5a3a', cat: 'floating',  walk: true,  opq: true,  glyph: '=' },
  69: { name: 'CITY_BONFIRE',    color: '#ee7711', cat: 'freeform',  walk: false, opq: true,  glyph: '*' },
  70: { name: 'PERGOLA_BEAM',    color: '#8a7a4a', cat: 'freeform',  walk: true,  opq: true,  glyph: '-' },
  71: { name: 'ARCH_DOORWAY',    color: '#d4a44a', cat: 'freeform',  walk: true,  opq: true,  glyph: 'A' },
  72: { name: 'PORTHOLE',        color: '#aaaacc', cat: 'freeform',  walk: true,  opq: true,  glyph: 'O' },
  73: { name: 'WINDOW_TAVERN',   color: '#5599bb', cat: 'freeform',  walk: false, opq: true,  glyph: 'W' },
  74: { name: 'DOOR_FACADE',     color: '#bb8833', cat: 'freeform',  walk: true,  opq: true,  glyph: 'F' },
  75: { name: 'TRAPDOOR_DN',     color: '#5566aa', cat: 'freeform',  walk: true,  opq: true,  glyph: 'v' },
  76: { name: 'TRAPDOOR_UP',     color: '#7788cc', cat: 'freeform',  walk: true,  opq: true,  glyph: '^' }
};

var CAT_ORDER = ['floor','terrain','nature','structure','door','freeform','floating','furnish','interact','hazard','light','infra','creature','economy','meta'];
var CAT_LABELS = {
  floor:'Floor', structure:'Structure', door:'Doors/Stairs', terrain:'Terrain',
  nature:'Nature', furnish:'Furnishing', interact:'Interactive', hazard:'Hazard',
  light:'Lighting', freeform:'Freeform', floating:'Floating/Roof', infra:'Infrastructure',
  creature:'Creature', economy:'Economy', meta:'Meta'
};
