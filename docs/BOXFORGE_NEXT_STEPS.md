## BoxForge Enhancement Plan — Peek System Support
### Updated April 8, 2026

What BoxForge already handles well:
The 3-phase system (P1 Idle / P2 Hover / P3 Activated) maps directly to the phase animation contracts we just wrote. Orb palettes cover fire, ember, smoke, poison, ice. Phase anims (squish, bounce, poke, spin, tilt, glow) cover the "impact feel" vocabulary. Sub-attachments let you mount orbs and pyramids on panes. Templates save and restore full configurations.

---

### Phase Mapping Per Peek Type

Phases map to PLAYER INTERACTION STATES, not arbitrary animation stages. Each peek type uses a different subset of phases:

| Peek Type | P1 | P2 | P3 | P4 | Active Phases |
|---|---|---|---|---|---|
| Full Peek | Idle | Open | Activated | — | P1+P2+P3 |
| Action Peek | — | Ready | Pressed | — | P2+P3 |
| Micro Step-On | Impact | Resolve | — | — | P1+P2 |
| Micro Face-To (passive) | Ambient | — | — | — | P1 only |
| Micro Face-To (clicky — self-contained) | Idle/Bobbing | Active/Depleting | Depleted/Cooldown | Reset/Refill | P1+P2+P3(+P4) |
| Micro Face-To (clicky — JS handoff) | Entry anim | Anticipation | **JS TAG** (blank) | Exit anim | P1→P2→[JS]→P4→P2rev→P1rev |

Key design notes:
- Action Peek P2+P3 = tactile button feel. P2 is the "ready" state (button hoverable), P3 is the "pressed" confirmation animation.
- Micro Step-On P1+P2 = collectible auto-pickups, cobwebs, etc. P1 is the impact moment, P2 is the resolve/fade. Duration slider controls the auto-cycle timing.
- Micro Face-To (passive) = single ambient acknowledgment (torch glow, table inspect). One phase, dismiss on look-away.
- Micro Face-To (clicky — self-contained) = bar counter model. ALL phases needed because there's a real gameplay loop: idle bobbing sprite (P1), tap-to-deplete active state (P2), depleted/grey-out (P3), optional refill/reset animation (P4). BoxForge supports 4 phases for these variants.
- Micro Face-To (clicky — JS handoff) = complex minigames that exceed BoxForge's animation capacity (pressure washing, soup kitchen LG Magic Remote interactions). BoxForge authors the BOOKEND animations only. P3 is a blank JS tag — a marker that tells PeekSystem "hand off to dedicated minigame JS module here." The exit sequence reverses: P4 plays the exit transition, then P2 plays in reverse (anticipation unwinds), then P1 plays in reverse (entry anim retracts). This gives the minigame a polished open/close sandwich with BoxForge-authored juice on both ends.

### JS Handoff Phase Sequence (Clicky Minigame Bookends)

```
ENTRY:    P1 (entry anim) → P2 (anticipation) → P3 [JS TAG: blank phase, minigame takes over]
                                                      │
                                                      ▼
                                              Dedicated JS module runs
                                              (PressureWash, SoupKitchen, etc.)
                                              LG Magic Remote pointer/gyro input
                                                      │
                                                      ▼
EXIT:     P4 (exit transition) → P2 reverse (anticipation unwinds) → P1 reverse (entry retracts)
```

BoxForge needs:
- A "JS Tag" phase type for P3 that exports as `{ phase: 3, type: 'handoff', module: 'SoupKitchen' }` in the JSON export
- A "Reverse" playback flag on P1 and P2 so the exit sequence doesn't need separate phase authoring — it reuses the entry phases played backward
- The phase transition preview (Play Sequence button) should show P1→P2→[HANDOFF PLACEHOLDER]→P4→P2rev→P1rev with a gap/marker for the JS portion

---

What's missing — grouped by the workflow gaps the roadmap creates:

### 1. Peek Type Classification Buttons
BoxForge has no concept of what kind of peek a variant is for. Right now it's just "a 3D box." Adding a Peek Type selector in the sidebar header would let the designer tag the variant and have BoxForge enforce constraints:

