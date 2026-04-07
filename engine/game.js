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

  // Bonfire interaction cooldown — prevents re-triggering rest+menu loop
  // when player is still facing bonfire after closing the menu. Without
  // this, every OK press immediately re-opens the bonfire menu (trap).
  var _bonfireCooldownMs = 0;
  var _bonfirePendingX = -1;   // Bonfire tile position for deferred rest
  var _bonfirePendingY = -1;   // (rest executes from menu, not from interact)

  // Corpse-restock state — delegated to CorpseActions module
  // Dispatcher choreography state — delegated to DispatcherChoreography module

  var _gateUnlocked = false;       // Has the player retrieved their work keys?
  var _hoseEnergyPrior = 0;        // PW-2: last-seen HoseState.getEnergyDrained()

  // ── Sprint 2: Floor transition tracking for DayCycle ──────────────
  var _previousFloorId = null;

  // ── Curfew exit guard + home door rest state ──────────────────────
  var _curfewExitConfirmed = false;
  var _homeDoorRestOffered = false;
  var _dayCyclePausedBeforeMenu = false;

  // ── Fire crackle ambient timer ──────────────────────────────────
  var _fireCrackleTimer = 0;
  var _bonfireGlowTimer = 0;

  // ── Passive time drip timer (exterior floors) ──────────────────
  var _passiveTimeTimer = 0;

  // ── Hero Wake cinematic state — delegated to HeroWake module ────
  // HeroWake.getState() returns { phase, combatTrigger, triggerSpawned }
  // Local alias used by _tick for the cinematic lock + warden spawn.

  // ── Initialization ─────────────────────────────────────────────────

  function init() {
    _canvas = document.getElementById('view-canvas');

    // Wire shared helpers module
    GameActions.init({ canvas: _canvas, gateUnlocked: _gateUnlocked });

    // Wire Phase 2 extracted modules
    if (typeof HomeEvents !== 'undefined') {
      HomeEvents.init({ isGateUnlocked: _gateUnlocked, onKeysPickedUp: _updateQuestTarget });
    }
    if (typeof CorpseActions !== 'undefined') {
      CorpseActions.init({
        requestPause: function (ctx, face) {
          _pendingMenuContext = ctx;
          _pendingMenuFace = face;
          ScreenManager.toPause();
        }
      });
    }
    if (typeof DispatcherChoreography !== 'undefined') {
      DispatcherChoreography.init({
        onPickupWorkKeys: _onPickupWorkKeys,
        updateQuestTarget: _updateQuestTarget,
        changeState: function (state) { _changeState(state === 'GAME_OVER' ? S.GAME_OVER : S.GAME_OVER); }
      });
    }
    if (typeof QuestWaypoint !== 'undefined') {
      QuestWaypoint.init({
        getDispatcherPhase: function () {
          return (typeof DispatcherChoreography !== 'undefined') ? DispatcherChoreography.getPhase() : 'done';
        },
        getDispatcherEntity: function () {
          return (typeof DispatcherChoreography !== 'undefined') ? DispatcherChoreography.getEntity() : null;
        },
        findGateDoorPos: function () {
          return (typeof DispatcherChoreography !== 'undefined') ? DispatcherChoreography.findGateDoorPos() : null;
        }
      });
    }

    // ── Phase 1: Core systems (always needed) ──
    if (typeof ItemDB !== 'undefined') ItemDB.init();  // Sync-load data/items.json
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
    if (typeof AudioMusicManager !== 'undefined') AudioMusicManager.init();

    // Debug GIF recorder (F8 start/stop, F9 save last N seconds)
    if (typeof GifRecorder !== 'undefined') {
      GifRecorder.init(_canvas, {
        fps: 12,
        maxWidth: 480,
        rollingEnabled: true,
        rollingSeconds: 6,
        quality: 10,
        workers: 2,
        captureConsole: true,
        consoleMaxSeconds: 30
      });
    }

    // Wire BarkLibrary display function — routes barks to StatusBar tooltip
    // space (bottom footer) for persistent history, with DialogBox fallback
    // for dialog-style barks that need the full conversation UI.
    if (typeof BarkLibrary !== 'undefined') {
      BarkLibrary.setDisplay(function (bark, opts) {
        var style = (opts && opts.style) || bark.style || 'info';
        // All NPC barks — including 'dialog'-style ones — route to the
        // StatusBar inline tooltip footer. DialogBox canvas overlay caused
        // button z-ordering issues (stuck behind status bar) and movement
        // lock when players couldn't reach the dismiss button.
        if (typeof StatusBar !== 'undefined' && StatusBar.pushTooltip) {
          var text = bark.speaker
            ? bark.speaker + ': \u201c' + bark.text + '\u201d'
            : bark.text;
          StatusBar.pushTooltip(text, 'npc');
        } else if (typeof Toast !== 'undefined') {
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

    // ── Wire CardFan external drop → MenuFaces inventory zones ──
    // When a card is dragged out of the fan (non-combat), this handler
    // checks if the pointer lands on a MenuFaces drag zone and executes
    // the transfer. Returns true if handled.
    if (CardFan.setExternalDropHandler) {
      CardFan.setExternalDropHandler(function (info) {
        // info: { cardIdx, card, screenX, screenY }
        if (!ScreenManager.isPaused()) {
          // Not in menu — try direct transfers via screen position
          // For now, only support dropping onto the DECK or BAG button areas
          // by opening the inventory and queuing the transfer.
          // Full menu-open drag is Phase 4b.
          return false;
        }
        // Menu is open — delegate to MenuFaces zone hit test
        if (typeof MenuFaces !== 'undefined' && MenuFaces.handleExternalDrop) {
          return MenuFaces.handleExternalDrop(info);
        }
        return false;
      });
    }

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

    // ── PW-2: Hose drain loop ───────────────────────────────────
    // HoseState is a pure data module — it doesn't touch Player. We wire
    // the energy drain here so the coupling point is visible in one place.
    // Each movement step: recordStep emits 'step' with drainThisStep which
    // we subtract from Player.energy. If energy reaches 0, detach with
    // 'energy_exhausted' so HoseReel/Viewport can clean up.
    if (typeof HoseState !== 'undefined' && HoseState.on) {
      HoseState.on('step', function (_tile, _pathLen) {
        if (typeof Player === 'undefined') return;
        // The drain for the step just recorded = total drained − prior snapshot.
        // We track the previous total on the function itself to avoid re-reading.
        var total = HoseState.getEnergyDrained();
        var prior = _hoseEnergyPrior || 0;
        var dStep = total - prior;
        _hoseEnergyPrior = total;
        if (dStep <= 0) return;
        var spend = Math.max(1, Math.round(dStep));
        Player.spendEnergy(spend);
        if ((Player.state().energy || 0) <= 0) {
          HoseState.detach('energy_exhausted');
          if (typeof Toast !== 'undefined') Toast.show('💨 Hose slipped — out of energy', 'warning');
        }
      });
      HoseState.on('attach', function () {
        _hoseEnergyPrior = 0;
        // Viewport glow hook: ViewportRing polls HoseState.isActive() each frame.
        // PostProcess mist: subtle cool-blue haze while carrying the hose.
        if (typeof PostProcess !== 'undefined' && PostProcess.setHoseMist) {
          PostProcess.setHoseMist(true);
        }
        if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui_confirm', { volume: 0.4 });
        _evaluateCursorFxGating();
      });
      HoseState.on('detach', function (reason) {
        _hoseEnergyPrior = 0;
        _evaluateCursorFxGating();
        // Drop the mist overlay alongside the edge glow.
        if (typeof PostProcess !== 'undefined' && PostProcess.setHoseMist) {
          PostProcess.setHoseMist(false);
        }
        // Victory glow is tied to hose-carry: dropping the hose (manually
        // or via energy exhaustion / subtree exit) ends the ceremony. The
        // explicit "roll up hose" evac button will be the clean exit.
        if (typeof ViewportRing !== 'undefined' && ViewportRing.clearVictoryGlow) {
          ViewportRing.clearVictoryGlow();
        }
        // Per-reason snap feedback. 'reeled' is the clean exit (handled by
        // HoseReel's own ceremony) and 'energy_exhausted' toasts from the
        // step handler above — both skipped here. Everything else gets a
        // surfaced message so the player understands why the line dropped.
        if (typeof Toast === 'undefined') return;
        var msg = null;
        switch (reason) {
          case 'wrong_building':
            msg = '💢 Hose snapped — wrong building';
            break;
          case 'dropped_exterior':
            msg = '🧵 Hose dropped — you left without rolling up';
            break;
          case 'combat_damage':
            msg = '💥 Hose ripped off — took a hit';
            break;
          case 'bonfire_warp':
            msg = '✨ Hose left behind — bonfire warp';
            break;
        }
        if (msg) Toast.show(msg, 'warning');
      });
    }
    if (typeof DPad !== 'undefined') {
      DPad.init();
      DPad.setOnInteract(function () { _interact(); });
    }

    // ── IO-8: Chest withdraw callback — detects work-keys pickup ──
    if (typeof CrateUI !== 'undefined' && CrateUI.onWithdraw) {
      CrateUI.onWithdraw(function (item, x, y, floorId) {
        if (item && item.subtype === 'work_keys' && !_gateUnlocked) {
          _onPickupWorkKeys();
        }
      });
    }

    // ── Phase 3: ScreenManager transition wiring ──
    ScreenManager.onChange(_onScreenChange);

    // ── ESC toggle: pause ↔ gameplay ──
    InputManager.on('pause', function (type) {
      if (type !== 'press') return;

      // CobwebNode intercept: ESC dismisses spider deploy prompt before pause
      if (typeof CobwebNode !== 'undefined' && CobwebNode.isPromptVisible()) {
        if (CobwebNode.handleKey('Escape')) return;
      }

      // PeekSlots intercept: ESC closes slot-filling UI before pause
      if (typeof PeekSlots !== 'undefined' && PeekSlots.isFilling()) {
        PeekSlots.close();
        return;
      }

      // TorchPeek intercept: ESC closes torch slot UI before pause
      if (typeof TorchPeek !== 'undefined' && TorchPeek.isInteracting()) {
        if (typeof CinematicCamera !== 'undefined' && CinematicCamera.isActive()) CinematicCamera.close();
        TorchPeek.handleKey('Escape');
        return;
      }

      // BookshelfPeek intercept: ESC closes book overlay before pause
      if (typeof BookshelfPeek !== 'undefined' && BookshelfPeek.isActive()) {
        if (typeof CinematicCamera !== 'undefined' && CinematicCamera.isActive()) CinematicCamera.close();
        BookshelfPeek.handleKey('Escape');
        return;
      }

      // Self-imposed peek intercepts: ESC dismisses before pause toggle
      if (typeof CratePeek !== 'undefined' && CratePeek.isActive()) {
        CratePeek.handleKey('Escape');
        return;
      }
      if (typeof CorpsePeek !== 'undefined' && CorpsePeek.isActive()) {
        CorpsePeek.handleKey('Escape');
        return;
      }
      if (typeof MerchantPeek !== 'undefined' && MerchantPeek.isActive()) {
        MerchantPeek.handleKey('Escape');
        return;
      }
      if (typeof PuzzlePeek !== 'undefined' && PuzzlePeek.isActive()) {
        PuzzlePeek.handleKey('Escape');
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
        _collapseAllPeeks();
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

    // Turn (A/← and D/→) — snap to adjacent face, UNLESS settings slider
    // is focus-locked (Enter to lock), in which case ←/→ adjusts the slider.
    InputManager.on('turn_left', function (type) {
      if (type !== 'press') return;
      // Dialog button focus: ← moves left
      if (DialogBox.isOpen() && DialogBox.handleKey('left')) return;
      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3 && typeof MenuFaces !== 'undefined' && MenuFaces.isSettingsLocked()) {
        MenuFaces.handleSettingsAdjust(-1);
        return;
      }
      MenuBox.snapLeft();
    });
    InputManager.on('turn_right', function (type) {
      if (type !== 'press') return;
      // Dialog button focus: → moves right
      if (DialogBox.isOpen() && DialogBox.handleKey('right')) return;
      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3 && typeof MenuFaces !== 'undefined' && MenuFaces.isSettingsLocked()) {
        MenuFaces.handleSettingsAdjust(+1);
        return;
      }
      MenuBox.snapRight();
    });

    // W / S — navigate between sliders when Face 3 is active.
    InputManager.on('step_forward', function (type) {
      if (type !== 'press') return;

      // BookshelfPeek intercept: W scrolls long book pages up
      if (typeof BookshelfPeek !== 'undefined' && BookshelfPeek.isActive()) {
        BookshelfPeek.handleKey('KeyW');
        return;
      }

      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3 && typeof MenuFaces !== 'undefined') {
        MenuFaces.handleSettingsNav(-1);
      }
    });
    InputManager.on('step_back', function (type) {
      if (type !== 'press') return;

      // BookshelfPeek intercept: S scrolls long book pages down
      if (typeof BookshelfPeek !== 'undefined' && BookshelfPeek.isActive()) {
        BookshelfPeek.handleKey('KeyS');
        return;
      }

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

    // Scroll wheel — Face 3 slider adjust (+10/-10 per tick) or
    // inventory/face content scroll on other faces (post-jam).
    // This is now the PRIMARY way to adjust sliders (←/→ navigates faces).
    InputManager.on('scroll_up', function (type) {
      // BookshelfPeek intercept: wheel scroll through long book pages
      if (typeof BookshelfPeek !== 'undefined' && BookshelfPeek.isActive()) {
        if (typeof DialogBox !== 'undefined' && DialogBox.scroll) DialogBox.scroll(-1);
        return;
      }
      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3 && typeof MenuFaces !== 'undefined') {
        if (MenuFaces.isSettingsLocked()) {
          MenuFaces.handleSettingsAdjust(+10);
        } else {
          MenuFaces.handleSettingsScroll(-30);
        }
      }
    });
    InputManager.on('scroll_down', function (type) {
      if (typeof BookshelfPeek !== 'undefined' && BookshelfPeek.isActive()) {
        if (typeof DialogBox !== 'undefined' && DialogBox.scroll) DialogBox.scroll(+1);
        return;
      }
      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3 && typeof MenuFaces !== 'undefined') {
        if (MenuFaces.isSettingsLocked()) {
          MenuFaces.handleSettingsAdjust(-10);
        } else {
          MenuFaces.handleSettingsScroll(30);
        }
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
            // RS-1: route through RestockBridge if active, else legacy CrateUI
            if (typeof RestockBridge !== 'undefined' && RestockBridge.isActive()) {
              RestockBridge.handleKey(String(slot + 1));
            } else if (typeof CrateUI !== 'undefined') {
              CrateUI.handleKey(String(slot + 1));
            }
            return;
          }

          // TorchPeek intercept: number keys fill torch slots during interaction
          if (typeof TorchPeek !== 'undefined' && TorchPeek.isInteracting()) {
            TorchPeek.handleKey('Digit' + (slot + 1));
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
          } else if (hit.action === 'buy_supply') {
            _shopBuySupply(hit.slot - 1000);  // strip 1000 offset → supply index
          } else if (hit.action === 'deposit_bag_item') {
            _corpseDepositBagItem(hit.slot - 1100);  // strip 1100 offset → bag index
          } else if (hit.action === 'deposit_hand_card') {
            _corpseDepositHandCard(hit.slot - 1200);  // strip 1200 offset → hand index
          } else if (hit.action === 'corpse_seal') {
            _corpseSeal();
          } else if (hit.action === 'sell') {
            _shopSellFromHand(hit.slot);
          } else if (hit.action === 'sellPart') {
            _shopSellPart(hit.slot - 400);  // strip offset
          } else if (hit.action === 'equip') {
            _equipFromBag(hit.slot - 200);  // strip offset
          } else if (hit.action === 'unequip') {
            _unequipSlot(hit.slot - 100);   // strip offset
          } else if (hit.action === 'stash' || hit.action === 'bag-to-stash') {
            _bagToStash(hit.slot - 300);    // strip offset
          } else if (hit.action === 'unstash' || hit.action === 'stash-to-bag') {
            _stashToBag(hit.slot - (hit.action === 'stash-to-bag' ? 500 : 400));
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
          } else if (hit.action === 'book_scroll_up') {
            if (typeof MenuFaces !== 'undefined') MenuFaces.scrollBooks(-1);
          } else if (hit.action === 'book_scroll_down') {
            if (typeof MenuFaces !== 'undefined') MenuFaces.scrollBooks(+1);
          } else if (hit.action === 'read_book') {
            // Open the book from the journal's read-book list
            var bookIdx = hit.slot - 900;
            if (typeof BookshelfPeek !== 'undefined' && BookshelfPeek.getCatalog) {
              var allCat = BookshelfPeek.getCatalog();
              var readList = [];
              for (var rbi = 0; rbi < allCat.length; rbi++) {
                if (typeof Player !== 'undefined' && Player.hasFlag('book_read_' + allCat[rbi].id)) {
                  readList.push(allCat[rbi]);
                }
              }
              if (readList[bookIdx]) {
                var bkOpen = readList[bookIdx];
                // Close menu, then show the book in DialogBox
                if (typeof MenuBox !== 'undefined' && MenuBox.close) MenuBox.close();
                if (typeof DialogBox !== 'undefined' && DialogBox.show) {
                  var pg = bkOpen.pages || [];
                  var pageText = (bkOpen.icon || '') + ' ' + (bkOpen.title || bkOpen.id) + '\n\n' + (pg[0] || '');
                  DialogBox.show(pageText, { priority: 2 });
                }
              }
            }
          } else if (hit.action === 'expand_bag') {
            if (typeof MenuFaces !== 'undefined') MenuFaces.toggleBagExpand();
          } else if (hit.action === 'expand_deck') {
            if (typeof MenuFaces !== 'undefined') MenuFaces.toggleDeckExpand();
          } else if (hit.action === 'incinerator') {
            _incinerateFromFocus();
          } else if (hit.action === 'rest') {
            // Bonfire rest — deferred execution from menu button
            if (_bonfirePendingX >= 0 && _bonfirePendingY >= 0) {
              HazardSystem.restAtBonfire(_bonfirePendingX, _bonfirePendingY);
              // Bonfire position consumed — prevent double-rest
              _bonfirePendingX = -1;
              _bonfirePendingY = -1;
            }
          } else if (hit.action === 'warp' && hit.warpTarget) {
            // §9f: Confirm dialog before warping
            var _wt = hit.warpTarget;
            if (typeof DialogBox !== 'undefined' && DialogBox.show) {
              var flId = (typeof FloorManager !== 'undefined') ? FloorManager.getCurrentFloorId() : '';
              var dpt  = flId ? flId.split('.').length : 1;
              var msg;
              if (dpt >= 3) {
                // Check if this is a completed floor (100% readiness)
                var warpScore = (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.getCoreScore)
                  ? ReadinessCalc.getCoreScore(flId) : 0;
                msg = warpScore >= 1.0
                  ? i18n.t('dragonfire.warp_confirm_reset', 'Dungeon reset complete. Return to entrance?')
                  : i18n.t('dragonfire.warp_confirm_dungeon', 'Leave this dungeon? Progress will be saved.');
              } else {
                msg = i18n.t('dragonfire.warp_confirm_home', 'Warp home? You can return here later.');
              }
              DialogBox.show({
                text: msg,
                speaker: '🐉',
                instant: true,
                buttons: [{ label: i18n.t('ui.confirm', 'Yes'), cb: function () { _warpToFloor(_wt); } }]
              });
            } else {
              _warpToFloor(_wt);
            }
          } else if (hit.action === 'resume') {
            // Return to Game / Close menu
            if (typeof MenuBox !== 'undefined') MenuBox.close();
          } else if (hit.action === 'quit_title') {
            // Quit to title screen
            if (typeof MenuBox !== 'undefined') MenuBox.close();
            if (typeof ScreenManager !== 'undefined') ScreenManager.toTitle();
          } else if (hit.action === 'toggle' && hit.toggleKey) {
            // Face 3 toggle settings
            if (typeof MenuFaces !== 'undefined') {
              MenuFaces.handleSettingsToggle(hit.toggleKey);
            }
          } else if (hit.action === 'cycle_language') {
            // Face 3 language cycle
            if (typeof MenuFaces !== 'undefined' && MenuFaces.handleLanguageCycle) {
              MenuFaces.handleLanguageCycle();
            }
          } else if (hit.action === 'slider_click') {
            // Face 3 slider click-to-set — select row AND jump value
            var sliderIdx = hit.slot - 800;
            if (typeof MenuFaces !== 'undefined' && sliderIdx >= 0 && sliderIdx < 3) {
              MenuFaces.handleSettingsSelectRow(sliderIdx);
              // Calculate volume from click position on the track
              var slPtr = InputManager.getPointer ? InputManager.getPointer() : null;
              if (slPtr && slPtr.active && hit.x !== undefined && hit.w > 0) {
                var pct = Math.max(0, Math.min(100,
                  Math.round(((slPtr.x - hit.x) / hit.w) * 100)));
                MenuFaces.handleSettingsSetValue(sliderIdx, pct);
              }
            }
          }
        }
        return;
      }
      // CrateUI click during PeekSlots FILLING — route to slot hit-test
      if (typeof CrateUI !== 'undefined' && CrateUI.isOpen() && CrateUI.handleClick) {
        var ptr = InputManager.getPointer ? InputManager.getPointer() : null;
        if (ptr && CrateUI.handleClick(ptr.x, ptr.y)) {
          return;
        }
      }
      // CobwebNode click during gameplay — deploy spider via pointer
      if (typeof CobwebNode !== 'undefined' && CobwebNode.isPromptVisible()) {
        if (CobwebNode.handlePointerClick()) return;
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
      // Settings face interact (Enter/Space toggles slider lock or toggle/language)
      if (ScreenManager.isPaused() && MenuBox.getCurrentFace() === 3 && typeof MenuFaces !== 'undefined') {
        MenuFaces.handleSettingsInteract();
        return;
      }
      if (!ScreenManager.isPlaying()) return;
      if (DialogBox.isOpen()) {
        DialogBox.advance();
        return;
      }
      // If StatusBar has an active dialogue with exactly one choice, auto-select it.
      // Multi-choice nodes require clicking or number keys (1-5) to pick.
      if (typeof StatusBar !== 'undefined' && StatusBar.isDialogueActive && StatusBar.isDialogueActive()) {
        var choiceCount = StatusBar.getChoiceCount ? StatusBar.getChoiceCount() : 0;
        if (choiceCount === 1 && StatusBar.selectChoice) {
          StatusBar.selectChoice(0);
        }
      }
    });

    // ── R key: Roll up hose (PW-4) ──
    InputManager.on('reel', function (type) {
      if (type !== 'press') return;
      if (!ScreenManager.isPlaying()) return;
      if (typeof HoseState === 'undefined' || !HoseState.isActive()) return;
      if (typeof HoseReel === 'undefined') return;
      if (HoseReel.isActive()) return; // already reeling
      HoseReel.start();
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
      // Hand off WaterCursorFX from splash/title: stop emitting trail
      // droplets and clear any in-flight pool. Gameplay only re-enables
      // the FX when the hose-carry + deep-dungeon gate is satisfied
      // (_evaluateCursorFxGating, wired to FloorTransition + HoseState).
      if (oldState === S.TITLE || oldState === S.SPLASH) {
        if (typeof WaterCursorFX !== 'undefined') {
          WaterCursorFX.setActive(false);
          WaterCursorFX.clear();
        }
      }
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

      // Sync player avatar to DebriefFeed (callsign, class, emoji)
      var _ps = Player.state();
      if (typeof DebriefFeed !== 'undefined' && DebriefFeed.setAvatar) {
        DebriefFeed.setAvatar(
          _ps.avatarEmoji || '\uD83D\uDDE1\uFE0F',
          _ps.callsign   || 'ROOK',
          _ps.avatarName  || 'Blade'
        );
      }

      // Equip starting class item if nothing equipped yet
      if (_ps.equipped[0] === null && _ps.avatarName) {
        var _startItems = {
          'Blade':    { emoji: '\uD83D\uDDE1\uFE0F', name: 'Iron Sword',    subtype: 'melee',   stat: 'str',     value: 2 },
          'Ranger':   { emoji: '\uD83C\uDFF9',       name: 'Short Bow',     subtype: 'ranged',  stat: 'dex',     value: 2 },
          'Shadow':   { emoji: '\uD83D\uDCA8',       name: 'Smoke Bomb',    subtype: 'stealth', stat: 'stealth', value: 2 },
          'Sentinel': { emoji: '\uD83D\uDEE1\uFE0F', name: 'Tower Shield',  subtype: 'shield',  stat: 'hp',      value: 2 },
          'Seer':     { emoji: '\uD83D\uDD2E',       name: 'Focus Crystal', subtype: 'focus',   stat: 'energy',  value: 2 },
          'Wildcard': { emoji: '\uD83C\uDCCF',       name: 'Lucky Card',    subtype: 'wild',    stat: 'random',  value: 2 }
        };
        var _si = _startItems[_ps.avatarName];
        if (_si) {
          _ps.equipped[0] = _si;
          if (typeof QuickBar !== 'undefined' && QuickBar.refresh) QuickBar.refresh();
        }
      }

      // Delay HUD reveal — let the player absorb the 3D viewport first.
      // HUD elements slide in after a brief beat.
      _showHUD(false);
      MouseLook.init(_canvas);
      setTimeout(function () {
        _showHUD(true);
        _animateHUDSlideIn();
      }, 1800);

      // Re-assert WaterCursorFX gating on every (re)entry to gameplay —
      // covers PAUSE→GAMEPLAY (menu-box set it false on close), retry,
      // and the first floor after initial deploy.
      _evaluateCursorFxGating();
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

      // Suppress non-essential HUD overlays so canvas-rendered menu faces
      // are the topmost interactive layer during pause.
      _suppressHUDForPause(true);

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
          // Bonfire cooldown: 800ms grace period after closing the bonfire
          // menu so that the next OK press doesn't immediately re-trigger
          // rest. Player can still turn/walk away during cooldown.
          if (menuContext === 'bonfire') _bonfireCooldownMs = 800;
          ScreenManager.resumeGameplay();
        }
      });
    }

    if (oldState === S.PAUSE && newState === S.GAMEPLAY) {
      // Restore DOM HUD overlays hidden during pause
      _suppressHUDForPause(false);

      // Restore DayCycle to its pre-pause state (respects interior time-freeze)
      if (typeof DayCycle !== 'undefined') {
        DayCycle.setPaused(_dayCyclePausedBeforeMenu);
      }

      // §7f: Morning recap monologue after bonfire rest menu closes
      if (typeof HazardSystem !== 'undefined' && HazardSystem.consumeMorningRecap &&
          HazardSystem.consumeMorningRecap()) {
        if (typeof MonologuePeek !== 'undefined' && MonologuePeek.play) {
          MonologuePeek.play('morning_recap', { delay: 800, cameraPreset: 'morning_recap' });
        }
        _updateDayCounter();
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

    // Wire readiness tier-crossing callback from HUD.
    // Fires when readiness crosses 25/50/75/100% — we handle the
    // celebration toast and quest target update here because game.js
    // has access to DungeonSchedule for context-aware messaging.
    HUD.setOnTierCross(_onReadinessTierCross);

    CardSystem.init();
    // Refresh status bar now that CardSystem has the starting hand/deck
    if (typeof StatusBar !== 'undefined') { StatusBar.updateDeck(); StatusBar.updateBag(); }
    MouseLook.init(_canvas);
    if (typeof ViewportRing !== 'undefined') ViewportRing.init();

    // Combat bridge
    CombatBridge.init({
      onGameOver: function () {
        ScreenManager.toGameOver();
      },
      onDeathRescue: function (info) {
        console.log('[Game] Combat death rescue from ' + info.floorId + ' (depth ' + info.depth + ')');

        // ── Day 0 hard game-over: before the Heroes' Wake encounter
        // the Gleaner has no rescue network — death is final. ──
        if (typeof Player !== 'undefined' && !Player.getFlag('heroWakeArrival')) {
          console.log('[Game] Pre-encounter death → game over');
          _collapseAllPeeks();
          ScreenManager.toGameOver();
          return;
        }

        // Track cumulative fail stats
        if (typeof Player !== 'undefined') {
          Player.setFlag('deathCount', (Player.getFlag('deathCount') || 0) + 1);
          Player.setFlag('consecutiveFails', (Player.getFlag('consecutiveFails') || 0) + 1);
        }

        // Mirror debuffs into StatusEffect for HUD display
        if (typeof StatusEffect !== 'undefined') {
          StatusEffect.apply('GROGGY', 1);
          StatusEffect.apply('SORE', 1);
          StatusEffect.apply('HUMILIATED', 1);
          if (info.depth >= 3) {
            StatusEffect.apply('SHAKEN', 2);
          }
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

        // §10: Death-shift — shift this group's hero day to tomorrow
        if (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.onPlayerDeath) {
          var shifted = DungeonSchedule.onPlayerDeath(info.floorId);
          if (shifted && typeof Toast !== 'undefined') {
            Toast.show('\u26A0 ' + shifted.label + ' hero day shifted to Day ' +
                       shifted.actualDay + '!', 'warning');
          }
        }

        // Close any open peek/restock UI before rescue transition
        _collapseAllPeeks();

        // Transition to home floor after a brief delay
        setTimeout(function () {
          FloorTransition.go('1.6', 'retreat');
        }, 800);
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

        // ── Day 0 hard game-over: before the Heroes' Wake encounter
        // the Gleaner has no rescue network — death is final. ──
        if (typeof Player !== 'undefined' && !Player.getFlag('heroWakeArrival')) {
          console.log('[Game] Pre-encounter death → game over');
          _collapseAllPeeks();
          ScreenManager.toGameOver();
          return;
        }

        // Track cumulative fail stats
        if (typeof Player !== 'undefined') {
          Player.setFlag('deathCount', (Player.getFlag('deathCount') || 0) + 1);
          Player.setFlag('consecutiveFails', (Player.getFlag('consecutiveFails') || 0) + 1);
        }

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

        // §10: Death-shift — shift this group's hero day to tomorrow
        if (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.onPlayerDeath) {
          var shifted = DungeonSchedule.onPlayerDeath(info.floorId);
          if (shifted && typeof Toast !== 'undefined') {
            Toast.show('\u26A0 ' + shifted.label + ' hero day shifted to Day ' +
                       shifted.actualDay + '!', 'warning');
          }
        }

        // Close any open peek/restock UI before rescue transition
        _collapseAllPeeks();

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
    if (typeof TorchPeek    !== 'undefined') TorchPeek.init();
    if (typeof BookshelfPeek !== 'undefined') BookshelfPeek.init();
    if (typeof BarCounterPeek !== 'undefined') BarCounterPeek.init();
    if (typeof BedPeek !== 'undefined') BedPeek.init();
    if (typeof HosePeek !== 'undefined') HosePeek.init();
    if (typeof SpraySystem !== 'undefined') SpraySystem.init();
    if (typeof MailboxPeek !== 'undefined') {
      MailboxPeek.init();

      // ── Starter mail: rent notice for new players ────────────
      MailboxPeek.addReport({
        systemNotice: true,
        emoji: '\uD83C\uDFE0',  // 🏠
        label: 'Rent Notice — Gleaner\u2019s Home',
        body: 'Welcome, Gleaner.<br/><br/>' +
          'Your rent is due in <strong>14 days</strong>. ' +
          'The Dispatcher has work for you \u2014 clean the dungeons, ' +
          'restock the crates, and collect your pay from the mailbox ' +
          'after each hero run.<br/><br/>' +
          'Sincerely,<br/>' +
          'The Promenade Housing Authority',
        footer: 'Sincerely, your friendly neighborhood Promenade landlord.'
      });
    }

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
      // NOTE: 1.6 (Gleaner's Home) is intentionally NOT night-locked —
      // the player bunk must always be accessible so curfew/rest flows
      // can't strand the player outside their own house.
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

        // §9: DungeonSchedule — check if any group's hero day arrived
        if (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.onDayChange) {
          DungeonSchedule.onDayChange(newDay);

          // Redeploy dump truck for today's hero day (or park at home)
          if (typeof DumpTruckSpawner !== 'undefined') {
            DumpTruckSpawner.onDayChange(newDay);
          }

          // R-5: Morning report — dawn Toast sequence with per-group status
          if (typeof MorningReport !== 'undefined') {
            MorningReport.onDayChange(newDay);
          }

          // R-4: Arc completion → win-state check
          if (DungeonSchedule.isArcComplete && DungeonSchedule.isArcComplete()) {
            var arcSummary = DungeonSchedule.getArcSummary();
            var combo = arcSummary.combo;

            // §12.3: Ending variant based on combo streak
            // Good:    combo ≥ 2 (both eligible groups on schedule + target met)
            // Neutral: combo 1 or mixed results
            // Bad:     combo 0 (all groups failed or death-shifted)
            var endingVariant = 'neutral';
            if (combo.streak >= 2 || combo.maxStreak >= 2) {
              endingVariant = 'good';
            } else if (combo.streak === 0 && combo.maxStreak === 0) {
              endingVariant = 'bad';
            }

            // Inject arc data into SessionStats so end screens can read it
            if (typeof SessionStats !== 'undefined') {
              var ss = SessionStats.get();
              ss.arcSummary = arcSummary;
              ss.endingVariant = endingVariant;
            }

            // Delay end-state to let the final hero run mailbox report land
            setTimeout(function () {
              if (endingVariant === 'bad') {
                _changeState(S.GAME_OVER);
              } else {
                _changeState(S.VICTORY);
              }
            }, 2000);
          }
        }
      });

      // ── Tired trigger at 19:00 (7pm) — warning + WELL_RESTED→TIRED transition ──
      // TIRED starts at nightfall. If player isn't in bed by midnight, no WELL_RESTED.
      DayCycle.setOnTired(function (day) {
        console.log('[Game] Tired trigger at 19:00 on day ' + day);

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

        // Track cumulative fail stats
        if (typeof Player !== 'undefined') {
          Player.setFlag('curfewCount', (Player.getFlag('curfewCount') || 0) + 1);
          Player.setFlag('consecutiveFails', (Player.getFlag('consecutiveFails') || 0) + 1);
        }

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
        if (depth >= 3 && typeof CardAuthority !== 'undefined') {
          var hand = CardAuthority.getHand();
          if (hand.length > 0) {
            var confiscateIdx = Math.floor(Math.random() * hand.length);
            var taken = CardAuthority.removeFromHand(confiscateIdx);
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

    // Advance game clock past 06:00 start (operatives deploy at dawn, arrive ~06:15)
    if (typeof DayCycle !== 'undefined' && DayCycle.advanceTime) {
      DayCycle.advanceTime(15);
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

    // DungeonSchedule — staggered per-group hero days (§9–§13)
    if (typeof DungeonSchedule !== 'undefined') {
      DungeonSchedule.init();
    }

    // DumpTruckSpawner — deploy truck on active hero day floor
    if (typeof DumpTruckSpawner !== 'undefined') {
      DumpTruckSpawner.init();
    }

    // ── BedPeek → overnight hero run → mailbox report pipeline ──
    if (typeof BedPeek !== 'undefined') {
      BedPeek.setOnHeroDayRun(function (dayNum) {
        // §9: DungeonSchedule handles per-group hero runs via onDayChange().
        // Legacy monolithic path is only used when DungeonSchedule is absent.
        if (typeof DungeonSchedule === 'undefined') {
          _executeOvernightHeroRun(dayNum);
        }
        // DungeonSchedule already fired from DayCycle.setOnDayChange.
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

      // ════════════════════════════════════════════════════════════════
      // Floor 0 — The Approach (first encounters after deploy cutscene)
      // ════════════════════════════════════════════════════════════════

      // ── Campfire Drifter ──────────────────────────────────────────
      // First talkable NPC. Explains the settlement, the setting,
      // why people live here outside the arch. Tone: weary, helpful,
      // matter-of-fact. Not hostile, not cheerful — resigned.
      NpcSystem.registerTree('floor0_drifter', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'You just get dropped off? ...Yeah. Truck comes through once a week. One way trip.',
            choices: [
              { label: 'Where am I?', next: 'where' },
              { label: 'What is this place?', next: 'settlement' },
              { label: 'I need to get through that arch', next: 'arch' },
              { label: 'Never mind', next: null }
            ]
          },
          where: {
            text: 'The Approach. It\'s what they call the strip between the overpass and the town wall. Used to be a service road. Now it\'s... this.',
            choices: [
              { label: 'What happened?', next: 'history' },
              { label: 'The overpass behind me?', next: 'overpass' },
              { label: 'Thanks', next: null }
            ]
          },
          overpass: {
            text: 'Highway 9 overpass. They fenced the on-ramps years ago. Only way out is through. Through the arch, through the town, through... whatever\'s past that.',
            choices: [
              { label: 'What is this place?', next: 'settlement' },
              { label: 'I\'ll figure it out', next: null }
            ]
          },
          settlement: {
            text: 'People camp here because the town won\'t let everyone through the arch. Not enough housing. Not enough work. So you wait. Set up a tent. Find a bonfire. Try not to think too hard about it.',
            choices: [
              { label: 'How long have you been here?', next: 'how_long' },
              { label: 'Who runs things here?', next: 'who_runs' },
              { label: 'That\'s rough', next: null }
            ]
          },
          history: {
            text: 'Factories closed, one by one. You can see the old buildings through the facade wall — boarded up, rusted. People who worked there had nowhere to go. The overpass camps became the meadow camps became... permanent.',
            choices: [
              { label: 'Who runs things here?', next: 'who_runs' },
              { label: 'Factories? What kind?', next: 'factories' },
              { label: 'I see', next: null }
            ]
          },
          factories: {
            text: 'Processing plants, mostly. Dungeon salvage. The Heroes bring back materials and someone has to sort, clean, package it all. Used to employ half the district. Now the Foundry runs automated lines and three guys in a control booth.',
            choices: [
              { label: 'The Foundry?', next: 'foundry' },
              { label: 'Thanks for telling me', next: null }
            ]
          },
          foundry: {
            text: 'Big outfit. Runs the smelters, the warehouses, most of the money. They\'re the reason the town exists at all. Also the reason half of us are out here instead of in there. Funny how that works.',
            choices: [
              { label: 'Back', next: 'greeting' },
              { label: 'I appreciate you talking to me', next: null }
            ]
          },
          how_long: {
            text: 'Six months? Seven? You stop counting. Some folks here have been camped for years. The house down south — that family actually built something. Most of us just... sit.',
            choices: [
              { label: 'Is there anything to do here?', next: 'what_to_do' },
              { label: 'I should keep moving', next: null }
            ]
          },
          what_to_do: {
            text: 'Walk. Think. Tend the fire. Talk to the old man in the shack up north if you want stories. Don\'t mind if he sounds crazy — he\'s been here longer than anyone.',
            choices: [
              { label: 'Crazy how?', next: 'hermit_hint' },
              { label: 'I\'ll check it out', next: null }
            ]
          },
          hermit_hint: {
            text: 'Talks about pandas, dragons, the "elites." Conspiracy stuff. People keep their distance. But he\'s harmless. And... some of what he says, I dunno. After enough time out here, you start wondering too.',
            choices: [
              { label: '...', next: null }
            ]
          },
          who_runs: {
            text: 'Nobody, really. There\'s a Groundskeeper who sweeps the road — I think the town pays him a stipend so the Approach doesn\'t look too bad from the arch. But governance? Laws? That\'s on the other side of the wall.',
            choices: [
              { label: 'The arch leads to the town?', next: 'arch' },
              { label: 'Thanks', next: null }
            ]
          },
          arch: {
            text: 'The Promenade. Real town. Shops, homes, a guild office. If you can get work, you can get in. That\'s the deal. Go through, find the Dispatcher, sign up as a Gleaner. That\'s your ticket.',
            choices: [
              { label: 'What\'s a Gleaner?', next: 'gleaner' },
              { label: 'I\'ll head that way', next: null }
            ]
          },
          gleaner: {
            text: 'Dungeon janitor. The Heroes go in and fight monsters. The Gleaners go in after and clean up the mess. Restock traps, mop blood, reset the floors for the next cycle. It\'s not glamorous, but it pays.',
            choices: [
              { label: 'Sounds like my kind of work', next: 'work_affirm' },
              { label: 'That sounds terrible', next: 'work_deny' }
            ]
          },
          work_affirm: {
            text: 'Ha. Sure. Head through the arch. Talk to the Dispatcher in the guild office. They\'ll sort you out. ...Good luck in there.',
            choices: [
              { label: 'Thanks for everything', next: null }
            ]
          },
          work_deny: {
            text: 'It is. But it\'s the only work going. The alternative is...' + ' *gestures at the encampment* ' + '...this. Your call.',
            choices: [
              { label: 'I\'ll think about it', next: null }
            ]
          }
        }
      });

      // ── Laid-off Laborer ──────────────────────────────────────────
      // Second encounter (SC pod). Talks about the local economy,
      // the industries, the homelessness crisis directly. Angrier tone
      // than the Drifter — this person lost a specific job and blames
      // specific people.
      NpcSystem.registerTree('floor0_laborer', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'What. ...Oh. New arrival. Don\'t sit too close to the fire, the smoke gets in your lungs.',
            choices: [
              { label: 'What happened to you?', next: 'story' },
              { label: 'Why are there so many people camping out here?', next: 'homelessness' },
              { label: 'Sorry to bother you', next: null }
            ]
          },
          story: {
            text: 'Worked the salvage line at Foundry Plant 6 for eleven years. Sorting hero loot. One day the machines show up. Next week, layoff notices. Three hundred people. Just like that.',
            choices: [
              { label: 'Where did everyone go?', next: 'displacement' },
              { label: 'Can\'t you find other work?', next: 'other_work' },
              { label: 'That\'s awful', next: 'awful' }
            ]
          },
          displacement: {
            text: 'Here. The meadow. The overpass camps. Some went further out, past the highway. The ones with connections got guild work — Gleaner positions, courier routes. The rest of us just... stayed.',
            choices: [
              { label: 'Nobody helped?', next: 'nobody_helped' },
              { label: 'What about the houses?', next: 'housing' },
              { label: 'I see', next: null }
            ]
          },
          nobody_helped: {
            text: 'The Admiralty posted a notice about "workforce transition support." One meeting. One pamphlet. That was it. The Foundry sent severance for two months. Two months to replace eleven years. And the Tide temple offered prayers.',
            choices: [
              { label: 'The Admiralty? The Tide?', next: 'factions' },
              { label: 'That\'s not enough', next: 'not_enough' }
            ]
          },
          factions: {
            text: 'The powers that be. Admiralty runs the government — permits, taxes, the wall. The Tide runs the temples — blessings, morale, "spiritual guidance." And the Foundry runs everything else. Three legs of a stool that doesn\'t have a seat.',
            choices: [
              { label: 'Who\'s responsible for all this?', next: 'responsible' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          not_enough: {
            text: 'No. It\'s not. But what are you gonna do? Protest? They\'ll send a Hero. Strike? They\'ll hire scabs from two districts over. The system works exactly how it\'s supposed to. Just not for us.',
            choices: [
              { label: 'Send a Hero?', next: 'hero_threat' },
              { label: '...', next: null }
            ]
          },
          hero_threat: {
            text: 'Figure of speech. Mostly. The Heroes are supposed to fight dungeon monsters. But the Admiralty has... broad definitions of what constitutes a threat to public order. Makes people think twice about pushing back.',
            choices: [
              { label: 'That\'s messed up', next: 'messed_up' },
              { label: 'I need to go', next: null }
            ]
          },
          messed_up: {
            text: 'Yeah. It is. ...Look, I\'m not trying to scare you. Just keep your eyes open in there. The town looks nice from the outside. Pretty sunsets, cobblestone streets. But under it? Same rot. Just better lighting.',
            choices: [
              { label: 'Thanks for the warning', next: null }
            ]
          },
          other_work: {
            text: 'As what? The only jobs left are Gleaner contracts and the Foundry won\'t hire anyone they already fired. Says it\'s "policy." Really it\'s because we organized once. Seven years ago. They don\'t forget.',
            choices: [
              { label: 'You organized?', next: 'organized' },
              { label: 'Gleaner contracts?', next: 'gleaner_work' },
              { label: 'I understand', next: null }
            ]
          },
          organized: {
            text: 'We asked for safety gear. That\'s it. Dungeon salvage has corrosive residue, cursed fragments, biological hazards. We wanted gloves and respirators. They called it "insubordination" and blacklisted everyone who signed.',
            choices: [
              { label: 'Over safety gear?', next: 'safety' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          safety: {
            text: 'It was never about the gloves. It was about control. You let workers ask for one thing, next they want fair wages, shift limits, a say in operations. Can\'t have that. Not when the Hero cycle depends on cheap labor.',
            choices: [
              { label: 'The Hero cycle?', next: 'hero_cycle' },
              { label: 'I hear you', next: null }
            ]
          },
          hero_cycle: {
            text: 'Heroes go in, kill monsters, bring out loot. Gleaners go in, clean up, reset the floors so monsters come back. Repeat forever. The whole economy runs on it. And at the bottom of that stack? People like us. Expendable.',
            choices: [
              { label: '...', next: null }
            ]
          },
          gleaner_work: {
            text: 'Dungeon cleaning. You go in after the Hero and mop up. Dangerous, disgusting, and the pay is barely enough to keep a roof over your head. But at least you get a roof. More than I can say for the meadow.',
            choices: [
              { label: 'I might sign up for that', next: 'sign_up' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          sign_up: {
            text: 'Then go through the arch. Find the Dispatcher. Just... don\'t let them fool you into thinking the work is noble. It\'s survival. Same as out here, just with a mop.',
            choices: [
              { label: 'Noted', next: null }
            ]
          },
          awful: {
            text: 'Don\'t pity me. Pity the families. Kids growing up in tents. No school on this side. The Tide runs a charity kitchen on Sundays but it\'s gruel and sermons. Not exactly a safety net.',
            choices: [
              { label: 'Why are there so many people camping out here?', next: 'homelessness' },
              { label: 'I should go', next: null }
            ]
          },
          homelessness: {
            text: 'Because the town can\'t hold everyone and won\'t build for everyone. Simple as that. They built the wall, the arch, the checkpoints — all to control who gets in. The rest of us wait in the meadow.',
            choices: [
              { label: 'How many people live out here?', next: 'how_many' },
              { label: 'Who decided that?', next: 'responsible' },
              { label: 'That can\'t be legal', next: 'legal' }
            ]
          },
          how_many: {
            text: 'Hard to count. Sixty? Eighty? More come every season. Fewer leave. Some die quiet — cold, sickness, sometimes just... giving up. The bonfires are the only thing keeping people going. Literally and otherwise.',
            choices: [
              { label: 'Who decided that?', next: 'responsible' },
              { label: 'I\'m sorry', next: null }
            ]
          },
          responsible: {
            text: 'Foundry shut the plants. Admiralty drew the wall. Tide said it was "the natural order." Pick your villain. Or better yet, ask yourself why three factions that disagree on everything all agree that we should stay out here.',
            choices: [
              { label: 'They agree on that?', next: 'agree' },
              { label: 'Heavy stuff', next: null }
            ]
          },
          agree: {
            text: 'Only thing they agree on. Cheap labor has to come from somewhere. And desperate people don\'t negotiate. The meadow isn\'t an accident. It\'s a feature.',
            choices: [
              { label: '...', next: null }
            ]
          },
          legal: {
            text: 'Legal? Hah. Legal is whatever the Admiralty writes on a piece of paper. Out here, past the wall, we\'re technically "unincorporated territory." No bylaws, no protections, no obligations. Convenient, right?',
            choices: [
              { label: 'Who decided that?', next: 'responsible' },
              { label: 'Yeah. Convenient', next: null }
            ]
          },
          housing: {
            text: 'The house down south? That family\'s been here three years. Built it themselves from salvage. Technically illegal — the Admiralty calls it "unauthorized construction." But nobody enforces it. Not worth their time to demolish a shack.',
            choices: [
              { label: 'At least they have walls', next: 'walls' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          walls: {
            text: 'Walls and a mailbox. Like they\'re waiting for a letter that\'s never coming. I respect it though. Building something when nobody tells you that you can? That\'s the most defiant thing you can do out here.',
            choices: [
              { label: 'I like that', next: null }
            ]
          }
        }
      });

      // ── Raving Hermit ─────────────────────────────────────────────
      // NE pod shack. Incoherent muttering about pandas and dragon
      // elites. Existential crisis delivered as conspiracy word salad.
      // Funny on the surface, unsettling underneath. Every branch
      // spirals deeper. There is no "normal" exit — only trailing off.
      NpcSystem.registerTree('floor0_hermit', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'THEY\'RE USING THE PANDAS. You have to understand. The PANDAS. They\'re not animals. They\'re... they\'re SIGILS. Living sigils. Walking contracts written in black and white fur.',
            choices: [
              { label: 'Are you okay?', next: 'okay' },
              { label: 'Pandas?', next: 'pandas' },
              { label: 'I\'m going to leave now', next: 'leave' }
            ]
          },
          okay: {
            text: 'Okay? OKAY? I was okay before I saw the patterns. Before I counted the stripes. Thirteen bamboo stalks in every mural. Thirteen council seats. Thirteen floors in the deep dungeon. You think that\'s coincidence?',
            choices: [
              { label: 'What patterns?', next: 'patterns' },
              { label: 'Yes, that\'s coincidence', next: 'coincidence' },
              { label: '...I\'m going to go', next: 'leave' }
            ]
          },
          pandas: {
            text: 'Not REAL pandas. The idea of pandas. The CONCEPT. Black and white. Binary. Either you\'re inside the wall or outside. Either you\'re a Hero or you\'re nobody. The panda is the symbol of the false choice. Don\'t you SEE?',
            choices: [
              { label: 'I don\'t see, no', next: 'dont_see' },
              { label: 'Tell me about the dragons', next: 'dragons' },
              { label: 'This is a lot', next: 'a_lot' }
            ]
          },
          a_lot: {
            text: '*nods rapidly* IT IS. It\'s a LOT. Most people can\'t handle the lot-ness of it. They walk away. They go through the arch and eat soup and forget the pandas ever existed. But you\'re still here. Why are you still here?',
            choices: [
              { label: 'Morbid curiosity', next: 'dragons' },
              { label: 'I don\'t know', next: 'silence' },
              { label: 'I\'m leaving', next: null }
            ]
          },
          dont_see: {
            text: 'Of course you don\'t. That\'s the point. The panda sits in the bamboo grove and everyone says "how cute, how peaceful." Nobody asks WHY it sits there. Nobody asks who PLANTED the bamboo. Nobody asks who benefits from the sitting.',
            choices: [
              { label: 'Who planted the bamboo?', next: 'bamboo' },
              { label: 'I think you need rest', next: 'need_rest' }
            ]
          },
          bamboo: {
            text: 'THE DRAGON ELITES. Who else? They grow the bamboo. They breed the pandas. They engineer the ENTIRE ECOSYSTEM so that a black and white bear sits still and eats and produces nothing and EVERYONE THINKS THAT\'S FINE.',
            choices: [
              { label: 'Are we still talking about pandas?', next: 'still_pandas' },
              { label: 'Who are the Dragon Elites?', next: 'dragons' }
            ]
          },
          still_pandas: {
            text: '...Are we? I don\'t... *stares at hands* ...Sometimes I can\'t tell where the metaphor ends and the... the THING starts. Is the panda the system or am I the panda? Am I sitting in bamboo RIGHT NOW?',
            choices: [
              { label: 'You\'re sitting in a shack', next: 'shack' },
              { label: 'Maybe we\'re all pandas', next: 'all_pandas' }
            ]
          },
          shack: {
            text: 'A shack. A cage. A... designated enclosure for a specimen that has been... catalogued and... *trails off* ...I used to be an accountant. Did you know that? I used to have a desk.',
            choices: [
              { label: 'What happened?', next: 'what_happened' },
              { label: 'An accountant?', next: 'accountant' }
            ]
          },
          accountant: {
            text: 'Numbers. I was good at numbers. But then the numbers started showing me things. Patterns in the ledgers. The Foundry\'s quarterly reports. The dungeon loot manifests. It all... it all pointed at the same thing.',
            choices: [
              { label: 'What thing?', next: 'the_thing' },
              { label: 'I think the numbers were just numbers', next: 'just_numbers' }
            ]
          },
          the_thing: {
            text: 'That NONE OF THIS IS REAL. Not the dungeon, not the town, not the Heroes. It\'s a... a LOOP. A constructed cycle designed to keep resources flowing upward while we sit in the bamboo grove and eat and PRODUCE NOTHING.',
            choices: [
              { label: '...', next: 'silence' },
              { label: 'You sound like you need to talk to someone', next: 'need_rest' }
            ]
          },
          just_numbers: {
            text: '*long pause* ...Maybe. Maybe the numbers were just numbers and the pandas are just pandas and I\'m just a man in a shack who looked at a spreadsheet too long. ...But then why do I still see the patterns when I close my eyes?',
            choices: [
              { label: 'I don\'t know', next: 'silence' },
              { label: 'Take care of yourself', next: null }
            ]
          },
          what_happened: {
            text: 'I found a discrepancy. Dungeon reset costs versus Foundry intake volume. The numbers didn\'t match. Thirty percent of hero loot was... unaccounted for. I reported it. Next day, my desk was empty. Week later, I was out here.',
            choices: [
              { label: 'You were fired for finding fraud?', next: 'fired' },
              { label: 'That could just be a clerical error', next: 'clerical' }
            ]
          },
          fired: {
            text: 'Fired. Blacklisted. And then the dreams started. The pandas. Every night, a panda looking at me through bamboo bars. Watching. Chewing. Patient. Like it KNOWS what they did to me. Like it was THERE.',
            choices: [
              { label: 'The panda was in your dreams?', next: 'panda_dream' },
              { label: 'I\'m sorry that happened to you', next: 'sorry' }
            ]
          },
          panda_dream: {
            text: 'Every. Night. Sitting. Chewing. Black eyes. No expression. Just... existing at me. And behind the panda, a dragon. But not a monster-dragon. A SUIT-dragon. Briefcase. Cufflinks. The kind of dragon that signs your termination papers with a fountain pen.',
            choices: [
              { label: 'A dragon in a suit', next: 'suit_dragon' },
              { label: 'Have you talked to anyone about this?', next: 'need_rest' }
            ]
          },
          suit_dragon: {
            text: 'THE DRAGON ELITE. That\'s what they ARE. Not beasts. Executives. They wear the skin of monsters because it makes people think they\'re part of the dungeon. Natural. Inevitable. But they\'re just PEOPLE with SCALES and BAD INTENTIONS.',
            choices: [
              { label: 'I think this is metaphorical', next: 'metaphorical' },
              { label: 'I don\'t think I can help you', next: 'cant_help' }
            ]
          },
          metaphorical: {
            text: '*grabs your arm* Is a metaphor LESS TRUE than the thing it points at? When I say dragon, and you feel FEAR — is the fear metaphorical? When the Foundry takes your livelihood, is the fire that burns you FIGURATIVE?',
            choices: [
              { label: '...', next: 'silence' }
            ]
          },
          cant_help: {
            text: 'Nobody can. That\'s... *sits back down slowly* ...that\'s the insight, isn\'t it. The pandas can\'t help each other. We just sit in our enclosures and chew. Individual bamboo stalks. Alone.',
            choices: [
              { label: 'You\'re not alone', next: 'not_alone' },
              { label: 'Goodbye', next: null }
            ]
          },
          not_alone: {
            text: '*looks up, eyes wet* ...You\'re kind. The drifter by the campfire said someone new would come through. Said they always do. Come through, pass through, keep going. Nobody stays. Not by choice.',
            choices: [
              { label: 'I have to keep going too', next: 'keep_going' },
              { label: 'Maybe things can change', next: 'change' }
            ]
          },
          keep_going: {
            text: 'I know. Everyone does. Through the arch, into the town, down into the dungeons. The cycle. *mutters* ...panda goes in, panda comes out. Dragon counts the bamboo. World keeps turning.',
            choices: [
              { label: '...take care', next: null }
            ]
          },
          change: {
            text: '*hollow laugh* Change. You know what the panda says about change? ...Nothing. The panda says nothing. Because the panda doesn\'t have a VOICE. That\'s the whole POINT.',
            choices: [
              { label: 'Then maybe we should be something other than pandas', next: 'other' },
              { label: 'I have to go', next: null }
            ]
          },
          other: {
            text: '...Huh. *long silence* Nobody ever said that before. They usually just leave. ...I don\'t know what else to be. I\'ve been a panda so long I forgot. ...What are you?',
            choices: [
              { label: 'A Gleaner, apparently', next: 'gleaner_answer' },
              { label: 'I don\'t know yet', next: 'dont_know' }
            ]
          },
          gleaner_answer: {
            text: 'A janitor for a system that doesn\'t care about you. ...But at least you chose it. The panda never chose the bamboo. ...Go on. Through the arch. Maybe you\'ll find something I couldn\'t.',
            choices: [
              { label: '...', next: null }
            ]
          },
          dont_know: {
            text: '*something shifts behind his eyes* ...Good. Don\'t know. Stay not-knowing as long as you can. The moment you accept a label, the bamboo grows around you. *waves vaguely* ...The dragons are counting.',
            choices: [
              { label: '...', next: null }
            ]
          },
          all_pandas: {
            text: '*STOPS.* *stares at you.* ...Yes. Yes. That\'s what I\'ve been trying to... we\'re ALL pandas. Every single one of us. Eating bamboo we didn\'t plant in a grove we didn\'t choose while the dragons write the reports.',
            choices: [
              { label: 'Who are the Dragon Elites?', next: 'dragons' },
              { label: 'I was joking', next: 'joking' }
            ]
          },
          joking: {
            text: 'Joking. HA. The dragon elites are ALSO joking. That\'s the meta-joke. The whole world is a joke told by a dragon to a panda. And the punchline is... *gestures at everything* ...THIS.',
            choices: [
              { label: '...', next: 'silence' }
            ]
          },
          dragons: {
            text: 'The ones at the TOP. Not the dungeon dragons — those are puppets, spectacles. I mean the REAL dragons. The ones who designed the Hero cycle. Who decided that some people fight and some people clean. The ones writing the STORY.',
            choices: [
              { label: 'Writing the story?', next: 'story' },
              { label: 'I think you\'ve been alone too long', next: 'alone' }
            ]
          },
          story: {
            text: 'You ever feel like you\'re in a script? Like your choices were written before you made them? Like there\'s a... a THING above all of this, looking down, arranging the tiles? ...That\'s the dragon. That\'s what the dragon IS.',
            choices: [
              { label: '...', next: 'silence' }
            ]
          },
          alone: {
            text: 'Ha... yeah. Maybe. But loneliness is just... clarity with nobody to dilute it. Out here, in the meadow, with the wind and the shrubs and the bonfires... I can see the edges of the world. And I\'m telling you — they\'re RENDERED.',
            choices: [
              { label: 'Rendered?', next: 'rendered' },
              { label: 'Okay, I\'m leaving', next: null }
            ]
          },
          rendered: {
            text: 'Look at the trees. LOOK at them. Same tree. Same tree. Same TREE. Copy-pasted across the border like someone filled a spreadsheet. The grass? Flat texture. The sky? A PRESET. Cedar, they call it. CEDAR. Why cedar? WHO CHOSE CEDAR?',
            choices: [
              { label: '...', next: 'silence' }
            ]
          },
          patterns: {
            text: 'The shrubs are all the same height. Every. Single. One. Half a wall. Not natural. DESIGNED. And the bonfire light — it doesn\'t cast real shadows. It APPROXIMATES them. Because the engine can\'t— *catches himself* ...the WORLD can\'t render them properly.',
            choices: [
              { label: 'Are you talking about the world or...', next: 'meta' },
              { label: 'I think those are just shrubs', next: 'just_shrubs' }
            ]
          },
          meta: {
            text: '*whispers* Both. That\'s the secret. The world IS the engine. The dungeon IS the loop. The panda IS the player. We\'re all just... data. Running. In a cycle. Until someone pulls the plug.',
            choices: [
              { label: '...I have to go', next: null }
            ]
          },
          just_shrubs: {
            text: '*sad smile* ...Yeah. Maybe they\'re just shrubs. And maybe I\'m just a man who stared at numbers too long and broke. ...But the pandas, kid. The pandas are REAL. I\'ll die on that hill.',
            choices: [
              { label: 'I believe you', next: 'believe' },
              { label: 'Take care of yourself', next: null }
            ]
          },
          believe: {
            text: '*eyes go wide, then soften* ...Nobody\'s said that to me in... *long pause* ...Don\'t let them make you a panda. Whatever you do in that town. Don\'t. Sit. Down.',
            choices: [
              { label: 'I won\'t', next: null }
            ]
          },
          need_rest: {
            text: 'Rest. *laughs bitterly* Rest is what the bonfire offers. Rest is what the bamboo grove offers. Rest is the panda\'s FUNCTION. I don\'t want rest. I want to WAKE UP.',
            choices: [
              { label: '...', next: 'silence' }
            ]
          },
          sorry: {
            text: '...Don\'t be sorry. Be AWARE. That\'s all I ask. When you go through the arch and everything looks pretty — remember the people out here. Remember that someone counted the bamboo and the numbers didn\'t add up.',
            choices: [
              { label: 'I\'ll remember', next: null }
            ]
          },
          leave: {
            text: 'THAT\'S WHAT THE PANDA WANTS. Walk away. Don\'t engage. Stay in your lane. Eat your bamboo. *voice cracks* ...Everyone leaves. The arch swallows them and they forget. They forget the meadow. They forget ME.',
            choices: [
              { label: '...I\'ll stay a minute', next: 'stay' },
              { label: 'I\'m sorry', next: null }
            ]
          },
          stay: {
            text: '*visibly surprised* ...You will? *sits down, calmer* ...Nobody stays. The road goes east and everyone follows it. Like there\'s a... a pull. A direction built into the floor.',
            choices: [
              { label: 'Tell me about the pandas', next: 'pandas' },
              { label: 'Tell me about the dragons', next: 'dragons' }
            ]
          },
          coincidence: {
            text: 'THERE ARE NO COINCIDENCES. Only patterns too big for small eyes to see! The dragon elites DESIGNED the thirteen-fold structure! Why do you think there are thirteen flavors at the Coral Bazaar? THIRTEEN. TYPES. OF SOUP.',
            choices: [
              { label: 'Soup?', next: 'soup' },
              { label: 'Okay I really need to go', next: null }
            ]
          },
          soup: {
            text: 'Each soup represents a FLOOR of the dungeon! Mushroom broth = Floor 1, natural, earthy. Blood pudding = deep floors, viscera and death. And the thirteenth soup? SECRET MENU. Nobody orders it. Because it\'s not FOR us. It\'s for THE DRAGONS.',
            choices: [
              { label: 'I haven\'t even been to the Bazaar yet', next: 'bazaar' },
              { label: '...I\'m going to leave you to your soups', next: null }
            ]
          },
          bazaar: {
            text: 'Good. GOOD. When you get there, COUNT THE SOUPS. Then come back and tell me I\'m crazy. *leans forward* ...You won\'t come back though. They never come back. The arch is a one-way throat.',
            choices: [
              { label: 'If I find thirteen soups, I\'ll remember you', next: 'remember' },
              { label: 'Goodbye', next: null }
            ]
          },
          remember: {
            text: '*tears up* ...That\'s... *wipes face* ...The panda remembers who feeds it. Even in the grove. Even in the dark. *mutters* ...thirteen soups... thirteen floors... thirteen bamboo stalks...',
            choices: [
              { label: '...', next: null }
            ]
          },
          clerical: {
            text: 'THIRTY PERCENT. Thirty percent is not a clerical error. Thirty percent is a POLICY. Thirty percent is a dragon taking its cut while the pandas count bamboo and call it INDUSTRY.',
            choices: [
              { label: 'What happened after you reported it?', next: 'fired' },
              { label: 'Okay', next: null }
            ]
          },
          silence: {
            text: '*long silence* ...The bonfire is warm, at least. The bonfire doesn\'t lie. The bonfire doesn\'t have a BOARD OF DIRECTORS. *stares into the flames* ...Sometimes I think the fire is the only honest thing left.',
            choices: [
              { label: 'Hang in there', next: null },
              { label: '...', next: null }
            ]
          }
        }
      });

      // ════════════════════════════════════════════════════════════════
      // Floor 1 — The Promenade (Dispatcher + key NPCs)
      // ════════════════════════════════════════════════════════════════

      // ── Dispatcher — REMOVED from NpcSystem tree registry ─────────
      // The Dispatcher gate NPC is fully owned by game.js via
      // _spawnDispatcherGate() and inline dialogue in _openDispatcherDialogue().
      // The NpcSystem definition was also removed from npc-system.js.

      // ── Market Vendor — Coral Bazaar approach ─────────────────────
      NpcSystem.registerTree('floor1_bazaar_vendor', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Welcome to the Bazaar! Well — the front of it, anyway. The good stuff\'s inside. Fresh supplies, dungeon gear, the usual.',
            choices: [
              { label: 'What do you sell?', next: 'sell' },
              { label: 'Tell me about this place', next: 'about' },
              { label: 'Just browsing', next: null }
            ]
          },
          sell: {
            text: 'Trap kits, cleaning solution, light sticks, ration packs. Everything a Gleaner needs to survive a shift. Prices are fair — the Guild subsidizes the basics.',
            choices: [
              { label: 'Browse stock', next: null, effect: { openShop: true, factionId: 'tide' } },
              { label: 'Where\'s the entrance?', next: 'entrance' },
              { label: 'Thanks', next: null }
            ]
          },
          entrance: {
            text: 'Door\'s right behind me. You\'ll need to go inside to browse the full stock. I just handle the overflow out here when the weather\'s nice. Which... is always, actually. Strange, that.',
            choices: [
              { label: 'Always nice weather?', next: 'weather' },
              { label: 'I\'ll check inside', next: null }
            ]
          },
          weather: {
            text: '*looks up at the sky* Same sunset. Every day. You\'d think someone would comment on it more, but people just... don\'t. Anyway! Trap kits! Buy some!',
            choices: [
              { label: '...', next: null }
            ]
          },
          about: {
            text: 'The Promenade\'s been here as long as anyone can remember. Boarding houses, a tavern, the Bazaar. Not a big town, but it\'s ours. Well — theirs. I\'m just a vendor. But it feels like home after a while.',
            choices: [
              { label: 'Who lives here?', next: 'who_lives' },
              { label: 'Thanks', next: null }
            ]
          },
          who_lives: {
            text: 'Gleaners, mostly. Some retired ones, some active. A few Tide clergy, an Admiralty officer or two keeping things orderly. And the Foundry has a rep who checks in. Everyone\'s polite enough. It\'s the kind of quiet you learn not to question.',
            choices: [
              { label: 'Back', next: 'greeting' },
              { label: 'Take care', next: null }
            ]
          }
        }
      });

      // ════════════════════════════════════════════════════════════════
      // Floor 2+ — Deeper NPCs
      // ════════════════════════════════════════════════════════════════

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
            text: 'Twelve years cleaning dungeons. Started same as you - green, underpaid, and convinced the Hero was on our side. Experience teaches you to look closer.',
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
            text: 'Hero\'s Wake cleanup. But nobody wants it. The deep floors are rough and the Hero leaves behind... well. You\'ll see for yourself.',
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
            text: 'Northwest corner. Rags are free, trap kits cost 5g each. Mops and brushes are on the shelf; take what you need. Just sign the ledger.',
            choices: [
              { label: 'Back', next: 'greeting' }
            ]
          },
          dispatcher_info: {
            text: 'The Dispatcher handles all Gleaner assignments for this district. Former field operative who did twenty years in the deep floors before moving to admin. Don\'t let the desk fool you.',
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
            text: 'I\'ve only been here a week, so take this with a grain of salt... but the old-timers say: don\'t skip the cobweb spots. Even if they seem pointless. The readiness bonus adds up.',
            choices: [
              { label: 'Thanks Pip', next: null }
            ]
          }
        }
      });

      // The Watchman — Floor 2.2 (competent tutorial NPC at dungeon staging)
      // Dynamic root: pre-hose greeting directs player to the truck;
      // post-hose greeting pivots to functionality tips.
      // Cleaning tutorial branches (crates, scrub, books) shared by both paths.
      // Lore threads (Resonance, missing numbers) preserved as secondary branch.
      NpcSystem.registerTree('watchpost_watchman', {
        root: function () {
          return (typeof Player !== 'undefined' && Player.getFlag && Player.getFlag('hoseDiscovered'))
            ? 'greeting_hose'
            : 'greeting';
        },
        nodes: {
          // ── Pre-discovery greeting (default) ──────────────────────
          greeting: {
            text: 'Ah — you must be the new Gleaner. Welcome to the Post. Before you head down: the department cleanup rig is parked outside on Lantern Row. Big flatbed, Guild markings. Grab the hose off the side — you\'ll need it for the heavy stuff.',
            choices: [
              { label: 'Where exactly is the rig?', next: 'hose_location' },
              { label: 'What happened here?', next: 'whathappened' },
              { label: 'Dispatcher sent me to clean up', next: 'dispatched' },
              { label: 'Just passing through', next: 'passing' }
            ]
          },
          hose_location: {
            text: 'Head back out the door behind you, down to street level. The truck should be right there on the road — two-tile flatbed with a hose reel mounted on the side. Face it and grab the hose. It\'ll trail behind you when you come back in.',
            choices: [
              { label: 'What does it do?', next: 'hose_preview' },
              { label: 'Got it. I\'ll grab it.', next: 'sendoff' },
              { label: 'What else should I know?', next: 'assignment' }
            ]
          },
          hose_preview: {
            text: 'The hose is for deep cleaning — grime baked into the stone, scorch marks, the kind of filth a rag won\'t touch. It runs on your energy though, and the longer the line trails behind you the heavier it drags. Grab it, haul it in, do the heavy work first, then roll it up when you\'re done.',
            choices: [
              { label: 'Anything else down there?', next: 'assignment' },
              { label: 'Heading out to grab it now', next: 'sendoff' }
            ]
          },

          // ── Post-discovery greeting (player has the hose) ─────────
          greeting_hose: {
            text: 'Good — you\'ve got the rig\'s hose. Smart. Most rookies skip it and regret it two floors down. Let me tell you how to get the most out of it before you head in.',
            choices: [
              { label: 'How does the hose work?', next: 'hose_basics' },
              { label: 'I know how it works', next: 'assignment' },
              { label: 'What happened here?', next: 'whathappened' }
            ]
          },
          hose_basics: {
            text: 'It trails behind you as you walk — every tile you cross lays more line. The longer the line, the more energy it costs to drag. Face a grimy wall or floor and spray to clean it in one pass. Much faster than a rag, but it\'ll tire you out quicker too.',
            choices: [
              { label: 'What are kinks?', next: 'hose_kinks' },
              { label: 'How do I roll it up?', next: 'hose_reel' },
              { label: 'Good enough. What else?', next: 'assignment' }
            ]
          },
          hose_kinks: {
            text: 'If your path crosses itself — doubling back through a tile you already walked — the line kinks. Each kink drops your water pressure and costs extra energy per step. Plan your route through the dungeon so you\'re not retracing. Think of it like mopping: work in one direction.',
            choices: [
              { label: 'How do I roll it up?', next: 'hose_reel' },
              { label: 'Back to the assignment', next: 'assignment' }
            ]
          },
          hose_reel: {
            text: 'When you\'re done spraying — or when your energy runs low — the hose reels itself back in and you retrace your path to the truck automatically. Free exit. If your energy hits zero before you reel up, it forces the reel. Either way you end up back at the truck.',
            choices: [
              { label: 'What about kinks?', next: 'hose_kinks' },
              { label: 'Got it. What else?', next: 'assignment' }
            ]
          },

          // ── Shared nodes (both greeting paths converge here) ──────
          whathappened: {
            text: 'What always happens. A party of adventurers kicked the door in last night — didn\'t even try the handle, of course — charged downstairs, and left a trail of carnage behind them. Standard Tuesday.',
            choices: [
              { label: 'They broke the door?', next: 'door' },
              { label: 'Carnage?', next: 'carnage' },
              { label: 'What do I do now?', next: 'assignment' }
            ]
          },
          dispatched: {
            text: 'Good. Ren from Dispatch already came through and handled the... sensitive material. Bodies, contraband, anything the Guild doesn\'t want a rookie tripping over. What\'s left is the grunt work — and that\'s you.',
            choices: [
              { label: 'What kind of grunt work?', next: 'assignment' },
              { label: 'Sensitive material?', next: 'sensitive' },
              { label: 'Got it. Heading down.', next: 'sendoff' }
            ]
          },
          passing: {
            text: 'Nobody passes through here. This is a dead end — literally. Stairs go down, adventurers go down, and Gleaners go down after them to clean up the mess. If Dispatch sent you, you\'re in the right place.',
            choices: [
              { label: 'Fine. What\'s the job?', next: 'assignment' },
              { label: '...fair enough', next: 'assignment' }
            ]
          },
          door: {
            text: 'Smashed clean off the hinges. The Dispatcher told you it was locked, right? It wasn\'t. Hasn\'t been locked since the last party came through and decided a door was an insult to their heroic destiny. I stopped replacing it.',
            choices: [
              { label: 'So the fetch quest was pointless', next: 'fetchquest' },
              { label: 'What do I do now?', next: 'assignment' }
            ]
          },
          fetchquest: {
            text: 'Welcome to bureaucracy. Dispatch sends you for keys to a door that isn\'t locked, then sends you here to clean a dungeon that\'s already been triaged. The system works. Mostly. Anyway — you\'re here now, and the floors below need attention.',
            choices: [
              { label: 'What needs doing?', next: 'assignment' },
              { label: 'Who triaged it?', next: 'sensitive' }
            ]
          },
          carnage: {
            text: 'Adventurers don\'t tidy up after themselves. Smashed crates, scattered inventory, scorch marks on the walls, half-eaten rations everywhere. Some floors look like a tavern brawl hit a warehouse. That\'s what you\'re here for.',
            choices: [
              { label: 'How do I clean all that?', next: 'assignment' },
              { label: 'Were there casualties?', next: 'casualties' }
            ]
          },
          casualties: {
            text: 'On the adventurer side? Not this time — they were high-level. On the other side... let\'s just say Ren from Dispatch already handled that part. What\'s left for you is property damage, not body recovery.',
            choices: [
              { label: 'Ren handled it?', next: 'sensitive' },
              { label: 'Right. What\'s the job?', next: 'assignment' }
            ]
          },
          sensitive: {
            text: 'Ren\'s a veteran Gleaner — been with the Guild twenty years. Anything the Guild classifies as above your clearance, she bags and tags before you arrive. Corpses, artifacts, anything that hums. Don\'t worry about what she took. Worry about what she left.',
            choices: [
              { label: 'Anything that hums?', next: 'hum_hint' },
              { label: 'What did she leave?', next: 'assignment' }
            ]
          },
          hum_hint: {
            text: 'Mmm. Probably nothing. The deep floors have a background vibration — something in the stone. Old-timers call it the Resonance. Used to be steady. Lately it... isn\'t. But that\'s above both our pay grades.',
            choices: [
              { label: 'The Resonance?', next: 'resonance' },
              { label: 'Back to the job', next: 'assignment' }
            ]
          },
          resonance: {
            text: 'Like something breathing far below. Or singing very quietly. I\'ve been posted here eighteen years, and it\'s always been there. But after the last party went through... it stuttered. First time ever. I put it in my report. Nobody replied.',
            choices: [
              { label: '...', next: 'assignment' },
              { label: 'I\'ll keep my ears open', next: 'assignment' }
            ]
          },
          assignment: {
            text: 'Three things you can do down there: restock the supply crates before the next wave of adventurers ransacks them, scrub walls and floors — the basics — or study up on advanced techniques. Your choice where to start.',
            choices: [
              { label: 'How do I restock crates?', next: 'crates' },
              // Pre-discovery: point player to the hose they haven't grabbed
              { label: 'Where\'s the hose?', next: 'hose_location', showIf: { flag: 'hoseDiscovered', value: false } },
              // Post-discovery: offer tips on the hose they already have
              { label: 'Hose tips?', next: 'hose_basics', showIf: { flag: 'hoseDiscovered' } },
              { label: 'How do I scrub?', next: 'scrub' },
              { label: 'Study up?', next: 'books' },
              { label: 'All three. Got it.', next: 'sendoff' }
            ]
          },
          crates: {
            text: 'Find a smashed crate, interact with it. If you\'ve got the right restocking materials in your bag, the crate refills automatically. Materials come from shops on the Promenade or from salvage you pick up along the way. Each restocked crate earns you pay and bumps the floor\'s readiness score.',
            choices: [
              { label: 'What about scrubbing?', next: 'scrub' },
              { label: 'And the books?', next: 'books' },
              { label: 'Good enough. Heading down.', next: 'sendoff' }
            ]
          },
          scrub: {
            text: 'Cobwebs, grime, scorch marks — interact with a dirty tile to clean it. For the heavier stuff, the pressure hose on the cleanup rig handles it in one pass. Much faster than elbow grease.',
            choices: [
              { label: 'Where\'s the cleanup rig?', next: 'hose_location', showIf: { flag: 'hoseDiscovered', value: false } },
              { label: 'Hose tips?', next: 'hose_basics', showIf: { flag: 'hoseDiscovered' } },
              { label: 'What about restocking?', next: 'crates' },
              { label: 'And the books?', next: 'books' },
              { label: 'Got it. Heading down.', next: 'sendoff' }
            ]
          },
          books: {
            text: 'There\'s a shelf down the hall with field manuals. Dungeon Hygiene Standards, Crate Inventory Protocol, that kind of thing. Dry reading, but the techniques in there will make your job faster. Some of the advanced methods — fire suppression, trap re-arming — you can only learn from the books.',
            choices: [
              { label: 'How do I restock crates?', next: 'crates' },
              { label: 'What about scrubbing?', next: 'scrub' },
              { label: 'I\'ll read up. Thanks.', next: 'sendoff' }
            ]
          },
          sendoff: {
            text: 'Stairs are at the back of the post. Watch your step going down — the adventurers cracked a few of those too. And Gleaner? Don\'t be a hero. Clean the floors, collect your pay, come back alive. That\'s the job.',
            choices: [
              { label: 'Copy that', next: null },
              { label: 'Any last advice?', next: 'advice' }
            ]
          },
          advice: {
            text: 'Don\'t skip the corners — readiness inspectors check everything. Restock before you scrub; it\'s easier to clean around full crates than empty ones. And if you hear something moving in the dark? Walk the other way. The things the Hero left alive are the things the Hero couldn\'t be bothered to kill. Think about what that means.',
            choices: [
              { label: 'Understood', next: null }
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
              { label: 'What is this place?', next: 'building' },
              { label: 'What\'s on the menu?', next: 'menu' },
              { label: 'A room for the night', next: 'room' },
              { label: 'Heard any rumors?', next: 'rumors' },
              { label: 'Just browsing', next: null }
            ]
          },
          building: {
            text: 'The Driftwood Inn. Oldest standing building on the Promenade. Built from shipwreck timber before the Compact was even signed. I\'m Marlo. Third generation innkeeper. My grandmother opened the bar. I inherited the debt.',
            choices: [
              { label: 'Shipwreck timber?', next: 'timber' },
              { label: 'What\u2019s on the shelves?', next: 'bookshelf' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          timber: {
            text: 'The founding fleet. Three ships made it into the cove. None of them left. The Driftwood is literally built from their hulls. You can see the old rivet lines if you look at the ceiling beams.',
            choices: [
              { label: 'Why didn\u2019t they leave?', next: 'didnt_leave' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          didnt_leave: {
            text: 'That\u2019s the question, isn\u2019t it? Official story is the cove entrance collapsed. Natural rockfall. Convenient rockfall, if you ask the conspiracy crowd. Either way, the settlers adapted. Built a town in a cave system. Here we are.',
            choices: [
              { label: 'Conspiracy crowd?', next: 'conspiracy' },
              { label: 'Huh', next: null }
            ]
          },
          conspiracy: {
            text: 'Every settlement has them. Ours say the cave-in wasn\u2019t natural; it was part of the Compact. The dragons sealed us in so we\u2019d have to maintain the caves. The Archivist at the Bazaar feeds this stuff. Check the bookshelves there if you want to go down that rabbit hole.',
            choices: [
              { label: 'Interesting...', next: null }
            ]
          },
          bookshelf: {
            text: 'Guest journals, mostly. Travelers write their stories. Some are funny, some are sad, some are suspiciously detailed about the cave layout. There\u2019s also a few volumes of local history. The Dragon Compact chapter is dog-eared. Popular reading.',
            choices: [
              { label: 'I\u2019ll check them out', next: null },
              { label: 'Back', next: 'greeting' }
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
            text: 'Good choice. Take a seat anywhere... except table three. That\'s reserved for the Hero. Don\'t ask.',
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
            text: 'The Watchman at 2.2 hasn\'t slept in three days. The Hero this cycle isn\'t normal; goes straight to the deep floors, skips everything above. And someone from the Tide Council was asking about old maps.',
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
            text: 'Oh, a comedian. Great. Just what this town needs... another wise-guy with a mop. Get lost before I call the Admiralty.',
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

      // ── Coral Bazaar NPCs (Floor 1.1) ────────────────────────────

      // Coral Merchant — market vendor, building explainer, scale trade
      NpcSystem.registerTree('bazaar_merchant', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Fresh coral, scale fragments, hero salvage. Best prices on the Promenade. What brings you to the Bazaar?',
            choices: [
              { label: 'What is this place?', next: 'building' },
              { label: 'What do you sell?', next: 'wares' },
              { label: 'Heard anything interesting?', next: 'lore' },
              { label: 'Just looking', next: null }
            ]
          },
          building: {
            text: 'The Coral Bazaar. Only licensed market in the settlement. We deal in everything the heroes drag up and the Gleaners haul out. Tide Council regulates prices. Admiralty taxes the rest.',
            choices: [
              { label: 'Who runs it?', next: 'who_runs' },
              { label: 'What are the bookshelves for?', next: 'bookshelf' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          who_runs: {
            text: 'Officially? The Tide Council holds the charter. Practically? Whoever has scale fragments to trade sets the market. Before the Compact the merchants ran themselves. Now everything goes through the Council first.',
            choices: [
              { label: 'The Compact again...', next: 'compact' },
              { label: 'Thanks', next: null }
            ]
          },
          bookshelf: {
            text: 'Import records, price histories, vendor catalogs. Dry reading unless you care about where the money goes. Check the shelves if you want to understand the economy here. Tells you more than anyone will say out loud.',
            choices: [
              { label: 'I\'ll take a look', next: null },
              { label: 'Back', next: 'greeting' }
            ]
          },
          wares: {
            text: 'Scale fragments for crafting, dried coral for alchemy, hero salvage for the ambitious. I also buy dungeon scrap if your pockets are heavy. Everything is priced by the piece.',
            choices: [
              { label: 'Scale fragments?', next: 'scales' },
              { label: 'Hero salvage?', next: 'salvage' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          scales: {
            text: 'Dragon scales. Fragment-sized, mostly. The deeper floors shed them. Nobody knows why. The Tide Council claims mineral deposits; the Foundry says it\u2019s something alive down there. Either way, they\u2019re valuable.',
            choices: [
              { label: 'Something alive?', next: 'alive' },
              { label: 'Interesting', next: null }
            ]
          },
          alive: {
            text: 'I don\u2019t get paid to speculate. But the scales are warm when they come up fresh. Make of that what you will.',
            choices: [
              { label: '...noted', next: null }
            ]
          },
          salvage: {
            text: 'Broken weapons, torn armor, singed pouches. Heroes leave a trail. The Guild labels it "hazardous waste" and the Gleaners are supposed to dispose of it, but between you and me... some of it\u2019s perfectly usable.',
            choices: [
              { label: 'I\u2019ll keep that in mind', next: null }
            ]
          },
          lore: {
            text: 'Interesting? In this town? Ha. Well... the Foundry\u2019s been buying triple their usual scale order. And someone at the Admiralty is asking about the old cave surveys. The ones from before the Compact.',
            choices: [
              { label: 'Before the Compact?', next: 'compact' },
              { label: 'The Foundry is stockpiling?', next: 'foundry' },
              { label: 'Hmm', next: null }
            ]
          },
          compact: {
            text: 'The Dragon Compact. Treaty that established the hero cycle, the Guild, the whole system. Couple hundred years old. Nobody reads it anymore but it\u2019s the legal foundation for everything. The Archivist over there knows more.',
            choices: [
              { label: 'I\u2019ll ask them', next: null },
              { label: 'Thanks', next: null }
            ]
          },
          foundry: {
            text: 'Three times the usual quantity of scale fragments. Whatever they\u2019re building, it isn\u2019t small. The Admiralty\u2019s nervous. When the Admiralty gets nervous, prices go up. Bad for business.',
            choices: [
              { label: 'Sounds political', next: null }
            ]
          }
        }
      });

      // Bazaar Archivist — lore keeper, bookshelf champion, Compact expert
      NpcSystem.registerTree('bazaar_archivist', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Hmm? Oh. Hello. I was cataloguing the import manifests. Do you need something, or are you here to browse the records?',
            choices: [
              { label: 'What do you do here?', next: 'role' },
              { label: 'Tell me about the bookshelves', next: 'bookshelves' },
              { label: 'What is the Dragon Compact?', next: 'compact_intro' },
              { label: 'Sorry to interrupt', next: null }
            ]
          },
          role: {
            text: 'I maintain the Bazaar\u2019s records. Trade volumes, price histories, council minutes. Everything that passes through this market gets documented. The Tide Council requires it. I happen to find it fascinating.',
            choices: [
              { label: 'The Tide Council?', next: 'tide' },
              { label: 'You enjoy record-keeping?', next: 'enjoy' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          enjoy: {
            text: 'Records don\u2019t lie. People do, heroes do, the Council certainly does. But the numbers tell you what actually happened. Trends reveal intent. If you want to understand this settlement, read the ledgers.',
            choices: [
              { label: 'Where can I read them?', next: 'bookshelves' },
              { label: 'Fair point', next: null }
            ]
          },
          bookshelves: {
            text: 'The shelves along the walls hold everything. Import records sorted by season, price indexes by commodity, vendor licenses. The older volumes near the back door date to the early Compact period. Those are the interesting ones.',
            choices: [
              { label: 'Early Compact? How so?', next: 'early_compact' },
              { label: 'I\u2019ll browse them', next: null }
            ]
          },
          early_compact: {
            text: 'The first century of trade records shows a settlement that was genuinely afraid. Prices for fortification materials were astronomical. Scale fragment trade didn\u2019t exist yet. The dragons were still... present. Not just an echo in the deep floors.',
            choices: [
              { label: 'Dragons were here?', next: 'dragons' },
              { label: 'When did scale trade begin?', next: 'scale_trade' },
              { label: 'Fascinating', next: null }
            ]
          },
          dragons: {
            text: 'The Compact exists for a reason. It was a treaty of coexistence. The settlement founders negotiated access to the cave system in exchange for... something. The terms are sealed in the Council vault. I\u2019ve only seen summaries.',
            choices: [
              { label: 'In exchange for what?', next: 'exchange' },
              { label: 'Where is the original?', next: 'vault' },
              { label: 'Heavy stuff', next: null }
            ]
          },
          exchange: {
            text: 'That\u2019s the question, isn\u2019t it? The summaries say "custodial obligations." The hero cycle, the cleaning, the readiness system\u2014it might all be part of the bargain. We maintain the caves and in return...',
            choices: [
              { label: 'In return?', next: 'in_return' }
            ]
          },
          in_return: {
            text: 'In return, we\u2019re allowed to live here. That\u2019s one reading. The Admiralty\u2019s reading is different. They say the Compact grants dominion, not tenancy. The distinction matters rather a lot.',
            choices: [
              { label: '...', next: null }
            ]
          },
          vault: {
            text: 'The Tide Council building. Supposedly in a fire-proof vault below the council chamber. I\u2019ve applied for research access six times. Denied each time. The Archivist before me? Also denied. Make of that what you will.',
            choices: [
              { label: 'Suspicious', next: null }
            ]
          },
          scale_trade: {
            text: 'About eighty years after the Compact. The first Gleaners started finding fragments during routine cleaning. The Foundry figured out they had useful properties. Within a decade, scales were the settlement\u2019s primary export. The economy shifted overnight.',
            choices: [
              { label: 'Useful properties?', next: 'properties' },
              { label: 'Thanks', next: null }
            ]
          },
          properties: {
            text: 'Heat resistance, structural integrity, some say mild luminescence under pressure. The Foundry guards the specifics. What I know is that demand outstrips supply by a factor of three and the deep floors are the only source.',
            choices: [
              { label: 'The deep floors...', next: null }
            ]
          },
          compact_intro: {
            text: 'The founding treaty of this settlement. Signed approximately two hundred years ago between the original settlers and... well, the other party is variously described as "the cave custodians," "the fire council," or simply "them." Euphemisms.',
            choices: [
              { label: 'Dragons', next: 'dragons' },
              { label: 'What does the Compact say?', next: 'compact_terms' },
              { label: 'Who has the original?', next: 'vault' }
            ]
          },
          compact_terms: {
            text: 'Three pillars, as summarised in the council minutes. First: the settlement may occupy the surface and upper cave levels. Second: the hero cycle operates on a fixed schedule as an "inspection protocol." Third: custodial maintenance is the settlement\u2019s obligation.',
            choices: [
              { label: 'Custodial maintenance... that\u2019s us', next: 'thats_us' },
              { label: 'Inspection protocol?', next: 'inspection' }
            ]
          },
          thats_us: {
            text: 'Precisely. Gleaners. We clean, restock, repair. The heroes "inspect." Whether they\u2019re inspecting on behalf of the settlement or on behalf of the other party depends on which faction you ask.',
            choices: [
              { label: 'Heavy', next: null }
            ]
          },
          inspection: {
            text: 'The hero cycle. Every few days, designated combatants enter the caves and... test the defenses. Readiness. If the dungeon passes inspection, the cycle continues peacefully. If it doesn\u2019t...',
            choices: [
              { label: 'If it doesn\u2019t?', next: 'if_not' }
            ]
          },
          if_not: {
            text: 'Nobody alive has seen a failed Compact cycle. The records from the early period suggest the consequences were... significant. Structural. The older ledgers mention "subsidence events." I suspect that\u2019s a polite word for cave-ins.',
            choices: [
              { label: '...I should get back to work', next: null }
            ]
          },
          tide: {
            text: 'One of the three factions. They control trade, the market charter, and the vault where the original Compact is kept. Merchant-political class. The Foundry builds, the Admiralty governs, and the Tide... manages the money.',
            choices: [
              { label: 'Three factions', next: 'factions' },
              { label: 'Got it', next: null }
            ]
          },
          factions: {
            text: 'Tide Council, Foundry Guild, and the Admiralty. They share power. Barely. The hero cycle keeps the balance because all three need the caves maintained. Without Gleaners, the system collapses. That\u2019s your leverage, by the way.',
            choices: [
              { label: 'Good to know', next: null }
            ]
          }
        }
      });

      // Cellar Owner — Floor 1.3 (nervous, defensive, building explainer)
      NpcSystem.registerTree('cellar_resident', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Oh! You startled me. Are you from the Guild? Please tell me you\'re from the Guild.',
            choices: [
              { label: 'I\'m a Gleaner, yes', next: 'relief' },
              { label: 'What is this building?', next: 'building' },
              { label: 'What\'s wrong?', next: 'whats_wrong' },
              { label: 'Just passing through', next: 'passing' }
            ]
          },
          building: {
            text: 'It\u2019s the storm shelter. Civic infrastructure. When the hero cycle goes bad and the tremors start, everyone comes down here. The cellar beneath connects to the cave system. Used to be a storage depot before the Guild repurposed it.',
            choices: [
              { label: 'The tremors?', next: 'tremors' },
              { label: 'What\u2019s on those shelves?', next: 'bookshelf' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          tremors: {
            text: 'When readiness drops too low, the deep floors respond. Subtle at first\u2014loose stones, dust from the ceiling. The old-timers say a full failure would collapse the upper levels entirely. That\u2019s why the Guild exists. That\u2019s why YOU exist.',
            choices: [
              { label: 'No pressure', next: 'no_pressure' },
              { label: 'Has it ever happened?', next: 'ever_happened' }
            ]
          },
          no_pressure: {
            text: 'Ha. Right. No pressure. Just the structural integrity of the entire settlement riding on whether you mopped the floors properly. Welcome to public service.',
            choices: [
              { label: '...', next: null }
            ]
          },
          ever_happened: {
            text: 'Not in living memory. But the records mention "subsidence events" in the early Compact period. Whole sections of cave system sealed off. The Archivist at the Bazaar can tell you more. I just want my walls to stop cracking.',
            choices: [
              { label: 'I\u2019ll look into it', next: null }
            ]
          },
          bookshelf: {
            text: 'Guild manuals. Maintenance protocols, trap disarmament guides, cleaning solvent recipes. Dry but useful. There\u2019s also a copy of the emergency procedures charter. Read it. Seriously. If the tremors start, you need to know the evacuation routes.',
            choices: [
              { label: 'I\u2019ll read them', next: null },
              { label: 'Back', next: 'greeting' }
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
            text: 'Just... please don\'t touch anything. And close the cellar door behind you if you go down. I don\'t want whatever\'s down there coming up here.',
            choices: [
              { label: 'Understood', next: null }
            ]
          }
        }
      });

      // ── Floor 3 — Immigrant Inspector (Vivec arch gate) ─────────────
      // Stationary checkpoint NPC at (48,25) blocking the Grand Arch to
      // Floor 4. Checks the player's journal for a `rent_receipt_book`
      // entry (proof of residence) before stamping papers. Actual unlock
      // wiring is handled elsewhere — see NpcSystem.getGateCheck().
      NpcSystem.registerTree('floor3_inspector', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: '\uD83D\uDEC2 "Halt. This is the Grand Arch crossing. No one passes to Vivec without proof of residence. Utility bill, rent receipt, lease — something stamped, something recent. Show me your papers."',
            choices: [
              { label: 'Show rent receipt', next: 'check_papers' },
              { label: 'What counts as proof?', next: 'requirements' },
              { label: 'Why is the gate locked?', next: 'why_locked' },
              { label: 'What\u2019s on the other side?', next: 'whats_beyond' },
              { label: 'I\u2019ll be back', next: null }
            ]
          },
          requirements: {
            text: '"Anything that puts your name on a roof in this district. A stamped rent receipt from the safehouse landlord is the fastest. The pay-rent ledger issues a receipt book — bring that, open to the current week, and I can stamp you through. No receipt, no crossing."',
            choices: [
              { label: 'Where do I pay rent?', next: 'where_pay' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          where_pay: {
            text: '"Safehouse on Lantern Row. The landlord keeps the ledger. Pay the week, get the stamp, bring it back here. I don\u2019t care how you earn it — Guild contract, scavenge, shopkeep charity. Just don\u2019t miss the deadline. The archway closes for late payers at end of week two."',
            choices: [
              { label: 'Understood', next: null }
            ]
          },
          why_locked: {
            text: '"Vivec doesn\u2019t take drifters. Every soul that crosses has to be accounted for — taxed, logged, housed. If we let unpapered travelers through, the city\u2019s census collapses and the Admiralty stops funding the arch. So the arch stays locked. The paperwork is the gate."',
            choices: [
              { label: 'Seems bureaucratic', next: 'bureaucratic' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          bureaucratic: {
            text: '"Bureaucracy is what separates a city from a camp. The crowd behind you — they\u2019d tell you the same if they weren\u2019t so tired of telling it."',
            choices: [
              { label: '...', next: null }
            ]
          },
          whats_beyond: {
            text: '"Vivec. Proper city. Canals, towers, light that doesn\u2019t come from a bonfire. If you make it across before the deadline you\u2019ll see it with your own eyes. If you don\u2019t — well. That\u2019s not my problem to carry."',
            choices: [
              { label: 'Back', next: 'greeting' }
            ]
          },
          check_papers: {
            // TODO: Wire to Journal.hasBook(\'rent_receipt_book\') — on success
            // set flags \'locked_door_3:51,25\' and \'locked_door_3:51,26\' and
            // route to `accepted`. On failure route to `rejected`. Until
            // wired, always routes to `rejected` as a stub (see gateCheck
            // tag on NpcSystem floor3_inspector def).
            text: '"Let me see... hm. I don\u2019t see a rent receipt in your journal. No stamp, no crossing. Come back when you\u2019ve paid your week."',
            choices: [
              { label: 'I\u2019ll pay and return', next: null }
            ]
          },
          rejected: {
            text: '"No receipt. Move aside — there are people behind you."',
            choices: [
              { label: '...', next: null }
            ]
          },
          accepted: {
            text: '\uD83D\uDEC2\u2705 "Stamped. The arch is open to you. Don\u2019t lose the receipt — you\u2019ll need it on the Vivec side too. Safe crossing, citizen."',
            choices: [
              { label: 'Thank you', next: null }
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

        // PW-2: Hose subtree validation. HoseState decides whether the new
        // floor is still in the allowed building subtree; if not, it detaches
        // with 'wrong_building' and the step listener sees isActive() === false.
        if (typeof HoseState !== 'undefined' && HoseState.isActive()) {
          HoseState.onFloorEnter(FloorManager.getFloor());
        }

        // PW-4: Resume hose reel after floor transition completes
        if (typeof HoseReel !== 'undefined') {
          HoseReel.onFloorTransitionComplete();
        }

        // Re-evaluate WaterCursorFX gating for the new floor depth.
        // (Hose may have just detached via subtree validation above.)
        _evaluateCursorFxGating();

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

        // Refresh dump truck tiles — floor grid may have just been created
        if (typeof DumpTruckSpawner !== 'undefined') {
          DumpTruckSpawner.refresh();
        }

        // Per-floor arrival hooks (ambient barks, NPC spawns, gate logic).
        // Must run BEFORE quest marker update so the Dispatcher NPC is
        // spawned and DispatcherChoreography.getEntity() is live when
        // QuestWaypoint.update() reads it on Floor 1.
        _onFloorArrive(FloorManager.getFloor());

        // Refresh quest waypoint for the new floor. Without this, the
        // minimap marker stays stuck at the previous floor's coordinates
        // and renders at a garbage tile on the new grid.
        _updateQuestTarget();
      }
    });

    // Initialize starting floor — Floor 0 (exterior approach)
    var startFloorId = '0';
    FloorManager.setFloor(startFloorId);
    Minimap.pushFloor(startFloorId);
    Minimap.enterFloor(startFloorId, 'The Approach');

    // Generate Floor 0 and wire movement callbacks
    _generateAndWire();

    // Start overworld music for the initial floor (title music persists)
    if (typeof AudioMusicManager !== 'undefined') {
      AudioMusicManager.onFloorChange(startFloorId);
    }

    // Trigger per-floor arrival hooks for the starting floor (NPC spawns,
    // ambient barks, gate logic). _onFloorArrive is normally fired by the
    // FloorTransition callback, but the very first floor is loaded directly
    // — not via transition — so it must be called explicitly here.
    _onFloorArrive(startFloorId);

    // Draw initial card hand
    CardAuthority.drawHand();
    HUD.updateCards(CardAuthority.getHand());
    var _initHand = CardAuthority.getHand();
    if (_initHand.length > 0 && typeof Toast !== 'undefined') {
      Toast.show('\uD83C\uDCA0 Drew ' + _initHand.length + ' cards', 'dim');
    }

    // Play deploy dropoff monologue (player was just dropped off by the truck).
    // IntroWalk (cursor-hijack tutorial) disabled for jam — module preserved
    // in engine/intro-walk.js for post-jam re-enable. To restore, uncomment
    // the script tag in index.html and call _startIntroWalk() in onComplete.
    if (typeof MonologuePeek !== 'undefined' && MonologuePeek.play) {
      MonologuePeek.play('deploy_dropoff');
    }

    // Wire input polling
    InputPoll.init({
      isBlocked: function () {
        return !ScreenManager.isPlaying() ||
               CombatEngine.isActive() ||
               CombatBridge.isPending() ||
               FloorTransition.isTransitioning() ||
               DialogBox.moveLocked() ||
               (typeof StatusBar !== 'undefined' && StatusBar.isDialogueActive && StatusBar.isDialogueActive()) ||
               (typeof PeekSlots !== 'undefined' && PeekSlots.isOpen()) ||
               (typeof HoseReel !== 'undefined' && HoseReel.isActive());
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

    // Reset morning report dedup for new run
    if (typeof MorningReport !== 'undefined') MorningReport.reset();

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

  /**
   * Animate HUD elements sliding into position after first deploy.
   * Uses CSS transitions — each element starts off-screen, then slides in
   * with a staggered delay so the viewport breathes before UI appears.
   */
  function _animateHUDSlideIn() {
    var HUD_SLIDE_MS = '0.6s';
    var elements = [
      { el: document.getElementById('minimap-frame'),  delay: 0,   from: 'translateX(120%)' },
      { el: document.getElementById('status-bar'),     delay: 200, from: 'translateY(100%)' },
      { el: document.getElementById('debrief-feed'),   delay: 100, from: 'translateX(-120%)' }
    ];
    // NchWidget + QuickBar are smaller — stagger later
    var nchEl = document.getElementById('nch-widget');
    if (nchEl) elements.push({ el: nchEl, delay: 300, from: 'translateY(80px) scale(0.8)' });
    var qbEl = document.getElementById('quick-bar');
    if (qbEl) elements.push({ el: qbEl, delay: 250, from: 'translateY(80px)' });
    var dpadEl = document.getElementById('dpad-frame');
    if (dpadEl) elements.push({ el: dpadEl, delay: 350, from: 'translateX(-120%)' });

    for (var i = 0; i < elements.length; i++) {
      (function (cfg) {
        if (!cfg.el) return;
        // Start from off-screen position
        cfg.el.style.transition = 'none';
        cfg.el.style.transform = cfg.from;
        cfg.el.style.opacity = '0';
        // Force reflow then animate in
        void cfg.el.offsetHeight;
        setTimeout(function () {
          cfg.el.style.transition = 'transform ' + HUD_SLIDE_MS + ' cubic-bezier(0.22,1,0.36,1), opacity 0.4s ease';
          cfg.el.style.transform = '';
          cfg.el.style.opacity = '';
        }, cfg.delay);
      })(elements[i]);
    }

    // Clean up inline transitions after animation completes
    setTimeout(function () {
      for (var j = 0; j < elements.length; j++) {
        if (elements[j].el) {
          elements[j].el.style.transition = '';
          elements[j].el.style.transform = '';
        }
      }
    }, 1200);
  }

  /**
   * Suppress / restore DOM HUD overlays during pause so the canvas-rendered
   * menu faces aren't occluded by higher-z DOM elements.
   * StatusBar stays visible (BAG/DECK buttons navigate menu faces).
   */
  function _suppressHUDForPause(suppress) {
    var minimapFrame = document.getElementById('minimap-frame');
    if (minimapFrame) minimapFrame.style.display = suppress ? 'none' : '';
    if (typeof DebriefFeed !== 'undefined') {
      if (suppress) DebriefFeed.hide(); else DebriefFeed.show();
    }
    if (typeof NchWidget !== 'undefined') {
      if (suppress) NchWidget.hide(); else NchWidget.show();
    }
    if (typeof DPad !== 'undefined') {
      if (suppress) DPad.hide(); else DPad.show();
    }
    if (typeof StatusBar !== 'undefined') {
      if (suppress) StatusBar.hide(); else StatusBar.show();
    }
    if (typeof QuickBar !== 'undefined') {
      if (suppress) QuickBar.hide(); else QuickBar.show();
    }
  }

  // ── Phase 2 panel refresh helper ────────────────────────────────────

  // Delegated to GameActions.refreshPanels()
  function _refreshPanels() { GameActions.refreshPanels(); }

  // ── Intro auto-walk sequence ──────────────────────────────────────
  //
  // After avatar selection, player spawns on Floor 0 exterior (19,26)
  // facing north on the 40×30 grid. Auto-walk through the courtyard,
  // past the bonfire, up to the building facade. Then auto-trigger
  // DOOR interaction at (19,5) → depth 1→1 transition to Promenade.
  //
  // Player gets free movement on the Promenade. They find building
  // DOORs to descend into interiors and dungeons.
  //
  // Path: (19,26) → 20 steps north to (19,6) — one tile south of DOOR
  // Auto-interact DOOR at (19,5) → "Entering..." → Floor 1 Promenade.

  function _startIntroWalk() {
    if (typeof IntroWalk === 'undefined') return;

    // Cursor-hijack tutorial: shows a fake cursor clicking the minimap
    // to teach the player about click-to-move pathfinding. Player has
    // free input the entire time — if they move, the demo aborts.
    //
    // Target: DOOR at (19,5) on the 40×30 Floor 0 grid.
    // MinimapNav walks the player to (19,6) — one tile south of DOOR.
    // onComplete triggers the door transition to The Promenade.

    IntroWalk.start({
      targetX: 19,
      targetY: 5,
      startDelay: 1200,  // Let player see the exterior courtyard
      onComplete: function () {
        // Player arrived at (19,6) facing north — DOOR at (19,5)
        // Trigger depth 1→1 door transition to The Promenade.
        //
        // IMPORTANT: Call go() synchronously — no setTimeout. IntroWalk
        // sets _active=false before calling onComplete, which unblocks
        // InputPoll. If we delay, the next frame can poll input and
        // trigger a manual tryInteractDoor that races with our go().
        console.log('[Game] Cursor-hijack tutorial complete — entering building');

        // Start door animation (visual: door opens before fade)
        if (typeof DoorAnimator !== 'undefined') {
          DoorAnimator.start(19, 5, TILES.DOOR, 'advance', '0', '1');
        }

        DoorContracts.setContract({ x: 19, y: 5 }, 'advance', TILES.DOOR, '0');
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
    if (typeof DispatcherChoreography !== 'undefined') {
      DispatcherChoreography.clearAmbientBarkTimer();
    }

    // C6: Reshuffle deck on dungeon entry — fresh deck for each run.
    // Gate on biome (isDungeonFloor) rather than ID depth so interior
    // stubs like 0.5.N (depth 3 by ID convention) don't trigger dungeon-
    // only systems. The hand is rebuilt by the normal combat flow; we
    // don't auto-draw here (that caused phantom "Drew 5" toasts on
    // traversal, obscuring the actual deck state).
    var isDungeon = (typeof FloorManager !== 'undefined' && FloorManager.isDungeonFloor)
      ? FloorManager.isDungeonFloor(floorId)
      : false;
    if (typeof CardAuthority !== 'undefined' && isDungeon) {
      CardAuthority.resetDeck();
    }

    // Seed blood splatter from corpse tiles on dungeon floors (depth 3+).
    // Only on first visit — cached floors keep their cleaned state.
    // Uses isSeeded() to distinguish "never visited" from "fully cleaned":
    // an empty blood map (all scrubbed) must NOT trigger re-seeding.
    if (typeof CleaningSystem !== 'undefined' && isDungeon) {
      var fd = FloorManager.getFloorData();
      if (fd && !CleaningSystem.isSeeded(floorId)) {
        CleaningSystem.seedFromCorpses(floorId, fd.grid, fd.gridW, fd.gridH);
      }
    }

    // Register pre-placed corpses from blockout data into CorpseRegistry.
    // These are environmental corpses (fallen heroes/monsters the Hero already
    // killed) — they exist as CORPSE tiles in the grid but need rich metadata
    // for the salvage/harvest/reanimate flow to work.
    // Only on first visit — skip if corpses already registered (floor revisit).
    if (typeof CorpseRegistry !== 'undefined' && isDungeon) {
      var corpFd = FloorManager.getFloorData();
      if (corpFd && corpFd.corpseData && corpFd.corpseData.length > 0) {
        for (var _ci = 0; _ci < corpFd.corpseData.length; _ci++) {
          var cd = corpFd.corpseData[_ci];
          if (!CorpseRegistry.hasCorpse(cd.x, cd.y, floorId)) {
            CorpseRegistry.register(cd.x, cd.y, floorId, {
              type:    cd.enemyType || 'unknown',
              name:    cd.name || cd.enemyType || 'Fallen Creature',
              emoji:   cd.emoji || '💀',
              maxHp:   cd.hp || 10,
              hp:      0,
              str:     cd.str || 2,
              suit:    cd.suit || 'spade',
              tags:    cd.tags || [],
              isElite: !!cd.isElite,
              lootProfile: cd.lootProfile || null
            });
          }
        }
      }
    }

    // Clear world-space popups from previous floor
    if (typeof WorldPopup !== 'undefined') WorldPopup.clear();

    // Wire blood floor ID to raycaster so floor tiles render blood tint
    if (typeof Raycaster !== 'undefined' && Raycaster.setBloodFloorId) {
      Raycaster.setBloodFloorId(isDungeon ? floorId : null);
    }

    // C7: Scan trap positions on floor load for re-arm tracking
    if (typeof TrapRearm !== 'undefined' && isDungeon) {
      var trapFd = FloorManager.getFloorData();
      if (trapFd) TrapRearm.onFloorLoad(floorId, trapFd.grid, trapFd.gridW, trapFd.gridH);
    }

    // Cobweb system: scan eligible positions on floor load (depth 3+)
    if (typeof CobwebSystem !== 'undefined' && isDungeon) {
      var cobFd = FloorManager.getFloorData();
      if (cobFd) {
        CobwebSystem.onFloorLoad(cobFd, floorId);
        // Install pre-authored cobwebs from floor blockout data.
        // These represent webs left by a previous gleaner shift — the
        // dungeon isn't pristine, it has some existing maintenance.
        if (cobFd.cobwebs && cobFd.cobwebs.length) {
          for (var _cwi = 0; _cwi < cobFd.cobwebs.length; _cwi++) {
            var _cw = cobFd.cobwebs[_cwi];
            CobwebSystem.install(_cw.x, _cw.y, floorId, 'standalone');
          }
        }
      }
    }

    // IO-8: Auto-create CrateSystem containers for CHEST and BREAKABLE tiles
    // on floor load. Chests are hand-authored; BREAKABLEs are placed by
    // BreakableSpawner on generated floors but must be scanned on blockout
    // floors where BreakableSpawner never runs. Skip if containers already
    // exist (floor revisit with cached data).
    if (typeof CrateSystem !== 'undefined') {
      var chestFd = FloorManager.getFloorData();
      if (chestFd && chestFd.grid) {
        var cGrid = chestFd.grid;
        var cW = chestFd.gridW || (cGrid[0] ? cGrid[0].length : 0);
        var cH = chestFd.gridH || cGrid.length;
        var cBiome = (chestFd.biome && chestFd.biome.name) ? chestFd.biome.name
                   : (chestFd.biome || 'cellar');
        for (var cy = 0; cy < cH; cy++) {
          for (var cx = 0; cx < cW; cx++) {
            var cTile = cGrid[cy][cx];
            if (cTile === TILES.CHEST && !CrateSystem.hasContainer(cx, cy, floorId)) {
              // Home chest on Floor 1.6 at (19,3): large stash + work keys in slot 0
              if (floorId === '1.6' && cx === 19 && cy === 3) {
                var homeChest = CrateSystem.createChest(cx, cy, floorId, cBiome, { stash: true });
                // Pre-fill slot 0 with work keys if gate is still locked
                if (!_gateUnlocked && homeChest.slots.length > 0) {
                  homeChest.slots[0].filled = true;
                  homeChest.slots[0].frameTag = 'key_item';
                  homeChest.slots[0].item = { name: 'Work Keys', emoji: '🗝️', type: 'key', subtype: 'work_keys' };
                  homeChest.slots[0].matched = true;
                }
              } else {
                CrateSystem.createChest(cx, cy, floorId, cBiome);
              }
            }
            // BREAKABLE tiles on blockout floors need crate containers too.
            // Generated floors get these from BreakableSpawner, but blockouts
            // place BREAKABLE tiles directly in the grid array.
            // SC-C: D1 breakables are smash-only — no container system.
            // SC-D: D2 breakables are storage crates (withdraw, daily refill).
            // D3+: deposit crates (current behavior).
            var _brkDepth = floorId ? String(floorId).split('.').length : 1;
            if (cTile === TILES.BREAKABLE && _brkDepth >= 2 &&
                !CrateSystem.hasContainer(cx, cy, floorId)) {
              if (_brkDepth === 2 && CrateSystem.createStorageCrate) {
                CrateSystem.createStorageCrate(cx, cy, floorId, cBiome);
              } else {
                CrateSystem.createCrate(cx, cy, floorId, cBiome);
              }
            }
          }
        }
      }
    }

    // SC-B+: Rehydrate eligible chests on floor load.
    // D1/D2 non-home chests that were looted 7+ days ago get fresh loot.
    if (typeof CrateSystem !== 'undefined' && CrateSystem.rehydrateFloor) {
      var rehydCount = CrateSystem.rehydrateFloor(floorId);
      if (rehydCount > 0 && typeof Toast !== 'undefined') {
        Toast.show('\u2728 ' + rehydCount + ' chest' +
                   (rehydCount > 1 ? 's' : '') + ' restocked with fresh loot', 'info');
      }
    }

    // SC-G: Register vendor positions from floor blockout shops[] array.
    // VendorRegistry centralises faction lookup, NPC data, and sprite generation.
    if (typeof VendorRegistry !== 'undefined' && floorData.shops) {
      VendorRegistry.registerFloor(floorId, floorData.shops);
    }

    // C8: Work order posting and evaluation on floor transitions.
    // Posting gated by biome (dungeon-only) so interior stubs like 0.5.N
    // can't auto-complete empty orders and pay out phantom gold.
    if (typeof WorkOrderSystem !== 'undefined') {
      if (isDungeon) {
        // Arriving at a dungeon floor — post an order if none active
        var existingOrder = WorkOrderSystem.getOrder(floorId);
        if (!existingOrder || existingOrder.status !== 'active') {
          WorkOrderSystem.postOrders([floorId]);
          var newOrder = WorkOrderSystem.getOrder(floorId);
          if (newOrder) {
            Toast.show('📋 ' + i18n.t('work.order_posted', 'Work order posted') +
                        ' - ' + Math.round(newOrder.target * 100) + '%', 'info');
          }
        }
      } else {
        // Returning to surface/interior — evaluate any active dungeon orders
        var evalResult = WorkOrderSystem.evaluate();
        if (evalResult.completed.length > 0) {
          var totalPay = evalResult.totalPayout;
          CardAuthority.addGold(totalPay);
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
    } else if (floorId === '2.2.1') {
      _onArriveHeroWake();
    }
  }
  // ── Hero Wake cinematic — delegated to HeroWake ────────────────

  function _onArriveHeroWake() { HeroWake.onArrive(_previousFloorId); }
  function _spawnWoundedWarden(trigger) { HeroWake.spawnWoundedWarden(trigger); }
  // ── Dispatcher choreography — delegated to DispatcherChoreography ──

  function _onArrivePromenade() { DispatcherChoreography.onArrivePromenade(); }
  function _tickDispatcherChoreography(dt) { DispatcherChoreography.tick(dt); }
  function _findGateDoorPos() { return DispatcherChoreography.findGateDoorPos(); }
  // ── Home events — delegated to HomeEvents ──────────────────────

  function _onArriveHome() { HomeEvents.onArriveHome(); }
  function _checkWorkKeysChest(fx, fy) { return HomeEvents.checkWorkKeysChest(fx, fy); }
  function _onPickupWorkKeys() {
    HomeEvents.onPickupWorkKeys();
    _gateUnlocked = HomeEvents.isGateUnlocked();
    GameActions.setGateUnlocked(_gateUnlocked);
  }
  function _executeOvernightHeroRun(dayNum) { HomeEvents.executeOvernightHeroRun(dayNum); }
  function _doHomeDoorRest() { HomeEvents.doHomeDoorRest(); }

  // ═══════════════════════════════════════════════════════════════
  //  HUD DAY/CYCLE COUNTER — delegated to WeekStrip module
  // ═══════════════════════════════════════════════════════════════

  function _initDayCounter() { if (typeof WeekStrip !== 'undefined') WeekStrip.init(); }
  function _updateDayCounter() { if (typeof WeekStrip !== 'undefined') WeekStrip.update(); }

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

  // ── Readiness tier-crossing handler ─────────────────────────────────
  // Called by HUD when readiness crosses a quarter-tier boundary.
  // Tier 4 (100%) triggers the "Dungeon Reset" celebration toast and
  // refreshes the quest waypoint to point at the exit.

  function _onReadinessTierCross(tier, floorId) {
    if (tier === 4) {
      // Victory viewport glow — gold wash + rotating rays. Only for the
      // deep-dungeon clean-sites (depth ≥ 3). Shallower tiers crossing
      // tier 4 is a data edge case; the glow is tied to the cleaning
      // completion fantasy which only exists at depth 3.
      if (typeof ViewportRing !== 'undefined' && ViewportRing.setVictoryGlow &&
          typeof FloorManager !== 'undefined' && FloorManager.isDungeonFloor &&
          FloorManager.isDungeonFloor(floorId)) {
        ViewportRing.setVictoryGlow(floorId);
      }

      // ── 100% — Dungeon Reset ──────────────────────────────────────
      // Build context-aware message from DungeonSchedule contract.
      var label = '';
      var reportTo = '';
      if (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getGroupForFloor) {
        var groupId = DungeonSchedule.getGroupForFloor(floorId);
        if (groupId) {
          // Resolve the group's display label
          var next = DungeonSchedule.getNextGroup();
          if (next && next.groupId === groupId) {
            label = next.label || '';
          } else {
            // Check full schedule for label
            var sched = DungeonSchedule.getSchedule ? DungeonSchedule.getSchedule() : [];
            for (var si = 0; si < sched.length; si++) {
              if (sched[si].groupId === groupId) { label = sched[si].label || ''; break; }
            }
          }
        }
      }

      // Determine who to report to (NPC name or generic "Dispatch")
      reportTo = i18n.t('readiness.report_dispatch', 'Dispatch');

      var msg = '✅ ' + i18n.t('readiness.dungeon_reset', 'Dungeon Reset');
      if (label) msg += ' — ' + label + ' ' + i18n.t('readiness.ready', 'ready');
      msg += '. ' + i18n.t('readiness.report_to', 'Report to') + ' ' + reportTo + '.';

      if (typeof Toast !== 'undefined') {
        Toast.show(msg, 'success');
      }

      // Refresh quest diamond — now points at STAIRS_UP
      _updateQuestTarget();

      // Log for debug
      console.log('[Game] Readiness 100% on ' + floorId +
                  (label ? ' (' + label + ')' : '') + ' — dungeon reset.');
    } else if (tier === 2) {
      // 50% milestone — subtle encouragement
      if (typeof Toast !== 'undefined') {
        Toast.show('📊 ' + i18n.t('readiness.halfway', 'Halfway there') + ' — 50%', 'info');
      }
    }
    // Tiers 1 and 3 handled by HUD's notch tone only — no toast needed.
  }

  // ── Quest waypoint — delegated to QuestWaypoint ────────────────

  function _updateQuestTarget() { if (typeof QuestWaypoint !== 'undefined') QuestWaypoint.update(); }
  function _evaluateCursorFxGating() { if (typeof QuestWaypoint !== 'undefined') QuestWaypoint.evaluateCursorFxGating(); }

  // ── Movement callbacks ─────────────────────────────────────────────

  var _footstepFoot = 0; // 0=left, 1=right — alternates per step

  function _onMoveStart(fromX, fromY, toX, toY, dir) {
    Player.setDir(dir);
    DoorContracts.tickProtect();

    // During hose reel: suppress footsteps, play hose drag instead.
    // Reeling is 2× speed — rapid footstep SFX at that cadence sounds
    // unnatural. The drag sound sells the "pulling hose" physicality.
    if (typeof HoseReel !== 'undefined' && HoseReel.isActive()) {
      // TODO:SFX hose-drag — short rubbing/scraping loop, 80-150ms,
      // pitched down from baseline. Alternating L/R variants optional.
      // Range: 0.15-0.25 volume, panned center.
      AudioSystem.play('hose-drag', { volume: 0.2 });
      return;
    }

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
    // Auto-minimize expanded tooltip footer on movement
    if (typeof StatusBar !== 'undefined' && StatusBar.collapseIfIdle) {
      StatusBar.collapseIfIdle();
    }

    // Cobweb destruction — player walks through standalone cobweb.
    // The player tears their own web if they backtrack carelessly.
    // Strategic cost: deploy webs after clearing a corridor, then
    // path around them on the way out. Tearing costs 1g penalty
    // (you're undoing your own work) and hurts readiness.
    if (typeof CobwebSystem !== 'undefined') {
      var cobFloorId = FloorManager.getCurrentFloorId();
      if (CobwebSystem.onEntityMove(x, y, cobFloorId)) {
        // Track player self-tear for readiness penalty
        CobwebSystem.recordPlayerTear(cobFloorId);
        // Coin penalty — carelessness costs money (can go to 0, not below)
        var tearPenalty = 1;
        CardAuthority.spendGold(tearPenalty);
        if (typeof AudioSystem !== 'undefined') AudioSystem.play('sweep', { volume: 0.3 });
        Toast.show('🕸️ ' + i18n.t('cobweb.torn', 'You tore your own cobweb!') + '  -' + tearPenalty + 'g', 'warning');
        if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('🕸️ -' + tearPenalty + 'g', x, y, 'warning');
        if (typeof SessionStats !== 'undefined') SessionStats.inc('cobwebsTorn');
        // Silk strand tear particles
        if (typeof CobwebRenderer !== 'undefined' && CobwebRenderer.spawnTear) {
          CobwebRenderer.spawnTear(x, y);
        }
      }
    }

    // PW-2: Hose breadcrumb recording. Each step while the hose is active
    // extends the trail, may detect a kink, and accumulates energy drain.
    // The 'step' listener (wired in init) is what actually spends player
    // energy — we just record here so the drain number is up-to-date
    // before the HUD refresh at the bottom of this function.
    if (typeof HoseState !== 'undefined' && HoseState.isActive()) {
      HoseState.recordStep(x, y, FloorManager.getCurrentFloorId());
    }

    // Advance minimap click-to-move path
    if (typeof MinimapNav !== 'undefined') MinimapNav.onMoveFinish();

    // Advance hose reel retrace (PW-4)
    if (typeof HoseReel !== 'undefined') HoseReel.onMoveFinish();

    // ── Energy exhaustion → forced reel (PW-4) ──
    // After recording the step (above), check if the player has run out
    // of energy while dragging the hose. If so, force an auto-reel.
    if (typeof HoseState !== 'undefined' && HoseState.isActive() &&
        typeof HoseReel !== 'undefined' && !HoseReel.isActive()) {
      var _playerEnergy = (typeof Player !== 'undefined') ? Player.state().energy : 99;
      if (_playerEnergy <= 0) {
        HoseReel.start({ forced: true });
      }
    }

    var floorData = FloorManager.getFloorData();
    var tile = floorData.grid[y][x];

    // Door step-through: stepping onto a door tile auto-triggers the
    // transition (same as interacting). Prevents the player from walking
    // into the gap between a door facade and the wall behind it.
    if (TILES.isDoor(tile)) {
      FloorTransition.tryInteractDoor(x, y);
      return; // Transition handles everything from here
    }

    // CHEST is non-walkable (IO-8 Apr 3) — interaction via F-interact only.
    // Walk-on auto-open removed; chest uses PeekSlots/CrateUI withdraw mode.

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

    // Walk-over detritus auto-collect (step on debris → battery/HP/energy)
    if (tile === TILES.DETRITUS) {
      _collectDetritus(x, y);
    }

    // ── DEPTH3 §6.3c: Scrub-on-walk passive cleaning ──
    // Walking over a blood tile with a cleaning tool equipped auto-scrubs
    // 1 blood layer. No interaction needed — exploration IS cleaning.
    if (typeof CleaningSystem !== 'undefined') {
      var scrubFloorId = FloorManager.getCurrentFloorId();
      if (CleaningSystem.isDirty(x, y, scrubFloorId)) {
        var tool = CardAuthority.getEquipSlot(1); // consumable slot
        if (tool && tool.subtype && CleaningSystem.TOOL_SPEED[tool.subtype]) {
          var scrubbed = CleaningSystem.scrub(x, y, scrubFloorId, tool.subtype);
          if (scrubbed) {
            AudioSystem.play('sweep', { volume: 0.2 });
            // Subtle red flash feedback, no text toast (spec: "subtle red flash on tile")
            if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('🩸', x, y, 'warning');
          }
        }
      }
    }

    // HOT tick (heal-over-time from food items)
    var hotRestored = Player.tickHOT();
    if (hotRestored > 0) HUD.updatePlayer(Player.state());

    CombatBridge.checkEnemyProximity(x, y);
    HUD.updatePlayer(Player.state());
    _refreshPanels();
  }

  // Delegated to GameActions.applyPickup()
  function _applyPickup(pickup) { GameActions.applyPickup(pickup); }

  function _onBump(dir) {
    AudioSystem.play('ui-blop');
    // Cancel minimap auto-path on collision
    if (typeof MinimapNav !== 'undefined') MinimapNav.onBump();
    // Cancel hose reel on collision (shouldn't happen, but safe fallback)
    if (typeof HoseReel !== 'undefined') HoseReel.onBump();

    // Check whether the bumped tile is the Dispatcher gate NPC.
    // The grab choreography handles the first encounter via proximity.
    // Bumps only trigger dialogue for repeat encounters (phase = 'done').
    var _dispEnt = (typeof DispatcherChoreography !== 'undefined') ? DispatcherChoreography.getEntity() : null;
    var _dispPhase = (typeof DispatcherChoreography !== 'undefined') ? DispatcherChoreography.getPhase() : 'done';
    if (!_gateUnlocked && _dispEnt && _dispPhase === 'done') {
      var pos = MC.getGridPos();
      var bumpX = pos.x + MC.DX[dir];
      var bumpY = pos.y + MC.DY[dir];
      if (_dispEnt.x === bumpX && _dispEnt.y === bumpY) {
        // Turn both NPC and player to face each other
        if (typeof NpcSystem !== 'undefined' && NpcSystem.engageTalk) {
          NpcSystem.engageTalk(_dispEnt);
        }
        // Turn player to face dispatcher + lock MouseLook
        var ddx = _dispEnt.x - pos.x;
        var ddy = _dispEnt.y - pos.y;
        var bumpDir = (Math.abs(ddx) >= Math.abs(ddy))
          ? (ddx > 0 ? MC.DIR_EAST : MC.DIR_WEST)
          : (ddy > 0 ? MC.DIR_SOUTH : MC.DIR_NORTH);
        MC.startTurn(bumpDir);
        Player.setDir(bumpDir);
        if (typeof MouseLook !== 'undefined' && MouseLook.lockOn) {
          MouseLook.lockOn(0, 0);
        }
        if (typeof Player !== 'undefined' && Player.resetLookOffset) {
          Player.resetLookOffset();
        }

        if (typeof DispatcherChoreography !== 'undefined') DispatcherChoreography.showDispatcherGateDialog();
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

    // Work-keys chest on Floor 1.6 now goes through the CrateUI withdraw
    // path like all other chests. The onWithdraw callback detects the
    // work_keys subtype and fires _onPickupWorkKeys() automatically.
    // (Old bypass removed — IO-8 standardization.)

    // NPC interaction — delegate to NpcSystem. All NPC types respond:
    // INTERACTIVE/DISPATCHER use dialogue trees, AMBIENT cycles barks.
    if (typeof NpcSystem !== 'undefined') {
      var npcAtTile = NpcSystem.findAtTile(fx, fy, FloorManager.getEnemies());
      if (npcAtTile && npcAtTile.npcType) {
        NpcSystem.interact(npcAtTile, FloorManager.getFloor());
        return;
      }
    }

    // Friendly (resurrected) enemy interaction — bark or re-fight.
    // Skip when hose is active: the janitor is working, not chatting.
    // Cleaning priority passes through to the scrub block below.
    var _hoseSkipBark = (typeof HoseState !== 'undefined' && HoseState.isActive());
    if (!_hoseSkipBark && typeof CombatBridge !== 'undefined') {
      var enemies = FloorManager.getEnemies();
      for (var _fi = 0; _fi < enemies.length; _fi++) {
        var _fe = enemies[_fi];
        if (_fe.friendly && _fe.x === fx && _fe.y === fy) {
          CombatBridge.interactFriendlyEnemy(_fe);
          return;
        }
      }
    }

    // Cobweb installation — spider deployment on eligible corridor tiles
    // Awards 2g per web (gleaner work = coin income).
    if (typeof CobwebNode !== 'undefined') {
      if (CobwebNode.tryInteract(FloorManager.getCurrentFloorId())) {
        if (typeof SessionStats !== 'undefined') SessionStats.inc('cobwebsInstalled');
        // Coin reward for gleaner work
        var cobwebGold = 2;
        CardAuthority.addGold(cobwebGold);
        Toast.show('🕷️ ' + i18n.t('cobweb.installed', 'Cobweb installed') + '  +' + cobwebGold + 'g', 'loot');
        if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('🕷️ +' + cobwebGold + 'g', fx, fy, 'loot');
        if (typeof ParticleFX !== 'undefined') {
          var _cobCanvas = document.getElementById('view-canvas');
          var _cobCx = _cobCanvas ? _cobCanvas.width / 2 : 320;
          var _cobCy = _cobCanvas ? _cobCanvas.height * 0.5 : 200;
          ParticleFX.coinBurst(_cobCx, _cobCy, 2);
        }
        if (typeof AudioSystem !== 'undefined') AudioSystem.playRandom('coin', { volume: 0.4 });
        return;
      }
    }

    // ── Hose spray priority ─────────────────────────────────────────
    // When the hose is active and the faced tile has grime, the spray
    // system takes over entirely (hold OK → continuous cleaning).
    // This gates ABOVE loot so the player can wash a grimy corpse tile
    // without opening the corpse menu. Once the grime is cleaned off,
    // isDirty returns false and the loot chain fires normally on next OK.
    //
    // EXCEPTION: Torch tiles are exempt. A tap opens TorchPeek/RestockBridge
    // for careful extinguish (water-bottle path preserves fuel). SpraySystem
    // has a peek-gate that defers while the menu is open, so:
    //   Tap OK on torch  → menu opens → careful extinguish (fuel preserved)
    //   Hold OK on torch  → no menu → SpraySystem fires → destructive extinguish
    //   Hold OK on grimy non-torch → SpraySystem fires → continuous cleaning
    //   No hose, or tile is clean  → normal loot/scrub chain below

    var tile = floorData.grid[fy][fx];
    var _hoseActiveForClean = (typeof HoseState !== 'undefined' && HoseState.isActive());
    var _facedIsTorch = (typeof TILES !== 'undefined' && TILES.isTorch && TILES.isTorch(tile));

    if (_hoseActiveForClean && !_facedIsTorch && typeof CleaningSystem !== 'undefined') {
      var _sprayFloorId = FloorManager.getCurrentFloorId();
      if (CleaningSystem.isDirty(fx, fy, _sprayFloorId)) {
        // Tile has grime — SpraySystem will handle it on held input.
        // Show a one-time hint the first time the player sprays.
        if (typeof Toast !== 'undefined' && !Player.getFlag('hoseSprayHint')) {
          var _facedIsWall = (typeof TILES !== 'undefined' && TILES.isOpaque(tile));
          var _hintKey = _facedIsWall
            ? 'toast.wall_spray_hint'
            : 'toast.floor_spray_hint';
          var _hintText = _facedIsWall
            ? 'Hold OK to spray the wall'
            : 'Hold OK to spray the floor';
          Toast.show(i18n.t(_hintKey, _hintText), 'info');
          Player.setFlag('hoseSprayHint', true);
        }
        return;
      }
    }

    // ── Loot priority: corpse, detritus, chest ─────────────────────
    // Fires only when tile is NOT grimy (spray cleaned it) or hose is
    // not attached. Reward pickup still resolves before manual scrub.

    if (tile === TILES.CORPSE) {
      var corpseFloorId = FloorManager.getCurrentFloorId();
      if (typeof RestockBridge !== 'undefined' &&
          RestockBridge.detectMode(fx, fy, corpseFloorId) === 'corpse') {
        if (!RestockBridge.isActive()) {
          if (typeof CinematicCamera !== 'undefined' && !CinematicCamera.isActive()) CinematicCamera.start('peek');
          RestockBridge.open(fx, fy, corpseFloorId, 'corpse');
        }
      } else {
        _openCorpseMenu(fx, fy, corpseFloorId);
      }
      return;
    }

    if (tile === TILES.DETRITUS) {
      _collectDetritus(fx, fy);
      return;
    }

    if (tile === TILES.CHEST) {
      var chestFloorId = FloorManager.getCurrentFloorId();
      if (typeof PeekSlots !== 'undefined' && typeof CrateSystem !== 'undefined' &&
          CrateSystem.hasContainer(fx, fy, chestFloorId)) {
        var chestContainer = CrateSystem.getContainer(fx, fy, chestFloorId);
        if (chestContainer && chestContainer.depleted) {
          if (typeof Toast !== 'undefined') {
            Toast.show('📦 ' + i18n.t('toast.chest_empty', 'Chest is empty'), 'dim');
          }
          return;
        }
        if (PeekSlots.tryOpen(fx, fy, chestFloorId)) return;
      }
      return;
    }

    // ── Manual scrub (non-hose path) ─────────────────────────────────
    // Click-per-scrub for players without the hose.
    //   Floor, no hose → 6-8 OK presses
    //   Wall, no hose  → high click count (walls are hard to rag-clean)

    if (typeof CleaningSystem !== 'undefined') {
      var cleanFloorId = FloorManager.getCurrentFloorId();
      if (CleaningSystem.isDirty(fx, fy, cleanFloorId)) {
        // C3: Pass equipped cleaning tool subtype for speed scaling
        var _cleanTool = null;
        var _equipped = CardAuthority.getEquipped();
        for (var _ei = 0; _ei < _equipped.length; _ei++) {
          if (_equipped[_ei] && _equipped[_ei].subtype &&
              CleaningSystem.TOOL_SPEED[_equipped[_ei].subtype]) {
            _cleanTool = _equipped[_ei].subtype;
            break;
          }
        }
        if (CleaningSystem.scrub(fx, fy, cleanFloorId, _cleanTool)) {
          AudioSystem.play('sweep', { volume: 0.5 });
          // "Tile cleaned" only fires when BOTH blood and grime are gone.
          // isDirty() checks both layers, so use it as the unified gate.
          var _stillDirty = CleaningSystem.isDirty(fx, fy, cleanFloorId);
          if (!_stillDirty) {
            Toast.show('🧹 ' + i18n.t('toast.tile_clean', 'Tile cleaned!'), 'loot');
            if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('🧹 Clean!', fx, fy, 'loot');
            SessionStats.inc('tilesCleaned');
            // R-2: Trigger readiness bar sweep preview
            if (typeof ReadinessCalc !== 'undefined' && HUD.triggerReadinessSweep) {
              HUD.triggerReadinessSweep(ReadinessCalc.getScore(cleanFloorId));
            }
          } else {
            // Progress feedback: show grime cleanliness % if GrimeGrid exists,
            // otherwise fall back to legacy blood counter.
            var _grimeClean = '';
            if (typeof GrimeGrid !== 'undefined' && GrimeGrid.has(cleanFloorId, fx, fy)) {
              var pct = Math.round(GrimeGrid.getTileCleanliness(cleanFloorId, fx, fy) * 100);
              _grimeClean = pct + '%';
            } else {
              var remaining = CleaningSystem.getBlood(fx, fy, cleanFloorId);
              _grimeClean = remaining + '/' + CleaningSystem.MAX_BLOOD;
            }
            if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('🧹 ' + _grimeClean, fx, fy, 'info');
          }
        }
        return;
      }
    }

    // C7: Trap re-arm — face an EMPTY tile that was formerly a TRAP
    // Phase 2: requires Trap Kit (ITM-116) or Trap Spring (ITM-092) consumable
    var TRAP_KIT_ID    = 'ITM-116';
    var TRAP_SPRING_ID = 'ITM-092';
    if (typeof TrapRearm !== 'undefined') {
      var rearmFloorId = FloorManager.getCurrentFloorId();
      if (TrapRearm.canRearm(fx, fy, rearmFloorId)) {
        // Check for consumable in bag
        var _hasTrapConsumable = function () {
          var bag = CardAuthority.getBag();
          for (var bi = 0; bi < bag.length; bi++) {
            if (bag[bi] && (bag[bi].id === TRAP_KIT_ID || bag[bi].id === TRAP_SPRING_ID)) return bag[bi].id;
          }
          return null;
        };
        var trapItemId = _hasTrapConsumable();
        if (!trapItemId) {
          Toast.show(i18n.t('toast.need_trap_kit', 'Need a Trap Kit 🪜 or Trap Spring 🪤'), 'warning');
          return;
        }
        if (TrapRearm.rearm(fx, fy, rearmFloorId, floorData.grid)) {
          CardAuthority.removeFromBagById(trapItemId);
          AudioSystem.play('ui-confirm', { volume: 0.4 });
          Toast.show('⚙️ ' + i18n.t('toast.trap_rearmed', 'Trap re-armed! (−1 ' + (trapItemId === TRAP_KIT_ID ? 'Trap Kit' : 'Trap Spring') + ')'), 'loot');
          if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('⚙️ Armed!', fx, fy, 'loot');
          if (typeof SessionStats !== 'undefined') SessionStats.inc('trapsRearmed');
          // R-2: Trigger readiness bar sweep preview
          if (typeof ReadinessCalc !== 'undefined' && HUD.triggerReadinessSweep) {
            HUD.triggerReadinessSweep(ReadinessCalc.getScore(rearmFloorId));
          }
          return;
        }
      }
    }

    // ── Tile-type interactions (structural, ambient) ───────────────
    // CORPSE, DETRITUS, CHEST already handled above cleaning priority.
    if (tile === TILES.BONFIRE || tile === TILES.BED || tile === TILES.HEARTH) {
      // Home bed → BedPeek handles sleep/day-advance (Floor 1.6, position 2,2)
      if (typeof BedPeek !== 'undefined' && FloorManager.getFloor() === '1.6' && fx === 2 && fy === 2) {
        // BedPeek overlay is already showing via update(). The F-key interact
        // is handled internally by BedPeek — just don't fall through to bonfire.
        return;
      }
      // Cooldown gate: after closing a bonfire menu, ignore re-interact for
      // 800ms. Prevents the OK-button trap where every press re-triggers
      // rest+menu while the player is still facing the bonfire tile.
      if (_bonfireCooldownMs > 0) return;
      // Open bonfire menu WITHOUT auto-resting. Rest executes from menu.
      _bonfirePendingX = fx;
      _bonfirePendingY = fy;
      // Clear stale rest result so Face 0 shows pre-rest state
      if (typeof HazardSystem !== 'undefined' && HazardSystem.clearLastRestResult) {
        HazardSystem.clearLastRestResult();
      }
      _pendingMenuContext = 'bonfire';
      _pendingMenuFace = 0;
      ScreenManager.toPause();
    } else if (tile === TILES.TABLE) {
      // Cozy table inspection — show a toast with a lived-in detail
      var tableQuips = [
        i18n.t('table.quip1', 'A mug of cold tea. Still half full.'),
        i18n.t('table.quip2', 'Scattered notes... dungeon cleaning checklists.'),
        i18n.t('table.quip3', 'A pressed flower between two invoice sheets.'),
        i18n.t('table.quip4', 'Crumbs from this morning\'s flatbread.'),
        i18n.t('table.quip5', 'A dull knife and a half-whittled figurine.')
      ];
      var qi = Math.floor(Math.random() * tableQuips.length);
      Toast.show('🔍 ' + tableQuips[qi], 'info');
    } else if (tile === TILES.SHOP) {
      // SC-G: Resolve faction via VendorRegistry (replaces linear shopList scan)
      var shopFaction = (typeof VendorRegistry !== 'undefined')
        ? VendorRegistry.getFaction(fx, fy, FloorManager.getCurrentFloorId())
        : null;
      if (!shopFaction) shopFaction = 'tide';  // fallback
      _openVendorDialog(shopFaction);
    } else if (tile === TILES.BREAKABLE) {
      // If a CrateSystem container exists (crate slots):
      //   1. Quick-fill from bag (DEPTH3 §6.3b) — auto-match & fill slots
      //   2. If still has empties → open PeekSlots for manual filling
      //   3. If fully filled → already sealed, skip PeekSlots
      var crateFloorId = FloorManager.getCurrentFloorId();
      if (typeof CrateSystem !== 'undefined' &&
          CrateSystem.hasContainer(fx, fy, crateFloorId)) {
        var _intContainer = CrateSystem.getContainer(fx, fy, crateFloorId);

        // SC-D: Storage crates are withdraw-only — open PeekSlots directly
        // (which routes to CrateUI since the container is TYPE.CHEST + loot phase).
        if (_intContainer && _intContainer.storage) {
          if (typeof PeekSlots !== 'undefined' &&
              PeekSlots.tryOpen(fx, fy, crateFloorId)) {
            if (typeof CratePeek !== 'undefined' && CratePeek.isActive()) {
              CratePeek.handleKey('Escape');
            }
          }
          return;
        }

        // D3+ deposit crates: quick-fill pass, then manual slot UI
        if (_quickFillCrate(fx, fy, crateFloorId)) {
          // Crate sealed — collapse the peek overlay that triggered this
          if (typeof CratePeek !== 'undefined' && CratePeek.isActive()) {
            CratePeek.handleKey('Escape');
          }
          return;
        }
        // Still has empties: open manual slot UI
        if (typeof PeekSlots !== 'undefined' &&
            PeekSlots.tryOpen(fx, fy, crateFloorId)) {
          // Collapse the crate peek now that the slot-fill UI is taking over
          if (typeof CratePeek !== 'undefined' && CratePeek.isActive()) {
            CratePeek.handleKey('Escape');
          }
          return;
        }
      }
      // Fallback: smash the breakable prop
      _smashBreakable(fx, fy);
    }
    // ── TORCH: Open torch restock surface or legacy TorchPeek ──
    else if (TILES.isTorch(tile)) {
      // RS-2: Route through RestockBridge if available (unified surface)
      var _torchFloorId = FloorManager.getCurrentFloorId();
      if (typeof RestockBridge !== 'undefined' && RestockBridge.detectMode(fx, fy, _torchFloorId) === 'torch') {
        if (RestockBridge.isActive()) {
          // Already open — forward to handleKey
        } else {
          if (typeof CinematicCamera !== 'undefined' && !CinematicCamera.isActive()) CinematicCamera.start('peek');
          RestockBridge.open(fx, fy, _torchFloorId, 'torch');
        }
      } else if (typeof TorchPeek !== 'undefined') {
        // Legacy fallback
        if (TorchPeek.isInteracting()) {
          // Already interacting — pass through to handleKey
        } else if (TorchPeek.isActive()) {
          if (typeof CinematicCamera !== 'undefined' && !CinematicCamera.isActive()) CinematicCamera.start('peek');
          TorchPeek.tryInteract();
        }
      }
    }
    // ── BOOKSHELF: Open book peek on OK press, advance page if open ──
    else if (tile === TILES.BOOKSHELF) {
      if (typeof BookshelfPeek !== 'undefined') {
        if (BookshelfPeek.isActive()) {
          // Already showing — advance to next page
          BookshelfPeek.handleKey('KeyD');
        } else {
          // Not yet showing — open immediately (bypasses 400ms debounce)
          if (typeof CinematicCamera !== 'undefined' && !CinematicCamera.isActive()) CinematicCamera.start('peek');
          BookshelfPeek.tryShow(fx, fy);
        }
      }
    }
    // ── TERMINAL: Mail collection (priority) or book peek ──
    else if (tile === TILES.TERMINAL) {
      // MailboxPeek takes priority on the home mail terminal
      if (typeof MailboxPeek !== 'undefined' && MailboxPeek.isShowing && MailboxPeek.isShowing()) {
        MailboxPeek.handleInteract();
      } else if (typeof BookshelfPeek !== 'undefined') {
        if (BookshelfPeek.isActive()) {
          BookshelfPeek.handleKey('KeyD');
        } else {
          if (typeof CinematicCamera !== 'undefined' && !CinematicCamera.isActive()) CinematicCamera.start('peek');
          BookshelfPeek.tryShow(fx, fy);
        }
      }
    }
    // ── BAR_COUNTER: Tap for a drink ──
    else if (tile === TILES.BAR_COUNTER) {
      if (typeof BarCounterPeek !== 'undefined') {
        BarCounterPeek.tryDrink(fx, fy, floorData);
      }
    }
    // ── DUMP_TRUCK: Grab the hose (PW-2) ──
    else if (tile === TILES.DUMP_TRUCK) {
      if (typeof HosePeek !== 'undefined') {
        HosePeek.tryGrab(fx, fy, FloorManager.getCurrentFloorId());
      }
    }
  }

  // ── Quick-fill crate from bag (DEPTH3 §6.3b) ─────────────────────

  /**
   * Auto-fill empty crate slots with matching bag items before opening
   * PeekSlots. Scans the bag for items whose crateFillTag or category
   * matches each empty slot's frameTag, fills in one pass, then:
   *   - If crate still has empties → returns false (caller opens PeekSlots)
   *   - If crate is now full → auto-seals, awards coins, returns true
   *
   * Delegated to QuickFill module.
   */
  function _quickFillCrate(fx, fy, floorId) {
    return QuickFill.fill(fx, fy, floorId);
  }
  // ── Breakable smash + detritus — delegated to PickupActions ─────

  function _smashBreakable(fx, fy) { PickupActions.smashBreakable(fx, fy); }
  function _collectDetritus(gx, gy) { PickupActions.collectDetritus(gx, gy); }

  // ── Vendor dialog (NPC greeting → shop open) ──────────────────────

  // SC-G: NPC data and visit tracking moved to VendorRegistry.
  // VENDOR_NPC and _vendorVisits are no longer defined here.
  // game.js retains the thin UI delegation layer (_openVendorDialog)
  // because it references internal closures (_collapseAllPeeks,
  // _pendingMenuContext, ScreenManager.toPause).

  /**
   * Show vendor interaction flow. Delegates to VendorDialog if available
   * (full greeting tree: Browse Wares / Buy Supplies / Leave).
   * Falls back to the legacy DialogBox → pause menu path.
   *
   * SC-G: Visit tracking and NPC data now sourced from VendorRegistry.
   *
   * @param {string} factionId - 'tide' | 'foundry' | 'admiralty'
   */
  function _openVendorDialog(factionId) {
    // Dismiss MerchantPeek (and any other open peek) before the dialogue
    // tree opens — prevents the peek's "Browse Wares" button from competing
    // with VendorDialog's StatusBar choices.
    _collapseAllPeeks();

    // SC-G: Record visit in VendorRegistry (was local _vendorVisits)
    if (typeof VendorRegistry !== 'undefined') {
      VendorRegistry.recordVisit(factionId);
    }

    AudioSystem.playRandom('coin', { volume: 0.3 });

    // ── Primary path: VendorDialog (has supply stock + bulk sell) ──
    if (typeof VendorDialog !== 'undefined') {
      var floorId = FloorManager.getCurrentFloorId();
      VendorDialog.open(factionId, floorId, {
        onBrowse: function () {
          // "Browse Wares" → open card shop via pause menu
          _collapseAllPeeks();
          if (typeof Shop !== 'undefined') {
            Shop.open(factionId, FloorManager.getFloor());
          }
          _pendingMenuContext = 'shop';
          _pendingMenuFace = 0;
          ScreenManager.toPause();
        },
        onLeave: function () {
          // "Leave" — close, return to gameplay
          if (typeof Shop !== 'undefined') Shop.close();
        }
      });
      return;
    }

    // ── Fallback: legacy DialogBox greeting → direct shop open ──
    // SC-G: NPC data from VendorRegistry instead of local VENDOR_NPC
    var npc = (typeof VendorRegistry !== 'undefined')
      ? VendorRegistry.getNpcData(factionId)
      : { name: 'Vendor', emoji: '\uD83E\uDDD9', first: 'Welcome.', lines: ['Welcome back.'] };
    var greeting = (typeof VendorRegistry !== 'undefined')
      ? VendorRegistry.getGreeting(factionId)
      : npc.first;
    // i18n wrap
    var visits = (typeof VendorRegistry !== 'undefined') ? VendorRegistry.getVisitCount(factionId) : 1;
    if (visits <= 1) {
      greeting = i18n.t('vendor.' + factionId + '.first', greeting);
    } else {
      var idx = (visits - 2) % npc.lines.length;
      greeting = i18n.t('vendor.' + factionId + '.' + idx, greeting);
    }

    DialogBox.show({
      text:     greeting,
      speaker:  npc.name,
      portrait: npc.emoji,
      priority: DialogBox.PRIORITY.DIALOGUE,
      onClose: function () {
        _collapseAllPeeks();
        if (typeof Shop !== 'undefined') {
          Shop.open(factionId, FloorManager.getFloor());
        }
        _pendingMenuContext = 'shop';
        _pendingMenuFace = 0;
        ScreenManager.toPause();
      }
    });
  }

  // ── Corpse harvest/restock — delegated to CorpseActions ────────

  function _harvestCorpse(fx, fy) { CorpseActions.harvestCorpse(fx, fy); }
  function _openCorpseMenu(optX, optY, optFloorId) { CorpseActions.openCorpseMenu(optX, optY, optFloorId); }
  function _corpseDepositBagItem(bagIdx) { CorpseActions.depositBagItem(bagIdx); }
  function _corpseDepositHandCard(handIdx) { CorpseActions.depositHandCard(handIdx); }
  function _corpseSeal() { CorpseActions.seal(); }
  function _takeHarvestItem(slot) { CorpseActions.takeHarvestItem(slot); }

  // ── Shop buy/sell — delegated to ShopActions ─────────────────────

  function _shopBuy(slot) { ShopActions.buy(slot); }
  function _shopBuySupply(supplyIndex) { ShopActions.buySupply(supplyIndex); }
  function _shopSellFromHand(slot) { ShopActions.sellFromHand(slot); }
  function _shopSellPart(bagIndex) { ShopActions.sellPart(bagIndex); }

  // ── Equip / Unequip / Stash — delegated to EquipActions ─────────

  function _equipFromBag(bagIndex) { EquipActions.equipFromBag(bagIndex); }
  function _unequipSlot(slot) { EquipActions.unequipSlot(slot); }
  function _bagToStash(bagIndex) { EquipActions.bagToStash(bagIndex); }
  function _stashToBag(stashIndex) { EquipActions.stashToBag(stashIndex); }

  // ── Bonfire warp — delegated to FloorTransition ───────────────────

  function _warpToFloor(targetFloorId) {
    ScreenManager.toGame();
    if (typeof HoseState !== 'undefined' && HoseState.isActive && HoseState.isActive()) {
      HoseState.onBonfireWarp();
    }
    var srcDepth = FloorManager.getFloor().split('.').length;
    var tgtDepth = targetFloorId.split('.').length;
    var dir = (tgtDepth <= srcDepth) ? 'retreat' : 'advance';
    Toast.show('\u2728 ' + i18n.t('bonfire.warping', 'Warping...'), 'info');
    FloorTransition.go(targetFloorId, dir);
  }

  // ── Incinerator — delegated to Incinerator module ─────────────────

  function _incinerateFromFocus() { Incinerator.burnFromFocus(); }

  // ── Deck management — delegated to DeckActions module ─────────────

  function _handToBackup(handIndex) { DeckActions.handToBackup(handIndex); }
  function _backupToHand(deckIndex) { DeckActions.backupToHand(deckIndex); }


  // ── Tick (game logic at 10fps — enemies, aggro) ────────────────────

  function _tick(deltaMs) {
    // Screen animations update in _render() (per-frame delta).
    // _tick() is only for fixed-rate game logic (enemies, aggro).
    var state = ScreenManager.getState();
    if (state !== ScreenManager.STATES.GAMEPLAY || !_gameplayReady) return;
    if (CombatEngine.isActive() || FloorTransition.isTransitioning()) return;

    // Bonfire interaction cooldown — drain timer each tick
    if (_bonfireCooldownMs > 0) _bonfireCooldownMs -= deltaMs;

    var floorData = FloorManager.getFloorData();
    var enemies = FloorManager.getEnemies();
    var p = Player.state();
    var hasNpcSystem = typeof NpcSystem !== 'undefined';

    // Cinematic lockout — while a scripted beat is holding input (e.g. the
    // Hero Wake encounter on 2.2.1), freeze enemy AI awareness/aggro so the
    // cinematic camera cannot race combat initiation. Without this guard the
    // game deadlocks between "cinematic locks input" and "combat opens over
    // cinematic" the instant nearby enemies trip ENGAGED.
    var _cinLocking = (typeof CinematicCamera !== 'undefined' &&
                       CinematicCamera.isInputLocked && CinematicCamera.isInputLocked());
    var _hwState = (typeof HeroWake !== 'undefined') ? HeroWake.getState() : null;
    var _heroWakeLock = (_hwState && _hwState.phase === 'playing');
    if (_cinLocking || _heroWakeLock) {
      // Still tick the scripted hero so the authored path advances, but
      // skip enemy AI, aggro checks, and bark ticks entirely.
      if (_heroWakeLock && typeof HeroSystem !== 'undefined' && HeroSystem.tickScriptedHero) {
        var _despawnedLocked = HeroSystem.tickScriptedHero({ x: p.x, y: p.y }, deltaMs);
        if (_despawnedLocked && _hwState.combatTrigger && !_hwState.triggerSpawned) {
          _spawnWoundedWarden(_hwState.combatTrigger);
        }
      }
      return;
    }

    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].hp <= 0) continue;
      // NpcSystem entities get patrol/bark tick instead of enemy AI
      if (enemies[i].npcType && hasNpcSystem) continue;
      // Friendly entities (Dispatcher gate NPC, quest givers, vendors spawned
      // outside NpcSystem) must not run the hostile awareness/chase loop —
      // otherwise their awareness climbs past the UNAWARE threshold and the
      // raycaster paints ❓/❗/⚔ indicators above them. Their own logic (e.g.
      // _tickDispatcherChoreography) drives any movement they need.
      if (enemies[i].friendly) continue;
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

    // Friendly wander tick — reanimated entities patrol crate→torch→crate.
    // Runs patrol-only movement (no awareness, no chase).
    if (EnemyAI.tickFriendlyPatrol) {
      for (var _fri = 0; _fri < enemies.length; _fri++) {
        if (enemies[_fri].friendly && enemies[_fri].path) {
          EnemyAI.tickFriendlyPatrol(enemies[_fri], floorData.grid, floorData.gridW, floorData.gridH, deltaMs);
        }
      }
    }

    // Enemy creature bark tick — atmospheric sounds on depth-3+ floors
    if (EnemyAI.tickEnemyBarks) {
      EnemyAI.tickEnemyBarks(enemies, p, deltaMs, floorData.biome);
    }

    // Scripted hero tick (Floor 2.2.1 Hero Wake cinematic).
    // tickScriptedHero advances the hero along its authored path.
    // Return value:
    //   undefined — no scripted hero active (most floors)
    //   null      — hero is still walking
    //   object    — hero just reached end of path, this is the entity
    // On despawn, we spawn the wounded Vault Warden combat trigger.
    if (_hwState && _hwState.phase === 'playing' && typeof HeroSystem !== 'undefined' && HeroSystem.tickScriptedHero) {
      var despawned = HeroSystem.tickScriptedHero({ x: p.x, y: p.y }, deltaMs);
      if (despawned && _hwState.combatTrigger && !_hwState.triggerSpawned) {
        _spawnWoundedWarden(_hwState.combatTrigger);
      }
    }

    // Dispatcher grab choreography (Floor 1 gate sequence)
    var _dPhase = (typeof DispatcherChoreography !== 'undefined') ? DispatcherChoreography.getPhase() : 'done';
    if (!_gateUnlocked && _dPhase !== 'done') {
      _tickDispatcherChoreography(deltaMs);
    }

    CombatBridge.checkEnemyAggro(p.x, p.y);

    // ── Fire crackle ambient (proximity-based) ──
    // Check tiles within 3 Manhattan distance for bonfire/hearth/bed/torch.
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
          if (ft === TILES.BONFIRE || ft === TILES.HEARTH || ft === TILES.BED || ft === TILES.TORCH_LIT) {
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

    // ── §7e: Bonfire glow scales with time-of-day ──────────────
    // Exterior bonfires glow brighter at night (beacon effect).
    // Scale bonfire light intensity: base 0.9 at night → 0.4 at noon.
    // Only on exterior floors (depth 1) where sun intensity matters.
    _bonfireGlowTimer = (_bonfireGlowTimer || 0) + deltaMs;
    if (_bonfireGlowTimer >= 5000) {
      _bonfireGlowTimer = 0;
      if (typeof DayCycle !== 'undefined' && typeof Lighting !== 'undefined') {
        var floorDepth = floorData.floorId ? floorData.floorId.split('.').length : 1;
        if (floorDepth === 1) {
          var sunI = DayCycle.getSunIntensity();
          // Night (sun=0) → intensity 0.95, Noon (sun=1) → intensity 0.4
          var bonfireI = 0.4 + 0.55 * (1 - sunI);
          var sources = Lighting.getSources();
          for (var si = 0; si < sources.length; si++) {
            if (sources[si].flickerType === 'bonfire') {
              sources[si].intensity = bonfireI;
            }
          }
        }
      }
    }

    // ── Passive time drip (Stardew Valley pacing) ──
    // Each SpatialContract carries a timeRate (game-minutes per real minute).
    // Exterior=24 (~1hr real per game day), Dungeon=12 (half), Interior=0 (frozen).
    // The drip accumulates fractional minutes and advances DayCycle in whole-minute chunks.
    if (typeof DayCycle !== 'undefined' && DayCycle.advanceTime && typeof FloorManager !== 'undefined') {
      var _floorId = FloorManager.getFloor();
      var contract = _floorId ? FloorManager.getFloorContract(_floorId) : null;
      var timeRate = (contract && contract.timeRate) ? contract.timeRate : 0;

      if (timeRate > 0 && !DayCycle.isPaused()) {
        // timeRate = game-minutes per real minute
        // Convert: game-min per ms = timeRate / 60000
        var gameMinsElapsed = (deltaMs * timeRate) / 60000;
        _passiveTimeTimer += gameMinsElapsed;

        if (_passiveTimeTimer >= 1) {
          var wholeMinutes = Math.floor(_passiveTimeTimer);
          _passiveTimeTimer -= wholeMinutes;
          DayCycle.advanceTime(wholeMinutes);
          _updateDayCounter();
        }
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

    // Poll gamepad every frame regardless of screen state
    // (title, game-over, etc. all need gamepad input)
    InputManager.pollGamepad();

    // GIF recorder capture (runs regardless of screen)
    if (typeof GifRecorder !== 'undefined' && GifRecorder.tick) {
      GifRecorder.tick(frameDt);
    }

    // ── Non-gameplay screens: render on canvas, return early ──

    if (state === S.SPLASH) {
      SplashScreen.update(frameDt);
      SplashScreen.render();
      return;
    }

    if (state === S.TITLE) {
      TitleScreen.update(frameDt);
      TitleScreen.render();
      // Water cursor FX — hover trail + click splash on the title menu
      if (typeof WaterCursorFX !== 'undefined') {
        var tctx = _canvas.getContext('2d');
        WaterCursorFX.tick(frameDt);
        WaterCursorFX.render(tctx);
      }
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
      if (typeof DragDrop !== 'undefined') {
        DragDrop.render(ctx);
        // Debug: show zone outlines (toggle via console: window.__DD_DEBUG = true)
        if (window.__DD_DEBUG && DragDrop.renderDebug) DragDrop.renderDebug(ctx);
      }
      // Toast overlay (feedback during inventory drags)
      Toast.update(frameDt);
      Toast.render(ctx, _canvas.width, _canvas.height);
      // Particle FX overlay (coin bursts during shop/inventory)
      if (typeof ParticleFX !== 'undefined') {
        ParticleFX.update();
        ParticleFX.render(ctx);
      }
      // Water cursor FX — hover trail + click splash for cleaning-theme juice
      if (typeof WaterCursorFX !== 'undefined') {
        WaterCursorFX.tick(frameDt);
        WaterCursorFX.render(ctx);
      }
      return;
    }

    // ── Gameplay rendering ──

    if (state === S.GAMEPLAY && _gameplayReady) {
      // Update animated textures (porthole ocean compositing) before render
      if (typeof TextureAtlas !== 'undefined' && TextureAtlas.tick) {
        TextureAtlas.tick(frameDt);
      }
      _renderGameplay(frameDt, now);

      // Post-processing pixel shaders (after world, before overlays)
      var ctx = _canvas.getContext('2d');
      if (typeof PostProcess !== 'undefined') {
        PostProcess.apply(ctx, _canvas.width, _canvas.height, frameDt);
      }

      // Viewport ring (freelook zone + directional indicators)
      if (typeof ViewportRing !== 'undefined') {
        ViewportRing.render(ctx, _canvas.width, _canvas.height);
      }

      // UI overlays (after post-process, before HUD z-layer)
      TransitionFX.update(frameDt);
      TransitionFX.render(ctx, _canvas.width, _canvas.height);

      // Cinematic letterbox bars (after transition, before HUD)
      if (typeof CinematicCamera !== 'undefined') {
        CinematicCamera.tick(frameDt);
        CinematicCamera.render(ctx, _canvas.width, _canvas.height);
      }

      // Monologue text on letterbox bars
      if (typeof MonologuePeek !== 'undefined') {
        MonologuePeek.tick(frameDt);
        MonologuePeek.render(ctx, _canvas.width, _canvas.height);
      }

      // Cinematic/tooltip coordination:
      //   monologue active → hide tooltip (canvas bar text must be readable)
      //   cinema active, no monologue → lift tooltip above bar (dialogue clickable)
      //   neither → normal positioning
      if (typeof StatusBar !== 'undefined' && StatusBar.setCinematicMode) {
        var _cinActive = typeof CinematicCamera !== 'undefined' && CinematicCamera.isActive();
        var _monoActive = typeof MonologuePeek !== 'undefined' && MonologuePeek.isActive();
        var _barPx = _cinActive && typeof CinematicCamera !== 'undefined'
          ? CinematicCamera.getBarHeight(_canvas.height) : 0;
        StatusBar.setCinematicMode(_cinActive, _monoActive, _barPx);
      }

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
      if (typeof TorchPeek    !== 'undefined') TorchPeek.update(frameDt);
      if (typeof BookshelfPeek !== 'undefined') BookshelfPeek.update(frameDt);
      if (typeof BarCounterPeek !== 'undefined') BarCounterPeek.update(frameDt);
      if (typeof BedPeek !== 'undefined') BedPeek.update(frameDt);
      if (typeof MailboxPeek !== 'undefined') MailboxPeek.update(frameDt);
      if (typeof StatusEffectHUD !== 'undefined') StatusEffectHUD.update();

      // PeekSlots update (SEALED auto-dismiss timer + zone bounds sync)
      if (typeof PeekSlots !== 'undefined') PeekSlots.update(frameDt);

      // RS-1: unified restock surface per-frame update (seal button, sub-modules)
      if (typeof RestockBridge !== 'undefined') RestockBridge.update(frameDt);

      DialogBox.update(frameDt);
      DialogBox.render(ctx, _canvas.width, _canvas.height);
      Toast.update(frameDt);
      Toast.render(ctx, _canvas.width, _canvas.height);

      // Particle FX overlay (coins, sparkles, item poof)
      if (typeof ParticleFX !== 'undefined') {
        ParticleFX.update();
        ParticleFX.render(ctx);
      }

      // Water cursor FX — trail + splash when a menu/peek is active
      if (typeof WaterCursorFX !== 'undefined') {
        WaterCursorFX.tick(frameDt);
        WaterCursorFX.render(ctx);
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
  function _renderGameplay(frameDt, now) {
    // Tick combat bridge (facing timer + CombatEngine phase auto-advance)
    CombatBridge.update(frameDt);

    var floorData = FloorManager.getFloorData();
    if (!floorData) return;

    // Poll input → drives MovementController
    // Skip input when cinematic camera has locked controls
    if (ScreenManager.isPlaying() &&
        !(typeof CinematicCamera !== 'undefined' && CinematicCamera.isInputLocked())) {
      InputPoll.poll();
    }

    // Tick movement animation
    MC.tick(frameDt);

    // PW-3: Continuous spray cleaning while hose is active + interact held.
    // Must run after MC.tick (facing direction is current) and InputPoll
    // (isDown reflects this frame's input). SpraySystem self-gates on
    // HoseState.isActive(), InputManager.isDown('interact'), combat, etc.
    if (typeof SpraySystem !== 'undefined') SpraySystem.update(frameDt);

    // Smooth mouse free-look (acceleration + exponential lerp)
    // Skip MouseLook tick when cinematic camera has locked input — prevents
    // mouse cursor position from pulling the view away from the forced facing
    // direction during dispatcher grab or other cinematic sequences.
    if (typeof MouseLook !== 'undefined' && MouseLook.tick) {
      var _cinInputLock = typeof CinematicCamera !== 'undefined' && CinematicCamera.isInputLocked();
      if (!_cinInputLock || (MouseLook.isLocked && MouseLook.isLocked())) {
        // Allow tick when: no cinematic lock, OR MouseLook has its own lockOn
        // target (e.g. forced face-dispatcher → lockOn(0,0) still needs to lerp)
        MouseLook.tick();
      }
    }

    // Get interpolated render position
    var renderPos = MC.getRenderPos();
    var p = Player.state();

    // Calculate lighting (pass timestamp for flicker animation)
    // `now` declared at _render() entry — reuse same frame timestamp
    var lightMap = Lighting.calculate(p, floorData.grid, floorData.gridW, floorData.gridH, now);

    // Build sprite list (with enemy sprite stage system)
    var enemies = FloorManager.getEnemies();
    _sprites.length = 0;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hp <= 0) continue;
      if (e._hidden) continue;  // Dispatcher pre-grab: hidden until proximity trigger
      var aState = EnemyAI.getAwarenessState(e.awareness);

      // ── Smooth lerp: advance interpolation timer and compute render position ──
      // _prevX/_prevY are set when movement occurs; _lerpT animates 0→1.
      // Lerp duration scales with the entity's step interval for natural pacing.
      var lerpDur = e._stepInterval || (e.friendly ? 1200 : 800);
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
        friendly: e.friendly,             // Friendly NPCs skip directional shading
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

    // ── Scripted hero sprite (Floor 2.2.1 Hero Wake cinematic) ──
    // HeroSystem tracks the scripted hero entity independently of the
    // enemies array (so it isn't swept by EnemyAI). We push it into the
    // sprite list here with the gold glow + oversized scale from the
    // Seeker hero def, using prevX/prevY/_lerpT for smooth movement.
    if (typeof HeroSystem !== 'undefined' && HeroSystem.getScriptedHero) {
      var shero = HeroSystem.getScriptedHero();
      if (shero) {
        // Advance per-frame lerp for smooth tile-to-tile walk
        if (HeroSystem.updateScriptedLerp) {
          HeroSystem.updateScriptedLerp(frameDt / 1000);
        }
        var hrX, hrY;
        if (shero._prevX !== undefined && shero._lerpT !== undefined && shero._lerpT < 1) {
          var hT = shero._lerpT;
          var hEased = 1 - (1 - hT) * (1 - hT) * (1 - hT);
          hrX = shero._prevX + (shero.x - shero._prevX) * hEased;
          hrY = shero._prevY + (shero.y - shero._prevY) * hEased;
        } else {
          hrX = shero.x;
          hrY = shero.y;
        }
        // Resolve stacked-sprite for the hero NPC (ninja head, black
        // jacket, black jeans, varying weapon) — all hero antagonists
        // share this silhouette, only the weapon changes per archetype.
        var heroStackKey = 'hero_' + (shero.heroType || 'seeker');
        var heroStackDef = (typeof EnemySprites !== 'undefined' && EnemySprites.getStack)
          ? EnemySprites.getStack(heroStackKey) : null;
        var heroStack = null;
        if (heroStackDef) {
          heroStack = {
            head:   heroStackDef.head   || '',
            torso:  heroStackDef.torso  || '',
            legs:   heroStackDef.legs   || '',
            hat: heroStackDef.hat
              ? { emoji: heroStackDef.hat, scale: heroStackDef.hatScale || 0.5, behind: !!heroStackDef.hatBehind }
              : null,
            backWeapon: heroStackDef.backWeapon
              ? { emoji: heroStackDef.backWeapon, scale: heroStackDef.backWeaponScale || 0.4, offsetX: heroStackDef.backWeaponOffsetX || 0.3 }
              : null,
            frontWeapon: heroStackDef.frontWeapon
              ? { emoji: heroStackDef.frontWeapon, scale: heroStackDef.frontWeaponScale || 0.65, offsetX: heroStackDef.frontWeaponOffsetX || -0.22 }
              : null,
            headMods:  heroStackDef.headMods  || null,
            torsoMods: heroStackDef.torsoMods || null,
            tintHue:   heroStackDef.tintHue,
            tintColor: heroStackDef.tintColor,
            tintAlpha: heroStackDef.tintAlpha
          };
        }
        _sprites.push({
          x: hrX,
          y: hrY,
          id: shero.id,
          emoji: shero.emoji,
          stack: heroStack,
          color: null,
          scale: shero.scale || 1.5,
          facing: shero.facing,
          friendly: false,
          awareness: 0,
          glow: shero.glow || '#d4af37',
          glowRadius: shero.glowRadius || 14,
          tint: shero.tint || null,
          particleEmoji: shero.particleEmoji || null,
          overlayText: null,
          bobY: shero.bobY || 0,
          scaleAdd: 0
        });
      }
    }

    // ── Vendor NPC sprites (behind counter, facing player) ──────────
    // SC-G: Delegated to VendorRegistry.buildSprites() — all sprite
    // construction logic lives in the registry module now.
    if (typeof VendorRegistry !== 'undefined') {
      var vendorSprites = VendorRegistry.buildSprites(
        FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : floorData.floorId
      );
      for (var vi = 0; vi < vendorSprites.length; vi++) {
        _sprites.push(vendorSprites[vi]);
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

    // ── Bonfire billboard sprites (tent + fire + shrubs) ──────────
    if (typeof BonfireSprites !== 'undefined') {
      var _bfFloorId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '0';
      var bonfireSprites = BonfireSprites.buildSprites(
        _bfFloorId, floorData.grid, floorData.gridW, floorData.gridH
      );
      BonfireSprites.animate(now);
      for (var bfi = 0; bfi < bonfireSprites.length; bfi++) {
        var bfs = bonfireSprites[bfi];
        _sprites.push({
          x: bfs.x + (bfs._swayX || 0),
          y: bfs.y,
          emoji: bfs.emoji,
          emojiOverlay: bfs.emojiOverlay || null,
          scale: bfs.scale,
          bobY: bfs.bobY || 0,
          glow: bfs.glow || null,
          glowRadius: bfs.glowRadius || 0
        });
      }
    }

    // ── Mailbox billboard sprites (emoji on stone base) ──────────
    if (typeof MailboxSprites !== 'undefined') {
      var _mbFloorId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '0';
      var mailboxSprites = MailboxSprites.buildSprites(
        _mbFloorId, floorData.grid, floorData.gridW, floorData.gridH
      );
      MailboxSprites.animate(now);
      for (var mbi = 0; mbi < mailboxSprites.length; mbi++) {
        var mbs = mailboxSprites[mbi];
        _sprites.push({
          x: mbs.x,
          y: mbs.y,
          emoji: mbs.emoji,
          scale: mbs.scale,
          bobY: MailboxSprites.getAnimatedY(mbs),
          glow: null,
          glowRadius: 0
        });
      }
    }

    // ── Dump truck billboard sprites (hose reel on truck body) ─────
    if (typeof DumpTruckSprites !== 'undefined') {
      var _dtFloorId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '0';
      var dumpTruckSprites = DumpTruckSprites.buildSprites(
        _dtFloorId, floorData.grid, floorData.gridW, floorData.gridH
      );
      DumpTruckSprites.animate(now);
      for (var dti = 0; dti < dumpTruckSprites.length; dti++) {
        var dts = dumpTruckSprites[dti];
        _sprites.push({
          x: dts.x,
          y: dts.y,
          emoji: dts.emoji,
          emojiOverlay: dts.emojiOverlay || null,
          scale: dts.scale,
          bobY: dts.bobY || 0,
          glow: dts.glow || null,
          glowRadius: dts.glowRadius || 0
        });
      }
    }

    // ── Detritus billboard sprites (bobbing debris on floor) ─────
    if (typeof DetritusSprites !== 'undefined') {
      var _detFloorId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '0';
      var detritusPlacements = null;
      if (typeof FloorManager !== 'undefined' && FloorManager.getFloorData) {
        var _detFD = FloorManager.getFloorData();
        if (_detFD && _detFD.detritusPlacements) detritusPlacements = _detFD.detritusPlacements;
      }
      var detritusSprites = DetritusSprites.buildSprites(
        _detFloorId, floorData.grid, floorData.gridW, floorData.gridH, detritusPlacements
      );
      DetritusSprites.animate(now);
      for (var dei = 0; dei < detritusSprites.length; dei++) {
        var des = detritusSprites[dei];
        _sprites.push({
          x: des.x,
          y: des.y,
          emoji: des.emoji,
          scale: des.scale,
          bobY: des.bobY || 0,
          groundLevel: des.groundLevel,
          groundTilt: des.groundTilt,
          noFogFade: false,
          glow: null,
          glowRadius: 0
        });
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
        pitch: p.lookPitch || 0, bobY: MC.getBobY() },
      floorData.grid, floorData.gridW, floorData.gridH,
      _sprites, lightMap
    );

    if (combatZoom !== 1) ctx.restore();

    // Cobweb rendering (after raycaster, before minimap)
    var _cobFloorId = FloorManager.getCurrentFloorId();
    var _cobPlayer = { x: renderPos.x, y: renderPos.y, dir: renderPos.angle + p.lookOffset };
    if (typeof CobwebRenderer !== 'undefined') {
      var _cobBiome = (typeof FloorManager !== 'undefined' && FloorManager.getBiome)
        ? FloorManager.getBiome() : 'cellar';
      CobwebRenderer.render(ctx, _canvas.width, _canvas.height, _cobPlayer, _cobFloorId, _cobBiome);
      if (CobwebRenderer.updateTearParticles) {
        CobwebRenderer.updateTearParticles(ctx, _canvas.width, _canvas.height, _cobPlayer, frameDt);
      }
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
   * @param {number} [face=0]   - Starting face index (0-3)
   * @param {string} [invFocus] - 'bag' or 'deck' — sets inventory focus on Face 2
   */

  /**
   * Silently dismiss all currently-active peek overlays before opening any
   * menu (shop, inventory, harvest, requestPause). Unlike the ESC intercepts,
   * which dismiss one peek per keypress so the player can back out gracefully,
   * this helper clears everything at once when a menu is opening programmatically.
   *
   * Does NOT touch the ESC intercept chain — that stays one-at-a-time.
   */
  // Delegated to GameActions.collapseAllPeeks()
  function _collapseAllPeeks() { GameActions.collapseAllPeeks(); }

  function requestPause(context, face, invFocus) {
    if (!ScreenManager.isPlaying()) return;
    _collapseAllPeeks();
    _pendingMenuContext = context || 'pause';
    _pendingMenuFace = face || 0;
    // Set inventory focus before opening menu
    if (invFocus && typeof MenuFaces !== 'undefined' && MenuFaces.setInvFocus) {
      MenuFaces.setInvFocus(invFocus);
    }
    ScreenManager.toPause();
  }

  return {
    init: init,
    requestPause: requestPause,
    isGateUnlocked: function () { return _gateUnlocked; },
    /** Public interact — delegates to _interact(). Used by CratePeek
     *  action button and other DOM click targets that need to fire the
     *  same interact path as the keyboard OK / InteractPrompt. */
    interact: function () { _interact(); },

    /** Open the corpse-restock menu for the corpse CorpsePeek is showing.
     *  Called from CorpsePeek._onActionClick() when "Restock" is pressed.
     *  RS-3: Routes through RestockBridge for unsealed containers. */
    openCorpseMenu: function () {
      // Try RS-3 path via CorpsePeek target coords
      if (typeof RestockBridge !== 'undefined' && typeof CorpsePeek !== 'undefined' && CorpsePeek.getTarget) {
        var t = CorpsePeek.getTarget();
        if (t && t.x >= 0 && RestockBridge.detectMode(t.x, t.y, t.floorId) === 'corpse') {
          if (!RestockBridge.isActive()) {
            if (typeof CinematicCamera !== 'undefined' && !CinematicCamera.isActive()) CinematicCamera.start('peek');
            RestockBridge.open(t.x, t.y, t.floorId, 'corpse');
          }
          return;
        }
      }
      // Legacy fallback
      _openCorpseMenu();
    },

    /** Return current corpse-menu target (for MenuFaces to read slot data). */
    getCorpseTarget: function () {
      if (typeof CorpseActions !== 'undefined') return CorpseActions.getPendingPos();
      return { x: -1, y: -1, floorId: '' };
    }
  };
})();

// ── Boot ──
window.addEventListener('DOMContentLoaded', function () {
  Game.init();
});
