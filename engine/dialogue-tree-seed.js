/**
 * DialogueTreeSeed — Loads dialogue trees from data/dialogue-trees.js
 * and registers them with NpcSystem.
 *
 * Replaces the inline NpcDialogueTrees IIFE (engine/npc-dialogue-trees.js).
 * The canonical source of truth is data/dialogue-trees.json; the browser
 * sidecar (data/dialogue-trees.js) exposes window.DIALOGUE_TREES_DATA.
 *
 * Handles:
 *   - Static root nodes (string → pass through)
 *   - Conditional root nodes ({ condition: { flag }, ifTrue, ifFalse }
 *     → reconstructs a runtime function that checks Player.getFlag)
 *   - Choice effects and showIf conditions (pass through as-is)
 *   - null next on choices (exit conversation — pass through)
 *
 * Layer 3.5 (depends on: NpcSystem [L1], Player [L3])
 */
var DialogueTreeSeed = (function () {
  'use strict';

  /**
   * Hydrate a tree from the JSON representation back to the runtime
   * shape that NpcSystem.registerTree() expects.
   *
   * The only transformation needed is conditional roots:
   * JSON stores { condition: { flag: 'X' }, ifTrue: 'a', ifFalse: 'b' }
   * Runtime needs root: function() { return Player.getFlag('X') ? 'a' : 'b'; }
   */
  function _hydrateTree(data) {
    var tree = {
      root:  data.root,
      nodes: data.nodes   // nodes pass through unchanged
    };

    // Reconstruct dynamic root function from conditional spec
    if (data.root && typeof data.root === 'object' && data.root.condition) {
      var flag    = data.root.condition.flag;
      var ifTrue  = data.root.ifTrue;
      var ifFalse = data.root.ifFalse;
      tree.root = function () {
        return (typeof Player !== 'undefined' && Player.getFlag(flag))
          ? ifTrue
          : ifFalse;
      };
    }

    return tree;
  }

  /**
   * Register all trees from the sidecar global.
   * Called once at load time (script execution).
   */
  function registerAll() {
    if (typeof DIALOGUE_TREES_DATA === 'undefined') {
      console.warn('[DialogueTreeSeed] DIALOGUE_TREES_DATA not found — skipping.');
      return;
    }
    if (typeof NpcSystem === 'undefined' || !NpcSystem.registerTree) {
      console.warn('[DialogueTreeSeed] NpcSystem.registerTree not available — skipping.');
      return;
    }

    var trees = DIALOGUE_TREES_DATA.trees;
    var ids   = Object.keys(trees);
    var count = 0;

    for (var i = 0; i < ids.length; i++) {
      var id   = ids[i];
      var tree = _hydrateTree(trees[id]);
      NpcSystem.registerTree(id, tree);
      count++;
    }

    console.log('[DialogueTreeSeed] Registered ' + count + ' dialogue trees from JSON.');
  }

  // Auto-register on load
  registerAll();

  return Object.freeze({
    registerAll: registerAll
  });
})();
