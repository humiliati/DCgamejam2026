var QuestWaypoint = (function() {
  'use strict';

  // =========================================================================
  // STATE
  // =========================================================================

  var _lastQuestTarget = null;   // { floorId, x, y }
  var _EXTERIOR_CHAIN = ['0', '1', '2', '3'];

  // =========================================================================
  // INIT: Dependency injection for dispatcher queries
  // =========================================================================

  var _getDispatcherPhase = null;
  var _getDispatcherEntity = null;
  var _findGateDoorPos = null;

  function init(opts) {
    if (!opts) opts = {};
    if (typeof opts.getDispatcherPhase === 'function') {
      _getDispatcherPhase = opts.getDispatcherPhase;
    }
    if (typeof opts.getDispatcherEntity === 'function') {
      _getDispatcherEntity = opts.getDispatcherEntity;
    }
    if (typeof opts.findGateDoorPos === 'function') {
      _findGateDoorPos = opts.findGateDoorPos;
    }
  }

  // =========================================================================
  // UTILITIES
  // =========================================================================

  function floorDepth(id) {
    return String(id).split('.').length;
  }

  // =========================================================================
  // DOOR RESOLUTION
  // =========================================================================

  function findDoorTo(parentFloorId, targetFloorId) {
    var src = null;
    if (typeof FloorManager !== 'undefined') {
      if (FloorManager.getFloor && FloorManager.getFloor() === parentFloorId) {
        if (FloorManager.getFloorData) {
          src = FloorManager.getFloorData();
        }
      } else if (FloorManager.getFloorCache) {
        src = FloorManager.getFloorCache(parentFloorId);
      }
    }
    if (!src || !src.doorTargets) return null;
    for (var key in src.doorTargets) {
      if (src.doorTargets[key] === targetFloorId) {
        var parts = key.split(',');
        return { x: parseInt(parts[0], 10), y: parseInt(parts[1], 10) };
      }
    }
    return null;
  }

  function findProgressionDoorForward(currentExterior, targetExterior) {
    var ci = _EXTERIOR_CHAIN.indexOf(String(currentExterior));
    var ti = _EXTERIOR_CHAIN.indexOf(String(targetExterior));
    if (ci < 0 || ti < 0 || ci === ti) return null;
    var step = ci < ti ? 1 : -1;
    for (var i = ti; i !== ci; i -= step) {
      var hopTarget = _EXTERIOR_CHAIN[i];
      var pos = findDoorTo(currentExterior, hopTarget);
      if (pos) return pos;
    }
    return null;
  }

  function findCurrentDoorExit() {
    if (typeof FloorManager === 'undefined') return null;
    var fd = FloorManager.getFloorData ? FloorManager.getFloorData() : null;
    if (!fd) return null;
    if (fd.doors && fd.doors.doorExit) {
      return { x: fd.doors.doorExit.x, y: fd.doors.doorExit.y };
    }
    if (fd.doorTargets) {
      var bestKey = null, bestLen = 999;
      for (var k in fd.doorTargets) {
        var t = String(fd.doorTargets[k]);
        if (t.length < bestLen) { bestLen = t.length; bestKey = k; }
      }
      if (bestKey) {
        var p = bestKey.split(',');
        return { x: parseInt(p[0], 10), y: parseInt(p[1], 10) };
      }
    }
    return null;
  }

  function findTruckAnchorOnFloor(floorId) {
    if (typeof DumpTruckSpawner === 'undefined' || !DumpTruckSpawner.getDeployment) {
      return null;
    }
    var dep = DumpTruckSpawner.getDeployment();
    if (!dep || dep.floorId !== floorId || !dep.tiles || dep.tiles.length === 0) {
      return null;
    }
    return { x: dep.tiles[0][0], y: dep.tiles[0][1] };
  }

  // =========================================================================
  // QUEST TARGET MANAGEMENT
  // =========================================================================

  function commitQuestTarget(floorId, target) {
    if (typeof Minimap === 'undefined') return;
    if (target) {
      _lastQuestTarget = { floorId: floorId, x: target.x, y: target.y };
      if (Minimap.setQuestTarget) {
        Minimap.setQuestTarget({ x: target.x, y: target.y });
      }
    } else {
      _lastQuestTarget = null;
      if (Minimap.setQuestTarget) {
        Minimap.setQuestTarget(null);
      }
    }
  }

  function updateQuestTarget() {
    if (typeof Minimap === 'undefined' || !Minimap.setQuestTarget) return;
    if (typeof FloorManager === 'undefined') return;

    var floorId = FloorManager.getFloor ? FloorManager.getFloor() : '1';

    function stickyOrNull() {
      if (_lastQuestTarget && _lastQuestTarget.floorId === floorId) {
        return { x: _lastQuestTarget.x, y: _lastQuestTarget.y };
      }
      return null;
    }

    // =====================================================================
    // PHASE 1: Gate still locked (pre-authorization)
    // =====================================================================

    var gateUnlocked = (typeof GameActions !== 'undefined' && GameActions.isGateUnlocked)
      ? GameActions.isGateUnlocked() : false;

    if (!gateUnlocked) {
      var dispatcherPhase = _getDispatcherPhase ? _getDispatcherPhase() : null;
      var isDispatcherPhase = dispatcherPhase !== 'done';

      if (isDispatcherPhase) {
        if (floorId === '0') {
          commitQuestTarget(floorId, findCurrentDoorExit() || stickyOrNull());
        } else if (floorId === '1') {
          var dispEntity = _getDispatcherEntity ? _getDispatcherEntity() : null;
          if (dispEntity && !dispEntity._hidden) {
            commitQuestTarget(floorId, { x: dispEntity.x, y: dispEntity.y });
          } else {
            var gateQ = _findGateDoorPos ? _findGateDoorPos() : null;
            commitQuestTarget(floorId, gateQ ? { x: gateQ.x - 1, y: gateQ.y } : stickyOrNull());
          }
        } else {
          commitQuestTarget(floorId, findCurrentDoorExit() || stickyOrNull());
        }
      } else {
        if (floorId === '1') {
          commitQuestTarget(floorId, { x: 22, y: 27 });
        } else if (floorId === '1.6') {
          commitQuestTarget(floorId, { x: 19, y: 3 });
        } else {
          commitQuestTarget(floorId, findCurrentDoorExit() || stickyOrNull());
        }
      }
      return;
    }

    // =====================================================================
    // PHASE 2-3: Dungeon work cycle (gate unlocked)
    // =====================================================================

    var nextGroup = (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getNextGroup)
      ? DungeonSchedule.getNextGroup() : null;

    // Check for hero reveal and club contract fallback
    var heroRevealed = (typeof Player !== 'undefined' && Player.hasFlag)
      ? Player.hasFlag('heroWakeArrival') : false;

    if (!heroRevealed && typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getSchedule) {
      var schedList = DungeonSchedule.getSchedule();
      var clubContract = null;
      for (var sci = 0; sci < schedList.length; sci++) {
        if (schedList[sci].groupId === 'club' && !schedList[sci].resolved) {
          clubContract = schedList[sci];
          break;
        }
      }
      if (clubContract) {
        var curDay = (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getCurrentDay)
          ? DungeonSchedule.getCurrentDay() : 0;
        nextGroup = {
          groupId:    clubContract.groupId,
          label:      clubContract.label,
          suit:       clubContract.suit,
          floorIds:   clubContract.floorIds,
          target:     clubContract.target,
          actualDay:  clubContract.actualDay,
          daysAway:   Math.max(0, clubContract.actualDay - curDay),
          heroType:   clubContract.heroType,
          onSchedule: clubContract.onSchedule
        };
      }
    }

    // No active quest group
    if (!nextGroup || !nextGroup.floorIds || nextGroup.floorIds.length === 0) {
      _lastQuestTarget = null;
      if (Minimap.setQuestTarget) {
        Minimap.setQuestTarget(null);
      }
      return;
    }

    var dungeonId  = nextGroup.floorIds[0];
    var segs       = dungeonId.split('.');
    var lobbyId    = segs.slice(0, 2).join('.');
    var exteriorId = segs[0];
    var target     = (nextGroup.target || 0.6);

    // Check if player is in this dungeon
    var inThisDungeon = false;
    var dungeonIdx = -1;
    for (var gi = 0; gi < nextGroup.floorIds.length; gi++) {
      if (floorId === nextGroup.floorIds[gi]) {
        inThisDungeon = true;
        dungeonIdx = gi;
        break;
      }
    }

    if (inThisDungeon) {
      // Inside the dungeon: guide toward stairs or treasure
      var coreScore = (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.getCoreScore)
        ? ReadinessCalc.getCoreScore(floorId) : 0;
      var dData = (typeof FloorManager !== 'undefined' && FloorManager.getFloorData)
        ? FloorManager.getFloorData() : null;
      var stairsUpPos = (dData && dData.doors && dData.doors.stairsUp)
        ? { x: dData.doors.stairsUp.x, y: dData.doors.stairsUp.y } : null;
      var stairsDnPos = (dData && dData.doors && dData.doors.stairsDn)
        ? { x: dData.doors.stairsDn.x, y: dData.doors.stairsDn.y } : null;

      if (coreScore >= target) {
        commitQuestTarget(floorId,
          stairsUpPos || stairsDnPos || findTruckAnchorOnFloor(floorId) || stickyOrNull());
      } else {
        commitQuestTarget(floorId,
          stairsDnPos || stairsUpPos || findTruckAnchorOnFloor(floorId) || stickyOrNull());
      }
      return;
    }

    if (floorId === lobbyId) {
      // In the lobby: decide whether to descend or exit
      var allFloorsDone = true;
      if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.getCoreScore) {
        for (var fi = 0; fi < nextGroup.floorIds.length; fi++) {
          if (ReadinessCalc.getCoreScore(nextGroup.floorIds[fi]) < target) {
            allFloorsDone = false;
            break;
          }
        }
      }

      var lobbyData = (typeof FloorManager !== 'undefined' && FloorManager.getFloorData)
        ? FloorManager.getFloorData() : null;
      var lobbyExit = (lobbyData && lobbyData.doors && lobbyData.doors.doorExit)
        ? { x: lobbyData.doors.doorExit.x, y: lobbyData.doors.doorExit.y } : null;
      var lobbyDn = (lobbyData && lobbyData.doors && lobbyData.doors.stairsDn)
        ? { x: lobbyData.doors.stairsDn.x, y: lobbyData.doors.stairsDn.y } : null;

      if (allFloorsDone) {
        commitQuestTarget(floorId, lobbyExit || lobbyDn || stickyOrNull());
      } else {
        commitQuestTarget(floorId, lobbyDn || lobbyExit || stickyOrNull());
      }
      return;
    }

    if (floorId === exteriorId) {
      // On the surface: guide toward the lobby entrance
      var doorPos = findDoorTo(exteriorId, lobbyId)
                 || findTruckAnchorOnFloor(floorId)
                 || stickyOrNull();
      commitQuestTarget(floorId, doorPos);
      return;
    }

    if (floorDepth(floorId) === 1 && floorId !== exteriorId) {
      // In a different exterior floor: guide back to target exterior
      var gateDoor = findDoorTo(floorId, exteriorId)
                  || findProgressionDoorForward(floorId, exteriorId)
                  || findTruckAnchorOnFloor(floorId)
                  || stickyOrNull();
      commitQuestTarget(floorId, gateDoor);
      return;
    }

    // Fallback: find exit from current floor
    commitQuestTarget(floorId, findCurrentDoorExit() || stickyOrNull());
  }

  // =========================================================================
  // WATER CURSOR FX GATING
  // =========================================================================

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

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return Object.freeze({
    init:                    init,
    update:                  updateQuestTarget,
    evaluateCursorFxGating:  evaluateCursorFxGating,
    floorDepth:              floorDepth,
    findDoorTo:              findDoorTo,
    findCurrentDoorExit:     findCurrentDoorExit
  });
})();
