/**
 * Floor Blockout 2.2.1 — Deepwatch Cellars B1 (depth 3, dungeon)
 *
 * Internal codename: heros_wake (DungeonSchedule group ID).
 * Player-facing label comes from spatial contract: "Entry Halls".
 * The building above is "Watchman's Post" (floor 2.2).
 * TODO: add displayName to DungeonSchedule groups so player never
 *       sees 'heros_wake' — suggest "The Old Undercroft" or
 *       "Deepwatch Cellars" for quest UI.
 *
 * 24×24 hand-authored Q-shaped dungeon. First depth-3 blockout in the
 * project — overrides proc-gen for the player's initial dungeon descent.
 *
 * Entered from Watchman's Post (Floor 2.2) via STAIRS_DN.
 *
 * Layout — the "Q":
 *   RING  (rows 0-12): rectangular loop corridor around an inner block
 *         with two carved-out ALCOVES. Three-tile-wide passages on all
 *         four sides. Hero carnage (CORPSE tiles, unlit torches, traps)
 *         litter the ring. Wounded enemy in the North Hall — back of Q.
 *   FOYER (rows 13-22): spacious 14×8 antechamber. Player enters here
 *         from STAIRS_UP. Connects to the ring's south corridor via an
 *         8-tile-wide doorway. Pillars frame the interior.
 *
 * Alcoves (carved from inner block):
 *   WEST QUARTERS (cols 5-7, rows 6-8): abandoned watchman bunk.
 *     BED + TABLE. Entered through 1-tile doorway at (4,7), framed
 *     by lit torches. Player discovers rest/furniture mechanics here.
 *   EAST VAULT (cols 16-18, rows 5-7): supply cache.
 *     CHEST + BREAKABLE crate. Entered through doorway at (19,6).
 *     Loot incentive — player finds this exploring the hero's trail.
 *
 * Discovery flow (player doesn't realize they're cleaning):
 *   1. Enter foyer → break crates for fun, fight a rat
 *   2. Enter ring → more rats, more crates to smash
 *   3. Find alcoves → chest loot, bed rest, table inspect
 *   4. Reach North Hall → Wounded Vault Warden (formidable)
 *   5. Realization: cleaning = readiness = survival
 *
 * Biome: 'dungeon' — rough stone walls, cold torchlight, darkness fog.
 *
 * Rooms:
 *   1. North Hall     (top of ring)   — COMBAT TRIGGER zone, corpses
 *   2. West Passage   (ring left)     — intact torches, corpse, cobweb
 *   3. East Passage   (ring right)    — hero trail, unlit torches
 *   4. South Hall     (ring bottom)   — junction, pillars, crates
 *   5. Foyer          (entry room)    — STAIRS_UP, pillar pair, crates
 *   6. West Quarters  (alcove)        — BED, TABLE (rest discovery)
 *   7. East Vault     (alcove)        — CHEST, BREAKABLE (loot discovery)
 *
 * Cleaning readiness targets:
 *   - BREAKABLE crates ×7  (ring + foyer + alcove + north)  → crate score
 *   - TORCH_UNLIT    ×5    (on hero's trail)                → torch score
 *   - TRAP           ×3    (triggered by hero)              → trap score
 *   - CORPSE         ×7    (loot / necro-salvage)
 *   - DETRITUS       ×8    (adventurer debris near corpses) → crate fill items
 *
 * Enemy spawns:
 *   - Rat ×4 (low-level, first combat encounters)
 *   - Wounded Vault Warden ×1 (triggered after hero exit)
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  6=STAIRS_UP  7=CHEST  8=TRAP  10=PILLAR
 *   11=BREAKABLE  19=CORPSE  27=BED  28=TABLE
 *   30=TORCH_LIT  31=TORCH_UNLIT  39=DETRITUS
 */