Full Peek — P1+P2+P3 active, lid animation expected, label-safe regions enforced
Action Peek — P2+P3 only, tactile button adjustments, smaller default scale (0.6×)
Micro Step-On — P1+P2 only, no lid, no labels, auto-dismiss with duration slider, particles dropdown
Micro Face-To (passive) — P1 only, hold-while-facing, no auto-dismiss, no labels
Micro Face-To (clicky — self-contained) — P1+P2+P3+P4, hold-while-facing, tap depletion model, grey-out state in P3, optional refill in P4
Micro Face-To (clicky — JS handoff) — P1+P2+P3[JS TAG]+P4, bookend-only mode. P3 greyed out with "JS Module" text field. Reverse playback enabled for P1/P2. Revolution preset group available for pyramid fan attachments.
Context-Gated — shows a split preview: "Gate A" variant and "Gate B" variant side by side, both sharing the same box shell but with different orb states or different button counts

When you select "Micro Step-On," the tool greys out P3/P4, hides lid controls and label fields, and shows the duration/particles/sound dropdowns from the MicroPeekDescriptor schema. When you select "Micro Face-To (clicky)," it enables P4 and shows tap-count, depletion-rate, and grey-out-style fields. When you select "Context-Gated," it shows two preview columns.
2. Phase Transition Preview
The roadmap describes specific phase sequences — torch lit→ember→smoke, rest tile idle→hover→activation. Currently you toggle between phases manually with three buttons. What's needed:

"Play Sequence" button — auto-cycles P1→P2→P3 at configurable timing (e.g., 300ms→150ms→hold) so the designer sees the full entry animation as a player would
Transition timing sliders — per-phase dwell time (how long P1 shows before transitioning to P2)
Reverse button — plays P3→P2→P1 for the "dismiss" direction

3. Micro-Peek Descriptor Panel
A new sidebar section that appears when peek type is "Micro Step-On" or "Micro Face-To":

Duration slider (250–1200ms)
Entry anim dropdown: pop, slam, fade
Exit anim dropdown: fade, shrink
Particles dropdown: none, dust, embers, sparkle, smoke, splash, poison
Sound key text field
Scale slider (0.3–1.0, default 0.6)
Offset Y slider (nudge from center)

These map 1:1 to the MicroPeekDescriptor schema in §13.2. The export would emit a JSON block alongside the CSS:
javascriptPeekSystem.registerMicro(TILES.TRAP, { variant: 'caltrop', duration: 600, ... });
4. Context Gate Editor
For tiles like TORCH_LIT and BED that have conditional peek types, a new section:

Gate condition dropdown: "Has Item," "Owns Tile," "Floor Depth," "Custom"
Gate A label / Gate B label (e.g., "Has Water" / "No Water")
Gate A peek type / Gate B peek type (from the classification above)
Each gate gets its own phase preview and orb/pyramid configuration
Export emits both variants with the gate function as a comment

5. One-Button Action Overlay Preview
For action peeks (torch extinguish, nap), the designer needs to see what the single-button overlay looks like on top of the box. A new toggle:

"Show Action Button" checkbox → renders a mock button element below the box in the preview (e.g., "🔥 Extinguish" or "💤 Nap (3h)")
Button text field
Button color picker
Warning text field (for curfew warnings: "⚠️ past curfew — wake groggy")
This is display-only — the button doesn't function, but it lets the designer verify the box geometry doesn't overlap the action button at any phase

6. Multi-Button Overlay Preview
For full peeks with multi-button overlays (§12), similar but with 2-4 buttons:

Button count selector (1-4)
Per-button label fields
Layout preview showing title + buttons + hint row

7. Variant Batch Export
The roadmap says ~46 variants need BoxForge authoring. Currently you export one at a time. A batch workflow:

"Export All Templates" button — dumps every saved template's CSS + descriptor JSON into a single file
Template tagging — each template tagged with its tile ID and peek type, so the batch export can generate a complete peek-descriptors.js file

8. Rest Tile Specific: Time Cost Badge
For rest tile variants (nap category), show a preview badge overlaid on the box:

Time cost display (1h, 2h, 3h) pulled from descriptor
Effect summary ("Clear TIRED, 50% HP") as a subtitle
Helps the designer visually confirm the action peek communicates the right information

