/**
 * Game — thin orchestrator.
 *
 * Wires all engine modules together: init sequence, tick loop,
 * render loop, and inter-module callbacks. Contains NO game logic
 * of its own — every concern is delegated to a focused module:
 *
 *   Player          — entity state, stats, direction helpers
 *   FloorManager    — floor gen, caching, biome, contracts
 *   FloorTransition — SFX-sequenced transition state machine
 *   InputPoll       — movement + action input polling
 *   MouseLook       — free-look offset from mouse/pointer
 *   CombatBridge    — combat, cards, chests, game over
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

  // ── Initialization ─────────────────────────────────────────────────

  function init() {
    var canvas = document.getElementById('view-canvas');

    // Core systems
    Raycaster.init(canvas);
    Minimap.init(document.getElementById('minimap'));
    HUD.init();
    InputManager.init();
    InputManager.initPointer(canvas);
    CardSystem.init();
    AudioSystem.init();
    MouseLook.init(canvas);

    // Combat bridge
    CombatBridge.init({
      onGameOver: function () { GameLoop.stop(); }
    });

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
        return CombatEngine.isActive() || FloorTransition.isTransitioning();
      },
      onInteract: _interact,
      onDescend:  function () { FloorTransition.tryStairs('down'); },
      onAscend:   function () { FloorTransition.tryStairs('up'); },
      onMapToggle: function () { Minimap.toggle(); },
      onCard:     function (idx) { CombatBridge.playCard(idx); }
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

    // Start game loop
    _lastFrameTime = performance.now();
    GameLoop.init({
      onTick: _tick,
      onRender: _render,
      tickInterval: 100
    });
    GameLoop.start();

    console.log('[Game] Initialized — WASD to move, Q/E turn, 1-5 for cards');
  }

  // ── Floor generation + MC wiring ───────────────────────────────────

  function _generateAndWire() {
    var spawn = FloorManager.generateCurrentFloor();

    // Re-init MC with orchestrator callbacks (FloorManager sets
    // collision check internally, but we need move/bump/turn hooks)
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

    // Check tile interactions
    var floorData = FloorManager.getFloorData();
    var tile = floorData.grid[y][x];
    if (tile === TILES.CHEST) {
      CombatBridge.openChest(x, y);
    }

    // Check enemy proximity
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

    // Try stairs first (transition handles the rest)
    if (FloorTransition.tryInteractStairs(fx, fy)) return;

    // Try chest
    var tile = floorData.grid[fy][fx];
    if (tile === TILES.CHEST) {
      CombatBridge.openChest(fx, fy);
    }
  }

  // ── Tick (game logic at 10fps — enemies, aggro) ────────────────────

  function _tick(deltaMs) {
    if (CombatEngine.isActive() || FloorTransition.isTransitioning()) return;

    var floorData = FloorManager.getFloorData();
    var enemies = FloorManager.getEnemies();
    var p = Player.state();

    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].hp <= 0) continue;
      EnemyAI.updateEnemy(enemies[i], p, floorData.grid, floorData.gridW, floorData.gridH, deltaMs);
    }

    // Enemy-initiated combat
    CombatBridge.checkEnemyAggro(p.x, p.y);
  }

  // ── Render (every frame — input, movement, draw) ───────────────────

  function _render(alpha) {
    var floorData = FloorManager.getFloorData();
    if (!floorData) return;

    var now = performance.now();
    var frameDt = now - _lastFrameTime;
    _lastFrameTime = now;
    if (frameDt > 100) frameDt = 100;

    // Poll input → drives MovementController
    InputPoll.poll();

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
      var state = EnemyAI.getAwarenessState(e.awareness);
      _sprites.push({
        x: e.x, y: e.y,
        emoji: e.emoji,
        color: state.color,
        scale: e.isElite ? 0.8 : 0.6
      });
    }

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
