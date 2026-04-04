/**
 * Floor Blockout 2.2.2 — Deepwatch Vaults B2 (depth 3, dungeon)
 *
 * Internal codename: heros_wake (DungeonSchedule group ID, second floor).
 * Player-facing label: "Deepwatch Vaults" — the sealed lower level.
 * Entered from Deepwatch Cellars B1 (Floor 2.2.1) via STAIRS_DN.
 *
 * 20×20 hand-authored cruciform dungeon. The second depth-3 floor in
 * Hero's Wake — player has already learned the cleaning loop on 2.2.1.
 * This floor is harder: tougher enemies, more cleaning targets, and a
 * locked central vault the hero blew open.
 *
 * Layout — the Cruciform:
 *   ENTRY HALL (rows 14-18): south arm. Player enters from STAIRS_UP.
 *     Two lit torches frame the entrance, crates line the walls.
 *   WEST WING  (cols 1-6, rows 6-12): barracks wing. BED, TABLE,
 *     supply shelves. Corpses of fallen guards. Cobweb-heavy.
 *   EAST WING  (cols 13-18, rows 6-12): armory wing. CHEST, multiple
 *     BREAKABLE crates, hero's explosive entry debris. Trap-heavy.
 *   NORTH VAULT (rows 1-5): sealed chamber the hero breached. Contains
 *     the boss corpse (Crystal Golem), rare loot crate, and heavy
 *     blood staining. This is the readiness payoff room.
 *   CENTRAL HUB (cols 7-12, rows 6-13): junction connecting all four
 *     arms. Pillars, unlit torches, the primary cleaning workspace.
 *
 * Discovery flow (player knows they're cleaning now):
 *   1. Enter south → immediate work: crates, blood, torches
 *   2. Explore wings → harder enemies, more corpses, detritus
 *   3. Reach north vault → boss corpse, heavy cleaning
 *   4. Sweep back through → fill remaining crates, hit 100%
 *
 * Biome: 'dungeon' — rough stone, deeper darkness, colder palette.
 *
 * Rooms:
 *   1. Entry Hall     (south arm)     — STAIRS_UP, crates, torches
 *   2. West Wing      (barracks)      — BED, TABLE, corpses, cobwebs
 *   3. East Wing      (armory)        — CHEST, crates, traps
 *   4. North Vault    (boss room)     — boss corpse, rare crate, blood
 *   5. Central Hub    (junction)      — pillars, torches, workspace
 *
 * Cleaning readiness targets:
 *   - BREAKABLE crates ×9  (all arms + central)           → crate score
 *   - TORCH_UNLIT    ×8    (hero's trail through arms)    → torch score
 *   - TRAP           ×3    (armory wing + vault)           → trap score
 *   - CORPSE         ×10   (heavier than B1)
 *   - DETRITUS       ×10   (adventurer debris near corpses)→ crate fill items
 *
 * Enemy spawns:
 *   - Cobweb Crawler ×2 (west wing — webs)
 *   - Shambling Corpse ×2 (central hub — slow, tough)
 *   - Bone Guard ×1 (north vault entrance — serious fight)
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  6=STAIRS_UP  7=CHEST  8=TRAP  10=PILLAR
 *   11=BREAKABLE  19=CORPSE  27=BED  28=TABLE
 *   30=TORCH_LIT  31=TORCH_UNLIT  39=DETRITUS
 */
