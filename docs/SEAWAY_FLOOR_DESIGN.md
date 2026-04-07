# Seaway Floor Design — Floors 0.1, 0.1.1, 0.1.2

**Created**: 2026-04-06
**Depends on**: `ACT2_NARRATIVE_OUTLINE.md` (routing, faction context), `STREET_CHRONICLES_NARRATIVE_OUTLINE.md` (Jesuit origin, chimera lore), `Biome Plan.html` (spatial contract conventions)
**Scope**: Environment design, layout philosophy, tile vocabulary, lore delivery, and wing structure for the three seaway floors. Does NOT cover enemy placement tables or card loot (those belong in a balancing pass).

---

## 1. Design Intent

The seaway is a single physical space serving two narrative functions simultaneously. The player must feel both at once but be told neither:

**Function A (subliminal):** This is where the panda chimera program began. A Jesuit apothecary laboratory, circa 1624, built beneath what is now the tutorial courtyard. Anatomical experiments. Biological engineering dressed in the language of alchemy. The architecture whispers this through environmental detail: etched diagrams, fused glassware, drainage channels cut into stone floors, a surgical theater with an altar-shaped operating table. The player is never given a plaque that reads "chimera lab." They walk through it and feel the wrongness.

**Function B (explicit):** This is BPRD's off-books storage facility. The modern agency inherited the space, partially demolished the ancient structure to install sterile corridors and caged storage, and uses it to warehouse seized paranormal evidence. The player sees this clearly: fluorescent strip lighting bolted to medieval stonework, filing cabinets pushed against carved alcoves, evidence containers with BPRD classification stamps stacked on iron shelving behind chain-link cage walls. This is a government basement. It looks like one.

The tension between the two functions is the seaway's identity. The ancient wings feel sacred and violated. The modern wings feel bureaucratic and sinister. The transition zones, where a stone archway opens into a fluorescent corridor or a cage wall is bolted across a carved doorframe, are where the player registers that these are the same institution wearing different clothes across 400 years.

---

## 2. Floor Hierarchy

```
"0"       The Approach        (depth 1, exterior — tutorial courtyard)
"0.1"     Seaway Vestibule    (depth 2, interior — stairwell transition)
"0.1.1"   Seaway Tunnels      (depth 3, dungeon — main complex, mixed wings)
"0.1.2"   Seaway Deep         (depth 3, dungeon — surgical theater, climax floor)
```

The entrance is a DOOR tile on Floor 0 that is WALL until the mid-Act 2 trigger (`seaway_open` flag). The tile position should be near the center of The Approach, on a path the player has walked dozens of times. When the wall becomes a door, the player's mental map cracks: this was always here.

---

## 3. Floor 0.1 — Seaway Vestibule

**Type:** Interior (depth 2). Time-freeze applies.
**Size:** Small. 16x12. Hand-authored.
**Biome:** `cave-entry` (damp stone, low amber light, dripping water SFX)
**Purpose:** Transition space. Teaches the player that something is below Floor 0.

### Layout Philosophy

A short descent. Stone steps leading down from the courtyard surface into a vaulted antechamber. The room is unremarkable: a carved stone stairwell, old but maintained. A single BPRD equipment locker against one wall (interactable, contains a flashlight item or battery). A DOOR leading further down.

The key detail: a Jesuit cross carved above the door lintel, partially chipped away. Someone tried to remove it. They didn't finish. The player can examine it (peek interaction) but the text is neutral: "A worn carving. Looks old." No exposition. Just presence.

### Tile Vocabulary

| Tile | Usage |
|---|---|
| WALL | Carved stone (texture: `stone-carved`, darker than standard) |
| EMPTY | Flagstone floor |
| DOOR | Descent to 0.1.1 |
| DOOR_EXIT | Return to Floor 0 |
| CHEST | BPRD equipment locker (single item) |
| PILLAR | Load-bearing stone columns (2, flanking the descent door) |

---

## 4. Floor 0.1.1 — Seaway Tunnels

**Type:** Dungeon (depth 3). Clock runs. Enemies present.
**Size:** 40x32. Hand-authored with procedural fill in designated zones.
**Biome:** `apothecary-contraband` (dual palette, wing-dependent)
**Purpose:** Main exploration floor. Mixed ancient/modern wings. Dispatcher found here. Hostile faction team encounter.

### Wing Structure

The floor is divided into four named wings connected by a central junction. The player enters from the north (stairs from 0.1) into the junction. Each wing has a distinct character:

```
              NORTH
         ┌─────┬─────┐
         │     │     │
         │ CAVE│CACHE│
         │WING │WING │
         │     │     │
    WEST ├─────┼─────┤ EAST
         │   JUNCTION │
         │     +S     │
         │             │
         ├─────┬─────┤
         │     │     │
         │ LAB │VAULT│
         │WING │WING │
         │     │     │
         └─────┴─────┘
              SOUTH
                ↓ STAIRS_DN to 0.1.2
```

**S** = STAIRS_UP to Floor 0.1

#### 4.1 Cave Wing (Northwest)

**Palette:** Ancient. Unmodified 1624 stonework. Dim amber torchlight (iron sconces, not BPRD fluorescent). Low ceiling (wallHeight 1.0).

**Character:** The oldest part of the complex, left alone because BPRD found nothing useful here. But "nothing useful" means "nothing they recognized." The walls carry anatomical etchings that look decorative until the player studies them: cross-sections of organs, circulatory diagrams, a repeating motif of a bear-like quadruped with its ribcage open. The etchings are not labeled. They are not highlighted. They exist on the wall texture, visible to the player who stops and looks.

**Tile vocabulary:** WALL (stone-carved, etched variant), EMPTY (worn flagstone), PILLAR (carved columns), BONFIRE (ancient fire pit, functional rest point).

**Lore items:** 1-2 bookshelf tiles containing alchemical texts. Readable via peek. Written in period language. One passage describes "the great work of grafting" and "vessels shaped to carry what nature would not permit." The word "panda" does not appear. The word "chimera" does not appear. The player who reads it carefully understands. The player who skims it gets atmosphere.

**Enemies:** Vermin only (rats, bats). This wing is abandoned. The emptiness is the message.

#### 4.2 Cache Wing (Northeast)

**Palette:** Modern. BPRD standard-issue. Fluorescent strip lighting (bright white, harsh). Clean tile floor. Caged storage racks.

**Character:** Active contraband storage. Evidence containers stacked floor to ceiling behind chain-link cage walls. Each cage has a BPRD classification plate. Some cages are padlocked. Some are empty (recently cleared). One cage door is ajar, its padlock cut. This is where the original dispatcher found something that broke them.

**Tile vocabulary:** WALL (concrete-panel, industrial), EMPTY (tile floor), LOCKED_DOOR (caged sections, not all accessible), CHEST (evidence containers, lootable for faction-relevant items), SHOP (requisition terminal, faction-gated).

**Environmental storytelling:** A desk near the ajar cage has a half-written incident report. Readable via peek. The report references "Lot 1624-JC" and "biological materials, unclassified." The report stops mid-sentence. A coffee cup sits next to it, cold. The original dispatcher's nameplate is on the desk.

**Enemies:** BPRD security drones (low-tier automated enemies). And one hostile faction team (2-3 operatives) if the player arrives during the Act 2 mission sequence.

#### 4.3 Lab Wing (Southwest)

**Palette:** Transitional. Ancient stone walls with modern fixtures bolted on. Fluorescent tubes zip-tied to iron torch brackets. Stainless steel sinks installed in carved stone basins. The transition is visually jarring by design.

**Character:** The original apothecary laboratory, partially modernized by BPRD for "processing." Glass vessels fused to ancient shelving sit alongside modern centrifuges. Drainage channels cut into the stone floor (400 years old) connect to modern plumbing. The player walks through a working laboratory that has been in continuous use for four centuries under different management.

**Tile vocabulary:** WALL (stone-modern hybrid texture), EMPTY (stone floor with drain grate overlay), PILLAR (lab benches, wide), CHEST (specimen containers), HAZARD tiles (chemical spill zones, environmental damage).

**Environmental storytelling:** A glass case mounted on the far wall contains a single preserved specimen. The peek description: "A jar of clouded fluid. Something dark and folded rests inside. The label has been removed but the adhesive outline remains. It was long. Many characters." The player is looking at an original 1624 specimen. The label was in Latin. BPRD removed it. The jar stays because nobody knows what to do with it.

**Enemies:** Vermin (mutated variants, slightly tougher than cave wing). The chemical spills function as environmental hazards.

#### 4.4 Vault Wing (Southeast)

**Palette:** Modern, reinforced. Blast doors. Armored walls. This is BPRD's high-security section.

**Character:** Sealed evidence vaults. Whatever BPRD considers too sensitive for the cache wing ends up here. Most doors are LOCKED_DOOR and stay locked for Act 2. One vault is accessible via a keycard found in the cache wing (faction mission objective).

