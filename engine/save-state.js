/**
 * SaveState — Layer 3 save/load orchestrator.
 *
 * Collects run state (seed, player, cards, per-floor diffs, quests, factions)
 * into the v1 schema frozen in docs/SEED_AND_SAVELOAD_DESIGN.md §4.2, then
 * hands the blob to SaveBackend. Load does the reverse.
 *
 * Design principle (§4.1): save DIFFS, not full state. Grids live in the
 * floor-blockout-*.js files; the save file only records what's changed from
 * authored baseline (cleanup, entities smashed/killed, explored mask).
 *
 * Layer 3 — depends on: SaveBackend, SeededRNG, SeedPhrase, FloorManager,
 * CardAuthority, Minimap, Player. Loaded after FloorManager in index.html.
 *
 * Milestone state (updated as slices land):
 *   M2.1 ✅ — schema frozen, serialize/deserialize header, slot I/O,
 *             full skeleton for clock/shops/workOrders/debuffs/respawn
 *   M2.2 ✅ — populate player, cards, clock, debuffs, respawn from live
 *             state. Shop + WorkOrderSystem gained serialize()/deserialize()
 *             (2026-04-15) and are wired in here. Quests/Factions remain
 *             forward-compat stubs until their owning modules exist.
 *   M2.3 ✅ — per-floor diffs (explored, cleanup, torches, containers,
 *             traps). Shipped across five subslices 2026-04-14/15:
 *               M2.3a CleaningSystem blood + grime (base64 Uint8Array
 *                     per allocated tile).
 *               M2.3b TorchState per-floor records (tile + 3-slot fuel)
 *                     with _loaded gate that suppresses re-seed +
 *                     hero-damage roll and grid-patches from torch.tile
 *                     on post-load regen.
 *               M2.3c Minimap.explored bitmap + CrateSystem containers.
 *               M2.3d TrapRearm {consumed,rearmed,total} with
 *                     onFloorLoad grid-patch for consumed-but-not-
 *                     rearmed positions.
 *               M2.3e retired superseded stub fields (cleanedTiles,
 *                     bloodTiles, armedTraps, disarmedTraps, sealedCrates,
 *                     chestPhases) in _emptyFloorDiff. Forward-compat
 *                     stubs retained for modules that don't exist yet
 *                     (doors, buttons, puzzles, vermin, formidables,
 *                     entities) — see _emptyFloorDiff for per-key status.
 *   M2.4 ✅ — autosave hooks (FloorTransition onAfter already wired;
 *             added bonfire-rest + bed-wake + curfew-onComplete).
 *             getResidenceAnchor() in this file: priority bonfire →
 *             _ACT_RESIDENCES[act] → "1.6". Death + curfew in game.js
 *             now call it instead of hardcoded "1.6".
 *   M2.5 ⏳ — title-screen slot UI + buildVersion gate + retry-with-seed
 *
 * Schema v1 top-level keys (see docs/SEED_AND_SAVELOAD_DESIGN.md §4 and
 * the three game-loop docs referenced from it):
 *   version, buildVersion, runSeed, seedPhrase, createdAt, playtimeMs,
 *   currentFloor, player, cards, clock, shops, workOrders, debuffs,
 *   respawn, quests, factions, floors
 */
