/**
 * seed-phrase.js — Encode/decode a 32-bit seed as a thematic 3-word phrase.
 *
 * Layer 0 (zero-dep). Paired with engine/rng.js.
 *
 * Phrase format: "WORD1-WORD2-WORD3-HHHH"
 *   - WORD1 from LOCATIONS (24 tokens)
 *   - WORD2 from FACTIONS  (24 tokens)
 *   - WORD3 from OBJECTS   (24 tokens)
 *   - HHHH = 4-hex disambiguator (16 bits)
 *
 *   24 * 24 * 24 * 65536 = 906,362,880 addressable seeds (31-bit-ish).
 *
 * Contract:
 *   SeedPhrase.encode(seedUint32) -> "LANTERN-DRAGON-SCAR-a7c3"
 *   SeedPhrase.decode(phrase)     -> uint32 | null
 *
 * Design notes:
 *   - Word lists are FROZEN once shipped. Reordering breaks every saved seed.
 *   - All tokens are in-world vocab from Biome Plan + Street Chronicles + card corpus.
 *   - Case-insensitive on decode; canonical UPPERCASE on encode.
 *   - Invalid phrases return null; callers fall back to random + toast.
 */
var SeedPhrase = (function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════
  // Word lists — FROZEN. Never reorder. Append-only if we expand post-Jam
  // (and then only if we bump a format-version prefix in the phrase).
  // ════════════════════════════════════════════════════════════════════════

  // 24 locations — Biome Plan + floor hierarchy
  var LOCATIONS = Object.freeze([
    'APPROACH',   'PROMENADE',  'BAZAAR',     'DRIFTWOOD',
    'CELLAR',     'HOMESTEAD',  'LANTERN',    'WATCHPOST',
    'WAKE',       'HARBOR',     'BOARDWALK',  'ROOKERY',
    'CHAPEL',     'FOYER',      'GARRISON',   'SPIRE',
    'VAULT',      'CISTERN',    'CATACOMB',   'ALLEY',
    'PLAZA',      'PIER',       'BULWARK',    'SANCTUM'
  ]);

  // 24 factions / NPCs / enemy archetypes — Street Chronicles + classes
  var FACTIONS = Object.freeze([
    'DRAGON',     'HERO',       'GLEANER',    'DISPATCHER',
    'WATCHMAN',   'CUTPURSE',   'OPERATIVE',  'WARDEN',
    'ORACLE',     'SCRIBE',     'SMUGGLER',   'INNKEEP',
    'VENDOR',     'CULTIST',    'RANGER',     'BLADEBEARER',
    'SHADOW',     'SENTINEL',   'SEER',       'WILDCARD',
    'REVENANT',   'ABBOT',      'MAGISTRATE', 'HERALD'
  ]);

  // 24 objects / qualities — card + item corpus, narrative adjectives
  var OBJECTS = Object.freeze([
    'SCAR',       'EMBER',      'KEY',        'TORCH',
    'COIN',       'SABER',      'OATH',       'RELIC',
    'CIPHER',     'TOKEN',      'BRAND',      'SIGIL',
    'VERDICT',    'SHROUD',     'ECHO',       'TITHE',
    'MARK',       'FAVOR',      'DOSSIER',    'LEDGER',
    'VOW',        'SALT',       'ASH',        'DUSK'
  ]);

  var N = 24; // bits-per-word index

  // Reverse lookups (case-insensitive)
  function _buildIndex(list) {
    var idx = Object.create(null);
    for (var i = 0; i < list.length; i++) idx[list[i].toUpperCase()] = i;
    return idx;
  }
  var _locIdx = _buildIndex(LOCATIONS);
  var _facIdx = _buildIndex(FACTIONS);
  var _objIdx = _buildIndex(OBJECTS);

  // ════════════════════════════════════════════════════════════════════════
  // Encode: uint32 -> "WORD-WORD-WORD-HHHH"
  // ════════════════════════════════════════════════════════════════════════
  //
  // Bit layout (32 bits, high to low):
  //   [ loc 5 bits ][ fac 5 bits ][ obj 5 bits ][ hex 16 bits ][ pad 1 bit ]
  //
  // We only use the low 5 bits of each word index (5*3 = 15), plus 16 hex =
  // 31 bits payload. Bit 31 is dropped. In practice SeededRNG seeds are
  // already Mulberry32 uint32s; any collision-prone bit just ends up in the
  // hex disambiguator.

  function encode(seed) {
    seed = seed >>> 0; // coerce to uint32
    var loc = (seed >>> 27) & 0x1F; if (loc >= N) loc %= N;
    var fac = (seed >>> 22) & 0x1F; if (fac >= N) fac %= N;
    var obj = (seed >>> 17) & 0x1F; if (obj >= N) obj %= N;
    var hex = seed & 0xFFFF;
    var hs = ('0000' + hex.toString(16)).slice(-4);
    return LOCATIONS[loc] + '-' + FACTIONS[fac] + '-' + OBJECTS[obj] + '-' + hs;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Decode: "WORD-WORD-WORD-HHHH" -> uint32 | null
  // ════════════════════════════════════════════════════════════════════════

  function decode(phrase) {
    if (typeof phrase !== 'string') return null;
    var parts = phrase.trim().toUpperCase().split('-');
    if (parts.length !== 4) return null;
    var loc = _locIdx[parts[0]];
    var fac = _facIdx[parts[1]];
    var obj = _objIdx[parts[2]];
    if (loc == null || fac == null || obj == null) return null;
    if (!/^[0-9A-F]{4}$/.test(parts[3])) return null;
    var hex = parseInt(parts[3], 16);
    var seed = ((loc & 0x1F) << 27) |
               ((fac & 0x1F) << 22) |
               ((obj & 0x1F) << 17) |
               (hex & 0xFFFF);
    return seed >>> 0;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Utility: is this string phrase-shaped? (cheap regex for UI validation)
  // ════════════════════════════════════════════════════════════════════════
  function isPhrase(s) {
    return typeof s === 'string' &&
           /^[A-Za-z]+-[A-Za-z]+-[A-Za-z]+-[0-9A-Fa-f]{4}$/.test(s.trim());
  }

  return Object.freeze({
    encode: encode,
    decode: decode,
    isPhrase: isPhrase,
    LOCATIONS: LOCATIONS,
    FACTIONS: FACTIONS,
    OBJECTS: OBJECTS
  });
})();