**Tile vocabulary:** WALL (reinforced steel), LOCKED_DOOR (blast doors, most permanently locked), DOOR (one accessible vault), EMPTY (polished concrete), CHEST (high-value evidence).

**Key location:** The accessible vault contains the faction-critical item the player was sent to retrieve. What the item is depends on the player's faction:

| Faction | Item Retrieved | What It Actually Is (unknown to player) |
|---|---|---|
| MSS | "Dragon resonance beacon" | Chimera tracking device from the original lab |
| Pinkertons | "Classified personnel dossier" | Ashworth's real identity and 400-year service record |
| Jesuits | "Containment seal blueprint" | Map of every chimera facility worldwide |
| BPRD | "Anomaly source triangulation data" | Coordinates of every living dragon |

The player gets the item. They do not learn what it actually is until Act 3.

**Enemies:** Hostile faction team (primary combat encounter). 3 operatives guarding the vault approach.

### 4.5 The Dispatcher

The original dispatcher is found in the cave wing, in a dead-end alcove near the bonfire. They have been living here for several days. Bedroll on the floor. Empty ration packs. A BPRD sidearm they haven't fired.

**Interaction:** The dispatcher's dialogue depends on the player's faction:

- **BPRD**: Dispatcher is terrified. "They sent you. Of course they sent you." Refuses to return. Gives cryptic warning. No item exchange. The player must choose: report the dispatcher's location (flag for Act 3 consequences) or lie in the debrief.
- **Any other faction**: Dispatcher is relieved. "I was hoping it'd be you and not one of theirs." Provides a keycard or intel item. Asks to be escorted to the surface (escort sequence through the tunnels, optional).

---

## 5. Floor 0.1.2 — Seaway Deep

**Type:** Dungeon (depth 3). Clock runs.
**Size:** 24x20. Hand-authored. Single-purpose climax floor.
**Biome:** `surgical` (cold white stone, iron drainage grates, residual glass, oppressive silence)
**Purpose:** Act 2 climax. Faction confrontation. The surgical theater.

### Layout Philosophy

A single large chamber with antechambers. This is the deepest point of the seaway and the oldest part of the complex. Where the cave wing preserved ancient stonework in amber light, the surgical theater is cold: white stone (marble or limestone, smoothed by use), iron grates in the floor for drainage, and alcoves that held glass apparatus now shattered or removed. The ceiling is high (wallHeight 1.4, unusual for depth 3). The room was built for an audience. Tiers of stone seating ring the central operating platform.

The operating platform is an altar-shaped stone table at the room's center. It is empty. It has been empty for a very long time. But the grooves in the stone, the iron restraint bolts, and the drainage channel beneath it tell a story. The peek interaction says: "A stone table. The surface is smooth from centuries of use. Iron bolts protrude from each corner. A channel runs along the edge into a drain below." That is all. The player's imagination fills in the rest.

### Climax Encounter

The hostile faction's lead operative is here with a 3-person team. They arrived through a separate entrance (a collapsed tunnel the player cannot use). They want the same thing the player retrieved from the vault wing above, or they want to destroy the seaway to bury its contents.

The encounter is a multi-stage card combat sequence:

1. **Operatives (3):** Standard hostile faction combat. Positioned in the antechambers. The player clears them room by room.
2. **Lead operative (1):** Boss-tier encounter on the operating platform. Higher HP, faction-specific card deck, unique ability (one per faction).
3. **Aftermath:** The lead operative drops a faction intel item that opens the route to Floor 3's deep content (the passage from seaway to Frontier Gate underground).

The surgical theater is scarred by the fight. Blood on the altar table. Scorch marks on the white stone. The player leaves a space that was pristine for 400 years and is now marked by the same violence that built it. They may or may not register the symmetry.

---

## 6. Spatial Contracts

| Floor | Constructor | wallHeight | fogDistance | fogColor | ceilColor | floorColor |
|---|---|---|---|---|---|---|
| 0.1 | `interior()` | 2.0 | 14 | `{ r: 20, g: 18, b: 25 }` | `#2a2530` | `#4a4050` |
| 0.1.1 | `nestedDungeon()` | 1.1 | 10 | `{ r: 8, g: 6, b: 12 }` | void | `#3a3540` |
| 0.1.2 | `nestedDungeon()` | 1.4 | 16 | `{ r: 15, g: 15, b: 20 }` | void | `#e0ddd8` |

