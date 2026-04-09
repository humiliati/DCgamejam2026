Minigame Opportunity Survey
Surveyed all tiles from §11.1 (IDs 40–48), §15.1 (IDs 49–54), §15.2 (IDs 55–59), §15.6 (unassigned), plus existing tiles with latent minigame potential. Here's every tile that could get the bar-counter clicky treatment:
Tier 1 — Strong clicky minigame candidates (bar-counter model fits naturally):

WELL (40) — Draw water: crank/pump handle clicky. P1: handle resting. P2: player pumps (tap to crank, bucket rises). P3: bucket full, water splashes. P4: bucket empties/resets. Fills water containers, satisfies social verb for nearby NPCs. The pump animation is the minigame — faster tapping = faster fill but risk overflow (spill = partial fill).
SOUP_KITCHEN (47) — Serve food: ladle clicky. P1: pot simmering (steam orb, slow pulse). P2: player ladles portions (tap to serve, each tap fills a bowl sprite). P3: pot empty/scraping bottom. P4: pot refills on next visit. Serves rations to self or nearby NPCs, clearing hunger/energy debuffs. Three taps like bar counter but with a cauldron animation instead of a mug.
ANVIL (43) — Hammer strikes: tap-to-forge clicky. P1: hot metal on anvil (ember orb glow). P2: player hammers (tap = strike, sparks particle burst per hit). P3: metal cooled/shaped, anvil rests. P4: new workpiece placed. This is the foundry's work-station duty action — quick repair or sharpening buff for equipped items.
BARREL (44) — Tap/pour: open spigot clicky. P1: sealed barrel. P2: tap opened, liquid flowing (tap to fill container). P3: barrel empty/dry. Similar to well but simpler — single-action pour with quantity management.
FUNGAL_PATCH (52) — Harvest glow: careful pick clicky. P1: bioluminescent glow (green-blue orb, slow pulse). P2: player picks (tap to harvest, glow dims per pick). P3: patch depleted (dark). Tension mechanic already described in the roadmap — picking removes the creature eat-node. The clicky adds tactile weight to the decision.

Tier 2 — Medium candidates (need adaptation but the interaction loop fits):

CHARGING_CRADLE (45) — Calibrate construct: dial/tune clicky. P1: cradle humming (electric spark pyramid attachment). P2: player adjusts calibration (tap to tune frequency, spark intensifies). P3: construct charged/calibrated (steady glow). P4: discharge/reset. This is the construct equivalent of the well — a maintenance interaction that rewards repeated visits.
SWITCHBOARD (46) — Toggle routing: flip switches clicky. P1: panel idle (indicator lights dim). P2: player flips switches (tap = toggle, lights change color per flip). P3: all routes configured (panel lit). This could be a puzzle-minigame hybrid — the player needs to match a routing pattern rather than just spam taps. More deliberate than bar counter but same phase structure.
NOTICE_BOARD (42) — Pin/arrange notices: drag-and-stick clicky. P1: board with scattered notices. P2: player reorganizes (tap to pin/rearrange, notices shuffle). P3: board organized (planning bonus). Already described in §7.4 of cozy interiors as the "notice board puzzle" — the clicky model could be the implementation path.
NEST (50) — Sweep/clean: scrub clicky. P1: messy nest (debris texture). P2: player sweeps (tap to scrub, debris particles fly out). P3: nest cleaned (readiness bonus). The cleaning verb as a face-to minigame rather than a simple interact — gives tactile satisfaction to the core loop.
COOKING_POT (unassigned) — Stir/combine: stir clicky. P1: pot cold. P2: ingredients added, player stirs (tap = stir, steam rises). P3: meal cooked (recipe result). P4: pot cools/resets. Already in §15.6 as a full-peek delegated, but the stir step could be a clicky phase within the full peek.

Tier 3 — Stretch candidates (minigame possible but lower priority):

DEN (51) — Careful inspection: face-to with peek-inside phase. P1: den mouth visible. P2: player peers in (hold = lean forward animation, see creature count). P3: disturbed — creature stirs. Not a clicky per se but uses the full phase set for a tension-based hold mechanic.
ENERGY_CONDUIT (53) — Discharge/harvest: hold-and-release clicky. P1: conduit sparking. P2: player channels harvest (hold = energy builds, orb brightens). P3: overload warning (shake animation). Release at right moment = clean harvest, hold too long = shock. Rhythm/timing game rather than tap spam.
STRETCHER_DOCK (55) — Dispatch prep: strap-check clicky. P1: empty dock. P2: stretcher loaded, player checks straps (tap = tighten). P3: dispatch ready. Low juice — more of a duty action than a fun minigame.
MUSIC_BOX (unassigned) — Wind mechanism: crank clicky. P1: box closed. P2: lid opens, player winds (tap = crank turns, melody plays). P3: melody playing (passive). P4: melody ends, lid closes. Already in §15.6 as micro face-to — the crank adds tactile input.
DUMP_TRUCK (38) — Pressure wash activation: prime-the-pump clicky. P1: truck idle. P2: player primes equipment (tap = pump handle). P3: equipment ready (hose pressurized). Currently a passive face-to — adding the prime-pump clicky makes equipment prep feel physical.

Not candidates (confirmed as wrong fit for clicky):

ROOST (49), TERRITORIAL_MARK (54) — step-on only, no facing interaction
TRIAGE_BED (56), MORGUE_TABLE (57), INCINERATOR (58), REFRIG_LOCKER (59) — full peeks with multi-button menus, too complex for clicky model
CARD_TABLE (unassigned) — already a delegated full peek puzzle minigame (sorting), not a clicky loop
TROPHY_SHELF (unassigned) — display only, no interaction loop