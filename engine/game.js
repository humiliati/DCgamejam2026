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

  // Canvas reference (shared by screens)
  var _canvas = null;

  // Whether gameplay systems have been initialized (deferred until first play)
  var _gameplayReady = false;

  // Pending MenuBox context for next pause transition
  var _pendingMenuContext = null;
  var _pendingMenuFace = null;

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
    if (typeof DebriefFeed !== 'undefined') DebriefFeed.init();
    if (typeof StatusBar !== 'undefined') StatusBar.init();
    if (typeof QuickBar !== 'undefined') QuickBar.init();
    if (typeof InteractPrompt !== 'undefined') InteractPrompt.init();

    // ── Phase 3: ScreenManager transition wiring ──
    ScreenManager.onChange(_onScreenChange);

    // ── ESC toggle: pause ↔ gameplay ──
    InputManager.on('pause', function (type) {
      if (type !== 'press') return;
      var state = ScreenManager.getState();
      if (state === ScreenManager.STATES.GAMEPLAY) {
        _pendingMenuContext = 'pause';
        _pendingMenuFace = 0;
        ScreenManager.toPause();
      } else if (state === ScreenManager.STATES.PAUSE) {
        MenuBox.close(); // onClose callback will resumeGameplay()
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
    // Strafe (Q/E) — primary box rotation keys; always rotate.
    InputManager.on('strafe_left', function (type) {
      if (!ScreenManager.isPaused()) return;
      if (type === 'press') MenuBox.rotateLeft();
      if (type === 'release') MenuBox.stopRotation();
    });
    InputManager.on('strafe_right', function (type) {
      if (!ScreenManager.isPaused()) return;
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
    for (var _k = 0; _k < 5; _k++) {
      (function (slot) {
        InputManager.on('card_' + slot, function (type) {
          if (type !== 'press') return;
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

      MenuBox.open(menuContext, {
        startFace: startFace,
        onClose: function () {
          if (typeof Shop !== 'undefined') Shop.close();
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

    // Interact prompt + door/crate/chest peek
    InteractPrompt.init();
    if (typeof DoorPeek  !== 'undefined') DoorPeek.init();
    if (typeof CratePeek !== 'undefined') CratePeek.init();
    if (typeof ChestPeek !== 'undefined') ChestPeek.init();

    // Enemy sprite stage system
    if (typeof EnemySprites !== 'undefined') EnemySprites.initDefaults();

    // NCH widget (draggable card-hand capsule)
    if (typeof NchWidget !== 'undefined') NchWidget.init();

    // Combat report overlay
    if (typeof CombatReport !== 'undefined') CombatReport.init();

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
               (typeof IntroWalk !== 'undefined' && IntroWalk.isActive());
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
    var hud = document.getElementById('hud');
    var minimap = document.getElementById('minimap');
    var cardTray = document.getElementById('card-tray');
    var debugToggle = document.getElementById('debug-toggle');

    if (hud) hud.style.display = display;
    // Minimap respects its own toggle state — only force-hide on HUD off
    if (minimap) minimap.style.display = visible ? (Minimap.isVisible() ? 'block' : 'none') : 'none';
    if (cardTray) cardTray.style.display = visible ? 'flex' : 'none';
    if (debugToggle) debugToggle.style.display = display;

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

  // ── Floor generation + MC wiring ───────────────────────────────────

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
      // Necro-salvage: harvest parts from the Hero's mess
      _harvestCorpse(fx, fy);
    } else if (tile === TILES.BREAKABLE) {
      // Smash the breakable prop — BreakableSpawner handles HP + loot spill
      _smashBreakable(fx, fy);
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

    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].hp <= 0) continue;
      EnemyAI.updateEnemy(enemies[i], p, floorData.grid, floorData.gridW, floorData.gridH, deltaMs);
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
      if (typeof DoorPeek  !== 'undefined') DoorPeek.update(frameDt);
      if (typeof CratePeek !== 'undefined') CratePeek.update(frameDt);
      if (typeof ChestPeek !== 'undefined') ChestPeek.update(frameDt);
      DialogBox.update(frameDt);
      DialogBox.render(ctx, _canvas.width, _canvas.height);
      Toast.update(frameDt);
      Toast.render(ctx, _canvas.width, _canvas.height);

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
      var spriteGlow = null;
      var spriteGlowR = 0;
      var spriteTint = null;
      var spriteParticle = null;
      var spriteOverlay = null;
      var spriteBobY = 0;
      var spriteScaleAdd = 0;
      if (typeof EnemySprites !== 'undefined' && e.spriteState) {
        var frame = EnemySprites.computeFrame(e, now);
        spriteEmoji = frame.emoji;
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

  return {
    init: init,
    toggleMinimap: function () { Minimap.toggle(); }
  };
})();

// ── Boot ──
window.addEventListener('DOMContentLoaded', function () {
  Game.init();
});
