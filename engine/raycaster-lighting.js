/**
 * RaycasterLighting — pure fog/tint/glow helpers extracted from raycaster.js.
 *
 * Phase 1 of the raycaster extraction roadmap (see
 * docs/RAYCASTER_EXTRACTION_ROADMAP.md, EX-1).
 *
 * These functions are stateless — they take all inputs as parameters and
 * return a value. They were moved out of raycaster.js so the core
 * rendering module is smaller and agents can edit fog/tint behavior
 * without loading the DDA hotpath into context.
 *
 * Consumers (raycaster.js) alias these into local names at IIFE top so
 * the existing hot call sites remain single-identifier references:
 *
 *     var _applyFogAndBrightness = RaycasterLighting.applyFogAndBrightness;
 *     var _tintedDark            = RaycasterLighting.tintedDark;
 *     var _parseGlowRGB          = RaycasterLighting.parseGlowRGB;
 *
 * Depends on no other modules. Layer 2 (loaded before raycaster.js).
 */
var RaycasterLighting = (function () {
  'use strict';

  /**
   * Overlay color for "in-shadow" pixels. Returns a color-tinted rgba()
   * if the tile has a nonzero light tint strength, otherwise a plain
   * black overlay at the requested alpha.
   *
   * @param {Float32Array[]} tS    - tint strength map
   * @param {Uint8Array[]}   tI    - tint palette index map
   * @param {Array}          tRGB  - palette: [[r,g,b], ...]
   * @param {number}         my    - tile Y
   * @param {number}         mx    - tile X
   * @param {number}         alpha - overlay opacity (1-brightness)
   * @returns {string} rgba() CSS color
   */
  function tintedDark(tS, tI, tRGB, my, mx, alpha) {
    var s = tS && tS[my] ? tS[my][mx] : 0;
    if (s > 0.01 && tRGB) {
      var idx = tI && tI[my] ? tI[my][mx] : 0;
      var c = tRGB[idx] || tRGB[0];
      return 'rgba(' + ((s * c[0]) | 0) + ',' + ((s * c[1]) | 0) + ',' + ((s * c[2]) | 0) + ',' + alpha + ')';
    }
    return 'rgba(0,0,0,' + alpha + ')';
  }

  /**
   * Combine base hex color with per-tile brightness, dynamic light tint,
   * and distance fog into a final rgb() CSS color.
   *
   * @param {string} hexColor   - base '#rrggbb'
   * @param {number} fogFactor  - 0..1 (1 = fully fogged)
   * @param {number} brightness - 0..1 (0 = black)
   * @param {Object} fogColor   - { r, g, b } or null
   * @param {number} tintS      - light tint strength at tile
   * @param {number} tintI      - light tint palette index at tile
   * @param {Array}  tintRGB    - palette
   * @returns {string} rgb() CSS color
   */
  function applyFogAndBrightness(hexColor, fogFactor, brightness, fogColor, tintS, tintI, tintRGB) {
    var r = parseInt(hexColor.substr(1, 2), 16);
    var g = parseInt(hexColor.substr(3, 2), 16);
    var b = parseInt(hexColor.substr(5, 2), 16);

    r = Math.floor(r * brightness);
    g = Math.floor(g * brightness);
    b = Math.floor(b * brightness);

    // Color tint: shift toward palette color in dim areas near tinted sources
    if (tintS > 0.01 && tintRGB) {
      var inv = 1 - brightness; // Stronger in darker areas
      var tc = tintRGB[tintI] || tintRGB[0];
      r = Math.min(255, r + Math.floor(tc[0] * tintS * inv));
      g = Math.min(255, g + Math.floor(tc[1] * tintS * inv));
      b = Math.max(0,   b - Math.floor(Math.max(0, 10 - tc[2]) * tintS * inv));
    }

    var fr = fogColor ? fogColor.r : 0;
    var fg = fogColor ? fogColor.g : 0;
    var fb = fogColor ? fogColor.b : 0;

    r = Math.floor(r * (1 - fogFactor) + fr * fogFactor);
    g = Math.floor(g * (1 - fogFactor) + fg * fogFactor);
    b = Math.floor(b * (1 - fogFactor) + fb * fogFactor);

    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /**
   * Parse a glow color string into 'r,g,b' for use in rgba() construction.
   * Accepts '#rrggbb', '#rgb', 'rgba(r,g,b,a)', or 'rgb(r,g,b)'.
   * Returns '255,255,255' as fallback.
   */
  function parseGlowRGB(color) {
    if (!color) return '255,255,255';
    if (color.charAt(0) === '#') {
      var hex = color.length === 4
        ? color.charAt(1) + color.charAt(1) + color.charAt(2) + color.charAt(2) + color.charAt(3) + color.charAt(3)
        : color.substring(1);
      return parseInt(hex.substring(0, 2), 16) + ',' +
             parseInt(hex.substring(2, 4), 16) + ',' +
             parseInt(hex.substring(4, 6), 16);
    }
    var m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return m[1] + ',' + m[2] + ',' + m[3];
    return '255,255,255';
  }

  return Object.freeze({
    tintedDark: tintedDark,
    applyFogAndBrightness: applyFogAndBrightness,
    parseGlowRGB: parseGlowRGB
  });
})();
