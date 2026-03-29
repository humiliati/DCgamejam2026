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

  // ── Initialization ─────────────────────────────────────────────────

  function init() {
    _canvas = document.getElementById('view-canvas');

    // ── Phase 1: Core systems (always needed) ──
    LootTables.init();   // Sync-load data/loot-tables.json before floor gen
    TextureAtlas.init();
    UISprites.init();
    if (typeof DoorAnimator !== 'undefined') DoorAnimator.init();
    Skybox.init();
    Raycaster.init(_canvas);
    InputManager.init();
    InputManager.initPointer(_canvas);
    AudioSystem.init();

    // Wire BarkLibrary display function — routes picks to Toast by default,
    // falling back gracefully if Toast is unavailable.
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
        } else if (typeof Toast !== 'undefined') {
          // For toast barks, prefix the speaker name inline if present.
          var text = bark.speaker
            ? bark.speaker + ': ' + bark.text
            : bark.text;
          Toast.show(text, style === 'dialog' ? 'info' : style);
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
    if (typeof StatusBar !== 'undefined') StatusBar.init();
    if (typeof QuickBar !== 'undefined') QuickBar.init();
    if (typeof InteractPrompt !== 'undefined') InteractPrompt.init();

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
    // Strafe (Q/E) — rotate box, OR scroll inventory wheel on Face 2.
    InputManager.on('strafe_left', function (type) {
      if (!ScreenManager.isPaused()) return;
      // Face 2 (Inventory): Q scrolls focused wheel left
      if (type === 'press' && MenuBox.getCurrentFace() === 2 && typeof MenuFaces !== 'undefined') {
        MenuFaces.scrollFocused(-1);
        return;
      }
      if (type === 'press') MenuBox.rotateLeft();
      if (type === 'release') MenuBox.stopRotation();
    });
    InputManager.on('strafe_right', function (type) {
      if (!ScreenManager.isPaused()) return;
      // Face 2 (Inventory): E scrolls focused wheel right
      if (type === 'press' && MenuBox.getCurrentFace() === 2 && typeof MenuFaces !== 'undefined') {
        MenuFaces.scrollFocused(+1);
        return;
      }
      if (type === 'press') MenuBox.rotateRight();
      if (type === 'release') MenuBox.stopRotation();
    });

    // Turn (A/← and D/→) — rotate box OR adjust Face 3 slider.
    InputManager.on('turn_left', function (type) {
      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3) {
        // On settings face: ← decrements the selected slider
        if (type === 'press' && typeof MenuFaces !== 'undefined') {
          MenuFaces.handleSettingsAdjust(-10);
        }
        return; // Never rotate the box from Face 3 via turn keys
      }
      if (type === 'press') MenuBox.rotateLeft();
      if (type === 'release') MenuBox.stopRotation();
    });
    InputManager.on('turn_right', function (type) {
      if (!ScreenManager.isPaused()) return;
      if (MenuBox.getCurrentFace() === 3) {
        // On settings face: → increments the selected slider
        if (type === 'press' && typeof MenuFaces !== 'undefined') {
          MenuFaces.handleSettingsAdjust(+10);
        }
        return;
      }
      if (type === 'press') MenuBox.rotateRight();
      if (type === 'release') MenuBox.stopRotation();
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

    // Enemy sprite stage system
    if (typeof EnemySprites !== 'undefined') EnemySprites.initDefaults();

    // Load enemy population tables from enemies.json
    if (typeof EnemyAI !== 'undefined' && EnemyAI.loadPopulation) EnemyAI.loadPopulation();

    // NPC system — register built-in populations (bark pools loaded at Layer 5)
    if (typeof NpcSystem !== 'undefined') NpcSystem.init();

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
      onBefore: function () { MC.cancelAll(); },
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
    // Cancel any running ambient bark timer from the previous floor
    if (_ambientBarkTimer !== null) {
      clearInterval(_ambientBarkTimer);
      _ambientBarkTimer = null;
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
  }

  /**
   * Check whether the tile at (fx, fy) on the current floor is the
   * work-keys chest on Floor 1.6. Called from _interact().
   */
  function _checkWorkKeysChest(fx, fy) {
    return !_gateUnlocked
      && FloorManager.getFloor() === '1.6'
      && fx === 5 && fy === 3;
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
    HUD.updateFloor(FloorManager.getFloor());
    HUD.updatePlayer(Player.state());
    if (typeof StatusBar !== 'undefined') {
      StatusBar.updateFloor(FloorManager.getFloor(), FloorManager.getBiomeName ? FloorManager.getBiomeName() : '');
    }
    _refreshPanels();
  }

  // ── Movement callbacks ─────────────────────────────────────────────

  function _onMoveStart(fromX, fromY, toX, toY, dir) {
    Player.setDir(dir);
    DoorContracts.tickProtect();
    AudioSystem.playRandom('step-left', { volume: 0.35 });
  }

  function _onMoveFinish(x, y, dir) {
    Player.setPos(x, y);
    Player.setDir(dir);
    Minimap.reveal(x, y);

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
    if (!_gateUnlocked && typeof BarkLibrary !== 'undefined') {
      var pos = MC.getGridPos();
      var bumpX = pos.x + MC.DX[dir];
      var bumpY = pos.y + MC.DY[dir];
      var enemies = FloorManager.getEnemies();
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.id === _dispatcherSpawnId && e.x === bumpX && e.y === bumpY) {
          // First bump: play intro + direction bark. Subsequent bumps: nudge.
          var introKey = 'npc.dispatcher.gate.intro';
          var bark = BarkLibrary.hasPool(introKey) ? BarkLibrary.fire(introKey) : null;
          if (!bark) {
            // Intro spent — fire direction hint once, then nudge
            var dirKey = 'npc.dispatcher.gate.direction';
            bark = BarkLibrary.hasPool(dirKey) ? BarkLibrary.fire(dirKey) : null;
          }
          if (!bark) {
            BarkLibrary.fire('npc.dispatcher.gate.nudge');
          }
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

    var tile = floorData.grid[fy][fx];
    if (tile === TILES.CHEST) {
      CombatBridge.openChest(fx, fy);
    } else if (tile === TILES.BONFIRE) {
      // Rest at bonfire (heal) then open the stash MenuBox
      HazardSystem.restAtBonfire(fx, fy);
      _pendingMenuContext = 'bonfire';
      _pendingMenuFace = 0;
      ScreenManager.toPause();
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
        var floorId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '1.1.1';
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
      HUD.updatePlayer(Player.state());
      if (typeof DebriefFeed !== 'undefined') DebriefFeed.logEvent('Sold ' + card.emoji + ' +' + result.amount + 'g', 'loot');

      // Rep tier changed — show toast
      if (result.repResult && result.repResult.tierChanged) {
        var fLabel = Shop.getFactionLabel(Shop.getCurrentFaction());
        Toast.show(fLabel + ' Rep Tier ' + result.repResult.newTier + '!', 'info');
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
      HUD.updatePlayer(Player.state());
      if (typeof DebriefFeed !== 'undefined') DebriefFeed.logEvent('Sold ' + item.emoji + ' +' + result.amount + 'g', 'loot');

      // Rep tier changed — show toast
      if (result.repResult && result.repResult.tierChanged) {
        var fLabel = Shop.getFactionLabel(Shop.getCurrentFaction());
        Toast.show(fLabel + ' Rep Tier ' + result.repResult.newTier + '!', 'info');
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
      if (typeof DoorPeek        !== 'undefined') DoorPeek.update(frameDt);
      if (typeof LockedDoorPeek !== 'undefined') LockedDoorPeek.update(frameDt);
      if (typeof CratePeek     !== 'undefined') CratePeek.update(frameDt);
      if (typeof ChestPeek    !== 'undefined') ChestPeek.update(frameDt);
      if (typeof CorpsePeek   !== 'undefined') CorpsePeek.update(frameDt);
      if (typeof MerchantPeek !== 'undefined') MerchantPeek.update(frameDt);
      if (typeof PuzzlePeek   !== 'undefined') PuzzlePeek.update(frameDt);
      if (typeof BookshelfPeek !== 'undefined') BookshelfPeek.update(frameDt);
      if (typeof BarCounterPeek !== 'undefined') BarCounterPeek.update(frameDt);

      // PeekSlots update (SEALED auto-dismiss timer + zone bounds sync)
      if (typeof PeekSlots !== 'undefined') PeekSlots.update(frameDt);
      DialogBox.update(frameDt);
      DialogBox.render(ctx, _canvas.width, _canvas.height);
      Toast.update(frameDt);
      Toast.render(ctx, _canvas.width, _canvas.height);

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

      _sprites.push({
        x: e.x, y: e.y,
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
      var floorId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '1.1.1';
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
      { x: renderPos.x, y: renderPos.y, dir: renderPos.angle + p.lookOffset },
      floorData.grid, floorData.gridW, floorData.gridH,
      _sprites, lightMap
    );

    if (combatZoom !== 1) ctx.restore();

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
    requestPause: requestPause
  };
})();

// ── Boot ──
window.addEventListener('DOMContentLoaded', function () {
  Game.init();
});