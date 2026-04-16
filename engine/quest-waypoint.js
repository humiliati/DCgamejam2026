/**
 * QuestWaypoint — retired thin shim.
 *
 * DOC-107 Phase 1: the navigation-hint state machine that used to live
 * here has been absorbed into `engine/quest-chain.js` (see
 * `QuestChain.getCurrentMarker` + `_legacyNavigationMarker`). The only
 * unique behaviour left is `evaluateCursorFxGating()`, which dispatches
 * the WaterCursorFX active/inactive toggle on floor depth + hose state.
 *
 * Kept as a stand-alone module until the cursor-fx consolidation
 * (see docs/QUEST_SYSTEM_ROADMAP.md §7 Archival Candidates). After that
 * consolidation lands, delete this file and drop the <script> tag in
 * index.html + the `_evaluateCursorFxGating()` call site in game.js.
 *
 * All other exports are thin delegates to QuestChain so any legacy
 * caller that still imports `QuestWaypoint.update()` keeps working.
 */
var QuestWaypoint = (function() {
  'use strict';

  // No-op init. QuestChain.init(opts) now owns the dispatcher callback
  // wiring that QuestWaypoint.init used to hold. Calling this is safe
  // and silent so old Game boot code doesn't need immediate surgery.
  function init(_opts) { /* intentionally empty */ }

  // Delegate — marker refresh is authoritative in QuestChain now.
  function update() {
    if (typeof QuestChain !== 'undefined' && QuestChain.update) {
      QuestChain.update();
    }
  }

  // Kept intact: evaluate whether WaterCursorFX should be active based
  // on current floor depth (dungeon ≥ depth 3) AND hose state.
  function floorDepth(id) { return String(id).split('.').length; }

  function evaluateCursorFxGating() {
    if (typeof WaterCursorFX === 'undefined') return;
    if (typeof ScreenManager === 'undefined') return;
    if (ScreenManager.getState ? ScreenManager.getState() !== ScreenManager.STATES.GAMEPLAY : true) {
      return;
    }

    var floorId = (typeof FloorManager !== 'undefined' && FloorManager.getCurrentFloorId)
      ? FloorManager.getCurrentFloorId() : '1';

    var inDungeon = (typeof FloorManager !== 'undefined' && FloorManager.isDungeonFloor)
      ? FloorManager.isDungeonFloor(floorId)
      : (floorDepth(floorId) >= 3);

    var hoseOn = (typeof HoseState !== 'undefined' && HoseState.isActive && HoseState.isActive());

    var shouldBeActive = inDungeon && hoseOn;
    WaterCursorFX.setActive(shouldBeActive);
  }

  return Object.freeze({
    init:                   init,
    update:                 update,
    evaluateCursorFxGating: evaluateCursorFxGating,
    floorDepth:             floorDepth
  });
})();
