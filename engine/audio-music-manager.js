/**
 * AudioMusicManager — BGM state machine for Dungeon Gleaner.
 *
 * Single source of truth for music state is now the SpatialContract's
 * `audio` block on each floor. This module is a thin applicator:
 *
 *   onFloorChange(id) → ask FloorManager for the target contract →
 *   read contract.audio → apply musicId / muffleHz / bgmVolume.
 *
 * Special sentinels the music manager understands:
 *   musicId === '__inherit_parent__'  — walk up the floor-id chain to
 *       the first ancestor contract whose audio.musicId is a concrete
 *       track. Used by interior contracts so buildings default to
 *       "keep parent exterior's track, muffled + ducked".
 *   musicId === null                  — leave whatever is playing alone
 *       (useful for no-op exterior transitions where the parent root
 *       has already started the track).
 *
 * Non-floor contexts (title screen, combat) still live here since they
 * are not tied to a spatial contract.
 *
 * Depends on: AudioSystem (Layer 0), FloorManager (Layer 1), SpatialContract
 * Layer: 2 (called by title-screen, floor-transition, cinematic-camera)
 */
var AudioMusicManager = (function () {
  'use strict';

  // ── Non-floor tracks (title + combat) ────────────────────────────
  // Floor-bound tracks live in the SpatialContract audio block.
  var TITLE_TRACK     = 'music-mood-bober';
  var TITLE_FADE_IN_MS = 3000;   // Gradual fade-in on the title screen
  var COMBAT_TRACK    = 'music-fightwave';

  // Cinematic duck is global, not contract-bound.
  var CINEMATIC_BGM_VOLUME = 0.35;

  // Fallback applied if a floor has no contract (e.g. uninitialized
  // bootstrap or a test harness).
  var FALLBACK_VOLUME = 0.6;

  // ── State ────────────────────────────────────────────────────────
  var _currentContext = null;  // 'title', floor ID, or '_combat'
  var _inCombat       = false;
  var _preCombatCtx   = null;  // Saved context to restore after combat
  var _initialized    = false;

  // ── Helpers ──────────────────────────────────────────────────────

  function _parentId(floorId) {
    if (!floorId) return null;
    var parts = String(floorId).split('.');
    if (parts.length <= 1) return null;
    parts.pop();
    return parts.join('.');
  }

  /**
   * Resolve a floor's audio block. Never returns null.
   */
  function _audioFor(floorId) {
    if (!floorId || typeof FloorManager === 'undefined' ||
        typeof SpatialContract === 'undefined') {
      return { musicId: null, muffleHz: null, bgmVolume: FALLBACK_VOLUME, ambientBed: null };
    }
    try {
      var contract = FloorManager.getFloorContract(floorId);
      return SpatialContract.getAudio(contract);
    } catch (e) {
      return { musicId: null, muffleHz: null, bgmVolume: FALLBACK_VOLUME, ambientBed: null };
    }
  }

  /**
   * Walk up the floor-id chain until we find an ancestor whose audio
   * block has a concrete (non-sentinel) musicId. Returns that musicId
   * or null if the chain is exhausted without one.
   */
  function _resolveInheritedTrack(floorId) {
    var cursor = _parentId(floorId);
    var guard  = 8;   // depth safety
    while (cursor && guard-- > 0) {
      var audio = _audioFor(cursor);
      if (audio.musicId && audio.musicId !== '__inherit_parent__') {
        return audio.musicId;
      }
      cursor = _parentId(cursor);
    }
    return null;
  }

  /**
   * Resolve the concrete track a floor should play. Handles the
   * '__inherit_parent__' sentinel by walking the chain.
   */
  function _resolveTrack(floorId) {
    var audio = _audioFor(floorId);
    if (audio.musicId === '__inherit_parent__') {
      return _resolveInheritedTrack(floorId);
    }
    return audio.musicId || null;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Initialize. Call once after AudioSystem.init().
   */
  function init() {
    _initialized = true;
    console.log('[MusicManager] Initialized. Contract-driven audio.');
  }

  /**
   * Start title screen music. Called by title-screen.js on first render.
   */
  function startTitle() {
    _currentContext = 'title';
    _inCombat = false;
    AudioSystem.setMuffle(false);
    AudioSystem.setMusicVolume(FALLBACK_VOLUME);
    // Cold-start from silence with a gradual fade so the title screen
    // breathes in rather than slamming to full volume.
    if (TITLE_TRACK) AudioSystem.playMusic(TITLE_TRACK, TITLE_FADE_IN_MS);
  }

  /**
   * Notify that the player has transitioned to a new floor.
   * Reads the target floor's spatial-contract audio block and applies
   * musicId / muffleHz / bgmVolume.
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
    var audio = _audioFor(floorId);
    var track = _resolveTrack(floorId);

    // ── Muffle ──
    if (audio.muffleHz) {
      AudioSystem.setMuffle(true, audio.muffleHz);
    } else {
      AudioSystem.setMuffle(false);
    }

    // ── Volume ──
    var vol = (typeof audio.bgmVolume === 'number') ? audio.bgmVolume : FALLBACK_VOLUME;
    AudioSystem.setMusicVolume(vol);

    // ── Track ──
    // Only crossfade if the target is concrete AND different from what's
    // currently playing. A null track (or a chain that resolved to null)
    // means "keep whatever is playing" — this is the correct behavior for
    // interior → parent transitions where the music should continue.
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
    if (COMBAT_TRACK) {
      AudioSystem.setMuffle(false);
      AudioSystem.playMusic(COMBAT_TRACK);
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
      resolvedTrack: _currentContext ? _resolveTrack(_currentContext) : null
    };
  }

  /**
   * Runtime override for a specific floor's audio. Rarely needed now
   * that audio lives on the spatial contract — prefer editing the
   * contract in floor-manager. Kept as a thin compatibility shim for
   * any callers that still expect to poke a track in at runtime: it
   * delegates to AudioSystem.playMusic directly if the current context
   * matches the targeted floor.
   *
   * @param {string} floorId
   * @param {string} trackKey
   */
  function setFloorTrack(floorId, trackKey) {
    if (_currentContext === floorId && trackKey) {
      AudioSystem.playMusic(trackKey);
    }
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
