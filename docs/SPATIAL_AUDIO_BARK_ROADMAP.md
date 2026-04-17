# Spatial Audio & Directional Bark Roadmap

> **Status:** Post-jam. Phase 4a (enemy/NPC footsteps) and Phase 5a (bonfire crackle) wired 2026-04-07. Stereo panning (Phases 0–1) and DirRing (Phase 2) still pending.
> **Scope:** Unified directional system for audio panning and visual bark indicators.
> **Estimated total:** 8–10h across 8 phases (0–7). ~2h delivered via volume-only spatial wiring.

---

## The Gap

AudioSystem is currently **mono** — all SFX play at center with no stereo panning. As of 2026-04-07, distance-based volume attenuation is live via `playSpatial()` (bonfire crackle, enemy/NPC footsteps, torch extinguish fadeout — all contract-aware). But direction is never fed into the pan position. A bonfire to the player's left sounds identical to one on the right.

NPC barks display as text in the StatusBar tooltip footer (bottom of screen). The KaomojiCapsule renders a rolling ellipsis above the NPC sprite in the 3D view. But when the NPC is behind or beside the player, there's no visual cue about bark direction — the text just appears at the bottom with no spatial correspondence.

## The Target

Standing in the Promenade: a bonfire crackles to your left, panned hard-left in the stereo field. An NPC behind you barks — a small text bubble slides to the bottom of a ring around the viewport center, indicating "behind you." You turn to face them — the bubble migrates upward toward center as the NPC enters your view, then fades out (the KaomojiCapsule in the 3D scene takes over). An enemy's footsteps echo from the right corridor, panning right. The directional ring doubles as a threat compass.

---

## Phase 0 — Spatial Direction Resolver (1h)

**Shared math** consumed by both audio panning and visual bark direction.

### 0a. `engine/spatial-dir.js` (Layer 0, zero-dep IIFE)

```javascript
var SpatialDir = (function () {
  /**
   * Given source world position and player state, compute:
   *   angle:     signed angle from player's forward (-π to π, + = right)
   *   distance:  Euclidean tile distance
   *   cardinal:  'front' | 'right' | 'behind' | 'left' (4-sector)
   *   screenPos: { x: -1..1, y: -1..1 } normalized viewport position
   *              where (0,0) = center, (-1,0) = left edge, (0,1) = bottom
   *
   * @param {number} srcX, srcY - Source world tile position
   * @param {number} plX, plY  - Player world tile position
   * @param {number} plDir     - Player facing angle (radians, 0=E)
   * @returns {Object} { angle, distance, cardinal, screenPos }
   */
  function resolve(srcX, srcY, plX, plY, plDir) { ... }

  /**
   * Convert a signed angle to a stereo pan value (-1 = full left, +1 = full right).
   * Uses sine curve for natural panning (not linear).
   * @param {number} angle - From resolve()
   * @returns {number} -1..1
   */
  function toPan(angle) { return Math.sin(angle); }

  /**
   * Convert distance to a volume multiplier (inverse-square falloff, clamped).
   * @param {number} distance - Tile distance
   * @param {number} [maxRange=6] - Distance at which volume reaches 0
   * @returns {number} 0..1
   */
  function toVolume(distance, maxRange) { ... }

  return { resolve: resolve, toPan: toPan, toVolume: toVolume };
})();
```

### 0b. Integration contract

Every caller passes `(srcX, srcY, Player.getX(), Player.getY(), Player.getFacingAngle())`. The resolver doesn't import Player — callers do the lookup. This keeps it Layer 0.

---

## Phase 1 — Spatial Audio Panning (2h)

Add stereo panning to AudioSystem without breaking existing `play()` calls.

### 1a. StereoPannerNode bus

Upgrade the AudioSystem gain graph:

```
Before: source → sfxGain → masterGain → destination
After:  source → StereoPannerNode → sfxGain → masterGain → destination
```

`StereoPannerNode.pan.value` ranges -1 (left) to +1 (right). Created per-source on each `play()` call. The node is lightweight — one per active buffer source, auto-GC'd on stop.

### 1b. `play()` gains `pan` and `position` options

```javascript
AudioSystem.play('fire_crackle', {
  volume: 0.5,
  pan: 0.6            // Direct pan override (-1 to +1)
});

AudioSystem.play('enemy-step', {
  volume: 0.4,
  position: { x: 5, y: 3 }  // World-space — resolver computes pan + attenuation
});
```