9. Orb State Presets for Torch Phases
The torch phase animation contract calls for specific orb configurations per phase. Quick-preset buttons:

"Torch Lit→Ember→Smoke" — auto-configures P1=fire/7rings/lit, P2=ember/5rings/ember, P3=smoke/3rings/unlit
"Torch Restock" — auto-configures P1=ember/3rings, P2=smoke/2rings, P3=no-orb
"Rest Bonfire" — P1=fire/9rings/lit, P2=ember/warm, P3=golden-amber/slow-pulse
These are essentially template fragments — they configure only the orb across phases, leaving the box shell untouched

Priority ranking for implementation:
The most impactful additions that streamline the workflow the most, for the least implementation effort:

1. Peek Type selector + constraint enforcement — low code, high value (greys out irrelevant controls, splits passive/clicky/handoff face-to modes)
2. P4 phase support — needed before authoring any clicky variant. Extends 3-phase to 4-phase.
3. JS handoff tag for P3 + reverse playback flag — enables bookend model for complex minigames. P3 exports as `{ type: 'handoff', module: '...' }`. P1/P2 reverse reuses entry without double-authoring.
4. Play Sequence button — now critical: must preview P1→P2→[HANDOFF]→P4→P2rev→P1rev for JS handoff variants
5. Revolution preset group (pyramid spread + spin speed tuning) — pyramid fan technique for crank/pump/stir minigames. Spread 5–30° range + speed ramp curve.
6. Micro-Peek Descriptor panel — maps directly to schema, pure UI addition
7. Orb State Presets — template fragments, quick to implement since template system exists
8. Speed ramp curve / tapSpeedMult parameter — links spin speed to player input rate for self-contained clicky variants
9. One-Button Action overlay preview — helps validate geometry clearance

---

### 10. Clicky Face-To Minigame Tile Survey

Survey of all tiles across living infrastructure, creature verb, economy, and cozy interior categories for bar-counter-style clicky minigame potential. The bar counter model: bobbing interactive sprite with tap-based depletion, needs P1+P2+P3 (or P4) for full juice.

#### Tier 1 — Strong Candidates

**Self-contained (BoxForge authors all phases, tap-to-deplete):**

| Tile | ID | Clicky Verb | P1 (Idle) | P2 (Active) | P3 (Depleted) | P4 (Reset) | Gameplay |
|------|----|-------------|-----------|-------------|----------------|------------|----------|
| BARREL | 44 | Tap/pour | Sealed barrel | Tap opened, liquid flows, tap = fill container | Barrel empty/dry | Refill on restock | Open spigot clicky. Simple 3-tap pour. No aiming needed. |
| FUNGAL_PATCH | 52 | Pick/harvest | Bioluminescent glow (green-blue orb, slow pulse) | Tap = pick, glow dims per pick | Patch depleted (dark) | Regrowth over time | Cleaning tension: each pick removes creature eat-node. Fixed 3-pick depletion. |

**JS handoff (BoxForge bookends, Magic Remote minigame in dedicated module):**

| Tile | ID | Clicky Verb | Bookend Pyramid | LG Remote Input | Why Handoff |
|------|----|-------------|-----------------|-----------------|-------------|
| WELL | 40 | Pump/crank | Spread 20–25°, oscillating (wider downstroke/tighter upstroke) | Scroll wheel = continuous crank rotation | Continuous input, variable duration, overflow risk mechanic |
| SOUP_KITCHEN | 47 | Ladle/serve | Spread 15–20°, broth palette colour shift per revolution | Pointer aim at bowl positions + click = serve portion | Spatial targeting (aim at specific bowls), pointer-dependent |
| ANVIL | 43 | Hammer/strike | Spread 25–30°, ember particle burst on revolution peak | Scroll wheel = pump bellows, click at timing window = strike | Timing-based (rhythm), scroll + click combo, bellows speed ramp |

#### Tier 2 — Medium Candidates (need adaptation)