var SaveState = (function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════
  // Schema — DO NOT RENUMBER. Bump on breaking changes + migrate on load.
  // ════════════════════════════════════════════════════════════════════════

  var SCHEMA_VERSION = 1;

  // Bump when authored grids change shape (e.g. Floor 2 rebuild). The load
  // flow compares saved buildVersion to this and prompts "Load anyway?" if
  // they differ. Unrelated to SCHEMA_VERSION (the JSON shape itself).
  var BUILD_VERSION = '0.14.2';

  var SLOT_AUTOSAVE = 'autosave';
  var SLOT_MANUAL   = ['slot_0', 'slot_1', 'slot_2'];

  // ════════════════════════════════════════════════════════════════════════
  // Run-scoped bookkeeping
  // ════════════════════════════════════════════════════════════════════════

  var _runStartedAt = 0;   // ms timestamp — used to compute playtime on save
  var _playtimeMs   = 0;   // accumulated playtime, excluding pause

  // Resume handshake between TitleScreen and Game.
  //
  // When the player selects a slot on the title screen, TitleScreen calls
  // SaveState.load() (which populates all subsystems in-place) and then
  // setResuming(slotId) before triggering ScreenManager.toGameplay().
  //
  // Game._initGameplay() calls consumeResuming() exactly once at the top;
  // a truthy return means "skip fresh-run seeding". The flag auto-clears,
  // so retry-after-death paths (which re-enter GAMEPLAY) behave as fresh
  // runs unless the player explicitly loads again.
  //
  // This replaces the old window._loadedFromSave shim — a module-owned
  // piece of state is easier to reason about than a bag on the global
  // object, and it survives eventual minification + strict-mode globals.
  var _resumingSlot = null;

  function setResuming(slotId) { _resumingSlot = slotId || null; }
  function isResuming()        { return _resumingSlot !== null; }
  function getResumingSlot()   { return _resumingSlot; }
  function consumeResuming() {
    var s = _resumingSlot;
    _resumingSlot = null;
    return s;
  }

  function beginRun() {
    _runStartedAt = Date.now();
    _playtimeMs   = 0;
  }

  function _currentPlaytime() {
    if (_runStartedAt === 0) return _playtimeMs;
    return _playtimeMs + (Date.now() - _runStartedAt);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Serialize — collect current run state into the v1 schema blob
  // ════════════════════════════════════════════════════════════════════════

  function _serialize() {
    var runSeed = (typeof SeededRNG !== 'undefined' && SeededRNG.runSeed)
      ? SeededRNG.runSeed() : 0;
    var phrase = (typeof SeedPhrase !== 'undefined' && SeedPhrase.encode)
      ? SeedPhrase.encode(runSeed) : '';
    var floorId = (typeof FloorManager !== 'undefined' && FloorManager.getFloor)
      ? FloorManager.getFloor() : '1';

    return {
      version:      SCHEMA_VERSION,
      buildVersion: BUILD_VERSION,
      runSeed:      (runSeed >>> 0).toString(16),
      seedPhrase:   phrase,
      createdAt:    Date.now(),
      playtimeMs:   _currentPlaytime(),
      currentFloor: floorId,

      // Player + card/inventory state (M2.2 hydrates from live modules)
      player:   _serializePlayer(),
      cards:    _serializeCards(),

      // World-time spine — everything temporal keys off this (§5.5)
      clock: _serializeClock(),

      // Shop refresh state per faction (SHOP_REFRESH_ECONOMY §6.1)
      shops: _serializeShops(),

      // Work order registry (CHEST_RESTOCK_AND_WORK_ORDERS §3/§4.5)
      workOrders: _serializeWorkOrders(),

      // Active debuff timers (CORE_GAME_LOOP_AND_JUICE §5.6)
      debuffs: _serializeDebuffs(),

      // Respawn anchor (last-rested bonfire/bed/hearth) — death:reset uses this
      respawn: _serializeRespawn(),

      // Forward-compat placeholders — engine modules TBD
      quests:   _serializeQuests(),
      factions: _serializeFactions(),

      // Minimap breadcrumb (ordered ancestor path — separate from
      // per-floor diffs because it describes traversal, not floor state).
      floorStack: _serializeFloorStack(),

      // Per-floor diffs (explored, cleanup, entities, traps, chests, vermin, …)
      floors: _serializeFloors()
    };
  }

  function _serializeFloorStack() {
    if (typeof Minimap !== 'undefined' && Minimap.serializeState) {
      var snap = Minimap.serializeState();
      return Array.isArray(snap.floorStack) ? snap.floorStack.slice() : [];
    }
    return [];
  }

  // ──────────────────────────────────────────────────────────────────────
  // Skeleton serializers — M2.1 ships empty but structurally-valid shapes
  // so the load path never crashes on missing keys. M2.2/M2.3 replace each
  // stub with live reads from its owning module.
  // ──────────────────────────────────────────────────────────────────────

  function _serializePlayer() {
    // No Player module loaded (e.g. early boot / tests) — emit defaults.
    if (typeof Player === 'undefined' || !Player.state) {
      return {
        x: 0, y: 0, facing: 0,
        hp: 0, maxHp: 0,
        stats: {},
        debuffs: [],
        flags: {},
        callsign: '', class: ''
      };
    }
    var s = Player.state();
    return {
      x:        s.x | 0,
      y:        s.y | 0,
      facing:   s.dir | 0,
      hp:       s.hp,
      maxHp:    s.maxHp,
      stats: {
        str:              s.str,
        dex:              s.dex,
        stealth:          s.stealth,
        energy:           s.energy,
        maxEnergy:        s.maxEnergy,
        battery:          s.battery,
        maxBattery:       s.maxBattery,
        playerFatigue:    s.playerFatigue,
        maxFatigue:       s.maxFatigue,
        fatigueThreshold: s.fatigueThreshold
      },
      // TitleScreen / DebugBoot attach these dynamically to _state
      callsign:   s.callsign   || '',
      class:      s.avatarName || '',
      avatarId:   s.avatarId   || '',
      // Debuffs are structured [{id, daysRemaining}, …] on Player._state
      debuffs: Array.isArray(s.debuffs)
        ? s.debuffs.map(function (d) { return { id: d.id, daysRemaining: d.daysRemaining | 0 }; })
        : [],
      // Narrative / one-shot flags (story beats, tutorial progress, etc.)
      flags: s.flags ? JSON.parse(JSON.stringify(s.flags)) : {}
    };
  }

  function _serializeCards() {
    // Delegate to CardAuthority — it already owns a deep-copy serialize().
    if (typeof CardAuthority !== 'undefined' && CardAuthority.serialize) {
      return CardAuthority.serialize();
    }
    return {
      hand: [], deck: [], backup: [],
      bag: [], stash: [], equipped: [null, null, null],
      gold: 0
    };
  }

  function _serializeClock() {
    // DayCycle exposes getDay/getHour/getMinute/isHeroDay. Derive the
    // save-schema fields from those (DayCycle doesn't expose a
    // normalized 0..1 timeOfDayPct or a 0..2 heroCyclePos directly).
    if (typeof DayCycle === 'undefined' || !DayCycle.getDay) {
      return { day: 0, timeOfDayPct: 0, heroCyclePos: 0 };
    }
    var day    = DayCycle.getDay()    | 0;
    var hour   = DayCycle.getHour()   | 0;
    var minute = DayCycle.getMinute() | 0;
    return {
      day:          day,
      timeOfDayPct: ((hour * 60 + minute) / 1440),
      heroCyclePos: day % 3
    };
  }

  function _serializeShops() {
    // Per-faction `lastRefreshDay + inventory` cache is a forward-compat
    // placeholder for a future multi-faction persistence refactor — the
    // engine currently rebuilds inventory deterministically on each
    // `Shop.open(faction, floor)` call from (faction, floor, repTier,
    // cycleIdx), so there's nothing to store per-faction today. What we
    // DO need to capture is the currently-open shop's live state (slot
    // `sold` flags in particular — losing those on reload would let a
    // player re-buy cards they already purchased).
    var current = (typeof Shop !== 'undefined' && Shop.serialize) ? Shop.serialize() : null;
    return {
      tide:      { lastRefreshDay: 0, inventory: [] },
      foundry:   { lastRefreshDay: 0, inventory: [] },
      admiralty: { lastRefreshDay: 0, inventory: [] },
      current:   current
    };
  }

  function _serializeWorkOrders() {
    // `{available, accepted, completed}` was a forward-compat stub shape;
    // the actual engine layout is a floor-keyed `_orders` map plus three
    // scalar counters. Persist the real shape under a `state` key and
    // keep the stub fields as empty arrays for schema continuity.
    var state = (typeof WorkOrderSystem !== 'undefined' && WorkOrderSystem.serialize)
      ? WorkOrderSystem.serialize()
      : null;
    return {
      available: [],
      accepted:  [],
      completed: [],
      state:     state
    };
  }

  function _serializeDebuffs() {
    // Player.getDebuffs() is the source of truth — returns
    // [{id, daysRemaining}, …] with id ∈ {GROGGY, SORE, HUMILIATED, SHAKEN}.
    // Save schema uses per-id slots for stable JSON shape + easy migration;
    // we derive expiresDay from DayCycle.getDay() + daysRemaining so that
    // loads resolve timers against the restored world-time (not wallclock).
    var out = {
      groggy:     { active: false, expiresDay: 0 },
      sore:       { active: false, expiresDay: 0 },
      humiliated: { active: false, expiresDay: 0 },
      shaken:     { active: false, expiresDay: 0 }
    };
    if (typeof Player === 'undefined' || !Player.getDebuffs) return out;
    var currentDay = (typeof DayCycle !== 'undefined' && DayCycle.getDay) ? DayCycle.getDay() : 0;
    var list = Player.getDebuffs() || [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      var key = String(d.id || '').toLowerCase();
      if (out.hasOwnProperty(key)) {
        out[key] = { active: true, expiresDay: currentDay + (d.daysRemaining | 0) };
      }
    }
    return out;
  }

  function _serializeRespawn() {
    // HazardSystem owns the per-floor bonfire map. Save the whole map so a
    // mid-run transition doesn't lose shallower-floor anchors.
    if (typeof HazardSystem !== 'undefined' && HazardSystem.getBonfirePositions) {
      return { bonfireCache: HazardSystem.getBonfirePositions() };
    }
    return { bonfireCache: null };
  }

  function _serializeQuests()   { return {}; }
  function _serializeFactions() { return {}; }

  function _serializeFloors() {
    // Aggregate per-floor diff map. Each floor id maps to an object with
    // the full shape (fields not yet tracked ship as empty arrays + TODO).
    //
    // Inputs merged here (M2.3c):
    //   • Minimap.serializeState() → explored bitmap per floor
    //   • CrateSystem.serializeFloor(fid) → container snapshots per floor
    //
    // TODO (M2.3 later slices): cleanedTiles, bloodTiles, armedTraps,
    //   disarmedTraps, relockedDoors, unlockedDoors, resetButtons,
    //   scrambledPuzzles, sealedCrates, chestPhases, verminSpawns,
    //   verminLastRefreshDay, reanimatedFormidables, entities — owning
    //   modules TBD. Stubbed to empty so the load path doesn't crash.
    var out = {};

    // Pull minimap snapshot first — it sets the known floor id set.
    var mmSnap = (typeof Minimap !== 'undefined' && Minimap.serializeState)
      ? Minimap.serializeState() : { floors: {} };
    if (mmSnap.floors) {
      for (var fid in mmSnap.floors) {
        if (mmSnap.floors.hasOwnProperty(fid)) {
          out[fid] = _emptyFloorDiff();
          out[fid].explored = mmSnap.floors[fid].explored || {};
        }
      }
    }

    // Layer container snapshots onto each floor (including any floors the
    // minimap hasn't seen yet — e.g. a shop that was entered but never
    // mapped).
    // Walk every floor id either minimap has OR any known stack member.
    var seenFloors = {};
    for (var fid2 in out) if (out.hasOwnProperty(fid2)) seenFloors[fid2] = true;
    var stack = mmSnap.floorStack || [];
    for (var i = 0; i < stack.length; i++) seenFloors[stack[i]] = true;

    if (typeof CrateSystem !== 'undefined' && CrateSystem.serializeFloor) {
      for (var fid3 in seenFloors) {
        if (!seenFloors.hasOwnProperty(fid3)) continue;
        if (!out[fid3]) out[fid3] = _emptyFloorDiff();
        var containers = CrateSystem.serializeFloor(fid3) || [];
        out[fid3].containers = containers;
      }
    }

    // M2.3a — CleaningSystem: discrete blood map + sub-tile grime grids
    // (base64-encoded Uint8Array per allocated tile). Only floors with
    // real state get populated; empty floors stay on the stub.
    if (typeof CleaningSystem !== 'undefined' && CleaningSystem.serialize) {
      for (var fid4 in seenFloors) {
        if (!seenFloors.hasOwnProperty(fid4)) continue;
        var cleanSnap = CleaningSystem.serialize(fid4);
        if (!cleanSnap) continue;
        if (!out[fid4]) out[fid4] = _emptyFloorDiff();
        out[fid4].blood  = cleanSnap.blood  || {};
        out[fid4].grime  = cleanSnap.grime  || {};
        out[fid4].seeded = !!cleanSnap.seeded;
      }
    }

    // M2.3b — TorchState: per-floor torch slot records (tile state, 3-slot
    // fuel array). Plain JSON, no binary. Only floors that registered
    // torches get serialized; empty floors stay on the stub.
    if (typeof TorchState !== 'undefined' && TorchState.serialize) {
      for (var fid5 in seenFloors) {
        if (!seenFloors.hasOwnProperty(fid5)) continue;
        var torchSnap = TorchState.serialize(fid5);
        if (!torchSnap) continue;
        if (!out[fid5]) out[fid5] = _emptyFloorDiff();
        out[fid5].torches = torchSnap;
      }
    }

    // M2.3d — TrapRearm: per-floor {consumed, rearmed, total}. Floors
    // with a recorded _total (visited at least once) get serialized even
    // if no traps were consumed yet — the count matters for readiness.
    if (typeof TrapRearm !== 'undefined' && TrapRearm.serialize) {
      for (var fid6 in seenFloors) {
        if (!seenFloors.hasOwnProperty(fid6)) continue;
        var trapSnap = TrapRearm.serialize(fid6);
        if (!trapSnap) continue;
        if (!out[fid6]) out[fid6] = _emptyFloorDiff();
        out[fid6].traps = trapSnap;
      }
    }

    return out;
  }

  function _emptyFloorDiff() {
    // Shape of a per-floor diff (M2.3e, 2026-04-15).
    //
    // Reality-matched fields (M2.3a–d): owner module + shape aligned with
    // what that module actually serializes.
    //   explored     — Minimap._floorCache              (M2.3c, 2026-04-14)
    //   containers   — CrateSystem.serializeFloor()     (M2.3c, 2026-04-14)
    //   blood/grime/seeded — CleaningSystem.serialize() (M2.3a)
    //   torches      — TorchState.serialize()           (M2.3b)
    //   traps        — TrapRearm.serialize()            (M2.3d)
    //
    // Retired 2026-04-15 (M2.3e): fields whose shape never matched an owning
    // module and whose responsibilities are now covered by the reality-matched
    // keys above — cleanedTiles/bloodTiles (→ blood+grime), armedTraps/
    // disarmedTraps (→ traps), sealedCrates/chestPhases (→ containers).
    //
    // Forward-compat stubs kept for modules that don't exist yet:
    //   relockedDoors/unlockedDoors — DoorContracts has no per-floor lock
    //     state serialize hook yet; format TBD.
    //   resetButtons/scrambledPuzzles — modules don't exist.
    //   verminSpawns/verminLastRefreshDay/reanimatedFormidables — post-Jam.
    //   entities — needs EnemyAI + NpcSystem serialize (separate slice).
    return {
      explored:              {},  // Minimap: sparse "x,y" → true bitmap
      containers:            [],  // CrateSystem.serializeFloor() output
      blood:                 {},  // CleaningSystem: "x,y" → discrete blood level 1-3
      grime:                 {},  // CleaningSystem: "x,y" → { res, b64(Uint8Array) }
      seeded:                false, // CleaningSystem.isSeeded flag
      torches:               {},  // TorchState: "x,y" → {x,y,tile,biome,idealFuel,slots[3]}
      traps:                 null, // TrapRearm: { consumed, rearmed, total } or null
      // Forward-compat stubs — owning modules not written yet (see above)
      relockedDoors:         [],
      unlockedDoors:         [],
      resetButtons:          [],
      scrambledPuzzles:      [],
      verminSpawns:          [],
      verminLastRefreshDay:  0,
      reanimatedFormidables: [],
      entities:              []
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Deserialize — hydrate run state from a save blob
  // ════════════════════════════════════════════════════════════════════════

  function _deserialize(blob) {
    if (!blob || typeof blob !== 'object') {
      console.warn('[SaveState] deserialize: blob is not an object');
      return false;
    }
    if (blob.version !== SCHEMA_VERSION) {
      console.warn('[SaveState] deserialize: unsupported version ' + blob.version);
      return false;
    }

    // Restore seed first — everything downstream depends on it.
    var runSeed = parseInt(blob.runSeed || '0', 16) >>> 0;
    if (typeof SeededRNG !== 'undefined' && SeededRNG.beginRun) {
      SeededRNG.beginRun(runSeed);
    }
    _playtimeMs   = blob.playtimeMs | 0;
    _runStartedAt = Date.now();

    // Stash the full blob so M2.3 per-floor hydrators (run during
    // FloorManager.generate) can pull their slice when each floor loads.
    _lastLoadedBlob = blob;

    // ── M2.2 hydration ────────────────────────────────────────────────
    // Player → position, facing, hp, maxHp, stats, callsign, class, debuffs
    if (blob.player && typeof Player !== 'undefined' && Player.state) {
      var ps  = Player.state();
      var pbl = blob.player;
      if (Player.setPos) Player.setPos(pbl.x | 0, pbl.y | 0);
      if (Player.setDir) Player.setDir(pbl.facing | 0);
      if (typeof pbl.hp    === 'number') ps.hp    = pbl.hp;
      if (typeof pbl.maxHp === 'number') ps.maxHp = pbl.maxHp;
      if (pbl.stats) {
        ['str','dex','stealth','energy','maxEnergy','battery','maxBattery',
         'playerFatigue','maxFatigue','fatigueThreshold'].forEach(function (k) {
          if (typeof pbl.stats[k] === 'number') ps[k] = pbl.stats[k];
        });
      }
      ps.callsign   = pbl.callsign   || '';
      ps.avatarName = pbl['class']   || '';
      ps.avatarId   = pbl.avatarId   || '';
      ps.flags      = pbl.flags ? JSON.parse(JSON.stringify(pbl.flags)) : {};
      // Debuffs — clear then re-apply via Player.applyDebuff so its own
      // tick/apply/remove event plumbing stays consistent.
      if (Array.isArray(ps.debuffs)) ps.debuffs.length = 0;
      if (Array.isArray(pbl.debuffs) && Player.applyDebuff) {
        pbl.debuffs.forEach(function (d) {
          Player.applyDebuff(d.id, d.daysRemaining | 0);
        });
      }
    }

    // Cards → CardAuthority owns its own deserialize (emits all events).
    if (blob.cards && typeof CardAuthority !== 'undefined' && CardAuthority.deserialize) {
      CardAuthority.deserialize(blob.cards);
    }

    // Clock → push day/hour/minute back into DayCycle. timeOfDayPct is
    // derived on save, so we reverse: pct * 1440 → hour/min.
    if (blob.clock && typeof DayCycle !== 'undefined' && DayCycle.setTime) {
      var c = blob.clock;
      var totalMin = Math.round((c.timeOfDayPct || 0) * 1440);
      var hr  = Math.max(0, Math.min(23, Math.floor(totalMin / 60)));
      var min = Math.max(0, Math.min(59, totalMin % 60));
      DayCycle.setTime(c.day | 0, hr, min);
    }

    // Respawn → push bonfire map back into HazardSystem.
    if (blob.respawn && blob.respawn.bonfireCache
        && typeof HazardSystem !== 'undefined' && HazardSystem.setBonfirePositions) {
      HazardSystem.setBonfirePositions(blob.respawn.bonfireCache);
    }

    // ── M2.3c per-floor hydration ─────────────────────────────────────
    // Minimap — restore explored bitmaps + floorStack BEFORE FloorManager
    // regenerates, so enterFloor() on the active floor picks up the cached
    // _explored map instead of starting fresh.
    if (typeof Minimap !== 'undefined' && Minimap.deserializeState) {
      var mmFloors = {};
      if (blob.floors) {
        for (var fid in blob.floors) {
          if (blob.floors.hasOwnProperty(fid)) {
            mmFloors[fid] = { explored: blob.floors[fid].explored || {} };
          }
        }
      }
      Minimap.deserializeState({
        floors:       mmFloors,
        floorStack:   Array.isArray(blob.floorStack) ? blob.floorStack : [],
        currentFloor: blob.currentFloor || null
      });
    }

    // CrateSystem — replay container state per floor. Safe to restore all
    // floors upfront (CrateSystem keys by floorId, doesn't care which is
    // active). The active floor's live references will be valid as soon
    // as FloorManager regenerates it.
    if (blob.floors && typeof CrateSystem !== 'undefined' && CrateSystem.deserializeFloor) {
      for (var fid2 in blob.floors) {
        if (!blob.floors.hasOwnProperty(fid2)) continue;
        var slice = blob.floors[fid2];
        if (slice && Array.isArray(slice.containers)) {
          CrateSystem.deserializeFloor(fid2, slice.containers);
        }
      }
    }

    // M2.3a — CleaningSystem: restore blood + grime for every saved floor.
    // Floor-keyed, like CrateSystem; does not depend on FloorManager having
    // regenerated the floor yet. The seeded flag prevents a re-visit from
    // triggering another seedFromCorpses pass.
    if (blob.floors && typeof CleaningSystem !== 'undefined' && CleaningSystem.deserialize) {
      for (var fidC in blob.floors) {
        if (!blob.floors.hasOwnProperty(fidC)) continue;
        var sliceC = blob.floors[fidC];
        if (!sliceC) continue;
        CleaningSystem.deserialize(fidC, {
          blood:  sliceC.blood  || {},
          grime:  sliceC.grime  || {},
          seeded: !!sliceC.seeded
        });
      }
    }

    // M2.3b — TorchState: restore per-floor torch records. The _loaded
    // flag set by deserialize short-circuits registerFloor's baseline
    // scan and applyHeroDamage's re-roll on the next FloorManager
    // generation pass — registerFloor instead patches the fresh grid
    // from saved torch.tile values.
    if (blob.floors && typeof TorchState !== 'undefined' && TorchState.deserialize) {
      for (var fidT in blob.floors) {
        if (!blob.floors.hasOwnProperty(fidT)) continue;
        var sliceT = blob.floors[fidT];
        if (!sliceT) continue;
        TorchState.deserialize(fidT, sliceT.torches || null);
      }
    }

    // M2.3d — TrapRearm: restore per-floor {consumed, rearmed, total}.
    // Setting _total[floorId] serves as the "already loaded" sentinel
    // for onFloorLoad, which then grid-patches consumed-but-not-rearmed
    // positions to TILES.EMPTY on the next FloorManager regen.
    if (blob.floors && typeof TrapRearm !== 'undefined' && TrapRearm.deserialize) {
      for (var fidR in blob.floors) {
        if (!blob.floors.hasOwnProperty(fidR)) continue;
        var sliceR = blob.floors[fidR];
        if (!sliceR) continue;
        TrapRearm.deserialize(fidR, sliceR.traps || null);
      }
    }

    // Shop → restore only the currently-open shop's live state.
    // `current` is null when no shop was open at save time; the stub
    // per-faction fields (tide/foundry/admiralty) are forward-compat
    // placeholders and ignored here.
    if (blob.shops && blob.shops.current
        && typeof Shop !== 'undefined' && Shop.deserialize) {
      Shop.deserialize(blob.shops.current);
    }

    // WorkOrders → restore the floor-keyed orders map + cycle/counter
    // triple. `state` is null for saves made before any orders were
    // posted; legacy `{available, accepted, completed}` fields are
    // ignored (they were never populated).
    if (blob.workOrders && blob.workOrders.state
        && typeof WorkOrderSystem !== 'undefined' && WorkOrderSystem.deserialize) {
      WorkOrderSystem.deserialize(blob.workOrders.state);
    }

    // quests / factions / other per-floor diff categories → M2.3+
    // hydrators pull from _lastLoadedBlob as their owning modules come
    // online.

    return true;
  }

  // Most recent blob returned by a successful load. Consumers read their
  // slice via getLoadedBlob() as M2.2 hydrators land.
  var _lastLoadedBlob = null;
  function getLoadedBlob() { return _lastLoadedBlob; }

  // ════════════════════════════════════════════════════════════════════════
  // Residence-anchor resolver (M2.4)
  //
  // Both combat death and curfew collapse route the player to a "home"
  // floor. The anchor is act-aware:
  //   Act 1 → "1.6" (Gleaner's Home)
  //   Later acts → the most-recently-rested bonfire for the current
  //     act's floor tree, or the act's fixed residence (detective flat,
  //     church nave, etc. — exact IDs defined when those acts ship).
  //
  // A single function owns this mapping so death, curfew, and any future
  // teleport-to-home mechanic all resolve the same destination.
  // ════════════════════════════════════════════════════════════════════════

  // Per-act hardcoded residences. Only Act 1 exists today; later acts
  // add entries here keyed by the act number. The resolver falls through
  // to Act 1's value if the requested act isn't mapped.
  var _ACT_RESIDENCES = {
    1: '1.6'    // Gleaner's Home
    // 2: '3.1' — detective flat (placeholder, TBD)
    // 3: '4.2' — church nave   (placeholder, TBD)
  };

  /**
   * Resolve the act-aware residence anchor.
   *
   * Priority:
   *   1. Most-recently-rested bonfire on the current exterior tree (from
   *      HazardSystem.getBonfirePositions). The "current exterior tree"
   *      is the top-level segment of currentFloor — e.g. floor "2.2.1"
   *      is on tree "2", so any bonfire rest on "2" or "2.x" qualifies.
   *   2. The act's fixed residence (from _ACT_RESIDENCES).
   *   3. Fallback: "1.6".
   *
   * @returns {string} floor ID
   */
  function getResidenceAnchor() {
    // Determine current act (future: Player.getFlag('currentAct')).
    // For now only Act 1 exists; default to 1.
    var act = 1;
    if (typeof Player !== 'undefined' && Player.getFlag) {
      act = Player.getFlag('currentAct') || 1;
    }

    // Attempt bonfire-based anchor: most recent rest on the current
    // exterior tree. This lets bonfires on later floors upgrade the
    // home anchor without manual assignment.
    if (typeof HazardSystem !== 'undefined' && HazardSystem.getBonfirePositions) {
      var bfMap = HazardSystem.getBonfirePositions();
      if (bfMap && typeof bfMap === 'object') {
        // Current exterior tree root = first segment of currentFloor.
        var curFloor = (typeof FloorManager !== 'undefined' && FloorManager.getFloor)
          ? FloorManager.getFloor() : '';
        var treeRoot = curFloor ? curFloor.split('.')[0] : '';

        // Walk bonfire positions; prefer deepest floor on the same tree
        // (closest to where the player was working).
        var bestFloor = null;
        var bestDepth = -1;
        for (var bfFloorId in bfMap) {
          if (!bfMap.hasOwnProperty(bfFloorId)) continue;
          if (treeRoot && bfFloorId.split('.')[0] !== treeRoot) continue;
          var d = bfFloorId.split('.').length;
          if (d > bestDepth) {
            bestDepth = d;
            bestFloor = bfFloorId;
          }
        }
        if (bestFloor) return bestFloor;
      }
    }

    // Fall back to the act's fixed residence.
    return _ACT_RESIDENCES[act] || _ACT_RESIDENCES[1] || '1.6';
  }

  // ════════════════════════════════════════════════════════════════════════
  // Public slot API — used by title-screen UI and autosave hooks
  // ════════════════════════════════════════════════════════════════════════

  function save(slot) {
    if (typeof SaveBackend === 'undefined') {
      console.error('[SaveState] save: SaveBackend not loaded');
      return false;
    }
    var blob = _serialize();
    var ok = SaveBackend.write(slot, blob);
    if (ok) console.log('[SaveState] saved "' + slot + '" (' + blob.seedPhrase + ' @ ' + blob.currentFloor + ')');
    return ok;
  }

  function load(slot) {
    if (typeof SaveBackend === 'undefined') return false;
    var blob = SaveBackend.read(slot);
    if (!blob) return false;
    return _deserialize(blob);
  }

  function remove(slot) {
    if (typeof SaveBackend === 'undefined') return false;
    return SaveBackend.remove(slot);
  }

  function peek(slot) {
    // Cheap header read for save-slot UI thumbnails.
    if (typeof SaveBackend === 'undefined') return null;
    var blob = SaveBackend.read(slot);
    if (!blob) return null;
    return {
      slot:         slot,
      seedPhrase:   blob.seedPhrase || '',
      callsign:     (blob.player && blob.player.callsign) || '',
      class:        (blob.player && blob.player.class) || '',
      currentFloor: blob.currentFloor || '',
      playtimeMs:   blob.playtimeMs | 0,
      createdAt:    blob.createdAt || 0,
      buildVersion: blob.buildVersion || '',
      version:      blob.version || 0
    };
  }

  function autosave() {
    return save(SLOT_AUTOSAVE);
  }

  function listSlots() {
    if (typeof SaveBackend === 'undefined') return [];
    return SaveBackend.list();
  }

  // ════════════════════════════════════════════════════════════════════════
  // Public API
  // ════════════════════════════════════════════════════════════════════════

  return Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    BUILD_VERSION:  BUILD_VERSION,
    SLOT_AUTOSAVE:  SLOT_AUTOSAVE,
    SLOT_MANUAL:    SLOT_MANUAL,

    beginRun:  beginRun,
    save:      save,
    load:      load,
    remove:    remove,
    peek:      peek,
    autosave:  autosave,
    listSlots: listSlots,

    // Resume handshake (TitleScreen → Game)
    setResuming:     setResuming,
    isResuming:      isResuming,
    getResumingSlot: getResumingSlot,
    consumeResuming: consumeResuming,

    getLoadedBlob: getLoadedBlob,

    // M2.4 — residence-anchor resolver (death + curfew + future teleports)
    getResidenceAnchor: getResidenceAnchor,

    // Exposed for tests + debug HUD
    _serialize:   _serialize,
    _deserialize: _deserialize
  });
})();
