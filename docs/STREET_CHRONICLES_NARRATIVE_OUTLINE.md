# Street Chronicles: Biome Narrative Outline

## Core Premise

> **Operative Gleaner** (Homeland Security / BPRD) is sent to a small Pacific Northwest town to investigate dragon containment breaches. The "hero" is **The Seeker** — a Chinese MSS operative who has discovered the truth: the pandas are chimeras, a Trojan horse designed to harvest organs for Western vampires (The Pale Court). As outbreaks occur, Gleaner must choose between their handler's orders and the truth.

---

## Faction Overview

### 1. Chinese MSS (Ministry of State Security)

**Goal**: Protect dragons and contain the "dragon event" in the West
**Motivation**: Believe pandas are sacred guardians, unaware they're a trojan horse
**Play**: NPCs friendly to player initially, becomes conflicted as truth emerges

| Element | Detail |
|---------|--------|
| Operative | **The Seeker** (The Hero) — seeking answers about outbreaks |
| Objective | Contain dragon events, protect what they believe is sacred |
| Blind spot | Panda chimera = Trojan horse for vampire organ harvest |
| Arc | Discovers truth → ally or enemy depending on player choice |

---

### 2. Pinkertons (Private Detective Agency)

**Goal**: Take down the Chinese Empire through a 6,000-year-old blood feud
**Motivation**: Ancient grudge against Eastern dynasties
**Play**: Antagonists who are "accidentally" helping expose the truth

| Element | Detail |
|---------|--------|
| Method | Baiting Chinese around with "dragon snuff" — waking up dragon secrets |
| Effect | Each dragon event reveals more panda → trojan horse connection |
| Arc | Unwitting allies; their sabotage inadvertently aids The Seeker's discovery |
| Conflict | Hates vampires too but won't work with Chinese to stop them |

---

### 3. The Jesuits (Hidden Order)

**Goal**: Protect the chimera secret indefinitely
**Motivation**: Created the panda chimeras 400 years ago; must maintain cover
**Play**: Behind-the-scenes antagonists, supply quest hints

| Element | Detail |
|---------|--------|
| Origin | Gifted first panda to Chinese imperial court in 1624 |
| Secret | Pandas are engineered chimeras for growing human-compatible organs |
| Goal | Prevent anyone from connecting pandas to vampire longevity |
| Arc | Deploy obstacles; will eliminate players who get too close to truth |

---

### 4. Homeland Security / BPRD (Bureau for Paranormal Research and Defense)

**Goal**: Protect the chimera secret while deploying Operative Gleaner
**Motivation**: Mainstream world must never know about paranormal elements
**Play**: Player's employer; eventual moral choice point

| Element | Detail |
|---------|--------|
| Operative | **Operative Gleaner** (The Player) — handler-selected hunter |
| Assignment | Investigate small-town dragon containment breach |
| Agenda | Contain truth, not necessarily eliminate The Seeker |
| Arc | Discovers handler's true agenda → defect or comply? |

---

## The Panda Chimera (Central MacGuffin)

| Property | Description |
|----------|-------------|
| Origin | Jesuit scientists, 1624 — gifted to Chinese Emperor |
| Purpose | Grow human-compatible organs in chimera hosts |
| Harvest | Organs extend vampire life indefinitely |
| Scale | Every panda in the world is a living organ factory |
| Reveal | Dragon events = distress signals when harvest cycles fail |

---

## Story Arcs

### Arc 1: Assignment
- **Location**: Small town (biome: Forest → Industrial)
- **Objective**: Find the "dragon" causing containment breaches
- **Twist**: The "dragon" is a distress call from a harvested panda

### Arc 2: Discovery  
- **Location**: Town investigation (biome: Mall → Office)
- **Clue**: Pinkertons leave "dragon snuff" evidence pointing to pandas
- **Twist**: Every lead connects to a panda sanctuary

### Arc 3: Confrontation
- **Location**: Panda sanctuary (biome: Sanctuary / Hidden)
- **Factions converge**: Jesuit guardians, Pinkerton watchers, MSS operative
- **Choice**: Stop The Seeker? Help The Seeker? Destroy the evidence?

### Arc 4: Resolution
- **Outcomes**: 
  - **Comply**: Gleaner returns hero's body, receives promotion, truth buried
  - **Defect**: Gleaner aids The Seeker, becomes marked by all factions
  - **Expose**: Both player and Seeker go public — chaos, factions war openly

---

## Biome-Narrative Integration

| Biome | Narrative Beat | Faction Presence |
|-------|---------------|------------------|
| Forest | Arrival, quiet town, first "dragon" sighting | Jesuits (ambient hints) |
| Cave | First panda encounter, creature doesn't attack | MSS (trail markers) |
| Office | Corporate front for dragon containment | BPRD (field office) |
| Mall | Pinkerton tail, surveillance gone wrong | Pinkertons (active) |
| Industrial | Panda processing facility | Jesuits (defensive) |
| Sanctuary | Final confrontation, all factions converge | All four |

---

## Key NPCs

| Name | Faction | Role |
|------|---------|------|
| The Seeker | MSS | Hero, player hunts them, discovers truth first |
| Handler Vala | BPRD | Gleaner's contact, hides true agenda |
| Father Ashworth | Jesuits | Sanctuary guardian, manipulates player |
| Agent Crow | Pinkertons | Antagonist, indirectly helps player |
| Dr. Yu | MSS (deceased) | The Seeker's mentor, left trail of clues |

---

## Tone

- **Setting**: Retro-futuristic fantasy terminal (1980s paranormal conspiracy aesthetic)
- **References**: Hellboy, Men in Black, X-Files, Bloodborne
- **Player Role**: Bureaucratic operative caught in supernatural politics
- **Moral Weight**: No "good" side — everyone has blood on their hands

---

## Implementation Notes

1. **Faction flags** stored in `GAMESTATE.factions` (discovery progression)
2. **Seeker location** tracked via `GAMESTATE.seekerPosition` (can meet or hunt)
3. **Outbreak levels** scale with player progress (each biome = escalation)
4. **Panda revelations** unlock via item collection + dialogue trees
