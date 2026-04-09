# Dungeon Gleaner — Audio Engine Reference

**Created**: 2026-03-28
**Module**: `engine/audio-system.js` (Layer 0)
**Companion**: `engine/door-contract-audio.js` (Layer 1)

---

## Architecture

### Web Audio API Bus

AudioSystem builds a three-tier gain bus on first user gesture (click/touch/key):

```
AudioContext
  └─ masterGain (0.0–1.0)
       ├─ sfxGain (0.0–1.0) ← BufferSource nodes (one-shot SFX)
       └─ bgmGain (0.0–1.0) ← MediaElementSource (<audio> streaming)
```

Effective SFX volume = `master × sfx × per-clip volume`.
Effective BGM volume = `master × bgm`.

Default levels: master 0.8, sfx 1.0, bgm 0.6.

### Codec: WebM/Opus Only

No MP3 fallback. LG webOS 3.0+ has native Opus support. All assets encode to WebM/Opus via `scripts/encode-turtlebox.mjs` and ffmpeg. Target bitrate: SFX 64kbps mono, music 128kbps stereo.

### Manifest

`data/audio-manifest.json` maps string keys to file paths and categories. The `_meta.basePath` prefix (`media_assets/audio/`) is prepended at load time. Categories: `ui`, `card`, `combat`, `movement`, `collectible`, `environment`, `music`.

---

## Playback API

### `AudioSystem.play(name, opts)`

One-shot SFX. Fetches + decodes on first call, caches the AudioBuffer for subsequent plays. 80ms rate limiter prevents overlapping spam of the same clip.

Options: `{ volume: 0–1, playbackRate: number }`

### `AudioSystem.playRandom(baseName, opts)`

Picks a random variant: looks up `baseName`, `baseName2`, `baseName3`, etc. in the manifest and plays one at random. Gives natural variety to repeated sounds (footsteps, coin pickups, card snaps).

### `AudioSystem.playSequence(sounds, baseOffset)`

Timed multi-sound sequence. Each entry: `{ key, delay, volume, playbackRate }`. Delay is ms from sequence start. This is the backbone of **spatial audio envelopes** — see Door Contract Audio below.

### `AudioSystem.playMusic(name)`

Streaming BGM via `<audio>` element (no full decode — low memory). Crossfades from current track (400ms linear ramp). Loops automatically.

### `AudioSystem.playSpatial(name, srcX, srcY, plX, plY, opts)`

Distance-attenuated SFX. Computes Euclidean distance from source to player, applies inverse-square falloff `(1 - d/maxDist)²`. Silently no-ops if source is beyond `maxDist`. Routes through `play()` — mono, no stereo panning (see §Spatial Audio below).

Options: `{ volume: 0–1, maxDist: number (default 8), playbackRate: number }`

### `AudioSystem.playFadeOut(name, opts, fadeMs)`

One-shot SFX that fades to silence over `fadeMs` milliseconds (default 5000). Uses Web Audio `linearRampToValueAtTime` on a per-clip GainNode — sample-accurate, no setTimeout chains. Auto-stops the BufferSource after fade completes to free resources. Used for torch extinguish steam hiss.

Options: `{ volume: 0–1, playbackRate: number }`, `fadeMs: number`

### `AudioSystem.preloadCategory(category)`

Fire-and-forget batch preload. Call during floor transitions to warm the buffer cache for the upcoming biome's sounds.

---

## Door Contract Audio — The Spatial Envelope Pattern

`DoorContractAudio` is a pure data module that demonstrates how we layer chiptune SFX into HD spatial sequences. Every floor transition produces a **three-phase sound envelope**:

```
Time:  0ms        250ms       350ms        600ms       1000ms
       │           │           │             │           │
       ▼           ▼           ▼             ▼           ▼
    DoorOpen   Ascend/     Pre-fade      DoorClose    Complete
    (creak)    Descend     delay ends    (thud)
               (whoosh)    (fade starts)
```

The transition table is keyed by `"srcDepth:tgtDepth"` where depth = floor ID segment count (`"1"` = 1, `"1.2"` = 2, `"1.2.3"` = 3). Each entry is an array of `{ key, delay, volume }` objects fed directly to `AudioSystem.playSequence()`.

### Design principles

