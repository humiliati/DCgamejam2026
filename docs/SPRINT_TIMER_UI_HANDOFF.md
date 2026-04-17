# Sprint Timer UI Handoff — DebriefFeed Timer Row

**For**: UI agent working on DebriefFeed / HUD
**From**: DOC-113 Phase C (engine-side timer)
**Date**: 2026-04-17
**Status**: **SHIPPED 2026-04-17** — UI side landed; engine + UI contract satisfied

> Closure summary: `DebriefFeed.showTimer / updateTimer / hideTimer / getTimerState`
> implemented in `engine/debrief-feed.js` (lines 979–1113). `_renderTimerRow(t)`
> dispatches active vs expired DOM shapes and is called from `_renderUnified`
> ABOVE the category wrapper so the countdown is always visible without
> expanding a category. CSS in `index.html` (`.df-timer-row` + `.df-timer-zone-*`
> + keyframes `df-timer-pulse` / `df-timer-throb` / `df-timer-paused-blink` /
> `df-timer-shatter`). Game.init wires all five QuestChain events
> (`timer-start`/`tick`/`zone`/`expired`/`cancel`) to the DebriefFeed surface.
> Harness: `tools/_sprint-timer-cache/verify-timer.js` — 84/84 green across
> five groups (G1 state 32, G2 zone classes 12, G3 mm:ss format 16, G4
> expired DOM swap 15, G5 paused toggle 9). DOC-109 Phase 0/1/2 regressions
> re-run clean (51+32+37 = 120/120). No net additions to the handoff contract —
> `getTimerState()` was added as a harness affordance (same shape as input).

---

## What this is

Sprint dungeons (DOC-113) have a countdown timer. When the player enters a dungeon with an active `kind:"fetch"` quest step, a timer counts down from `timerMs` (75–90 seconds). The timer should render as a **countdown bar row in the DebriefFeed**, following the same visual pattern as faction reputation rows but ticking **down** instead of up.

## Data contract

QuestChain will expose a new read-only API:

```javascript
QuestChain.getActiveTimer()
// Returns null when no timer is active, or:
// {
//   questId:    'side.1.3.1.cellar_fetch',
//   remainMs:   52340,           // ms remaining (ticks down each frame)
//   totalMs:    75000,           // original budget
//   pct:        0.698,           // remainMs / totalMs (1.0 → 0.0)
//   zone:       'green',         // 'green' | 'yellow' | 'red' | 'expired'
//   paused:     false,           // true during MenuBox/dialogue/transitions
//   heroArchetype: 'seeker',     // which hero spawns on expiry
//   floorId:    '1.3.1'          // floor the timer is active on
// }
```

Zone thresholds (frozen, not configurable):
- **green**: pct > 0.60
- **yellow**: 0.30 < pct ≤ 0.60
- **red**: 0.0 < pct ≤ 0.30
- **expired**: pct === 0

QuestChain will also emit events via the existing `_emit` system:

```
'timer-start'    → { questId, totalMs, floorId }
'timer-tick'     → { questId, remainMs, pct, zone }   // every 1s (not every frame)
'timer-zone'     → { questId, zone, prevZone }          // on zone transition
'timer-expired'  → { questId, floorId, heroArchetype }
'timer-cancel'   → { questId }                          // player left floor / quest completed
```

## DebriefFeed integration pattern

Follow the faction-row model (`_factionRow` / `expandFaction` / `updateFaction`):

1. **New state**: `_timerState = null` (or `{ questId, remainMs, totalMs, pct, zone, heroName }`)
2. **New public API**:
   - `showTimer(questId, totalMs, heroArchetype)` — reveals the timer row (like `expandFaction`)
   - `updateTimer(remainMs, pct, zone)` — updates the bar fill + zone color (like `updateFaction`)
   - `hideTimer()` — removes the timer row (like `collapseFaction`)
3. **Render**: insert the timer row **above** the faction strip in `_renderUnified`. Only visible when `_timerState !== null`.

### Visual language

```
┌─────────────────────────────────┐
│ ⏱ SPRINT TIMER            1:12 │   ← header: i18n 'quest.sprint.timer_label' + formatted mm:ss
│ ██████████████░░░░░░░░░░░░░░░░ │   ← fill bar: green→yellow→red as pct drops
└─────────────────────────────────┘
```

Zone colors:
- **green**: `#4CAF50` (calm, no urgency)
- **yellow**: `#FF9800` — bar pulsates (CSS `@keyframes df-timer-pulse`)
- **red**: `#F44336` — bar throbs faster, optional screen-edge vignette class on `#game-canvas`

On **expired**: bar shatters (flash white → collapse to 0 width), text changes to i18n `quest.sprint.timer_expired` ("TIME'S UP"), row stays visible but switches to a static expired state showing the hero name: "The Seeker blocks the exit" (`quest.sprint.hero_sentinel`).

### Pause visual

When `paused === true` (QuestChain reports this), the bar fill freezes and the time text blinks or dims. Do NOT hide the row — the player needs to see their remaining time through menus.

### i18n keys (already in en.js)

