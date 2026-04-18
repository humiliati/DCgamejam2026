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

  // EmojiMount instance-registration tracker. Holds the floor id
  // most recently registered so we only replay the windowScenes →
  // EmojiMount.registerAt migration once per floor transition. On
  // change, clearFloor(prev) drops stale instance mounts (so the
  // Promenade's 🍺 vignettes don't linger when descending into the
  // Bazaar). See Phase 6 (LIVING_WINDOWS_ROADMAP §4.6).
  var _lastEmojiMountFloor = null;

  /**
   * Migrate floorData.windowScenes declarations into per-coord
   * EmojiMount instance mounts for the given floor. Runs once per
   * floor transition from the render loop. Each scene entry becomes
   * a cavity-anchored billboard at facade + interiorStep with
   * vignette recipe resolved from BuildingRegistry.
   *
   * The per-tile yAlt table mirrors the legacy WindowSprites ladder
   * (shop 0.125, commercial 1.125, alcove 0.30, bay 0.40, slit 0.60,
   * default 0.275) so visual placement stays identical to Phase 2.
   * Recess defaults to 1.0 — the old `perpDist + 1.0` z-bypass
   * the retired `zBypassMode: 'depth'` field hardcoded.
   */
  function _registerWindowSceneMounts(floorId, floorData) {
    if (!floorData || !floorData.windowScenes || typeof EmojiMount === 'undefined') return;
    if (!EmojiMount.registerAt) return;
    var scenes = floorData.windowScenes;
    var grid   = floorData.grid;
    // Defaults for when a scene omits vignette (or BuildingRegistry
    // has no matching recipe). Match the legacy WindowSprites.INTERIOR
    // config so unconfigured windows still render a 🍺 vignette.
    var DEFAULT_EMOJI  = '\uD83C\uDF7A'; // 🍺
    var DEFAULT_SCALE  = 0.42;
    var DEFAULT_GLOW   = '#ffaa33';
    var DEFAULT_RADIUS = 2;
    for (var i = 0; i < scenes.length; i++) {
      var scene = scenes[i];
      if (!scene || !scene.facade) continue;
      var fx = scene.facade.x;
      var fy = scene.facade.y;
      // ARROWSLIT / MURDERHOLE are pure stone cuts — skip vignette.
      // The gap filler handles the visual; no billboard emission.
      var tile = (grid && grid[fy]) ? grid[fy][fx] : 0;
      if (typeof TILES !== 'undefined' &&
          (tile === TILES.WINDOW_ARROWSLIT || tile === TILES.WINDOW_MURDERHOLE)) {
        continue;
      }
      // Vignette recipe from BuildingRegistry (or defaults).
      var vKey  = scene.vignette || null;
      var vData = null;
      if (vKey && typeof BuildingRegistry !== 'undefined' && BuildingRegistry.getVignette) {
        vData = BuildingRegistry.getVignette(vKey);
      }
      var emoji = vData ? vData.emoji      : DEFAULT_EMOJI;
      var scale = vData ? vData.scale      : DEFAULT_SCALE;
      var glow  = vData ? vData.glow       : DEFAULT_GLOW;
      var glowR = vData ? vData.glowRadius : DEFAULT_RADIUS;
      // Per-tile cavity altitude (matches legacy WindowSprites ladder).
      var bldgId = scene.building || null;
      var bldg   = (bldgId && typeof BuildingRegistry !== 'undefined' && BuildingRegistry.get)
                 ? BuildingRegistry.get(bldgId) : null;
      // Per-tile cavity altitude. 2026-04-14 tweak: dropped every
      // value by 0.25 world units so the vignette sits about half a
      // bar lower on the SpatialDebug Y-ruler — the post-port
      // sprites were reading too high (appeared to "float above" the
      // glass slot from across the map) even though they were
      // geometrically inside the cavity. The shift settles the
      // emoji into the bottom half of the glass so it reads as
      // "content on a counter / shelf behind the window" instead of
      // "content floating mid-pane."
      var wType  = bldg ? bldg.windowType : null;
      var yAlt   = 0.025;                   // shop / tavern default (was 0.275)
      if (wType === 'bay')  yAlt = 0.15;    // (was 0.40)
      if (wType === 'slit') yAlt = 0.35;    // (was 0.60)
      if (typeof TILES !== 'undefined') {
        if (tile === TILES.WINDOW_ALCOVE)     yAlt = 0.05;   // (was 0.30)
        if (tile === TILES.WINDOW_SHOP)       yAlt = -0.125; // (was 0.125)
        if (tile === TILES.WINDOW_COMMERCIAL) yAlt = 0.875;  // (was 1.125)
      }
      // Billboard emission position: one tile inside the facade
      // behind the glass. The instance is KEYED by the facade tile
      // (fx,fy) so the raycaster's z-bypass resolves at the tile
      // the ray actually hits, but the sprite emits at (sprX,sprY).
      var sprX = fx + (scene.interiorStep ? scene.interiorStep.dx : 0);
      var sprY = fy + (scene.interiorStep ? scene.interiorStep.dy : 0);
      EmojiMount.registerAt(floorId, fx, fy, {
        emoji:      emoji,
        scale:      scale,
        glow:       glow,
        glowRadius: glowR,
        anchor:     'cavity',
        lift:       yAlt,
        // Recess 1.5 — the z-threshold (perpDist + recess) must be
        // STRICTLY greater than the sprite's distance for it to pass
        // the `zBuffer[col] > dist` test in raycaster-sprites. The
        // sprite emits at (facade + interiorStep) which is one tile
        // deeper than the key (fx,fy), so spriteDist ≈ perpDist + 1.0.
        // Recess 1.0 (what the retired zBypassMode='depth' hardcoded)
        // sat EXACTLY at sprite distance — the strict-greater test
        // failed on the glass-tile columns and the sprite only
        // rendered on side columns that spilled past the tile's
        // footprint, producing the "emoji floats on glass from far,
        // vanishes up close" bug. 1.5 puts the threshold a half-tile
        // past the sprite center so every column passes cleanly at
        // every approach distance.
        recess:     1.5,
        noFogFade:  false,
        // Hard render-distance cap. Shrubs and half-walls between the
        // player and a facade don't write the z-buffer (they're
        // freeform / transparent), so the vignette sprite would
        // otherwise read through them from across the map. 10 tiles
        // is just beyond the typical street-crossing sightline from
        // Gleaner's Home to the Tavern — close enough to see the
        // mug as you approach, far enough that the two-shrub gauntlet
        // obscures it before that line opens up.
        maxDist:    10,
        sprX:       sprX,
        sprY:       sprY
      });
    }
  }

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

    // ?seed=LANTERN-DRAGON-SCAR-a7c3 URL-param handler. Decodes and stashes on
    // window._pendingRunSeed for TitleScreen.deploy to consume. Invalid phrases
    // fall back to a random seed with a console warning. See M1 in
    // tools/short-roadmap.md.
    if (typeof SeedPhrase !== 'undefined' && typeof window !== 'undefined' && window.location) {
      try {
        var qs = window.location.search || '';
        var m = qs.match(/[?&]seed=([^&]+)/);
        if (m) {
          var phrase = decodeURIComponent(m[1]);
          var decoded = SeedPhrase.decode(phrase);
          if (decoded != null) {
            window._pendingRunSeed = decoded;
            console.log('[Game.init] ?seed= accepted: ' + phrase + ' → 0x' + decoded.toString(16));
          } else {
            console.warn('[Game.init] ?seed= phrase did not decode: ' + phrase + ' (random seed will be used)');
          }
        }
      } catch (e) {
        console.warn('[Game.init] ?seed= parse error', e);
      }
    }

    // Wire shared helpers module
    GameActions.init({ canvas: _canvas, gateUnlocked: _gateUnlocked });

    // Wire Phase 2 extracted modules
    if (typeof HomeEvents !== 'undefined') {
      HomeEvents.init({
        isGateUnlocked: _gateUnlocked,
        onKeysPickedUp: function () {
          // DOC-107 Phase 1: fan out to QuestChain before the legacy
          // marker refresh. Order matters — item event first so any
          // quest step keyed on the raw 'work_keys' card advances
          // before steps gated on the gateUnlocked flag.
          if (typeof QuestChain !== 'undefined') {
            QuestChain.onItemAcquired('work_keys');
            QuestChain.onFlagChanged('gateUnlocked', true);
          }
          _updateQuestTarget();
        }
      });
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
        changeState: function (state) { _changeState(state === 'GAME_OVER' ? S.GAME_OVER : S.GAME_OVER); },
        // DOC-109 Phase 4: on the *first* BPRD dispatcher debrief,
        // reveal the relationships category in the debrief feed and
        // seed BPRD's faction favor to the "friendly" band. Re-talks
        // (firstTime === false) are no-ops — the sticky reveal gate
        // in DebriefFeed._categories keeps the section open across
        // pause/resume cycles once it has been revealed.
        onComplete: function (firstTime) {
          if (!firstTime) return;
          if (typeof DebriefFeed !== 'undefined' && DebriefFeed.revealCategory) {
            DebriefFeed.revealCategory('relationships');
          }
          if (typeof ReputationBar !== 'undefined' && ReputationBar.addSubjectFavor) {
            ReputationBar.addSubjectFavor('faction', 'bprd', 100);
          }
        }
      });
    }
    // DOC-107 Phase 1: QuestWaypoint.init(...) is now a no-op shim —
    // the dispatcher callback wiring lives in QuestChain.init(opts)
    // further down in this file. No init call needed here.

    // ── Phase 1: Core systems (always needed) ──
    if (typeof ItemDB !== 'undefined') ItemDB.init();  // Sync-load data/items.json
    LootTables.init();   // Sync-load data/loot-tables.json before floor gen
    TextureAtlas.init();
    UISprites.init();
    if (typeof SpriteSheet !== 'undefined') SpriteSheet.preloadAll();
    if (typeof DoorAnimator !== 'undefined') DoorAnimator.init();
    Skybox.init();
    Raycaster.init(_canvas);
    if (typeof SpriteLayer !== 'undefined') {
      SpriteLayer.init(_canvas.parentElement);
    }
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
      if (StatusBar.setOnReel) {
        StatusBar.setOnReel(function () {
          if (typeof HoseState === 'undefined' || !HoseState.isActive()) return;
          if (typeof HoseReel === 'undefined') return;
          if (HoseReel.isActive()) return;
          HoseReel.start();
        });
      }
    }
    if (typeof QuickBar !== 'undefined') QuickBar.init();
    if (typeof InteractPrompt !== 'undefined') InteractPrompt.init();

    // ── PW-2: Hose drain loop (FATIGUE, not energy) ──────────────
    // HoseState is a pure data module — it doesn't touch Player. We wire
    // the fatigue drain here so the coupling point is visible in one place.
    // Each movement step: recordStep emits 'step' with drainThisStep which
    // we add to Player.fatigue. If fatigue >= max, detach with
    // 'fatigue_exhausted' so HoseReel/Viewport can clean up.
    if (typeof HoseState !== 'undefined' && HoseState.on) {
      HoseState.on('step', function (_tile, _pathLen) {
        if (typeof Player === 'undefined') return;
        // The drain for the step just recorded = total drained − prior snapshot.
        var total = HoseState.getEnergyDrained(); // note: hose-state still calls it "energy" internally
        var prior = _hoseEnergyPrior || 0;
        var dStep = total - prior;
        _hoseEnergyPrior = total;
        if (dStep <= 0) return;
        var drain = Math.max(0.5, dStep); // keep fractional for smooth accumulator
        Player.drainHoseFatigue(drain);
        // Report to debrief feed
        if (typeof DebriefFeedController !== 'undefined' && DebriefFeedController.reportResourceChange) {
          var fat = Player.getFatigue();
          DebriefFeedController.reportResourceChange('Fatigue', fat - 1, fat, 'Hose');
        }
        if (!Player.canHose()) {
          HoseState.detach('fatigue_exhausted');
          if (typeof Toast !== 'undefined') Toast.show('💨 Hose slipped — too exhausted', 'warning');
        }
      });
      HoseState.on('attach', function () {
        _hoseEnergyPrior = 0;
        // Shared action button: show REEL while hose is active
        if (typeof StatusBar !== 'undefined' && StatusBar.setHoseActive) {
          StatusBar.setHoseActive(true);
        }
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
        // Shared action button: restore pause when hose drops
        if (typeof StatusBar !== 'undefined' && StatusBar.setHoseActive) {
          StatusBar.setHoseActive(false);
        }
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

      // PF-5: MinigameExit is always first responder when a captured-input
      // minigame owns the viewport. First Back/Escape arms the confirm prompt;
      // second commits the exit. Consumes the keypress so pause never fires
      // while a minigame is live — exiting a minigame must be an explicit act.
      if (typeof MinigameExit !== 'undefined' && MinigameExit.isActive()) {
        if (MinigameExit.handleKey('Escape')) return;
      }

      // PeekShell intercept: a mounted peek/tableau consumes Escape to close
      // itself rather than letting the pause screen cover it. See
      // docs/MINIGAME_ROADMAP.md §0.3 — captures:false surfaces still dismiss
      // on Escape; captures:true surfaces route through MinigameExit above.
      if (typeof PeekShell !== 'undefined' && PeekShell.isActive()) {
        if (PeekShell.handleKey('Escape')) return;
      }

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
        // Shop context: toggle SlotWheel focus (bag ↔ deck)
        if (MenuBox.getContext() === 'shop') {
          MenuFaces.toggleShopSellFocus();
        } else {
          MenuFaces.toggleInvFocus();
        }
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
      // Face 2: Q scrolls focused wheel left
      if (MenuBox.getCurrentFace() === 2 && typeof MenuFaces !== 'undefined') {
        if (MenuBox.getContext() === 'shop') {
          MenuFaces.scrollShopSellWheel(-1);
        } else {
          MenuFaces.scrollFocused(-1);
        }
        return;
      }
      MenuBox.snapLeft();
    });
    InputManager.on('strafe_right', function (type) {
      if (type !== 'press' || !ScreenManager.isPaused()) return;
      // Face 2: E scrolls focused wheel right
      if (MenuBox.getCurrentFace() === 2 && typeof MenuFaces !== 'undefined') {
        if (MenuBox.getContext() === 'shop') {
          MenuFaces.scrollShopSellWheel(+1);
        } else {
          MenuFaces.scrollFocused(+1);
        }
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
          } else if (hit.action === 'deck_sort_cycle') {
            if (typeof MenuFaces !== 'undefined') MenuFaces.cycleDeckSort();
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
          } else if (hit.action === 'quest_scroll_up') {
            // Phase 2.1a — completed-quest pane scroll up
            if (typeof MenuFaces !== 'undefined' && MenuFaces.scrollQuestCompleted) {
              MenuFaces.scrollQuestCompleted(-1);
            }
          } else if (hit.action === 'quest_scroll_down') {
            // Phase 2.1a — completed-quest pane scroll down
            if (typeof MenuFaces !== 'undefined' && MenuFaces.scrollQuestCompleted) {
              MenuFaces.scrollQuestCompleted(+1);
            }
          } else if (hit.action === 'read_quest_completed') {
            // Phase 2.1a — open quest-detail DialogBox for a completed
            // quest row (mirrors the read_book pattern above). Pulls
            // title/summary/rewards from QuestChain.getJournalEntries.
            var qTargetId = hit.questId;
            if (qTargetId && typeof QuestChain !== 'undefined' && QuestChain.getJournalEntries) {
              var qCompList = QuestChain.getJournalEntries({ active: false, completed: true }) || [];
              var qRec = null;
              for (var qli = 0; qli < qCompList.length; qli++) {
                if (qCompList[qli].id === qTargetId) { qRec = qCompList[qli]; break; }
              }
              if (qRec) {
                if (typeof MenuBox !== 'undefined' && MenuBox.close) MenuBox.close();
                if (typeof DialogBox !== 'undefined' && DialogBox.show) {
                  var qT = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t(qRec.title, qRec.title) : qRec.title;
                  var qS = qRec.summary
                    ? ((typeof i18n !== 'undefined' && i18n.t) ? i18n.t(qRec.summary, qRec.summary) : qRec.summary)
                    : '';
                  var qMsg = '\u2713 ' + qT + '\n\n' + qS;
                  if (qRec.rewards) {
                    var rw = [];
                    if (qRec.rewards.gold) rw.push(qRec.rewards.gold + 'g');
                    if (qRec.rewards.items && qRec.rewards.items.length) rw.push(qRec.rewards.items.length + ' items');
                    if (qRec.rewards.favor) {
                      var fk = Object.keys(qRec.rewards.favor);
                      for (var qfk = 0; qfk < fk.length; qfk++) {
                        rw.push(fk[qfk] + ' +' + qRec.rewards.favor[fk[qfk]]);
                      }
                    }
                    if (rw.length) qMsg += '\n\nRewards: ' + rw.join(', ');
                  }
                  DialogBox.show(qMsg, { priority: 2 });
                }
              }
            }
          } else if (hit.action === 'quest_active_scroll_up') {
            // Phase 2.1b — active-quest pane scroll up
            if (typeof MenuFaces !== 'undefined' && MenuFaces.scrollQuestActive) {
              MenuFaces.scrollQuestActive(-1);
            }
          } else if (hit.action === 'quest_active_scroll_down') {
            // Phase 2.1b — active-quest pane scroll down
            if (typeof MenuFaces !== 'undefined' && MenuFaces.scrollQuestActive) {
              MenuFaces.scrollQuestActive(+1);
            }
          } else if (hit.action === 'quest_failed_scroll_up') {
            // Phase 2.1b — failed-quest pane scroll up
            if (typeof MenuFaces !== 'undefined' && MenuFaces.scrollQuestFailed) {
              MenuFaces.scrollQuestFailed(-1);
            }
          } else if (hit.action === 'quest_failed_scroll_down') {
            // Phase 2.1b — failed-quest pane scroll down
            if (typeof MenuFaces !== 'undefined' && MenuFaces.scrollQuestFailed) {
              MenuFaces.scrollQuestFailed(+1);
            }
          } else if (hit.action === 'read_quest_active') {
            // Phase 2.1b — open detail DialogBox for an active quest.
            // Shows title, summary, step checklist (✓ done / ▶ current
            // / ○ pending), and the giver breadcrumb.  Priority 2 so it
            // layers over MenuBox (which we close) without fighting
            // other overlays.
            var qaTargetId = hit.questId;
            if (qaTargetId && typeof QuestChain !== 'undefined' && QuestChain.getJournalEntries) {
              var qaList = QuestChain.getJournalEntries({ active: true }) || [];
              var qaRec = null;
              for (var qaLi = 0; qaLi < qaList.length; qaLi++) {
                if (qaList[qaLi].id === qaTargetId) { qaRec = qaList[qaLi]; break; }
              }
              if (qaRec) {
                if (typeof MenuBox !== 'undefined' && MenuBox.close) MenuBox.close();
                if (typeof DialogBox !== 'undefined' && DialogBox.show) {
                  var qaT = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t(qaRec.title, qaRec.title) : qaRec.title;
                  var qaS = qaRec.summary
                    ? ((typeof i18n !== 'undefined' && i18n.t) ? i18n.t(qaRec.summary, qaRec.summary) : qaRec.summary)
                    : '';
                  var qaMsg = '\u25C6 ' + qaT + (qaS ? '\n\n' + qaS : '');
                  // Step checklist
                  if (qaRec.steps && qaRec.steps.length) {
                    var stepsHdr = (typeof i18n !== 'undefined' && i18n.t)
                      ? i18n.t('quest.detail.steps_header', 'Steps') : 'Steps';
                    qaMsg += '\n\n' + stepsHdr + ':';
                    for (var qSi = 0; qSi < qaRec.steps.length; qSi++) {
                      var stObj = qaRec.steps[qSi];
                      var stMark = (qSi < qaRec.stepIndex) ? '\u2713'
                        : (qSi === qaRec.stepIndex) ? '\u25B6' : '\u25CB';
                      var stLbl = stObj.label
                        ? ((typeof i18n !== 'undefined' && i18n.t) ? i18n.t(stObj.label, stObj.label) : stObj.label)
                        : (stObj.id || ('step ' + (qSi + 1)));
                      qaMsg += '\n  ' + stMark + ' ' + stLbl;
                    }
                  }
                  // Giver breadcrumb
                  if (qaRec.breadcrumb) {
                    var giverHdr = (typeof i18n !== 'undefined' && i18n.t)
                      ? i18n.t('quest.detail.giver_prefix', 'Giver') : 'Giver';
                    var giverLoc = (typeof i18n !== 'undefined' && i18n.t)
                      ? i18n.t(qaRec.breadcrumb, qaRec.breadcrumb) : qaRec.breadcrumb;
                    qaMsg += '\n\n' + giverHdr + ': ' + giverLoc;
                  }
                  DialogBox.show(qaMsg, { priority: 2 });
                }
              }
            }
          } else if (hit.action === 'read_quest_failed') {
            // Phase 2.1b — open detail DialogBox for a failed quest.
            // Shows title, summary, and the fail reason (i18n-keyed).
            var qfTargetId = hit.questId;
            if (qfTargetId && typeof QuestChain !== 'undefined' && QuestChain.getJournalEntries) {
              var qfList = QuestChain.getJournalEntries({ failed: true }) || [];
              var qfRec = null;
              for (var qfLi = 0; qfLi < qfList.length; qfLi++) {
                if (qfList[qfLi].id === qfTargetId) { qfRec = qfList[qfLi]; break; }
              }
              if (qfRec) {
                if (typeof MenuBox !== 'undefined' && MenuBox.close) MenuBox.close();
                if (typeof DialogBox !== 'undefined' && DialogBox.show) {
                  var qfT = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t(qfRec.title, qfRec.title) : qfRec.title;
                  var qfS = qfRec.summary
                    ? ((typeof i18n !== 'undefined' && i18n.t) ? i18n.t(qfRec.summary, qfRec.summary) : qfRec.summary)
                    : '';
                  var qfMsg = '\u2717 ' + qfT + (qfS ? '\n\n' + qfS : '');
                  if (qfRec.failReason) {
                    var reasonHdr = (typeof i18n !== 'undefined' && i18n.t)
                      ? i18n.t('quest.detail.fail_reason', 'Reason') : 'Reason';
                    var reasonStr = (typeof i18n !== 'undefined' && i18n.t)
                      ? i18n.t(qfRec.failReason, qfRec.failReason) : qfRec.failReason;
                    qfMsg += '\n\n' + reasonHdr + ': ' + reasonStr;
                  }
                  DialogBox.show(qfMsg, { priority: 2 });
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
              // M2.4: checkpoint autosave — bonfire is a safe rest point.
              if (typeof SaveState !== 'undefined' && SaveState.autosave) {
                try { SaveState.autosave(); }
                catch (e) { console.warn('[Game] autosave after bonfire rest failed:', e); }
              }
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
          } else if (hit.action === 'cycle_render_scale') {
            // Face 3 render scale cycle
            if (typeof MenuFaces !== 'undefined' && MenuFaces.handleRenderScaleCycle) {
              MenuFaces.handleRenderScaleCycle();
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
      // PF-5: MinigameExit [×] corner gets first dibs on any gameplay click so
      // a captured-input minigame can never swallow the exit affordance. During
      // the 300ms entry grace, handlePointerClick() silently consumes hits on
      // [×] to avoid dual-action surprises. When confirm is armed, a second
      // click on [×] commits the exit.
      if (typeof MinigameExit !== 'undefined' && MinigameExit.isActive()) {
        if (MinigameExit.handlePointerClick()) return;
      }
      // PeekShell pointer intercept — runs after MinigameExit so captured-input
      // surfaces that also use PeekShell framing route through the exit overlay
      // first. Non-capturing peeks consult their descriptor.onPointer hook.
      if (typeof PeekShell !== 'undefined' && PeekShell.isActive()) {
        if (PeekShell.handlePointerClick()) return;
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
      // PF-5: while a captured-input minigame is mounted, Enter/OK is reserved
      // for canceling the exit-confirm prompt. MinigameExit.handleKey returns
      // true when it consumed the key (either during confirm or because the
      // minigame is focused and this key is its own business).
      if (typeof MinigameExit !== 'undefined' && MinigameExit.isActive()) {
        if (MinigameExit.handleKey('Enter')) return;
      }
      // PeekShell interact intercept — Enter/OK forwards to the mounted
      // descriptor's onInteract hook. Returning the string 'handoff' from
      // onInteract auto-unmounts (use when the interaction kicks off a floor
      // transition that replaces this surface).
      if (typeof PeekShell !== 'undefined' && PeekShell.isActive()) {
        if (PeekShell.handleKey('Enter')) return;
      }
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
      // Block reel during combat — hose snaps on damage, not player choice
      if (typeof CombatEngine !== 'undefined' && CombatEngine.isActive()) return;
      if (typeof CombatBridge !== 'undefined' && CombatBridge.isPending()) return;
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
      // If coming from GAME_OVER (retry), stash current seed then reset
      if (oldState === S.GAME_OVER) {
        // Stash the run seed so _initGameplay → SeededRNG.beginRun re-uses
        // the same seed (player chose "Retry", expects identical dungeon).
        if (typeof SeededRNG !== 'undefined' && SeededRNG.runSeed) {
          window._pendingRunSeed = SeededRNG.runSeed();
        }
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

      // Equip starting class item — only on a genuine fresh run, never
      // on resume-from-save. See _equipClassStarterItem for the guard
      // rationale (was incorrectly running on loads and re-equipping
      // slot 0 whenever the player had intentionally cleared it).

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
        if (menuContext === 'bonfire') {
          DragDrop.setZoneActive('inv-stash', true);
          // Activate per-slot bonfire zones (12 bag + 20 stash)
          for (var _bfi = 0; _bfi < 12; _bfi++) DragDrop.setZoneActive('bf-bag-' + _bfi, true);
          for (var _bsi = 0; _bsi < 20; _bsi++) DragDrop.setZoneActive('bf-stash-' + _bsi, true);
        }
        if (menuContext === 'shop') DragDrop.setZoneActive('inv-sell', true);
      }

      MenuBox.open(menuContext, {
        startFace: startFace,
        onClose: function () {
          if (typeof Shop !== 'undefined') Shop.close();
          if (typeof MenuFaces !== 'undefined') {
            MenuFaces.unregisterDragZones();
            if (MenuFaces.destroyShopWheels) MenuFaces.destroyShopWheels();
          }
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

  /**
   * Equip the starting class item in quick-slot 0.
   *
   * Called EXACTLY once per fresh run from _seedFreshRun. Never on
   * resume (the serialized equipped[] is the source of truth) and
   * never on retry (Player.reset clears equipped and this re-seeds).
   */
  function _equipClassStarterItem(ps) {
    if (!ps || !ps.avatarName) return;
    var startItems = {
      'Blade':    { emoji: '\uD83D\uDDE1\uFE0F', name: 'Iron Sword',    subtype: 'melee',   stat: 'str',     value: 2 },
      'Ranger':   { emoji: '\uD83C\uDFF9',       name: 'Short Bow',     subtype: 'ranged',  stat: 'dex',     value: 2 },
      'Shadow':   { emoji: '\uD83D\uDCA8',       name: 'Smoke Bomb',    subtype: 'stealth', stat: 'stealth', value: 2 },
      'Sentinel': { emoji: '\uD83D\uDEE1\uFE0F', name: 'Tower Shield',  subtype: 'shield',  stat: 'hp',      value: 2 },
      'Seer':     { emoji: '\uD83D\uDD2E',       name: 'Focus Crystal', subtype: 'focus',   stat: 'energy',  value: 2 },
      'Wildcard': { emoji: '\uD83C\uDCCF',       name: 'Lucky Card',    subtype: 'wild',    stat: 'random',  value: 2 }
    };
    var item = startItems[ps.avatarName];
    if (!item) return;
    if (ps.equipped[0] !== null) return; // respect prior state
    ps.equipped[0] = item;
    if (typeof QuickBar !== 'undefined' && QuickBar.refresh) QuickBar.refresh();
  }

  /**
   * Seed all fresh-run-only state. Called ONCE per new run from the
   * fresh-deploy branch of _initGameplay. Never called on resume or
   * retry. Modules here are destructive and MUST NOT be safe to
   * re-run over an already-populated world.
   *
   *   1. CardSystem.seedStarter  — adds starter deck, 15g, 16 silk
   *                                spiders, 2 trap kits into bag
   *   2. _equipClassStarterItem  — slot-0 class item from avatar
   *   3. Salvage.reset           — clears salvage ledger
   *   4. WorldItems.init         — clears walk-over items
   *   5. SessionStats.reset      — zeroes run-scoped stats
   *   6. MorningReport.reset     — clears hero-run dedupe window
   */
  function _seedFreshRun(ps) {
    if (typeof CardSystem !== 'undefined' && CardSystem.seedStarter) {
      CardSystem.seedStarter();
    }
    _equipClassStarterItem(ps);
    if (typeof Salvage !== 'undefined') Salvage.reset();
    if (typeof WorldItems !== 'undefined') WorldItems.init();
    if (typeof SessionStats !== 'undefined') SessionStats.reset();
    if (typeof MorningReport !== 'undefined') MorningReport.reset();
  }

  function _initGameplay() {
    // ── Resume handshake ──────────────────────────────────────────
    // TitleScreen._loadSelectedSlot calls SaveState.setResuming(slotId)
    // after populating all subsystems from the save blob. We consume
    // the flag exactly once here; a truthy return means "skip fresh-
    // run seeding". The flag auto-clears, so retry-after-death paths
    // behave as fresh runs unless the player explicitly loads again.
    var _resumingSlot = (typeof SaveState !== 'undefined' && SaveState.consumeResuming)
      ? SaveState.consumeResuming()
      : null;
    var _loadedFromSave = !!_resumingSlot;
    if (_loadedFromSave) {
      console.log('[Game] Resuming run from slot "' + _resumingSlot + '"');
    }

    // Only init gameplay-specific modules once (or re-init on retry)
    Minimap.init(document.getElementById('minimap'));
    HUD.init();

    // Wire readiness tier-crossing callback from HUD.
    // Fires when readiness crosses 25/50/75/100% — we handle the
    // celebration toast and quest target update here because game.js
    // has access to DungeonSchedule for context-aware messaging.
    HUD.setOnTierCross(_onReadinessTierCross);

    // Registry load only — starter inventory is seeded via
    // _seedFreshRun below (and ONLY on fresh runs).
    CardSystem.init();
    // Refresh status bar now that CardSystem has the starting hand/deck
    if (typeof StatusBar !== 'undefined') { StatusBar.updateDeck(); StatusBar.updateBag(); }

    // ── Quest system (Phase 0 scaffold) ─────────────────────────
    // Sync-XHR load of data/quests.json + merge of per-floor quest
    // sidecars (tools/floor-payloads/<id>.quest.json) surfaced by
    // extract-floors into floor-data.json[fid].quests. Docref:
    // docs/QUEST_SYSTEM_ROADMAP.md §2 Target Architecture.
    if (typeof QuestRegistry !== 'undefined') {
      var _questPayload = null;
      try {
        var _qxhr = new XMLHttpRequest();
        _qxhr.open('GET', 'data/quests.json', false);
        _qxhr.send();
        if (_qxhr.status === 200 || _qxhr.status === 0 /* file:// */) {
          _questPayload = JSON.parse(_qxhr.responseText);
        }
      } catch (e) {
        console.warn('[Game] quests.json load failed:', e && e.message);
      }
      // Harvest per-floor anchors from FloorManager (populated by
      // extract-floors sidecar merge). Phase 1 wires this up; for now
      // we just try the call and fall back to null.
      var _floorAnchors = null;
      if (typeof FloorManager !== 'undefined' && typeof FloorManager.getQuestAnchors === 'function') {
        try { _floorAnchors = FloorManager.getQuestAnchors(); } catch (e) { _floorAnchors = null; }
      }
      QuestRegistry.init(_questPayload, _floorAnchors);

      // DOC-107 Phase 1: wire runtime resolvers so resolveAnchor() can
      // pull from floor data, live entities, NPCs, and the dump truck
      // deployment. QuestRegistry is Layer 1 — we keep it decoupled
      // from FloorManager/DispatcherChoreography/etc. by threading
      // through these callbacks at Layer-4 boot.
      if (QuestRegistry.setResolvers) {
        QuestRegistry.setResolvers({
          getFloorData: function (floorId) {
            if (typeof FloorManager === 'undefined') return null;
            if (FloorManager.getFloor && FloorManager.getFloor() === floorId) {
              return FloorManager.getFloorData ? FloorManager.getFloorData() : null;
            }
            return FloorManager.getFloorCache ? FloorManager.getFloorCache(floorId) : null;
          },
          getEntity: function (modName, method) {
            // Minimal module-dispatch; DispatcherChoreography is the
            // only consumer in Phase 1 but the shape generalizes.
            if (modName === 'DispatcherChoreography' &&
                typeof DispatcherChoreography !== 'undefined' &&
                typeof DispatcherChoreography[method] === 'function') {
              return DispatcherChoreography[method]();
            }
            return null;
          },
          getNpcById: function (floorId, npcId) {
            // NPC registry resolver stub — wired in Phase 3 when the
            // NPC roster gains a floor-scoped lookup. Returns null so
            // resolveAnchor cleanly yields null on an 'npc' spec.
            return null;
          },
          getDumpTruck: function () {
            if (typeof DumpTruckSpawner !== 'undefined' &&
                DumpTruckSpawner.getDeployment) {
              return DumpTruckSpawner.getDeployment();
            }
            return null;
          },
          getCurrentFloorId: function () {
            if (typeof FloorManager !== 'undefined' && FloorManager.getFloor) {
              return FloorManager.getFloor();
            }
            return null;
          }
        });
      }
    }
    if (typeof QuestChain !== 'undefined') {
      // DOC-107 Phase 1: QuestChain now absorbs QuestWaypoint's init
      // opts (dispatcher callbacks). The QuestWaypoint.init call below
      // is kept as a no-op shim until Slice 6 retires the module.
      QuestChain.init({
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

      // ── DOC-113 Phase C — Sprint timer UI wiring ──────────────
      // QuestChain emits 'timer-*' events when a fetch-kind quest step
      // activates. DebriefFeed renders the countdown bar row. Both
      // modules are guarded (module may load before the other in
      // alternate boot orders / headless tests).
      if (typeof DebriefFeed !== 'undefined') {
        QuestChain.on('timer-start', function (data) {
          if (!data) return;
          DebriefFeed.showTimer(data.questId, data.totalMs, data.heroArchetype);
        });
        QuestChain.on('timer-tick', function (data) {
          if (!data) return;
          DebriefFeed.updateTimer(data.remainMs, data.pct, data.zone);
        });
        QuestChain.on('timer-zone', function (data) {
          if (!data) return;
          // Zone transition — the latest timer-tick already updated
          // remainMs/pct; this event exists for consumers (SFX, screen
          // tint) that care about the prev/next zone pair. DebriefFeed
          // just re-asserts the zone so a missed tick-tock can't leave
          // us rendering stale colours.
          var snap = (typeof QuestChain.getActiveTimer === 'function') ? QuestChain.getActiveTimer() : null;
          if (snap) DebriefFeed.updateTimer(snap.remainMs, snap.pct, data.zone);
        });
        QuestChain.on('timer-expired', function (data) {
          DebriefFeed.updateTimer(0, 0, 'expired');
          // Phase D (hero spawn) wires HeroSystem from here — out of
          // scope for this UI-side handoff.
        });
        QuestChain.on('timer-cancel', function () {
          DebriefFeed.hideTimer();
        });
      }
    }
    if (typeof ReputationBar !== 'undefined') ReputationBar.init();

    // ── DOC-109 Phase 4: ReputationBar → DebriefFeed fan-out ──
    // Subscribe to the canonical (kind, id, prev, next) subject-kind
    // events and forward every favor bump into the relationships
    // category. tier-cross is the *animation* signal — it always
    // follows a favor-change for the same (kind, id), so we route the
    // tier-crossed flair via flair.tierCrossed and let updateRelationship
    // coalesce the two events into a single row render.
    //
    // NPC meta (portrait glyph + display name + factionId for tint) is
    // resolved lazily via NpcSystem.getNpcMeta(id) — the row renderer
    // persists the meta bag on the first call, so subsequent
    // favor-change events can omit meta without clobbering state.
    if (typeof ReputationBar !== 'undefined' &&
        typeof DebriefFeed    !== 'undefined' &&
        typeof QuestTypes     !== 'undefined') {
      var _resolveNpcMeta = function (id) {
        if (typeof NpcSystem === 'undefined' || !NpcSystem.getNpcMeta) return null;
        var m = NpcSystem.getNpcMeta(id);
        if (!m) return null;
        return {
          icon:      m.emoji || '\uD83D\uDC64',
          name:      m.name  || id,
          factionId: m.factionId || null,
          floor:     m.floorId || null
        };
      };
      ReputationBar.on('favor-change', function (kind, id, prev, next) {
        var tierInfo = QuestTypes.tierForFavor(next);
        var tierId   = tierInfo ? tierInfo.id : 'neutral';
        var meta = (kind === 'npc') ? _resolveNpcMeta(id) : null;
        DebriefFeed.updateRelationship(kind, id, next, tierId, meta);
      });
      ReputationBar.on('tier-cross', function (kind, id, prevTier, nextTier) {
        var favor = ReputationBar.getSubjectFavor(kind, id);
        var meta = (kind === 'npc') ? _resolveNpcMeta(id) : null;
        // updateRelationship reads meta.tierCrossed at top level and
        // forwards it as data.flair.tierCrossed into _setRelationshipRow.
        // We pass it on meta (not wrapped in a `flair` object) so the
        // splitter at updateRelationship can route it correctly.
        var payload = meta ? Object.assign({}, meta, { tierCrossed: true })
                           : { tierCrossed: true };
        DebriefFeed.updateRelationship(kind, id, favor, nextTier, payload);
      });
    }

    // ── DOC-107: CardAuthority → QuestChain.onItemAcquired fan-out ──
    // Subscribe to the discrete 'bag:item-added' event (not 'bag:changed',
    // which fires on removals too) and fan out to QuestChain so steps
    // predicating on `{kind:'item', itemId:'ITM-089'}` — or the DOC-113
    // `{kind:'fetch', itemId, floorId}` variant — advance on pickup,
    // loot drop, shop purchase, choice.effect.giveItem, or any other
    // path that ultimately calls CardAuthority.addToBag().
    if (typeof CardAuthority !== 'undefined' && typeof CardAuthority.on === 'function') {
      CardAuthority.on('bag:item-added', function (payload) {
        if (!payload || !payload.item) return;
        var itemId = payload.item.id;
        if (typeof itemId !== 'string' || !itemId) return;
        if (typeof QuestChain !== 'undefined' &&
            typeof QuestChain.onItemAcquired === 'function') {
          try { QuestChain.onItemAcquired(itemId); }
          catch (e) {
            if (typeof console !== 'undefined') {
              console.warn('[Game] QuestChain.onItemAcquired threw:', e);
            }
          }
        }
      });
    }

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

        // Transition to home floor after a brief delay (M2.4: act-aware anchor)
        setTimeout(function () {
          var home = (typeof SaveState !== 'undefined' && SaveState.getResidenceAnchor)
            ? SaveState.getResidenceAnchor() : '1.6';
          FloorTransition.go(home, 'retreat');
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

        // Transition to home floor after a brief delay (M2.4: act-aware anchor)
        setTimeout(function () {
          var home = (typeof SaveState !== 'undefined' && SaveState.getResidenceAnchor)
            ? SaveState.getResidenceAnchor() : '1.6';
          FloorTransition.go(home, 'retreat');
        }, 800);
      });
    }

    // Interact prompt + door/crate/chest/puzzle peek
    InteractPrompt.init();
    if (typeof DoorPeek        !== 'undefined') DoorPeek.init();
    if (typeof ArchPeek       !== 'undefined') ArchPeek.init();
    if (typeof LockedDoorPeek !== 'undefined') LockedDoorPeek.init();
    if (typeof CratePeek      !== 'undefined') CratePeek.init();
    if (typeof ChestPeek     !== 'undefined') ChestPeek.init();
    if (typeof CorpsePeek    !== 'undefined') CorpsePeek.init();
    if (typeof MerchantPeek  !== 'undefined') MerchantPeek.init();
    if (typeof PuzzlePeek    !== 'undefined') PuzzlePeek.init();
    if (typeof TorchPeek    !== 'undefined') TorchPeek.init();
    if (typeof BookshelfPeek !== 'undefined') BookshelfPeek.init();
    if (typeof BarCounterPeek !== 'undefined') BarCounterPeek.init();
    if (typeof ClickyMinigame !== 'undefined') ClickyMinigame.init();
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
            var confiscateIdx = SeededRNG.randInt(0, hand.length - 1);
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

        // Forced transition to home + sleep (M2.4: act-aware anchor)
        var curfewHome = (typeof SaveState !== 'undefined' && SaveState.getResidenceAnchor)
          ? SaveState.getResidenceAnchor() : '1.6';
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
                FloorManager.setFloor(curfewHome);
                FloorManager.generateCurrentFloor();
              },
              onComplete: function () {
                _updateDayCounter();
                if (typeof Toast !== 'undefined') {
                  Toast.show('\u2615 You wake up groggy. Don\'t make a habit of this.', 'info');
                }

                // M2.4: autosave after curfew — curfew bypasses FloorTransition.go,
                // so the floor-transition autosave at onAfter doesn't fire.
                if (typeof SaveState !== 'undefined' && SaveState.autosave) {
                  try { SaveState.autosave(); }
                  catch (e) { console.warn('[Game] autosave after curfew failed:', e); }
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

    // ── DOC-109 Phase 3 — Readiness category wire-up ─────────────
    // ReadinessCalc emits 'group-score-change' whenever a mutation site
    // calls markDirty() and the microtask flush detects the group's
    // aggregate moved. Fan that into DebriefFeed.updateReadiness so the
    // Readiness category row tracks live progress. Seed with a deferred
    // invalidate() so the initial bars (all 0.0 at a fresh boot) appear
    // in the HUD without the player having to clean anything first.
    //
    // Both modules are guarded: ReadinessCalc lives in Layer 1 (loaded
    // unconditionally) and DebriefFeed in Layer 2, but typeof checks
    // keep the subscription safe for headless boots / unit tests that
    // may instantiate game.js without the HUD stack.
    if (typeof ReadinessCalc !== 'undefined' &&
        typeof DebriefFeed   !== 'undefined' &&
        typeof ReadinessCalc.on === 'function') {
      ReadinessCalc.on('group-score-change', function (groupId, prev, next) {
        if (typeof DebriefFeed.updateReadiness === 'function') {
          DebriefFeed.updateReadiness(groupId, next);
        }
      });
      // Deferred seed — runs after every Game.init module has
      // initialized (DungeonSchedule + subsystems) so ReadinessCalc
      // can walk the schedule and emit one 'group-score-change' per
      // registered group, populating all three rows at boot.
      if (typeof ReadinessCalc.invalidate === 'function') {
        ReadinessCalc.invalidate();
      }
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
        // M2.4: checkpoint autosave — home bed is the strongest save point.
        if (typeof SaveState !== 'undefined' && SaveState.autosave) {
          try { SaveState.autosave(); }
          catch (e) { console.warn('[Game] autosave after bed wake failed:', e); }
        }
      });
    }

    // NPC system — register built-in populations (bark pools loaded at Layer 5)
    if (typeof NpcSystem !== 'undefined') NpcSystem.init();

    // ── NPC dialogue trees — delegated to NpcDialogueTrees module ──
    if (typeof NpcDialogueTrees !== 'undefined') NpcDialogueTrees.registerAll();

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
        if (typeof SpriteLayer !== 'undefined') SpriteLayer.clear();

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

        // DOC-107 Phase 1: floor-arrive fan-out to QuestChain — lets
        // 'floor' predicate steps advance when the player reaches a
        // target tile (the spawn tile on the new floor). Marker
        // refresh still runs after, so no visual regression.
        if (typeof QuestChain !== 'undefined' && QuestChain.onFloorArrive) {
          var _fidArrive = FloorManager.getFloor();
          var _spawnTile = (typeof MC !== 'undefined' && MC.getGridPos) ? MC.getGridPos() : null;
          QuestChain.onFloorArrive(
            _fidArrive,
            _spawnTile ? _spawnTile.x : 0,
            _spawnTile ? _spawnTile.y : 0
          );
        }

        // Refresh quest waypoint for the new floor. Without this, the
        // minimap marker stays stuck at the previous floor's coordinates
        // and renders at a garbage tile on the new grid.
        _updateQuestTarget();

        // ── M2.4 floor-transition autosave ─────────────────────────
        // Persist after every successful transition. This captures the
        // new floor id, updated explored bitmap, any crates touched on
        // the old floor, and (via CardAuthority / Player live state)
        // any inventory/hp drift. Skip on the very first floor load —
        // _previousFloorId is null there, and that path runs through
        // _generateAndWire() directly (not FloorTransition).
        if (_previousFloorId && typeof SaveState !== 'undefined' && SaveState.autosave) {
          try { SaveState.autosave(); }
          catch (e) { console.warn('[Game] autosave after transition failed:', e); }
        }
      }
    });

    // ── M2.5: Load-from-save branch ────────────────────────────────
    // _loadedFromSave was captured+consumed at the top of _initGameplay.
    // When true: FloorManager has the restored currentFloor, Minimap has
    // the restored stack, and CardAuthority/Player/SessionStats/etc.
    // hold serialized state. We just need to regenerate the current
    // floor's transient visuals and fire arrival hooks. Skip the
    // fresh-game scaffolding.
    var startFloorId;
    if (_loadedFromSave) {
      startFloorId = FloorManager.getFloor();
      console.log('[Game] Resuming from save at floor ' + startFloorId);
    } else {
      // Initialize starting floor — Floor 0 (exterior approach)
      startFloorId = '0';
      FloorManager.setFloor(startFloorId);
      Minimap.pushFloor(startFloorId);
      Minimap.enterFloor(startFloorId, 'The Approach');
    }

    // Generate current floor and wire movement callbacks.
    // On load, this regenerates the floor from its authored grid + diff,
    // but MC.init inside _generateAndWire uses the floor's authored spawn
    // point — we override to the serialized player position below.
    _generateAndWire();

    if (_loadedFromSave) {
      var ps = Player.state();
      if (typeof MC !== 'undefined' && MC.setPosition &&
          typeof ps.x === 'number' && typeof ps.y === 'number') {
        MC.setPosition(ps.x, ps.y, ps.dir);
        if (typeof Minimap !== 'undefined' && Minimap.reveal) {
          Minimap.reveal(ps.x, ps.y);
        }
      }
    }

    // Start overworld music for the current floor (title music persists)
    if (typeof AudioMusicManager !== 'undefined') {
      AudioMusicManager.onFloorChange(startFloorId);
    }

    // Trigger per-floor arrival hooks (NPC spawns, ambient barks, gate
    // logic). _onFloorArrive is normally fired by the FloorTransition
    // callback, but the initial/resumed floor is loaded directly — not
    // via transition — so it must be called explicitly here.
    _onFloorArrive(startFloorId);

    // ── Fresh-run seeding ──────────────────────────────────────────
    // Everything below the "fresh-deploy only" banner gets handled by
    // the centralized _seedFreshRun helper — starter deck, 15g,
    // starter bag consumables, class-item equip, Salvage/WorldItems/
    // SessionStats/MorningReport resets, and the initial hand draw.
    //
    // Resume path does none of this: the blob already captured it.
    if (!_loadedFromSave) {
      // On retry, _pendingRunSeed was stashed in the GAME_OVER→GAMEPLAY
      // transition. On fresh title deploy, TitleScreen._deploy already
      // called beginRun, so _pendingRunSeed is null and this is a no-op
      // guard. Either way: ensure beginRun has been called before seeding.
      if (typeof SeededRNG !== 'undefined' && SeededRNG.beginRun &&
          typeof window !== 'undefined' && window._pendingRunSeed != null) {
        SeededRNG.beginRun(window._pendingRunSeed);
        window._pendingRunSeed = null;
      }
      _seedFreshRun(Player.state());
      CardAuthority.drawHand();
      HUD.updateCards(CardAuthority.getHand());
      var _initHand = CardAuthority.getHand();
      if (_initHand.length > 0 && typeof Toast !== 'undefined') {
        Toast.show('\uD83C\uDCA0 Drew ' + _initHand.length + ' cards', 'dim');
      }
    } else {
      // Refresh HUD against the already-restored hand
      HUD.updateCards(CardAuthority.getHand());
    }

    // Play deploy dropoff monologue (player was just dropped off by the truck).
    // Skip on load-from-save — the player has already played past deploy.
    // IntroWalk (cursor-hijack tutorial) disabled for jam — module preserved
    // in engine/intro-walk.js for post-jam re-enable. To restore, uncomment
    // the script tag in index.html and call _startIntroWalk() in onComplete.
    if (!_loadedFromSave && typeof MonologuePeek !== 'undefined' && MonologuePeek.play) {
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

    // (Salvage.reset / WorldItems.init / SessionStats.reset /
    // MorningReport.reset are handled inside _seedFreshRun above for
    // fresh runs. On resume, they must NOT re-run — the save blob
    // already restored these subsystems.)

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

    // Register CSS dragonfire overlays for bonfire/hearth tiles on the new floor.
    // SpriteLayer.clear() already ran in the onAfter callback (or this is the
    // initial floor where no prior sprites exist). buildSprites populates the
    // tile coordinate cache; registerDOMSprites pushes them to the DOM layer.
    if (typeof BonfireSprites !== 'undefined' && typeof SpriteLayer !== 'undefined') {
      var _dfFd = FloorManager.getFloorData();
      if (_dfFd && _dfFd.grid) {
        BonfireSprites.buildSprites(floorId, _dfFd.grid, _dfFd.gridW, _dfFd.gridH);
        BonfireSprites.registerDOMSprites();
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
    var vendorFd = (typeof FloorManager !== 'undefined' && FloorManager.getFloorData)
      ? FloorManager.getFloorData() : null;
    if (typeof VendorRegistry !== 'undefined' && vendorFd && vendorFd.shops) {
      VendorRegistry.registerFloor(floorId, vendorFd.shops);
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
    // DOC-107 Phase 1: fan out readiness crossings to QuestChain on
    // every tier (not just tier 4) — predicates may be gated on 25%,
    // 50%, or 75% thresholds. Uses the true score from ReadinessCalc
    // so fractional predicates (e.g. >= 0.62) work too.
    if (typeof QuestChain !== 'undefined' && QuestChain.onReadinessChange) {
      var _rScore = (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.getCoreScore)
        ? (+ReadinessCalc.getCoreScore(floorId) || 0) : (tier * 0.25);
      QuestChain.onReadinessChange(floorId, _rScore);
    }

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

  // DOC-107 Phase 1: marker refresh routes through QuestChain directly.
  // QuestWaypoint still owns evaluateCursorFxGating() until cursor-fx
  // consolidation moves that shim into its own module.
  function _updateQuestTarget() { if (typeof QuestChain !== 'undefined' && QuestChain.update) QuestChain.update(); }
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

    // Alternate left/right footstep for natural cadence.
    // ±5% pitch variation per step for organic feel — left foot pitches
    // slightly down (heavier), right foot slightly up (lighter push-off).
    var foot = _footstepFoot === 0 ? 'step-left' : 'step-right';
    var pitchVar = _footstepFoot === 0
      ? 0.95 + Math.random() * 0.05    // left: 0.95–1.00 (heavier)
      : 1.00 + Math.random() * 0.05;   // right: 1.00–1.05 (lighter)
    _footstepFoot = 1 - _footstepFoot;
    AudioSystem.playRandom(foot, { volume: 0.4, playbackRate: pitchVar });
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

    // Bag encumbrance fatigue (per tile moved)
    if (typeof Player !== 'undefined' && Player.drainBagEncumbrance) {
      Player.drainBagEncumbrance();
    }

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
        var isDoorExit = (tile === TILES.DOOR_EXIT || tile === TILES.DOOR_BACK || tile === TILES.STAIRS_UP || tile === TILES.TRAPDOOR_UP);
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
    if (tile === TILES.BONFIRE || tile === TILES.BED || tile === TILES.HEARTH || tile === TILES.CITY_BONFIRE) {
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
    // ── Tier 1 clicky minigame tiles (WELL/ANVIL/SOUP_KITCHEN/BARREL) ──
    else if (typeof ClickyMinigame !== 'undefined' && ClickyMinigame.hasRecipe(tile)) {
      var faceRecipe = ClickyMinigame.getRecipe(tile);
      if (faceRecipe && !faceRecipe.walkable) {
        ClickyMinigame.tryTap(tile, fx, fy, floorData);
      }
    }

    // ── Walkable clicky (FUNGAL_PATCH etc.) — test standing tile ──
    if (typeof ClickyMinigame !== 'undefined') {
      var pp = Player.getPos();
      var standRow = floorData.grid[pp.y];
      var standTile = standRow ? standRow[pp.x] : -1;
      var standRecipe = ClickyMinigame.getRecipe(standTile);
      if (standRecipe && standRecipe.walkable) {
        ClickyMinigame.tryTap(standTile, pp.x, pp.y, floorData);
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

    // Reanimated friendly verb-field tick — entities with _verbSet orbit
    // nearby verb nodes. Handles both auto-populated dungeon nodes (§13.5)
    // and hand-authored nodes on town floors. Entities without a _verbSet
    // fall through to the legacy _tickFriendlyPatrol path below.
    if (typeof ReanimatedBehavior !== 'undefined') {
      ReanimatedBehavior.tick(deltaMs);
    }

    // Friendly wander tick — reanimated entities patrol crate→torch→crate.
    // Runs patrol-only movement (no awareness, no chase). Only fires for
    // entities with a legacy `path` — reanimated creatures running the
    // verb-field are handled above and have `path` cleared in assign().
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

    // ── Fire crackle ambient (spatial, contract-aware) ──
    // Bonfires and hearths emit crackling SFX with distance-based volume
    // attenuation via playSpatial. Radius varies by spatial contract depth:
    //   exterior=5 (open air disperses), interior=4, dungeon=3 (reverb).
    // Lit torches are too small for crackling — they get separate treatment.
    _fireCrackleTimer = (_fireCrackleTimer || 0) + deltaMs;
    if (_fireCrackleTimer >= 2000) {  // Check every 2s
      _fireCrackleTimer = 0;
      var _fcPx = Math.round(p.x), _fcPy = Math.round(p.y);
      var _fcGrid = floorData.grid;
      var _fcGw = floorData.gridW, _fcGh = floorData.gridH;

      // Contract-aware radius
      var _fcContract = (typeof FloorManager !== 'undefined' && FloorManager.getFloorContract)
        ? FloorManager.getFloorContract() : null;
      var _fcDepth = _fcContract ? _fcContract.depth : 'exterior';
      var _fcMaxDist = _fcDepth === 'nested_dungeon' ? 3
                     : _fcDepth === 'interior' ? 4
                     : 5;
      // Volume scales with depth: dungeons are reverberant (louder close),
      // exterior dissipates faster
      var _fcBaseVol = _fcDepth === 'nested_dungeon' ? 0.55
                     : _fcDepth === 'interior' ? 0.45
                     : 0.35;

      var _fcBestDist = 99, _fcBestX = 0, _fcBestY = 0;
      var _fcScanR = _fcMaxDist;
      for (var _fcY = Math.max(0, _fcPy - _fcScanR); _fcY <= Math.min(_fcGh - 1, _fcPy + _fcScanR); _fcY++) {
        if (!_fcGrid[_fcY]) continue;
        for (var _fcX = Math.max(0, _fcPx - _fcScanR); _fcX <= Math.min(_fcGw - 1, _fcPx + _fcScanR); _fcX++) {
          var _fcTile = _fcGrid[_fcY][_fcX];
          if (_fcTile === TILES.BONFIRE || _fcTile === TILES.HEARTH) {
            var _fcD = Math.abs(_fcX - _fcPx) + Math.abs(_fcY - _fcPy);
            if (_fcD < _fcBestDist) {
              _fcBestDist = _fcD;
              _fcBestX = _fcX;
              _fcBestY = _fcY;
            }
          }
        }
      }
      if (_fcBestDist <= _fcMaxDist) {
        AudioSystem.playSpatial('fire_crackle', _fcBestX, _fcBestY, p.x, p.y,
          { volume: _fcBaseVol, maxDist: _fcMaxDist });
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
      if (typeof ArchPeek       !== 'undefined') ArchPeek.update(frameDt);
      if (typeof LockedDoorPeek !== 'undefined') LockedDoorPeek.update(frameDt);
      if (typeof CratePeek     !== 'undefined') CratePeek.update(frameDt);
      if (typeof ChestPeek    !== 'undefined') ChestPeek.update(frameDt);
      if (typeof CorpsePeek   !== 'undefined') CorpsePeek.update(frameDt);
      if (typeof MerchantPeek !== 'undefined') MerchantPeek.update(frameDt);
      if (typeof PuzzlePeek   !== 'undefined') PuzzlePeek.update(frameDt);
      if (typeof TorchPeek    !== 'undefined') TorchPeek.update(frameDt);
      if (typeof BookshelfPeek !== 'undefined') BookshelfPeek.update(frameDt);
      if (typeof BarCounterPeek !== 'undefined') BarCounterPeek.update(frameDt);
      if (typeof ClickyMinigame !== 'undefined') ClickyMinigame.update(frameDt);
      if (typeof BedPeek !== 'undefined') BedPeek.update(frameDt);
      if (typeof MailboxPeek !== 'undefined') MailboxPeek.update(frameDt);

      // PeekShell tick — Phase 0 shared outer frame for tile-interaction
      // surfaces (docs/MINIGAME_ROADMAP.md §0.2). `face` is the tile the
      // player is looking at this frame; PeekShell uses it for dwell-driven
      // auto-mount when a descriptor registry is populated. Explicit mounts
      // (via PeekShell.mount(...)) don't depend on `face` and stay mounted
      // regardless until unmount() is called. Computed inline so the per-
      // peek modules above can be retired one at a time.
      if (typeof PeekShell !== 'undefined' && PeekShell.update) {
        var _psFace = null;
        if (typeof Player !== 'undefined' &&
            typeof MovementController !== 'undefined' &&
            typeof FloorManager !== 'undefined') {
          var _psFloor = FloorManager.getFloorData && FloorManager.getFloorData();
          if (_psFloor && _psFloor.grid) {
            var _psPos = Player.getPos();
            var _psDir = Player.getDir();
            var _psFx  = _psPos.x + MovementController.DX[_psDir];
            var _psFy  = _psPos.y + MovementController.DY[_psDir];
            if (_psFx >= 0 && _psFx < _psFloor.gridW &&
                _psFy >= 0 && _psFy < _psFloor.gridH) {
              _psFace = { tile: _psFloor.grid[_psFy][_psFx], x: _psFx, y: _psFy };
            }
          }
        }
        PeekShell.update(frameDt, _psFace);
      }

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

      // Spray droplet FX — in-world water bursting off the beam hit point
      // while the hose trigger is held. Spawning is driven from
      // spray-system.js (_burstFx); this module just advances physics and
      // renders. Runs every frame so in-flight droplets finish their arcs
      // after trigger release.
      if (typeof SprayDropletsFX !== 'undefined') {
        SprayDropletsFX.tick(frameDt);
        SprayDropletsFX.render(ctx);
      }

      // CrateUI slot overlay (renders during PeekSlots FILLING state)
      if (typeof CrateUI !== 'undefined' && CrateUI.isOpen()) {
        CrateUI.update(frameDt);
        CrateUI.render(ctx, _canvas.width, _canvas.height);
      }

      // PF-5: MinigameExit chrome (top-edge input banner + [×] corner + confirm).
      // Renders above captured minigame content so the exit affordance is always
      // visible, but below DragDrop so a drag ghost stays on top. update() drives
      // the 300ms entry grace, fade-in, and confirm auto-cancel countdown.
      if (typeof MinigameExit !== 'undefined' && MinigameExit.isActive()) {
        MinigameExit.update(frameDt);
        MinigameExit.render(ctx, _canvas.width, _canvas.height);
      }

      // Drag-drop ghost overlay (renders above all other UI)
      if (typeof DragDrop !== 'undefined') DragDrop.render(ctx);

      // Combat report (DOM overlay, ticks auto-dismiss timer)
      if (typeof CombatReport !== 'undefined') {
        CombatReport.update(frameDt);
      }

      // Weather above-HUD layers (heavy rain streaks, vignette overlay)
      if (typeof WeatherSystem !== 'undefined') {
        WeatherSystem.renderAbove(ctx, _canvas.width, _canvas.height);
      }
    }
  }

  /** Render the 3D world + minimap (extracted for reuse by overlays). */
  function _renderGameplay(frameDt, now) {
    // Tick combat bridge (facing timer + CombatEngine phase auto-advance)
    CombatBridge.update(frameDt);

    // DOC-113 Phase C: tick the sprint timer each frame so countdown
    // stays smooth and pause checks are evaluated continuously.
    if (typeof QuestChain !== 'undefined' && QuestChain.tickTimer) {
      QuestChain.tickTimer(frameDt);
    }

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

    // ── Passive fatigue recovery ────────────────────────────────
    // Recovers when: not carrying hose, not in combat.
    // Walking recovers at half rate. Mirrors EyesOnly game-tick-system.
    if (typeof Player !== 'undefined' && Player.tickFatigueRecovery) {
      var _ftHosing = typeof HoseState !== 'undefined' && HoseState.isActive && HoseState.isActive();
      var _ftCombat = typeof CombatBridge !== 'undefined' && CombatBridge.isInCombat && CombatBridge.isInCombat();
      if (!_ftHosing && !_ftCombat) {
        var _ftWalking = MC.isMoving ? MC.isMoving() : false;
        var _ftResult = Player.tickFatigueRecovery(frameDt / 1000, _ftWalking);
        if (_ftResult === 'topped_off') {
          if (typeof DebriefFeedController !== 'undefined' && DebriefFeedController.reportResourceChange) {
            DebriefFeedController.reportResourceChange('Fatigue', 1, 0, 'Recovered');
          }
        }
      }
    }

    // Smooth mouse free-look (dt-aware acceleration + exponential lerp)
    // Skip MouseLook tick when cinematic camera has locked input — prevents
    // mouse cursor position from pulling the view away from the forced facing
    // direction during dispatcher grab or other cinematic sequences.
    if (typeof MouseLook !== 'undefined' && MouseLook.tick) {
      var _cinInputLock = typeof CinematicCamera !== 'undefined' && CinematicCamera.isInputLocked();
      if (!_cinInputLock || (MouseLook.isLocked && MouseLook.isLocked())) {
        // Allow tick when: no cinematic lock, OR MouseLook has its own lockOn
        // target (e.g. forced face-dispatcher → lockOn(0,0) still needs to lerp)
        MouseLook.tick(frameDt);
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
        // Skip emoji billboard for tiles that have a CSS DOM overlay
        // (SpriteLayer renders the dragonfire instead)
        if (bfs.domSprite) continue;
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
          glowRadius: dts.glowRadius || 0,
          // groundLevel shifts sprite center DOWN ~35% of screen-height
          // so the 🧵 lands inside the low (world Y 0.10–0.50) cavity
          // instead of at eye level. Without this copy the flag is
          // stripped here and the spool floats mid-truck.
          groundLevel: dts.groundLevel === true,
          noFogFade: dts.noFogFade === true
        });
      }
    }

    // ── Window facade caches (glass filler + mullion + wallTexture) ─
    // WindowSprites still owns the per-floor face bitmask cache and
    // the building-keyed wallTexture/mullion maps that the raycaster
    // reads for every column crossing a window tile. As of Phase 6 it
    // no longer emits the interior billboard sprite — vignette
    // emission has moved to EmojiMount (see registerAt block below).
    // We call buildSprites purely for its side effects on those
    // caches and ignore the returned array.
    if (typeof WindowSprites !== 'undefined') {
      var _wsFloorId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '0';
      WindowSprites.buildSprites(
        _wsFloorId, floorData.grid, floorData.gridW, floorData.gridH,
        floorData.windowFaces || null,
        floorData.windowScenes || null
      );
      WindowSprites.animate(now);
    }

    // ── EmojiMount billboards (generic tile-mounted emoji tech) ─────
    // Registered mounts emit billboard sprites the same way the
    // legacy WindowSprites/DumpTruckSprites pipelines did.
    // buildSprites() caches per-floor; animate() ticks bob/glint on
    // the cached array in place so there's no per-frame allocation
    // once the scene is warm.
    //
    // Two classes of mount both flow through this one registry:
    //   - TYPE mounts (TERMINAL 💻 hologram) — registered at module
    //     load, applied to every tile of the matching kind.
    //   - INSTANCE mounts (window vignettes 🍺/🗝️/🕯️/🎴) — registered
    //     per (floorId, x, y) from floorData.windowScenes on floor
    //     transition. Retires `zBypassMode: 'depth'`: the recess
    //     knob on each instance mount drives z-bypass via the
    //     raycaster's EmojiMount.getMountAtOrType path.
    if (typeof EmojiMount !== 'undefined') {
      var _emFloorId = (typeof FloorManager !== 'undefined' && FloorManager.getCurrentFloorId)
        ? FloorManager.getCurrentFloorId() : '0';
      // Floor transition — drop stale instance mounts for the
      // previous floor and replay windowScenes → registerAt for the
      // current one. Idempotent: once _lastEmojiMountFloor matches,
      // this block is skipped on subsequent frames.
      if (_emFloorId !== _lastEmojiMountFloor) {
        if (_lastEmojiMountFloor != null) EmojiMount.clearFloor(_lastEmojiMountFloor);
        _registerWindowSceneMounts(_emFloorId, floorData);
        _lastEmojiMountFloor = _emFloorId;
      }
      var emojiSprites = EmojiMount.buildSprites(
        _emFloorId, floorData.grid, floorData.gridW, floorData.gridH
      );
      EmojiMount.animate(now);
      for (var emi = 0; emi < emojiSprites.length; emi++) {
        var emm = emojiSprites[emi];
        _sprites.push({
          x: emm.x,
          y: emm.y,
          emoji: emm.emoji,
          emojiOverlay: emm.emojiOverlay || null,
          scale: emm.scale,
          bobY: emm.bobY || 0,
          yAlt: emm.yAlt || 0,
          glow: emm.glow || null,
          glowRadius: emm.glowRadius || 0,
          groundLevel: emm.groundLevel === true,
          noFogFade: emm.noFogFade === true,
          maxDist: emm.maxDist || null
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

    // Raycaster pause gate — see docs/RAYCASTER_PAUSE_RESUME_ADR.md.
    // Captured-input Tier-2 minigames with viewportMode: 'takeover' call
    // Raycaster.pause() on mount to free the ~10-14ms/frame the world
    // cluster spends on DDA, sprites, fog, and sibling effects. While
    // paused we skip the ENTIRE world render: raycaster, spatial-debug,
    // sprite-layer positioning, light orbs, spray-viewport FX, cobweb
    // renderer, cobweb-node render, world popups. HUD + overlay
    // renderers (MinigameExit, DialogBox, Toast, Minimap below) stay
    // alive. World simulation (10Hz GameLoop AI + interrupt queue)
    // continues ticking independently — only the visual render pauses.
    // The minigame owns the backdrop: it either drawImage's
    // Raycaster.getPausedFrame() onto the canvas or composites its own.
    if (typeof Raycaster !== 'undefined' && Raycaster.isPaused && Raycaster.isPaused()) {
      // Paused: render nothing in the world layer. Minimap + HUD overlays
      // below this block still run normally.
    } else {
    // Raycaster render — apply combat zoom if active
    var combatZoom = (typeof CombatFX !== 'undefined') ? CombatFX.getZoom() : 1;
    var ctx = _canvas.getContext('2d');
    if (combatZoom !== 1) {
      ctx.save();
      ctx.translate(_canvas.width / 2, _canvas.height / 2);
      ctx.scale(combatZoom, combatZoom);
      ctx.translate(-_canvas.width / 2, -_canvas.height / 2);
    }

    // Screen shake: sinusoidal decay camera offset on combat hit
    var shakeOffset = (Player.tickShake) ? Player.tickShake(frameDt) : 0;

    // Weather particle update (before raycaster so renderBelow has fresh positions)
    if (typeof WeatherSystem !== 'undefined') {
      WeatherSystem.tick(frameDt, _canvas.width, _canvas.height);
    }

    Raycaster.render(
      { x: renderPos.x, y: renderPos.y, dir: renderPos.angle + p.lookOffset + shakeOffset,
        pitch: p.lookPitch || 0, bobY: MC.getBobY() },
      flo