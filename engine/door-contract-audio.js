/**
 * DoorContractAudio — IIFE module
 *
 * Pure data module: encodes the door/floor transition sound grammar.
 * Every floor transition produces a sound sequence derived from layer
 * distance between source and target floors.
 *
 * Extracted from EyesOnly's DoorContractAudio (nearly verbatim).
 *
 * Token types:
 *   DoorOpen  — played before scene transition (player hears the door open)
 *   Ascend/Descend — played during fade (overlaps door open by ~30%)
 *   DoorClose — played after fade-in (player hears door shut behind them)
 *
 * Ascend/Descend suffix encodes magnitude:
 *   2 = one structural layer crossed
 *   3 = two layers or world-scale elevation
 *
 * Floor hierarchy (EyesOnly convention):
 *   floorsN       = depth 1 (exterior/overworld)
 *   floorsN.N     = depth 2 (interior contrived — building)
 *   floorsN.N.N   = depth 3 (nested proc-gen dungeon)
 *
 * Timing contract:
 *   delay 0     DoorOpen plays immediately; scene waits ~350ms before fade
 *   delay 250   Ascend/Descend overlaps last ~30% of door open
 *   delay 600   DoorClose plays after fade-in completes
 */
var DoorContractAudio = (function () {
  'use strict';

  // ── Manifest key prefix for door sounds ──────────────────────────
  var _D = 'doorset-ogg-qubodup-';

  // ── Transition table ─────────────────────────────────────────────
  // Keyed by "srcDepth:tgtDepth" where depth = floorId.split('.').length
  //
  // Special keys:
  //   "1:1"           = world elevation (N → N±), no door
  //   "1:2" / "2:1"   = world ↔ building (horizontal)
  //   "2:3" / "3:2"   = building ↔ basement (door + vertical)
  //   "1:3" / "3:1"   = world ↔ basement (skip building — long vertical)
  //   "3:3_deeper"    = nested → deeper nested
  //   "3:3_shallower" = nested → shallower nested

  var TRANSITION_TABLE = {
    // ── World ↔ Building (N ↔ N.N) ── Horizontal, door only
    '1:2': [
      { key: _D + 'dooropen01', delay: 0, volume: 0.5 },
      { key: _D + 'doorclose03', delay: 600, volume: 0.45 }
    ],
    '2:1': [
      { key: _D + 'dooropen06', delay: 0, volume: 0.5 },
      { key: _D + 'doorclose06', delay: 600, volume: 0.45 }
    ],

    // ── Building ↔ Basement (N.N ↔ N.N.N) ── Door + vertical
    '2:3': [
      { key: _D + 'dooropen02', delay: 0, volume: 0.5 },
      { key: 'descend-2', delay: 250, volume: 0.4 },
      { key: _D + 'doorclose05', delay: 600, volume: 0.45 }
    ],
    '3:2': [
      { key: _D + 'dooropen01', delay: 0, volume: 0.5 },
      { key: 'ascend-2', delay: 250, volume: 0.4 },
      { key: _D + 'doorclose05', delay: 600, volume: 0.45 }
    ],

    // ── Basement ↔ World (N.N.N ↔ N) ── Door + long vertical, no close
    '3:1': [
      { key: _D + 'dooropen03', delay: 0, volume: 0.5 },
      { key: 'ascend-3', delay: 250, volume: 0.4 }
    ],
    '1:3': [
      { key: _D + 'dooropen04', delay: 0, volume: 0.5 },
      { key: 'descend-3', delay: 250, volume: 0.4 }
    ],

    // ── Nested ↔ Deeper Nested (N.N.N ↔ N.N.N+) ── Heavy door + vertical
    '3:3_deeper': [
      { key: _D + 'dooropen05', delay: 0, volume: 0.5 },
      { key: 'descend-2', delay: 250, volume: 0.4 },
      { key: _D + 'doorclose09', delay: 600, volume: 0.45 }
    ],
    '3:3_shallower': [
      { key: _D + 'dooropen05', delay: 0, volume: 0.5 },
      { key: 'ascend-2', delay: 250, volume: 0.4 },
      { key: _D + 'doorclose09', delay: 600, volume: 0.45 }
    ],

    // ── Building ↔ Building (N.N ↔ N.N) ── Interior horizontal
    '2:2': [
      { key: _D + 'dooropen01', delay: 0, volume: 0.45 },
      { key: _D + 'doorclose03', delay: 500, volume: 0.4 }
    ],

    // ── World elevation (N → N±) ── Pure vertical, no door
    '1:1_up': [
      { key: 'ascend-3', delay: 0, volume: 0.4 }
    ],
    '1:1_down': [
      { key: 'descend-3', delay: 0, volume: 0.4 }
    ]
  };

  // ── Helper: floor depth from floorId ─────────────────────────────
  // "1" → 1, "1.2" → 2, "1.2.3" → 3, null → 1 (world)
  function _depth(floorId) {
    if (!floorId) return 1;
    return String(floorId).split('.').length;
  }

  /**
   * Infer direction for same-depth nested transitions.
   * Compares the trailing segment numerically.
   * "1.2.3" vs "1.2.5" → 3 < 5 → 'deeper'
   */
  function _inferNestedDirection(srcId, tgtId) {
    var srcParts = String(srcId).split('.');
    var tgtParts = String(tgtId).split('.');
    var srcTail = parseInt(srcParts[srcParts.length - 1], 10) || 0;
    var tgtTail = parseInt(tgtParts[tgtParts.length - 1], 10) || 0;
    return tgtTail > srcTail ? 'deeper' : 'shallower';
  }

  /**
   * Determine the sound sequence for a floor transition.
   *
   * @param {string|null} sourceFloorId - Current floor (null = world)
   * @param {string|null} targetFloorId - Destination floor (null = world)
   * @param {Object}      [opts]        - Optional hints
   * @param {string}      [opts.direction] - 'up'|'down' for same-depth
   * @returns {Array<{key:string, delay:number, volume:number}>}
   */
  function getTransitionSounds(sourceFloorId, targetFloorId, opts) {
    var srcD = _depth(sourceFloorId);
    var tgtD = _depth(targetFloorId);
    opts = opts || {};

    // Same-depth transitions need directional hint
    if (srcD === tgtD) {
      if (srcD === 1) {
        var dir = opts.direction || 'down';
        return (TRANSITION_TABLE['1:1_' + dir] || TRANSITION_TABLE['1:1_down']).slice();
      }
      if (srcD >= 3) {
        var nestedDir = opts.direction || _inferNestedDirection(sourceFloorId, targetFloorId);
        if (nestedDir === 'up' || nestedDir === 'shallower') {
          return (TRANSITION_TABLE['3:3_shallower'] || []).slice();
        }
        return (TRANSITION_TABLE['3:3_deeper'] || []).slice();
      }
    }

    // Cross-depth transitions: lookup by depth pair
    var tableKey = srcD + ':' + tgtD;
    var entry = TRANSITION_TABLE[tableKey];
    if (entry) return entry.slice();

    // Fallback: generic ascend or descend based on depth change
    if (tgtD > srcD) {
      return [{ key: 'descend-2', delay: 0, volume: 0.4 }];
    }
    return [{ key: 'ascend-2', delay: 0, volume: 0.4 }];
  }

  /**
   * Get the pre-fade delay in ms. How long the scene should wait
   * after starting the door open sound before beginning the visual
   * fade. Ensures player hears the door creak before screen goes dark.
   *
   * @param {Array} sounds - Result from getTransitionSounds()
   * @returns {number} ms to wait before starting fade
   */
  function getPreFadeDelay(sounds) {
    if (!sounds || sounds.length === 0) return 0;
    for (var i = 0; i < sounds.length; i++) {
      if (sounds[i].delay === 0 && sounds[i].key.indexOf('doorset') !== -1) {
        return 350; // Door creak needs ~350ms before fade
      }
    }
    return 0; // Pure vertical: no pre-fade delay
  }

  /**
   * Get the transition type label for HUD overlay.
   *
   * @param {string|null} sourceFloorId
   * @param {string|null} targetFloorId
   * @param {Object}      [opts]
   * @returns {string} e.g. "Entering...", "Descending...", "Ascending..."
   */
  function getTransitionLabel(sourceFloorId, targetFloorId, opts) {
    var srcD = _depth(sourceFloorId);
    var tgtD = _depth(targetFloorId);
    opts = opts || {};

    // Horizontal (world ↔ building): entering/exiting
    if ((srcD === 1 && tgtD === 2) || (srcD === 2 && tgtD === 1)) {
      return srcD < tgtD ? 'Entering...' : 'Exiting...';
    }

    // Vertical: ascending/descending
    if (tgtD > srcD) return 'Descending...';
    if (tgtD < srcD) return 'Ascending...';

    // Same depth — interior rooms use "Entering...", dungeons use vertical
    if (srcD === 2) return 'Entering...';
    var dir = opts.direction || 'down';
    if (dir === 'up' || dir === 'shallower') return 'Ascending...';
    return 'Descending...';
  }

  // ── Public API ───────────────────────────────────────────────────
  return {
    getTransitionSounds: getTransitionSounds,
    getPreFadeDelay: getPreFadeDelay,
    getTransitionLabel: getTransitionLabel,
    TRANSITION_TABLE: TRANSITION_TABLE
  };
})();