| Tile | ID | Clicky Verb | Adaptation Notes |
|------|----|-------------|------------------|
| CHARGING_CRADLE | 45 | Calibrate/tune | Dial-tune clicky. Tap adjusts frequency, spark pyramid intensifies. Construct maintenance interaction. |
| SWITCHBOARD | 46 | Toggle/flip | Puzzle-hybrid: tap = toggle switch, match routing pattern. More deliberate than spam-tap. |
| NOTICE_BOARD | 42 | Pin/arrange | Already described as notice board puzzle (§7.4 cozy interiors). Clicky model could be the implementation path. |
| NEST | 50 | Sweep/clean | Scrub clicky. Tap = sweep, debris particles fly. Cleaning verb as face-to minigame. |
| COOKING_POT | — | Stir/combine | Stir clicky within the full-peek recipe flow. Tap = stir, steam rises. |
| MUSIC_BOX | — | Wind/crank | Crank clicky. Tap = wind mechanism, melody plays. Pure vibes + subtle stat modifier. |
| DUMP_TRUCK | 38 | Prime pump | Tap = pump handle to pressurize equipment. Makes prep feel physical. Currently passive face-to. |

#### Tier 3 — Stretch Candidates

| Tile | ID | Notes |
|------|----|-------|
| DEN | 51 | Hold-to-peek-inside tension mechanic rather than tap. Full phase set for lean-forward animation. |
| ENERGY_CONDUIT | 53 | Hold-and-release timing game. Build charge, release at right moment = clean harvest, overshoot = shock. |
| STRETCHER_DOCK | 55 | Strap-check taps. Low juice — duty action rather than fun minigame. |

#### Not Candidates (confirmed wrong fit)

- ROOST (49), TERRITORIAL_MARK (54) — step-on only, no facing interaction
- TRIAGE_BED (56), MORGUE_TABLE (57), INCINERATOR (58), REFRIG_LOCKER (59) — full peek multi-button menus
- CARD_TABLE (unassigned) — delegated puzzle minigame (sorting), not a clicky loop
- TROPHY_SHELF (unassigned) — display only

#### BoxForge Implications

1. **P4 phase support is required** before authoring any Tier 1 clicky variant. Current 3-phase system must extend to 4.
2. **Depletion animation curve** — P2 needs to support repeated tap-triggered sub-animations (each tap plays a strike/crank/ladle micro-anim within P2). This is new: current phases are static states, not tap-responsive.
3. **Grey-out state authoring** — P3 depleted variants need a "desaturated" or "dimmed" version of the P1 geometry. BoxForge should have a "grey-out" toggle that auto-generates P3 from P1 with reduced saturation.
4. **Tap counter overlay** — like bar counter's "3 taps remaining", clicky variants need a visible tap budget. BoxForge preview should show this as a badge on the box.
5. **JS handoff tag for P3** — complex minigames (soup kitchen, pressure washing, etc.) use BoxForge for entry/exit bookends only. P3 exports as a blank JS handoff marker. Exit plays P4→P2rev→P1rev. See §Phase Mapping above.
6. **Reverse playback flag** — P1 and P2 need a "play in reverse" mode so exit sequences reuse entry phases without separate authoring.

---

### 11. LG Magic Remote — Revolution & Crank Minigame Architecture

**Target platform context:** The LG webOS Magic Remote is essentially a Wii Remote — it has pointer/gyro input, a scroll wheel, and click. Any Wii Sports activity that shines with motion controls but is also mouse-capable becomes a candidate for micro face-to minigames. The pointer maps to mouse position; the scroll wheel maps to mouse wheel; the OK button maps to click/tap.

#### 11.1 Revolving Fan Technique (Pyramid Spread Tuning)

BoxForge's pyramid attachment already has a `spread` property (0–90°) that controls the hinge angle of the four triangle faces at the apex. The spin animation (`wb-pyramid-spin`) rotates the entire pyramid around Y at a configurable speed.

**Key insight:** By adjusting the spread to near-flat (5–15°) and increasing spin speed, the four triangle faces become a revolving fan/propeller visual. At spread=0° the faces collapse into a flat disc; at spread=90° they're fully open tetrahedron. The sweet spot for crank/revolution animations:

