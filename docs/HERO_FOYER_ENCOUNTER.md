# Hero Foyer Encounter — Floor 2.2.1 (Hero's Wake B1)

**Status:** design spec, pre-implementation
**Scope:** first time the player enters `2.2.1`. One-shot cinematic, gated by `player.flags.heroWakeArrival`.
**Owning systems:** `HeroSystem`, `FloorManager`, `MovementController`, `Raycaster` (camera lock), `EnemyAI`, `InteractPrompt`, `CleaningSystem`, `BarkLibrary`.
**Goal:** in ≤20 seconds, teach the player — without a single line of tutorial text — that **they are not the hero**. The hero is somewhere ahead, already killing things, leaving only mess and locked loot behind. Gleaner's job is what comes next.

---

## 1. Design intent (the single sentence)

> You chased the hero into a room, the hero shouted at something off-screen and vanished around a corner, a half-dead elite blocked the corridor long enough for the hero to escape, and when you turned around the "easy" rats you walked past on the way in had noticed you — and nothing in the room gives you loot because the hero already drained it all. Now clean it.

Everything in this spec serves that sentence. If any beat below doesn't contribute to it, cut the beat.

---

## 2. Physical layout (hand-authored, not procedural)

Floor `2.2.1` currently generates via `GridGen` with `roomCount: 5–7`. For this encounter we replace the first room (the one containing `STAIRS_UP`) with a hand-authored **foyer chamber** stitched into the procedural result. Everything past the east corridor bend is still procedural.

```
     col → 0  1  2  3  4  5  6  7  8  9 10 11 12
 row
  0       #  #  #  #  #  #  #  #  #  #  #  #  #
  1       #  .  .  .  .  .  .  .  .  .  .  .  #
  2       #  .  c  c  .  .  b  b  .  .  .  H  #   ← hero start
  3       #  .  .  .  .  .  b  .  .  t  .  .  #
  4       #  .  C  .  .  .  .  .  .  .  .  .  #
  5       #  .  .  .  b  b  .  c  .  .  #  #  #   ← wall jog; hero exits east into corridor
  6       #  .  r  .  .  .  .  .  .  .  .  .  #
  7       #  .  .  .  ^  .  .  .  .  .  .  E  #   ← player spawn (^) and elite ambush (E)
  8       #  .  r  .  .  .  .  .  .  .  .  .  #
  9       #  #  #  #  #  S  #  #  #  #  #  #  #   ← STAIRS_UP back to 2.2
```

Legend

- `^` player spawn (tile injected by FloorManager after stair arrival)
- `S` `STAIRS_UP` back to Watchman's Post (`2.2`)
- `H` scripted hero start (`HeroSystem.createScriptedHero`)
- `c` pre-placed corpse tile (loot state `DRY` — Hero already harvested)
- `C` pre-placed chest tile (`emptied: true` flag)
- `t` `HEARTH` torch — ambient, not a rest point here (see §7)
- `b` blood splatter seeded via `CleaningSystem.seedTile(floorId, x, y, 'heavy')`
- `r` rat spawn, `hp ×1.5`, `awareness: SUSPICIOUS` from birth (they heard the hero)
- `E` weakened elite `Shattered Bone Golem`, `hp: 2/maxHp: 10`, `str` unchanged, `awareness: UNAWARE`, frozen until trigger
- `#` wall (TILES.WALL)
- blank tile `.` floor

**Sightline gimmick:** rows 5 and 6 have a wall jog at columns 10–12 that **breaks line of sight** from the player spawn to the hero. The player sees the hero at row 2, but when the hero walks south and east to `(12, 5)` the raycaster occludes them behind the jog. The player has to cross the foyer and turn the corner to discover the elite.

**Rat placement is deliberate:** the rats are **behind** the player on spawn, in the player's blind spot. The player's attention is pulled north toward the hero. They'll forget the rats exist until they turn around after the elite fight.

---

## 3. Beat timeline (choreography)

All times are milliseconds from `_onArriveHeroWake()` start. This is a state machine driven by a single `CinemaController` (new module, see §5.1).