1. **Layer distance determines sound weight.** World↔building is a light door. Building↔dungeon adds vertical rumble. World↔dungeon skips the close (you're too deep to hear it).

2. **Overlap for realism.** The ascend/descend whoosh starts at 250ms — overlapping the last 30% of the door creak. Sounds shouldn't be sequential; they should blend.

3. **Pre-fade delay sells physicality.** The 350ms gap between door-open and screen fade ensures the player *hears* the door before the world changes. This is the single most important timing constant.

4. **Per-clip volume is relative to the bus.** Door sounds sit at 0.45–0.50, vertical movement at 0.40. Never louder than the master bus baseline.

### Applying this pattern to new systems

Any multi-phase game event can use `playSequence()` the same way:

- **Combat start**: alert sting (0ms) → weapon draw (200ms) → stance shift (400ms)
- **Loot cascade**: lid creak (0ms) → coin scatter (150ms, 250ms, 350ms)
- **Hero patrol pass**: distant footsteps → door → room ambience shift
- **Crate restock**: slot fill chime (0ms) → seal hiss (300ms) → reward ding (500ms)

---

## SFX Inventory — Current Wiring

### Already wired (as of Phase A completion)

| Trigger | Sound Key(s) | Module | Volume |
|---------|-------------|--------|--------|
| Combat start | `enemy-alert` | combat-bridge.js | 0.6 |
| Enemy death (fold) | `enemy-death` | death-anim.js | 0.5 |
| Enemy death (poof) | `zap` | death-anim.js | 0.4 |
| Enemy → ALERTED | `enemy-alert` | enemy-ai.js | 0.35 |
| Enemy → SUSPICIOUS | `ui-signal` | enemy-ai.js | 0.2 |
| Card stacked | `card-stack` (random) | card-stack.js | 0.45 |
| Card hit (suit-keyed) | `hit-spade/club/diamond/heart` (random) | combat-bridge.js | 0.55 |
| Parry | `parry` (random) | combat-bridge.js | 0.5 |
| Suit advantage | `advantage-chime` | suit-toast.js | — |
| Suit disadvantage | `disadvantage` | suit-toast.js | — |
| Footstep | `step-left` (random) | game.js | — |
| Coin pickup | `coin` (random) | game.js | — |
| Item pickup | `pickup` | game.js | — |
| Harvest loot | `pickup-success` | game.js | — |
| Crate smash | `smash` | game.js | — |
| Floor transition | door/ascend/descend sequence | floor-transition.js | 0.4–0.5 |
| Hazard zap | `zap` | hazard-system.js | — |
| Hazard explosion | `explosion-big` | hazard-system.js | — |
| Bonfire crackle (spatial) | `fire_crackle` | game.js | 0.35–0.55 (contract-aware) |
| Torch extinguish (fadeout) | `torch_extinguish` | torch-peek.js, restock-wheel.js | 0.30–0.50 (3.5–5.5s fade) |
| Enemy footstep (patrol) | `step` (pitch-shifted) | enemy-ai.js | 0.18–0.35 (spatial, contract-aware) |
| Enemy footstep (chase) | `step` (pitch-shifted) | enemy-ai.js | 0.25–0.49 (1.4× patrol vol) |
| NPC footstep (patrol) | `step` (pitch-shifted) | npc-system.js | 0.12–0.25 (spatial, contract-aware) |
| Screen shake (combat hit) | — (visual only) | player.js + game.js | Amplitude scales w/ damage |

### Unwired — future phases

| Trigger | Candidate Key(s) | Phase | Notes |
|---------|------------------|-------|-------|
| Card fire (stack released) | `card-fire` (random) | G1 | Currently suit-hit covers this moment |
| Card deal (hand drawn) | `card-deal` (random) | G1 | Start of combat hand |
| Card shuffle (deck reset) | `card-shuffle` (random) | G1 | Floor transition deck reshuffle |
| Card reject (invalid stack) | `card-reject` | G1 | Invalid stack attempt feedback |
| Card fold (fold hand) | `card-fold` | G1 | Forfeit / discard action |
| Hero patrol footsteps | new asset needed | D2 | Heavier footfalls, armor clink (enemy patrol steps now wired) |
| Crate restock seal | `ui-confirm` or new | B3 | Hydration slot fill |
| Cleaning tool swipe | new asset needed | C3 | Rag/mop/brush per-stroke |
| Dungeon reset alarm | `alarm` | C4 | Hero cycle incoming |
| Shop transaction | `coin` (random) | B5 | Buy/sell confirmation |
| Faction rep milestone | `ui-ring` | E3 | Tier unlock chime |
| Boss encounter | `explosion` → `enemy-alert` sequence | E1 | Multi-phase alert |

---

## Spatial Audio — Current State

### What's live

`AudioSystem.playSpatial()` provides **volume-only distance attenuation** — inverse-square falloff, mono output, no stereo panning. All spatial SFX route through the standard `play()` path: one BufferSource → one per-clip GainNode → sfxGain bus. The radius and base volume are **contract-aware** — callers read `FloorManager.getFloorContract().depth` and tune parameters per depth tier:

| Depth | Description | Radius trend | Volume trend |
|-------|-------------|-------------|-------------|
| `exterior` | Open sky, wide streets | Wider (5–7 tiles) | Lower (0.12–0.35) |
| `interior` | Buildings, rooms | Medium (4–5 tiles) | Medium (0.18–0.45) |
| `nested_dungeon` | Tight corridors | Shorter (3–4 tiles) | Higher (0.25–0.55) |

This model is now wired for bonfire crackle, torch extinguish, enemy patrol/chase footsteps, and NPC patrol footsteps. Pitch randomization (±5–10%) keeps repeated steps organic.

`AudioSystem.playFadeOut()` extends this with sample-accurate gain ramps for sounds that need to die away naturally (torch steam hiss: 3.5–5.5s fade, also contract-aware).

### What's missing: stereo panning

A bonfire to the player's left sounds identical to one on the right. On a TV soundbar this is fine — stereo panning on fixed-position speakers is borderline meaningless. On headphones it matters.

### Roadmap: StereoPannerNode upgrade (post-patch)

The cleanest path adds a `StereoPannerNode` per spatial source in `playSpatial()`, with pan derived from the angle between the player's facing direction and the source:

```javascript
// Future pattern — NOT yet implemented:
var angle = Math.atan2(dx, dy) - playerFacingAngle;
var pan = Math.sin(angle);  // Natural sine curve, not linear
panNode.pan.value = Math.max(-1, Math.min(1, pan * 1.3));  // Slight TV-speaker exaggeration
```

This requires passing player facing angle into `playSpatial()` (currently only receives position). Full design with direction ring UI, threat compass, muffled door BGM (OoT lowpass pattern), and biome music continuity is documented in **DOC-50 SPATIAL_AUDIO_BARK_ROADMAP.md** (Phases 0–7, est. 8–10h).

---

## Modification Guide

### Adding a new SFX

1. Encode to WebM/Opus: `ffmpeg -i input.wav -c:a libopus -b:a 64k output.webm`
2. Place in `media_assets/audio/sfx/`
3. Add entry to `data/audio-manifest.json` with category
4. Call `AudioSystem.play('your-key')` or `playRandom('your-base')` for variants

### Adding a new sound sequence

1. Define the timing array: `[{ key, delay, volume }, ...]`
2. Use `AudioSystem.playSequence(sounds)` — delays are ms from sequence start
3. For multi-phase events, stagger delays with 30% overlap between phases
4. Keep per-clip volumes at 0.4–0.55 relative to the bus

### Adding a new music track

1. Encode to WebM/Opus: `ffmpeg -i input.wav -c:a libopus -b:a 128k output.webm`
2. Place in `media_assets/audio/music/`
3. Add entry to `data/audio-manifest.json` with `"category": "music"`
4. Call `AudioSystem.playMusic('your-key')` — it crossfades automatically

### Tuning volume levels

All volume setters clamp to 0.0–1.0. The three-tier bus means you can adjust globally (master), per-channel (sfx/bgm), and per-clip (play opts). For combat, preload the `'combat'` and `'card'` categories on engagement to avoid first-play latency.

---

## Cross-References

- `← DOC-1 GAP §T0.7` — AudioSystem extraction (complete)
- `← DOC-3 GONE_ROGUE Pass 7` — Audio porting from EyesOnly
- `→ DOC-4 BIOME §11` — Biome-specific ambience mapping
- `→ DOC-5 AUDIT §2.4` — Audio asset wiring (Phase G1)
- `⊕ PHASE G.1` — Full audio asset wiring pass
- `⊕ PHASE D.2` — Enemy patrol footstep spatial audio
- `→ DOC-50 SPATIAL_AUDIO_BARK_ROADMAP` — Phases 0–7 extend this engine with StereoPannerNode spatial panning, directional bark UI, muffled door BGM (OoT lowpass pattern), and biome music continuity