| Animation Type | Spread | Spin Speed | Visual Effect |
|---|---|---|---|
| Slow crank idle | 10–15° | 2–3s/rev | Lazy windmill — faces barely separated, gentle rotation |
| Active cranking | 8–12° | 0.5–1s/rev | Fast fan — player input drives speed increase |
| Pump handle (well) | 20–25° | Variable | Asymmetric: spread oscillates with each tap (wider on downstroke, tighter on upstroke) |
| Pressure washer nozzle | 5–8° | 0.3s/rev | Tight spiral — nearly flat disc, very fast spin, conveys high-pressure jet |
| Ladle stir (soup kitchen) | 15–20° | 1.5–2s/rev | Medium fan with colour shift (broth palette) per revolution |
| Bellows/forge pump (anvil) | 25–30° | Variable | Wide spread, slow → fast with each hammer tap. Embers particle burst on each revolution peak. |

BoxForge should add a **"Revolution" preset group** alongside the existing orb state presets. These configure pyramid spread + spin speed + phase-linked speed ramping in one click.

#### 11.2 Crank-Driven Speed Ramping

For self-contained clicky minigames (Tier 1), the spin speed should be linked to player input rate:

```
P1 (idle): spin speed = baseSpeed (slow idle rotation)
P2 (active): spin speed = baseSpeed + (tapRate * speedMult)
  — each tap/scroll event bumps tapRate, which decays over time
  — spin visually accelerates when player is actively cranking
  — spin decays back toward baseSpeed when player stops
P3 (depleted): spin speed decelerates to 0 over 500ms (wind-down)
P4 (reset): spin snaps back to baseSpeed (ready for next round)
```

BoxForge needs a **"speed ramp" curve editor** or at minimum a `tapSpeedMult` parameter per phase that defines how much player input accelerates the spin.

#### 11.3 JS Handoff Minigame Candidates (LG Magic Remote Showcase)

These minigames are too complex for BoxForge's animation system alone. BoxForge authors the entry/exit bookends (P1→P2→P3[handoff]→P4→P2rev→P1rev); the actual gameplay runs in dedicated JS modules using Magic Remote pointer/gyro/scroll input.

| Tile | Minigame | LG Remote Input | JS Module | BoxForge Bookend |
|------|----------|-----------------|-----------|------------------|
| Wall grime (via TRUCK_HOSE) | **Pressure washing** | Pointer aim + hold OK = spray beam on 16×16 sub-tile wall grid | PressureWash (§6 of PRESSURE_WASHING_ROADMAP) | Hose reel entry anim (pyramid fan, tight spread=5°, fast spin). Exit: reel retract. |
| SOUP_KITCHEN (47) | **Ladle serving** | Pointer aim at bowl positions + click = serve | SoupKitchen | Pot steam entry (orb, fire→steam palette shift). Exit: steam settles. |
| ANVIL (43) | **Forge hammering** | Scroll wheel = pump bellows, click at right moment = strike | ForgeStrike | Ember bloom entry (pyramid fan spread=25°, accelerating spin). Exit: cool-down deceleration. |
| WELL (40) | **Bucket crank** | Scroll wheel = crank rotation, smooth continuous input | WellCrank | Crank handle rotation entry (pyramid asymmetric spread oscillation). Exit: bucket splash + settle. |
| SWITCHBOARD (46) | **Route matching** | Pointer + click = toggle switches in pattern | SwitchRoute | Panel boot-up entry (indicator lights sequence on). Exit: lights confirm. |
| PUZZLE (23) | **Sliding tiles** | Pointer + click/drag = slide tile | PuzzlePeek (existing) | Already has custom render delegate. Could adopt bookend model. |

#### 11.4 Self-Contained vs JS Handoff Decision Rule

A minigame is **self-contained** (BoxForge authors all phases) when:
- The interaction is tap-to-deplete with a fixed tap count (3–5 taps)
- No pointer aiming or continuous input needed
- No sub-tile or spatial targeting (just "hit the button N times")
- Examples: BAR_COUNTER, BARREL, FUNGAL_PATCH, NEST sweep

A minigame needs **JS handoff** when:
- It requires pointer/gyro aiming at a spatial target (wall grime grid, bowl positions)
- It uses continuous input (scroll wheel for cranking, hold-to-spray)
- It has complex state beyond "depleted/not depleted" (routing puzzles, recipe combinations)
- The interaction duration is variable/player-controlled (pressure washing a wall takes as long as the wall is dirty)
- Examples: pressure washing, well crank, anvil forge, switchboard routing, soup kitchen serving