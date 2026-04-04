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

  // ── Bark / Gate NPC state ─────────────────────────────────────────
  // Tracks whether the Day-1 Dispatcher gate encounter has been resolved.
  // Before resolution the dungeon entrance tiles are logically locked —
  // the Dispatcher NPC is spawned on that tile and blocks movement.
  // After the player retrieves their work keys from home (Floor 1.6)
  // the gate is unlocked and the Dispatcher despawns.

  var _gateUnlocked = false;       // Has the player retrieved their work keys?
  var _dispatcherSpawnId = 'npc_dispatcher_gate';  // Stable entity id

  // ── Dispatcher choreography state (§11d / DOC-51) ────────────
  var _dispatcherPhase = 'idle';   // idle → spawned → barking → rushing → grabbing → dialogue → done
  var _dispatcherEntity = null;    // Reference to the dispatcher enemy entity
  var _dispatcherRushTimer = 0;    // Ms until next rush step
  var _dispatcherBarkTimer = 0;    // Ms until grab after bark
  var DISPATCHER_RUSH_STEP_MS = 100;   // Move 1 tile every 100ms (10x normal speed)
  var DISPATCHER_BARK_DELAY_MS = 800;  // Pause after bark before rushing
  var DISPATCHER_GRAB_RANGE = 2;       // Tiles away to trigger grab
  var DISPATCHER_TRIGGER_RANGE = 7;    // Tiles from gate door to trigger sequence
  var DISPATCHER_SPAWN_BEHIND = 6;     // Tiles behind player to spawn

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

  // ── Fire crackle ambient timer ──────────────────────────────────
  var _fireCrackleTimer = 0;
  var _bonfireGlowTimer = 0;

  // ── Passive time drip timer (exterior floors) ──────────────────
  var _passiveTimeTimer = 0;

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

      // PeekSlots intercept: ESC closes slot-filling UI before pause
      if (typeof PeekSlots !== 'undefined' && PeekSlots.isFilling()) {
        PeekSlots.close();
        return;
      }

      // TorchPeek intercept: ESC closes torch slot UI before pause
      if (typeof TorchPeek !== 'undefined' && TorchPeek.isInteracting()) {
        TorchPeek.handleKey('Escape');
        return;
      }

      // BookshelfPeek intercept: ESC closes book overlay before pause
      if (typeof BookshelfPeek !== 'undefined' && BookshelfPeek.isActive()) {
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

    // Scroll wheel — Face 3 slider adjust (+10/-10 per tick) or
    // inventory/face content scroll on other faces (post-jam).
    // This is now the PRIMARY way to adjust sliders (←/→ navigates faces).
    InputManager.on('scroll_up', function (type) {
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
            if (typeof CrateUI !== 'undefined') {
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
              var msg  = dpt >= 3
                ? i18n.t('dragonfire.warp_confirm_dungeon', 'Leave this dungeon? Progress will be saved.')
                : i18n.t('dragonfire.warp_confirm_home', 'Warp home? You can return here later.');
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

        // Close any open peek/crate UI before rescue transition
        if (typeof PeekSlots !== 'undefined' && PeekSlots.isOpen()) PeekSlots.close();

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
    if (typeof TorchPeek    !== 'undefined') TorchPeek.init();
    if (typeof BookshelfPeek !== 'undefined') BookshelfPeek.init();
    if (typeof BarCounterPeek !== 'undefined') BarCounterPeek.init();
    if (typeof BedPeek !== 'undefined') BedPeek.init();
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

        // §9: DungeonSchedule — check if any group's hero day arrived
        if (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.onDayChange) {
          DungeonSchedule.onDayChange(newDay);

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
      // Explains adventurers smashed the door, directs player to clean up,
      // offers branches for cleaning tutorial (book, hose, crate restock).
      // Lore threads (Resonance, missing numbers) preserved as secondary branch.
      NpcSystem.registerTree('watchpost_watchman', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Ah — you must be the new Gleaner. Welcome to the Post. Come in, come in. Mind the dust; the adventurers kicked up a storm on their way through.',
            choices: [
              { label: 'What happened here?', next: 'whathappened' },
              { label: 'Dispatcher sent me to clean up', next: 'dispatched' },
              { label: 'Just passing through', next: 'passing' }
            ]
          },
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
            text: 'Cobwebs, grime, scorch marks — interact with a dirty tile to clean it. For the heavier stuff, there\'s a pressure hose on the department cleanup rig parked outside on the street level. Grab it before you go down. The hose clears a whole wall section in one pass.',
            choices: [
              { label: 'Where\'s the cleanup rig?', next: 'hose' },
              { label: 'What about restocking?', next: 'crates' },
              { label: 'And the books?', next: 'books' },
              { label: 'Got it. Heading down.', next: 'sendoff' }
            ]
          },
          hose: {
            text: 'Should be parked on Lantern Row — big flatbed truck, Guild markings, can\'t miss it. The hose is mounted on the side. Grab it and it goes in your bag. Uses charges, so use it on the stubborn spots and save elbow grease for the light stuff.',
            choices: [
              { label: 'What about restocking?', next: 'crates' },
              { label: 'And the books?', next: 'books' },
              { label: 'Heading down now.', next: 'sendoff' }
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

  function _refreshPanels() {
    if (typeof DebriefFeed !== 'undefined') DebriefFeed.refresh();
    if (typeof StatusBar !== 'undefined') StatusBar.refresh();
    if (typeof QuickBar !== 'undefined') QuickBar.refresh();
    if (typeof NchWidget !== 'undefined') NchWidget.refresh();
  }

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
    if (_ambientBarkTimer !== null) {
      clearInterval(_ambientBarkTimer);
      _ambientBarkTimer = null;
    }

    // C6: Reshuffle deck on floor transition — fresh hand for each floor.
    // Only reshuffle when entering dungeons (depth 3+) to keep town safe.
    var depth = floorId.split('.').length;
    if (typeof CardAuthority !== 'undefined' && depth >= 3) {
      CardAuthority.resetDeck();
      CardAuthority.drawHand();
      if (typeof Toast !== 'undefined') {
        Toast.show('\u267B\uFE0F Deck reshuffled \u2014 drew ' + CardAuthority.getHand().length, 'dim');
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

    // IO-8: Auto-create CrateSystem containers for CHEST tiles on floor load.
    // Crates are created by BreakableSpawner; chests are hand-authored in grids
    // so we scan after the grid is loaded. Skip if containers already exist
    // (floor revisit with cached data).
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
            if (cGrid[cy][cx] === TILES.CHEST && !CrateSystem.hasContainer(cx, cy, floorId)) {
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
          }
        }
      }
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
                        ' - ' + Math.round(newOrder.target * 100) + '%', 'info');
          }
        }
      } else if (depth <= 2) {
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

    // ── Dispatcher confrontation: escalating barks based on fail streak ──
    if (_gateUnlocked && typeof Player !== 'undefined') {
      var fails = Player.getFlag('consecutiveFails') || 0;
      if (fails >= 4) {
        // Terminal — game over via dispatcher firing
        setTimeout(function () {
          BarkLibrary.fire('npc.dispatcher.warn.fired');
          setTimeout(function () {
            _changeState(S.GAME_OVER);
          }, 3000);
        }, 1500);
      } else if (fails >= 3) {
        setTimeout(function () {
          BarkLibrary.fire('npc.dispatcher.warn.severe');
        }, 1500);
      } else if (fails >= 2) {
        setTimeout(function () {
          BarkLibrary.fire('npc.dispatcher.warn.mild');
        }, 1500);
      }
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
  /**
   * Spawn the Dispatcher gate NPC in a hidden holding position.
   *
   * The dispatcher does NOT block the gate passage initially. Instead,
   * it waits until the player crosses a proximity threshold (~7 tiles
   * from the gate door), then spawns behind the player, barks, and
   * rush-approaches for the grab sequence.
   *
   * Choreography (§11d / DOC-51):
   *   1. Player crosses proximity threshold → _dispatcherPhase = 'spawned'
   *   2. Dispatcher appears behind player (opposite facing direction, 6 tiles back)
   *   3. Bark: "HEY [player class]!" → _dispatcherPhase = 'barking'
   *   4. After delay → rush toward player at 10x speed → _dispatcherPhase = 'rushing'
   *   5. Within grab range → CinematicCamera.start('dispatcher_grab') + forced 180° turn
   *   6. → _dispatcherPhase = 'grabbing' → dialogue tree opens
   */
  function _spawnDispatcherGate() {
    // Restore session flag from persisted player state (save/load)
    if (!_dispatcherDialogShown && typeof Player !== 'undefined' && Player.state) {
      var pf = Player.state().flags;
      if (pf && pf.dispatcher_met) _dispatcherDialogShown = true;
    }

    var enemies = FloorManager.getEnemies();
    // Guard: don't double-spawn
    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].id === _dispatcherSpawnId) return;
    }

    var stack = (typeof NpcComposer !== 'undefined')
      ? NpcComposer.getVendorPreset('dispatcher')
      : null;

    // Find the actual gate position (DOOR leading to Floor 2)
    var gatePos = _findGateDoorPos();
    // Stand 1 tile west of the gate (toward the player's approach direction)
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
      facing:      'west',    // Faces the player's approach (from the road)
      awareness:   0,
      friendly:    true,
      nonLethal:   true,
      blocksMovement: true,   // Blocks the gate from the start
      _hidden:     false,     // Visible on minimap and in raycaster
      tags:        ['gate_npc', 'dispatcher']
    };

    enemies.push(entity);
    _dispatcherEntity = entity;

    // If the encounter already played (player left Floor 1 and returned
    // before getting keys), skip the choreography — go straight to 'done'.
    // The dispatcher stays visible as a gatekeeper bump-NPC but doesn't
    // re-run the barking → dialogue cinematic a second time.
    if (_dispatcherDialogShown) {
      _dispatcherPhase = 'done';
      console.log('[Game] Dispatcher re-spawned as gatekeeper (encounter already completed)');
    } else {
      _dispatcherPhase = 'idle';
      console.log('[Game] Dispatcher gate NPC spawned at gate (' + spawnX + ',' + spawnY + ') — awaiting proximity');
    }
  }

  /**
   * Find the gate door position on Floor 1 that leads to Floor 2.
   * Uses doorTargets to find the DOOR keyed to target '2', which is the
   * correct gate regardless of grid layout. Falls back to scanning for
   * STAIRS_DN / BOSS_DOOR / DOOR if doorTargets is missing.
   * @returns {{x:number, y:number}|null}
   */
  function _findGateDoorPos() {
    var floorData = FloorManager.getFloorData();
    if (!floorData || !floorData.grid) return null;

    // Primary: check doorTargets for the door leading to Floor "2"
    if (floorData.doorTargets) {
      var keys = Object.keys(floorData.doorTargets);
      for (var i = 0; i < keys.length; i++) {
        if (floorData.doorTargets[keys[i]] === '2') {
          var parts = keys[i].split(',');
          return { x: parseInt(parts[0], 10), y: parseInt(parts[1], 10) };
        }
      }
    }

    // Fallback: scan for STAIRS_DN or BOSS_DOOR
    for (var gy = 0; gy < floorData.gridH; gy++) {
      for (var gx = 0; gx < floorData.gridW; gx++) {
        var tile = floorData.grid[gy][gx];
        if (tile === TILES.STAIRS_DN || tile === TILES.BOSS_DOOR) {
          return { x: gx, y: gy };
        }
      }
    }
    return null;
  }

  /**
   * Find a walkable tile behind the player (opposite their facing direction).
   * Searches outward from ideal distance, falls back to nearest walkable.
   * Blockout-agnostic — clamps to grid bounds and checks walkability.
   * @param {number} idealDist - Desired distance behind player
   * @returns {{x:number, y:number}}
   */
  function _findSpawnBehind(idealDist) {
    var floorData = FloorManager.getFloorData();
    var pp = Player.getPos();
    var dir = Player.getDir();

    // Opposite of player's facing direction
    // DX/DY: 0=East(+x), 1=South(+y), 2=West(-x), 3=North(-y)
    var oppositeDir = (dir + 2) % 4;
    var bdx = MC.DX[oppositeDir];
    var bdy = MC.DY[oppositeDir];

    // Try ideal distance first, then shrink until walkable
    for (var dist = idealDist; dist >= 2; dist--) {
      var tx = pp.x + bdx * dist;
      var ty = pp.y + bdy * dist;

      // Clamp to grid
      if (floorData && floorData.grid) {
        tx = Math.max(1, Math.min(floorData.gridW - 2, tx));
        ty = Math.max(1, Math.min(floorData.gridH - 2, ty));
      }

      // Check walkable
      if (floorData && floorData.grid && floorData.grid[ty] &&
          TILES.isWalkable(floorData.grid[ty][tx])) {
        return { x: tx, y: ty };
      }
    }

    // Last resort: spawn adjacent to player (any walkable neighbor)
    var dirs = [0, 1, 2, 3];
    for (var d = 0; d < dirs.length; d++) {
      var nx = pp.x + MC.DX[dirs[d]] * 2;
      var ny = pp.y + MC.DY[dirs[d]] * 2;
      if (floorData && floorData.grid && floorData.grid[ny] &&
          TILES.isWalkable(floorData.grid[ny][nx])) {
        return { x: nx, y: ny };
      }
    }

    // Absolute fallback
    return { x: pp.x, y: pp.y + 2 };
  }

  /**
   * Tick the dispatcher choreography state machine.
   * Called every frame from the gameplay update when on Floor 1 and gate is locked.
   *
   * Blockout-agnostic: finds gate dynamically, spawns relative to player,
   * rush-walks using grid pathfinding with wall checks.
   *
   * @param {number} dt - Frame delta in milliseconds
   */
  function _tickDispatcherChoreography(dt) {
    if (_gateUnlocked || !_dispatcherEntity) return;
    if (FloorManager.getFloor() !== '1') return;

    var pp = Player.getPos();
    var floorData = FloorManager.getFloorData();

    switch (_dispatcherPhase) {

      case 'idle': {
        // Dispatcher is visible at the gate. Check proximity to the dispatcher.
        var ddx = pp.x - _dispatcherEntity.x;
        var ddy = pp.y - _dispatcherEntity.y;
        var dispDist = Math.sqrt(ddx * ddx + ddy * ddy);

        if (dispDist <= DISPATCHER_TRIGGER_RANGE) {
          // ── Player approached the dispatcher — trigger encounter ──
          _dispatcherPhase = 'grabbing';

          // Freeze player movement so buffered inputs can't walk away
          MC.cancelAll();

          // ── Opening bark: "HEY [player class]!" ──
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

          // Voice chirp (loud, authoritative)
          if (typeof AudioSystem !== 'undefined') {
            AudioSystem.play('ui-blop', { volume: 0.6, playbackRate: 0.75 });
          }

          // Calculate angle from player to dispatcher (for forced turn)
          var angleToDisp = Math.atan2(
            _dispatcherEntity.y - pp.y,
            _dispatcherEntity.x - pp.x
          );

          // Force player to face the dispatcher
          var targetDir = (typeof Player !== 'undefined' && Player.radianToDir)
            ? Player.radianToDir(angleToDisp)
            : MC.DIR_EAST;
          MC.startTurn(targetDir);
          Player.setDir(targetDir);

          // Lock MouseLook to dead-center during cinematic
          if (typeof MouseLook !== 'undefined' && MouseLook.lockOn) {
            MouseLook.lockOn(0, 0);
          }
          if (typeof Player !== 'undefined' && Player.resetLookOffset) {
            Player.resetLookOffset();
          }

          // NPC faces player
          if (typeof NpcSystem !== 'undefined' && NpcSystem.engageTalk) {
            NpcSystem.engageTalk(_dispatcherEntity);
          }

          // ── CinematicCamera: letterbox + input lock ──
          if (typeof CinematicCamera !== 'undefined') {
            CinematicCamera.start('dispatcher_grab', {
              focusAngle: angleToDisp,
              onMidpoint: function () {
                _showDispatcherGateDialog();
              }
            });
          } else {
            // Fallback: no camera, just show dialogue
            _showDispatcherGateDialog();
          }

          console.log('[Game] Dispatcher encounter triggered — dist=' + dispDist.toFixed(1) +
                      ' | forced face dir=' + targetDir);
        }
        break;
      }

      case 'grabbing':
        // Waiting for dialogue to finish (managed by _showDispatcherGateDialog onClose)
        break;

      case 'done':
        // Sequence complete — dispatcher removed by _onPickupWorkKeys or stays as gatekeeper
        break;
    }
  }

  /**
   * Dispatcher gate dialogue — full Morrowind-style branching tree.
   *
   * First encounter (grab sequence):
   *   Grab bark → "Oh you don't like when I patronize..." → 3 choices
   *   [Who are you?] → reveals Department/clock → 2 more choices
   *   [What keys?] → explains key location
   *   [Where did FACTION hit?] → reveals dungeon target
   *   [Who am I supposed to be?] → callsign + class ribbing
   *
   * Subsequent bumps: shorter redirect with "have keys" skip option.
   *
   * Text wrapping: DialogBox._wrapText() handles long lines dynamically.
   * At 13px monospace in a ~428px box, lines wrap at ~33 chars. Long
   * dialogue is fine — it just flows to multiple lines.
   */
  // Restored from Player.state().flags.dispatcher_met on floor arrival
  var _dispatcherDialogShown = false;

  /**
   * Dispatcher gate dialogue — Morrowind-style branching tree rendered
   * inline in the StatusBar tooltip footer (not the DialogBox canvas overlay).
   *
   * First encounter (grab sequence):
   *   "Oh you don't like when I patronize..." → 3 choices
   *   [Who are you?] → reveals Department/clock → 2 more choices
   *   [What keys?] → explains key location
   *   [Where did FACTION hit?] → reveals dungeon target
   *   [Who am I supposed to be?] → callsign + class ribbing
   *   All branches → "Your keys are at the BnB..." → end
   *
   * Subsequent bumps: shorter redirect with leave / unlock options.
   *
   * Uses StatusBar.pushDialogue() per TOOLTIP_BARK_ROADMAP Phase 1.
   * The first-person viewport stays visible throughout the conversation.
   */
  function _showDispatcherGateDialog() {
    if (typeof StatusBar === 'undefined' || !StatusBar.pushDialogue) return;

    var firstTime = !_dispatcherDialogShown;
    _dispatcherDialogShown = true;

    // Persist flag so the encounter doesn't re-trigger on re-entry
    if (typeof Player !== 'undefined' && Player.state) {
      Player.state().flags.dispatcher_met = true;
    }

    // Player identity tokens for dialogue
    var ps = (typeof Player !== 'undefined' && Player.state) ? Player.state() : {};
    var playerClass = ps.avatarName || ps.className || 'Gleaner';
    var callsign = ps.callsign || 'Operative';
    // TODO: wire faction name + suit symbol from current hero cycle
    var factionName = '\u2660 Guild';

    // Callback to close cinematic after dialogue ends
    var _closeCinematic = function () {
      console.log('[Game] _closeCinematic — releasing controls');
      try {
        if (typeof CinematicCamera !== 'undefined' && CinematicCamera.isActive()) {
          CinematicCamera.close();
        }
      } catch (e) {
        console.error('[Game] CinematicCamera.close() error:', e);
      }
      // Release MouseLook lock so free-look resumes
      if (typeof MouseLook !== 'undefined' && MouseLook.releaseLock) {
        MouseLook.releaseLock();
      }
      // Ensure movement queue is clean and player can move again
      MC.cancelAll();
      _dispatcherPhase = 'done';
      _updateQuestTarget();  // Phase 0 → Phase 1: now points to home/keys
    };

    // NPC descriptor for StatusBar speaker rendering
    var dispatcherNpc = {
      id:    _dispatcherSpawnId,
      name:  'Dispatcher',
      emoji: '\uD83D\uDC09',
      x:     _dispatcherEntity ? _dispatcherEntity.x : 0,
      y:     _dispatcherEntity ? _dispatcherEntity.y : 0
    };

    // ── Build dialogue tree ──
    var tree;

    if (firstTime) {
      // ── GRAB DIALOGUE — first encounter ──
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
            text: 'First thing. Your work keys are back at the BnB. Go home, grab them, then come unlock this floor so the hazmat crew can get through.',
            choices: [
              { label: 'On my way.',
                next: null,
                effect: {
                  callback: function () {
                    if (typeof Toast !== 'undefined') {
                      Toast.show('\uD83D\uDDDD\uFE0F Go home and get your work keys', 'info');
                    }
                  }
                }
              }
            ]
          }
        }
      };
    } else {
      // ── RETURN BUMPS — shorter redirect ──
      tree = {
        root: 'return_greeting',
        nodes: {
          return_greeting: {
            text: 'Still here, ' + callsign + '? Your keys are at home. Get moving.',
            choices: [
              { label: 'On my way', next: null },
              { label: 'Actually, I have them now', next: 'have_keys' }
            ]
          },
          have_keys: {
            text: 'About time. Gate\'s open. Watch yourself down there.',
            choices: [
              { label: 'Thanks.',
                next: null,
                effect: {
                  callback: function () {
                    _onPickupWorkKeys();
                  }
                }
              }
            ]
          }
        }
      };
    }

    // Push tree to StatusBar tooltip footer (pinned: forced encounter, no walk-away)
    StatusBar.pushDialogue(dispatcherNpc, tree, function () {
      // onEnd: fires when any null-next choice is picked (conversation over)
      _closeCinematic();
    }, { pinned: true });
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
   * Grants WELL_RESTED if in bed before midnight (sleepHour >= 6).
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

          // Grant WELL_RESTED if in bed before midnight
          // sleepHour >= 6 means the player went to bed during the day/evening
          // (not in the 00:00–05:59 post-midnight zone = stayed up too late)
          if (sleepHour >= 6 && typeof StatusEffect !== 'undefined') {
            StatusEffect.apply('WELL_RESTED');
          }

          // Heal + heal particles
          if (typeof Player !== 'undefined') {
            Player.fullRestore();
            // Successful voluntary sleep resets consecutive fail streak
            Player.setFlag('consecutiveFails', 0);
          }
          if (typeof ParticleFX !== 'undefined') {
            ParticleFX.healPulse(_canvas ? _canvas.width / 2 : 320, _canvas ? _canvas.height * 0.5 : 220);
          }

          // Transition into home (1.6) — wake up inside
          FloorManager.setFloor('1.6');
          FloorManager.generateCurrentFloor();
        },
        onComplete: function () {
          _updateDayCounter();

          if (sleepHour >= 6 && typeof Toast !== 'undefined') {
            Toast.show('\u2600 Well rested! Ready for the day.', 'buff');
          } else if (typeof Toast !== 'undefined') {
            Toast.show('\u2615 Late night... but at least you made it home.', 'info');
          }

          // Trigger overnight hero run if it's a Hero Day
          // §9: DungeonSchedule handles per-group runs via DayCycle.onDayChange.
          // Legacy path only when DungeonSchedule is absent.
          if (typeof DayCycle !== 'undefined' && DayCycle.isHeroDay() &&
              typeof DungeonSchedule === 'undefined') {
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

  // ── Week-strip widget config ───────────────────────────────────
  // Day abbreviations — Monday-first to match DayCycle (Day 0 = Monday)
  var _WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  // Suit symbols for hero-day indicators (each dungeon gets a color+suit)
  // Legacy: used when DungeonSchedule is absent
  var _DUNGEON_SUITS = [
    { sym: '\u2660', color: '#8888ff' },  // ♠ spades — blue dungeon
    { sym: '\u2666', color: '#ff6666' },  // ♦ diamonds — red dungeon
    { sym: '\u2663', color: '#66cc66' }   // ♣ clubs — green dungeon
  ];

  // §9: Group-to-suit mapping for DungeonSchedule-driven display.
  // Each group gets a unique suit symbol + color for the week strip.
  var _GROUP_SUITS = {
    soft_cellar: { sym: '\u2660', color: '#8888ff', name: 'Soft Cellar'  },  // ♠ spades
    heros_wake:  { sym: '\u2666', color: '#ff6666', name: "Hero's Wake"  },  // ♦ diamonds
    heart:       { sym: '\u2665', color: '#ff5588', name: 'Heart'        }   // ♥ hearts
  };

  /**
   * Create the day counter DOM element — week-strip with day nodes.
   */
  function _initDayCounter() {
    _dayCounterEl = document.getElementById('hud-day-counter');
    if (!_dayCounterEl) {
      _dayCounterEl = document.createElement('div');
      _dayCounterEl.id = 'hud-day-counter';
      _dayCounterEl.style.cssText =
        'position:absolute;top:10px;right:308px;' +
        'font:bold 13px var(--font-data, monospace);color:#d4c8a0;' +
        'text-shadow:0 1px 3px rgba(0,0,0,0.8);' +
        'z-index:15;pointer-events:auto;' +
        'background:rgba(10,8,5,0.7);padding:4px 8px;' +
        'border:1px solid rgba(180,160,120,0.3);border-radius:4px;' +
        'display:flex;align-items:center;gap:2px;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_dayCounterEl);
    }

    // Inject keyframes + suit-stack hover styles (once)
    if (!document.getElementById('day-strip-style')) {
      var style = document.createElement('style');
      style.id = 'day-strip-style';
      style.textContent =
        '@keyframes day-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }\n' +
        // Suit stack: overlapping cascade (NCH joker pattern)
        '.ds-node { position:relative; display:inline-flex; align-items:center;' +
        '  justify-content:center; width:20px; height:22px; border-radius:3px;' +
        '  text-align:center; line-height:22px; vertical-align:top; }\n' +
        // Individual suit chip inside a stacked node
        '.ds-suit { position:absolute; transition: left 0.2s ease, top 0.15s ease;' +
        '  font-size:inherit; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.6)); }\n' +
        // Stack positions: diagonal cascade (like NCH joker offset)
        '.ds-suit.s-0 { left:0; top:0; }\n' +
        '.ds-suit.s-1 { left:5px; top:-1px; }\n' +
        '.ds-suit.s-2 { left:10px; top:0; }\n' +
        // Hover: fan out (more horizontal spread)
        '.ds-node:hover .ds-suit.s-0 { left:-2px; }\n' +
        '.ds-node:hover .ds-suit.s-1 { left:6px; }\n' +
        '.ds-node:hover .ds-suit.s-2 { left:14px; }\n' +
        // Stacked node gets wider to accommodate fanned suits
        '.ds-node.ds-stacked { width:22px; }\n' +
        '.ds-node.ds-stacked:hover { width:30px; }\n' +
        // Death-shifted suits: pulsing red border glow
        '.ds-suit.ds-shifted { animation:ds-shift-pulse 1.5s ease-in-out infinite; }\n' +
        '@keyframes ds-shift-pulse { 0%,100%{filter:drop-shadow(0 1px 1px rgba(0,0,0,0.6))}' +
        '  50%{filter:drop-shadow(0 0 4px rgba(255,80,60,0.7))} }\n' +
        // Resolved (past hero day): checkmark or X
        '.ds-suit.ds-resolved-pass::after { content:"\\2713"; position:absolute;' +
        '  bottom:-6px; right:-4px; font-size:7px; color:#66cc66; }\n' +
        '.ds-suit.ds-resolved-fail::after { content:"\\2717"; position:absolute;' +
        '  bottom:-6px; right:-4px; font-size:7px; color:#ff5555; }\n';
      document.head.appendChild(style);
    }

    _updateDayCounter();
  }

  /**
   * Build a map: dayNum → [{ sym, color, groupId, resolved, onSchedule, result }]
   * from DungeonSchedule contracts. Returns {} if DungeonSchedule absent.
   */
  function _buildHeroDayMap() {
    if (typeof DungeonSchedule === 'undefined' || !DungeonSchedule.getSchedule) return null;
    var schedule = DungeonSchedule.getSchedule();
    var map = {};
    for (var i = 0; i < schedule.length; i++) {
      var c = schedule[i];
      var suit = _GROUP_SUITS[c.groupId] || { sym: '\u2694', color: '#aaa', name: c.label };
      var dayKey = c.actualDay;
      if (!map[dayKey]) map[dayKey] = [];
      map[dayKey].push({
        sym:        suit.sym,
        color:      suit.color,
        groupId:    c.groupId,
        label:      suit.name || c.label,
        resolved:   c.resolved,
        onSchedule: c.onSchedule,
        result:     c.result,
        shifted:    c.actualDay !== c.scheduledDay,
        scheduledDay: c.scheduledDay
      });
    }
    return map;
  }

  /**
   * Update the week-strip widget — [M T ♠ T ♦ S S] style display.
   * Monday-first (Day 0 = Monday, matching DayCycle).
   *
   * §9 DungeonSchedule-aware: consults actual group schedule (including
   * death-shifted days) instead of legacy HERO_DAY_INTERVAL cycling.
   * When multiple groups converge on the same day (due to death-shift),
   * their suits stack with NCH joker-style cascade + hover fan-out.
   *
   * Visual states per node:
   *   Past:    dim text, no background — already lived through
   *   Today:   bold, bright, bobbing, lit background — "you are here"
   *   Future:  medium text, no background — days ahead
   *   Hero:    suit symbol(s) in suit color (stacked if convergent)
   *   Shifted: pulsing red glow on death-shifted suits
   *   Resolved: tiny ✓/✗ below resolved suits
   */
  function _updateDayCounter() {
    if (!_dayCounterEl) return;
    if (typeof DayCycle === 'undefined') return;

    var day = DayCycle.getDay();
    var weekDayIndex = day % 7;
    var timeStr = DayCycle.getTimeString ? DayCycle.getTimeString() : '06:00';
    var phase = DayCycle.getPhase ? DayCycle.getPhase() : 'morning';

    // Build hero day map from DungeonSchedule (or null if absent)
    var heroDayMap = _buildHeroDayMap();

    // Legacy fallback: use DayCycle HERO_DAY_INTERVAL when no DungeonSchedule
    var heroInterval = DayCycle.HERO_DAY_INTERVAL || 3;

    var html = '';

    // Build 8+ day strip — show days 0 through max(7, highest hero day)
    // For the 8-day jam arc we need at least days 0–8 visible.
    var stripLen = 7;
    if (heroDayMap) {
      // Extend strip to cover all scheduled hero days
      for (var key in heroDayMap) {
        if (heroDayMap.hasOwnProperty(key)) {
          var d = parseInt(key, 10);
          if (d >= stripLen) stripLen = d + 1;
        }
      }
    }
    // Cap at 9 to keep strip compact (days 0–8 for jam)
    if (stripLen > 9) stripLen = 9;

    for (var i = 0; i < stripLen; i++) {
      var dayNum = i; // absolute day number (0-indexed jam arc)
      var isToday = (dayNum === day);
      var isPast = (dayNum < day);

      // Check for hero groups on this day
      var suitEntries = heroDayMap ? (heroDayMap[dayNum] || []) : [];

      // Legacy fallback: single suit from DayCycle cycling
      if (!heroDayMap && dayNum >= 0 && dayNum % heroInterval === 0) {
        var legacyIdx = Math.floor(dayNum / heroInterval) % _DUNGEON_SUITS.length;
        suitEntries = [{
          sym: _DUNGEON_SUITS[legacyIdx].sym,
          color: _DUNGEON_SUITS[legacyIdx].color,
          label: 'Hero Day',
          resolved: false, onSchedule: true, shifted: false, result: null
        }];
      }

      var isHeroSlot = suitEntries.length > 0;
      var isStacked = suitEntries.length > 1;

      // Day label — abbreviated day-of-week name
      var dayOfWeekIdx = dayNum % 7;
      var label = _WEEK_DAYS[dayOfWeekIdx];

      // ── Style by temporal state ──
      var nodeColor, bg, fontSize, fontWeight, opacity, nodeAnim;

      if (isToday) {
        nodeColor = isHeroSlot ? '#f0c040' : '#ffe8a0';
        fontWeight = '900';
        fontSize = isHeroSlot ? '14px' : '13px';
        bg = 'rgba(255,255,255,0.15)';
        opacity = '1';
        nodeAnim = 'animation:day-bob 1.2s ease-in-out infinite;';
      } else if (isPast) {
        nodeColor = '#5a5040';
        fontWeight = '400';
        fontSize = '10px';
        bg = 'transparent';
        opacity = '0.5';
        nodeAnim = '';
      } else {
        nodeColor = '#8a8068';
        fontWeight = '500';
        fontSize = '11px';
        bg = 'transparent';
        opacity = '0.75';
        nodeAnim = '';
      }

      // ── Build node HTML ──
      if (isHeroSlot) {
        // Hero day node — suit symbols (possibly stacked)
        var stackClass = isStacked ? ' ds-stacked' : '';
        var titleParts = [];
        for (var si = 0; si < suitEntries.length; si++) {
          var se = suitEntries[si];
          titleParts.push(se.sym + ' ' + se.label +
            (se.shifted ? ' (SHIFTED from Day ' + (se.scheduledDay + 1) + ')' : '') +
            (se.resolved ? (se.result && se.result.coreScore >= 0.6 ? ' \u2713' : ' \u2717') : ''));
        }
        var titleStr = _WEEK_DAYS[dayOfWeekIdx] + ' \u2014 Day ' + (dayNum + 1) +
                       ' (HERO DAY)\n' + titleParts.join('\n') +
                       (isToday ? '\n[TODAY]' : '');

        html += '<span class="ds-node' + stackClass + '" style="' +
                'background:' + bg + ';' +
                'font-size:' + fontSize + ';font-weight:' + fontWeight + ';' +
                'opacity:' + opacity + ';' +
                nodeAnim + '" title="' + titleStr + '">';

        // Render each suit as an overlapping chip
        for (var sj = 0; sj < suitEntries.length; sj++) {
          var entry = suitEntries[sj];
          var suitColor;

          if (isToday) {
            suitColor = '#f0c040';  // gold for today's active suits
          } else if (isPast) {
            suitColor = entry.color;
          } else {
            suitColor = entry.color;
          }

          var suitOpacity = isPast ? '0.45' : (isToday ? '1' : '0.85');
          var extraClass = '';
          if (entry.shifted && !entry.resolved) extraClass += ' ds-shifted';
          if (entry.resolved && entry.result) {
            extraClass += entry.result.coreScore >= 0.6
              ? ' ds-resolved-pass' : ' ds-resolved-fail';
          }

          html += '<span class="ds-suit s-' + sj + extraClass + '" style="' +
                  'color:' + suitColor + ';opacity:' + suitOpacity + ';">' +
                  entry.sym + '</span>';
        }

        html += '</span>';

      } else {
        // Regular day node (no hero groups)
        html += '<span class="ds-node" style="' +
                'color:' + nodeColor + ';background:' + bg + ';' +
                'font-size:' + fontSize + ';font-weight:' + fontWeight + ';' +
                'opacity:' + opacity + ';' +
                nodeAnim + '" title="' +
                _WEEK_DAYS[dayOfWeekIdx] + ' \u2014 Day ' + (dayNum + 1) +
                (isToday ? ' [TODAY]' : '') + '">' +
                label + '</span>';
      }
    }

    // Phase-tinted separator dot
    var dotColor = (phase === 'night' || phase === 'dusk') ? '#6688aa' : '#a09880';

    // Time display
    html += '<span style="margin-left:4px;color:' + dotColor + ';font-size:10px">\u00B7</span>' +
            '<span style="margin-left:4px;font-size:12px;color:#a09880;' +
            'letter-spacing:0.05em;font-weight:600">' +
            timeStr + '</span>';

    // Combo indicator (when streak > 0)
    if (heroDayMap && typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getCombo) {
      var combo = DungeonSchedule.getCombo();
      if (combo.streak > 0) {
        var stars = '';
        for (var ci = 0; ci < combo.streak && ci < 3; ci++) stars += '\u2605';
        html += '<span style="margin-left:4px;font-size:10px;color:#f0c040;' +
                'filter:drop-shadow(0 0 2px rgba(240,192,64,0.5))" title="' +
                'Combo streak: ' + combo.streak + ' (' + combo.multiplier.toFixed(1) + '\u00D7)">' +
                stars + '</span>';
      }
    }

    _dayCounterEl.innerHTML = html;
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
  //
  // Phase 0: meet the dispatcher (approach → promenade)
  // Phase 1: get work keys (promenade → home → chest)
  // Phase 2: head to first dungeon (original hardcoded route)
  // Phase 3: dungeon work cycle — pin at assignment until readiness met,
  //          then advance to next group per DungeonSchedule
  //
  // Phase 3 is data-driven: reads DungeonSchedule.getNextGroup() to find
  // the target dungeon, derives lobby/exterior IDs from the floor hierarchy,
  // and resolves door positions from cached floorData.doorTargets.

  /**
   * Find a door on parentFloorId that leads to targetFloorId.
   * Returns { x, y } or null. Uses the floor cache.
   */
  function _findDoorTo(parentFloorId, targetFloorId) {
    var cached = FloorManager.getFloorCache ? FloorManager.getFloorCache(parentFloorId) : null;
    if (!cached || !cached.doorTargets) return null;
    for (var key in cached.doorTargets) {
      if (cached.doorTargets[key] === targetFloorId) {
        var parts = key.split(',');
        return { x: parseInt(parts[0], 10), y: parseInt(parts[1], 10) };
      }
    }
    return null;
  }

  /**
   * Floor depth helper: '1' → 1, '1.3' → 2, '1.3.1' → 3.
   */
  function _floorDepth(id) {
    return String(id).split('.').length;
  }

  function _updateQuestTarget() {
    if (typeof Minimap === 'undefined' || !Minimap.setQuestTarget) return;
    var floorId = FloorManager.getFloor();

    // ── Phase 0–1: pre-gate ────────────────────────────────────────
    if (!_gateUnlocked) {
      if (_dispatcherPhase !== 'done') {
        // Phase 0: meet the dispatcher at the gate
        if (floorId === '0') {
          Minimap.setQuestTarget({ x: 19, y: 5 });
        } else if (floorId === '1') {
          if (_dispatcherEntity && !_dispatcherEntity._hidden) {
            Minimap.setQuestTarget({ x: _dispatcherEntity.x, y: _dispatcherEntity.y });
          } else {
            var gateQ = _findGateDoorPos();
            Minimap.setQuestTarget(gateQ ? { x: gateQ.x - 1, y: gateQ.y } : null);
          }
        } else {
          Minimap.setQuestTarget(null);
        }
      } else {
        // Phase 1: get work keys — dispatcher sent us home
        if (floorId === '1') {
          Minimap.setQuestTarget({ x: 22, y: 27 });
        } else if (floorId === '1.6') {
          Minimap.setQuestTarget({ x: 19, y: 3 });
        } else {
          Minimap.setQuestTarget(null);
        }
      }
      return;
    }

    // ── Phase 2–3: dungeon work cycle ──────────────────────────────
    // Get the next unresolved dungeon group from the schedule.
    var nextGroup = (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getNextGroup)
      ? DungeonSchedule.getNextGroup() : null;

    if (!nextGroup || !nextGroup.floorIds || nextGroup.floorIds.length === 0) {
      // Arc complete or schedule not initialized — no marker
      Minimap.setQuestTarget(null);
      return;
    }

    // Derive floor hierarchy from the first dungeon floor in the group.
    // '1.3.1' → lobby '1.3', exterior '1'
    var dungeonId  = nextGroup.floorIds[0];              // e.g. '1.3.1'
    var segs       = dungeonId.split('.');
    var lobbyId    = segs.slice(0, 2).join('.');         // e.g. '1.3'
    var exteriorId = segs[0];                            // e.g. '1'

    // Is the player currently inside this dungeon group's floors?
    var inThisDungeon = false;
    for (var gi = 0; gi < nextGroup.floorIds.length; gi++) {
      if (floorId === nextGroup.floorIds[gi]) { inThisDungeon = true; break; }
    }

    if (inThisDungeon) {
      // Player is IN the dungeon — check readiness
      var coreScore = (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.getCoreScore)
        ? ReadinessCalc.getCoreScore(floorId) : 0;

      if (coreScore >= (nextGroup.target || 0.6)) {
        // Readiness met! Point at stairs up — time to leave
        var dData = FloorManager.getFloorData();
        if (dData && dData.doors && dData.doors.stairsUp) {
          Minimap.setQuestTarget({ x: dData.doors.stairsUp.x, y: dData.doors.stairsUp.y });
        } else {
          Minimap.setQuestTarget(null);
        }
      } else {
        // Still working — no marker (player is doing the sweep)
        Minimap.setQuestTarget(null);
      }
      return;
    }

    if (floorId === lobbyId) {
      // In the dungeon lobby — point at stairs down
      var lobbyData = FloorManager.getFloorData();
      if (lobbyData && lobbyData.doors && lobbyData.doors.stairsDn) {
        Minimap.setQuestTarget({ x: lobbyData.doors.stairsDn.x, y: lobbyData.doors.stairsDn.y });
      } else {
        Minimap.setQuestTarget(null);
      }
      return;
    }

    if (floorId === exteriorId) {
      // On the correct exterior — point at the door to the dungeon lobby
      var doorPos = _findDoorTo(exteriorId, lobbyId);
      Minimap.setQuestTarget(doorPos);
      return;
    }

    // Player is on a different exterior or an unrelated interior.
    // Find the gate/door that leads toward the target exterior.
    if (_floorDepth(floorId) === 1 && floorId !== exteriorId) {
      // On a different exterior — find the connecting gate
      var gateDoor = _findDoorTo(floorId, exteriorId);
      Minimap.setQuestTarget(gateDoor);
      return;
    }

    // In a shop, home, or other interior not related to the assignment
    Minimap.setQuestTarget(null);
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

  /**
   * Apply the effect of a walk-over collectible pickup.
   * @param {Object} pickup - { type, amount?, itemId? }
   */
  function _applyPickup(pickup) {
    if (pickup.type === 'gold') {
      var goldAmt = pickup.amount || 1;
      // Authority path — CardTransfer.lootGold fires gold:changed event
      CardAuthority.addGold(goldAmt);
      Toast.show('💰 +' + goldAmt, 'currency');
      AudioSystem.playRandom('coin', { volume: 0.5 });
      // Coin VFX — match shop sell pattern (coinRain ≥ 15, coinBurst < 15)
      if (typeof ParticleFX !== 'undefined' && _canvas) {
        var gcx = _canvas.width / 2;
        var gcy = _canvas.height * 0.5;
        if (goldAmt >= 15) {
          ParticleFX.coinRain(gcx, gcy, goldAmt);
        } else if (goldAmt >= 3) {
          ParticleFX.coinBurst(gcx, gcy, Math.max(3, Math.floor(goldAmt / 2)));
        }
        // 1-2 gold: no VFX (too small, would feel noisy on every walk-over)
      }
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

    // Check whether the bumped tile is the Dispatcher gate NPC.
    // The grab choreography handles the first encounter via proximity.
    // Bumps only trigger dialogue for repeat encounters (phase = 'done').
    if (!_gateUnlocked && _dispatcherEntity && _dispatcherPhase === 'done') {
      var pos = MC.getGridPos();
      var bumpX = pos.x + MC.DX[dir];
      var bumpY = pos.y + MC.DY[dir];
      if (_dispatcherEntity.x === bumpX && _dispatcherEntity.y === bumpY) {
        // Turn both NPC and player to face each other
        if (typeof NpcSystem !== 'undefined' && NpcSystem.engageTalk) {
          NpcSystem.engageTalk(_dispatcherEntity);
        }
        // Turn player to face dispatcher + lock MouseLook
        var ddx = _dispatcherEntity.x - pos.x;
        var ddy = _dispatcherEntity.y - pos.y;
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

        _showDispatcherGateDialog();
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

    // Friendly (resurrected) enemy interaction — bark or re-fight
    if (typeof CombatBridge !== 'undefined') {
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

    // Blood cleaning — scrub tiles near corpses
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
          var remaining = CleaningSystem.getBlood(fx, fy, cleanFloorId);
          if (remaining <= 0) {
            Toast.show('🧹 ' + i18n.t('toast.tile_clean', 'Tile cleaned!'), 'loot');
            if (typeof WorldPopup !== 'undefined') WorldPopup.spawn('🧹 Clean!', fx, fy, 'loot');
            SessionStats.inc('tilesCleaned');
            // R-2: Trigger readiness bar sweep preview
            if (typeof ReadinessCalc !== 'undefined' && HUD.triggerReadinessSweep) {
              HUD.triggerReadinessSweep(ReadinessCalc.getScore(cleanFloorId));
            }
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
          // R-2: Trigger readiness bar sweep preview
          if (typeof ReadinessCalc !== 'undefined' && HUD.triggerReadinessSweep) {
            HUD.triggerReadinessSweep(ReadinessCalc.getScore(rearmFloorId));
          }
          return;
        }
      }
    }

    var tile = floorData.grid[fy][fx];
    if (tile === TILES.CHEST) {
      // IO-8: Chest uses PeekSlots/CrateUI withdraw mode (same as crate pattern).
      // No legacy fallback — CombatBridge.openChest is never called for CHEST tiles.
      var chestFloorId = FloorManager.getCurrentFloorId();
      if (typeof PeekSlots !== 'undefined' && typeof CrateSystem !== 'undefined' &&
          CrateSystem.hasContainer(fx, fy, chestFloorId)) {
        if (PeekSlots.tryOpen(fx, fy, chestFloorId)) return;
        // tryOpen returned false — container is sealed/depleted/busy
        if (typeof Toast !== 'undefined') {
          var cc = CrateSystem.getContainer(fx, fy, chestFloorId);
          if (cc && cc.depleted) {
            Toast.show('Chest is empty', 'dim');
          }
        }
      }
      return;  // Always return — no fallback to legacy openChest
    } else if (tile === TILES.BONFIRE || tile === TILES.BED || tile === TILES.HEARTH) {
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
      // Resolve which faction owns this shop tile
      var shopFaction = 'tide';  // fallback
      var shopList = floorData.shops || [];
      for (var si = 0; si < shopList.length; si++) {
        if (shopList[si].x === fx && shopList[si].y === fy) {
          shopFaction = shopList[si].faction || shopList[si].factionId || 'tide';
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
    } else if (tile === TILES.DETRITUS) {
      // Face + OK: pick up detritus item directly into bag
      _collectDetritus(fx, fy);
    } else if (tile === TILES.BREAKABLE) {
      // If a CrateSystem container exists (crate slots):
      //   1. Quick-fill from bag (DEPTH3 §6.3b) — auto-match & fill slots
      //   2. If still has empties → open PeekSlots for manual filling
      //   3. If fully filled → already sealed, skip PeekSlots
      var crateFloorId = FloorManager.getCurrentFloorId();
      if (typeof CrateSystem !== 'undefined' &&
          CrateSystem.hasContainer(fx, fy, crateFloorId)) {
        // Quick-fill pass: auto-slot matching bag items
        if (_quickFillCrate(fx, fy, crateFloorId)) return; // Sealed — done
        // Still has empties: open manual slot UI
        if (typeof PeekSlots !== 'undefined' &&
            PeekSlots.tryOpen(fx, fy, crateFloorId)) return;
      }
      // Fallback: smash the breakable prop
      _smashBreakable(fx, fy);
    }
    // ── TORCH: Open torch-peek slot interaction ──
    else if (TILES.isTorch(tile)) {
      if (typeof TorchPeek !== 'undefined') {
        if (TorchPeek.isInteracting()) {
          // Already interacting — pass through to handleKey
        } else if (TorchPeek.isActive()) {
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
  }

  // ── Quick-fill crate from bag (DEPTH3 §6.3b) ─────────────────────

  /**
   * Auto-fill empty crate slots with matching bag items before opening
   * PeekSlots. Scans the bag for items whose crateFillTag or category
   * matches each empty slot's frameTag, fills in one pass, then:
   *   - If crate still has empties → returns false (caller opens PeekSlots)
   *   - If crate is now full → auto-seals, awards coins, returns true
   *
   * @param {number} fx - Crate grid X
   * @param {number} fy - Crate grid Y
   * @param {string} floorId
   * @returns {boolean} true if crate was fully filled and sealed
   */
  function _quickFillCrate(fx, fy, floorId) {
    var crate = CrateSystem.getContainer(fx, fy, floorId);
    if (!crate || crate.sealed) return false;

    var filled = 0;

    for (var s = 0; s < crate.slots.length; s++) {
      var slot = crate.slots[s];
      if (slot.filled) continue;

      // Scan bag for a matching item (live bag — shrinks as we remove)
      var bag = CardAuthority.getBag();
      var bestIdx = -1;
      for (var b = 0; b < bag.length; b++) {
        if (CrateSystem.doesItemMatch(bag[b], slot.frameTag)) {
          bestIdx = b;
          break; // First match wins — keeps bag order predictable
        }
      }

      if (bestIdx === -1) continue; // No match in bag for this slot

      // Pull the item out of the bag and fill the slot
      var item = CardAuthority.removeFromBag(bestIdx);
      if (!item) continue;

      CrateSystem.fillSlot(fx, fy, floorId, s, item);
      filled++;
    }

    if (filled === 0) return false;

    // Feedback
    AudioSystem.play('pickup', { volume: 0.4 });
    Toast.show('📦 ' + i18n.t('toast.quick_fill', 'Auto-stocked') + ' ' + filled + ' ' + i18n.t('toast.slots', 'slot' + (filled > 1 ? 's' : '')), 'info');

    // If all slots now filled → auto-seal
    if (CrateSystem.canSeal(fx, fy, floorId)) {
      var result = CrateSystem.seal(fx, fy, floorId);
      if (result) {
        AudioSystem.play('ui-confirm', { volume: 0.6 });
        Toast.show('✅ ' + i18n.t('toast.crate_sealed', 'Crate sealed!') + ' +' + result.totalCoins + 'g', 'loot');
        SessionStats.inc('cratesSealed');
      }
      return true; // Fully filled — no need to open PeekSlots
    }

    return false; // Still has empties — caller should open PeekSlots
  }

  // ── Breakable prop smash ──────────────────────────────────────────

  function _smashBreakable(fx, fy) {
    if (typeof BreakableSpawner === 'undefined') return;

    var floorData = FloorManager.getFloorData();
    var bDef = BreakableSpawner.getAt(fx, fy);
    if (!bDef) return;

    AudioSystem.play('smash', { volume: 0.7 });

    var destroyed = BreakableSpawner.hitBreakable(fx, fy, floorData.grid);

    // Depth-3+ supply crates are bolted down (DEPTH3 §3)
    if (destroyed && destroyed.blocked) {
      AudioSystem.play('ui-blop', { volume: 0.5 });
      Toast.show('\uD83D\uDD29 ' + i18n.t('toast.crate_bolted', 'This crate is bolted down. Fill it, don\'t smash it.'), 'info');
      return;
    }

    if (destroyed) {
      Toast.show(destroyed.emoji + ' ' + destroyed.name + ' ' + i18n.t('toast.smashed', 'smashed!'), 'loot');
      AudioSystem.playRandom('coin', { volume: 0.4 });  // Loot spill feedback
      SessionStats.inc('breakablesBroken');

      // ── DEPTH3 §6.3a: Auto-loot spilled drops directly ──
      // Instead of leaving walk-over items on the floor, immediately collect
      // everything _spillDrops just placed at the destroy site + adjacents.
      // Anything that fails pickup stays on the floor (existing fallback).
      if (typeof WorldItems !== 'undefined') {
        var dirs = [{ dx:0,dy:0 }, { dx:0,dy:-1 }, { dx:1,dy:0 }, { dx:0,dy:1 }, { dx:-1,dy:0 }];
        var autoCount = 0;
        for (var di = 0; di < dirs.length; di++) {
          var ax = fx + dirs[di].dx;
          var ay = fy + dirs[di].dy;
          var loot = WorldItems.pickupAt(ax, ay, floorData.grid);
          while (loot) {
            _applyPickup(loot);
            autoCount++;
            loot = WorldItems.pickupAt(ax, ay, floorData.grid);
          }
        }
      }
    }
    // If not destroyed, the prompt stays visible until HP reaches 0
  }

  // ── Detritus pickup (face+OK or walk-over) ───────────────────────

  /**
   * Collect detritus at (gx, gy).
   * - Removes the sprite from DetritusSprites cache
   * - Clears tile to EMPTY
   * - Face+OK: full item drop (auto-loot into bag via WorldItems)
   * - Walk-over: simplified pickup (battery/HP/energy based on type)
   * - Shows a toast either way
   *
   * Both paths converge here — the walk-over path just gets a simpler
   * pickup effect (no bag item, just a stat bump).
   */
  function _collectDetritus(gx, gy) {
    if (typeof DetritusSprites === 'undefined') return;

    var floorData = FloorManager.getFloorData();
    if (!floorData || !floorData.grid) return;

    var det = DetritusSprites.getAt(gx, gy);
    if (!det) return;

    // Remove from sprite cache + clear grid tile
    var removed = DetritusSprites.remove(gx, gy, floorData.grid);
    if (!removed) return;

    AudioSystem.play('pickup', { volume: 0.5 });

    // ── Determine if face+OK (interact) or walk-over ──
    var pos = MC.getGridPos();
    var isFacing = (pos.x !== gx || pos.y !== gy); // If player is NOT on the tile, they're facing it

    if (isFacing) {
      // Face + OK: full item pickup — drop the item into bag
      // Uses WorldItems to spawn a walk-over collectible at player feet
      // that's immediately picked up. This reuses the existing loot pipe.
      Toast.show(removed.detritusEmoji + ' ' + i18n.t('toast.detritus_pickup', 'Picked up') + ' ' + removed.detritusName, 'loot');

      // Spawn item drop at the tile location, then immediately collect
      if (typeof WorldItems !== 'undefined' && removed.dropItemId) {
        WorldItems.spawnAt(gx, gy, {
          type: removed.walkOverType,
          amount: removed.walkOverAmount,
          itemId: removed.dropItemId
        }, floorData.grid);
        // Auto-collect: pick it up since player just interacted deliberately
        var autoPickup = WorldItems.pickupAt(gx, gy, floorData.grid);
        if (autoPickup) _applyPickup(autoPickup);
      }
    } else {
      // Walk-over: simplified stat pickup (no bag item, just the effect)
      if (removed.walkOverType === 'food') {
        Player.heal(removed.walkOverAmount || 1);
        Toast.show(removed.detritusEmoji + ' +' + (removed.walkOverAmount || 1) + '\u2665', 'hp');
      } else if (removed.walkOverType === 'battery') {
        Player.addBattery(removed.walkOverAmount || 1);
        Toast.show(removed.detritusEmoji + ' +' + (removed.walkOverAmount || 1) + '\u25C8', 'battery');
      } else if (removed.walkOverType === 'energy') {
        if (typeof Player.restoreEnergy === 'function') Player.restoreEnergy(removed.walkOverAmount || 1);
        Toast.show(removed.detritusEmoji + ' +' + (removed.walkOverAmount || 1) + '\u26A1', 'energy');
      }
    }

    SessionStats.inc('detritusCollected');
    HUD.updatePlayer(Player.state());
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
        'Foundry steel. Accept no substitute.',
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
   * Show vendor interaction flow. Delegates to VendorDialog if available
   * (full greeting tree: Browse Wares / Buy Supplies / Sell All Junk / Leave).
   * Falls back to the legacy DialogBox → pause menu path.
   *
   * @param {string} factionId - 'tide' | 'foundry' | 'admiralty'
   */
  function _openVendorDialog(factionId) {
    _vendorVisits[factionId] = (_vendorVisits[factionId] || 0) + 1;

    AudioSystem.playRandom('coin', { volume: 0.3 });

    // ── Primary path: VendorDialog (has supply stock + bulk sell) ──
    if (typeof VendorDialog !== 'undefined') {
      var floorId = FloorManager.getCurrentFloorId();
      VendorDialog.open(factionId, floorId, {
        onBrowse: function () {
          // "Browse Wares" → open card shop via pause menu
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
    var npc = VENDOR_NPC[factionId] || VENDOR_NPC.tide;
    var visits = _vendorVisits[factionId] || 0;
    var greeting;
    if (visits <= 1) {
      greeting = i18n.t('vendor.' + factionId + '.first', npc.first);
    } else {
      var idx = (visits - 2) % npc.lines.length;
      greeting = i18n.t('vendor.' + factionId + '.' + idx, npc.lines[idx]);
    }

    DialogBox.show({
      text:     greeting,
      speaker:  npc.name,
      portrait: npc.emoji,
      priority: DialogBox.PRIORITY.DIALOGUE,
      onClose: function () {
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

    // ── Reanimation check: sealed corpse container stands back up ──
    // CorpseRegistry.reanimate() validates CrateSystem seal + suit card match internally.
    // Gate on container.sealed here so we skip the reanimate path for unsealed corpses
    // without calling into CorpseRegistry unnecessarily.
    var _corpseContainer = (typeof CrateSystem !== 'undefined')
      ? CrateSystem.getContainer(fx, fy, floorId) : null;
    var _corpseSealed = _corpseContainer && _corpseContainer.sealed;

    if (typeof CorpseRegistry !== 'undefined' && _corpseSealed) {
      var reanimData = CorpseRegistry.reanimate(fx, fy, floorId);
      if (reanimData) {
        // Clear corpse tile
        var rfd = FloorManager.getFloorData();
        if (rfd && rfd.grid[fy]) rfd.grid[fy][fx] = TILES.EMPTY;

        // Try to find the original enemy object still in _enemies (placed
        // there by CombatBridge victory handler with hp=0, spriteState='dead').
        // If found, resurrect it in-place. If not (e.g. pre-placed corpse
        // that was never a combat enemy), fall back to spawning a new NPC.
        var existingEnemy = (typeof CombatBridge !== 'undefined')
          ? CombatBridge.findDeadEnemyAt(fx, fy) : null;

        // Fire stand-up animation
        if (typeof DeathAnim !== 'undefined') {
          var canvas = document.getElementById('view-canvas');
          var cw = canvas ? canvas.width : 640;
          var ch = canvas ? canvas.height : 400;
          DeathAnim.startReanimate(reanimData.type, cw / 2, ch * 0.45, 0.6, function () {
            if (existingEnemy) {
              // Resurrect the original enemy object in-place
              CombatBridge.resurrectAsFriendly(existingEnemy);
            } else {
              // Fallback: spawn new friendly NPC (pre-placed world corpse)
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
            }
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
    if (CardAuthority.addToBag(item)) {
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

    var hand = CardAuthority.getHand();
    var card = hand[slot];
    if (!card) return;

    var result = Shop.sell(card.id);
    if (result.ok) {
      // Also remove from displayed hand
      CardAuthority.removeFromHand(slot);

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

    // Reject cards — cards have suit, _bagStored, _cardRef, or cardId
    if (item._bagStored || item.suit !== undefined ||
        item._cardRef || item.cardId !== undefined) {
      if (typeof Toast !== 'undefined') Toast.show('\uD83C\uDCCF Cards can\u2019t be equipped', 'warning');
      return;
    }

    // Auto-detect target slot from item type
    var slot = 0;  // default: weapon
    if (item.type === 'consumable' || item.subtype === 'food' || item.subtype === 'vice') slot = 1;
    if (item.type === 'key') slot = 2;

    var removed = CardAuthority.removeFromBag(bagIndex);
    if (!removed) return;
    var prev = CardAuthority.equip(slot, removed);
    if (prev) {
      CardAuthority.addToBag(prev);
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
    var item = CardAuthority.getEquipSlot(slot);
    if (!item) return;

    if (CardAuthority.getBagSize() >= CardAuthority.getMaxBag()) {
      Toast.show(i18n.t('inv.bag_full', 'Bag is full!'), 'warning');
      return;
    }
    CardAuthority.unequip(slot);
    CardAuthority.addToBag(item);
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
    var bag = CardAuthority.getBag();
    var item = bag[bagIndex];
    if (!item) return;

    if (CardAuthority.getStashSize() >= CardAuthority.MAX_STASH) {
      Toast.show(i18n.t('inv.stash_full', 'Stash is full!'), 'warning');
      return;
    }
    CardAuthority.removeFromBag(bagIndex);
    CardAuthority.addToStash(item);

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
    var stash = CardAuthority.getStash();
    var item = stash[stashIndex];
    if (!item) return;

    if (CardAuthority.getBagSize() >= CardAuthority.getMaxBag()) {
      Toast.show(i18n.t('inv.bag_full', 'Bag is full!'), 'warning');
      return;
    }
    CardAuthority.removeFromStash(stashIndex);
    CardAuthority.addToBag(item);

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
      var bag = CardAuthority.getBag();
      // Incinerate the first visible bag item (at current scroll offset)
      var item = bag[offset];
      if (!item) { Toast.show(i18n.t('inv.nothing_burn', 'Nothing to burn'), 'warning'); return; }
      CardAuthority.removeFromBag(offset);
      var refund = item.value ? Math.max(1, Math.floor(item.value * 0.1)) : 1;
      CardAuthority.addGold(refund);
      Toast.show('\uD83D\uDD25 ' + (item.emoji || '') + ' ' + (item.name || 'Item') + ' \u2192 ' + refund + 'g', 'warning');
    } else {
      // Deck focus — incinerate from backup deck
      var deckOff = (typeof MenuFaces !== 'undefined') ? MenuFaces.getDeckOffset() : 0;
      var collection = (typeof CardAuthority !== 'undefined') ? CardAuthority.getBackup() : [];
      var card = collection[deckOff];
      if (!card) { Toast.show(i18n.t('inv.nothing_burn', 'Nothing to burn'), 'warning'); return; }
      if (typeof CardAuthority !== 'undefined') CardAuthority.removeFromBackupById(card.id);
      var cardRefund = card.rarity === 'rare' ? 5 : (card.rarity === 'uncommon' ? 3 : 1);
      CardAuthority.addGold(cardRefund);
      Toast.show('\uD83D\uDD25 ' + (card.emoji || '\uD83C\uDCA0') + ' ' + (card.name || 'Card') + ' \u2192 ' + cardRefund + 'g', 'warning');
    }

    AudioSystem.play('incinerator');
    HUD.updatePlayer(Player.state());
    _refreshPanels();
  }

  // ── Deck management actions (B5.4) ────────────────────────────────

  function _handToBackup(handIndex) {
    var card = CardAuthority.removeFromHand(handIndex);
    if (!card) return;
    CardAuthority.addToBackup(card);

    var emoji = card.emoji || '\uD83C\uDCA0';
    Toast.show(emoji + ' \u2192 Backup Deck', 'info');
    if (typeof AudioSystem !== 'undefined') AudioSystem.play('card-whoosh');
    _refreshPanels();
  }

  function _backupToHand(deckIndex) {
    var backup = CardAuthority.getBackup();
    var card = backup[deckIndex];
    if (!card) return;

    var hand = CardAuthority.getHand();
    if (hand.length < CardAuthority.MAX_HAND) {
      // Hand has room — move card there
      CardAuthority.removeFromBackupById(card.id);
      CardAuthority.addToHand(card);
      var emoji = card.emoji || '\uD83C\uDCA0';
      Toast.show(emoji + ' \u2192 Hand', 'info');
      if (typeof AudioSystem !== 'undefined') AudioSystem.play('card-whoosh');
      _refreshPanels();
      return;
    }

    // Hand full — cascade to bag (EyesOnly pattern: hand → bag)
    var bagSize = (typeof CardAuthority.getBagSize === 'function')
      ? CardAuthority.getBagSize()
      : CardAuthority.getBag().length;
    if (bagSize < CardAuthority.getMaxBag()) {
      CardAuthority.removeFromBackupById(card.id);
      card._bagStored = true;
      CardAuthority.addToBag(card);
      var emoji2 = card.emoji || '\uD83C\uDCA0';
      Toast.show(emoji2 + ' \u2192 Bag', 'info');
      if (typeof AudioSystem !== 'undefined') AudioSystem.play('card-whoosh');
      _refreshPanels();
      return;
    }

    // Both full
    Toast.show(i18n.t('inv.no_space', 'No space! Hand & bag full.'), 'warning');
  }

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

    // Dispatcher grab choreography (Floor 1 gate sequence)
    if (!_gateUnlocked && _dispatcherEntity && _dispatcherPhase !== 'done') {
      _tickDispatcherChoreography(deltaMs);
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
  function requestPause(context, face, invFocus) {
    if (!ScreenManager.isPlaying()) return;
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
    interact: function () { _interact(); }
  };
})();

// ── Boot ──
window.addEventListener('DOMContentLoaded', function () {
  Game.init();
});