When `position` is provided, `play()` internally calls `SpatialDir.resolve()` to compute pan and distance-attenuated volume. This means existing callers that already compute their own volume (like `fire_crackle` in game.js) can migrate incrementally by switching from manual `volume` to `position`.

### 1c. webOS HRTF consideration

LG webOS 3.0+ supports `PannerNode` with `'HRTF'` spatialisation, but the TV's built-in DSP already does stereo widening. Start with `StereoPannerNode` (simpler, more predictable). If testing reveals it sounds flat, upgrade to `PannerNode` with `equalpower` model. HRTF on a TV speaker is wasted — it's designed for headphones.

### 1d. Spatial audio sources to wire

| Source | File | Current | Migration |
|--------|------|---------|-----------|
| Bonfire crackle | `game.js:3250` | Distance-vol only | Add `position: { x, y }` from bonfire tile |
| Enemy alert chime | `enemy-ai.js:146` | Flat center | Add `position: enemy.pos` |
| Enemy suspicion | `enemy-ai.js:148` | Flat center | Add `position: enemy.pos` |
| NPC bark SFX (future) | `npc-system.js` | No audio | New: bark vocalization stinger per NPC |
| Cobweb tear | `cobweb-node.js:192` | Flat center | Add `position: node.pos` |
| Door creak | `door-peek.js` | Flat center | Add `position: door tile` |
| Chest open | `chest-peek.js` | Flat center | Add `position: chest tile` |
| Footsteps (player) | `movement.js` | Flat center | Keep center (player is the listener) |
| Footsteps (enemy) | Not yet | N/A | New: proximity footstep loop with `position` |

---

## Phase 2 — Viewport Direction Ring (2h)

The visual anchor for directional bark popups and threat indicators.

### 2a. DOM structure

```html
<div id="dir-ring" style="display:none">
  <svg id="dir-ring-svg" viewBox="0 0 200 200">
    <!-- Ring is drawn as an SVG circle; indicators are positioned along it -->
  </svg>
</div>
```

Centered in the viewport, radius ~80px (scaled by viewport height). Semi-transparent, only visible when there are active indicators to show. Fades in/out with CSS transitions.

### 2b. Indicator slots

Each indicator is a small element (text bubble, icon pip) positioned along the ring's circumference at the angle computed by `SpatialDir.resolve()`. CSS `transform: rotate(angle) translateY(-radius)` positions them.

Indicators types:

| Type | Visual | Trigger |
|------|--------|---------|
| `bark` | Speech bubble with truncated text | NPC bark fired while NPC is off-screen |
| `threat` | Red pip (⚠) | Enemy enters SUSPICIOUS or ALERTED state off-screen |
| `sound` | Subtle pulse ring segment | Loud spatial SFX plays off-screen (bonfire, door, footsteps) |
| `quest` | Green diamond (◆) | Active quest objective is off-screen |

### 2c. On-screen suppression

When the source is within the player's ~60° forward FOV (visible on screen), the ring indicator fades out — the 3D scene already shows it (KaomojiCapsule for barks, enemy sprites for threats). The ring only activates for **off-screen** sources.

Threshold: `|angle| > FOV/2` where FOV ≈ 60° + free-look offset.

### 2d. Lifetime and animation

- Bark indicators: appear on bark fire, linger 3s, fade out over 0.5s
- Threat indicators: persist while awareness state is active, pulse at 1Hz
- Sound indicators: flash once (0.3s in, 0.3s out) on SFX play
- Quest indicator: persistent while quest is active

Smooth angular interpolation when the player turns (indicators slide around the ring).

---

## Phase 3 — Directional Bark Popups (2.5h)

Wire NPC barks into the direction ring with text content.

### 3a. BarkLibrary display callback upgrade

The game.js `BarkLibrary.setDisplay()` callback currently routes to StatusBar or Toast. Add a third path that **also** fires a directional popup:

```javascript
BarkLibrary.setDisplay(function (bark, opts) {
  // Existing: route text to StatusBar tooltip
  StatusBar.pushTooltip(text, 'npc');

  // NEW: directional popup if NPC has a world position
  if (opts && opts.srcX != null && opts.srcY != null) {
    DirRing.showBark(text, opts.srcX, opts.srcY);
  }
});
```

### 3b. NPC bark position forwarding

`NpcSystem._tickBark()` already has the NPC's grid position. Pass it through as opts:

