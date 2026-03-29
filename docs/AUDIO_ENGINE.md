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

### Unwired — future phases

| Trigger | Candidate Key(s) | Phase | Notes |
|---------|------------------|-------|-------|
| Card fire (stack released) | `card-fire` (random) | G1 | Currently suit-hit covers this moment |
| Card deal (hand drawn) | `card-deal` (random) | G1 | Start of combat hand |
| Card shuffle (deck reset) | `card-shuffle` (random) | G1 | Floor transition deck reshuffle |
| Card reject (invalid stack) | `card-reject` | G1 | Invalid stack attempt feedback |
| Card fold (fold hand) | `card-fold` | G1 | Forfeit / discard action |
| Enemy approaching footsteps | `step-left` (pitch-shifted) | D2 | Pathing enemies, distance-attenuated |
| Hero patrol footsteps | new asset needed | D2 | Heavier footfalls, armor clink |
| Crate restock seal | `ui-confirm` or new | B3 | Hydration slot fill |
| Cleaning tool swipe | new asset needed | C3 | Rag/mop/brush per-stroke |
| Dungeon reset alarm | `alarm` | C4 | Hero cycle incoming |
| Shop transaction | `coin` (random) | B5 | Buy/sell confirmation |
| Faction rep milestone | `ui-ring` | E3 | Tier unlock chime |
| Boss encounter | `explosion` → `enemy-alert` sequence | E1 | Multi-phase alert |

---

## Spatial Audio — Future: Distance Attenuation

The current system plays all SFX at uniform volume regardless of source position. For pathing enemies (Phase D), we need distance-based attenuation:

```javascript
// Proposed pattern for spatial SFX:
function playSpatial(name, sourceX, sourceY, playerX, playerY, opts) {
  var dx = sourceX - playerX;
  var dy = sourceY - playerY;
  var dist = Math.sqrt(dx * dx + dy * dy);
  var maxDist = opts.maxDist || 8;
  if (dist > maxDist) return; // Too far to hear

  var attenuation = 1 - (dist / maxDist);
  var vol = (opts.volume || 0.5) * attenuation * attenuation; // Inverse-square falloff
  AudioSystem.play(name, { volume: vol, playbackRate: opts.playbackRate || 1 });
}
```

This would be added to AudioSystem as `playSpatial()` when Phase D enemy pathing lands. The approach: enemy footsteps use `step-left` variants with slight pitch randomization (`playbackRate: 0.9–1.1`), attenuated by grid distance. Player hears approaching footsteps grow louder — creates tension without sight lines.

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