```
quest.sprint.timer_label       → 'TIME'
quest.sprint.timer_expired     → 'TIME'S UP'
quest.sprint.hero_sentinel     → 'blocks the exit'
quest.sprint.hero_pursuit      → 'is hunting you'
quest.sprint.escaped           → 'Escaped!'
quest.sprint.objective_found   → 'Got it — head for the exit!'
quest.sprint.hero_spawn_act1   → 'Heavy footsteps echo from below...'
quest.sprint.hero_spawn_act2   → '{hero} appears at the exit.'
quest.sprint.hero_spawn_act3   → '{hero} appears at the exit. But this time, you're ready.'
```

## Wiring (Game.init callback)

Game.init will wire the connection between QuestChain events and DebriefFeed:

```javascript
QuestChain.on('timer-start', function(data) {
  DebriefFeed.showTimer(data.questId, data.totalMs, data.heroArchetype);
});
QuestChain.on('timer-tick', function(data) {
  DebriefFeed.updateTimer(data.remainMs, data.pct, data.zone);
});
QuestChain.on('timer-expired', function(data) {
  DebriefFeed.updateTimer(0, 0, 'expired');
  // HeroSystem wiring is Phase D — separate from this handoff
});
QuestChain.on('timer-cancel', function(data) {
  DebriefFeed.hideTimer();
});
```

## What the engine agent is building (this session)

- `QuestChain._timer` state object + `_tickTimer(dt)` called from Game tick loop
- `getActiveTimer()` public API
- `onTimerExpired()` 9th event entry point
- Timer pause/resume keyed off `MovementController.isPaused()` + MenuBox state
- Events emitted via `_emit()` for the UI consumer

## What the UI agent should build

- `DebriefFeed.showTimer()` / `updateTimer()` / `hideTimer()`
- `_timerRow()` renderer (HTML + CSS following faction-row pattern)
- Zone color transitions + pulse/throb animations
- Pause visual (blink/dim on freeze)
- Expired state rendering
- Game.init wiring of QuestChain timer events → DebriefFeed calls

The engine side will land first. The DebriefFeed side can be built independently — the API contract above is frozen.

---

## Post-landing notes (2026-04-17)

### Actual API surface (matches handoff)

```javascript
DebriefFeed.showTimer(questId, totalMs, heroArchetype)  // → boolean
DebriefFeed.updateTimer(remainMs, pct, zone, opts)      // opts: { paused? }
DebriefFeed.hideTimer()                                  // → boolean
DebriefFeed.getTimerState()                              // harness/debug snapshot
```

`opts.paused` is optional on `updateTimer`; when omitted, the existing
paused state is preserved. This lets the Game.init tick subscriber pass
only `(remainMs, pct, zone)` without having to re-read paused every frame,
while the zone-change subscriber (which also fires on pause/resume) can
drive the paused flag explicitly.

### Hero archetype fallback order

```
_HERO_NAMES[arch]  →  'The Hero'   (when arch is unrecognized)
```

`_HERO_NAMES` currently covers `seeker / sentinel / pursuer / hunter`.
Adding a new archetype means one line in debrief-feed.js + matching
`quest.sprint.hero_name.<arch>` i18n key (the i18n layer for per-archetype
names is reserved but not yet wired — render-time fallback is used today).

### CSS class emitted

```
.df-timer-row                    ← always present when row is active
.df-timer-zone-green|yellow|red  ← zone class (exactly one at a time)
.df-timer-zone-expired           ← expired zone (replaces green/yellow/red)
.df-timer-expired                ← modifier when zone === 'expired'
.df-timer-paused                 ← modifier when state.paused === true
```

The `df-timer-paused` modifier uses `!important` in index.html to override
the zone pulse/throb animation (pulse/throb run normally on green/yellow/red,
but pause should freeze the fill regardless of zone).

### Expired DOM shape

Expired state emits a different DOM: the bar fill is `width:0%`, the time
text becomes aria-hidden `0:00`, and a `.df-timer-hero-msg` block appears
underneath with "The &lt;Archetype&gt; blocks the exit" (i18n key
`quest.sprint.hero_sentinel` — the name stayed from the first draft even
though any archetype can surface here; rename to `quest.sprint.hero_blocks`
if a later pass wants to match the i18n namespace to the rendered text).

### mm:ss ceiling rule

`_formatMMSS()` uses `Math.ceil(ms/1000)` so "1:00" renders until the clock
ticks INTO 59s (matches rally-rally-style timers where a full round number
always gets its full second of visibility). `0` and negative values render
as `0:00`.

### Related docs

- `docs/SPRINT_DUNGEON_DESIGN.md` — overall DOC-113 design
- `docs/DEBRIEF_FEED_CATEGORIES_ROADMAP.md` — DOC-109 surface (timer sits
  above the category strip, shares `_renderUnified` render path)
- `tools/_sprint-timer-cache/verify-timer.js` — canonical harness
- `tools/_sprint-timer-cache/_fresh-debrief-feed.js` — byte-identical mirror
  (re-write from engine/debrief-feed.js after any edit; see CLAUDE.md
  bindfs caveat).
