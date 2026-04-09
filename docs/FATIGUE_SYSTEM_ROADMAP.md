# Fatigue System — Dungeon Gleaner

## Mirror of EyesOnly Fatigue System

Ported from EyesOnly's `gamestate.js` fatigue subsystem to maintain API parity
and avoid divergence bugs between the shared debrief feed, color system, and
status effect modules.

## Core Design: Inverse Resource (0 = Fresh, 100 = Exhausted)

Fatigue is NOT stamina. Higher = worse. The bar fills UP as the player exerts
and drains DOWN during rest/idle. This matches the EyesOnly debrief feed which
already renders the fatigue bar at `RESOURCE_COLORS.fatigue = '#A0522D'` with
glyph `Ȫ` and animation frames defined.

| Property              | Value  | Notes                                    |
|-----------------------|--------|------------------------------------------|
| `playerFatigue`       | 0      | Starting value (fresh)                   |
| `maxFatigue`          | 100    | 0-100 integer scale                      |
| `_fatigueDecimal`     | 0.0    | Hidden sub-integer accumulator           |
| `fatigueThreshold`    | 70     | Above this: card costs increase (future) |

## GAMESTATE API Surface (on Player module)

Mirrors EyesOnly's `GAMESTATE.getFatigue()` family so the debrief feed's
existing `typeof GAMESTATE` reads work via a thin GAMESTATE facade.

| Function                          | Returns        | Purpose                                  |
|-----------------------------------|----------------|------------------------------------------|
| `Player.getFatigue()`             | `number`       | Current fatigue (0-100)                  |
| `Player.getMaxFatigue()`          | `number`       | Always 100                               |
| `Player.addFatigue(amount)`       | `number`       | Increase fatigue, capped at max          |
| `Player.reduceFatigue(amount)`    | `number`       | Decrease fatigue, floored at 0           |
| `Player.resetFatigue()`           | `void`         | Set to 0 + clear decimal accumulator     |
| `Player.tickFatigueRecovery(dt, isWalking)` | `string\|null` | Passive recovery per frame     |
| `Player.drainHoseFatigue(drain)`  | `boolean`      | Hose exertion (DG-specific, not sprint)  |
| `Player.canHose()`               | `boolean`      | False if fatigue >= maxFatigue           |

Plus a thin `GAMESTATE` facade IIFE that proxies to Player, so the debrief
feed's `GAMESTATE.getFatigue()` / `GAMESTATE.getMaxFatigue()` calls resolve.

## Drain Sources

### 1. Hose Operation (replaces energy drain)

The hose currently drains `Player.spendEnergy()` from `game.js` lines 232-247.
Rewire to `Player.addFatigue()` using the same formula:

```
drain = BASE_DRAIN(1.0) + pathLength × 0.1 + kinkCount × 0.5
```

Per tile moved while carrying hose. When `fatigue >= maxFatigue`:
- Auto-reel triggers (same as current energy exhaustion path)
- Toast: "💨 Hose slipped — too exhausted"
- `canHose()` returns false until fatigue recovers below max

### 2. Bag Encumbrance (new)

Bag weight adds passive fatigue drain while walking:

```
encumbranceDrain = bagWeight × 0.02 per tile moved
```

Where `bagWeight` = count of items in bag (simple). Walking with a full 12-slot
bag adds 0.24 fatigue per tile — noticeable over long hauls but not punishing.
Empty bag = no drain.

Applied in `_onMoveFinish()` alongside HOT tick. Does NOT apply to hose drain
(hose has its own formula).

### 3. Sprint Drain (future — no sprint system yet)

When sprint is implemented, mirror EyesOnly's rates:
- Sprint drain: 10.4 fatigue/sec (continuous, fractional)
- Equipment modifiers: `sprintFatigueModifier` (multiplicative, e.g. 0.6)
- Exhaustion blocks sprint until recovery

## Passive Recovery

Mirrors EyesOnly `tickFatigueRecovery()`:

| State     | Rate          | Full Recovery Time |
|-----------|---------------|--------------------|
| Idle      | 1.0/sec       | ~100 seconds       |
| Walking   | 0.5/sec       | ~200 seconds       |
| Hose hold | 0.0/sec       | Paused             |
| Combat    | 0.0/sec       | Paused             |

Uses the `_fatigueDecimal` accumulator for smooth sub-integer recovery.
Called every frame from `_renderGameplay()` with `frameDt / 1000` as deltaTime.

### Equipment Recovery Modifiers

```javascript
// CardAuthority equipped items with fatigueRecoveryModifier
// e.g. { id: 'ITM-THERMOS', fatigueRecoveryModifier: 1.5 } → 50% faster recovery
for (var i = 0; i < equipped.length; i++) {
  if (equipped[i].fatigueRecoveryModifier) {
    rate *= equipped[i].fatigueRecoveryModifier;
  }
}
```

### Equipment Hose Modifiers

```javascript
// hoseFatigueModifier reduces hose drain (gloves, harness)
// e.g. { id: 'ITM-GLOVES', hoseFatigueModifier: 0.7 } → 30% less hose fatigue
for (var i = 0; i < equipped.length; i++) {
  if (equipped[i].hoseFatigueModifier) {
    drainMod *= equipped[i].hoseFatigueModifier;
  }
}
```

## Recovery Events

| Trigger             | Effect                       |
|---------------------|------------------------------|
| Bonfire rest        | `resetFatigue()` (full)      |
| Bed rest            | `resetFatigue()` (full)      |
| Combat end          | `resetFatigue()` (full)      |
| Food items          | `reduceFatigue(amount)`      |
| Non-lethal defeat   | `resetFatigue()` (full)      |

Food fatigue values (mirror EyesOnly pattern):
- Apple: -5
- Banana: -10
- Energy Drink: -30
- Steak: -25

## Status Effect Integration

Existing status effects in `status-effect.js`:

| Status       | Fatigue Effect                              |
|--------------|---------------------------------------------|
| WELL_RESTED  | `fatigueRecoveryMult: 1.5` (50% faster)    |
| TIRED        | `fatigueRecoveryMult: 0.5` (50% slower)    |
| GROGGY       | `maxFatigueMult: 0.75` (exhausts at 75)    |
| SORE         | `hoseFatigueMult: 1.5` (50% more hose drain)|

## Debrief Feed Integration

The debrief feed already has:
- `RESOURCE_SYMBOLS.fatigue` = `{ glyph: 'Ȫ', idle/up/down frames }`
- `ROW_COLORS.fatigue` = `'#A0522D'`
- `IDLE_OFFSETS.fatigue` = 600ms stagger
- Read path: `GAMESTATE.getFatigue()` / `GAMESTATE.getMaxFatigue()`

A thin `GAMESTATE` IIFE facade bridges the debrief feed's reads to Player:

```javascript
var GAMESTATE = (function () {
  return {
    getFatigue:    function () { return (typeof Player !== 'undefined') ? Player.getFatigue() : 0; },
    getMaxFatigue: function () { return (typeof Player !== 'undefined') ? Player.getMaxFatigue() : 100; }
  };
})();
```

## Files Touched

| File                          | Changes                                          |
|-------------------------------|--------------------------------------------------|
| `engine/player.js`           | Fatigue state + full API (add/reduce/reset/tick)  |
| `engine/game.js`             | Hose drain → fatigue, passive recovery tick, bag encumbrance |
| `engine/gamestate-facade.js` | New thin IIFE bridging GAMESTATE → Player         |
| `index.html`                 | Script tag for gamestate-facade.js                |

## What This Does NOT Touch

- Combat energy (stays per-combat, 5 base, full refill) — RESOURCE_DESIGN.md
- Battery (session-spanning, no passive regen)
- HP (unchanged)
- Focus (separate system)
- Sprint (doesn't exist yet — hooks are ready for when it does)
- No new UI screens, gamepad, gyro, or i18n changes