```javascript
BarkLibrary.fire(pool, {
  srcX: npc.x,
  srcY: npc.y,
  speaker: npc.name
});
```

### 3c. NPC dialogue ping-pong directional

When two NPCs argue (NpcSystem dialogue ping-pong), both speakers' indicators appear on the ring. The active speaker's indicator pulses brighter. The rolling ellipsis in the 3D view continues as-is for on-screen NPCs.

### 3d. Bark popup visual

Small rounded-rect bubble floating at the ring position:
- Max ~30 chars of bark text (truncated with "…")
- Speaker name in small caps above
- Background color matches the CRT green of the minimap aesthetic
- Opacity fades with distance (far NPCs = dimmer)

---

## Phase 4 — Enemy Proximity Audio (1.5h)

The most gameplay-critical spatial audio: hearing enemies before seeing them.

### 4a. Enemy footstep — ✅ WIRED (2026-04-07)

Enemy and NPC footsteps are now live via `AudioSystem.playSpatial()` with contract-aware radius/volume. Wired at three movement commit points:

- **enemy-ai.js `_moveToPoint()`** — patrol pace, base vol 0.18–0.35 by depth
- **enemy-ai.js `_tryMove()`** — chase pace, 1.4× patrol volume (heavier)
- **npc-system.js `_tickPatrol()`** — NPC patrol, softer (0.12–0.25)

All use the generic `step` manifest key with ±10% pitch randomization. Stationary rotations produce no footstep. Contract-aware radius: exterior 6–7 tiles, interior 4–5, nested dungeon 3–4.

> **Future:** Different enemy types could use different step sounds (heavy/light/metallic) keyed off `enemy.type` or `enemy.subtype`. Hero patrol footsteps need a dedicated heavier asset (armor clink).

### 4b. Awareness escalation audio

Upgrade existing flat alert chimes to spatial:

```javascript
// enemy-ai.js line 146:
AudioSystem.play('enemy-alert', {
  volume: 0.35,
  position: { x: enemy.x, y: enemy.y }
});
```

> **Status:** Not yet wired. Requires Phase 1 `position` option in `play()`. Currently the alert chimes play center-pan at flat volume. This is acceptable for the patch — the footsteps already provide directional tension.

### 4c. Threat ring indicator

When an enemy enters SUSPICIOUS or ALERTED while off-screen, show a threat pip on the direction ring. Color-coded: yellow (suspicious), red (alerted), magenta (engaged/combat).

> **Status:** Not yet wired. Requires Phase 2 DirRing DOM infrastructure.

---

## Phase 5 — Ambient Spatial Sources (1h)

Wire ambient environmental sounds into the spatial system.

### 5a. Bonfire crackle — ✅ WIRED (2026-04-07)

Bonfire crackle now uses `AudioSystem.playSpatial('fire_crackle', ...)` in game.js with contract-aware radius (exterior 5, interior 4, dungeon 3) and base volume (0.35/0.45/0.55). Only BONFIRE and HEARTH tiles trigger crackling. Scans within maxDist radius, picks nearest source.

Remaining for this item: add `position`-based stereo panning once Phase 1 StereoPannerNode lands.

### 5b. Torch ambient

Lit torches (TORCH_LIT tiles) emit a quiet flame loop. Lower volume than bonfire, shorter range (2 tiles). Creates a subtle stereo field that helps the player orient.

### 5c. Water/ocean ambient

On Floor 3 exterior (ocean), add a directional water ambience that pans based on the ocean's direction relative to the player.

### 5d. Door/NPC ambient

Locked buildings at night play muffled barks through the door (already in DayCycle.getMuffledBarkPool). Wire these through spatial audio so the muffled sound comes from the door's direction.

---

## Architecture Summary

```
SpatialDir (Layer 0)              ← pure math, no deps
    ↑                  ↑
AudioSystem (Layer 0)   DirRing (Layer 2)
  .play({ position })    .showBark()
    ↑                    .showThreat()
    |                    .showSound()
    |                       ↑
BarkLibrary.fire()     NpcSystem._tickBark()
EnemyAI._tickPatrol()  EnemyAI.awareness change
Game._tickAmbient()    (any off-screen spatial event)
```

## Dependencies

- **SpatialDir** requires: nothing (pure math)
- **AudioSystem pan upgrade** requires: SpatialDir, `StereoPannerNode` support (webOS 3.0+, all modern browsers)
- **DirRing** requires: SpatialDir, Player position/facing access
- **Directional barks** require: DirRing, NpcSystem position forwarding
- **Enemy proximity** requires: AudioSystem pan, SpatialDir
- **Ambient spatial** requires: AudioSystem pan, SpatialDir