(function () {
  'use strict';

  var W = 20;
  var H = 20;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1, 1, 1, 1, 1, 1, 1,31, 0, 0, 0, 0,31, 1, 1, 1, 1, 1, 1, 1], // 1  vault entry — unlit torches (7,1)(12,1)
    [ 1, 1, 1, 1, 1, 1, 1, 0,19,39, 0,39,19, 1, 1, 1, 1, 1, 1, 1], // 2  vault — corpses (8,2)(12,2), detritus (9,2)(11,2)
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0,11, 0, 0, 1, 1, 1, 1, 1, 1, 1], // 3  vault — BREAKABLE (10,3) rare crate
    [ 1, 1, 1, 1, 1, 1, 1, 0,19, 8, 0, 8,19, 1, 1, 1, 1, 1, 1, 1], // 4  vault — boss corpses (8,4)(12,4), traps (9,4)(11,4)
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0,10, 0, 0, 1, 1, 1, 1, 1, 1, 1], // 5  vault exit — pillar (10,5)
    [ 1,30, 0, 0, 0,19, 0, 0, 0, 0, 0, 0, 0, 0,39,19, 0, 0,30, 1], // 6  W wing top + hub + E wing top — corpses (5,6)(15,6)
    [ 1, 0, 0, 0, 0,39, 1,31, 0, 0, 0, 0,31, 1,11, 0, 0, 7, 0, 1], // 7  W detritus | hub torches (7,7)(12,7) | E BREAKABLE(14,7) CHEST(17,7)
    [ 1, 0,27, 0, 0, 0, 1, 0, 0,10, 0,10, 0, 1, 0, 0, 0, 0, 0, 1], // 8  W BED(2,8) | hub pillars (9,8)(11,8) | E wing
    [ 1, 0,28,39,19,39, 1, 0, 0, 0, 0, 0, 0, 1,11, 0,19,39, 0, 1], // 9  W TABLE(2,9) detritus(3,9) corpse(4,9) | hub | E BREAKABLE(14,9) corpse(16,9)
    [ 1,31, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,31, 1], //10  W unlit(1,10) | hub | E unlit(18,10)
    [ 1, 0, 0,11, 0, 0, 1, 0, 0,10, 0,10, 0, 1, 0, 8, 0,11, 0, 1], //11  W BREAKABLE(3,11) | hub pillars (9,11)(11,11) | E trap(15,11) BREAKABLE(17,11)
    [ 1,30, 0, 0,39,19, 0, 0, 0, 0, 0, 0, 0, 0, 0,39,39,19,30, 1], //12  W corpse(5,12) detritus(4,12) | hub | E detritus(15,12)(16,12) corpse(17,12)
    [ 1, 1, 1, 1, 1, 1, 1,31, 0, 0, 0, 0,31, 1, 1, 1, 1, 1, 1, 1], //13  hub→entry wall — unlit torches (7,13)(12,13)
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1], //14  entry hall
    [ 1, 1, 1, 1, 1, 1, 1, 0,11, 0,10, 0,11, 1, 1, 1, 1, 1, 1, 1], //15  entry — crates (8,15)(12,15), pillar (10,15)
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1], //16  entry hall
    [ 1, 1, 1, 1, 1, 1,30, 0, 0,11, 0,11, 0,30, 1, 1, 1, 1, 1, 1], //17  entry — lit torches (6,17)(13,17), crates (9,17)(11,17)
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 6, 0, 0, 1, 1, 1, 1, 1, 1, 1], //18  STAIRS_UP (10,18) — back to B1 (2.2.1)
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //19  south wall
  ];

  var SPAWN = { x: 10, y: 17, dir: 3 }; // facing NORTH (toward hub)

  var ROOMS = [
    { x: 7,  y: 1,  w: 6,  h: 5,  cx: 10, cy: 3  },  // North Vault — boss room
    { x: 1,  y: 6,  w: 5,  h: 7,  cx: 3,  cy: 9  },  // West Wing — barracks
    { x: 14, y: 6,  w: 5,  h: 7,  cx: 16, cy: 9  },  // East Wing — armory
    { x: 7,  y: 6,  w: 6,  h: 8,  cx: 10, cy: 10 },  // Central Hub — junction
    { x: 7,  y: 14, w: 6,  h: 5,  cx: 10, cy: 16 }   // Entry Hall — south arm
  ];

  // ── Pre-placed Corpses ───────────────────────────────────────────
  //
  // Heavier carnage than B1 — the hero fought hard down here.
  // Mix of enemy types with varied suits for crate slot matching.

  var CORPSE_DATA = [
    // North Vault — boss kills
    { x: 8,  y: 2,  enemyType: 'crystal_golem',  name: 'Crystal Golem',   emoji: '🤖', hp: 20, str: 5, suit: 'heart',   lootProfile: 'golem'   },
    { x: 12, y: 2,  enemyType: 'bone_guard',      name: 'Bone Guard',      emoji: '💀', hp: 14, str: 4, suit: 'spade',   lootProfile: 'undead'  },
    { x: 8,  y: 4,  enemyType: 'vault_warden',    name: 'Vault Warden',    emoji: '🛡️', hp: 15, str: 4, suit: 'club',    lootProfile: 'armored' },
    { x: 12, y: 4,  enemyType: 'crystal_golem',   name: 'Crystal Golem',   emoji: '🤖', hp: 20, str: 5, suit: 'heart',   lootProfile: 'golem'   },
    // West Wing — guard corpses
    { x: 5,  y: 6,  enemyType: 'bone_sentinel',   name: 'Bone Sentinel',   emoji: '💀', hp: 12, str: 3, suit: 'spade',   lootProfile: 'undead'  },
    { x: 4,  y: 9,  enemyType: 'bone_sentinel',   name: 'Bone Sentinel',   emoji: '💀', hp: 12, str: 3, suit: 'spade',   lootProfile: 'undead'  },
    { x: 5,  y: 12, enemyType: 'vault_warden',    name: 'Vault Warden',    emoji: '🛡️', hp: 15, str: 4, suit: 'club',    lootProfile: 'armored' },
    // East Wing — armory defenders
    { x: 15, y: 6,  enemyType: 'clockwork_guard', name: 'Clockwork Guard', emoji: '⚙️', hp: 16, str: 4, suit: 'diamond', lootProfile: 'golem'   },
    { x: 16, y: 9,  enemyType: 'bone_guard',      name: 'Bone Guard',      emoji: '💀', hp: 14, str: 4, suit: 'spade',   lootProfile: 'undead'  },
    { x: 17, y: 12, enemyType: 'clockwork_guard', name: 'Clockwork Guard', emoji: '⚙️', hp: 16, str: 4, suit: 'diamond', lootProfile: 'golem'   }
  ];

  // ── Enemy Spawns ─────────────────────────────────────────────────
  //
  // Tougher than B1's rats. Player has combat cards and experience now.
  // Crawlers lurk in the cobweb-heavy west wing. Corpses shamble in
  // the central hub. A Bone Guard blocks the vault entrance.

  var ENEMY_SPAWNS = [
    { x: 3,  y: 7,  type: 'crawler',  name: 'Cobweb Crawler',   emoji: '🕷️', hp: 6,  str: 2, dex: 3, suit: 'spade',   stealth: 2, awarenessRange: 3, lootProfile: 'organic'  },
    { x: 1,  y: 11, type: 'crawler',  name: 'Cobweb Crawler',   emoji: '🕷️', hp: 6,  str: 2, dex: 3, suit: 'spade',   stealth: 2, awarenessRange: 3, lootProfile: 'organic'  },
    { x: 9,  y: 10, type: 'corpse',   name: 'Shambling Corpse', emoji: '🧟', hp: 8,  str: 3, dex: 0, suit: 'club',    stealth: 0, awarenessRange: 4, lootProfile: 'undead'   },
    { x: 10, y: 8,  type: 'corpse',   name: 'Shambling Corpse', emoji: '🧟', hp: 8,  str: 3, dex: 0, suit: 'club',    stealth: 0, awarenessRange: 4, lootProfile: 'undead'   },
    { x: 9,  y: 5,  type: 'bone_guard', name: 'Bone Guard',     emoji: '💀', hp: 12, str: 4, dex: 1, suit: 'spade',   stealth: 0, awarenessRange: 5, lootProfile: 'undead', isElite: true }
  ];

  // ── Cobweb Positions ─────────────────────────────────────────────
  //
  // West wing is heavily cobwebbed (spider territory).
  // Central hub has a few at intersections.

  var COBWEBS = [
    { x: 1,  y: 7  },  // W wing — near barracks entry
    { x: 4,  y: 8  },  // W wing — by bed
    { x: 2,  y: 12 },  // W wing — far corner (near lit torch)
    { x: 7,  y: 6  },  // hub NW entry
    { x: 12, y: 6  },  // hub NE entry
    { x: 7,  y: 12 },  // hub SW entry
    { x: 12, y: 12 },  // hub SE entry
    { x: 10, y: 1  },  // vault entrance
    { x: 18, y: 7  }   // E wing — by chest
  ];

  // ── Adventurer Detritus ──────────────────────────────────────────
  //
  // More detritus than B1 — the hero fought harder here.
  // Diverse types to fill the varied crate slot frames.

  var DETRITUS_DATA = [
    // Vault detritus
    { x: 9,  y: 2,  type: 'broken_arrows'   },  // near vault corpse (8,2)
    { x: 11, y: 2,  type: 'dented_shield'   },  // near vault corpse (12,2)
    // West Wing detritus
    { x: 5,  y: 7,  type: 'cracked_flask'   },  // near corpse (5,6)
    { x: 3,  y: 9,  type: 'torn_satchel'    },  // near corpse (4,9) — west side
    { x: 5,  y: 9,  type: 'broken_arrows'  },  // near corpse (4,9) — east side
    { x: 4,  y: 12, type: 'hero_rations'    },  // near corpse (5,12)
    // East Wing detritus
    { x: 14, y: 6,  type: 'dented_shield'   },  // near corpse (15,6)
    { x: 17, y: 9,  type: 'broken_arrows'   },  // near corpse (16,9)
    { x: 16, y: 12, type: 'cracked_flask'   },  // near corpse (17,12)
    // Central Hub detritus (scattered by hero combat)
    { x: 15, y: 12, type: 'hero_rations'    }   // near east corpse trail
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
        stairsUp: { x: 10, y: 18 },  // STAIRS_UP → Deepwatch Cellars B1 (2.2.1)
        stairsDn: null,               // Terminal floor — no deeper
        doorExit: null
      },
      doorTargets: { '10,18': '2.2.1' },
      gridW: W,
      gridH: H,
      biome: 'dungeon',
      shops: [],
      books: [],
      heroScript: null,  // No scripted hero encounter on B2
      corpseData: CORPSE_DATA,
      enemySpawns: ENEMY_SPAWNS,
      cobwebs: COBWEBS,
      detritusPlacements: DETRITUS_DATA
    };
  }

  FloorManager.registerFloorBuilder('2.2.2', build);
})();