(function () {
  'use strict';

  var W = 24;
  var H = 24;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1, 0, 0, 0, 0, 0, 0, 0,19,39, 0, 0, 0,39,19, 0, 0, 0, 0,19,39, 0, 0, 1], // 1  North Hall — 3 corpses + 3 detritus (9,1)(13,1)(20,1)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 2  triggered trap (10,2) — COMBAT TRIGGER ZONE
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,11, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 3  crate toppled by hero (14,3)
    [ 1, 0, 0, 0, 1, 1,30, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,31, 1,31, 0, 0, 0, 1], // 4  inner block N face — lit(6,4), unlit(17,4),(19,4)
    [ 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 7, 0, 1, 0, 0, 0, 1], // 5  E vault top — CHEST(17,5)
    [ 1, 0, 0, 0,30,27, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,11, 0, 0, 0,39,19, 0, 1], // 6  W quarters top — BED(5,6) | E vault — BREAKABLE(16,6), detritus(20,6)
    [ 1, 0,19,39, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1], // 7  W quarters — corpse(2,7), detritus(3,7) | E vault bottom
    [ 1, 0, 0, 0,30,28, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,31, 0, 0, 0, 1], // 8  W quarters bottom — TABLE(5,8) | E face unlit(19,8)
    [ 1, 0, 0, 0, 1, 1,31, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,31, 1, 1, 0, 0, 0, 1], // 9  inner block S face — unlit(6,9), unlit(17,9)
    [ 1, 0, 0, 0, 0, 0, 0, 0,19,39, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 1], //10  South Hall — corpse(8,10), detritus(9,10), trap(14,10)
    [ 1, 0, 0, 0, 0, 0,11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,11, 0, 0, 0, 0, 0, 1], //11  South Hall — crates (6,11),(17,11)
    [ 1, 0, 0, 0, 0,10, 0, 0, 0, 0,11, 0, 0, 0, 0, 0, 0, 0,10, 0, 0, 0, 0, 1], //12  junction — pillars (5,12),(18,12), crate(10,12)
    [ 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //13  ring→foyer wall (8-wide opening, cols 8-15)
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0,39,19,39, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //14  foyer north — corpse(11,14) + 2 detritus (10,14)(12,14)
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0,10, 0, 0,10, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //15  foyer — pillar pair (10,15),(13,15)
    [ 1, 1, 1, 1,30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,30, 1, 1, 1, 1], //16  foyer — wall torches lit (4,16),(19,16)
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //17  foyer — triggered trap (12,17)
    [ 1, 1, 1, 1, 1, 0, 0,11, 0, 0, 0, 0, 0, 0, 0, 0,11, 0, 0, 1, 1, 1, 1, 1], //18  foyer — breakable crates (7,18),(16,18)
    [ 1, 1, 1, 1,30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,30, 1, 1, 1, 1], //19  foyer — wall torches lit (4,19),(19,19)
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //20  foyer — spawn row
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //21  STAIRS_UP (11,21) — back to Watchman's Post
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], //22  foyer south wall
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //23  south wall
  ];

  var SPAWN = { x: 11, y: 20, dir: 3 }; // facing NORTH (toward ring)

  var ROOMS = [
    { x: 1,  y: 1,  w: 22, h: 3,  cx: 11, cy: 2  },  // North Hall — combat zone
    { x: 1,  y: 4,  w: 3,  h: 6,  cx: 2,  cy: 7  },  // West Passage
    { x: 20, y: 4,  w: 3,  h: 6,  cx: 21, cy: 7  },  // East Passage
    { x: 1,  y: 10, w: 22, h: 3,  cx: 11, cy: 11 },  // South Hall + junction
    { x: 5,  y: 14, w: 14, h: 8,  cx: 11, cy: 18 },  // Foyer — entry room
    { x: 5,  y: 6,  w: 3,  h: 3,  cx: 6,  cy: 7  },  // West Quarters (alcove)
    { x: 16, y: 5,  w: 3,  h: 3,  cx: 17, cy: 6  }   // East Vault (alcove)
  ];

  // ── Hero Scripted Encounter ──────────────────────────────────────
  //
  // On first entry, the hero (black ninja silhouette) is visible in
  // the junction area. CinematicCamera letterbox fires, the hero
  // sprints clockwise through the ring, and a wounded enemy is left
  // behind in the North Hall.
  //
  // HeroSystem.createScriptedHero() consumes this data on first load.

  // prettier-ignore
  var HERO_PATH = [
    // Start at junction (11,11) — visible through foyer doorway
    // North into South Hall (row 10 — avoids crates in row 11)
    { x: 11, y: 10 },
    // East through South Hall (row 10)
    { x: 12, y: 10 }, { x: 13, y: 10 }, { x: 14, y: 10 },
    { x: 15, y: 10 }, { x: 16, y: 10 }, { x: 17, y: 10 },
    { x: 18, y: 10 }, { x: 19, y: 10 }, { x: 20, y: 10 },
    { x: 21, y: 10 },
    // North through East Passage (col 21)
    { x: 21, y: 9 },  { x: 21, y: 8 }, { x: 21, y: 7 },
    { x: 21, y: 6 },  { x: 21, y: 5 }, { x: 21, y: 4 },
    // West through North Hall (row 2)
    { x: 21, y: 3 },  { x: 21, y: 2 },
    { x: 20, y: 2 },  { x: 19, y: 2 }, { x: 18, y: 2 },
    { x: 17, y: 2 },  { x: 16, y: 2 }, { x: 15, y: 2 },
    { x: 14, y: 2 },  { x: 13, y: 2 }, { x: 12, y: 2 },
    { x: 11, y: 2 },  { x: 10, y: 2 }, { x: 9, y: 2 },
    { x: 8, y: 2 },   { x: 7, y: 2 },  { x: 6, y: 2 },
    { x: 5, y: 2 },   { x: 4, y: 2 },  { x: 3, y: 2 },
    { x: 2, y: 2 },
    // South through West Passage (col 2) — despawn out of sight
    { x: 2, y: 3 },   { x: 2, y: 4 },  { x: 2, y: 5 },
    { x: 2, y: 6 },   { x: 2, y: 7 },  { x: 2, y: 8 },
    { x: 2, y: 9 }
  ];

  var HERO_SCRIPT = {
    spawn: { x: 11, y: 11, dir: 1 },  // junction, facing east
    path: HERO_PATH,
    cinematic: 'boss_entrance',
    // Wounded enemy left in North Hall — back side of Q, farthest from foyer
    combatTrigger: {
      x: 11, y: 2,              // center of North Hall
      enemyType: 'vault_warden',
      name: 'Wounded Vault Warden',
      maxHp: 15,
      currentHp: 2,             // nearly dead — first HARD combat
      str: 5,
      triggerOnHeroExit: true   // spawns after hero despawns
    }
  };

  // ── Pre-placed Corpses ───────────────────────────────────────────
  //
  // High-level enemies the hero dispatched. Shows the hero's power.
  // CORPSE tiles (19) in grid + metadata for CorpseRegistry loot.

  var CORPSE_DATA = [
    { x: 8,  y: 1,  enemyType: 'bone_sentinel',  name: 'Bone Sentinel',  hp: 12 },
    { x: 14, y: 1,  enemyType: 'vault_warden',   name: 'Vault Warden',   hp: 15 },
    { x: 19, y: 1,  enemyType: 'crystal_golem',  name: 'Crystal Golem',  hp: 20 },
    { x: 2,  y: 7,  enemyType: 'bone_sentinel',  name: 'Bone Sentinel',  hp: 12 },
    { x: 21, y: 6,  enemyType: 'crystal_golem',  name: 'Crystal Golem',  hp: 20 },
    { x: 8,  y: 10, enemyType: 'bone_sentinel',  name: 'Bone Sentinel',  hp: 12 },
    { x: 11, y: 14, enemyType: 'vault_warden',   name: 'Vault Warden',   hp: 15 }
  ];

  // ── Rat Spawns ───────────────────────────────────────────────────
  //
  // Low-level enemies the player fights BEFORE reaching the Vault Warden.
  // Rats are manageable — the player learns combat on these, breaks some
  // crates, and doesn't realize they're "cleaning" until the formidable
  // enemy forces the issue.

  var ENEMY_SPAWNS = [
    { x: 11, y: 17, type: 'rat', hp: 3, str: 1 },  // foyer — first encounter
    { x: 15, y: 10, type: 'rat', hp: 3, str: 1 },  // south corridor
    { x: 2,  y: 5,  type: 'rat', hp: 3, str: 1 },  // west passage
    { x: 21, y: 8,  type: 'rat', hp: 4, str: 1 }   // east passage (slightly tougher)
  ];

  // ── Cobweb Positions ─────────────────────────────────────────────
  //
  // Corridor intersections and room entries where cobwebs accumulate.
  // Player can clear these as part of cleaning (CobwebNode system).
  // Hero clears webs along their path automatically.

  var COBWEBS = [
    { x: 3,  y: 3  },  // NW corner — west passage meets north hall
    { x: 20, y: 3  },  // NE corner — east passage meets north hall
    { x: 3,  y: 10 },  // SW corner — west passage meets south hall
    { x: 8,  y: 13 },  // foyer doorway left side
    { x: 15, y: 13 },  // foyer doorway right side
    { x: 6,  y: 7  },  // inside west quarters
    { x: 17, y: 7  }   // inside east vault
  ];

  // ── Adventurer Detritus ──────────────────────────────────────────
  //
  // Gear fragments left by fallen heroes, placed 1–2 tiles from each
  // CORPSE site. Walk over or face+OK to collect. Types map to
  // DetritusSprites.TYPES and items.json ITM-110–114.
  //
  // The foyer corpse (11,14) gets 2 detritus — entry area bootstraps
  // the player's first crate-fill items.

  var DETRITUS_DATA = [
    { x: 9,  y: 1,  type: 'cracked_flask'  },  // near corpse (8,1)
    { x: 13, y: 1,  type: 'dented_shield'   },  // near corpse (14,1)
    { x: 20, y: 1,  type: 'broken_arrows'   },  // near corpse (19,1)
    { x: 3,  y: 7,  type: 'torn_satchel'    },  // near corpse (2,7)
    { x: 20, y: 6,  type: 'cracked_flask'   },  // near corpse (21,6)
    { x: 9,  y: 10, type: 'hero_rations'    },  // near corpse (8,10)
    { x: 12, y: 14, type: 'torn_satchel'    },  // near corpse (11,14) — right
    { x: 10, y: 14, type: 'dented_shield'   }   // near corpse (11,14) — left
  ];

  function build() {
    var grid = [];
    for (var y = 0; y < H; y++) {
      grid[y] = GRID[y].slice();
    }
    return {
      grid: grid,
      rooms: ROOMS.slice(),
      doors: {
        stairsUp: { x: 11, y: 21 },  // STAIRS_UP → Watchman's Post (2.2)
        stairsDn: null,
        doorExit: null
      },
      doorTargets: { '11,21': '2.2' },
      gridW: W,
      gridH: H,
      biome: 'dungeon',
      shops: [],
      books: [],
      heroScript: HERO_SCRIPT,
      corpseData: CORPSE_DATA,
      enemySpawns: ENEMY_SPAWNS,
      cobwebs: COBWEBS,
      detritusPlacements: DETRITUS_DATA
    };
  }

  FloorManager.registerFloorBuilder('2.2.1', build);
})();
