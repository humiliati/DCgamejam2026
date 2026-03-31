/**
 * SpriteSheet — Frame-sequence sprite loader and accessor.
 *
 * Loads named sprite sequences (arrays of PNG frames) and provides
 * per-frame Image access for animated rendering. Used by ParticleFX
 * for coin flip, smoke poof, and light burst sprite particles.
 *
 * Falls back gracefully — callers check isLoaded() before drawing.
 * If a sequence isn't loaded, ParticleFX falls back to emoji rendering.
 *
 * Layer 1 (zero dependencies — just Image loading)
 *
 * Usage:
 *   SpriteSheet.load('coin', [
 *     'assets/fx/coin/goldcoin-frame1.png',
 *     'assets/fx/coin/goldcoin-frame2.png',
 *     ...
 *   ]);
 *
 *   // Later, in render:
 *   if (SpriteSheet.isLoaded('coin')) {
 *     var frame = SpriteSheet.getFrame('coin', frameIdx);
 *     ctx.drawImage(frame, x, y, w, h);
 *   }
 *
 * @module SpriteSheet
 */
var SpriteSheet = (function () {
  'use strict';

  /**
   * Registry of loaded sprite sequences.
   * Map<string, {
   *   frames: Image[],
   *   loaded: boolean,
   *   count: number,
   *   pending: number
   * }>
   */
  var _sheets = {};

  /**
   * Load a named sprite sequence from an array of image paths.
   * Loading is async — isLoaded() returns true when ALL frames are ready.
   *
   * @param {string} name — sequence name (e.g. 'coin', 'smoke', 'light')
   * @param {string[]} paths — ordered array of image file paths
   * @param {Function} [onReady] — optional callback when all frames loaded
   */
  function load(name, paths, onReady) {
    if (_sheets[name] && _sheets[name].loaded) {
      if (onReady) onReady();
      return;
    }

    var entry = {
      frames: [],
      loaded: false,
      count: paths.length,
      pending: paths.length
    };

    for (var i = 0; i < paths.length; i++) {
      (function (idx, path) {
        var img = new Image();
        img.onload = function () {
          entry.frames[idx] = img;
          entry.pending--;
          if (entry.pending <= 0) {
            entry.loaded = true;
            console.log('[SpriteSheet] Loaded "' + name + '" (' + entry.count + ' frames)');
            if (onReady) {
              try { onReady(); } catch (e) {
                console.error('[SpriteSheet] onReady error for "' + name + '":', e);
              }
            }
          }
        };
        img.onerror = function () {
          console.warn('[SpriteSheet] Failed to load frame ' + idx + ' for "' + name + '": ' + path);
          entry.frames[idx] = null;
          entry.pending--;
          if (entry.pending <= 0) {
            // Partial load — mark loaded if at least 1 frame succeeded
            entry.loaded = entry.frames.some(function (f) { return f !== null; });
            if (entry.loaded) {
              console.log('[SpriteSheet] Partial load "' + name + '" (' +
                entry.frames.filter(function (f) { return f; }).length + '/' + entry.count + ' frames)');
            }
            if (onReady) {
              try { onReady(); } catch (e) {
                console.error('[SpriteSheet] onReady error for "' + name + '":', e);
              }
            }
          }
        };
        img.src = path;
      })(i, paths[i]);
    }

    _sheets[name] = entry;
  }

  /**
   * Get a specific frame Image from a loaded sequence.
   * Returns null if not loaded or frame index out of range.
   *
   * @param {string} name — sequence name
   * @param {number} frameIdx — frame index (wraps via modulo)
   * @returns {Image|null}
   */
  function getFrame(name, frameIdx) {
    var entry = _sheets[name];
    if (!entry || !entry.loaded) return null;
    var idx = ((frameIdx % entry.count) + entry.count) % entry.count;
    return entry.frames[idx] || null;
  }

  /**
   * Get the frame count for a loaded sequence.
   * @param {string} name
   * @returns {number} 0 if not loaded
   */
  function getFrameCount(name) {
    var entry = _sheets[name];
    return (entry && entry.loaded) ? entry.count : 0;
  }

  /**
   * Check if a named sequence is fully loaded and ready to render.
   * @param {string} name
   * @returns {boolean}
   */
  function isLoaded(name) {
    var entry = _sheets[name];
    return !!(entry && entry.loaded);
  }

  /**
   * Preload all standard FX sprite sequences.
   * Called during game init to warm the cache.
   */
  function preloadAll() {
    // Gold coin flip (6 frames)
    load('coin', [
      'assets/fx/coin/goldcoin-frame1.png',
      'assets/fx/coin/goldcoin-frame2.png',
      'assets/fx/coin/goldcoin-frame3.png',
      'assets/fx/coin/goldcoin-frame4.png',
      'assets/fx/coin/goldcoin-frame5.png',
      'assets/fx/coin/goldcoin-frame6.png'
    ]);

    // Smoke poof (5 frames)
    load('smoke', [
      'assets/fx/smoke/FX001_01.png',
      'assets/fx/smoke/FX001_02.png',
      'assets/fx/smoke/FX001_03.png',
      'assets/fx/smoke/FX001_04.png',
      'assets/fx/smoke/FX001_05.png'
    ]);

    // Light burst (5 frames)
    load('light', [
      'assets/fx/light/FX003_01.png',
      'assets/fx/light/FX003_02.png',
      'assets/fx/light/FX003_03.png',
      'assets/fx/light/FX003_04.png',
      'assets/fx/light/FX003_05.png'
    ]);
  }

  // ── Public API ───────────────────────────────────────────────────

  return Object.freeze({
    load: load,
    getFrame: getFrame,
    getFrameCount: getFrameCount,
    isLoaded: isLoaded,
    preloadAll: preloadAll
  });
})();
