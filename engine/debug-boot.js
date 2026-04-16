/**
 * DebugBoot — URL-driven boot shortcut for developer playtesting.
 *
 * Layer 5 — loaded LAST in index.html, after game.js and all data
 * scripts. Inert unless the URL contains ?debug=1 (set by test-harness.html).
 *
 * ── Injection strategy ───────────────────────────────────────────────
 * The key insight: Game.init() calls SplashScreen.start() at the very
 * END of init, AFTER wiring ScreenManager.onChange(_onScreenChange) and
 * registering every module. So if we MONKEY-PATCH SplashScreen.start
 * BEFORE Game.init runs (which is possible because SplashScreen is a
 * Layer 2 IIFE already defined when this script parses), then when
 * Game.init calls our patched start(), we can synchronously jump to
 * GAMEPLAY inside the same call stack — no race conditions, no
 * timing guesses, no waiting on DOMContentLoaded ordering.
 *
 *     game.js parses              → Game IIFE defined
 *     debug-boot.js parses        → patches SplashScreen.start
 *     DOMContentLoaded fires      → Game.init() runs
 *     Game.init calls patched     → our hook fires, skips to GAMEPLAY
 *       SplashScreen.start()        which triggers _initGameplay
 *     _initGameplay completes     → floor '0' loaded, player spawned
 *     onChange listener fires     → schedules FloorTransition.go(target)
 *
 * When active, a neon status chip is pinned to the top-right so the
 * operator can confirm at a glance that the harness took effect.
 */
