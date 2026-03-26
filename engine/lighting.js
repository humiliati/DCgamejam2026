/**
 * Lighting — per-tile light map for raycaster brightness.
 * Stub with basic player-centered radial light.
 * Full extraction from EyesOnly's LightingSystem in Pass 7.
 */
var Lighting = (function () {
  'use strict';

  var _lightMap = null;
  var _playerLightRadius = 6;

  /**
   * Generate a light map centered on the player.
   * @param {Object} player - { x, y }
   * @param {Array[]} grid
   * @param {number} gridW
   * @param {number} gridH
   * @returns {Array[]} 2D array of brightness values (0-1)
   */
  function calculate(player, grid, gridW, gridH) {
    if (!_lightMap || _lightMap.length !== gridH) {
      _lightMap = [];
      for (var y = 0; y < gridH; y++) {
        _lightMap[y] = new Float32Array(gridW);
      }
    }

    // Reset
    for (var y = 0; y < gridH; y++) {
      for (var x = 0; x < gridW; x++) {
        _lightMap[y][x] = 0.05; // Ambient darkness
      }
    }

    // Player torch — simple radial falloff
    var r = _playerLightRadius;
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        var tx = player.x + dx;
        var ty = player.y + dy;
        if (tx < 0 || tx >= gridW || ty < 0 || ty >= gridH) continue;

        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) continue;

        var brightness = 1.0 - (dist / r);
        brightness = brightness * brightness; // Quadratic falloff
        _lightMap[ty][tx] = Math.max(_lightMap[ty][tx], brightness);
      }
    }

    return _lightMap;
  }

  function setRadius(r) { _playerLightRadius = r; }
  function getMap() { return _lightMap; }

  return {
    calculate: calculate,
    setRadius: setRadius,
    getMap: getMap
  };
})();
