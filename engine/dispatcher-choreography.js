var DispatcherChoreography = (function() {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  var _dispatcherPhase = 'idle';
  var _dispatcherEntity = null;
  var _dispatcherRushTimer = 0;
  var _dispatcherBarkTimer = 0;
  var DISPATCHER_RUSH_STEP_MS = 100;
  var DISPATCHER_BARK_DELAY_MS = 800;
  var DISPATCHER_GRAB_RANGE = 2;
  var DISPATCHER_TRIGGER_RANGE = 7;
  var DISPATCHER_SPAWN_BEHIND = 6;
  var _dispatcherSpawnId = 'npc_dispatcher_gate';
  var _dispatcherDialogShown = false;
  var _ambientBarkTimer = null;
  var _AMBIENT_BARK_MIN_MS = 18000;
  var _AMBIENT_BARK_RANGE_MS = 10000;

  // Callbacks wired from Game
  var _onPickupWorkKeysCb = null;
  var _updateQuestTargetCb = null;
  var _changeStateCb = null;

  // ============================================================================
  // INIT
  // ============================================================================

  function init(opts) {
    if (!opts) opts = {};
    if (typeof opts.onPickupWorkKeys === 'function') _onPickupWorkKeysCb = opts.onPickupWorkKeys;
    if (typeof opts.updateQuestTarget === 'function') _updateQuestTargetCb = opts.updateQuestTarget;
    if (typeof opts.changeState === 'function') _changeStateCb = opts.changeState;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  function findGateDoorPos() {
    var floorData = (typeof FloorManager !== 'undefined' && FloorManager.getFloorData)
      ? FloorManager.getFloorData()
      : null;
    if (!floorData || !floorData.grid) return null;

    if (floorData.doorTargets) {
      var keys = Object.keys(floorData.doorTargets);
      for (var i = 0; i < keys.length; i++) {
        if (floorData.doorTargets[keys[i]] === '2') {
          var parts = keys[i].split(',');
          return { x: parseInt(parts[0], 10), y: parseInt(parts[1], 10) };
        }
      }
    }

    for (var gy = 0; gy < floorData.gridH; gy++) {
      for (var gx = 0; gx < floorData.gridW; gx++) {
        var tile = floorData.grid[gy][gx];
        var TILES_ref = (typeof TILES !== 'undefined') ? TILES : {};
        if (tile === TILES_ref.STAIRS_DN || tile === TILES_ref.TRAPDOOR_DN || tile === TILES_ref.BOSS_DOOR) {
          return { x: gx, y: gy };
        }
      }
    }
    return null;
  }

  function spawnDispatcherGate() {
    if (!_dispatcherDialogShown && typeof Player !== 'undefined' && Player.state) {
      var pf = Player.state().flags;
      if (pf && pf.dispatcher_met) _dispatcherDialogShown = true;
    }

    var enemies = (typeof FloorManager !== 'undefined' && FloorManager.getEnemies)
      ? FloorManager.getEnemies()
      : [];
    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].id === _dispatcherSpawnId) return;
    }

    var stack = (typeof NpcComposer !== 'undefined' && NpcComposer.getVendorPreset)
      ? NpcComposer.getVendorPreset('dispatcher')
      : null;

    var gatePos = findGateDoorPos();
    var spawnX = gatePos ? gatePos.x - 1 : 47;
    var spawnY = gatePos ? gatePos.y : 17;

    var entity = {
      id:          _dispatcherSpawnId,
      x:           spawnX,
      y:           spawnY,
      name:        'Dispatcher',
      emoji:       stack ? stack.head : '🐉',
      stack:       stack,
      type:        'dispatcher',
      hp:          999,
      maxHp:       999,
      str:         0,
      facing:      'west',
      awareness:   0,
      friendly:    true,
      nonLethal:   true,
      blocksMovement: true,
      _hidden:     false,
      tags:        ['gate_npc', 'dispatcher']
    };

    enemies.push(entity);
    _dispatcherEntity = entity;

    if (_dispatcherDialogShown) {
      _dispatcherPhase = 'done';
      console.log('[DispatcherChoreography] Dispatcher re-spawned as gatekeeper (encounter already completed)');
    } else {
      _dispatcherPhase = 'idle';
      console.log('[DispatcherChoreography] Dispatcher gate NPC spawned at gate (' + spawnX + ',' + spawnY + ')');
    }
  }

  function onArrivePromenade() {
    if (typeof BarkLibrary === 'undefined') return;

    var gateUnlocked = (typeof GameActions !== 'undefined' && GameActions.isGateUnlocked)
      ? GameActions.isGateUnlocked()
      : false;

    var barkKey = gateUnlocked ? 'ambient.promenade' : 'ambient.promenade.morning';

    setTimeout(function () {
      if (typeof BarkLibrary !== 'undefined' && BarkLibrary.fire) {
        BarkLibrary.fire(barkKey);
      }
    }, 2500);

    _ambientBarkTimer = setInterval(function () {
      if (typeof ScreenManager === 'undefined' || !ScreenManager.isPlaying) return;
      if (!ScreenManager.isPlaying()) return;
      if (typeof BarkLibrary !== 'undefined' && BarkLibrary.fire) {
        BarkLibrary.fire(barkKey);
      }
    }, _AMBIENT_BARK_MIN_MS + Math.random() * _AMBIENT_BARK_RANGE_MS);

    if (!gateUnlocked) {
      spawnDispatcherGate();
    }

    if (gateUnlocked && typeof Player !== 'undefined') {
      var fails = Player.getFlag('consecutiveFails') || 0;
      if (fails >= 4) {
        setTimeout(function () {
          if (typeof BarkLibrary !== 'undefined' && BarkLibrary.fire) {
            BarkLibrary.fire('npc.dispatcher.warn.fired');
          }
          setTimeout(function () {
            if (_changeStateCb) _changeStateCb('GAME_OVER');
          }, 3000);
        }, 1500);
      } else if (fails >= 3) {
        setTimeout(function () {
          if (typeof BarkLibrary !== 'undefined' && BarkLibrary.fire) {
            BarkLibrary.fire('npc.dispatcher.warn.severe');
          }
        }, 1500);
      } else if (fails >= 2) {
        setTimeout(function () {
          if (typeof BarkLibrary !== 'undefined' && BarkLibrary.fire) {
            BarkLibrary.fire('npc.dispatcher.warn.mild');
          }
        }, 1500);
      }
    }
  }

  function showDispatcherGateDialog() {
    if (typeof StatusBar === 'undefined' || !StatusBar.pushDialogue) return;

    var firstTime = !_dispatcherDialogShown;
    _dispatcherDialogShown = true;

    if (typeof Player !== 'undefined' && Player.state) {
      Player.state().flags.dispatcher_met = true;
    }

    var ps = (typeof Player !== 'undefined' && Player.state) ? Player.state() : {};
    var playerClass = ps.avatarName || ps.className || 'Gleaner';
    var callsign = ps.callsign || 'Operative';
    var factionName = 'the Heroes';
    if (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getNextGroup) {
      var _dsNext = DungeonSchedule.getNextGroup();
      if (_dsNext && _dsNext.heroType) {
        factionName = (_dsNext.suit ? _dsNext.suit + ' ' : '') + _dsNext.heroType + 's';
      }
    }

    var _closeCinematic = function () {
      console.log('[DispatcherChoreography] _closeCinematic — releasing controls');
      try {
        if (typeof CinematicCamera !== 'undefined' && CinematicCamera.isActive) {
          if (CinematicCamera.isActive()) {
            CinematicCamera.close();
          }
        }
      } catch (e) {
        console.error('[DispatcherChoreography] CinematicCamera.close() error:', e);
      }
      if (typeof MouseLook !== 'undefined' && MouseLook.releaseLock) {
        MouseLook.releaseLock();
      }
      if (typeof MovementController !== 'undefined' && MovementController.cancelAll) {
        MovementController.cancelAll();
      }
      _dispatcherPhase = 'done';
      if (_updateQuestTargetCb) _updateQuestTargetCb();
    };

    var dispatcherNpc = {
      id:    _dispatcherSpawnId,
      name:  'Dispatcher',
      emoji: '\uD83D\uDC09',
      x:     _dispatcherEntity ? _dispatcherEntity.x : 0,
      y:     _dispatcherEntity ? _dispatcherEntity.y : 0
    };

    var tree;

    if (firstTime) {
      tree = {
        root: 'intro',
        nodes: {
          intro: {
            text: 'You ' + callsign + '? New transfer? Great. I\'m your dispatcher. We had another incident on the lower floors and I need you onsite yesterday.',
            choices: [
              { label: 'What happened?',            next: 'what_happened' },
              { label: 'Nice to meet you too.',     next: 'snide' },
              { label: 'Just tell me what to do.',  next: 'key_redirect' }
            ]
          },
          what_happened: {
            text: '' + factionName + ' tore through here last night. Standard cleanup job. Walls need scrubbing, traps need resetting, the usual.',
            choices: [
              { label: 'Sounds rough.',             next: 'rough' },
              { label: 'Where do I start?',         next: 'key_redirect' }
            ]
          },
          snide: {
            text: 'Save the charm for your landlord. I\'ve had four transfers this quarter and none of them lasted a week. Prove me wrong.',
            choices: [
              { label: 'Plan to.',                  next: 'key_redirect' },
              { label: 'What happened to them?',    next: 'transfers' }
            ]
          },
          transfers: {
            text: 'Quit. Reassigned. One got too curious. Point is, the Department shuffles people and I\'m tired of the paperwork. Do the job, keep your head down.',
            choices: [
              { label: 'Noted. What\'s the job?',   next: 'key_redirect' }
            ]
          },
          rough: {
            text: 'It\'s the job. You signed up for this. Or the Department signed you up. Same thing.',
            choices: [
              { label: 'Where do I start?',         next: 'key_redirect' }
            ]
          },
          key_redirect: {
            text: 'Truck\'s already through to Lantern Row. Hazmat crew is on standby. Head east past the gate and link up with them — they\'ll show you the hose setup.',
            choices: [
              { label: 'On it.',
                next: null,
                effect: {
                  callback: function () {
                    if (typeof Toast !== 'undefined') {
                      Toast.show('\uD83D\uDC09 Head east to the cleaning truck on Lantern Row', 'info');
                    }
                  }
                }
              }
            ]
          }
        }
      };
    } else {
      tree = {
        root: 'return_greeting',
        nodes: {
          return_greeting: {
            text: 'Back again, ' + callsign + '? Crew\'s still out on Lantern Row. Get moving — that mess isn\'t cleaning itself.',
            choices: [
              { label: 'Heading out now.', next: null }
            ]
          }
        }
      };
    }

    StatusBar.pushDialogue(dispatcherNpc, tree, function () {
      _closeCinematic();
    }, { pinned: true });
  }

  function tick(dt) {
    var gateUnlocked = (typeof GameActions !== 'undefined' && GameActions.isGateUnlocked)
      ? GameActions.isGateUnlocked()
      : false;

    if (gateUnlocked || !_dispatcherEntity) return;
    if (typeof FloorManager === 'undefined' || !FloorManager.getFloor) return;
    if (FloorManager.getFloor() !== '1') return;
    if (typeof Player === 'undefined' || !Player.getPos) return;

    var pp = Player.getPos();
    var floorData = (typeof FloorManager !== 'undefined' && FloorManager.getFloorData)
      ? FloorManager.getFloorData()
      : null;

    switch (_dispatcherPhase) {

      case 'idle': {
        var ddx = pp.x - _dispatcherEntity.x;
        var ddy = pp.y - _dispatcherEntity.y;
        var dispDist = Math.sqrt(ddx * ddx + ddy * ddy);

        if (dispDist <= DISPATCHER_TRIGGER_RANGE) {
          _dispatcherPhase = 'grabbing';

          if (typeof MovementController !== 'undefined' && MovementController.cancelAll) {
            MovementController.cancelAll();
          }

          var className = '';
          if (typeof Player !== 'undefined' && Player.state) {
            className = Player.state().avatarName || Player.state().className || 'Gleaner';
          }
          if (!className) className = 'Gleaner';
          var barkText = 'HEY! ' + className.toUpperCase() + '!';

          if (typeof BarkLibrary !== 'undefined' && BarkLibrary.fire) {
            BarkLibrary.fire('npc.dispatcher.hail', { fallback: barkText });
          } else if (typeof Toast !== 'undefined') {
            Toast.show(barkText, 'warning');
          }

          if (typeof AudioSystem !== 'undefined' && AudioSystem.play) {
            AudioSystem.play('ui-blop', { volume: 0.6, playbackRate: 0.75 });
          }

          var angleToDisp = Math.atan2(
            _dispatcherEntity.y - pp.y,
            _dispatcherEntity.x - pp.x
          );

          var targetDir = (typeof Player !== 'undefined' && Player.radianToDir)
            ? Player.radianToDir(angleToDisp)
            : 0; // DIR_EAST fallback

          if (typeof MovementController !== 'undefined' && MovementController.startTurn) {
            MovementController.startTurn(targetDir);
          }
          if (typeof Player !== 'undefined' && Player.setDir) {
            Player.setDir(targetDir);
          }

          if (typeof MouseLook !== 'undefined' && MouseLook.lockOn) {
            MouseLook.lockOn(0, 0);
          }
          if (typeof Player !== 'undefined' && Player.resetLookOffset) {
            Player.resetLookOffset();
          }

          if (typeof NpcSystem !== 'undefined' && NpcSystem.engageTalk) {
            NpcSystem.engageTalk(_dispatcherEntity);
          }

          if (typeof CinematicCamera !== 'undefined' && CinematicCamera.start) {
            CinematicCamera.start('dispatcher_grab', {
              focusAngle: angleToDisp,
              onMidpoint: function () {
                showDispatcherGateDialog();
              }
            });
          } else {
            showDispatcherGateDialog();
          }

          console.log('[DispatcherChoreography] Encounter triggered — dist=' + dispDist.toFixed(1));
        }
        break;
      }

      case 'grabbing':
        break;

      case 'done':
        break;
    }
  }

  function clearAmbientBarkTimer() {
    if (_ambientBarkTimer !== null) {
      clearInterval(_ambientBarkTimer);
      _ambientBarkTimer = null;
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return Object.freeze({
    init:                    init,
    onArrivePromenade:       onArrivePromenade,
    tick:                    tick,
    findGateDoorPos:         findGateDoorPos,
    clearAmbientBarkTimer:   clearAmbientBarkTimer,
    showDispatcherGateDialog: showDispatcherGateDialog,
    getPhase:                function() { return _dispatcherPhase; },
    getEntity:               function() { return _dispatcherEntity; },
    getSpawnId:              function() { return _dispatcherSpawnId; }
  });
})();