| T (ms) | Actor | Action | Systems touched |
|---|---|---|---|
| 0 | System | `MovementController.freeze(true)` — drain `impulse_queue`, ignore further input. | MC |
| 0 | System | `MouseLook.lockYaw(angle=-π/2)` — force player facing NORTH (dir=3). If mouse-look is off, snap `player.dir=3`. | MouseLook, Player |
| 0 | System | `Raycaster.setLetterbox(true, 0.08)` — 8% top/bottom bars fade in over 400ms for cinema feel. | Raycaster |
| 0 | Hero | Spawn scripted hero at `(11, 2)`, `facing: 'south'`, glow ON, awareness=-1. | HeroSystem |
| 0 | Lighting | `Lighting.addBeacon({x:11, y:2, radius:4, color:'#d4af37', ttl:9000})` — soft gold pool under hero. | Lighting (new) |
| 300 | UI | `Toast.show('The foyer reeks of ozone and old blood.', 'dim')` | Toast |
| 600 | Audio | `AudioSystem.play('hero-presence', {vol:0.4})` — low brass sting. | AudioSystem |
| 1200 | Hero | `DialogBox.show("Come out! I know you're back there!", { speaker: '???', modal: true, priority: PERSISTENT, autoClose: 2000 })` | DialogBox |
| 3400 | Hero | `DialogBox.show("Hiding won't save you, worm. The agency paid in full.", { speaker: '???', modal: true, autoClose: 2000 })` | DialogBox |
| 5500 | Hero | Begin scripted walk path: `(11,2) → (11,3) → (11,4) → (12,4) → (12,5) → off-grid despawn`. `moveMs: 400` per tile (fast — he's leaving urgently). | HeroSystem.tickScriptedHero |
| 5500 | Audio | `AudioSystem.play('hero-footfall', {vol:0.5, loop:true})` heavy bootsteps layered with existing `ascend-3` on corner turn. | AudioSystem |
| 7100 | System | Hero tile reaches `(12,5)` — past the wall jog. Raycaster occlusion naturally hides sprite. | Raycaster |
| 7500 | Hero | Path complete; `HeroSystem` returns hero entity, `Game` removes from sprite list. Beacon fades over 500ms. | HeroSystem, Lighting |
| 7500 | Audio | `AudioSystem.play('corridor-slam')` — distant door or collapse sound so the player knows "that way, now". | AudioSystem |
| 8000 | System | `Raycaster.setLetterbox(false)` — bars retract. | Raycaster |
| 8000 | System | `MovementController.freeze(false)`, `MouseLook.unlockYaw()`. | MC, MouseLook |
| 8000 | UI | `Toast.show('Chase him.', 'prompt', { ttl: 2500 })` — sole instructional nudge. | Toast |

### Player chases → ambush trigger

| Trigger | Condition | Reaction |
|---|---|---|
| `cinemaState === 'post-hero'` and player steps on any tile with `x >= 11 && y >= 5` (the corner turn) | once per floor | `CinemaController.fireElite()` |

`fireElite()` does:

1. `MovementController.freeze(true)` for 350ms (micro-lock, just enough to sell the reveal).
2. `Raycaster.kick(x: 0, y: -6, ms: 250)` — small vertical camera shake.
3. Upgrade the pre-placed elite `E` at `(12,7)`: set `awareness = ENGAGED`, `hp = 2`, `str = 4`, `facing = 'west'` (toward player). Add `scripted: true` so it won't wander.
4. `DialogBox.show('SO. Another one. Fine — I\'ll take YOU to the hero.', { speaker: 'Shattered Bone Golem', autoClose: 1800 })`
5. Play `enemy-alert` + custom `golem-roar`.
6. Release input. Normal combat resumes.

The elite has `hp: 2`. Any single weapon hit kills it. That is intentional — this fight is a **rhythm beat**, not a wall. The design promise is: "the thing blocking you was already broken; the hero is leagues above you."

### Post-elite reveal (the turnaround)

When `EnemyAI.onEnemyDeath(E)` fires and `E.scripted === true`:

1. `Player.setFlag('heroWakeEliteDown', true)`.
2. `Toast.show('The corridor collapses. No sign of the hero.', 'dim')` + `AudioSystem.play('rubble-collapse')`.
3. Place a visual obstruction: set tile `(12,5)` to `TILES.RUBBLE` so the player physically cannot continue east. This is the cinema's "no chase" enforcement.
4. Bump all rats in the foyer to `awareness = ALERTED`. They were `SUSPICIOUS` already — now the player has loudly killed something adjacent, and the rats pour in from behind.

### Post-turnaround discoveries (the payoff)

These are passive beats — no scripting, just flags set on the pre-placed objects at foyer generation time.

| Object | Flag set at gen | Interaction result | Trigger for story bark |
|---|---|---|---|
| Chest `C` at `(2,4)` | `emptied: true` | ChestPeek animation plays normally, loot roll returns `[]`. Toast: "Already picked clean." | first empty chest opened |
| Corpse `c` tiles | `lootState: LOOT_STATE.DRY` | CorpsePeek shows `boneEmoji`. No harvest offered in Scavenger mode. | — |
| Breakable crates (BreakableSpawner default) | `cleanerLocked: true` | InteractPrompt hides `interact.smash` verb regardless of apron. Only `interact.restock` shown. First attempt shows prompt "Restock — requires Gleaner's apron" (if player somehow isn't wearing it). | first crate interaction |
| Rats | `hp ×1.5`, `awareness ALERTED` | Two-hit kills feel draggy. | — |

**Story bark trigger** — either "first empty chest" **or** "first crate hover" fires on a 2500ms delay, whichever comes first:

```
DialogBox.show(
  "...These aren't for smashing. I'm here to clean, not to loot. Time to work.",
  { speaker: 'Gleaner', priority: PERSISTENT, autoClose: 3500 }
);
Player.setFlag('gleanerEpiphany', true);
```

Setting `gleanerEpiphany` unlocks the HUD's cleaning badge (future work) and removes the `cleanerLocked` flag from future floors' breakables — the player's internal state has flipped from "adventurer" to "Gleaner". `2.2.1`'s crates stay locked for this visit regardless, for consistency of the beat.

---

## 4. What the player learns from this encounter

| Beat | Lesson |
|---|---|
| Hero bark + disappearance | You are not the hero. The hero is a character, ahead of you, in the fiction. |
| Cinema lock | The game CAN take control away — so when control IS given, use it. |
| Weakened elite ambush | Corridors are scripted sometimes. Trust the geometry. |
| One-shot elite | The thing standing between you and the hero was already dying. You cannot catch up. |
| Empty chest + locked crates | Loot is not the loop. Scavenge / restock is. |
| Rats at 1.5× HP turning from behind | Observe your back. Easy enemies become hard when you tunnel-vision. |
| Gleaner epiphany bark | Explicit narrative pivot. First time the player character speaks in-dungeon. |

---

## 5. New systems required

### 5.1 `CinemaController` (new Layer 3 module)

A thin state machine that owns the beat table for scripted encounters. The 2.2.1 encounter is its first client; later encounters (`3.1.1` dragon reveal, `1.3.1` tutorial trap) will reuse it.

```
var CinemaController = (function () {
  'use strict';
  var _active = null;     // { scene, startMs, beats, step }
  var _now = 0;

  function play(sceneDef) { _active = { scene: sceneDef, startMs: _now, step: 0 }; }
  function tick(frameDt) {
    _now += frameDt;
    if (!_active) return;
    var beats = _active.scene.beats;
    while (_active.step < beats.length && (_now - _active.startMs) >= beats[_active.step].at) {
      beats[_active.step].fire();
      _active.step++;
    }
    if (_active.step >= beats.length) _active = null;
  }
  function isActive() { return !!_active; }
  function cancel() { _active = null; }
  return Object.freeze({ play: play, tick: tick, isActive: isActive, cancel: cancel });
})();
```

Load position: `index.html` Layer 3, after `HazardSystem`, before `Game`. `Game.tick()` calls `CinemaController.tick(frameDt)` every frame.

### 5.2 `MovementController.freeze(bool)`

New public method. Implementation is one line: `_inputFrozen = bool;`. In `MC.impulse()` and `MC.tick()`, early-return when `_inputFrozen`. Impulse queue is drained on freeze to prevent buffered moves snapping when release happens. Existing walk animations in flight are allowed to finish.

### 5.3 `Raycaster.setLetterbox(on, size)` and `Raycaster.kick(dx, dy, ms)`

Letterbox: draw two black bars at `0..size*H` and `(1-size)*H..H` after the world draw, alpha-tweened. Kick: per-frame camera-plane offset that decays linearly to zero over `ms`. Pure post-process, no interaction with collision.

### 5.4 `Lighting.addBeacon({ x, y, radius, color, ttl })`

The current lighting model is player-centric radial. We add a secondary **beacon** list. Each beacon contributes additively to the per-column brightness in the raycaster for columns whose world-space footprint lies within `beacon.radius` of `(beacon.x, beacon.y)`. Beacons decay and auto-remove when `ttl` expires. Initial implementation can skip occlusion checks (acceptable for a single beacon under a visible hero).

### 5.5 `EnemyAI.spawnEnemy(opts)` — accept `hp` and `scripted` overrides

Today, `createEnemy()` reads `opts.hp || 5`. We already have this — confirm `hp` can be force-set below `maxHp`. Add a new field `scripted: bool` and a respectful note in updateEnemy: if `scripted && awareness < ENGAGED`, skip wander/patrol AI (so the elite stays frozen in place until the trigger bumps it to ENGAGED).

### 5.6 `InteractPrompt` crate gating

Extend `ACTION_MAP[TILES.BREAKABLE]` resolution: before choosing `smash` vs `restock`, check `breakableEntity.cleanerLocked`. If set, only `restock` is offered (and the smash keybind is swallowed).

### 5.7 `FloorManager.seedAuthoredFoyer(floorId, layoutDef)`

Post-processes a procedurally generated floor by overwriting tiles in a bounding rect with hand-authored values from `layoutDef` and injecting pre-placed entities (corpses with `lootState`, chests with `emptied`, elite with `scripted` + `hp`). Called from `_onArriveHeroWake` before spawning the scripted hero. This approach keeps GridGen untouched and makes it easy to author future foyers in data.

---

## 6. File-by-file changes (implementation checklist)

Ordered so each change compiles against the previous.

1. **`engine/movement.js`** — add `_inputFrozen`, `freeze(bool)`, early-return in `impulse` and `tick`. Export `freeze`.
2. **`engine/mouselook.js`** — add `lockYaw(angle)` / `unlockYaw()`. While locked, incoming mouse dx is ignored and yaw is lerped to `angle` over 300ms.
3. **`engine/raycaster.js`** — add `setLetterbox(on, size)` and `kick(dx, dy, ms)`. Both are post-process; no raycast changes.
4. **`engine/lighting.js`** — beacon list with `addBeacon({x,y,radius,color,ttl})` and `tick(dt)` for ttl decay; additive contribution in the brightness pass.
5. **`engine/enemy-ai.js`** — honor `opts.hp`, `opts.scripted`, skip AI when scripted+pre-engagement. New `getEnemyById(floorId, id)` helper if not present.
6. **`engine/interact-prompt.js`** — `cleanerLocked` branch in `BREAKABLE` resolution.
7. **`engine/cinema-controller.js`** — new file, see §5.1.
8. **`index.html`** — `<script>` insertion for `cinema-controller.js` (Layer 3, after hazard-system).
9. **`data/foyers/hero-wake.js`** — new data file with the foyer layout object (tiles grid, entity list, bark pool keys). Following the project's "data lives in `data/`" convention.
10. **`engine/floor-manager.js`** — `seedAuthoredFoyer(floorId, layoutDef)`.
11. **`engine/game.js`** — new `_onArriveHeroWake()`, dispatched from `_onFloorArrive` on `floorId === '2.2.1'` when `!Player.hasFlag('heroWakeArrival')`. Wires:
    - `seedAuthoredFoyer('2.2.1', FOYERS.heroWake)`
    - `HeroSystem.createScriptedHero(11, 2, HERO_PATH_221)`
    - `CinemaController.play(HERO_WAKE_SCENE)`
    - `CinemaController.tick(frameDt)` call in `Game.tick()`
    - trigger-zone check in the movement-end callback
    - `onEnemyDeath` branch for scripted elite death
12. **`data/barks/en.js`** — register pools:
    - `scene.herowake.arrival` (the Toast line)
    - `scene.herowake.hero_1`, `scene.herowake.hero_2` (the two hero barks; speaker `???`)
    - `scene.herowake.elite_reveal`
    - `scene.herowake.gleaner_epiphany`
    - `scene.herowake.chest_empty`
13. **`docs/Biome Plan.html`** — update the `2.2.1` entry to reference this spec (single-line link).

Estimated footprint: ~450 lines new code across the system additions, ~120 lines of data (foyer layout + barks), zero existing-line deletions.

---

## 7. Bark & dialogue lines (authored copy)

These are **the only lines** in the whole encounter. No other text appears. All timings are in §3.

```
Toast (arrival, 300ms):
  The foyer reeks of ozone and old blood.

Hero line 1 (1200ms, speaker: "???", modal):
  Come out! I know you're back there!

Hero line 2 (3400ms, speaker: "???", modal):
  Hiding won't save you, worm. The agency paid in full.

Toast (8000ms, after release):
  Chase him.

Elite reveal (on trigger, speaker: "Shattered Bone Golem"):
  SO. Another one. Fine — I'll take YOU to the hero.

Toast (elite death):
  The corridor collapses. No sign of the hero.

Chest empty (first empty chest interaction):
  Already picked clean.

Gleaner epiphany (2500ms after first locked interaction, speaker: "Gleaner"):
  ...These aren't for smashing. I'm here to clean, not to loot. Time to work.
```

Every line has to earn its place. If we cut for time on jam day, cut hero line 2 first (keep the first shout + the visible disappearance — that's enough to sell "not for you").

---

## 8. Edge cases / failure modes

- **Player reloads mid-cinematic.** `heroWakeArrival` flag is not set until the cinema ends (beat at T=8000 also calls `Player.setFlag('heroWakeArrival', true)`). Reloading restarts the scene. Acceptable for jam.
- **Player runs backward into the `STAIRS_UP` during the cinema.** Input is frozen — impossible.
- **Hero path blocked by a monster wandered into `(12,4)`.** The foyer is hand-authored and the only pre-placed enemy (elite) is east of the path. Procedural enemies are cleared from the foyer rect by `seedAuthoredFoyer`. No collision possible.
- **Player turns camera away from the hero (mouse-look on).** `MouseLook.lockYaw` prevents this.
- **Elite killed in one hit before the dialog bark finishes.** Dialog continues; death toast queues behind it.
- **Player enters the trigger zone while the cinema is still playing (impossible today because of freeze, but guard anyway).** The trigger-zone check reads `CinemaController.isActive()` and no-ops if true.
- **Rats killed before the turnaround.** Fine — lesson is still delivered by the chests and crates. The rat HP bump is flavor, not required for the beat.
- **Player already has `gleanerEpiphany` flag from a save-game that somehow skipped 2.2.1.** Early-return from the epiphany bark but still play the chest/crate gating. The flag guards only the line, not the mechanics of this floor.

---

## 9. Post-jam polish hooks (NOT jam scope)

- Replace `Lighting.addBeacon` with a proper per-tile torch contribution so the foyer's `HEARTH` tile actually lights the surroundings (wires into `TEXTURE_ROADMAP.md` layer 2).
- Give the hero a sprite atlas with 4 facings instead of emoji + glow.
- Add a second beat on `corridor-slam` where a distant door slams on a subsequent floor the player will eventually reach — narrative callback.
- Have the elite's one-liner vary with the player's operative class (Blade-Ranger-Shadow-Sentinel-Seer-Wildcard).

---

## 10. Acceptance criteria

The encounter is done when all of these are true on a fresh save:

1. Enter `2.2.1`. Input freezes. Hero sprite visible in the north of the foyer.
2. Two hero lines appear in sequence. Second line completes by T≈5500ms.
3. Hero walks east behind the wall jog and visually disappears. A "corridor-slam" SFX plays.
4. Input unfreezes. A "Chase him." toast appears.
5. Walking into the corridor bend fires the elite reveal with camera kick and bark line.
6. Killing the elite collapses tile `(12,5)` to `RUBBLE` and fires the "corridor collapses" toast.
7. Turning south and opening chest `C` at `(2,4)` yields zero items and fires "Already picked clean."
8. Attempting to smash any crate in the foyer only shows the restock verb.
9. Within 2.5s of (7) or (8), the Gleaner epiphany line appears and `gleanerEpiphany` flag is set.
10. Rats in the foyer have become `ALERTED` and approach. They take two hits each.
11. Leaving `2.2.1` via `STAIRS_UP` and re-entering: none of the cinematic beats fire. The floor is a normal procedural dungeon with the rubble at `(12,5)` persisted via the floor cache.
