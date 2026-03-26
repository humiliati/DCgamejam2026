/**
 * SeededRNG — deterministic random number generator for reproducible dungeons.
 * Mulberry32 algorithm.
 */
var SeededRNG = (function () {
  'use strict';

  var _seed = Date.now();

  function seed(s) {
    _seed = s | 0;
  }

  function random() {
    _seed |= 0;
    _seed = (_seed + 0x6D2B79F5) | 0;
    var t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Random int in [min, max] inclusive */
  function randInt(min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
  }

  /** Pick a random element from an array */
  function pick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(random() * arr.length)];
  }

  /** Weighted random selection: items = [{ weight, value }] */
  function weighted(items) {
    var total = 0;
    for (var i = 0; i < items.length; i++) total += items[i].weight;
    var roll = random() * total;
    var cumulative = 0;
    for (var i = 0; i < items.length; i++) {
      cumulative += items[i].weight;
      if (roll < cumulative) return items[i].value;
    }
    return items[items.length - 1].value;
  }

  /** Shuffle array in place (Fisher-Yates) */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  return {
    seed: seed,
    random: random,
    randInt: randInt,
    pick: pick,
    weighted: weighted,
    shuffle: shuffle
  };
})();
