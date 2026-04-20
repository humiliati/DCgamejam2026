/**
 * BuildingRegistry — frozen data records for every named building on
 * the world map. Each record describes a building's exterior footprint,
 * interior floor ID, type (public/private/scale), business hours, and
 * default window-scene content (vignette + patron archetype).
 *
 * This is the single source of truth that WindowScenes, WindowSprites,
 * and future NPC scheduling systems query to decide what a window shows
 * and when. The registry seeds itself from a static table — no JSON
 * file or runtime registration needed for jam scope.
 *
 * See docs/LIVING_WINDOWS_ROADMAP.md §5 for the full contract.
 *
 * Layer 0 — zero dependencies (pure data, no TILES / no other modules).
 */
var BuildingRegistry = (function () {
  'use strict';

  // ── Vignette recipes ────────────────────────────────────────────
  // Sprite config for the billboard that renders behind each window's
  // glass cavity. Keyed by recipe name, referenced from building
  // records and windowScenes entries.
  // Scales trimmed 2026-04-14 (post Phase 6 EmojiMount port) — the
  // old values were tuned against WindowSprites' loose filler-proxy
  // emission and read too loud from across the map once the unified
  // billboard path made the vignette render reliably at every
  // distance. Target: a sprite that reads clearly on approach without
  // dominating the skyline silhouette. glowRadius also trimmed so the
  // halo is a vignette cue instead of a beacon.
  var VIGNETTES = {
    tavern_mug:    { emoji: '\uD83C\uDF7A', scale: 0.30, glow: '#ffaa33', glowRadius: 1.2 },  // 🍺
    bazaar_cards:  { emoji: '\uD83C\uDCCF', scale: 0.28, glow: '#ffcc55', glowRadius: 1.2 },  // 🃏
    soup_cauldron: { emoji: '\uD83C\uDF72', scale: 0.30, glow: '#ff9933', glowRadius: 1.2 },  // 🍲
    dispatch_lamp: { emoji: '\uD83C\uDFEE', scale: 0.28, glow: '#ffbb44', glowRadius: 1.6 },  // 🏮
    home_candle:   { emoji: '\uD83D\uDD6F\uFE0F', scale: 0.22, glow: '#ffdd88', glowRadius: 1.2 },  // 🕯️
    watch_lantern: { emoji: '\uD83D\uDD26', scale: 0.26, glow: '#eecc44', glowRadius: 1.2 },  // 🔦
    closed_dim:    { emoji: '\uD83D\uDD6F\uFE0F', scale: 0.14, glow: '#442200', glowRadius: 0.8 }   // 🕯️ dim
  };

  // ── Mullion materials ─────────────────────────────────────────────
  // Base RGB for the mullion cross and frame lines. Brightness and fog
  // are applied in the gap filler at render time — these are the raw
  // "unlit" colors that define the metal/wood character.
  //
  // Three tiers matching the town's social strata:
  //   bronze — warm commercial buildings (inn, bazaar, soup kitchen)
  //   iron   — institutional / government (dispatcher, watchpost)
  //   wood   — residential / rustic (home, shelter, shacks)
  var MULLION_STYLES = {
    bronze: Object.freeze({ r: 180, g: 140, b: 60  }),   // aged brass fittings
    iron:   Object.freeze({ r:  70, g:  72, b: 78  }),   // cold grey institutional
    wood:   Object.freeze({ r:  48, g:  28, b: 14  })    // dark oak (original default)
  };

  // ── Building records ────────────────────────────────────────────
  // One frozen record per named building. `footprint` is the bounding
  // rect on the parent (exterior) floor grid. `defaultVignette` keys
  // into VIGNETTES above. `wallTexture` is a TextureAtlas texture ID
  // for the freeform bands (sill + lintel) so windows inherit the
  // building's wall material. `mullionStyle` keys into MULLION_STYLES.
  // `doorTexture` is a TextureAtlas ID for DOOR tiles on this building
  // (defaults to contract's 'door_wood' when null). `archTexture` is
  // a TextureAtlas ID for ARCH_DOORWAY tiles (defaults to 'arch_brick').
  // `doorPanel` is a TextureAtlas ID for the door-face texture inside
  // DOOR_FACADE cavities (Phase 5A). Null = dark gradient fallback.
  // `windowType` selects the window tile type for this building:
  //   'shop' → WINDOW_SHOP (77) — commercial plate glass + iron bars
  //   'bay'  → WINDOW_BAY  (78) — residential protruding bay window
  //   'slit' → WINDOW_SLIT (79) — institutional fortress slit
  //   null   → WINDOW_TAVERN (73) — legacy fallback (Phase 0)
  var _records = {};

  function _register(rec) {
    _records[rec.id] = Object.freeze(rec);
  }

  // ── Promenade (Floor "1") buildings ─────────────────────────────

  _register({
    id:              'coral_bazaar',
    floorId:         '1.1',
    parentFloorId:   '1',
    type:            'public',
    kind:            'bazaar',
    footprint:       { x: 7, y: 5, w: 6, h: 4 },
    wallTexture:     'brick_red',       // coral brick facade
    mullionStyle:    'bronze',          // warm brass fittings on a merchant building
    doorTexture:     'door_redbrick',   // coral brick door surround
    doorPanel:       'door_panel_glass', // frosted glass shop front
    archTexture:     'arch_redbrick',   // coral brick arch doorway
    windowType:      'shop',            // plate glass storefront + iron bars
    defaultHours:    { openAt: 6, closeAt: 22 },
    defaultVignette: 'bazaar_cards',
    defaultPatron:   'bazaar_merchant',
    closedVignette:  'closed_dim'
  });

  _register({
    id:              'driftwood_inn',
    floorId:         '1.2',
    parentFloorId:   '1',
    type:            'public',
    kind:            'tavern',
    footprint:       { x: 19, y: 5, w: 6, h: 4 },
    wallTexture:     'wood_plank',      // driftwood timber frame
    mullionStyle:    'bronze',          // warm brass — upscale tavern
    doorTexture:     'door_driftwood',  // weathered timber door surround
    doorPanel:       'door_panel_oiled', // dark oiled wood + gold knobs — value contrast vs pale driftwood (Phase B)
    archTexture:     'arch_driftwood',  // driftwood arch doorway
    windowType:      'shop',            // plate glass storefront + iron bars
    defaultHours:    { openAt: 6, closeAt: 24 },
    defaultVignette: 'tavern_mug',
    defaultPatron:   'tavern_patron',
    closedVignette:  null
  });

  _register({
    id:              'storm_shelter',
    floorId:         '1.3',
    parentFloorId:   '1',
    type:            'public',
    kind:            'cellar_entry',
    footprint:       { x: 7, y: 25, w: 6, h: 5 },
    wallTexture:     'stone_rough',     // civil defense bunker masonry
    mullionStyle:    'iron',            // institutional grey fittings
    doorTexture:     'door_greystone',  // fortified stone door surround
    doorPanel:       'door_panel_studded', // heavy studded door
    archTexture:     'arch_stone',      // rough stone arch (shared)
    windowType:      'slit',            // fortress slit — civil defense bunker
    defaultHours:    { openAt: 0, closeAt: 24 },
    defaultVignette: null,
    defaultPatron:   null,
    closedVignette:  null
  });

  _register({
    id:              'gleaners_home',
    floorId:         '1.6',
    parentFloorId:   '1',
    type:            'private',
    kind:            'home',
    footprint:       { x: 19, y: 25, w: 6, h: 5 },
    wallTexture:     'wood_dark',       // worn plank residential
    mullionStyle:    'wood',            // plain dark oak — modest dwelling
    doorTexture:     'door_darkwood',   // dark oak door surround
    doorPanel:       'door_panel_charcoal', // near-black charred wood + gold knob — max contrast vs dark wall (Phase B)
    archTexture:     'arch_darkwood',   // dark oak arch doorway
    windowType:      'bay',             // protruding bay window — cozy residential
    defaultHours:    { openAt: 20, closeAt: 8 },   // private = resident home at night
    defaultVignette: 'home_candle',
    defaultPatron:   null,
    closedVignette:  null
  });

  // ── Lantern Row (Floor "2") buildings ───────────────────────────
  // No hand-authored windows yet — procedural floor. Records exist
  // so the registry covers the full building list and future window
  // scenes can reference them without code changes.

  _register({
    id:              'dispatchers_office',
    floorId:         '2.1',
    parentFloorId:   '2',
    type:            'public',
    kind:            'office',
    footprint:       null,    // procedural — no fixed footprint yet
    wallTexture:     'concrete',        // government-issue concrete
    mullionStyle:    'iron',            // institutional cold metal
    doorTexture:     'door_concrete',   // poured concrete door surround
    doorPanel:       'door_panel_iron', // institutional iron plate door
    archTexture:     'arch_concrete',   // concrete arch doorway
    windowType:      'slit',            // fortress slit — government building
    defaultHours:    { openAt: 8, closeAt: 20 },
    defaultVignette: 'dispatch_lamp',
    defaultPatron:   'dispatch_clerk',
    closedVignette:  'closed_dim'
  });

  _register({
    id:              'watchmans_post',
    floorId:         '2.2',
    parentFloorId:   '2',
    type:            'public',
    kind:            'watchpost',
    footprint:       null,
    wallTexture:     'stone_rough',     // fortified stone
    mullionStyle:    'iron',            // reinforced grey bars
    doorTexture:     'door_greystone',  // fortified stone door surround
    doorPanel:       'door_panel_studded', // heavy studded door
    archTexture:     'arch_stone',      // rough stone arch (shared)
    windowType:      'slit',            // fortress slit — fortified guard post
    defaultHours:    { openAt: 0, closeAt: 24 },
    defaultVignette: 'watch_lantern',
    defaultPatron:   'watchman',
    closedVignette:  null
  });

  // ── Queries ─────────────────────────────────────────────────────

  /**
   * Fetch a building record by id.
   * @param {string} id
   * @returns {Object|null}
   */
  function get(id) {
    return _records[id] || null;
  }

  /**
   * All buildings whose exterior footprint lives on `parentFloorId`.
   * @param {string} parentFloorId
   * @returns {Array}
   */
  function listByFloor(parentFloorId) {
    var result = [];
    for (var k in _records) {
      if (_records[k].parentFloorId === parentFloorId) {
        result.push(_records[k]);
      }
    }
    return result;
  }

  /**
   * Resolve a vignette recipe by name.
   * @param {string} name — key into VIGNETTES
   * @returns {Object|null} { emoji, scale, glow, glowRadius }
   */
  function getVignette(name) {
    return VIGNETTES[name] || null;
  }

  /**
   * Resolve a mullion material by style name.
   * @param {string} name — key into MULLION_STYLES ('bronze'|'iron'|'wood')
   * @returns {Object} { r, g, b } — base RGB, never null (falls back to wood)
   */
  function getMullionStyle(name) {
    return MULLION_STYLES[name] || MULLION_STYLES.wood;
  }

  /**
   * Simple open/closed check for a building at a given hour.
   * Handles wrap-around hours (e.g. openAt:20, closeAt:8 means
   * open from 8pm to 8am — private/night buildings).
   *
   * @param {string} id
   * @param {number} hourOfDay — 0–23
   * @param {Object} [flags] — { curfew: bool, heroDay: bool }
   * @returns {boolean}
   */
  function isOpen(id, hourOfDay, flags) {
    var rec = _records[id];
    if (!rec) return false;

    // Global overrides
    if (flags) {
      if (flags.curfew && rec.type === 'public') return false;
      if (flags.heroDay && rec.type === 'public') return false;
    }

    var h = rec.defaultHours;
    if (!h) return true;

    // Normal range (openAt < closeAt): open during the day window
    if (h.openAt < h.closeAt) {
      return hourOfDay >= h.openAt && hourOfDay < h.closeAt;
    }
    // Wrap-around range (openAt > closeAt): open overnight
    // e.g. openAt:20, closeAt:8 → open 8pm–8am
    return hourOfDay >= h.openAt || hourOfDay < h.closeAt;
  }

  // ── Public API ──────────────────────────────────────────────────

  return Object.freeze({
    get:             get,
    listByFloor:     listByFloor,
    getVignette:     getVignette,
    getMullionStyle: getMullionStyle,
    isOpen:          isOpen
  });
})();
