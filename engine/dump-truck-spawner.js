/**
 * DumpTruckSpawner — dynamic placement of the cleaning truck on hero days.
 *
 * On each faction's hero day the dump truck spawns on the faction's
 * exterior floor, adjacent to the building entrance that leads to the
 * faction's dungeons.  When no hero day is active (or after the hero
 * run resolves) the truck parks at its default resting position on
 * Floor 1 near the Gleaner's Home (1.6) door.
 *
 * The module also spawns / despawns a coworker NPC (dragon-head
 * hazmat worker, ♥ Heart faction) who stands by the truck and barks.
 *
 * Truck placement mutates the floor grid in-place (same pattern as
 * corpse cleanup and crate restocking) and invalidates the
 * DumpTruckSprites cache so the hose-reel billboard rebuilds.
 *
 * ┌──────────┬───────────┬──────────┬──────────────────────┐
 * │ Faction  │ Ext Floor │ Door pos │ Truck tiles          │
 * ├──────────┼───────────┼──────────┼──────────────────────┤
 * │ ♠ Spade  │ 1         │ 10,27    │ (13,28) + (14,28)    │
 * │ ♣ Club   │ 2         │ 14,5     │ (15,8)  + (16,8)     │
 * │ ♦ Diamond│ 3         │ 25,1     │ (22,3)  + (23,3)     │
 * │ (home)   │ 1         │ 22,27    │ (30,26) + (31,26)    │
 * └──────────┴───────────┴──────────┴──────────────────────┘
 *
 * Placement contract (enforced at runtime in _placeTruckTiles):
 *   • Truck tiles must NOT be a door tile themselves.
 *   • Truck tiles must NOT be cardinally adjacent to any door tile
 *     (doing so blocks the player's spawn-back step-out and traps them).
 *   • Truck tiles must be non-walkable or walkable (the spawner overwrites),
 *     but the ORIGINAL tile is expected to be a safe EMPTY/ROAD/PATH — we
 *     warn if we're stomping something interesting (wall/door/stairs).
 *
 * Layer 2 — depends on: TILES, DungeonSchedule, FloorManager,
 *           DumpTruckSprites, NpcSystem, BarkLibrary
 */