var DebugBoot = (function () {
  'use strict';

  // ── URL parsing ─────────────────────────────────────────────────────

  function _parseParams() {
    var out = {};
    try {
      var usp = new URLSearchParams(window.location.search || '');
      usp.forEach(function (v, k) { out[k] = v; });
    } catch (e) {
      var q = (window.location.search || '').replace(/^\?/, '');
      if (q) {
        q.split('&').forEach(function (pair) {
          var kv = pair.split('=');
          out[decodeURIComponent(kv[0] || '')] = decodeURIComponent(kv[1] || '');
        });
      }
    }
    return out;
  }

  var PARAMS = _parseParams();
  var ACTIVE = PARAMS.debug === '1';

  if (ACTIVE) {
    console.log('%c[DebugBoot] ACTIVE', 'background:#b8116e;color:#fcff1a;padding:2px 8px;font-weight:bold', PARAMS);
  }

  function isActive() { return ACTIVE; }

  // ── Class → starter stat table (mirrors title-screen.js _deploy) ────
  var CLASS_STAT = {
    Blade:    { emoji: '\u2694\uFE0F',     stat: 'str',     amt: 2 },
    Ranger:   { emoji: '\uD83C\uDFF9',     stat: 'dex',     amt: 2 },
    Shadow:   { emoji: '\uD83D\uDD75\uFE0F', stat: 'stealth', amt: 2 },
    Sentinel: { emoji: '\uD83D\uDEE1\uFE0F', stat: 'hp',      amt: 4 },
    Seer:     { emoji: '\uD83D\uDD2E',     stat: 'energy',  amt: 3 },
    Wildcard: { emoji: '\uD83C\uDCCF',     stat: 'random',  amt: 3 }
  };

  function _injectProfile() {
    if (typeof Player === 'undefined' || !Player.state) {
      console.warn('[DebugBoot] Player not available — profile not injected');
      return;
    }
    var p = Player.state();
    p.callsign    = PARAMS.call || 'DEBUG';
    p.avatarName  = PARAMS['class'] || 'Blade';
    var spec = CLASS_STAT[p.avatarName] || CLASS_STAT.Blade;
    p.avatarEmoji = spec.emoji;
    p.avatarId    = p.avatarName.toLowerCase();

    switch (spec.stat) {
      case 'str':     p.str     += spec.amt; break;
      case 'dex':     p.dex     += spec.amt; break;
      case 'stealth': p.stealth += spec.amt; break;
      case 'hp':      p.maxHp   += spec.amt; p.hp = p.maxHp; break;
      case 'energy':  p.maxEnergy += spec.amt; p.energy = p.maxEnergy; break;
      case 'random':
        var keys = ['str', 'dex', 'stealth'];
        p[keys[Math.floor(Math.random() * 3)]] += 3;
        p.maxHp += Math.floor(Math.random() * 3);
        p.hp = p.maxHp;
        break;
    }
    console.log('[DebugBoot] profile injected:', p.callsign, '/', p.avatarName);
  }

  // ── Monologue / dialog suppression ──────────────────────────────────

  function _stubMonologue() {
    if (typeof MonologuePeek !== 'undefined' && MonologuePeek.play) {
      MonologuePeek._origPlay = MonologuePeek.play;
      MonologuePeek.play = function (id) {
        console.log('[DebugBoot] suppressed monologue:', id);
        return { then: function () { return this; } };
      };
    }
    // DeployCutscene is the canvas "deploying…" animation between
    // title and gameplay. If present, short-circuit its start().
    if (typeof DeployCutscene !== 'undefined' && DeployCutscene.start) {
      DeployCutscene._origStart = DeployCutscene.start;
      DeployCutscene.start = function (opts) {
        console.log('[DebugBoot] suppressed DeployCutscene.start');
        if (opts && typeof opts.onComplete === 'function') {
          // Fire completion immediately so any caller expecting it resolves
          setTimeout(opts.onComplete, 0);
        }
      };
    }
  }

  // ── SplashScreen + TitleScreen patches ──────────────────────────────
  //
  // These run at IIFE-parse time, BEFORE Game.init(). When Game.init
  // later calls SplashScreen.start(), our patched version takes over.

  function _patchScreens() {
    if (typeof SplashScreen === 'undefined' || !SplashScreen.start) {
      console.warn('[DebugBoot] SplashScreen not available — cannot patch');
      return false;
    }

    var originalStart = SplashScreen.start;
    SplashScreen.start = function () {
      console.log('[DebugBoot] intercepted SplashScreen.start — skipping to GAMEPLAY');

      // Hide any DOM splash overlay defensively.
      var overlay = document.getElementById('splash-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
      }

      // Inject the operative profile BEFORE _initGameplay runs so that
      // its "equip starter item based on avatarName" logic reads our
      // chosen class. _initGameplay is synchronously triggered by the
      // ScreenManager transition below.
      _injectProfile();

      // Jump SPLASH → GAMEPLAY. game.js's _onScreenChange matches
      // (oldState === SPLASH) and runs _initGameplay(), which loads
      // floor '0' and spawns the player.
      if (typeof ScreenManager !== 'undefined' && ScreenManager.toGameplay) {
        ScreenManager.toGameplay();
      } else {
        console.error('[DebugBoot] ScreenManager missing — falling back to real splash');
        originalStart.call(SplashScreen);
      }
    };

    // Also patch TitleScreen.start as a safety net: if anything else
    // in the boot path tries to enter TITLE while we're active, bounce
    // straight to GAMEPLAY instead.
    if (typeof TitleScreen !== 'undefined' && TitleScreen.start) {
      var origTitleStart = TitleScreen.start;
      TitleScreen.start = function () {
        console.log('[DebugBoot] intercepted TitleScreen.start — skipping to GAMEPLAY');
        if (typeof ScreenManager !== 'undefined' && ScreenManager.toGameplay) {
          _injectProfile();
          ScreenManager.toGameplay();
        } else {
          origTitleStart.call(TitleScreen);
        }
      };
    }

    return true;
  }

  // ── Post-land toggles ───────────────────────────────────────────────

  function _enableGodMode() {
    if (typeof Player === 'undefined' || !Player.damage) return;
    Player._origDamage = Player.damage;
    Player.damage = function (amt) {
      console.log('[DebugBoot] absorbed', amt, 'damage');
      return 0;
    };
    var p = Player.state();
    p.hp = p.maxHp;
  }

  function _giveGold(amount) {
    if (typeof CardAuthority === 'undefined' || !CardAuthority.setGold) return;
    CardAuthority.setGold(amount);
    console.log('[DebugBoot] set gold =', amount);
  }

  function _hideHUD() {
    var ids = [
      'hud', 'minimap-frame', 'card-tray',
      'debrief-feed', 'status-bar', 'quick-bar', 'status-effect-hud'
    ];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    var classes = ['.hud-panel', '.crt-panel'];
    classes.forEach(function (sel) {
      var nodes = document.querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) nodes[i].style.display = 'none';
    });
  }

  function _clearEnemies() {
    if (typeof FloorManager === 'undefined' || !FloorManager.getEnemies) return;
    var enemies = FloorManager.getEnemies();
    if (enemies && enemies.length !== undefined) {
      var n = enemies.length;
      enemies.length = 0;
      console.log('[DebugBoot] cleared', n, 'enemies on', FloorManager.getFloor());
    }
  }

  function _topUpVitals() {
    if (typeof Player === 'undefined' || !Player.state) return;
    var p = Player.state();
    p.hp       = p.maxHp;
    p.energy   = p.maxEnergy;
    p.battery  = p.maxBattery;
    if (typeof Player.resetFatigue === 'function') Player.resetFatigue();
  }

  function _logState() {
    try {
      var p = (typeof Player !== 'undefined' && Player.state) ? Player.state() : null;
      var f = (typeof FloorManager !== 'undefined' && FloorManager.getFloor)
        ? FloorManager.getFloor() : null;
      console.group('[DebugBoot] landed snapshot');
      console.log('floor:', f);
      if (p) {
        console.log('pos:', p.x + ',' + p.y, 'dir:', p.dir);
        console.log('hp:', p.hp + '/' + p.maxHp, 'energy:', p.energy + '/' + p.maxEnergy);
        console.log('callsign:', p.callsign, 'class:', p.avatarName);
        console.log('stats str/dex/stealth:', p.str, p.dex, p.stealth);
      }
      if (typeof CardAuthority !== 'undefined') {
        console.log('gold:', CardAuthority.getGold());
        console.log('hand:', CardAuthority.getHand().length, 'cards');
      }
      console.groupEnd();
    } catch (e) {
      console.warn('[DebugBoot] logState failed:', e);
    }
  }

  // ── Pressure Washing (Rung 0) ───────────────────────────────────────
  //
  // Collapses the "reload → walk to truck → grab hose → descend" loop
  // into "deploy → already spraying in ~2s". Each helper is defensive:
  // bails cleanly if the module isn't available (e.g. game loaded with
  // the PW subsystem stripped out for a lighter build).
  //
  // HoseState.attach signature: (buildingId, exteriorFloorId, currentFloorId, startX, startY)
  // For an exterior floor ("2"): building=current, exterior=current (hose
  // originates at the same floor, survives descent). For an interior
  // ("2.2"): building=current, exterior=parent ("2") — mirrors the normal
  // truck-pickup flow where the truck sits on the exterior and the hose
  // trails up the stairs.

  function _attachHose() {
    if (typeof HoseState === 'undefined' || !HoseState.attach) {
      console.warn('[DebugBoot] HoseState missing — auto-attach skipped');
      return;
    }
    if (typeof FloorManager === 'undefined' || !FloorManager.getFloor) return;
    var fId = FloorManager.getFloor();
    var parent = (FloorManager.parentId && FloorManager.parentId(fId)) || null;
    // Exterior (depth 1, no parent): attach to self as both building and
    // exterior. Interior/dungeon: parent is the exterior, current is the
    // building id.
    var originBuilding = fId;
    var originExterior = parent || fId;
    var pos = (typeof MC !== 'undefined' && MC.getGridPos) ? MC.getGridPos() : { x: 0, y: 0 };
    if (HoseState.isActive && HoseState.isActive()) {
      console.log('[DebugBoot] hose already active — skipping auto-attach');
      return;
    }
    HoseState.attach(originBuilding, originExterior, fId, pos.x, pos.y);
    console.log('[DebugBoot] hose attached', {
      originBuilding: originBuilding,
      originExterior: originExterior,
      currentFloor:   fId,
      startXY:        [pos.x, pos.y]
    });
  }

  function _seedGrimeAroundPlayer(r) {
    if (typeof CleaningSystem === 'undefined' || !CleaningSystem.debugSeedAt) {
      console.warn('[DebugBoot] CleaningSystem.debugSeedAt missing — grime seed skipped');
      return;
    }
    if (typeof MC === 'undefined' || !MC.getGridPos) return;
    if (typeof FloorManager === 'undefined' || !FloorManager.getFloor) return;
    var pos = MC.getGridPos();
    var fId = FloorManager.getFloor();
    var radius = r || 4;
    var count = 0;
    for (var dy = -radius; dy <= radius; dy++) {
      for (var dx = -radius; dx <= radius; dx++) {
        CleaningSystem.debugSeedAt(fId, pos.x + dx, pos.y + dy, 200);
        count++;
      }
    }
    console.log('[DebugBoot] seeded grime around', pos.x + ',' + pos.y,
                '(' + count + ' cells, radius ' + radius + ')');
  }

  function _setStartingNozzle(type) {
    if (typeof SpraySystem === 'undefined' || !SpraySystem.setNozzleType) {
      console.warn('[DebugBoot] SpraySystem missing — nozzle select skipped');
      return;
    }
    // SpraySystem.setNozzleType silently no-ops on unknown types; log so
    // the operator sees a misconfigured harness immediately.
    var before = SpraySystem.getNozzleType && SpraySystem.getNozzleType();
    SpraySystem.setNozzleType(type);
    var after = SpraySystem.getNozzleType && SpraySystem.getNozzleType();
    if (after !== type) {
      console.warn('[DebugBoot] nozzle set failed — unknown type', type, '(stayed on', after + ')');
    } else {
      console.log('[DebugBoot] starting nozzle', before, '→', after);
    }
  }

  function _applyPostLand() {
    console.log('[DebugBoot] applying post-land toggles');
    if (PARAMS.god === '1')       _enableGodMode();
    if (PARAMS.fullHp === '1')    _topUpVitals();
    if (PARAMS.gold)              _giveGold(parseInt(PARAMS.gold, 10) || 0);
    if (PARAMS.noEnemies === '1') _clearEnemies();
    if (PARAMS.hideHud === '1')   _hideHUD();
    if (PARAMS.logState === '1')  _logState();
    if (PARAMS.perfMon === '1' && typeof DebugPerfMonitor !== 'undefined') {
      DebugPerfMonitor.show();
      console.log('[DebugBoot] resource tracker mounted');
    }
    if (PARAMS.spatialRuler === '1' && typeof SpatialDebug !== 'undefined') {
      SpatialDebug.setEnabled(true);
      console.log('[DebugBoot] spatial ruler enabled');
    }

    // ── Pressure Washing order of operations ────────────────────────
    // 1) Flip infinite mode BEFORE attaching so even the first-step
    //    drain calc reads the flag.
    // 2) Attach the hose (hoseInf implies hose).
    // 3) Set the starting nozzle. SpraySystem accepts the setter at any
    //    point; doing it after attach just matches "pickup → pick nozzle".
    // 4) Seed grime last so the player has something to spray immediately.
    // 5) Mount the nozzle panel. It's a passive listener; order doesn't
    //    matter for correctness, but doing it last keeps the console log
    //    sequence human-readable.
    if (PARAMS.hoseInf === '1' && typeof HoseState !== 'undefined' && HoseState.setInfiniteMode) {
      HoseState.setInfiniteMode(true);
    }
    if (PARAMS.hose === '1' || PARAMS.hoseInf === '1') _attachHose();
    if (PARAMS.nozzle)                                  _setStartingNozzle(PARAMS.nozzle);
    if (PARAMS.grime === '1')                           _seedGrimeAroundPlayer(4);
    if (PARAMS.nozzlePanel === '1' && typeof DebugNozzlePanel !== 'undefined') {
      DebugNozzlePanel.mount();
      console.log('[DebugBoot] nozzle hotkey panel mounted (keys 1-5)');
    }
    if (PARAMS.lightPanel === '1' && typeof DebugLightingPanel !== 'undefined') {
      DebugLightingPanel.mount();
      console.log('[DebugBoot] lighting tuning panel mounted');
    }

    _updateBanner('READY @ ' + ((typeof FloorManager !== 'undefined') ? FloorManager.getFloor() : '?'));
  }

  // ── Floor warp ──────────────────────────────────────────────────────

  function _warpToTarget() {
    var target = (PARAMS.floor || '0').trim();
    if (!target || target === '0') {
      console.log('[DebugBoot] already on floor 0 — no warp needed');
      _applyPostLand();
      return;
    }
    if (typeof FloorTransition === 'undefined' || !FloorTransition.go) {
      console.warn('[DebugBoot] FloorTransition missing — cannot warp to', target);
      _applyPostLand();
      return;
    }
    var current = (typeof FloorManager !== 'undefined' && FloorManager.getFloor)
      ? FloorManager.getFloor() : '0';
    var dir = target.length >= current.length ? 'down' : 'up';

    console.log('[DebugBoot] warping', current, '→', target, '(' + dir + ')');
    _updateBanner('WARPING → ' + target);

    FloorTransition.go(target, dir);
    var poll = 0;
    var maxPoll = 120;
    var timer = setInterval(function () {
      poll++;
      if (!FloorTransition.isTransitioning()) {
        clearInterval(timer);
        setTimeout(_applyPostLand, 50);
      } else if (poll >= maxPoll) {
        clearInterval(timer);
        console.warn('[DebugBoot] transition poll timed out');
        _applyPostLand();
      }
    }, 100);
  }

  // ── Status banner (visible confirmation) ────────────────────────────

  var _banner = null;
  function _mountBanner() {
    if (_banner) return;
    _banner = document.createElement('div');
    _banner.id = 'debug-boot-banner';
    _banner.style.cssText = [
      'position:fixed', 'top:8px', 'right:8px', 'z-index:99999',
      'padding:4px 10px', 'background:rgba(184,17,110,0.92)',
      'color:#fcff1a', 'font-family:Courier New, monospace',
      'font-size:11px', 'font-weight:bold', 'letter-spacing:2px',
      'border:1px solid #2afce0',
      'box-shadow:0 0 12px rgba(252,80,198,0.6)',
      'pointer-events:none', 'text-transform:uppercase'
    ].join(';');
    _banner.textContent = '◆ DEBUG BOOT';
    (document.body || document.documentElement).appendChild(_banner);
  }
  function _updateBanner(txt) {
    if (!_banner) return;
    _banner.textContent = '◆ DEBUG ' + txt;
  }

  // ── Register ScreenManager onChange listener for the warp trigger ───

  function _registerWarpListener() {
    if (typeof ScreenManager === 'undefined' || !ScreenManager.onChange) return;
    var warped = false;
    ScreenManager.onChange(function (newState /*, oldState */) {
      if (warped) return;
      if (newState === ScreenManager.STATES.GAMEPLAY) {
        warped = true;
        console.log('[DebugBoot] GAMEPLAY entered — scheduling warp');
        setTimeout(_warpToTarget, 0);
      }
    });
  }

  // ── Boot sequence (runs at script parse time) ───────────────────────

  if (ACTIVE) {
    // 1. Stub monologues/cutscenes immediately so _initGameplay's
    //    deploy_dropoff call is a no-op.
    if (PARAMS.skipMono === '1') _stubMonologue();

    // 2. Register the warp listener BEFORE Game.init wires its own
    //    _onScreenChange. ScreenManager preserves listeners across
    //    init(), so this works even though ScreenManager.init() hasn't
    //    been called yet.
    _registerWarpListener();

    // 3. Patch SplashScreen.start (and TitleScreen.start as backup)
    //    so that when Game.init calls them at the end of init, we
    //    immediately jump to GAMEPLAY.
    if (PARAMS.skipSplash === '1') {
      var patched = _patchScreens();
      if (!patched) {
        console.warn('[DebugBoot] screen patch failed; splash will run normally');
      }
    }

    // 4. Mount the visible status banner once the DOM is ready.
    if (document.body) {
      _mountBanner();
    } else {
      window.addEventListener('DOMContentLoaded', _mountBanner);
    }
  }

  // ── Public API (handy from devtools console) ────────────────────────

  return {
    isActive: isActive,
    params: PARAMS,
    warpToTarget: _warpToTarget,
    enableGodMode: _enableGodMode,
    giveGold:      _giveGold,
    clearEnemies:  _clearEnemies,
    topUpVitals:   _topUpVitals,
    logState:      _logState,
    applyPostLand: _applyPostLand
  };
})();
