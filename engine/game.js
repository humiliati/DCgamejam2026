/**
 * Game — thin orchestrator.
 *
 * Wires all engine modules together: init sequence, tick loop,
 * render loop, and inter-module callbacks. Contains NO game logic
 * of its own — every concern is delegated to a focused module:
 *
 *   ScreenManager    — state machine (SPLASH → TITLE → GAMEPLAY → ...)
 *   SplashScreen     — logo display, auto-advance
 *   TitleScreen      — title menu + character creation
 *   GameOverScreen   — death overlay with stats
 *   VictoryScreen    — win overlay with stats
 *   Player           — entity state, stats, direction helpers
 *   FloorManager     — floor gen, caching, biome, contracts
 *   FloorTransition  — SFX-sequenced transition state machine
 *   InputPoll        — movement + action input polling
 *   MouseLook        — free-look offset from mouse/pointer
 *   CombatBridge     — combat, cards, chests, game over
 *
 * The only thing Game owns is the init/tick/render frame and the
 * callback wiring between modules.
 */
var Game = (function () {
  'use strict';

  var MC = MovementController;

  // Frame timing for movement tick (runs in render loop, not game tick)
  var _lastFrameTime = 0;

  // Sprite list reused each frame
  var _sprites = [];

  // Last NPC speech capsule target (for cleanup when dialog closes)
  var _lastSpeechSpriteId = null;

  // Canvas reference (shared by screens)
  var _canvas = null;

  // Whether gameplay systems have been initialized (deferred until first play)
  var _gameplayReady = false;

  // Pending MenuBox context for next pause transition
  var _pendingMenuContext = null;
  var _pendingMenuFace = null;

  // ── Bark / Gate NPC state ─────────────────────────────────────────
  // Tracks whether the Day-1 Dispatcher gate encounter has been resolved.
  // Before resolution the dungeon entrance tiles are logically locked —
  // the Dispatcher NPC is spawned on that tile and blocks movement.
  // After the player retrieves their work keys from home (Floor 1.6)
  // the gate is unlocked and the Dispatcher despawns.

  var _gateUnlocked = false;       // Has the player retrieved their work keys?
  var _dispatcherSpawnId = 'npc_dispatcher_gate';  // Stable entity id

  // ── Ambient bark timer (Floor 1 morning) ─────────────────────────
  // When the player first arrives at Floor 1 (The Promenade) we fire
  // ambient townsperson barks on a loose interval to populate the world
  // with sound while the player navigates toward the dungeon entrance.

  var _ambientBarkTimer = null;

  // Ambient bark interval range (18–28 s, randomised per fire)
  var _AMBIENT_BARK_MIN_MS   = 18000;
  var _AMBIENT_BARK_RANGE_MS = 10000;

  // ── Sprint 2: Floor transition tracking for DayCycle ──────────────
  var _previousFloorId = null;

  // ── Curfew exit guard + home door rest state ──────────────────────
  var _curfewExitConfirmed = false;
  var _homeDoorRestOffered = false;
  var _dayCyclePausedBeforeMenu = false;

  // ── Initialization ─────────────────────────────────────────────────

  function init() {
    _canvas = document.getElementById('view-canvas');

    // ── Phase 1: Core systems (always needed) ──
    LootTables.init();   // Sync-load data/loot-tables.json before floor gen
    TextureAtlas.init();
    UISprites.init();
    if (typeof SpriteSheet !== 'undefined') SpriteSheet.preloadAll();
    if (typeof DoorAnimator !== 'undefined') DoorAnimator.init();
    Skybox.init();
    Raycaster.init(_canvas);
    InputManager.init();
    InputManager.initPointer(_canvas);
    AudioSystem.init();

    // Wire BarkLibrary display function — routes barks to StatusBar tooltip
    // space (bottom footer) for persistent history, with DialogBox fallback
    // for dialog-style barks that need the full conversation UI.
    if (typeof BarkLibrary !== 'undefined') {
      BarkLibrary.setDisplay(function (bark, opts) {
        var style = (opts && opts.style) || bark.style || 'info';
        if (style === 'dialog' && typeof DialogBox !== 'undefined') {
          // Pass speaker and text to DialogBox separately — DialogBox owns
          // the speaker label; do NOT prepend it into the text line.
          DialogBox.show({
            speaker: bark.speaker || '',
            lines:   [bark.text]
          });
        } else if (typeof StatusBar !== 'undefined' && StatusBar.pushTooltip) {
          // Route barks to tooltip footer — persistent, scrollable history.
          var text = bark.speaker
            ? bark.speaker + ': \u201c' + bark.text + '\u201d'
            : bark.text;
          StatusBar.pushTooltip(text, 'npc');
        } else if (typeof Toast !== 'undefined') {
          // Fallback to top-right toast if StatusBar not available.
          var text2 = bark.speaker
            ? bark.speaker + ': ' + bark.text
            : bark.text;
          Toast.show(text2, style === 'dialog' ? 'info' : style);
        }
      });
    }

    // ── Phase 2: Screen system ──
    ScreenManager.init();
    DialogBox.init(_canvas);
    CardFan.init(_canvas);
    MenuBox.init(_canvas);
    SplashScreen.init(_canvas);
    TitleScreen.init(_canvas);
    GameOverScreen.init(_canvas);
    VictoryScreen.init(_canvas);

    // ── Phase 2b: CRT HUD panels ──
    if (typeof DragDrop !== 'undefined') DragDrop.init(_canvas);
    if (typeof DebriefFeed !== 'undefined') DebriefFeed.init();
    if (typeof StatusBar !== 'undefined') {
      StatusBar.init();
      if (StatusBar.setOnFlee) {
        StatusBar.setOnFlee(function () { CombatBridge.flee(); });
      }
    }
    if (typeof QuickBar !== 'undefined') QuickBar.init();
    if (typeof InteractPrompt !== 'undefined') InteractPrompt.init();
    if (typeof DPad !== 'undefined') {
      DPad.init();
      DPad.setOnInteract(function () { _interact(); });
    }

    // ── Phase 3: ScreenManager transition wiring ──
    ScreenManager.onChange(_onScreenChange);

    // ── ESC toggle: pause ↔ gameplay ──
    InputManager.on('pause', function (type) {
      if (type !== 'press') return;

      // PeekSlots intercept: ESC closes slot-filling UI before pause
      if (typeof PeekSlots !== 'undefined' && PeekSlots.isFilling()) {
        PeekSlots.close();
        return;
      }

      // BookshelfPeek intercept: ESC closes book overlay before pause
      if (typeof BookshelfPeek !== 'undefined' && BookshelfPeek.isActive()) {
        BookshelfPeek.handleKey('Escape');
        return;
      }

      var state = ScreenManager.getState();
      if (state === ScreenManager.STATES.GAMEPLAY) {
        _pendingMenuContext = 'pause';
        _pendingMenuFace = 0;
        ScreenManager.toPause();
      } else if (state === ScreenManager.STATES.PAUSE) {
        MenuBox.close(); // onClose callback will resumeGameplay()
      }
    });

    // ── Inventory shortcut (I key) → open pause at face 2 ──────────
    InputManager.on('inventory', function (type) {
      if (type !== 'press') return;
      var state = ScreenManager.getState();
      if (state === ScreenManager.STATES.GAMEPLAY) {
        _pendingMenuContext = 'pause';
        _pendingMenuFace = 2;
        ScreenManager.toPause();
      } else if (state === ScreenManager.STATES.PAUSE) {
        // Already paused — toggle close
        MenuBox.close();
      }
    });

    // ── TAB: toggle focus between bag/deck wheels on Face 2 ─────────
    InputManager.on('tab_focus', function (type) {
      if (type !== 'press') return;
      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 2 && typeof MenuFaces !== 'undefined') {
        MenuFaces.toggleInvFocus();
      }
    });

    // ── MenuBox face rotation during pause ──────────────────────────
    //
    // Per GAME_FLOW_ROADMAP input table:
    //   Q / ←   → rotate left     (strafe_left OR turn_left)
    //   E / →   → rotate right    (strafe_right OR turn_right)
    //
    // Exception — Face 3 (Settings): ← / → adjust the selected slider
    // value instead of rotating the box (Q/E always rotate in all faces).
    // W / S navigate between sliders when Face 3 is active.
    //
    // Strafe (Q/E) — snap to adjacent face, OR scroll inventory wheel on Face 2.
    InputManager.on('strafe_left', function (type) {
      if (type !== 'press' || !ScreenManager.isPaused()) return;
      // Face 2 (Inventory): Q scrolls focused wheel left
      if (MenuBox.getCurrentFace() === 2 && typeof MenuFaces !== 'undefined') {
        MenuFaces.scrollFocused(-1);
        return;
      }
      MenuBox.snapLeft();
    });
    InputManager.on('strafe_right', function (type) {
      if (type !== 'press' || !ScreenManager.isPaused()) return;
      // Face 2 (Inventory): E scrolls focused wheel right
      if (MenuBox.getCurrentFace() === 2 && typeof MenuFaces !== 'undefined') {
        MenuFaces.scrollFocused(+1);
        return;
      }
      MenuBox.snapRight();
    });

    // Turn (A/← and D/→) — snap to adjacent face OR adjust Face 3 slider.
    InputManager.on('turn_left', function (type) {
      if (type !== 'press' || !ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3) {
        // On settings face: ← decrements the selected slider
        if (typeof MenuFaces !== 'undefined') {
          MenuFaces.handleSettingsAdjust(-10);
        }
        return; // Never rotate the box from Face 3 via turn keys
      }
      MenuBox.snapLeft();
    });
    InputManager.on('turn_right', function (type) {
      if (type !== 'press' || !ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3) {
        // On settings face: → increments the selected slider
        if (typeof MenuFaces !== 'undefined') {
          MenuFaces.handleSettingsAdjust(+10);
        }
        return;
      }
      MenuBox.snapRight();
    });

    // W / S — navigate between sliders when Face 3 is active.
    InputManager.on('step_forward', function (type) {
      if (type !== 'press') return;
      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3 && typeof MenuFaces !== 'undefined') {
        MenuFaces.handleSettingsNav(-1);
      }
    });
    InputManager.on('step_back', function (type) {
      if (type !== 'press') return;

      // PeekSlots intercept: S key seals container during FILLING
      if (typeof PeekSlots !== 'undefined' && PeekSlots.isFilling()) {
        PeekSlots.trySeal();
        return;
      }

      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3 && typeof MenuFaces !== 'undefined') {
        MenuFaces.handleSettingsNav(+1);
      }
    });

    // Scroll wheel — Face 3 slider fine-adjust (+1/-1 per tick) or
    // inventory/face content scroll on other faces (post-jam).
    InputManager.on('scroll_up', function (type) {
      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3 && typeof MenuFaces !== 'undefined') {
        MenuFaces.handleSettingsAdjust(+5);
      }
    });
    InputManager.on('scroll_down', function (type) {
      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3 && typeof MenuFaces !== 'undefined') {
        MenuFaces.handleSettingsAdjust(-5);
      }
    });

    // ── Number keys during harvest MenuBox: take loot items ──
    // ── Number keys during shop MenuBox (face 1): buy card slot ──
    // ── Number keys during PeekSlots FILLING: fill slots from bag/hand ──
    for (var _k = 0; _k < 5; _k++) {
      (function (slot) {
        InputManager.on('card_' + slot, function (type) {
          if (type !== 'press') return;

          // PeekSlots intercept: number keys fill container slots during FILLING
          if (typeof PeekSlots !== 'undefined' && PeekSlots.isFilling()) {
            if (typeof CrateUI !== 'undefined') {
              CrateUI.handleKey(String(slot + 1));
            }
            return;
          }

          if (!ScreenManager.isPaused()) return;
          var ctx = MenuBox.getContext();
          if (ctx === 'harvest') {
            _takeHarvestItem(slot);
          } else if (ctx === 'shop' && MenuBox.getCurrentFace() === 1) {
            _shopBuy(slot);
          } else if (ctx === 'shop' && MenuBox.getCurrentFace() === 2) {
            _shopSellFromHand(slot);
          }
        });
      })(_k);
    }

    // ── Pointer click for MenuBox nav buttons (& future LG Remote) ──
    InputManager.on('pointer_click', function (type) {
      if (type !== 'press') return;
      // Combat report takes priority (click-to-dismiss)
      if (typeof CombatReport !== 'undefined' && CombatReport.isVisible()) {
        CombatReport.dismiss();
        return;
      }
      if (ScreenManager.isPaused()) {
        var hit = MenuBox.handlePointerClick();
        if (hit && hit.action) {
          // Dispatch face content click to the correct handler
          if (hit.action === 'harvest') {
            _takeHarvestItem(hit.slot);
          } else if (hit.action === 'buy') {
            _shopBuy(hit.slot);
          } else if (hit.action === 'sell') {
            _shopSellFromHand(hit.slot);
          } else if (hit.action === 'sellPart') {
            _shopSellPart(hit.slot - 400);  // strip offset
          } else if (hit.action === 'equip') {
            _equipFromBag(hit.slot - 200);  // strip offset
          } else if (hit.action === 'unequip') {
            _unequipSlot(hit.slot - 100);   // strip offset
          } else if (hit.action === 'stash') {
            _bagToStash(hit.slot - 300);    // strip offset
          } else if (hit.action === 'unstash') {
            _stashToBag(hit.slot - 400);    // strip offset
          } else if (hit.action === 'hand_to_backup') {
            // Skip if DragDrop just handled a pointer session (prevents click+drag overlap)
            if (typeof DragDrop !== 'undefined' && DragDrop.wasRecentPointerSession(200)) { /* suppressed */ }
            else _handToBackup(hit.slot - 500);
          } else if (hit.action === 'backup_to_hand') {
            if (typeof DragDrop !== 'undefined' && DragDrop.wasRecentPointerSession(200)) { /* suppressed */ }
            else _backupToHand(hit.slot - 600);
          } else if (hit.action === 'bag_scroll_left') {
            if (typeof MenuFaces !== 'undefined') MenuFaces.scrollBag(-1);
          } else if (hit.action === 'bag_scroll_right') {
            if (typeof MenuFaces !== 'undefined') MenuFaces.scrollBag(+1);
          } else if (hit.action === 'deck_scroll_left') {
            if (typeof MenuFaces !== 'undefined') MenuFaces.scrollDeck(-1);
          } else if (hit.action === 'deck_scroll_right') {
            if (typeof MenuFaces !== 'undefined') MenuFaces.scrollDeck(+1);
          } else if (hit.action === 'incinerator') {
            _incinerateFromFocus();
          } else if (hit.action === 'warp' && hit.warpTarget) {
            _warpToFloor(hit.warpTarget);
          }
        }
        return;
      }
      // InteractPrompt click during gameplay — fires _interact()
      if (typeof InteractPrompt !== 'undefined' && InteractPrompt.isVisible()) {
        if (InteractPrompt.handlePointerClick()) {
          _interact();
        }
        return;
      }
      // DialogBox click during gameplay
      if (DialogBox.isOpen()) {
        DialogBox.handlePointerClick();
        return;
      }
      // CardFan click during combat
      if (CardFan.isOpen()) {
        CardFan.handlePointerClick();
        return;
      }
    });

    // ── Enter/Space to advance DialogBox during gameplay ──
    InputManager.on('interact', function (type) {
      if (type !== 'press') return;
      // Dismiss combat report with Enter/Space
      if (typeof CombatReport !== 'undefined' && CombatReport.isVisible()) {
        CombatReport.dismiss();
        return;
      }
      if (!ScreenManager.isPlaying()) return;
      if (DialogBox.isOpen()) {
        DialogBox.advance();
      }
    });

    // ── Phase 4: Start game loop (always running) ──
    _lastFrameTime = performance.now();
    GameLoop.init({
      onTick: _tick,
      onRender: _render,
      tickInterval: 100
    });
    GameLoop.start();

    // ── Phase 5: Begin at splash ──
    SplashScreen.start();

    console.log('[Game] Initialized — starting at SPLASH');
  }

  // ── Screen change handler ─────────────────────────────────────────

  function _onScreenChange(newState, oldState) {
    var S = ScreenManager.STATES;

    if (newState === S.TITLE) {
      TitleScreen.start();
    }

    if (newState === S.GAMEPLAY) {
      // If coming from TITLE (new game), initialize gameplay systems
      if (oldState === S.TITLE || oldState === S.SPLASH) {
        _initGameplay();
      }
      // If coming from GAME_OVER (retry), reset and re-init
      if (oldState === S.GAME_OVER) {
        Player.reset();
        SessionStats.reset();
        _initGameplay();
      }
      // Show HUD, enable mouse look
      _showHUD(true);
      MouseLook.init(_canvas);
    }

    if (newState === S.GAME_OVER) {
      _showHUD(false);
      GameOverScreen.start(SessionStats.get());
    }

    if (newState === S.VICTORY) {
      _showHUD(false);
      VictoryScreen.start(SessionStats.get());
    }

    if (newState === S.PAUSE) {
      // Freeze DayCycle while paused (save pre-pause state to restore on resume)
      if (typeof DayCycle !== 'undefined') {
        _dayCyclePausedBeforeMenu = DayCycle.isPaused();
        DayCycle.setPaused(true);
      }

      // Open MenuBox with context based on what triggered pause
      var menuContext = _pendingMenuContext || 'pause';
      var startFace = _pendingMenuFace || 0;
      _pendingMenuContext = null;
      _pendingMenuFace = null;

      // Reset per-face UI state that shouldn't persist between sessions
      if (typeof MenuFaces !== 'undefined') MenuFaces.resetSettings();

      // Register inventory drag zones when menu opens
      if (typeof MenuFaces !== 'undefined') MenuFaces.registerDragZones();
      if (typeof QuickBar !== 'undefined' && QuickBar.registerDragZones) QuickBar.registerDragZones();
      if (typeof DragDrop !== 'undefined') {
        if (menuContext === 'bonfire') DragDrop.setZoneActive('inv-stash', true);
        if (menuContext === 'shop') DragDrop.setZoneActive('inv-sell', true);
      }

      MenuBox.open(menuContext, {
        startFace: startFace,
        onClose: function () {
          if (typeof Shop !== 'undefined') Shop.close();
          if (typeof MenuFaces !== 'undefined') MenuFaces.unregisterDragZones();
          if (typeof QuickBar !== 'undefined' && QuickBar.unregisterDragZones) QuickBar.unregisterDragZones();
          ScreenManager.resumeGameplay();
        }
      });
    }

    if (oldState === S.PAUSE && newState === S.GAMEPLAY) {
      // Restore DayCycle to its pre-pause state (respects interior time-freeze)
      if (typeof DayCycle !== 'undefined') {
        DayCycle.setPaused(_dayCyclePausedBeforeMenu);
      }

      // MenuBox handles its own fold-down via onClose callback.
      // Only force-close if it's still fully open (not already folding).
      if (MenuBox.isFullyOpen()) MenuBox.close();

      // Clean up harvest staging if leaving harvest context
      if (typeof Salvage !== 'undefined' && Salvage.getStagedCorpse()) {
        // If all loot was taken, clear the corpse tile
        if (Salvage.getStagedLoot().length === 0) {
          var corpse = Salvage.getStagedCorpse();
          if (corpse) {
            var fd = FloorManager.getFloorData();
            if (fd && fd.grid[corpse.y]) {
              fd.grid[corpse.y][corpse.x] = TILES.EMPTY;
            }
          }
        }
        Salvage.closeLoot();
      }
    }
  }

  // ── Deferred gameplay init ────────────────────────────────────────

  function _initGameplay() {
    // Only init gameplay-specific modules once (or re-init on retry)
    Minimap.init(document.getElementById('minimap'));
    HUD.init();
    CardSystem.init();
    MouseLook.init(_canvas);

    // Combat bridge
    CombatBridge.init({
      onGameOver: function () {
        ScreenManager.toGameOver();
      }
    });
    if (typeof CombatFX !== 'undefined') CombatFX.init();

    // Hazard system (environmental damage + bonfire respawn)
    HazardSystem.init({
      onGameOver: function () {
        ScreenManager.toGameOver();
      }
    });
    HazardSystem.clearBonfires();

    // ── Sprint 2: Death → home rescue (replaces bonfire respawn + game over) ──
    if (HazardSystem.setOnDeathRescue) {
      HazardSystem.setOnDeathRescue(function (info) {
        console.log('[Game] Death rescue from ' + info.floorId + ' (depth ' + info.depth + ')');

        // Mirror debuffs into StatusEffect for HUD display
        if (typeof StatusEffect !== 'undefined') {
          StatusEffect.apply('GROGGY', 1);
          StatusEffect.apply('SORE', 1);
          StatusEffect.apply('HUMILIATED', 1);
          if (info.depth >= 3) {
            StatusEffect.apply('SHAKEN', 2);
          }
          // Clear TIRED — superseded by worse state
          StatusEffect.remove('TIRED', 'manual');
        }

        // Show narrative Toast
        if (typeof Toast !== 'undefined') {
          if (info.depth >= 3) {
            Toast.show('\uD83D\uDECF The heroes carried you home. You owe them one.', 'warning');
          } else {
            Toast.show('\uD83D\uDECF You stumbled home battered. Rest up, Gleaner.', 'warning');
          }
        }

        // Close any open peek/crate UI before rescue transition
        if (typeof PeekSlots !== 'undefined' && PeekSlots.isOpen()) PeekSlots.close();

        // Transition to home floor after a brief delay (let combat log sink in)
        setTimeout(function () {
          FloorTransition.go('1.6', 'retreat');
        }, 800);
      });
    }

    // Interact prompt + door/crate/chest/puzzle peek
    InteractPrompt.init();
    if (typeof DoorPeek        !== 'undefined') DoorPeek.init();
    if (typeof LockedDoorPeek !== 'undefined') LockedDoorPeek.init();
    if (typeof CratePeek      !== 'undefined') CratePeek.init();
    if (typeof ChestPeek     !== 'undefined') ChestPeek.init();
    if (typeof CorpsePeek    !== 'undefined') CorpsePeek.init();
    if (typeof MerchantPeek  !== 'undefined') MerchantPeek.init();
    if (typeof PuzzlePeek    !== 'undefined') PuzzlePeek.init();
    if (typeof BookshelfPeek !== 'undefined') BookshelfPeek.init();
    if (typeof BarCounterPeek !== 'undefined') BarCounterPeek.init();
    if (typeof BedPeek !== 'undefined') BedPeek.init();
    if (typeof MailboxPeek !== 'undefined') MailboxPeek.init();

    // Enemy sprite stage system
    if (typeof EnemySprites !== 'undefined') EnemySprites.initDefaults();

    // Load enemy population tables from enemies.json
    if (typeof EnemyAI !== 'undefined' && EnemyAI.loadPopulation) EnemyAI.loadPopulation();

    // StatusEffect system — buff/debuff registry (before DayCycle so callbacks can use it)
    if (typeof StatusEffect !== 'undefined') StatusEffect.init();
    if (typeof StatusEffectHUD !== 'undefined') StatusEffectHUD.init();

    // Day/night cycle — game starts at dawn on Hero Day (day 0)
    if (typeof DayCycle !== 'undefined') {
      DayCycle.init();

      // Register night-locked buildings (closed at dusk/night, muffled barks)
      DayCycle.registerNightLock('1.1', { muffledBarkPool: 'muffled.bazaar' });   // Coral Bazaar
      DayCycle.registerNightLock('1.2', { muffledBarkPool: 'muffled.inn' });      // Driftwood Inn
      DayCycle.registerNightLock('1.6', { muffledBarkPool: 'muffled.house' });    // Gleaner's Home (late night)
      DayCycle.registerNightLock('2.1', { muffledBarkPool: 'muffled.guild' });    // Dispatcher's Office

      // Phase change notifications + HUD day counter refresh
      DayCycle.setOnPhaseChange(function (newPhase, oldPhase) {
        if (newPhase === 'dusk' && typeof BarkLibrary !== 'undefined') {
          BarkLibrary.fire('system.curfew_warning');
        }
        if (newPhase === 'dawn' && typeof BarkLibrary !== 'undefined') {
          BarkLibrary.fire('system.new_day');
        }
        _updateDayCounter();
      });

      DayCycle.setOnDayChange(function (newDay) {
        _updateDayCounter();

        // Tick StatusEffect durations, show expiry/transition Toasts
        if (typeof StatusEffect !== 'undefined') {
          var result = StatusEffect.tickDay();
          for (var ei = 0; ei < result.expired.length; ei++) {
            var expDef = StatusEffect.getDef(result.expired[ei]);
            if (expDef && typeof Toast !== 'undefined') {
              Toast.show(expDef.emoji + ' ' + expDef.label + ' wore off.', 'dim');
            }
          }
          for (var ti = 0; ti < result.transitioned.length; ti++) {
            var toDef = StatusEffect.getDef(result.transitioned[ti].to);
            if (toDef && typeof Toast !== 'undefined') {
              Toast.show(toDef.emoji + ' ' + toDef.label + ' kicked in.', 'warning');
            }
          }
        }

        // Legacy Player.tickDebuffs fallback (for SHAKEN etc. not yet migrated)
        if (typeof Player !== 'undefined' && Player.tickDebuffs) {
          Player.tickDebuffs();
        }
      });

      // ── Tired trigger at 21:00 — warning + WELL_RESTED→TIRED transition ──
      DayCycle.setOnTired(function (day) {
        console.log('[Game] Tired trigger at 21:00 on day ' + day);

        // Transition WELL_RESTED → TIRED (paired effect)
        if (typeof StatusEffect !== 'undefined') {
          if (StatusEffect.has('WELL_RESTED')) {
            StatusEffect.transition('WELL_RESTED');
          } else {
            // No WELL_RESTED active — just apply TIRED directly
            StatusEffect.apply('TIRED');
          }
        }

        // Wolf howl SFX (exterior floors) or biome-specific (dungeon)
        var currentFloor = FloorManager.getFloor();
        var depth = currentFloor ? currentFloor.split('.').length : 1;
        if (depth === 1) {
          AudioSystem.play('wolf-howl', { volume: 0.5 });
        } else if (depth >= 3) {
          AudioSystem.play('dungeon-creak', { volume: 0.4 });
        }

        if (typeof Toast !== 'undefined') {
          Toast.show('\uD83C\uDF19 Getting late... head home, Gleaner.', 'warning');
        }

        _updateDayCounter();
      });

      // ── Curfew collapse at 02:00 — forced home, penalties ──
      DayCycle.setOnCurfew(function (day) {
        console.log('[Game] Curfew collapse at 02:00 on day ' + day);

        var currentFloor = FloorManager.getFloor();
        var depth = currentFloor ? currentFloor.split('.').length : 1;

        // Apply curfew debuffs via StatusEffect
        if (typeof StatusEffect !== 'undefined') {
          StatusEffect.apply('GROGGY', 1);
          StatusEffect.apply('SORE', 1);
          // Clear TIRED — it's been superseded by worse debuffs
          StatusEffect.remove('TIRED', 'manual');
        }

        // Currency penalty (25%)
        if (typeof Player !== 'undefined') {
          var penalty = Math.floor(Player.state().currency * 0.25);
          if (penalty > 0) {
            Player.state().currency -= penalty;
            if (typeof Toast !== 'undefined') {
              Toast.show('\uD83D\uDCB0 -' + penalty + 'g lost in the dark', 'currency');
            }
          }
        }

        // Card confiscation on lethal floors (depth 3+)
        if (depth >= 3 && typeof CardSystem !== 'undefined') {
          var hand = CardSystem.getHand();
          if (hand.length > 0) {
            var confiscateIdx = Math.floor(Math.random() * hand.length);
            var taken = CardSystem.playFromHand(confiscateIdx);
            if (taken && typeof Toast !== 'undefined') {
              var cardName = taken.name || taken.id || 'a card';
              Toast.show('\uD83C\uDCCF The hero pocketed your ' + cardName + '. Fair trade for your life.', 'legendary');
            }
          }
        }

        // Show narrative
        if (typeof Toast !== 'undefined') {
          if (depth >= 3) {
            Toast.show('\u2694\uFE0F The hero dragged you out \u2014 you\'re welcome.', 'warning');
          } else {
            Toast.show('\uD83C\uDF19 You collapsed in the street...', 'warning');
          }
        }

        // Close any open peek/crate UI before curfew transition
        if (typeof PeekSlots !== 'undefined' && PeekSlots.isOpen()) PeekSlots.close();

        // Forced transition to home + sleep
        setTimeout(function () {
          if (typeof TransitionFX !== 'undefined') {
            TransitionFX.begin({
              type: 'descend',
              duration: 1200,
              label: 'Passing out...',
              onMidpoint: function () {
                // Advance time to next morning
                if (typeof DayCycle !== 'undefined') {
                  DayCycle.setPaused(false);
                  DayCycle.advanceTime(DayCycle.ADVANCE.REST);
                }
                if (typeof Player !== 'undefined') Player.fullRestore();
                FloorManager.setFloor('1.6');
                FloorManager.generateCurrentFloor();
              },
              onComplete: function () {
                _updateDayCounter();
                if (typeof Toast !== 'undefined') {
                  Toast.show('\u2615 You wake up groggy. Don\'t make a habit of this.', 'info');
                }
              }
            });
          }
        }, 600);
      });
    }

    // HUD day/cycle counter
    _initDayCounter();

    // Hero system — abstract Hero Day carnage + scripted encounters
    if (typeof HeroSystem !== 'undefined') {
      HeroSystem.init();

      // Wire DayCycle Hero Day callback
      if (typeof DayCycle !== 'undefined') {
        DayCycle.setOnHeroDayStart(function (dayNum) {
          HeroSystem.onHeroDayStart(dayNum);
        });
      }
    }

    // ── BedPeek → overnight hero run → mailbox report pipeline ──
    if (typeof BedPeek !== 'undefined') {
      BedPeek.setOnHeroDayRun(function (dayNum) {
        // Execute overnight hero run and generate mailbox report
        _executeOvernightHeroRun(dayNum);
      });
      BedPeek.setOnWake(function (dayNum) {
        // Update HUD day counter on wake
        _updateDayCounter();
        // Fire Hero Day dawn barks if applicable
        if (typeof DayCycle !== 'undefined' && DayCycle.isHeroDay()) {
          if (typeof BarkLibrary !== 'undefined') {
            setTimeout(function () {
              BarkLibrary.fire('system.heroday_dawn');
            }, 800);
          }
          if (typeof Toast !== 'undefined') {
            Toast.show('\u2694\uFE0F HERO DAY \u2014 Heroes are in the dungeons!', 'legendary');
          }
        }
        // Notify if mailbox has unread reports
        if (typeof MailboxPeek !== 'undefined' && MailboxPeek.hasUnread()) {
          setTimeout(function () {
            if (typeof Toast !== 'undefined') {
              Toast.show('\uD83D\uDCEC You have mail! Check your mailbox.', 'info');
            }
          }, 1500);
        }
      });
    }

    // NPC system — register built-in populations (bark pools loaded at Layer 5)
    if (typeof NpcSystem !== 'undefined') NpcSystem.init();

    // ── Register NPC dialogue trees (Morrowind-style) ──────────────
    if (typeof NpcSystem !== 'undefined') {
      // Ren — veteran Gleaner at Dispatcher's Office (Floor 2.1)
      NpcSystem.registerTree('dispatch_veteran', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Another new face. You look green. What do you need?',
            choices: [
              { label: 'Tips for the dungeon', next: 'tips' },
              { label: 'What\'s your story?', next: 'backstory' },
              { label: 'Just passing through', next: null }
            ]
          },
          tips: {
            text: 'Clean inward from the entrance. Arm traps and webs on your way out. That way you never walk through your own work. Sounds obvious, but you\'d be surprised how many rookies forget.',
            choices: [
              { label: 'What about the Hero?', next: 'hero_warn' },
              { label: 'Thanks', next: null }
            ]
          },
          hero_warn: {
            text: 'Don\'t get in the Hero\'s way. They move fast, hit hard, and they don\'t distinguish between monsters and bystanders. Your job is the mess they leave behind. Nothing more.',
            choices: [
              { label: 'That doesn\'t seem right', next: 'doubt' },
              { label: 'Understood', next: null }
            ]
          },
          doubt: {
            text: 'Right and wrong don\'t pay the bills, kid. But... yeah. Keep your eyes open down there. Some of us have noticed things that don\'t add up.',
            choices: [
              { label: 'Like what?', next: 'conspiracy_hint' },
              { label: 'I\'ll be careful', next: null }
            ]
          },
          conspiracy_hint: {
            text: 'The corpses on the deep floors. The way the Hero targets specific chambers. The scale fragments that Foundry buys at premium... Ask yourself who benefits from forty years of hero cycles.',
            choices: [
              { label: '...', next: null }
            ]
          },
          backstory: {
            text: 'Twelve years cleaning dungeons. Started same as you — green, underpaid, and convinced the Hero was on our side. Experience teaches you to look closer.',
            choices: [
              { label: 'Tips for the dungeon', next: 'tips' },
              { label: 'Take care', next: null }
            ]
          }
        }
      });

      // Sable — guild clerk at Dispatcher's Office
      NpcSystem.registerTree('dispatch_clerk', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Welcome to the Guild office. Need something?',
            choices: [
              { label: 'Check contracts', next: 'contracts' },
              { label: 'Where\'s the supply closet?', next: 'supplies' },
              { label: 'Who runs this place?', next: 'dispatcher_info' },
              { label: 'Bye', next: null }
            ]
          },
          contracts: {
            text: 'Board\'s on the wall. Red pins are overdue, blue are standard, gold are bonus objectives. Readiness targets are listed per floor. Hit the target before hero day or the payout drops.',
            choices: [
              { label: 'What\'s the best-paying contract?', next: 'best_contract' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          best_contract: {
            text: 'Hero\'s Wake cleanup. But nobody wants it — the deep floors are rough and the Hero leaves behind... well. You\'ll see for yourself.',
            choices: [
              { label: 'I\'ll take it', next: 'brave' },
              { label: 'Maybe later', next: null }
            ]
          },
          brave: {
            text: 'Bold. Check in with the Watchman at Floor 2.2 before heading down. And file your readiness report when you come back up. If you come back up.',
            choices: [
              { label: '...cheerful', next: null }
            ]
          },
          supplies: {
            text: 'Northwest corner. Rags are free, trap kits cost 5g each. Mops and brushes are on the shelf — take what you need. Just sign the ledger.',
            choices: [
              { label: 'Back', next: 'greeting' }
            ]
          },
          dispatcher_info: {
            text: 'The Dispatcher handles all Gleaner assignments for this district. Former field operative — did twenty years in the deep floors before moving to admin. Don\'t let the desk fool you.',
            choices: [
              { label: 'Back', next: 'greeting' }
            ]
          }
        }
      });

      // Pip — rookie Gleaner
      NpcSystem.registerTree('dispatch_rookie', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Oh! Hi! You\'re the other new Gleaner, right? I\'m Pip. First week.',
            choices: [
              { label: 'How\'s it going?', next: 'howsitgoing' },
              { label: 'Any advice?', next: 'advice' },
              { label: 'Good luck', next: null }
            ]
          },
          howsitgoing: {
            text: 'Honestly? The mop handle has blisters. The food is bad. And the veteran keeps telling me stories about things in the deep floors. But the pay is okay and... I don\'t know, there\'s something satisfying about it.',
            choices: [
              { label: 'Something satisfying?', next: 'satisfying' },
              { label: 'Hang in there', next: null }
            ]
          },
          satisfying: {
            text: 'Fixing things. Making order out of chaos. The heroes charge through and break everything, and we put it back together. Maybe that\'s more important than anyone gives us credit for.',
            choices: [
              { label: 'Maybe it is', next: null }
            ]
          },
          advice: {
            text: 'I\'ve only been here a week, so take this with a grain of salt — but the old-timers say: don\'t skip the cobweb spots. Even if they seem pointless. The readiness bonus adds up.',
            choices: [
              { label: 'Thanks Pip', next: null }
            ]
          }
        }
      });

      // The Watchman — Floor 2.2 (shaken NPC guarding dungeon entrance)
      NpcSystem.registerTree('watchpost_watchman', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: '...you here for the Wake? Go ahead. Door\'s open. Just... watch yourself.',
            choices: [
              { label: 'What happened down there?', next: 'whathappened' },
              { label: 'Are you okay?', next: 'okay' },
              { label: 'Thanks', next: null }
            ]
          },
          whathappened: {
            text: 'The Hero came through. Same as always. But this time... the sounds were different. Not fighting sounds. Something else. Something that stopped. All at once.',
            choices: [
              { label: 'Stopped?', next: 'stopped' },
              { label: 'I\'ll be careful', next: null }
            ]
          },
          stopped: {
            text: 'The deep floors used to have a... hum. Faint. You get used to it. After the Hero went through, it stopped. First time in the eighteen years I\'ve been posted here.',
            choices: [
              { label: 'A hum?', next: 'hum' },
              { label: '...', next: null }
            ]
          },
          hum: {
            text: 'Like something breathing. Or singing very quietly. The old records call it the Resonance. I thought it was just the plumbing. Now I\'m not sure.',
            choices: [
              { label: 'The Resonance', next: null }
            ]
          },
          okay: {
            text: 'I\'m fine. Just tired. Eighteen years watching a door. Counting people in, counting them out. The numbers don\'t always match. You learn to stop asking why.',
            choices: [
              { label: 'The numbers don\'t match?', next: 'numbers' },
              { label: 'Take care of yourself', next: null }
            ]
          },
          numbers: {
            text: 'More go in than come out. That\'s normal — some use the back exits, some get extracted by the Guild. But lately... the margin is wider. And nobody wants to talk about it.',
            choices: [
              { label: '...', next: null }
            ]
          }
        }
      });

      // ── Interior resident dialogue trees ─────────────────────────
      // "Get out of my house" pattern — annoyed → angry escalation.
      // Repeated visits push to angrier nodes.

      // Innkeeper Marlo — Driftwood Inn (1.2)
      NpcSystem.registerTree('inn_keeper', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Welcome to the Driftwood. Room or a meal?',
            choices: [
              { label: 'What\'s on the menu?', next: 'menu' },
              { label: 'A room for the night', next: 'room' },
              { label: 'Heard any rumors?', next: 'rumors' },
              { label: 'Just browsing', next: null }
            ]
          },
          menu: {
            text: 'Seaweed stew, bread, and whatever the Cellar coughed up this morning. The stew is medicinal. The bread is not.',
            choices: [
              { label: 'I\'ll have the stew', next: 'buy_stew' },
              { label: 'No thanks', next: 'greeting' }
            ]
          },
          buy_stew: {
            text: 'Five gold. Heals what ails you. Mostly.',
            choices: [
              { label: 'Buy stew (-5g)', next: 'stew_bought', effect: { currency: -5, heal: 3 } },
              { label: 'Too rich for me', next: 'greeting' }
            ]
          },
          stew_bought: {
            text: 'Good choice. Take a seat anywhere — except table three. That\'s reserved for the Hero. Don\'t ask.',
            choices: [
              { label: 'Thanks', next: null }
            ]
          },
          room: {
            text: 'Rooms are upstairs but they\'re booked solid through hero day. Heroes get priority. Gleaners get the cot in the corner if you\'re desperate.',
            choices: [
              { label: 'The cot is fine', next: 'cot' },
              { label: 'Never mind', next: null }
            ]
          },
          cot: {
            text: 'It\'s three gold for the cot. Blanket\'s extra.',
            choices: [
              { label: 'Rest (-3g)', next: 'rested', effect: { currency: -3, heal: 5 } },
              { label: 'Pass', next: null }
            ]
          },
          rested: {
            text: 'Sleep well. I\'ll wake you at dawn. Or whenever the Hero starts breaking things, whichever comes first.',
            choices: [
              { label: 'Thanks', next: null }
            ]
          },
          rumors: {
            text: 'Rumors? This is an inn, not a spy network. But since you\'re buying...',
            choices: [
              { label: 'I\'m buying', next: 'rumor_detail' },
              { label: 'Forget it', next: null }
            ]
          },
          rumor_detail: {
            text: 'The Watchman at 2.2 hasn\'t slept in three days. The Hero this cycle isn\'t normal — goes straight to the deep floors, skips everything above. And someone from the Tide Council was asking about old maps.',
            choices: [
              { label: 'Old maps?', next: 'maps' },
              { label: 'Interesting. Thanks.', next: null }
            ]
          },
          maps: {
            text: 'Cave system maps from before the Compact. Pre-hero era. I\'m not supposed to know that, and you\'re definitely not supposed to know that. Enjoy your meal.',
            choices: [
              { label: '...', next: null }
            ]
          }
        }
      });

      // Grumpy Patron — "get out" escalation tree
      NpcSystem.registerTree('inn_patron_grumpy', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'What? I\'m eating. Go clean something.',
            choices: [
              { label: 'Sorry to bother you', next: 'apologize' },
              { label: 'Nice to meet you too', next: 'sarcasm' },
              { label: 'Leave', next: null }
            ]
          },
          apologize: {
            text: 'Hmph. You Gleaners are always poking around where you don\'t belong. There\'s nothing here for you. The dungeon is that way.',
            choices: [
              { label: 'You seem upset', next: 'upset' },
              { label: 'Right. Sorry.', next: null }
            ]
          },
          sarcasm: {
            text: 'Oh, a comedian. Great. Just what this town needs — another wise-guy with a mop. Get lost before I call the Admiralty.',
            choices: [
              { label: 'Easy. I\'m going.', next: null },
              { label: 'What\'s your problem?', next: 'problem' }
            ]
          },
          upset: {
            text: 'Upset? My cellar is full of hero damage, my walls smell like smoke, and now a stranger is standing over my lunch asking about my feelings. Yes. I\'m upset.',
            choices: [
              { label: 'I can help with the cellar', next: 'offer_help' },
              { label: 'Fair enough', next: null }
            ]
          },
          problem: {
            text: 'My PROBLEM is that every cycle, heroes smash through this town like it\'s made of cardboard, and the rest of us are supposed to smile and say thank you. Now get out of my face.',
            choices: [
              { label: 'You\'re not wrong', next: 'notwrong' },
              { label: 'Leaving now', next: null }
            ]
          },
          offer_help: {
            text: '...you can fix cellar damage? Huh. Most Gleaners only work Guild contracts. Maybe you\'re different.',
            choices: [
              { label: 'Maybe I am', next: null }
            ]
          },
          notwrong: {
            text: '...no. I\'m not. But saying it out loud doesn\'t fix anything either. Go on. Do your job. At least someone\'s cleaning up.',
            choices: [
              { label: 'Take care', next: null }
            ]
          }
        }
      });

      // Cellar Owner — Floor 1.3 (nervous, defensive)
      NpcSystem.registerTree('cellar_resident', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Oh! You startled me. Are you from the Guild? Please tell me you\'re from the Guild.',
            choices: [
              { label: 'I\'m a Gleaner, yes', next: 'relief' },
              { label: 'What\'s wrong?', next: 'whats_wrong' },
              { label: 'Just passing through', next: 'passing' }
            ]
          },
          relief: {
            text: 'Thank goodness. The cellar below... something happened. After the last hero party came through. I sealed the door but there are sounds. Please, if you\'re going down, be careful.',
            choices: [
              { label: 'What kind of sounds?', next: 'sounds' },
              { label: 'I\'ll handle it', next: null }
            ]
          },
          whats_wrong: {
            text: 'The cellar! My cellar! The hero party tore through it like a storm. Traps triggered, walls scorched, crates smashed. And now there are... noises. From below.',
            choices: [
              { label: 'I\'ll clean it up', next: 'relief' },
              { label: 'Noises?', next: 'sounds' }
            ]
          },
          sounds: {
            text: 'Scraping. Like stone on stone. And sometimes... a low hum. The old folks say the cellars connect to something deeper. Something the Compact was supposed to protect.',
            choices: [
              { label: 'The Compact', next: 'compact' },
              { label: 'I\'ll check it out', next: null }
            ]
          },
          compact: {
            text: 'The Dragon Compact. Old treaty between the town founders and... well, nobody reads it anymore. The Tide Council has the original. Ask them if you\'re curious. I just want my cellar back.',
            choices: [
              { label: 'I\'ll do what I can', next: null }
            ]
          },
          passing: {
            text: 'Just — please don\'t touch anything. And close the cellar door behind you if you go down. I don\'t want whatever\'s down there coming up here.',
            choices: [
              { label: 'Understood', next: null }
            ]
          }
        }
      });
    }

    // NCH widget (draggable card-hand capsule)
    if (typeof NchWidget !== 'undefined') NchWidget.init();

    // Combat report overlay
    if (typeof CombatReport !== 'undefined') CombatReport.init();

    // Minimap click-to-move pathfinding
    if (typeof MinimapNav !== 'undefined') {
      MinimapNav.init({
        onArrived: function () {
          if (typeof StatusBar !== 'undefined' && StatusBar.pushTooltip) {
            StatusBar.pushTooltip('Arrived.', 'system');
          }
        },
        onCancelled: function () {
          if (typeof StatusBar !== 'undefined' && StatusBar.pushTooltip) {
            StatusBar.pushTooltip('Path cancelled.', 'system');
          }
        }
      });
    }

    // MenuBox face renderers
    MenuFaces.registerAll();

    // Floor transition callbacks
    FloorTransition.setCallbacks({
      onBefore: function () {
        MC.cancelAll();
        _previousFloorId = FloorManager.getFloor();
      },
      onAfter: function () {
        // Reset per-floor ground items, breakables, and shop cache on every floor change
        WorldItems.init();
        if (typeof BreakableSpawner !== 'undefined') BreakableSpawner.init();
        if (typeof Shop !== 'undefined') Shop.reset();
        if (typeof DeathAnim !== 'undefined') DeathAnim.clear();

        // Re-wire MC callbacks — generateCurrentFloor() inits MC with null
        // callbacks (comment: "Wired by Game orchestrator"). This is where
        // the orchestrator fulfils that contract after every transition.
        var pos = MC.getGridPos();
        MC.init({
          x: pos.x,
          y: pos.y,
          dir: pos.dir,
          collisionCheck: FloorManager.getCollisionCheck(),
          onMoveStart: _onMoveStart,
          onMoveFinish: _onMoveFinish,
          onBump: _onBump,
          onTurnFinish: _onTurnFinish
        });

        // Refresh HUD + panels for the new floor
        HUD.updateFloor(FloorManager.getFloor());
        HUD.updatePlayer(Player.state());
        if (typeof StatusBar !== 'undefined') {
          StatusBar.updateFloor(FloorManager.getFloor(), FloorManager.getBiomeName ? FloorManager.getBiomeName() : '');
        }
        _refreshPanels();
        console.log('[Game] Floor transition complete — MC callbacks re-wired, floor ' + FloorManager.getFloor());

        // ── Sprint 2: DayCycle time advancement + interior time-freeze ──
        if (typeof DayCycle !== 'undefined' && _previousFloorId) {
          var currentFloor = FloorManager.getFloor();
          DayCycle.onFloorTransition(_previousFloorId, currentFloor);

          // Interior time-freeze: pause clock on depth-2 floors, resume otherwise
          var curDepth = currentFloor.split('.').length;
          DayCycle.setPaused(curDepth === 2);
        }

        // Per-floor arrival hooks (ambient barks, NPC spawns, gate logic)
        _onFloorArrive(FloorManager.getFloor());
      }
    });

    // Initialize starting floor — Floor 0 (exterior approach)
    var startFloorId = '0';
    FloorManager.setFloor(startFloorId);
    Minimap.pushFloor(startFloorId);
    Minimap.enterFloor(startFloorId, 'The Approach');

    // Generate Floor 0 and wire movement callbacks
    _generateAndWire();

    // Draw initial card hand
    CardSystem.drawHand();
    HUD.updateCards(CardSystem.getHand());
    var _initHand = CardSystem.getHand();
    if (_initHand.length > 0 && typeof Toast !== 'undefined') {
      Toast.show('\uD83C\uDCA0 Drew ' + _initHand.length + ' cards', 'dim');
    }

    // Start intro auto-walk sequence on Floor 0
    _startIntroWalk();

    // Wire input polling
    InputPoll.init({
      isBlocked: function () {
        return !ScreenManager.isPlaying() ||
               CombatEngine.isActive() ||
               CombatBridge.isPending() ||
               FloorTransition.isTransitioning() ||
               DialogBox.moveLocked() ||
               (typeof StatusBar !== 'undefined' && StatusBar.isDialogueActive && StatusBar.isDialogueActive()) ||
               (typeof IntroWalk !== 'undefined' && IntroWalk.isActive()) ||
               (typeof PeekSlots !== 'undefined' && PeekSlots.isOpen());
      },
      onInteract: _interact,
      onDescend:  function () { FloorTransition.tryStairs('down'); },
      onAscend:   function () { FloorTransition.tryStairs('up'); },
      onMapToggle: function () { Minimap.toggle(); },
      onCard:     function (idx) { CombatBridge.playCard(idx); },
      onFlee:     function () { CombatBridge.flee(); }
    });

    // Card slot click handlers
    for (var i = 0; i < 5; i++) {
      (function (idx) {
        var el = document.getElementById('card-' + idx);
        if (el) {
          el.addEventListener('click', function () { CombatBridge.playCard(idx); });
        }
      })(i);
    }

    // Reset salvage state for new run
    if (typeof Salvage !== 'undefined') Salvage.reset();

    // Reset walk-over ground items for new run
    WorldItems.init();

    // Reset stats for new run
    SessionStats.reset();

    _gameplayReady = true;
    console.log('[Game] Gameplay initialized — WASD to move, Q/E turn, 1-5 for cards');
  }

  // ── HUD visibility ────────────────────────────────────────────────

  function _showHUD(visible) {
    var display = visible ? '' : 'none';
    var minimapFrame = document.getElementById('minimap-frame');
    var cardTray = document.getElementById('card-tray');

    // Minimap frame is always visible during gameplay (embedded mode)
    if (minimapFrame) minimapFrame.style.display = display;
    if (cardTray) cardTray.style.display = visible ? 'flex' : 'none';

    // Phase 2 CRT panels
    if (typeof DebriefFeed !== 'undefined') {
      if (visible) DebriefFeed.show(); else DebriefFeed.hide();
    }
    if (typeof StatusBar !== 'undefined') {
      if (visible) StatusBar.show(); else StatusBar.hide();
    }
    if (typeof QuickBar !== 'undefined') {
      if (visible) QuickBar.show(); else QuickBar.hide();
    }
    if (typeof NchWidget !== 'undefined') {
      if (visible) NchWidget.show(); else NchWidget.hide();
    }
    if (typeof DPad !== 'undefined') {
      if (visible) DPad.show(); else DPad.hide();
    }
  }

  // ── Phase 2 panel refresh helper ────────────────────────────────────

  function _refreshPanels() {
    if (typeof DebriefFeed !== 'undefined') DebriefFeed.refresh();
    if (typeof StatusBar !== 'undefined') StatusBar.refresh();
    if (typeof QuickBar !== 'undefined') QuickBar.refresh();
    if (typeof NchWidget !== 'undefined') NchWidget.refresh();
  }

  // ── Intro auto-walk sequence ──────────────────────────────────────
  //
  // After avatar selection, player spawns on Floor 0 exterior (9,13)
  // facing north. Auto-walk through the courtyard, past the bonfire,
  // up to the building facade. Then auto-trigger DOOR interaction at
  // (9,6) → depth 1→2 transition into the Entry Lobby (Floor 1).
  //
  // Player gets free movement inside the lobby. They find STAIRS_DN
  // to descend into the dungeon (depth 2→3, Floor 2+).
  //
  // Path: (9,13) → 6 steps north to (9,7) — one tile south of DOOR
  // Auto-interact DOOR at (9,6) → "Entering..." → Floor 1 lobby.

  function _startIntroWalk() {
    if (typeof IntroWalk === 'undefined') return;

    // 6 steps north: (9,13) → (9,7), one tile south of the building DOOR
    var steps = [];
    for (var i = 0; i < 6; i++) {
      steps.push({ action: 'forward', delay: 550 });
    }

    IntroWalk.start({
      steps: steps,
      startDelay: 1200,  // Let player see the exterior courtyard
      onComplete: function () {
        // Player is at (9, 7) facing north — DOOR at (9, 6)
        // Trigger depth 1→2 door transition to Entry Lobby
        //
        // IMPORTANT: Call go() synchronously — no setTimeout. IntroWalk
        // sets _active=false before calling onComplete, which unblocks
        // InputPoll. If we delay with setTimeout, the very next frame
        // can poll input, see the player facing a door, and trigger a
        // manual tryInteractDoor that races with our scripted go().
        // Calling go() here sets _transitioning=true before any frame
        // has a chance to poll, closing the race window.
        console.log('[Game] Intro walk complete — entering building');

        // Start door animation (visual: door opens before fade)
        if (typeof DoorAnimator !== 'undefined') {
          DoorAnimator.start(9, 6, TILES.DOOR, 'advance', '0', '1');
        }

        DoorContracts.setContract({ x: 9, y: 6 }, 'advance', TILES.DOOR);
        FloorTransition.go('1', 'advance');
      }
    });
  }

  // ── Floor arrival hooks ────────────────────────────────────────────
  //
  // Called by the FloorTransition onAfter callback whenever the player
  // lands on a new floor. Responsible for:
  //   - Starting ambient bark timers on exterior floors
  //   - Spawning the Dispatcher gate NPC on Floor 1 (pre-gate-unlock)
  //   - Triggering the key-retrieval flow when player arrives at Floor 1.6

  function _onFloorArrive(floorId) {
    // Interrupt any active tooltip dialogue (floor change = conversation over)
    if (typeof StatusBar !== 'undefined' && StatusBar.clearDialogue) {
      StatusBar.clearDialogue();
    }

    // Cancel any running ambient bark timer from the previous floor
    if (_ambientBarkTimer !== null) {
      clearInterval(_ambientBarkTimer);
      _ambientBarkTimer = null;
    }

    // C6: Reshuffle deck on floor transition — fresh hand for each floor.
    // Only reshuffle when entering dungeons (depth 3+) to keep town safe.
    var depth = floorId.split('.').length;
    if (typeof CardSystem !== 'undefined' && depth >= 3) {
      CardSystem.resetDeck();
      CardSystem.drawHand();
      if (typeof Toast !== 'undefined') {
        Toast.show('\u267B\uFE0F Deck reshuffled \u2014 drew ' + CardSystem.getHand().length, 'dim');
      }
    }

    // Seed blood splatter from corpse tiles on dungeon floors (depth 3+).
    // Only on first visit — cached floors keep their cleaned state.
    if (typeof CleaningSystem !== 'undefined' && depth >= 3) {
      var fd = FloorManager.getFloorData();
      if (fd && CleaningSystem.getDirtyTiles(floorId).length === 0) {
        CleaningSystem.seedFromCorpses(floorId, fd.grid, fd.gridW, fd.gridH);
      }
    }

    // Clear world-space popups from previous floor
    if (typeof WorldPopup !== 'undefined') WorldPopup.clear();

    // Wire blood floor ID to raycaster so floor tiles render blood tint
    if (typeof Raycaster !== 'undefined' && Raycaster.setBloodFloorId) {
      Raycaster.setBloodFloorId(depth >= 3 ? floorId : null);
    }

    // C7: Scan trap positions on floor load for re-arm tracking
    if (typeof TrapRearm !== 'undefined' && depth >= 3) {
      var trapFd = FloorManager.getFloorData();
      if (trapFd) TrapRearm.onFloorLoad(floorId, trapFd.grid, trapFd.gridW, trapFd.gridH);
    }

    // Cobweb system: scan eligible positions on floor load (depth 3+)
    if (typeof CobwebSystem !== 'undefined' && depth >= 3) {
      var cobFd = FloorManager.getFloorData();
      if (cobFd) CobwebSystem.onFloorLoad(cobFd, floorId);
    }

    // C8: Work order posting and evaluation on floor transitions
    if (typeof WorkOrderSystem !== 'undefined') {
      if (depth >= 3) {
        // Arriving at a dungeon floor — post an order if none active
        var existingOrder = WorkOrderSystem.getOrder(floorId);
        if (!existingOrder || existingOrder.status !== 'active') {
          WorkOrderSystem.postOrders([floorId]);
          var newOrder = WorkOrderSystem.getOrder(floorId);
          if (newOrder) {
            Toast.show('📋 ' + i18n.t('work.order_posted', 'Work order posted') +
                        ' — ' + Math.round(newOrder.target * 100) + '%', 'info');
          }
        }
      } else if (depth <= 2) {
        // Returning to surface/interior — evaluate any active dungeon orders
        var evalResult = WorkOrderSystem.evaluate();
        if (evalResult.completed.length > 0) {
          var totalPay = evalResult.totalPayout;
          Player.addCurrency(totalPay);
          Toast.show('✅ ' + i18n.t('work.order_complete', 'Order complete!') +
                      ' +' + totalPay + 'g', 'currency');
          AudioSystem.play('ui-confirm', { volume: 0.6 });
        }
        if (evalResult.failed.length > 0) {
          Toast.show('❌ ' + i18n.t('work.order_failed', 'Order incomplete'), 'warning');
        }
      }
    }

    // Clear NpcSystem active list — previous floor's NPC refs are stale
    if (typeof NpcSystem !== 'undefined') NpcSystem.clearActive();

    // Spawn ambient NPCs for this floor (built-in populations + any
    // registered by other modules)
    if (typeof NpcSystem !== 'undefined') {
      NpcSystem.spawn(
        floorId,
        FloorManager.getEnemies(),
        FloorManager.getFloorData().grid
      );
    }

    // Hero Day carnage — apply abstract hero destruction to dungeon floors
    if (typeof HeroSystem !== 'undefined') {
      var fd = FloorManager.getFloorData();
      var carnage = HeroSystem.applyCarnageIfHeroDay(
        floorId, fd, FloorManager.getEnemies()
      );
      if (carnage) {
        // Fire post-carnage atmospheric bark
        if (typeof BarkLibrary !== 'undefined') {
          setTimeout(function () {
            BarkLibrary.fire('dungeon.postcarnage');
          }, carnage.smashed * 1200 + 2000);
        }
      }
    }

    if (floorId === '1') {
      _onArrivePromenade();
    } else if (floorId === '1.6') {
      _onArriveHome();
    }
  }

  /**
   * Player has arrived on Floor 1 (The Promenade).
   *
   * On Day 1 (gate not yet unlocked):
   *   1. Start ambient morning bark timer — townspeople comment on the player
   *      not being at work yet.
   *   2. Spawn the Dispatcher gate NPC at the dungeon entrance tile (5, 2)
   *      so the player encounters him when they try to enter.
   *
   * After gate is unlocked, ambient barks switch to the general pool.
   */
  function _onArrivePromenade() {
    if (typeof BarkLibrary === 'undefined') return;

    var barkKey = _gateUnlocked ? 'ambient.promenade' : 'ambient.promenade.morning';

    // Fire one bark immediately on arrival (world feels alive)
    setTimeout(function () {
      BarkLibrary.fire(barkKey);
    }, 2500);

    // Then fire ambient barks on a loose 18–28 s interval
    _ambientBarkTimer = setInterval(function () {
      if (!ScreenManager.isPlaying()) return;
      BarkLibrary.fire(barkKey);
    }, _AMBIENT_BARK_MIN_MS + Math.random() * _AMBIENT_BARK_RANGE_MS);

    // On first arrival before gate is unlocked, spawn the Dispatcher
    if (!_gateUnlocked) {
      _spawnDispatcherGate();
    }
  }

  /**
   * Spawn the Dispatcher NPC at the dungeon entrance tile (5, 2).
   * The NPC blocks movement onto that tile and shows gate dialog
   * when bumped or interacted with.
   *
   * TODO (Phase B): Convert to a NpcSystem DISPATCHER definition so this
   * entity follows the standard spawn/despawn/interact pattern. Currently
   * hand-rolled here because it has gate-state logic (gateUnlocked flag)
   * that runs before NpcSystem is fully wired for conditional spawns.
   */
  function _spawnDispatcherGate() {
    var enemies = FloorManager.getEnemies();
    // Guard: don't double-spawn
    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].id === _dispatcherSpawnId) return;
    }

    var stack = (typeof NpcComposer !== 'undefined')
      ? NpcComposer.getVendorPreset('dispatcher')
      : null;

    enemies.push({
      id:          _dispatcherSpawnId,
      x:           5,   // Dungeon entrance DOOR tile on Floor 1
      y:           2,
      name:        'Dispatcher',
      emoji:       stack ? stack.head : '🐉',
      stack:       stack,
      type:        'dispatcher',
      hp:          999,  // Invulnerable — can't be fought
      maxHp:       999,
      str:         0,
      facing:      'south',
      awareness:   0,
      friendly:    true,
      nonLethal:   true,
      blocksMovement: true,   // Prevents the player from stepping onto tile
      tags:        ['gate_npc', 'dispatcher']
    });

    console.log('[Game] Dispatcher gate NPC spawned at (5,2) on Floor 1');
  }

  /**
   * Dispatcher gate dialogue — 3-branch Morrowind-style conversation.
   *
   * Branch depends on gate state context:
   *   1. Player hasn't been home yet → "Where's my bunk?" (standard redirect)
   *   2. Player has keys → "I have the key" (skip fetch, unlock immediately)
   *   3. Nudge on subsequent bumps → shorter redirect
   */
  var _dispatcherDialogShown = false;

  function _showDispatcherGateDialog() {
    if (typeof DialogBox === 'undefined') return;

    // Build choices based on whether the player knows the route
    var choices = [];
    var firstTime = !_dispatcherDialogShown;
    _dispatcherDialogShown = true;

    if (firstTime) {
      // First encounter — full introduction
      DialogBox.show({
        speaker:  'Dispatcher',
        portrait: '\uD83D\uDC09',
        text:     'Hold up, operative. Gate\'s locked till you\'re properly checked in. You need your work keys \u2014 they\'re at your bunk.',
        choices:  [
          { label: 'Where\'s my bunk?' },
          { label: 'I already have the key' },
          { label: 'I heard it\'s unlocked...' }
        ],
        onChoice: function (idx) {
          if (idx === 0) {
            // Standard redirect to home
            DialogBox.show({
              speaker:  'Dispatcher',
              portrait: '\uD83D\uDC09',
              text:     'Floor 1.6 \u2014 head east past the inn, look for the Gleaner\'s mark on the door. Keys are in the chest by the wall. Don\'t take long.',
              onClose: function () {
                if (typeof Toast !== 'undefined') {
                  Toast.show('\uD83D\uDDDD Go home (1.6) and get your work keys', 'info');
                }
              }
            });
          } else if (idx === 1) {
            // Skip fetch — unlock immediately if they somehow have the keys
            // (edge case: they went home first via alternate path)
            DialogBox.show({
              speaker:  'Dispatcher',
              portrait: '\uD83D\uDC09',
              text:     'Let me see... huh. Right you are. Gate\'s open, Gleaner. Try not to die on your first day.',
              onClose: function () {
                _onPickupWorkKeys();
              }
            });
          } else {
            // Flavor skip — still sends them to get keys, with personality
            DialogBox.show({
              speaker:  'Dispatcher',
              portrait: '\uD83D\uDC09',
              text:     'Heard wrong. Rules are rules \u2014 no key, no entry. Go grab it from your bunk. East side, past the inn.'
            });
          }
        }
      });
    } else {
      // Return bumps — shorter nudge
      DialogBox.show({
        speaker:  'Dispatcher',
        portrait: '\uD83D\uDC09',
        text:     'Still here? Your keys are at home \u2014 Floor 1.6, east side. Get moving.',
        choices:  [
          { label: 'On my way' },
          { label: 'Actually, I have them now' }
        ],
        onChoice: function (idx) {
          if (idx === 1) {
            DialogBox.show({
              speaker:  'Dispatcher',
              portrait: '\uD83D\uDC09',
              text:     'About time. Gate\'s open. Watch yourself down there.',
              onClose: function () {
                _onPickupWorkKeys();
              }
            });
          }
        }
      });
    }
  }

  /**
   * Player has arrived on Floor 1.6 (Gleaner's Home).
   *
   * Fires the home-arrival bark and checks whether the work keys item
   * is present in the home chest. If so, marks it for pickup — the
   * player will interact with the DOOR tile at the chest position to
   * collect the keys, which sets _gateUnlocked = true.
   */
  function _onArriveHome() {
    if (typeof BarkLibrary !== 'undefined') {
      setTimeout(function () {
        BarkLibrary.fire('home.morning.wakeup');
      }, 1000);
    }

    if (!_gateUnlocked) {
      console.log('[Game] Floor 1.6 — work keys available for pickup');
      // The chest at (5, 3) on the home floor contains the work keys.
      // When the player interacts with it, _onPickupWorkKeys() is called
      // via the chest-interact path in _interact().
    }
  }

  /**
   * Called when the player picks up the work keys from the home chest.
   * Unlocks the gate, removes the Dispatcher NPC, and fires the unlock bark.
   */
  function _onPickupWorkKeys() {
    if (_gateUnlocked) return;
    _gateUnlocked = true;

    if (typeof BarkLibrary !== 'undefined') {
      BarkLibrary.fire('home.keys.pickup');
    }

    // Remove the Dispatcher NPC from Floor 1 enemy list (it may not be
    // loaded right now — the cache will be clean when Floor 1 is visited)
    if (FloorManager.getFloor() === '1') {
      var enemies = FloorManager.getEnemies();
      for (var i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].id === _dispatcherSpawnId) {
          enemies.splice(i, 1);
          break;
        }
      }
    }

    // Invalidate Floor 1 cache so gate NPC is not re-spawned on revisit
    FloorManager.invalidateCache('1');

    console.log('[Game] Work keys collected — dungeon gate unlocked');

    // Update quest waypoint now that gate is open
    _updateQuestTarget();
  }

  // ═══════════════════════════════════════════════════════════════
  //  OVERNIGHT HERO RUN — executes during sleep on Hero Day eve
  // ═══════════════════════════════════════════════════════════════

  /**
   * Execute the overnight hero run when the player sleeps into a Hero Day.
   * Uses HeroRun to calculate results, then delivers a report to the mailbox.
   *
   * @param {number} dayNum - The day number that is now a Hero Day
   */
  function _executeOvernightHeroRun(dayNum) {
    if (typeof HeroRun === 'undefined') return;
    if (typeof MailboxPeek === 'undefined') return;

    // Day 0 guard: heroes already ran before the game started.
    // Pre-existing carnage is baked into initial floor generation.
    if (dayNum === 0) {
      console.log('[Game] Day 0 — skipping hero run (pre-existing carnage).');
      return;
    }

    // Determine which hero runs today
    var heroType = HeroRun.getHeroForDay(dayNum);

    // Gather floor readiness data for all known dungeon floors
    var dungeonFloors = [];
    var knownDungeons = ['1.3.1', '2.2.1', '2.2.2'];
    for (var i = 0; i < knownDungeons.length; i++) {
      var fid = knownDungeons[i];
      var readiness = 0;
      var crateCount = 4;     // Default estimates
      var enemyCount = 3;
      var trapCount = 2;
      var puzzleCount = 1;

      // Try to get actual readiness from ReadinessCalc
      if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.getReadiness) {
        var r = ReadinessCalc.getReadiness(fid);
        if (r && typeof r.total === 'number') readiness = Math.round(r.total * 100);
      }

      // Try to get actual counts from cached floor data
      if (typeof FloorManager !== 'undefined' && FloorManager.getCachedFloorData) {
        var cached = FloorManager.getCachedFloorData(fid);
        if (cached && cached.grid) {
          crateCount = _countTilesOfType(cached.grid, cached.gridW, cached.gridH, TILES.BREAKABLE) || 4;
          trapCount = _countTilesOfType(cached.grid, cached.gridW, cached.gridH, TILES.TRAP) || 2;
        }
        if (cached && cached.enemies) {
          enemyCount = cached.enemies.length || 3;
        }
      }

      // Floor name lookup
      var floorName = fid;
      if (typeof i18n !== 'undefined' && i18n.t) {
        floorName = i18n.t('floor.' + fid, fid);
      }

      dungeonFloors.push({
        floorId: fid,
        name: floorName,
        readiness: readiness,
        crateCount: crateCount,
        enemyCount: enemyCount,
        trapCount: trapCount,
        puzzleCount: puzzleCount
      });
    }

    // Only run if there are floors with non-zero readiness
    var hasReadyFloor = false;
    for (var j = 0; j < dungeonFloors.length; j++) {
      if (dungeonFloors[j].readiness > 0) { hasReadyFloor = true; break; }
    }

    if (!hasReadyFloor && dayNum > 0) {
      // No floors prepared — hero is disappointed
      MailboxPeek.addReport({
        day: dayNum,
        heroType: heroType,
        heroEmoji: HeroRun.getHeroEmoji(heroType),
        floors: [],
        totalPayout: 0,
        chainBonus: false,
        cardDrop: null,
        isDeathReport: false,
        rescueText: null
      });
      console.log('[Game] Hero Day ' + dayNum + ' — no floors ready. Hero disappointed.');
      return;
    }

    // Execute the hero run
    var report = HeroRun.executeRun(heroType, dungeonFloors);
    report.day = dayNum;

    // Deliver report to mailbox
    MailboxPeek.addReport(report);

    // Invalidate dungeon floor caches so re-entry shows carnage
    for (var k = 0; k < knownDungeons.length; k++) {
      if (typeof FloorManager !== 'undefined' && FloorManager.invalidateCache) {
        FloorManager.invalidateCache(knownDungeons[k]);
      }
    }

    console.log('[Game] Hero Day ' + dayNum + ' — ' + heroType + ' ran. Payout: ' + report.totalPayout + ' coins. Report delivered to mailbox.');
  }

  /**
   * Count tiles of a specific type in a grid.
   */
  function _countTilesOfType(grid, w, h, tileType) {
    var count = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (grid[y] && grid[y][x] === tileType) count++;
      }
    }
    return count;
  }

  // ═══════════════════════════════════════════════════════════════
  //  HOME DOOR REST (porch shortcut when TIRED)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Rest at the front door of home. Skips entering the house —
   * player sleeps on the porch at depth-1 (exterior), so the clock
   * is NOT paused and advanceTime works normally.
   *
   * Grants WELL_RESTED if sleeping before 23:00.
   */
  function _doHomeDoorRest() {
    var sleepHour = (typeof DayCycle !== 'undefined') ? DayCycle.getHour() : 0;

    if (typeof TransitionFX !== 'undefined') {
      TransitionFX.begin({
        type: 'descend',
        duration: 1200,
        label: 'Resting for the night...',
        onMidpoint: function () {
          // Advance time to morning
          if (typeof DayCycle !== 'undefined') {
            DayCycle.advanceTime(DayCycle.ADVANCE.REST);
          }

          // Clear TIRED
          if (typeof StatusEffect !== 'undefined') {
            StatusEffect.remove('TIRED', 'manual');
          }

          // Grant WELL_RESTED if slept before 23:00
          if (sleepHour < 23 && typeof StatusEffect !== 'undefined') {
            StatusEffect.apply('WELL_RESTED');
          }

          // Heal + heal particles
          if (typeof Player !== 'undefined') Player.fullRestore();
          if (typeof ParticleFX !== 'undefined') {
            ParticleFX.healPulse(_canvas ? _canvas.width / 2 : 320, _canvas ? _canvas.height * 0.5 : 220);
          }

          // Transition into home (1.6) — wake up inside
          FloorManager.setFloor('1.6');
          FloorManager.generateCurrentFloor();
        },
        onComplete: function () {
          _updateDayCounter();

          if (sleepHour < 23 && typeof Toast !== 'undefined') {
            Toast.show('\u2600 Well rested! Ready for the day.', 'buff');
          } else if (typeof Toast !== 'undefined') {
            Toast.show('\u2615 Late night... but at least you made it home.', 'info');
          }

          // Trigger overnight hero run if it's a Hero Day
          if (typeof DayCycle !== 'undefined' && DayCycle.isHeroDay()) {
            _executeOvernightHeroRun(DayCycle.getDay());
          }

          // Mailbox notification
          if (typeof MailboxPeek !== 'undefined' && MailboxPeek.hasUnread()) {
            setTimeout(function () {
              if (typeof Toast !== 'undefined') {
                Toast.show('\uD83D\uDCEC You have mail!', 'info');
              }
            }, 1500);
          }
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  HUD DAY/CYCLE COUNTER
  // ═══════════════════════════════════════════════════════════════

  var _dayCounterEl = null;

  /**
   * Create the day counter DOM element (anchored near minimap).
   */
  function _initDayCounter() {
    _dayCounterEl = document.getElementById('hud-day-counter');
    if (!_dayCounterEl) {
      _dayCounterEl = document.createElement('div');
      _dayCounterEl.id = 'hud-day-counter';
      _dayCounterEl.style.cssText =
        'position:absolute;top:10px;right:180px;' +
        'font:bold 14px monospace;color:#d4c8a0;' +
        'text-shadow:0 1px 3px rgba(0,0,0,0.8);' +
        'z-index:15;pointer-events:none;' +
        'background:rgba(10,8,5,0.6);padding:4px 10px;' +
        'border:1px solid rgba(180,160,120,0.3);border-radius:4px;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_dayCounterEl);
    }
    _updateDayCounter();
  }

  /**
   * Update the day counter text.
   */
  function _updateDayCounter() {
    if (!_dayCounterEl) return;
    if (typeof DayCycle === 'undefined') return;

    var day = DayCycle.getDay();
    var heroInterval = DayCycle.HERO_DAY_INTERVAL || 3;
    var dayInCycle = (day % heroInterval) + 1;
    var daysUntil = DayCycle.daysUntilHeroDay();
    var isHero = DayCycle.isHeroDay();

    var text = 'Day ' + (day + 1) + ' (' + dayInCycle + '/' + heroInterval + ')';
    if (isHero) {
      text += '  \u2694\uFE0F HERO DAY';
      _dayCounterEl.style.color = '#f0c040';
      _dayCounterEl.style.borderColor = 'rgba(240,192,64,0.5)';
    } else if (daysUntil === 1) {
      text += '  \u26A0 Heroes tomorrow';
      _dayCounterEl.style.color = '#e0a040';
      _dayCounterEl.style.borderColor = 'rgba(224,160,64,0.4)';
    } else {
      _dayCounterEl.style.color = '#d4c8a0';
      _dayCounterEl.style.borderColor = 'rgba(180,160,120,0.3)';
    }

    // Append time string
    if (DayCycle.getTimeString) {
      text += '  ' + DayCycle.getTimeString();
    }

    _dayCounterEl.textContent = text;
  }

  /**
   * Check whether the tile at (fx, fy) on the current floor is the
   * work-keys chest on Floor 1.6. Called from _interact().
   */
  function _checkWorkKeysChest(fx, fy) {
    return !_gateUnlocked
      && FloorManager.getFloor() === '1.6'
      && fx === 19 && fy === 3;
  }

  function _generateAndWire() {
    var spawn = FloorManager.generateCurrentFloor();

    MC.init({
      x: spawn.x,
      y: spawn.y,
      dir: spawn.dir,
      collisionCheck: FloorManager.getCollisionCheck(),
      onMoveStart: _onMoveStart,
      onMoveFinish: _onMoveFinish,
      onBump: _onBump,
      onTurnFinish: _onTurnFinish
    });

    Minimap.reveal(spawn.x, spawn.y);
    _updateQuestTarget();
    HUD.updateFloor(FloorManager.getFloor());
    HUD.updatePlayer(Player.state());
    if (typeof StatusBar !== 'undefined') {
      StatusBar.updateFloor(FloorManager.getFloor(), FloorManager.getBiomeName ? FloorManager.getBiomeName() : '');
    }
    _refreshPanels();
  }

  // ── Quest waypoint targeting ────────────────────────────────────────
  // Sets the minimap quest diamond based on current floor and game state.
  // Day 0 route: approach(0) → promenade(1) → home(1.6) for keys → back
  // to promenade(1) → bazaar(1.1) → soft cellar(1.3.1).
  function _updateQuestTarget() {
    if (typeof Minimap === 'undefined' || !Minimap.setQuestTarget) return;
    var floorId = FloorManager.getFloor();
    var floorData = FloorManager.getFloorData();

    if (!_gateUnlocked) {
      // Phase 1: get work keys
      if (floorId === '0') {
        // Point at the door to Promenade
        Minimap.setQuestTarget({ x: 9, y: 6 });
      } else if (floorId === '1') {
        // Point at Gleaner's Home door (east side)
        Minimap.setQuestTarget({ x: 17, y: 7 });
      } else if (floorId === '1.6') {
        // Point at the key chest
        Minimap.setQuestTarget({ x: 19, y: 3 });
      } else {
        Minimap.setQuestTarget(null);
      }
    } else {
      // Phase 2: head to dungeon
      if (floorId === '1') {
        // Point at Coral Bazaar entrance
        Minimap.setQuestTarget({ x: 5, y: 2 });
      } else if (floorId === '1.1') {
        // Point at stairs down to dungeon
        Minimap.setQuestTarget({ x: 7, y: 4 });
      } else {
        // In dungeon or elsewhere — no specific waypoint
        Minimap.setQuestTarget(null);
      }
    }
  }

  // ── Movement callbacks ─────────────────────────────────────────────

  var _footstepFoot = 0; // 0=left, 1=right — alternates per step

  function _onMoveStart(fromX, fromY, toX, toY, dir) {
    Player.setDir(dir);
    DoorContracts.tickProtect();
    // Alternate left/right footstep for natural cadence
    var foot = _footstepFoot === 0 ? 'step-left' : 'step-right';
    _footstepFoot = 1 - _footstepFoot;
    AudioSystem.playRandom(foot, { volume: 0.4 });
  }

  function _onMoveFinish(x, y, dir) {
    Player.setPos(x, y);
    Player.setDir(dir);
    Minimap.reveal(x, y);

    // Walk-away interrupt for inline tooltip dialogue
    if (typeof StatusBar !== 'undefined' && StatusBar.checkWalkAway) {
      StatusBar.checkWalkAway(x, y);
    }

    // Cobweb destruction — player (or enemy) walks through standalone cobweb.
    // The player tears their own web if they backtrack carelessly.
    // This is the strategic cost: deploy webs after you've cleared
    // a corridor, then path around them on the way out.
    if (typeof CobwebSystem !== 'undefined') {
      var cobFloorId = FloorManager.getCurrentFloorId();
      if (CobwebSystem.onEntityMove(x, y, cobFloorId)) {
        AudioSystem.play('sweep', { volume: 0.3 });
        Toast.show('🕸️ ' + i18n.t('cobweb.torn', 'You tore your own cobweb!'), 'warning');
        if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('🕸️ Torn!', x, y, 'warning');
        if (typeof SessionStats !== 'undefined') SessionStats.inc('cobwebsTorn');
      }
    }

    // Advance minimap click-to-move path
    if (typeof MinimapNav !== 'undefined') MinimapNav.onMoveFinish();

    var floorData = FloorManager.getFloorData();
    var tile = floorData.grid[y][x];

    // Door step-through: stepping onto a door tile auto-triggers the
    // transition (same as interacting). Prevents the player from walking
    // into the gap between a door facade and the wall behind it.
    if (TILES.isDoor(tile)) {
      FloorTransition.tryInteractDoor(x, y);
      return; // Transition handles everything from here
    }

    if (tile === TILES.CHEST) {
      CombatBridge.openChest(x, y);
      SessionStats.inc('chestsOpened');
    }

    // Hazard check — fire, traps, spikes, poison
    // If hazard kills the player, HazardSystem handles death
    // (bonfire respawn on depth 1-2, permadeath on depth 3)
    if (TILES.isHazard(tile)) {
      HazardSystem.checkTile(x, y);
      if (!Player.isAlive()) return; // Death handled by HazardSystem
    }

    // Walk-over collectible pickup (gold, battery, food spilled from breakables)
    if (tile === TILES.COLLECTIBLE) {
      var pickup = WorldItems.pickupAt(x, y, floorData.grid);
      if (pickup) _applyPickup(pickup);
    }

    // HOT tick (heal-over-time from food items)
    var hotRestored = Player.tickHOT();
    if (hotRestored > 0) HUD.updatePlayer(Player.state());

    CombatBridge.checkEnemyProximity(x, y);
    HUD.updatePlayer(Player.state());
    _refreshPanels();
  }

  /**
   * Apply the effect of a walk-over collectible pickup.
   * @param {Object} pickup - { type, amount?, itemId? }
   */
  function _applyPickup(pickup) {
    if (pickup.type === 'gold') {
      Player.addCurrency(pickup.amount || 1);
      Toast.show('💰 +' + (pickup.amount || 1), 'currency');
      AudioSystem.playRandom('coin', { volume: 0.5 });
    } else if (pickup.type === 'battery') {
      Player.addBattery(pickup.amount || 1);
      Toast.show('◈ +' + (pickup.amount || 1), 'battery');
      AudioSystem.playRandom('coin', { volume: 0.5 });
      HUD.updateBattery(Player.state());
    } else if (pickup.type === 'food') {
      // Food items give HP restore or HOT via effects[]
      // For jam scope: flat +2 HP unless itemId maps to a HOT effect
      var HOT_ITEMS = { 'ITM-001': { hot: 1, ticks: 3 }, 'ITM-002': { hot: 1, ticks: 3 },
                       'ITM-003': { hot: 2, ticks: 4 }, 'ITM-004': { hp: 3 },
                       'ITM-005': { hp: 4 }, 'ITM-006': { hp: 3, energy: 2 } };
      var effect = (pickup.itemId && HOT_ITEMS[pickup.itemId]) || { hp: 2 };
      if (effect.hot) {
        Player.applyHOT(effect.hot, effect.ticks);
        Toast.show(i18n.t('toast.food_hot', 'Eating... +' + effect.hot + '♥ ×' + effect.ticks), 'hp');
      } else {
        if (effect.hp)     Player.heal(effect.hp);
        if (effect.energy) Player.restoreEnergy(effect.energy);
        Toast.show(i18n.t('toast.food_instant', 'Ate something. ♥ +' + (effect.hp || 0)), 'hp');
      }
      AudioSystem.play('pickup', { volume: 0.5 });
    }
    HUD.updatePlayer(Player.state());
    SessionStats.inc('itemsCollected');
  }

  function _onBump(dir) {
    AudioSystem.play('ui-blop');
    // Cancel minimap auto-path on collision
    if (typeof MinimapNav !== 'undefined') MinimapNav.onBump();

    // Check whether the bumped tile is the Dispatcher gate NPC
    if (!_gateUnlocked) {
      var pos = MC.getGridPos();
      var bumpX = pos.x + MC.DX[dir];
      var bumpY = pos.y + MC.DY[dir];
      var enemies = FloorManager.getEnemies();
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.id === _dispatcherSpawnId && e.x === bumpX && e.y === bumpY) {
          _showDispatcherGateDialog();
          break;
        }
      }
    }
  }

  function _onTurnFinish(dir) {
    Player.setDir(dir);
    // Don't reset lookOffset here — MouseLook tracks absolute cursor
    // position, so the offset should always reflect where the mouse
    // physically is. Resetting causes a snap-back when the cursor
    // is near the screen edge during a turn.
  }

  // ── Interact ───────────────────────────────────────────────────────

  function _interact() {
    if (FloorTransition.isTransitioning()) return;

    var pos = MC.getGridPos();
    var dir = pos.dir;
    var fx = pos.x + MC.DX[dir];
    var fy = pos.y + MC.DY[dir];
    var floorData = FloorManager.getFloorData();
    var W = floorData.gridW;
    var H = floorData.gridH;

    if (fx < 0 || fx >= W || fy < 0 || fy >= H) return;

    // ── Depth-2 exit guard: warn before leaving interior during curfew hours ──
    if (typeof DayCycle !== 'undefined' && DayCycle.isCurfewHour && DayCycle.isCurfewHour()) {
      var guardFloor = FloorManager.getFloor();
      var guardDepth = guardFloor ? guardFloor.split('.').length : 1;
      if (guardDepth === 2) {
        var tile = floorData.grid[fy] ? floorData.grid[fy][fx] : 0;
        var isDoorExit = (tile === TILES.DOOR_EXIT || tile === TILES.DOOR_BACK || tile === TILES.STAIRS_UP);
        if (isDoorExit && !_curfewExitConfirmed) {
          // Show confirmation dialog instead of transitioning
          if (typeof DialogBox !== 'undefined') {
            var timeStr = DayCycle.getTimeString ? DayCycle.getTimeString() : 'late';
            DialogBox.show({
              speaker: '\u26A0 Curfew',
              text: 'It\'s ' + timeStr + '. Are you sure you want to go outside?',
              choices: [
                { label: 'Yes, go outside' },
                { label: 'Stay inside' }
              ],
              onChoice: function (idx) {
                if (idx === 0) {
                  _curfewExitConfirmed = true;
                  _interact();
                  _curfewExitConfirmed = false;
                }
              }
            });
          }
          return;
        }
      }
    }

    // ── Home door rest shortcut: offer rest at door when TIRED ──
    if (typeof StatusEffect !== 'undefined' && StatusEffect.has('TIRED')) {
      var restFloor = FloorManager.getFloor();
      var restDepth = restFloor ? restFloor.split('.').length : 1;
      if (restDepth === 1) {
        var restTile = floorData.grid[fy] ? floorData.grid[fy][fx] : 0;
        // Check if this door leads to home (1.6)
        var doorTarget = null;
        var fd2 = FloorManager.getFloorData();
        if (fd2 && fd2.doorTargets) {
          doorTarget = fd2.doorTargets[fx + ',' + fy] || null;
        }
        if (doorTarget === '1.6' && (restTile === TILES.DOOR || restTile === TILES.DOOR_EXIT)) {
          if (!_homeDoorRestOffered) {
            _homeDoorRestOffered = true;
            if (typeof DialogBox !== 'undefined') {
              DialogBox.show({
                speaker: '\uD83C\uDFE0 Home',
                text: 'You look tired. Rest for the night?',
                choices: [
                  { label: 'Rest for the night' },
                  { label: 'Go inside' }
                ],
                onChoice: function (idx) {
                  _homeDoorRestOffered = false;
                  if (idx === 0) {
                    _doHomeDoorRest();
                  } else {
                    FloorTransition.tryInteractDoor(fx, fy);
                  }
                }
              });
            }
            return;
          }
        }
      }
    }
    _homeDoorRestOffered = false;

    if (FloorTransition.tryInteractStairs(fx, fy)) return;
    if (FloorTransition.tryInteractDoor(fx, fy)) return;

    // Work-keys pickup on Floor 1.6 (triggers gate unlock)
    if (_checkWorkKeysChest(fx, fy)) {
      _onPickupWorkKeys();
      return;
    }

    // Talkable NPC interaction — delegate to NpcSystem
    if (typeof NpcSystem !== 'undefined') {
      var npcAtTile = NpcSystem.findAtTile(fx, fy, FloorManager.getEnemies());
      if (npcAtTile && npcAtTile.talkable) {
        NpcSystem.interact(npcAtTile, FloorManager.getFloor());
        return;
      }
    }

    // Cobweb installation — spider deployment on eligible corridor tiles
    if (typeof CobwebNode !== 'undefined') {
      if (CobwebNode.tryInteract(FloorManager.getCurrentFloorId())) {
        if (typeof SessionStats !== 'undefined') SessionStats.inc('cobwebsInstalled');
        Toast.show('🕷️ ' + i18n.t('cobweb.installed', 'Cobweb installed'), 'loot');
        if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('🕷️ Deployed!', fx, fy, 'loot');
        return;
      }
    }

    // Blood cleaning — scrub tiles near corpses
    if (typeof CleaningSystem !== 'undefined') {
      var cleanFloorId = FloorManager.getCurrentFloorId();
      if (CleaningSystem.isDirty(fx, fy, cleanFloorId)) {
        // C3: Pass equipped cleaning tool subtype for speed scaling
        var _cleanTool = null;
        var _equipped = Player.getEquipped();
        for (var _ei = 0; _ei < _equipped.length; _ei++) {
          if (_equipped[_ei] && _equipped[_ei].subtype &&
              CleaningSystem.TOOL_SPEED[_equipped[_ei].subtype]) {
            _cleanTool = _equipped[_ei].subtype;
            break;
          }
        }
        if (CleaningSystem.scrub(fx, fy, cleanFloorId, _cleanTool)) {
          AudioSystem.play('sweep', { volume: 0.5 });
          var remaining = CleaningSystem.getBlood(fx, fy, cleanFloorId);
          if (remaining <= 0) {
            Toast.show('🧹 ' + i18n.t('toast.tile_clean', 'Tile cleaned!'), 'loot');
            if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('🧹 Clean!', fx, fy, 'loot');
            SessionStats.inc('tilesCleaned');
          } else {
            if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('🧹 ' + remaining + '/' + CleaningSystem.MAX_BLOOD, fx, fy, 'info');
          }
        }
        return;
      }
    }

    // C7: Trap re-arm — face an EMPTY tile that was formerly a TRAP
    if (typeof TrapRearm !== 'undefined') {
      var rearmFloorId = FloorManager.getCurrentFloorId();
      if (TrapRearm.canRearm(fx, fy, rearmFloorId)) {
        if (TrapRearm.rearm(fx, fy, rearmFloorId, floorData.grid)) {
          AudioSystem.play('ui-confirm', { volume: 0.4 });
          Toast.show('⚙️ ' + i18n.t('toast.trap_rearmed', 'Trap re-armed!'), 'loot');
          if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('⚙️ Armed!', fx, fy, 'loot');
          if (typeof SessionStats !== 'undefined') SessionStats.inc('trapsRearmed');
          return;
        }
      }
    }

    var tile = floorData.grid[fy][fx];
    if (tile === TILES.CHEST) {
      CombatBridge.openChest(fx, fy);
    } else if (tile === TILES.BONFIRE || tile === TILES.BED || tile === TILES.HEARTH) {
      // Home bed → BedPeek handles sleep/day-advance (Floor 1.6, position 2,2)
      if (typeof BedPeek !== 'undefined' && FloorManager.getFloor() === '1.6' && fx === 2 && fy === 2) {
        // BedPeek overlay is already showing via update(). The F-key interact
        // is handled internally by BedPeek — just don't fall through to bonfire.
        return;
      }
      // Non-home bonfire/bed/hearth: heal + open stash MenuBox
      HazardSystem.restAtBonfire(fx, fy);
      _pendingMenuContext = 'bonfire';
      _pendingMenuFace = 0;
      ScreenManager.toPause();
    } else if (tile === TILES.TABLE) {
      // Cozy table inspection — show a toast with a lived-in detail
      var tableQuips = [
        i18n.t('table.quip1', 'A mug of cold tea. Still half full.'),
        i18n.t('table.quip2', 'Scattered notes — dungeon cleaning checklists.'),
        i18n.t('table.quip3', 'A pressed flower between two invoice sheets.'),
        i18n.t('table.quip4', 'Crumbs from this morning\'s flatbread.'),
        i18n.t('table.quip5', 'A dull knife and a half-whittled figurine.')
      ];
      var qi = Math.floor(Math.random() * tableQuips.length);
      Toast.show('🔍 ' + tableQuips[qi], 'info');
    } else if (tile === TILES.SHOP) {
      // Resolve which faction owns this shop tile
      var shopFaction = 'tide';  // fallback
      var shopList = floorData.shops || [];
      for (var si = 0; si < shopList.length; si++) {
        if (shopList[si].x === fx && shopList[si].y === fy) {
          shopFaction = shopList[si].factionId;
          break;
        }
      }
      _openVendorDialog(shopFaction);
    } else if (tile === TILES.CORPSE) {
      // If a CrateSystem container exists (restock slots), open slot-filling UI
      var corpseFloorId = FloorManager.getCurrentFloorId();
      if (typeof PeekSlots !== 'undefined' && typeof CrateSystem !== 'undefined' &&
          CrateSystem.hasContainer(fx, fy, corpseFloorId)) {
        if (PeekSlots.tryOpen(fx, fy, corpseFloorId)) return;
      }
      // Fallback: necro-salvage (harvest parts from the Hero's mess)
      _harvestCorpse(fx, fy);
    } else if (tile === TILES.BREAKABLE) {
      // If a CrateSystem container exists (crate slots), open slot-filling UI
      var crateFloorId = FloorManager.getCurrentFloorId();
      if (typeof PeekSlots !== 'undefined' && typeof CrateSystem !== 'undefined' &&
          CrateSystem.hasContainer(fx, fy, crateFloorId)) {
        if (PeekSlots.tryOpen(fx, fy, crateFloorId)) return;
      }
      // Fallback: smash the breakable prop
      _smashBreakable(fx, fy);
    }
    // ── BOOKSHELF: Open book peek (autonomous peek handles display,
    //    but OK interact re-shows the current page) ──
    else if (tile === TILES.BOOKSHELF) {
      if (typeof BookshelfPeek !== 'undefined') {
        // If already showing, treat as "next page" action
        if (BookshelfPeek.isActive()) {
          BookshelfPeek.handleKey('KeyD');
        }
        // Otherwise the autonomous update() will show it
      }
    }
    // ── BAR_COUNTER: Tap for a drink ──
    else if (tile === TILES.BAR_COUNTER) {
      if (typeof BarCounterPeek !== 'undefined') {
        BarCounterPeek.tryDrink(fx, fy, floorData);
      }
    }
  }

  // ── Breakable prop smash ──────────────────────────────────────────

  function _smashBreakable(fx, fy) {
    if (typeof BreakableSpawner === 'undefined') return;

    var floorData = FloorManager.getFloorData();
    var bDef = BreakableSpawner.getAt(fx, fy);
    if (!bDef) return;

    AudioSystem.play('smash', { volume: 0.7 });

    var destroyed = BreakableSpawner.hitBreakable(fx, fy, floorData.grid);
    if (destroyed) {
      Toast.show(destroyed.emoji + ' ' + destroyed.name + ' ' + i18n.t('toast.smashed', 'smashed!'), 'loot');
      AudioSystem.playRandom('coin', { volume: 0.4 });  // Loot spill feedback
      SessionStats.inc('breakablesBroken');
    }
    // If not destroyed, the prompt stays visible until HP reaches 0
  }

  // ── Vendor dialog (NPC greeting → shop open) ──────────────────────

  /**
   * Per-faction vendor NPC data.
   * Each faction has a name, emoji portrait, and greeting lines.
   * First-visit greetings are longer; return visits rotate shorter lines.
   * Follows EyesOnly VendorConfig pattern — data-driven, i18n-ready.
   */
  var VENDOR_NPC = {
    tide: {
      name:    'Kai',
      emoji:   '\uD83D\uDC09',  // 🐉
      first:   'Welcome, Gleaner. The Tide Council watches\nthe currents of trade. Browse our wares.',
      lines: [
        'The tides bring fortune today.',
        'Back again? I have new stock.',
        'The Council appreciates your patronage.',
        'Trade well, Gleaner.'
      ]
    },
    foundry: {
      name:    'Renko',
      emoji:   '\u2699\uFE0F',  // ⚙️
      first:   'Hah! Fresh hands for the Foundry.\nEverything here is forged to last.',
      lines: [
        'Need something reforged?',
        'The anvil never sleeps.',
        'Foundry steel — accept no substitute.',
        'Business is business.'
      ]
    },
    admiralty: {
      name:    'Vasca',
      emoji:   '\uD83C\uDF0A',  // 🌊
      first:   'The Admiralty extends its hand.\nWe deal in... refined goods.',
      lines: [
        'The sea remembers its debts.',
        'Rare finds, fair prices.',
        'Only the best for Admiralty clients.',
        'Anchors and aces, Gleaner.'
      ]
    }
  };

  /** Track visit counts per faction for greeting rotation. */
  var _vendorVisits = { tide: 0, foundry: 0, admiralty: 0 };

  /**
   * Show a vendor greeting dialog, then open the shop on close.
   * First visit to a faction uses the longer intro; subsequent visits
   * rotate through shorter lines.
   *
   * @param {string} factionId - 'tide' | 'foundry' | 'admiralty'
   */
  function _openVendorDialog(factionId) {
    var npc = VENDOR_NPC[factionId] || VENDOR_NPC.tide;
    var visits = _vendorVisits[factionId] || 0;

    // Pick greeting text
    var greeting;
    if (visits === 0) {
      greeting = i18n.t('vendor.' + factionId + '.first', npc.first);
    } else {
      var idx = (visits - 1) % npc.lines.length;
      greeting = i18n.t('vendor.' + factionId + '.' + idx, npc.lines[idx]);
    }
    _vendorVisits[factionId] = visits + 1;

    AudioSystem.playRandom('coin', { volume: 0.3 });

    DialogBox.show({
      text:     greeting,
      speaker:  npc.name,
      portrait: npc.emoji,
      priority: DialogBox.PRIORITY.DIALOGUE,
      onClose: function () {
        // Open shop after dialog dismisses
        if (typeof Shop !== 'undefined') {
          Shop.open(factionId, FloorManager.getFloor());
        }
        _pendingMenuContext = 'shop';
        _pendingMenuFace = 0;
        ScreenManager.toPause();
      }
    });
  }

  // ── Corpse harvest (opens MenuBox with side-by-side UI) ────────

  function _harvestCorpse(fx, fy) {
    if (typeof Salvage === 'undefined') return;

    var floorId = FloorManager.getCurrentFloorId();
    var biome = FloorManager.getBiome();

    // ── Reanimation check: fully hydrated corpse stands back up ──
    if (typeof CorpseRegistry !== 'undefined' && CorpseRegistry.isFullyHydrated(fx, fy, floorId)) {
      var reanimData = CorpseRegistry.reanimate(fx, fy, floorId);
      if (reanimData) {
        // Clear corpse tile
        var rfd = FloorManager.getFloorData();
        if (rfd && rfd.grid[fy]) rfd.grid[fy][fx] = TILES.EMPTY;

        // Fire stand-up animation
        if (typeof DeathAnim !== 'undefined') {
          var canvas = document.getElementById('view-canvas');
          var cw = canvas ? canvas.width : 640;
          var ch = canvas ? canvas.height : 400;
          DeathAnim.startReanimate(reanimData.type, cw / 2, ch * 0.45, 0.6, function () {
            // Spawn friendly NPC into the enemy list
            var npc = {
              x: fx, y: fy,
              id: 'reanim_' + reanimData.type + '_' + fx + '_' + fy,
              name: reanimData.name,
              emoji: reanimData.emoji,
              type: reanimData.type,
              hp: reanimData.hp,
              maxHp: reanimData.hp,
              str: reanimData.str,
              facing: 'south',
              awareness: 0,
              friendly: true,
              nonLethal: true,
              tags: reanimData.tags || []
            };
            FloorManager.getEnemies().push(npc);
            Toast.show(i18n.t('toast.reanimate', 'The fallen rises...'), 'loot');
          });
        }
        return;
      }
    }

    // Check if anything remains
    if (!Salvage.hasHarvests(fx, fy, floorId)) {
      Toast.show(i18n.t('toast.harvest_empty', 'Nothing left to harvest.'), 'info');
      // Convert depleted corpse to empty tile
      var fd = FloorManager.getFloorData();
      fd.grid[fy][fx] = TILES.EMPTY;
      return;
    }

    // Pre-roll all loot for display in the harvest MenuBox
    Salvage.prepareLoot(fx, fy, floorId, biome);

    // Open the harvest MenuBox (side-by-side corpse loot + player bag)
    _pendingMenuContext = 'harvest';
    _pendingMenuFace = 0;
    ScreenManager.toPause();
  }

  /**
   * Take a staged loot item by slot index (1-5 keys → 0-4).
   * Called during harvest MenuBox from number key handlers.
   */
  function _takeHarvestItem(slot) {
    if (typeof Salvage === 'undefined') return;

    var loot = Salvage.getStagedLoot();
    if (slot < 0 || slot >= loot.length) return;

    var item = Salvage.takeLoot(slot);
    if (!item) return;

    // Try to add to player bag
    if (Player.addToBag(item)) {
      Toast.show(
        i18n.t('toast.harvest', 'Harvested:') + ' ' + item.emoji + ' ' + item.name,
        'loot'
      );
      AudioSystem.play('pickup-success');
      // Salvage spark on harvest
      if (typeof ParticleFX !== 'undefined') {
        var cx = _canvas ? _canvas.width / 2 : 320;
        var cy = _canvas ? _canvas.height * 0.5 : 220;
        ParticleFX.salvageSpark(cx, cy);
      }
      HUD.updatePlayer(Player.state());
      SessionStats.inc('partsHarvested');
      if (typeof DebriefFeed !== 'undefined') DebriefFeed.logEvent('+' + item.emoji + ' ' + item.name, 'loot');
      _refreshPanels();
    } else {
      Toast.show(i18n.t('toast.bag_full', 'Bag is full!'), 'warning');
      // Put item back — can't take it
      loot.splice(slot, 0, item);
    }

    // If no loot left, mark corpse as looted dry (emoji → bone).
    // The corpse tile stays — only the display changes via CorpseRegistry.
    if (Salvage.getStagedLoot().length === 0) {
      var corpse = Salvage.getStagedCorpse();
      if (corpse) {
        var floorId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '1.3.1';
        // Mark dry in registry — transitions display emoji to bone
        if (typeof CorpseRegistry !== 'undefined') {
          CorpseRegistry.setLootState(corpse.x, corpse.y, floorId, 'dry');
        }
        // Keep TILES.CORPSE on grid (corpse is still there, just empty)
        // Only clear tile if NO registry (legacy fallback)
        if (typeof CorpseRegistry === 'undefined') {
          var fd = FloorManager.getFloorData();
          if (fd && fd.grid[corpse.y] && fd.grid[corpse.y][corpse.x] === TILES.CORPSE) {
            fd.grid[corpse.y][corpse.x] = TILES.EMPTY;
          }
        }
      }
      Salvage.closeLoot();
      // Auto-close the harvest MenuBox
      MenuBox.close();
    }
  }

  // ── Shop buy/sell ─────────────────────────────────────────────────

  /**
   * Player presses [1-5] on shop Face 1 (buy pane) to purchase a card.
   * Slot index matches the number key (0-indexed).
   */
  function _shopBuy(slot) {
    if (typeof Shop === 'undefined' || !Shop.isOpen()) return;

    var result = Shop.buy(slot);
    if (result.ok) {
      Toast.show(
        i18n.t('shop.bought', 'Bought') + ' ' + result.card.emoji + ' ' + result.card.name +
        ' (−' + result.cost + 'g)',
        'loot'
      );
      AudioSystem.playRandom('coin');
      // Coin burst at viewport center (coins fly UP from purchase)
      if (typeof ParticleFX !== 'undefined') {
        var cx = _canvas ? _canvas.width / 2 : 320;
        var cy = _canvas ? _canvas.height * 0.55 : 240;
        ParticleFX.coinBurst(cx, cy, Math.min(12, Math.max(4, Math.floor(result.cost / 5))));
      }
      HUD.updatePlayer(Player.state());
      SessionStats.inc('cardsBought');
      if (typeof DebriefFeed !== 'undefined') DebriefFeed.logEvent('Bought ' + result.card.emoji + ' -' + result.cost + 'g', 'loot');
      _refreshPanels();
    } else if (result.reason === 'no_gold') {
      Toast.show(
        i18n.t('shop.need_gold', 'Need') + ' ' + result.needed + 'g ' + i18n.t('shop.more', 'more'),
        'warning'
      );
      AudioSystem.play('ui-fail');
    } else if (result.reason === 'sold_out') {
      Toast.show(i18n.t('shop.sold_out', 'Sold out'), 'dim');
    }
  }

  /**
   * Player presses [1-5] on shop Face 2 (sell pane) to sell a hand card.
   * Slot index matches card_N key binding (0-indexed over the hand).
   */
  function _shopSellFromHand(slot) {
    if (typeof Shop === 'undefined' || !Shop.isOpen()) return;

    var hand = CardSystem.getHand();
    var card = hand[slot];
    if (!card) return;

    var result = Shop.sell(card.id);
    if (result.ok) {
      // Also remove from displayed hand
      CardSystem.playFromHand(slot);

      Toast.show(
        i18n.t('shop.sold', 'Sold') + ' ' + card.emoji + ' ' + card.name +
        ' (+' + result.amount + 'g)',
        'loot'
      );
      AudioSystem.playRandom('coin');
      // Coin rain for sell proceeds
      if (typeof ParticleFX !== 'undefined') {
        var cx = _canvas ? _canvas.width / 2 : 320;
        var cy = _canvas ? _canvas.height * 0.45 : 200;
        if (result.amount >= 15) {
          ParticleFX.coinRain(cx, cy, result.amount);
        } else {
          ParticleFX.coinBurst(cx, cy, Math.max(3, Math.floor(result.amount / 3)));
        }
      }
      HUD.updatePlayer(Player.state());
      if (typeof DebriefFeed !== 'undefined') DebriefFeed.logEvent('Sold ' + card.emoji + ' +' + result.amount + 'g', 'loot');

      // Rep tier changed — show toast + level-up particles
      if (result.repResult && result.repResult.tierChanged) {
        var fLabel = Shop.getFactionLabel(Shop.getCurrentFaction());
        Toast.show(fLabel + ' Rep Tier ' + result.repResult.newTier + '!', 'info');
        if (typeof ParticleFX !== 'undefined') {
          ParticleFX.levelUp(_canvas ? _canvas.width / 2 : 320, _canvas ? _canvas.height * 0.3 : 150);
        }
      }
      _refreshPanels();
    } else {
      Toast.show(i18n.t('shop.sell_fail', 'Cannot sell'), 'warning');
    }
  }

  /**
   * Player sells a salvage part from their bag at the current faction shop.
   * Called by MenuBox shop Face 3 (sell-parts pane) keybind.
   * @param {number} bagIndex - Index into Player.state().bag
   */
  function _shopSellPart(bagIndex) {
    if (typeof Shop === 'undefined' || !Shop.isOpen()) return;

    var bag = Player.state().bag;
    var item = bag[bagIndex];
    if (!item || item.type !== 'salvage') return;

    var result = Shop.sellPart(item.id);
    if (result.ok) {
      Toast.show(
        i18n.t('shop.sold', 'Sold') + ' ' + item.emoji + ' ' + item.name +
        ' (+' + result.amount + 'g)',
        'loot'
      );
      AudioSystem.playRandom('coin');
      // Salvage sell — coin burst + salvage spark
      if (typeof ParticleFX !== 'undefined') {
        var cx = _canvas ? _canvas.width / 2 : 320;
        var cy = _canvas ? _canvas.height * 0.5 : 220;
        ParticleFX.salvageSpark(cx, cy);
        if (result.amount >= 15) {
          ParticleFX.coinRain(cx, cy - 20, result.amount);
        } else {
          ParticleFX.coinBurst(cx, cy, Math.max(3, Math.floor(result.amount / 3)));
        }
      }
      HUD.updatePlayer(Player.state());
      if (typeof DebriefFeed !== 'undefined') DebriefFeed.logEvent('Sold ' + item.emoji + ' +' + result.amount + 'g', 'loot');

      // Rep tier changed — show toast + level-up particles
      if (result.repResult && result.repResult.tierChanged) {
        var fLabel = Shop.getFactionLabel(Shop.getCurrentFaction());
        Toast.show(fLabel + ' Rep Tier ' + result.repResult.newTier + '!', 'info');
        if (typeof ParticleFX !== 'undefined') {
          ParticleFX.levelUp(_canvas ? _canvas.width / 2 : 320, _canvas ? _canvas.height * 0.3 : 150);
        }
      }
      _refreshPanels();
    } else {
      Toast.show(i18n.t('shop.sell_fail', 'Cannot sell'), 'warning');
    }
  }

  // ── Equip / Unequip / Stash ───────────────────────────────────────

  /**
   * Equip an item from bag into the appropriate quick-slot.
   * Slot auto-detection: consumable→1, key→2, equipment/other→0 (weapon).
   * @param {number} bagIndex
   */
  function _equipFromBag(bagIndex) {
    var bag = Player.state().bag;
    var item = bag[bagIndex];
    if (!item) return;

    // Auto-detect target slot from item type
    var slot = 0;  // default: weapon
    if (item.type === 'consumable' || item.subtype === 'food' || item.subtype === 'vice') slot = 1;
    if (item.type === 'key') slot = 2;

    var prev = Player.equip(bagIndex, slot);
    if (prev) {
      Toast.show(item.emoji + ' ' + i18n.t('inv.equipped', 'equipped') +
                 ' ← ' + prev.emoji, 'info');
    } else {
      Toast.show(item.emoji + ' ' + i18n.t('inv.equipped', 'equipped'), 'info');
    }
    AudioSystem.play('pickup-success');
    // Equip sparkle at viewport center
    if (typeof ParticleFX !== 'undefined') {
      ParticleFX.equipFlash(_canvas ? _canvas.width / 2 : 320, _canvas ? _canvas.height * 0.35 : 170);
    }
    HUD.updatePlayer(Player.state());
    _refreshPanels();
  }

  /**
   * Unequip an item from a quick-slot back to bag.
   * @param {number} slot - 0=weapon, 1=consumable, 2=key
   */
  function _unequipSlot(slot) {
    var item = Player.state().equipped[slot];
    if (!item) return;

    if (!Player.unequip(slot)) {
      Toast.show(i18n.t('inv.bag_full', 'Bag is full!'), 'warning');
      return;
    }
    Toast.show(item.emoji + ' ' + i18n.t('inv.unequipped', 'unequipped'), 'dim');
    AudioSystem.playRandom('coin');
    HUD.updatePlayer(Player.state());
    _refreshPanels();
  }

  /**
   * Move a bag item to stash (bonfire context only).
   * @param {number} bagIndex
   */
  function _bagToStash(bagIndex) {
    var bag = Player.state().bag;
    var item = bag[bagIndex];
    if (!item) return;

    if (!Player.addToStash(item)) {
      Toast.show(i18n.t('inv.stash_full', 'Stash is full!'), 'warning');
      return;
    }
    // Remove from bag (splice directly — Player.removeFromBag uses id lookup)
    bag.splice(bagIndex, 1);

    Toast.show(item.emoji + ' → ' + i18n.t('inv.stash', 'Stash'), 'info');
    AudioSystem.play('pickup-success');
    HUD.updatePlayer(Player.state());
    _refreshPanels();
  }

  /**
   * Move a stash item to bag (bonfire context only).
   * @param {number} stashIndex
   */
  function _stashToBag(stashIndex) {
    var stash = Player.state().stash;
    var item = stash[stashIndex];
    if (!item) return;

    if (!Player.addToBag(item)) {
      Toast.show(i18n.t('inv.bag_full', 'Bag is full!'), 'warning');
      return;
    }
    // Remove from stash
    stash.splice(stashIndex, 1);

    Toast.show(item.emoji + ' → ' + i18n.t('inv.bag', 'Bag'), 'info');
    AudioSystem.play('pickup-success');
    HUD.updatePlayer(Player.state());
    _refreshPanels();
  }

  // ── Bonfire warp (teleport to another floor) ─────────────────────

  function _warpToFloor(targetFloorId) {
    // Close the pause/bonfire menu first
    ScreenManager.toGame();

    // Determine direction — ascending if target is shallower
    var srcDepth = FloorManager.getFloor().split('.').length;
    var tgtDepth = targetFloorId.split('.').length;
    var dir = (tgtDepth <= srcDepth) ? 'retreat' : 'advance';

    Toast.show('\u2728 ' + i18n.t('bonfire.warping', 'Warping...'), 'info');
    FloorTransition.go(targetFloorId, dir);
  }

  // ── Incinerator (burn focused item/card for small coin refund) ────

  function _incinerateFromFocus() {
    // Determine which wheel has focus in the inventory face
    var focus = (typeof MenuFaces !== 'undefined') ? MenuFaces.getInvFocus() : 'bag';
    var offset = (typeof MenuFaces !== 'undefined') ? MenuFaces.getBagOffset() : 0;

    if (focus === 'bag') {
      var bag = Player.getBag();
      // Incinerate the first visible bag item (at current scroll offset)
      var item = bag[offset];
      if (!item) { Toast.show(i18n.t('inv.nothing_burn', 'Nothing to burn'), 'warning'); return; }
      bag.splice(offset, 1);
      var refund = item.value ? Math.max(1, Math.floor(item.value * 0.1)) : 1;
      Player.addCurrency(refund);
      Toast.show('\uD83D\uDD25 ' + (item.emoji || '') + ' ' + (item.name || 'Item') + ' \u2192 ' + refund + 'g', 'warning');
    } else {
      // Deck focus — incinerate from backup deck
      var deckOff = (typeof MenuFaces !== 'undefined') ? MenuFaces.getDeckOffset() : 0;
      var collection = (typeof CardSystem !== 'undefined') ? CardSystem.getCollection() : [];
      var card = collection[deckOff];
      if (!card) { Toast.show(i18n.t('inv.nothing_burn', 'Nothing to burn'), 'warning'); return; }
      if (typeof CardSystem !== 'undefined') CardSystem.removeCard(card.id);
      var cardRefund = card.rarity === 'rare' ? 5 : (card.rarity === 'uncommon' ? 3 : 1);
      Player.addCurrency(cardRefund);
      Toast.show('\uD83D\uDD25 ' + (card.emoji || '\uD83C\uDCA0') + ' ' + (card.name || 'Card') + ' \u2192 ' + cardRefund + 'g', 'warning');
    }

    AudioSystem.play('incinerator');
    HUD.updatePlayer(Player.state());
    _refreshPanels();
  }

  // ── Deck management actions (B5.4) ────────────────────────────────

  function _handToBackup(handIndex) {
    var hand = CardSystem.getHand();
    var card = hand[handIndex];
    if (!card) return;

    // Remove from hand
    Player.removeFromHand(handIndex);

    // Add to collection (backup deck) via CardSystem.addCard
    if (typeof CardSystem !== 'undefined') {
      CardSystem.addCard(card);
    }

    var emoji = card.emoji || '\uD83C\uDCA0';
    Toast.show(emoji + ' \u2192 Backup Deck', 'info');
    if (typeof AudioSystem !== 'undefined') AudioSystem.play('card-whoosh');
    _refreshPanels();
  }

  function _backupToHand(deckIndex) {
    var hand = CardSystem.getHand();
    if (hand.length >= Player.MAX_HAND) {
      Toast.show(i18n.t('inv.hand_full', 'Hand is full! (5/5)'), 'warning');
      return;
    }

    var collection = (typeof CardSystem !== 'undefined')
      ? CardSystem.getCollection() : [];
    var card = collection[deckIndex];
    if (!card) return;

    // Remove from collection by id
    if (typeof CardSystem !== 'undefined') {
      CardSystem.removeCard(card.id);
    }

    // Add to hand
    Player.addToHand(card);

    var emoji = card.emoji || '\uD83C\uDCA0';
    Toast.show(emoji + ' \u2192 Hand', 'info');
    if (typeof AudioSystem !== 'undefined') AudioSystem.play('card-whoosh');
    _refreshPanels();
  }

  // ── Tick (game logic at 10fps — enemies, aggro) ────────────────────

  function _tick(deltaMs) {
    // Screen animations update in _render() (per-frame delta).
    // _tick() is only for fixed-rate game logic (enemies, aggro).
    var state = ScreenManager.getState();
    if (state !== ScreenManager.STATES.GAMEPLAY || !_gameplayReady) return;
    if (CombatEngine.isActive() || FloorTransition.isTransitioning()) return;

    var floorData = FloorManager.getFloorData();
    var enemies = FloorManager.getEnemies();
    var p = Player.state();
    var hasNpcSystem = typeof NpcSystem !== 'undefined';

    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].hp <= 0) continue;
      // NpcSystem entities get patrol/bark tick instead of enemy AI
      if (enemies[i].npcType && hasNpcSystem) continue;
      EnemyAI.updateEnemy(enemies[i], p, floorData.grid, floorData.gridW, floorData.gridH, deltaMs);
    }

    // NPC patrol + proximity bark tick (runs alongside enemy AI at 10fps)
    if (hasNpcSystem) {
      NpcSystem.tick(
        { x: p.x, y: p.y },
        enemies,
        deltaMs,
        floorData.grid
      );
    }

    CombatBridge.checkEnemyAggro(p.x, p.y);

    // ── Fire crackle ambient (proximity-based) ──
    // Check tiles within 3 Manhattan distance for bonfire/hearth/bed.
    // Play crackle at volume scaled by inverse distance.
    _fireCrackleTimer = (_fireCrackleTimer || 0) + deltaMs;
    if (_fireCrackleTimer >= 2000) {  // Check every 2s
      _fireCrackleTimer = 0;
      var px = Math.round(p.x), py = Math.round(p.y);
      var grid = floorData.grid;
      var gw = floorData.gridW, gh = floorData.gridH;
      var nearestDist = 99;
      for (var fy = Math.max(0, py - 3); fy <= Math.min(gh - 1, py + 3); fy++) {
        for (var fx = Math.max(0, px - 3); fx <= Math.min(gw - 1, px + 3); fx++) {
          var ft = grid[fy][fx];
          if (ft === TILES.BONFIRE || ft === TILES.HEARTH || ft === TILES.BED) {
            var md = Math.abs(fx - px) + Math.abs(fy - py);
            if (md < nearestDist) nearestDist = md;
          }
        }
      }
      if (nearestDist <= 3) {
        var vol = Math.max(0.1, 1 - nearestDist / 4);
        AudioSystem.play('fire_crackle', { volume: vol });
      }
    }
  }

  // ── Render (every frame — input, movement, draw) ───────────────────

  function _render(alpha) {
    var S = ScreenManager.STATES;
    var state = ScreenManager.getState();

    var now = performance.now();
    var frameDt = now - _lastFrameTime;
    _lastFrameTime = now;
    if (frameDt > 100) frameDt = 100;

    // ── Non-gameplay screens: render on canvas, return early ──

    if (state === S.SPLASH) {
      SplashScreen.update(frameDt);
      SplashScreen.render();
      return;
    }

    if (state === S.TITLE) {
      TitleScreen.update(frameDt);
      TitleScreen.render();
      return;
    }

    if (state === S.GAME_OVER) {
      // Render frozen game world underneath
      if (_gameplayReady) _renderGameplay(frameDt);
      GameOverScreen.update(frameDt);
      GameOverScreen.render();
      return;
    }

    if (state === S.VICTORY) {
      if (_gameplayReady) _renderGameplay(frameDt);
      VictoryScreen.update(frameDt);
      VictoryScreen.render();
      return;
    }

    if (state === S.PAUSE) {
      // MenuBox renders over frozen world
      MenuBox.update(frameDt);
      var ctx = _canvas.getContext('2d');
      MenuBox.render(ctx, _canvas.width, _canvas.height);
      // Drag-drop ghost overlay (renders above pause menu)
      if (typeof DragDrop !== 'undefined') DragDrop.render(ctx);
      // Toast overlay (feedback during inventory drags)
      Toast.update(frameDt);
      Toast.render(ctx, _canvas.width, _canvas.height);
      // Particle FX overlay (coin bursts during shop/inventory)
      if (typeof ParticleFX !== 'undefined') {
        ParticleFX.update();
        ParticleFX.render(ctx);
      }
      return;
    }

    // ── Gameplay rendering ──

    if (state === S.GAMEPLAY && _gameplayReady) {
      // Update animated textures (porthole ocean compositing) before render
      if (typeof TextureAtlas !== 'undefined' && TextureAtlas.tick) {
        TextureAtlas.tick(frameDt);
      }
      _renderGameplay(frameDt);

      // UI overlays (after world, before HUD z-layer)
      var ctx = _canvas.getContext('2d');
      TransitionFX.update(frameDt);
      TransitionFX.render(ctx, _canvas.width, _canvas.height);

      // Door transition text overlay (destination label + exit text)
      if (typeof DoorAnimator !== 'undefined' && DoorAnimator.isAnimating()) {
        DoorAnimator.renderOverlay(ctx, _canvas.width, _canvas.height);
      }

      // Death animations (origami fold / poof — above world, below cards)
      if (typeof DeathAnim !== 'undefined') {
        DeathAnim.update(frameDt);
        DeathAnim.render(ctx, _canvas.width, _canvas.height);
      }

      CardFan.update(frameDt);
      CardFan.render(ctx, _canvas.width, _canvas.height);
      InteractPrompt.check();
      InteractPrompt.update(frameDt);
      InteractPrompt.render(ctx, _canvas.width, _canvas.height);

      // C2: Readiness HUD bar (dungeon floors only)
      HUD.renderReadinessBar(ctx, _canvas.width, _canvas.height, FloorManager.getCurrentFloorId());
      if (typeof DoorPeek        !== 'undefined') DoorPeek.update(frameDt);
      if (typeof LockedDoorPeek !== 'undefined') LockedDoorPeek.update(frameDt);
      if (typeof CratePeek     !== 'undefined') CratePeek.update(frameDt);
      if (typeof ChestPeek    !== 'undefined') ChestPeek.update(frameDt);
      if (typeof CorpsePeek   !== 'undefined') CorpsePeek.update(frameDt);
      if (typeof MerchantPeek !== 'undefined') MerchantPeek.update(frameDt);
      if (typeof PuzzlePeek   !== 'undefined') PuzzlePeek.update(frameDt);
      if (typeof BookshelfPeek !== 'undefined') BookshelfPeek.update(frameDt);
      if (typeof BarCounterPeek !== 'undefined') BarCounterPeek.update(frameDt);
      if (typeof BedPeek !== 'undefined') BedPeek.update(frameDt);
      if (typeof MailboxPeek !== 'undefined') MailboxPeek.update(frameDt);
      if (typeof StatusEffectHUD !== 'undefined') StatusEffectHUD.update();

      // PeekSlots update (SEALED auto-dismiss timer + zone bounds sync)
      if (typeof PeekSlots !== 'undefined') PeekSlots.update(frameDt);
      DialogBox.update(frameDt);
      DialogBox.render(ctx, _canvas.width, _canvas.height);
      Toast.update(frameDt);
      Toast.render(ctx, _canvas.width, _canvas.height);

      // Particle FX overlay (coins, sparkles, item poof)
      if (typeof ParticleFX !== 'undefined') {
        ParticleFX.update();
        ParticleFX.render(ctx);
      }

      // CrateUI slot overlay (renders during PeekSlots FILLING state)
      if (typeof CrateUI !== 'undefined' && CrateUI.isOpen()) {
        CrateUI.update(frameDt);
        CrateUI.render(ctx, _canvas.width, _canvas.height);
      }

      // Drag-drop ghost overlay (renders above all other UI)
      if (typeof DragDrop !== 'undefined') DragDrop.render(ctx);

      // Combat report (DOM overlay, ticks auto-dismiss timer)
      if (typeof CombatReport !== 'undefined') {
        CombatReport.update(frameDt);
      }
    }
  }

  /** Render the 3D world + minimap (extracted for reuse by overlays). */
  function _renderGameplay(frameDt) {
    // Tick combat bridge (facing timer + CombatEngine phase auto-advance)
    CombatBridge.update(frameDt);

    var floorData = FloorManager.getFloorData();
    if (!floorData) return;

    // Poll input → drives MovementController
    if (ScreenManager.isPlaying()) {
      InputPoll.poll();
    }

    // Tick movement animation
    MC.tick(frameDt);

    // Smooth mouse free-look (acceleration + exponential lerp)
    if (typeof MouseLook !== 'undefined' && MouseLook.tick) MouseLook.tick();

    // Get interpolated render position
    var renderPos = MC.getRenderPos();
    var p = Player.state();

    // Calculate lighting
    var lightMap = Lighting.calculate(p, floorData.grid, floorData.gridW, floorData.gridH);

    // Build sprite list (with enemy sprite stage system)
    var enemies = FloorManager.getEnemies();
    var now = performance.now();
    _sprites.length = 0;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hp <= 0) continue;
      var aState = EnemyAI.getAwarenessState(e.awareness);

      // ── Smooth lerp: advance interpolation timer and compute render position ──
      // _prevX/_prevY are set when movement occurs; _lerpT animates 0→1.
      // Lerp duration scales with the entity's step interval for natural pacing.
      var lerpDur = e._stepInterval || (e.friendly ? 800 : 400);
      if (e._lerpT !== undefined && e._lerpT < 1) {
        e._lerpT = Math.min(1, e._lerpT + frameDt / lerpDur);
      }
      var renderX, renderY;
      if (e._prevX !== undefined && e._lerpT !== undefined && e._lerpT < 1) {
        // Ease-out cubic for natural deceleration
        var t = e._lerpT;
        var eased = 1 - (1 - t) * (1 - t) * (1 - t);
        renderX = e._prevX + (e.x - e._prevX) * eased;
        renderY = e._prevY + (e.y - e._prevY) * eased;
      } else {
        renderX = e.x;
        renderY = e.y;
      }

      // Use EnemySprites system for visual state if available
      var spriteEmoji = e.emoji;
      var spriteStack = null;
      var spriteGlow = null;
      var spriteGlowR = 0;
      var spriteTint = null;
      var spriteParticle = null;
      var spriteOverlay = null;
      var spriteBobY = 0;
      var spriteScaleAdd = 0;
      var spriteStackFX = null;
      if (typeof EnemySprites !== 'undefined') {
        var frame = EnemySprites.computeFrame(e, now);
        spriteEmoji = frame.emoji;
        spriteStack = frame.stack;
        spriteStackFX = frame.stackFX;
        spriteGlow = frame.glowColor;
        spriteGlowR = frame.glowRadius || 0;
        spriteTint = frame.tint;
        spriteParticle = frame.particleEmoji;
        spriteOverlay = frame.overlayText;
        spriteBobY = frame.bobY || 0;
        spriteScaleAdd = frame.scaleAdd || 0;
      }
      // NPC fallback: if EnemySprites didn't resolve a stack but the
      // entity carries one (from NpcComposer), use it directly.
      if (!spriteStack && e.stack) {
        spriteStack = {
          head:   e.stack.head   || '',
          torso:  e.stack.torso  || '',
          legs:   e.stack.legs   || '',
          hat:    e.stack.hat ? { emoji: e.stack.hat, scale: e.stack.hatScale || 0.5, behind: !!e.stack.hatBehind } : null,
          backWeapon:  e.stack.backWeapon  ? { emoji: e.stack.backWeapon,  scale: e.stack.backWeaponScale || 0.4,  offsetX: e.stack.backWeaponOffsetX || 0.3 }  : null,
          frontWeapon: e.stack.frontWeapon ? { emoji: e.stack.frontWeapon, scale: e.stack.frontWeaponScale || 0.65, offsetX: e.stack.frontWeaponOffsetX || -0.25 } : null,
          headMods:  e.stack.headMods  || null,
          torsoMods: e.stack.torsoMods || null,
          tintHue: e.stack.tintHue
        };
        spriteEmoji = e.stack.head || e.emoji;
      }

      _sprites.push({
        x: renderX, y: renderY,
        id: e.id,                         // Pass 8: intent telegraph match
        emoji: spriteEmoji,
        stack: spriteStack,               // Triple emoji stack (null = legacy)
        stackFX: spriteStackFX,           // Per-stack FX data (null = none)
        color: aState.color,
        scale: e.isElite ? 0.8 : 0.6,
        facing: e.facing,
        awareness: e.awareness,
        glow: spriteGlow,
        glowRadius: spriteGlowR,
        tint: spriteTint,
        particleEmoji: spriteParticle,
        overlayText: spriteOverlay,
        bobY: spriteBobY,
        scaleAdd: spriteScaleAdd
      });
    }

    // ── Vendor NPC sprites (behind counter, facing player) ──────────
    if (typeof NpcComposer !== 'undefined' && floorData.shops) {
      for (var vi = 0; vi < floorData.shops.length; vi++) {
        var shopEntry = floorData.shops[vi];
        var vendorStack = NpcComposer.getVendorPreset(shopEntry.factionId);
        if (vendorStack) {
          // Determine facing toward nearest walkable neighbor
          var vendorFacing = shopEntry.facing || 'south';
          _sprites.push({
            x: shopEntry.x, y: shopEntry.y,
            id: 'vendor_' + shopEntry.factionId,
            emoji: vendorStack.head || vendorStack.torso || '🧙',
            stack: {
              head:   vendorStack.head   || '',
              torso:  vendorStack.torso  || '',
              legs:   vendorStack.legs   || '',
              hat:    vendorStack.hat    ? { emoji: vendorStack.hat, scale: vendorStack.hatScale || 0.5, behind: !!vendorStack.hatBehind } : null,
              backWeapon:  vendorStack.backWeapon  ? { emoji: vendorStack.backWeapon,  scale: vendorStack.backWeaponScale || 0.4,  offsetX: vendorStack.backWeaponOffsetX || 0.3 }  : null,
              frontWeapon: vendorStack.frontWeapon ? { emoji: vendorStack.frontWeapon, scale: vendorStack.frontWeaponScale || 0.65, offsetX: vendorStack.frontWeaponOffsetX || -0.25 } : null,
              headMods:  vendorStack.headMods  || null,
              torsoMods: vendorStack.torsoMods || null,
              tintHue: vendorStack.tintHue
            },
            color: null,
            scale: 0.7,
            facing: vendorFacing,
            awareness: 0,
            counterOcclude: true,
            glow: null, glowRadius: 0, tint: null,
            particleEmoji: null, overlayText: null,
            bobY: 0, scaleAdd: 0
          });
        }
      }
    }

    // ── Corpse ground sprites (A2 evolved: CorpseRegistry entities) ──
    // Build sprites from the registry — each corpse retains its defeated
    // enemy's folded origami appearance until looted dry (→ bone).
    if (typeof CorpseRegistry !== 'undefined') {
      var floorId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '1.3.1';
      var corpseSprites = CorpseRegistry.buildSprites(floorId);
      for (var ci = 0; ci < corpseSprites.length; ci++) {
        _sprites.push(corpseSprites[ci]);
      }
    }

    // Tick door-open animation (before raycaster reads its state)
    if (typeof DoorAnimator !== 'undefined') DoorAnimator.update(frameDt);

    // Tick combat viewport FX (lunge/pulse/flash timers)
    if (typeof CombatFX !== 'undefined') CombatFX.update(frameDt);

    // ── Sync KaomojiCapsule from intent + dialogue systems ──
    if (typeof KaomojiCapsule !== 'undefined') {
      // Combat intent → capsule
      if (typeof EnemyIntent !== 'undefined' && EnemyIntent.isActive()) {
        KaomojiCapsule.updateFromIntent(EnemyIntent.getRenderData());
      }
      // NPC speech → capsule (start when dialog opens, stop when it closes)
      if (typeof DialogBox !== 'undefined') {
        var speakerId = DialogBox.getActiveSpeakerId();
        if (speakerId !== null && !KaomojiCapsule.isActive(speakerId)) {
          KaomojiCapsule.startSpeech(speakerId);
          _lastSpeechSpriteId = speakerId;
        } else if (speakerId === null && _lastSpeechSpriteId !== null) {
          KaomojiCapsule.stopSpeech(_lastSpeechSpriteId);
          _lastSpeechSpriteId = null;
        }
      }
    }

    // Raycaster render — apply combat zoom if active
    var combatZoom = (typeof CombatFX !== 'undefined') ? CombatFX.getZoom() : 1;
    var ctx = _canvas.getContext('2d');
    if (combatZoom !== 1) {
      ctx.save();
      ctx.translate(_canvas.width / 2, _canvas.height / 2);
      ctx.scale(combatZoom, combatZoom);
      ctx.translate(-_canvas.width / 2, -_canvas.height / 2);
    }

    Raycaster.render(
      { x: renderPos.x, y: renderPos.y, dir: renderPos.angle + p.lookOffset,
        bobY: MC.getBobY() },
      floorData.grid, floorData.gridW, floorData.gridH,
      _sprites, lightMap
    );

    if (combatZoom !== 1) ctx.restore();

    // Cobweb rendering (after raycaster, before minimap)
    var _cobFloorId = FloorManager.getCurrentFloorId();
    var _cobPlayer = { x: renderPos.x, y: renderPos.y, dir: renderPos.angle + p.lookOffset };
    if (typeof CobwebRenderer !== 'undefined') {
      CobwebRenderer.render(ctx, _canvas.width, _canvas.height, _cobPlayer, _cobFloorId);
    }
    if (typeof CobwebNode !== 'undefined') {
      CobwebNode.update(frameDt, _cobFloorId);
      CobwebNode.render(ctx, _canvas.width, _canvas.height, _cobPlayer);
    }

    // World-space popups (interaction feedback at tile positions)
    if (typeof WorldPopup !== 'undefined') {
      WorldPopup.update(frameDt);
      WorldPopup.render(ctx, _canvas.width, _canvas.height, _cobPlayer);
    }

    // Minimap render
    Minimap.render(
      { x: p.x, y: p.y, dir: MC.dirToAngle(p.dir) },
      floorData.grid, floorData.gridW, floorData.gridH,
      enemies
    );
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Request a pause with a specific context and starting face.
   * Called by external modules (StatusBar, NchWidget) that need to
   * open the menu on a particular face.
   *
   * @param {string} context  - 'pause', 'bonfire', 'shop', 'harvest'
   * @param {number} [face=0] - Starting face index (0-3)
   */
  function requestPause(context, face) {
    if (!ScreenManager.isPlaying()) return;
    _pendingMenuContext = context || 'pause';
    _pendingMenuFace = face || 0;
    ScreenManager.toPause();
  }

  return {
    init: init,
    requestPause: requestPause,
    isGateUnlocked: function () { return _gateUnlocked; }
  };
})();

// ── Boot ──
window.addEventListener('DOMContentLoaded', function () {
  Game.init();
});