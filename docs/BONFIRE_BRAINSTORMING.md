we have bonfires as a catch all location that needs to be contextually aware for different interactions like waypoints, brief resting+Healing over time (like stepping on a save in any final fantasy but weaker and depletes), advancing time. we dont wan't the bonfire in the middle of the dungeon to act as a stash but it can enable saving or brief rest. the bonfire at home enables everything. currently it's come up because we're working out our stardew valley like time cycle and we're mixing up whether a bonfire at the bottom of a dungeonN.N.N should or shouldnt act as a waypoint to the bonfire at the dungeonN.N entrance with the support NPC and dungeon library, trophy rack, scoreboard (that looks like a porta-john cleaning log).
here's our considerations: bonfires on floorN (camp grounds) and players home advance to next day. we might need to update the bonfire document with a coherent waypoint and rest, stash bonfire contracts system that applies pressure to players correctly and very similarly to stardew valley per Juice (bonfires_polish_steps failed to clarify the specific resting places). we don't want to say beds are resting places because of future proc gen, but we want to enable resting outside, at home, and at inns. failstate returns to home.

it occurs to us the easiest way to achieve this is to pair a bonfire with a corresponding npc or object/tile to achieve the different types rest locations might be the most light weight

You’re circling the right solution. Treat the bonfire as a base primitive, and push behavior into a paired context provider (NPC / object / tile). That keeps it lightweight, scalable, and compatible with proc gen.

Below is a clean system you can drop into your design doc.

🔥 Bonfire System (Contextual Contracts)
Core Principle

A bonfire never decides its full behavior alone.
It exposes a baseline interaction, then augments based on its paired context.

Bonfire = Anchor
Context = Permissions

1. Baseline Bonfire (always available)

Every bonfire supports:

Save
Brief Rest
small HP recovery over time
consumes a limited “warmth” charge
Time Advance (optional, gated)
Checkpoint Anchor (failstate return)
[ BONFIRE BASE ]
- Save
- Warmth Rest (limited, depleting)
- Bind Return Point

No stash. No teleport by default.

2. Context Pairing System

Each bonfire checks for a nearby Context Provider:

NPC
Structure
Tile type
Tagged zone
BONFIRE + CONTEXT = CONTRACT
3. Context Types (modular, stackable)
🏕️ Field Camp (Floor0 / Floor3 style)

Context: scattered props, maybe 1 NPC

Enable:
Save
Limited rest (low warmth cap)
Disable:
stash
fast travel
FEEL: survival, temporary, exposed
🧭 Dungeon Entrance Hub (FloorN.0)

Context: support NPC + infrastructure

Enable:
Waypoint link to same dungeon chain
Dungeon retry loop
Light services (repair, info, logs)
Disable:
full stash (optional toggle)
FEEL: operational outpost

👉 This is your porta-john log scoreboard location.

🏠 Home Bonfire

Context: “ownership” flag + full environment

Enable:
Full rest (advance day)
Stash
Crafting / upgrades
Fast travel network root
FEEL: safety, control, reset
🛏️ Inn / Civilian Rest Spot

Context: NPC vendor (innkeeper) OR tagged structure

Enable:
Paid/full rest (advance day)
Save
Disable:
stash (optional)
global fast travel (optional)
FEEL: safe but transactional
🔥 Deep Dungeon Bonfire (FloorN.N.N)

Context: none or hostile proximity

Enable:
Save
VERY limited warmth rest
Disable:
stash
time advance (usually)
waypoint (default OFF)
FEEL: tension anchor, not relief
4. Waypoint Logic (important decision)

Do NOT auto-link all bonfires.

Instead:

Waypoints require:
Matching network ID (same dungeon tier)
AND presence of a Waypoint Enabler Context
Recommendation (your case)
Dungeon Entrance (FloorN.0) = waypoint node
Deep floors (N.N.N) = NOT waypoint nodes

BUT:

👉 You can unlock a temporary return link:

"Mark Path" (consumable or charge-based)
- creates 1-way return from deep bonfire → entrance
- expires after use or day change

This gives:

safety valve
but preserves pressure
5. Time System Integration (Stardew-like pressure)
Rule:

Only specific contexts allow full day advance

Location	Advance Day	Notes
Home	✅	primary loop
Campgrounds	✅	but risky / limited
Inns	✅	paid
Deep Dungeon	❌	prevents farming safely
Partial Rest (any bonfire)
consumes “warmth”
does NOT advance day
weak recovery
6. Failstate Loop
Player collapses → returns to last bound bonfire
If deep dungeon:
optionally force return to nearest “safe-tier” bonfire (entrance or home)
Apply:
time penalty
resource decay
7. Why This Works
Matches your goals:
✔ avoids “beds” as hard dependency
✔ supports proc gen (context tags are cheap)
✔ preserves dungeon pressure
✔ mirrors Stardew pacing without copying it
✔ keeps bonfire identity consistent
8. Implementation (lightweight)

Each bonfire runs:

contexts = scan(radius)

permissions = BASE

for c in contexts:
    permissions += c.contract

apply(permissions)
9. Design Heuristic (quick check)

When placing a bonfire, ask:

What verbs should be allowed here?
What pressure should remain?
What loop does this support?

Then assign the context accordingly.

10. One Key Decision (you should lock this)

👉 Do you want dungeon delving to be:

Commitment-based (no easy exit)
or route-based (players optimize waypoint chains)

Your current direction strongly benefits from:

Commitment-based with limited escape valves

If you want next, I can:

Write the actual bonfire_contracts.md
Design the “Mark Path” item + economy
Or map this system onto your Floor0–3 layouts explicitly
Ads do not influence the answers you get from ChatGPT. Your chats stay private. 
Learn about ads and personalization
let's write the example bonfire contracts 

let's make it so floorN.N.N bonfires DO return player to floorN.N dungeon entrance if the cleanliness threshold has been reached.



Good—this gives you a clean lever: cleanliness = earned extraction.
Below is a .md-ready contracts spec with explicit behavior, including your rule that deep bonfires unlock return once the dungeon is “clean enough.”

# bonfire_contracts.md

## Core Model

A bonfire exposes a **Base Contract**, then merges with any nearby **Context Contracts**.


FINAL_BEHAVIOR = BONFIRE_BASE + Σ(CONTEXT_CONTRACTS)


Bonfires never hardcode behavior beyond base.

---

## BONFIRE_BASE

All bonfires provide:

- Save
- Bind (failstate return point)
- Warmth Rest
  - small heal over time
  - consumes local warmth charges
- UI Surface (available actions depend on contracts)


[BASE]

save
bind_return
warmth_rest(limited)

---

## GLOBAL VARIABLES


cleanliness[dungeon_id] : 0.0 → 1.0
cleanliness_threshold_return : 0.65 // tunable

warmth_capacity : per-bonfire
warmth_regen_rate : per-context


---

## CONTEXT: FIELD_CAMP

Minimal survival node (Floor0 / Floor3 wilderness)


[FIELD_CAMP]

warmth_capacity = low
allow_time_advance = true
safety_level = low
stash
waypoint

---

## CONTEXT: DUNGEON_ENTRANCE (FloorN.0)

Operational hub


[DUNGEON_ENTRANCE]

waypoint_node = true
waypoint_network = dungeon_id
allow_return_from_deep = true
npc_services:
repair
logs (scoreboard / cleanliness display)
guidance
optional_stash = limited
warmth_capacity = medium
allow_time_advance = false

---

## CONTEXT: HOME

Player-owned anchor


[HOME]

waypoint_node = root
stash = full
crafting = enabled
upgrades = enabled
allow_time_advance = true
full_rest = true
warmth_capacity = infinite

---

## CONTEXT: INN

Civilian rest node


[INN]

paid_rest:
full_heal
advance_day
save
warmth_capacity = medium
stash (optional toggle)
waypoint (optional)

---

## CONTEXT: DEEP_DUNGEON (FloorN.N.N)

Tension anchor with conditional extraction


[DEEP_DUNGEON]

save
warmth_capacity = very_low
allow_time_advance = false
stash
waypoint (default)
conditional_return:
if cleanliness[dungeon_id] >= cleanliness_threshold_return:
enable_action: "Return to Entrance"
target: dungeon_entrance_bonfire(dungeon_id)
cost:
- consume all remaining warmth
- apply fatigue (temporary debuff)

---

## CLEANLINESS SYSTEM

Represents how “resolved” a dungeon is.

### Sources of cleanliness:
- defeating enemies
- clearing rooms
- completing micro-objectives
- stabilizing anomalies (optional system hook)


cleanliness += weighted_events


### Properties:
- global per dungeon instance
- visible at:
  - entrance hub (explicit %)
  - deep bonfire (implied via feedback: flame intensity, UI hint)

---

## RETURN FLOW (CRITICAL LOOP)

### Without threshold met:
- deep bonfire = **commitment anchor only**
- player must manually backtrack or failstate

### With threshold met:
- deep bonfire becomes **one-way extraction point**


deep_bonfire → entrance_bonfire


No free traversal back down.

---

## FAILSTATE RULE

On player defeat:


if last_bound_bonfire.context == DEEP_DUNGEON:
if cleanliness < threshold:
return_to = entrance_bonfire
else:
return_to = last_bound_bonfire
else:
return_to = last_bound_bonfire


Apply:
- time penalty
- partial resource loss

---

## TIME SYSTEM INTEGRATION

| Context           | Advance Time | Advance Day |
|------------------|-------------|-------------|
| HOME             | yes         | yes         |
| FIELD_CAMP       | yes         | yes (risk)  |
| INN              | yes         | yes (paid)  |
| DUNGEON_ENTRANCE | no          | no          |
| DEEP_DUNGEON     | no          | no          |

---

## DESIGN INTENT

- Bonfires are **consistent anchors**, not feature hubs
- Context defines **capability, safety, and pressure**
- Cleanliness introduces:
  - pacing control
  - earned relief
  - anti-grind constraint

---

## QUICK PLACEMENT GUIDE

When placing a bonfire:

1. Assign context(s)
2. Set warmth capacity
3. Decide if it contributes to cleanliness loop
4. Verify:
   - does this reduce or maintain pressure?
   - does it create a meaningful decision?

---

## OPTIONAL EXTENSIONS

- "Overclean" bonus (>0.9):
  - bonus rewards at entrance
- Faction influence:
  - different NPCs modify contracts
- Dynamic degradation:
  - uncleared dungeons lose cleanliness over time


---

### Why this is solid

- Your **floor3 sparse wilds** → camp bonfires feel fragile  
- Your **deep dungeon** → tension preserved until player earns extraction  
- Your **entrance hub** → becomes a meaningful “surface layer”  
- Your **time system** → stays grounded (no dungeon day-skipping exploits)