var DumpTruckSpawner = (function () {
  'use strict';

  // ── Truck tile positions ───────────────────────────────────────
  // Each entry: the 2-tile-wide truck placed 1 row south of the door.
  // { floorId, tiles: [[x1,y1],[x2,y2]] }

  // NOTE: These positions MUST NOT be cardinally adjacent to any door tile.
  // When a door's "step-out" tile is blocked by the truck, DoorContracts'
  // spawn-near-door ring search is forced into whatever neighbor remains —
  // on Floor 1 the home door (22,27) has a 2-tile wall pocket at (21,28)+
  // (22,28), so blocking (22,28) left the player stranded in the pocket
  // after exiting 1.6. The spade site had the identical pattern at (10,27).
  // Club (floor 2) and diamond (floor 3) had the same design flaw — the
  // truck sat directly on the door's step-out tile — even though those
  // exteriors happen to be open enough that the spawn search would find
  // a fallback. _placeTruckTiles enforces this invariant at runtime and
  // logs violators, so we move all four sites off-axis proactively.
  var DEPLOY_SITES = {
    // Spade: Floor 1 grass south of 1.3 door (10,27). Row 28 is walkable road/path.
    spade:   { floorId: '1', tiles: [[13, 28], [14, 28]] },  // was (10,28)(11,28) — blocked 1.3 door step-out
    // Club: Floor 2 grass buffer (rows 7-9 all GR). Offset 2 east of door
    // col to leave step-out column (14) fully clear.
    club:    { floorId: '2', tiles: [[15, 8],  [16, 8]]  },  // was (14,6)(15,6) — blocked 2.x door step-out
    // Diamond: Floor 3 cozy forest clearing. Row 3 cols 22-23 are GR (no
    // trees/shrubs at those coords), 2 tiles west of door corridor (24-25).
    diamond: { floorId: '3', tiles: [[22, 3],  [23, 3]]  }   // was (25,2)(26,2) — blocked 3.1 door + boardwalk
  };

  var HOME_SITE = { floorId: '1', tiles: [[30, 26], [31, 26]] };  // was (22,28)(23,28) — blocked 1.6 door step-out

  // ── Coworker NPC config ────────────────────────────────────────
  var COWORKER_ID   = 'truck_coworker_hazmat';
  var COWORKER_NAME = 'Hazmat Specialist';
  var COWORKER_BARK = 'truck.hazmat_coworker';

  var COWORKER_BARKS = [
    { text: '🐉 Truck\'s here. Grab the hose before the blood dries.',   weight: 3 },
    { text: '🐉 We got a mess in there. Better get spraying.',           weight: 3 },
    { text: '🐉 Hose is on the reel. You know the drill.',              weight: 2 },
    { text: '🐉 Heroes went through like a tornado. Standard Tuesday.',  weight: 2 },
    { text: '🐉 Don\'t forget the corners. Inspector hates corners.',    weight: 1 },
    { text: '🐉 Another day, another dungeon full of viscera.',          weight: 2 },
    { text: '🐉 Pressure\'s good today. Full tank.',                     weight: 1 },
    { text: '🐉 If you see the heroes coming back, drop the hose and run.', weight: 1 }
  ];

  // Home-parked barks (off-duty / idle near Gleaner's Home)
  var COWORKER_HOME_BARKS = [
    { text: '🐉 No deployments today. Truck\'s resting.',               weight: 3 },
    { text: '🐉 Maintenance day. Checking the nozzle seals.',           weight: 2 },
    { text: '🐉 You want overtime? Talk to dispatch.',                  weight: 2 },
    { text: '🐉 *inspecting hose fittings*',                            weight: 1 },
    { text: '🐉 Quiet shift. Enjoy it while it lasts.',                 weight: 2 }
  ];

  // ── Internal state ─────────────────────────────────────────────
  var _currentSiteKey = null;   // 'spade' | 'club' | 'diamond' | 'home'
  var _placedFloorId  = null;   // floorId where tiles are currently set
  var _placedTiles    = [];     // [[x,y], ...] currently holding DUMP_TRUCK
  var _coworkerSpawned = false;
  var _initialized    = false;
  var _barksRegistered = false;

  // ── Helpers ────────────────────────────────────────────────────

  /**
   * Get the DUMP_TRUCK tile constant.
   */
  function _truckTile() {
    return (typeof TILES !== 'undefined' && TILES.DUMP_TRUCK) ? TILES.DUMP_TRUCK : 38;
  }

  /**
   * Get the EMPTY tile constant.
   */
  function _emptyTile() {
    return (typeof TILES !== 'undefined' && TILES.EMPTY != null) ? TILES.EMPTY : 0;
  }

  /**
   * Resolve the site object for a groupId, or HOME_SITE.
   */
  function _getSite(groupId) {
    return DEPLOY_SITES[groupId] || HOME_SITE;
  }

  /**
   * Get the coworker NPC offset (1 tile east of the second truck tile).
   */
  function _coworkerPos(site) {
    var last = site.tiles[site.tiles.length - 1];
    return { x: last[0] + 1, y: last[1] };
  }

  // ── Grid mutation ──────────────────────────────────────────────

  /**
   * Remove truck tiles from a floor grid (restore to EMPTY).
   * Safe if the floor hasn't been visited yet (grid not cached).
   */
  function _clearTruckTiles() {
    if (!_placedFloorId || _placedTiles.length === 0) return;

    var fd = _getFloorData(_placedFloorId);
    if (fd && fd.grid) {
      var empty = _emptyTile();
      for (var i = 0; i < _placedTiles.length; i++) {
        var tx = _placedTiles[i][0];
        var ty = _placedTiles[i][1];
        if (fd.grid[ty] && fd.grid[ty][tx] === _truckTile()) {
          fd.grid[ty][tx] = empty;
        }
      }
    }

    // Invalidate sprite cache for old floor
    if (typeof DumpTruckSprites !== 'undefined') {
      DumpTruckSprites.clearCache();
    }

    _placedFloorId = null;
    _placedTiles   = [];
  }

  /**
   * Check if a tile is cardinally adjacent to (or is) a door tile on the grid.
   * Placing a truck on such a tile can block the player's spawn-back step-out
   * when DoorContracts runs its ring search, trapping them in a wall pocket.
   */
  function _isDoorOrDoorAdjacent(grid, W, H, x, y) {
    if (!grid || !grid[y]) return false;
    if (typeof TILES === 'undefined' || !TILES.isDoor) return false;
    if (TILES.isDoor(grid[y][x])) return true;
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var nx = x + DIRS[i][0];
      var ny = y + DIRS[i][1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (!grid[ny]) continue;
      if (TILES.isDoor(grid[ny][nx])) return true;
    }
    return false;
  }

  /**
   * Place truck tiles on a floor grid.
   *
   * Invariant: no tile may be a door or door-adjacent (blocks step-out).
   * If any tile fails the check the entire placement is refused and a
   * warning is logged — safer to have no truck than to trap the player.
   */
  function _placeTruckTiles(site) {
    var fd = _getFloorData(site.floorId);
    if (!fd || !fd.grid) return false;

    var W = fd.gridW || (fd.grid[0] ? fd.grid[0].length : 0);
    var H = fd.gridH || fd.grid.length;

    // ── Safety contract: validate every tile before touching the grid ──
    for (var v = 0; v < site.tiles.length; v++) {
      var vx = site.tiles[v][0];
      var vy = site.tiles[v][1];
      if (_isDoorOrDoorAdjacent(fd.grid, W, H, vx, vy)) {
        if (typeof console !== 'undefined') {
          console.warn(
            '[DumpTruckSpawner] REFUSING placement on floor ' + site.floorId +
            ' — tile (' + vx + ',' + vy + ') is a door or door-adjacent. ' +
            'Placing a truck here would block the player\'s spawn-back step-out. ' +
            'Fix the DEPLOY_SITES entry to a non-adjacent position.'
          );
        }
        return false;
      }
    }

    var truck = _truckTile();
    for (var i = 0; i < site.tiles.length; i++) {
      var tx = site.tiles[i][0];
      var ty = site.tiles[i][1];
      if (fd.grid[ty]) {
        fd.grid[ty][tx] = truck;
      }
    }

    _placedFloorId = site.floorId;
    _placedTiles   = site.tiles.slice();

    // Invalidate sprite cache so hose-reel billboard rebuilds
    if (typeof DumpTruckSprites !== 'undefined') {
      DumpTruckSprites.clearCache();
    }

    return true;
  }

  /**
   * Get floor data — current floor or cached.
   */
  function _getFloorData(floorId) {
    if (typeof FloorManager === 'undefined') return null;
    // Current floor?
    var current = FloorManager.getFloorData();
    if (current && current.floorId === floorId) return current;
    // Cached (previously visited)?
    if (FloorManager.getFloorCache) return FloorManager.getFloorCache(floorId);
    return null;
  }

  // ── Coworker NPC ───────────────────────────────────────────────

  function _ensureBarks() {
    if (_barksRegistered) return;
    if (typeof BarkLibrary === 'undefined') return;
    BarkLibrary.register(COWORKER_BARK, COWORKER_BARKS);
    BarkLibrary.register(COWORKER_BARK + '.home', COWORKER_HOME_BARKS);
    _barksRegistered = true;
  }

  /**
   * Remove any existing coworker def from the NpcSystem._defs registry.
   * NpcSystem doesn't expose a remove(), so we reach into the registered
   * defs for each floor and splice out our coworker by id.  This is
   * acceptable for a single dynamic NPC; a proper remove API can be
   * added to NpcSystem later if more dynamic NPCs are needed.
   */
  function _purgeCoworkerDefs() {
    // Walk all floors that could have the coworker registered
    var candidates = ['1', '2', '3'];
    for (var f = 0; f < candidates.length; f++) {
      var fid = candidates[f];
      // NpcSystem stores defs in _defs[floorId] — we access them
      // through a helper we add below, or by re-registering cleanly.
      // Since we can't splice internal arrays, we track our own
      // registered floor and skip re-registering on the same floor.
    }
  }

  var _coworkerFloorId = null;  // floor where the coworker is registered

  /**
   * Spawn or move the coworker NPC to the current truck site.
   *
   * Strategy: register the coworker def on the target floor.
   * Since NpcSystem.register() appends and we can't remove defs,
   * we only re-register when the floor changes.  The coworker will
   * appear when the player visits (or revisits) the floor and
   * spawn() runs.
   *
   * For the current floor, we also inject directly into the active
   * enemies list so the coworker appears immediately.
   */
  function _spawnCoworker(site, isHome) {
    if (typeof NpcSystem === 'undefined') return;
    _ensureBarks();

    var pos  = _coworkerPos(site);
    var pool = isHome ? (COWORKER_BARK + '.home') : COWORKER_BARK;

    var def = {
      id:           COWORKER_ID,
      type:         'AMBIENT',
      x:            pos.x,
      y:            pos.y,
      facing:       'west',
      emoji:        '\uD83D\uDC09',  // 🐉 dragon emoji head
      name:         COWORKER_NAME,
      talkable:     false,
      barkPool:     pool,
      barkRadius:   5,
      barkInterval: 20000,
      factionId:    'heart',
      dynamic:      true      // flag for spawner-managed NPC
    };

    // Only re-register if moving to a different floor
    if (_coworkerFloorId !== site.floorId) {
      // Note: old floor's def will linger in _defs but spawn() skips
      // NPCs whose id collides with an existing entity.  Since the
      // coworker entity won't be in the old floor's enemies array
      // after a floor transition, it effectively disappears.
      NpcSystem.register(site.floorId, [def]);
      _coworkerFloorId = site.floorId;
    }

    _coworkerSpawned = true;
  }

  // ── Core placement logic ───────────────────────────────────────

  /**
   * Determine which group has a hero day TODAY and deploy the truck.
   * If no group is active, park at home.
   *
   * Called on:
   *   - init() at game start
   *   - DayCycle day change
   *   - DungeonSchedule hero day resolution
   */
  function _deploy() {
    if (!_initialized) return;

    var activeGroupId = null;

    // ── 1) Exact match: any unresolved contract whose actualDay is today ──
    if (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getSchedule) {
      var schedule = DungeonSchedule.getSchedule();
      var today = DungeonSchedule.getCurrentDay
        ? DungeonSchedule.getCurrentDay() : 0;

      for (var i = 0; i < schedule.length; i++) {
        var entry = schedule[i];
        if (!entry.resolved && entry.actualDay === today) {
          activeGroupId = entry.groupId;
          break;
        }
      }

      // ── 2) Fallback: DayCycle says today IS a hero day but no contract
      //        matched. This can happen when the game's current day hasn't
      //        been handed to DungeonSchedule yet (e.g. at player deploy
      //        spawn on a brand-new game, before any onDayChange fires).
      //        In that case deploy to the NEXT upcoming unresolved group
      //        rather than parking at home — the user should always see
      //        the truck on-site for an active hero day. ──
      if (!activeGroupId &&
          typeof DayCycle !== 'undefined' && DayCycle.isHeroDay &&
          DayCycle.isHeroDay() &&
          DungeonSchedule.getNextGroup) {
        var next = DungeonSchedule.getNextGroup();
        if (next && DEPLOY_SITES[next.groupId]) {
          activeGroupId = next.groupId;
          if (typeof console !== 'undefined') {
            console.log('[DumpTruckSpawner] Hero-day fallback: no contract ' +
                        'matches day ' + today + ', deploying to next group "' +
                        next.groupId + '" (scheduled day ' + next.actualDay + ').');
          }
        }
      }
    }

    var targetKey = activeGroupId || 'home';
    var site      = activeGroupId ? _getSite(activeGroupId) : HOME_SITE;

    // Already deployed to this site — no work needed
    if (_currentSiteKey === targetKey) return;

    // Clear old tiles
    _clearTruckTiles();

    // Place new tiles
    _placeTruckTiles(site);

    // Move coworker
    _spawnCoworker(site, !activeGroupId);

    _currentSiteKey = targetKey;
  }

  // ── Also clear the static truck from Floor 1 (30,26) ──────────
  // The original blockout placed a DUMP_TRUCK at (30,26) on Floor 1.
  // We remove it at init so only the spawner controls placement.

  function _clearStaticTruck() {
    var fd = _getFloorData('1');
    if (fd && fd.grid && fd.grid[26] && fd.grid[26][30] === _truckTile()) {
      fd.grid[26][30] = _emptyTile();
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Initialise the spawner. Call after DungeonSchedule.init().
   * Performs initial deployment (home or active hero day).
   */
  function init() {
    _initialized    = true;
    _currentSiteKey = null;
    _placedFloorId  = null;
    _placedTiles    = [];
    _coworkerSpawned = false;

    _clearStaticTruck();
    _deploy();
  }

  /**
   * Called on day change (hook into DayCycle or DungeonSchedule).
   * Re-evaluates truck placement.
   */
  function onDayChange(day) {
    _deploy();
  }

  /**
   * Called when a hero run resolves (truck should return home if the
   * faction's run is done).
   */
  function onHeroRunResolved() {
    _deploy();
  }

  /**
   * Force redeploy (e.g. after floor generation for a previously
   * unvisited floor — grid now exists).
   */
  function refresh() {
    var saved = _currentSiteKey;
    _currentSiteKey = null;  // Force re-evaluation
    _deploy();
  }

  /**
   * Check whether the truck is currently deployed on a given floor.
   * Used by HoseState to gate hose pickup.
   *
   * @param {string} floorId
   * @returns {boolean}
   */
  function isTruckOnFloor(floorId) {
    return _placedFloorId === floorId && _placedTiles.length > 0;
  }

  /**
   * Get the current deployment info for debug / HUD.
   * @returns {{ siteKey: string|null, floorId: string|null, tiles: Array }}
   */
  function getDeployment() {
    return {
      siteKey: _currentSiteKey,
      floorId: _placedFloorId,
      tiles:   _placedTiles.slice()
    };
  }

  /**
   * Get the groupId → site mapping (for external systems).
   */
  function getDeploySites() {
    return {
      spade:   { floorId: DEPLOY_SITES.spade.floorId,   tiles: DEPLOY_SITES.spade.tiles.slice() },
      club:    { floorId: DEPLOY_SITES.club.floorId,     tiles: DEPLOY_SITES.club.tiles.slice() },
      diamond: { floorId: DEPLOY_SITES.diamond.floorId, tiles: DEPLOY_SITES.diamond.tiles.slice() },
      home:    { floorId: HOME_SITE.floorId,             tiles: HOME_SITE.tiles.slice() }
    };
  }

  return Object.freeze({
    init:               init,
    onDayChange:        onDayChange,
    onHeroRunResolved:  onHeroRunResolved,
    refresh:            refresh,
    isTruckOnFloor:     isTruckOnFloor,
    getDeployment:      getDeployment,
    getDeploySites:     getDeploySites,
    COWORKER_ID:        COWORKER_ID
  });
})();
