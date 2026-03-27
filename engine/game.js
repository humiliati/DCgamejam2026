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

    // ── Q/E for MenuBox face rotation during pause ──
    InputManager.on('turn_left', function (type) {
      if (!ScreenManager.isPaused()) return;
      if (type === 'press') MenuBox.rotateLeft();
      if (type === 'release') MenuBox.stopRotation();
    });
    InputManager.on('turn_right', function (type) {
      if (!ScreenManager.isPaused()) return;
      if (type === 'press') MenuBox.rotateRight();
      if (type === 'release') MenuBox.stopRotation();
    });

    // ── Number keys during harvest MenuBox: take loot items ──
    for (var _k = 0; _k < 5; _k++) {
      (function (slot) {
        InputManager.on('card_' + slot, function (type) {
          if (type !== 'press') return;
          if (!ScreenManager.isPaused()) return;
          if (MenuBox.getContext() !== 'harvest') return;
          _takeHarvestItem(slot);
        });
      })(_k);
    }

    // ── Pointer click for MenuBox nav buttons (& future LG Remote) ──
    InputManager.on('pointer_click', function (type) {
      if (type !== 'press') return;
      if (ScreenManager.isPaused()) {
        MenuBox.handlePointerClick();
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

      MenuBox.open(menuContext, {
        startFace: startFace,
        onClose: function () {
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

    // Hazard system (environmental damage + bonfire respawn)
    HazardSystem.init({
      onGameOver: function () {
        ScreenManager.toGameOver();
      }
    });
    HazardSystem.clearBonfires();

    // Interact prompt
    InteractPrompt.init();

    // MenuBox face renderers
    MenuFaces.registerAll();

    // Floor transition callbacks
    FloorTransition.setCallbacks({
      onBefore: function () { MC.cancelAll(); },
      onAfter: null
    });

    // Initialize starting floor
    var startFloorId = FloorManager.floorId(1);
    FloorManager.setFloorNum(1);
    Minimap.pushFloor(startFloorId);
    Minimap.enterFloor(startFloorId, 'Entry Halls');

    // Generate first floor and wire movement callbacks
    _generateAndWire();

    // Draw initial card hand
    CardSystem.drawHand();
    HUD.updateCards(CardSystem.getHand());

    // Wire input polling
    InputPoll.init({
      isBlocked: function () {
        return !ScreenManager.isPlaying() ||
               CombatEngine.isActive() ||
               FloorTransition.isTransitioning() ||
               DialogBox.moveLocked();
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
    if (minimap) minimap.style.display = display;
    if (cardTray) cardTray.style.display = visible ? 'flex' : 'none';
    if (debugToggle) debugToggle.style.display = display;
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
    HUD.updateFloor(FloorManager.getFloorNum());
    HUD.updatePlayer(Player.state());
  }

  // ── Movement callbacks ─────────────────────────────────────────────

  function _onMoveStart(fromX, fromY, toX, toY, dir) {
    Player.setDir(dir);
    DoorContracts.tickProtect();
    AudioSystem.play('footstep');
  }

  function _onMoveFinish(x, y, dir) {
    Player.setPos(x, y);
    Player.setDir(dir);
    Minimap.reveal(x, y);

    var floorData = FloorManager.getFloorData();
    var tile = floorData.grid[y][x];

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

    CombatBridge.checkEnemyProximity(x, y);
    HUD.updatePlayer(Player.state());
  }

  function _onBump(dir) {
    AudioSystem.play('bump');
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
      // Open shop MenuBox
      _pendingMenuContext = 'shop';
      _pendingMenuFace = 0;
      ScreenManager.toPause();
    } else if (tile === TILES.CORPSE) {
      // Necro-salvage: harvest parts from the Hero's mess
      _harvestCorpse(fx, fy);
    }
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
      AudioSystem.play('item_pickup');
      HUD.updatePlayer(Player.state());
      SessionStats.inc('partsHarvested');
    } else {
      Toast.show(i18n.t('toast.bag_full', 'Bag is full!'), 'warning');
      // Put item back — can't take it
      loot.splice(slot, 0, item);
    }

    // If no loot left, clean up the corpse tile and close the MenuBox
    if (Salvage.getStagedLoot().length === 0) {
      var corpse = Salvage.getStagedCorpse();
      if (corpse) {
        var fd = FloorManager.getFloorData();
        if (fd && fd.grid[corpse.y] && fd.grid[corpse.y][corpse.x] === TILES.CORPSE) {
          fd.grid[corpse.y][corpse.x] = TILES.EMPTY;
        }
      }
      Salvage.closeLoot();
      // Auto-close the harvest MenuBox
      MenuBox.close();
    }
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
      _renderGameplay(frameDt);

      // UI overlays (after world, before HUD z-layer)
      var ctx = _canvas.getContext('2d');
      TransitionFX.update(frameDt);
      TransitionFX.render(ctx, _canvas.width, _canvas.height);
      CardFan.update(frameDt);
      CardFan.render(ctx, _canvas.width, _canvas.height);
      InteractPrompt.check();
      InteractPrompt.update(frameDt);
      InteractPrompt.render(ctx, _canvas.width, _canvas.height);
      DialogBox.update(frameDt);
      DialogBox.render(ctx, _canvas.width, _canvas.height);
      Toast.update(frameDt);
      Toast.render(ctx, _canvas.width, _canvas.height);
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

    // Build sprite list
    var enemies = FloorManager.getEnemies();
    _sprites.length = 0;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hp <= 0) continue;
      var aState = EnemyAI.getAwarenessState(e.awareness);
      _sprites.push({
        x: e.x, y: e.y,
        emoji: e.emoji,
        color: aState.color,
        scale: e.isElite ? 0.8 : 0.6
      });
    }

    // Tick door-open animation (before raycaster reads its state)
    if (typeof DoorAnimator !== 'undefined') DoorAnimator.update(frameDt);

    // Raycaster render
    Raycaster.render(
      { x: renderPos.x, y: renderPos.y, dir: renderPos.angle + p.lookOffset },
      floorData.grid, floorData.gridW, floorData.gridH,
      _sprites, lightMap
    );

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