Note: Floor 0.1.2's high wallHeight (1.4 vs standard 1.0-1.2 for depth 3) and light floor color break the dungeon convention deliberately. The surgical theater should feel wrong for a depth-3 space: too bright, too tall, too clean. The player's spatial instincts, trained by Act 1's dungeon conventions, register the violation before their conscious mind processes why.

---

## 7. Texture and Palette Notes

### Ancient Wing Textures (Cave, Lab)

- **Walls:** Carved limestone with visible tool marks. Warm amber base (#8a7560). Etching overlay on designated tiles (darker grooves, not a separate texture, just pattern variation in the procedural generation).
- **Floor:** Worn flagstone. Irregular spacing. Drainage channels as dark linear features (#2a2020).
- **Light:** Amber torchlight from iron sconces. No fluorescent. Point-light pools with dark gaps between.

### Modern Wing Textures (Cache, Vault)

- **Walls:** Concrete panel (light grey #a0a0a0) or reinforced steel (dark grey #606060). Clean edges. Horizontal seam lines at regular intervals.
- **Floor:** Polished tile (cache) or sealed concrete (vault). Uniform color. Drain grates at room edges.
- **Light:** Fluorescent strip (cool white #e0e8f0). Even distribution. No shadows. The absence of atmosphere is the atmosphere.

### Transition Zone Textures (Lab Wing)

- **Walls:** Stone base with modern fixtures bolted on. The stone texture shows through where fixtures don't cover. Screws and brackets visible. The effect: renovation that doesn't respect the original structure.
- **Floor:** Stone with modern plumbing trenches cut through it. The cuts are straight; the stone is irregular. The contrast between organic and industrial is the texture's identity.

### Surgical Theater (0.1.2)

- **Walls:** White limestone, polished. Smoother than the cave wing. No etchings (these walls were kept clean). Alcove recesses at regular intervals (empty, formerly held apparatus).
- **Floor:** White stone with iron grate inlays. The grates follow drainage paths toward the central platform. The floor reads as a designed surface, not natural cave.
- **Platform:** Central altar-table rendered as a special tile (BONFIRE-class interactable, repurposed). Stone texture with iron bolt details. The peek interaction is the primary lore delivery.

---

## 8. Audio Direction

| Zone | Ambient | Accent |
|---|---|---|
| Vestibule (0.1) | Dripping water, distant hum | Stone footstep echo (long reverb) |
| Cave Wing | Dripping water, wind through stone | Torch crackle, rat scuttle |
| Cache Wing | Fluorescent buzz, ventilation hum | Chain-link rattle (when near cages), boot steps on tile |
| Lab Wing | Mixed: drip + buzz competing | Glass clink (ambient, not interactive), drain gurgle |
| Vault Wing | Dead silence (soundproofed) | Blast door hydraulic hiss (on open), own footsteps only |
| Surgical Theater (0.1.2) | Near-silence. Vast room reverb on player footsteps | Stone echo. Every sound the player makes returns to them amplified. |

The audio shift between wings is the strongest environmental cue. The player knows they've crossed from ancient to modern before they see it, because the sound changes.

---

## 9. Lore Delivery Summary

All subliminal. No exposition dumps. No "you found a document explaining the chimera program."

| Location | Object | What Player Sees | What It Implies |
|---|---|---|---|
| Cave Wing wall | Anatomical etchings | Cross-section diagrams, bear-like quadruped, open ribcage | Biological experimentation on animals |
| Cave Wing bookshelf | Alchemical text | "The great work of grafting," "vessels shaped to carry" | Chimera engineering in period language |
| Cave Wing lintel | Jesuit cross | Partially chipped carving above doorway | Jesuit presence, attempted erasure |
| Cache Wing desk | Incident report | "Lot 1624-JC," "biological materials, unclassified" | BPRD cataloged the Jesuit material, didn't understand it |
| Lab Wing case | Preserved specimen | Jar of clouded fluid, dark folded shape, label removed | An original chimera specimen, still here after 400 years |
| Lab Wing basin | Stone-to-steel sink | Ancient carved basin with modern faucet bolted on | Continuous use across centuries |
| Surgical Theater | Operating table | Stone table, iron restraint bolts, drainage channel | Surgical procedures performed on restrained subjects |
| Surgical Theater | Tiered seating | Stone benches ringing the platform | This was observed. It was taught. It was institutional. |

The player who rushes through sees a creepy dungeon and a government warehouse. The player who explores sees the skeleton of a 400-year-old atrocity still being used by the people who are supposed to protect them.