## Resolved Design Decisions

1. **Ring vs compass bar:** **Ring.** The viewport isn't important or interesting enough yet to justify a compact compass bar. The ring gives us room to grow.

2. **webOS speaker layout:** Exaggerate pan values modestly. `toPan()` returns `Math.sin(angle) * 1.3`, clamped to ±1. Enough to be perceptible on downward-firing TV speakers without sounding broken on headphones.

3. **Performance budget:** Resource-friendly. Bark popups snap to **8 fixed axis positions** (N, NE, E, SE, S, SW, W, NW) around the ring — no per-pixel angular positioning. DOM pool of 8 reusable indicator slots. No per-frame DOM mutation unless an indicator state actually changes.

4. **Free-look reticle:** The DirRing serves double duty — faint ring during free-look (replacing the nonexistent reticle), active indicator ring when spatial events fire. One element, two roles.

---

## Phase 6 — Muffled Door BGM (OoT Pattern) (1.5h)

The Ocarina of Time sonic contract: approach a door where the other side has different BGM, and you hear it muffled through the door *before* you ever interact. This gives the player an audio preview of what's beyond — a tavern's warm fiddle behind a locked inn door at night, dungeon drums leaking from a stairwell.

### 6a. Door BGM leak contract

Each door tile's spatial contract gains an optional `bgmLeak` field:

```javascript
// In spatial-contract data per floor connection:
{
  from: '1',    to: '1.2',
  bgmLeak: {
    track: 'music-inn',       // BGM key from audio-manifest.json
    maxDist: 3,               // Tile range where leak is audible
    muffle: 0.7               // Low-pass filter intensity (0 = clear, 1 = fully muffled)
  }
}
```

### 6b. Muffled playback via BiquadFilterNode

When the player is within `maxDist` tiles of a door with `bgmLeak`, create a secondary audio chain:

```
<audio> (leak track) → BiquadFilterNode (lowpass) → leakGain → masterGain → destination
```

- BiquadFilter: `type: 'lowpass'`, `frequency: 400 + (1 - muffle) * 2000` Hz. Muffled = 400Hz (only bass), clear = 2400Hz.
- leakGain: distance-attenuated via `SpatialDir.toVolume()`, mixed quiet under the main BGM. Cap at 0.15 × master.
- Panned via `StereoPannerNode` based on door direction relative to player.

### 6c. Crossfade on entry

When the player enters the door, the muffled leak track crossfades to the full un-muffled version (filter frequency ramps from 400→22000Hz over 600ms, gain ramps to normal BGM level). The "door opens and the music swells" moment. This replaces the current hard-cut `AudioSystem.stopMusic()` → `playMusic()` in floor-transition.js.

### 6d. Night-locked muffled barks (existing)

DayCycle already has `registerNightLock(floorId, { muffledBarkPool })` and floor-transition.js fires the pool on locked-door rejection. This bark system gets the same spatial treatment: the muffled bark fires with `position` pointing to the door tile, so the player hears it from the door's direction.

---

## Phase 7 — Biome Music Continuity (1h)

When a building (depth-2, e.g. `1.2`) shares the same biome as its parent exterior (depth-1, e.g. `1`), entering should **adjust** the music rather than changing it.

### 7a. Same-biome interior transitions

Currently `floor-transition.js` stops music during every transition. For same-biome building entries:

- **Don't stop the track.** If `fromBiome === toBiome`, skip `AudioSystem.stopMusic()`.
- **Adjust the mix.** Apply a subtle low-pass filter ramp (outdoor → indoor feel: slight muffle at 3000Hz, gentle reverb increase if we add convolver post-jam).
- **Drop ambience.** Outdoor ambient loops (wind, crowd, bonfire crackle) fade out; indoor ambience fades in (clock tick, floorboard creak, fireplace).

### 7b. Cross-biome transitions

When biomes differ (e.g., Promenade exterior → Inn interior with different biome), use the Phase 6 crossfade: old track muffles out while new track fades in through the door filter. This creates a seamless "the world changed around you" feeling instead of a hard music cut.

### 7c. Dungeon depth ramp

Dungeon entries (depth-3) always hard-switch to dungeon BGM — these are dramatic transitions and should feel like a plunge. The existing `AudioSystem.stopMusic()` call stays for dungeon transitions. The door contract audio sequence (creak → whoosh → thud) sells the physicality.

