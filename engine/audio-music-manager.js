/**
 * AudioMusicManager — BGM state machine for Dungeon Gleaner.
 *
 * Manages which music track plays based on game context:
 *   - Title screen → overworld: Mood Bober persists clean through
 *     deployment to Floor 0, Floor 1
 *   - Floor 2 (Lantern Row): tavern-jam
 *   - Floor 3 (Garrison): empire
 *   - Building interiors (floorN.N): parent track continues, muffled +
 *     volume-ducked via lowpass filter (spatial contract)
 *   - Deep dungeons (floorN.N.N): dungeon-specific music
 *   - Cinematic focus: slight volume duck
 *   - Combat: fight music
 *
 * Depends on: AudioSystem (Layer 0), FloorManager (Layer 1)
 * Layer: 2 (called by title-screen, floor-transition, cinematic-camera)
 */
var AudioMusicManager = (function () {
  'use strict';

  // ── Track mapping ────────────────────────────────────────────────
  // Key = floor ID prefix, value = manifest music key.
  // Lookup walks from most-specific to least-specific.

  var FLOOR_MUSIC = {
    // ── Overworld exteriors ──
    'title':  'music-mood-bober',      // Title screen
    '0':      'music-mood-bober',      // Tutorial / Floor 0
    '1':      'music-mood-bober',      // The Promenade
    '2':      'music-tavern-jam',      // Lantern Row (boardwalk energy)
    '3':      'music-empire',          // The Garrison (frontier military)

    // ── Dungeon depths (floorN.N.N) — override parent ──
    // Add specific dungeon tracks here as they're assigned:
    // '1.2.1': 'music-dungeon-guest',

    // ── Default dungeon fallback ──
    '_dungeon': 'music-dungeon-guest',

    // ── Combat ──
    '_combat':  'music-fightwave'
  };

  // ── Interior muffle settings ─────────────────────────────────────
  var INTERIOR_MUFFLE_FREQ = 800;    // Lowpass cutoff Hz for building interiors
  var INTERIOR_BGM_VOLUME  = 0.35;   // BGM volume inside buildings
  var CINEMATIC_BGM_VOLUME = 0.35;   // BGM volume during cinematic focus
  var NORMAL_BGM_VOLUME    = 0.6;    // Default BGM volume (matches AudioSystem default)

  // ── State ────────────────────────────────────────────────────────
  var _currentContext = null;  // 'title', floor ID, or '_combat'
  var _inCombat       = false;
  var _preCombatCtx   = null;  // Saved context to restore after combat
  var _initialized    = false;

  // ── Helpers ──────────────────────────────────────────────────────

  /**
   * Get the depth of a floor ID (number of dot-separated segments).
   * '1' = 1, '1.2' = 2, '1.2.3' = 3
   */
  function _getDepth(floorId) {
    if (!floorId) return 0;
    return floorId.split('.').length;
  }

  /**
   * Get the parent floor ID. '1.2.3' → '1.2', '1.2' → '1', '1' → null
   */
  function _getParent(floorId) {
    if (!floorId) return null;
    var parts = floorId.split('.');
    if (parts.length <= 1) return null;
    parts.pop();
    return parts.join('.');
  }

  /**
   * Get the root exterior floor. '1.2.3' → '1', '2.4' → '2'
   */
  function _getRoot(floorId) {
    if (!floorId) return null;
    return floorId.split('.')[0];
  }

  /**
   * Resolve which music track should play for a given floor ID.
   * Checks specific floor first, then parent, then root, then dungeon fallback.
   */
  function _resolveTrack(floorId) {
    if (!floorId) return null;

    // Direct match (most specific)
    if (FLOOR_MUSIC[floorId]) return FLOOR_MUSIC[floorId];

    // Depth-3+: check dungeon-specific, then fallback
    var depth = _getDepth(floorId);
    if (depth >= 3) {
      // Check parent building
      var parent = _getParent(floorId);
      if (parent && FLOOR_MUSIC[parent]) return null;  // Will use dungeon fallback
      return FLOOR_MUSIC['_dungeon'];
    }

    // Depth-2 (building interior): use parent floor's track (muffled)
    if (depth === 2) {
      var root = _getRoot(floorId);
      if (FLOOR_MUSIC[root]) return FLOOR_MUSIC[root];
    }

    return null;
  }

  /**
   * Determine if the current floor is a building interior (depth 2).
   */
  function _isInterior(floorId) {
    return _getDepth(floorId) === 2;
  }

  /**
   * Determine if the current floor is a deep dungeon (depth 3+).
   */
  function _isDungeon(floorId) {
    return _getDepth(floorId) >= 3;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Initialize. Call once after AudioSystem.init().
   */
  function init() {
    _initialized = true;
    console.log('[MusicManager] Initialized. ' +
      Object.keys(FLOOR_MUSIC).length + ' floor-to-track mappings.');
  }

  /**
   * Start title screen music. Called by title-screen.js on first render.
   */
  function startTitle() {
    _currentContext = 'title';
    _inCombat = false;
    var track = FLOOR_MUSIC['title'];
    if (track) {
      AudioSystem.setMuffle(false);
      AudioSystem.setMusicVolume(NORMAL_BGM_VOLUME);
      AudioSystem.playMusic(track);
    }
  }

  /**
   * Notify that the player has transitioned to a new floor.
   * Handles music continuity, muffle, and dungeon switches.
   *
   * @param {string} floorId - Target floor ID (e.g. '1', '1.2', '1.2.3')
   */
  function onFloorChange(floorId) {
    if (_inCombat) {
      // Save for post-combat restore
      _preCombatCtx = floorId;
      return;
    }

    _currentContext = floorId;
    var depth = _getDepth(floorId);
    var track = _resolveTrack(floorId);

    // Depth 3+ → dungeon: hard switch to dungeon music, clear muffle
    if (depth >= 3) {
      var dungeonTrack = track || FLOOR_MUSIC['_dungeon'];
      AudioSystem.setMuffle(false);
      AudioSystem.setMusicVolume(NORMAL_BGM_VOLUME);
      if (dungeonTrack) AudioSystem.playMusic(dungeonTrack);
      return;
    }

    // Depth 2 → building interior: keep parent track, muffle + duck
    if (depth === 2) {
      var parentTrack = FLOOR_MUSIC[_getRoot(floorId)];
      if (parentTrack) {
        // If a different track is playing, crossfade to parent's track
        var currentTrack = AudioSystem.getCurrentMusic();
        if (currentTrack !== parentTrack) {
          AudioSystem.playMusic(parentTrack);
        }
      }
      AudioSystem.setMuffle(true, INTERIOR_MUFFLE_FREQ);
      AudioSystem.setMusicVolume(INTERIOR_BGM_VOLUME);
      return;
    }

    // Depth 1 → exterior: clear muffle, restore volume, play track
    AudioSystem.setMuffle(false);
    AudioSystem.setMusicVolume(NORMAL_BGM_VOLUME);
    if (track) {
      var current = AudioSystem.getCurrentMusic();
      if (current !== track) {
        AudioSystem.playMusic(track);
      }
    }
  }

  /**
   * Notify cinematic camera opened — duck music slightly.
   */
  function onCinematicOpen() {
    AudioSystem.duckMusic(CINEMATIC_BGM_VOLUME);
  }

  /**
   * Notify cinematic camera closed — restore music volume.
   */
  function onCinematicClose() {
    AudioSystem.unduckMusic();
  }

  /**
   * Notify combat started — switch to combat music.
   */
  function onCombatStart() {
    if (_inCombat) return;
    _inCombat = true;
    _preCombatCtx = _currentContext;
    var combatTrack = FLOOR_MUSIC['_combat'];
    if (combatTrack) {
      AudioSystem.setMuffle(false);
      AudioSystem.playMusic(combatTrack);
    }
  }

  /**
   * Notify combat ended — restore previous floor's music.
   */
  function onCombatEnd() {
    if (!_inCombat) return;
    _inCombat = false;
    if (_preCombatCtx) {
      onFloorChange(_preCombatCtx);
      _preCombatCtx = null;
    }
  }

  /**
   * Get the current context for debugging.
   */
  function getContext() {
    return {
      context: _currentContext,
      inCombat: _inCombat,
      depth: _getDepth(_currentContext)
    };
  }

  /**
   * Update the track mapping at runtime (e.g., assign a specific dungeon track).
   * @param {string} floorId - Floor ID key
   * @param {string} trackKey - Manifest music key
   */
  function setFloorTrack(floorId, trackKey) {
    FLOOR_MUSIC[floorId] = trackKey;
  }

  return {
    init:              init,
    startTitle:        startTitle,
    onFloorChange:     onFloorChange,
    onCinematicOpen:   onCinematicOpen,
    onCinematicClose:  onCinematicClose,
    onCombatStart:     onCombatStart,
    onCombatEnd:       onCombatEnd,
    getContext:        getContext,
    setFloorTrack:     setFloorTrack
  };
})();