---

## Updated Architecture Summary

```
SpatialDir (Layer 0)                          ← pure math, no deps
    ↑                  ↑              ↑
AudioSystem (L0)    DirRing (L2)   FloorTransition (L2)
  .play({position})   .showBark()    BGM leak/crossfade
  .playLeak()         .showThreat()  Same-biome continuity
    ↑                 .showSound()
    |                    ↑
BarkLibrary.fire()  NpcSystem._tickBark()
EnemyAI._tickPatrol()  EnemyAI.awareness change
Game._tickAmbient()    (any off-screen spatial event)
```

## Dependencies

- **SpatialDir** requires: nothing (pure math)
- **AudioSystem pan** (Phase 1) requires: SpatialDir, `StereoPannerNode` (webOS 3.0+)
- **DirRing** (Phase 2) requires: SpatialDir, Player position/facing
- **Directional barks** (Phase 3) require: DirRing, NpcSystem position forwarding
- **Enemy proximity** (Phase 4) requires: AudioSystem pan, SpatialDir
- **Ambient spatial** (Phase 5) requires: AudioSystem pan, SpatialDir
- **Muffled door BGM** (Phase 6) requires: AudioSystem pan, BiquadFilterNode, spatial contract `bgmLeak` field
- **Biome music continuity** (Phase 7) requires: Phase 6 filter infrastructure, biome comparison in FloorTransition

---

## Cross-References

| Reference | Document | Section | Relationship |
|-----------|----------|---------|--------------|
| Audio bus architecture | DOC-6 AUDIO_ENGINE.md | §Architecture | Foundation — SpatialDir adds panning to existing 3-tier gain bus |
| Spatial envelope pattern | DOC-6 AUDIO_ENGINE.md | §Door Contract Audio | Phase 6 extends this with filter-based muffling |
| Distance attenuation proposal | DOC-6 AUDIO_ENGINE.md | §Spatial Audio — Future | Phase 0 SpatialDir supersedes this proposal with full direction+distance |
| SFX wiring inventory | DOC-6 AUDIO_ENGINE.md | §SFX Inventory — Unwired | Phase 4 enemy footsteps = D2 in that table |
| Tooltip bark delivery | DOC-32 TOOLTIP_BARK_ROADMAP.md | §Phase 5 | Phase 3 directional barks fulfills "spatial audio bark attenuation" |
| NPC bark triggering | DOC-9 NPC_SYSTEM_ROADMAP.md | §4 NpcSystem.js | Phase 3 wires srcX/srcY into BarkLibrary.fire() opts |
| NPC-NPC dialogue | DOC-11 NPC_FACTION_BOOK_AUDIT.md | §3 World-Building Barks | Phase 3d ping-pong directional uses these bark pools |
| Bonfire crackle audio | DOC-30 BONFIRE_POLISH_STEPS.md | §4 Crackle Audio | Phase 5a replaces distance-vol stub with full spatial pan |
| Night-locked muffled barks | DOC-10 COZY_INTERIORS_DESIGN.md | §1 Safety Contract | Phase 6d spatializes existing muffled bark pool |
| Day/night cycle | DOC-7 CORE_GAME_LOOP.md | §5 Day/Night Pressure | Phase 6d night-lock + Phase 7 biome continuity |
| Biome spatial contracts | DOC-4 Biome Plan.html | §4 Spatial Contracts | Phase 7 reads biome field for same-biome music continuity |
| Enemy AI awareness | DOC-3 GONE_ROGUE (stealth) | Pass 3.9 | Phase 4c threat ring uses awareness state |
| KaomojiCapsule speech | `engine/kaomoji-capsule.js` | Rolling ellipsis | Phase 2c on-screen suppression defers to capsule in FOV |
| Floor transition audio | `engine/floor-transition.js:69-82` | Door contract SFX | Phase 6c crossfade replaces hard stopMusic() for same-biome |
| DayCycle night-lock | `engine/day-cycle.js:228-253` | registerNightLock / getMuffledBarkPool | Phase 6d spatializes these |
| **Bark authoring tooling** | **DOC-110 NPC_TOOLING_ROADMAP.md** | §4.2 P2 Bark Workbench | Every bark referenced here is authored/validated through the workbench — coverage, orphan pools, fire-roll distribution, 60-char limit. Manifest feeds Population Planner coherence checks. |