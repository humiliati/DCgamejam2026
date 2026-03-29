# Dungeon Gleaner — Visual Overhaul

**Created**: 2026-03-29  
**Scope**: Defines the visual pivot from combat-operative/CRT terminal aesthetic to clinical-hazmat/corporate-paperwork/powerwash style. Covers HUD, title screen, card fan, biome palettes, typography, MenuBox, and player archetypes. Maintains the ironic operative naming convention while making the player's actual job — janitor with playing cards — visually legible and fun.  
**Audience**: All team members — engineers, artists, and the designer.

---

## 1. Design Philosophy: The Ironic Gap

The game's narrative framing is a **gambling spy disguised as a janitor**. But the player is actually *a janitor with playing cards*. The visual language should lean into this gap — not hide it.

**Current state (combat operative):** CRT phosphor green, scanline overlays, monospace terminals, Cold War briefing room. This says "you are a spy" and hides the joke.

**Target state (clinical hazmat):** Laminated clipboards, line-ruled paper, plastic tool belts, hazmat-yellow caution tape, corporate onboarding forms, pressure-washer nozzle icons. This says "you are a janitor" and *that's* the joke — because the UI still uses operative classification codes, deployment terminology, and mission briefing language for *mop assignments*.

### 1.1 The Three Visual Pillars

| Pillar | Old Aesthetic | New Aesthetic | Reference |
|--------|--------------|---------------|-----------|
| **Clean** | CRT terminal readouts | Laminated checklists, ruled paper, tick boxes | PowerWash Simulator job boards |
| **Restock** | Supply manifest (military) | Corporate inventory forms, barcode stickers, plastic tubs | Hospital supply closet |
| **Endure** | Tactical combat HUD | Caution-tape borders, hi-vis vest palette, safety goggles overlay | Construction site safety boards |

### 1.2 Tone Calibration

- **NOT silly.** Not cartoon. Not Untitled Goose Game.
- **Clinical.** Clean lines, functional layouts, visible labels. IKEA instructions energy.
- **Warm.** Cream paper, not white screens. Pencil marks, not laser prints.
- **Scrappy.** Tape peeling at the edges. Coffee ring stains on the forms. Lamination bubbles.
- **Ironic.** Every corporate euphemism hides a dungeon survival reality. "Operative Status Report" is just your HP bar on a form.

---

## 2. Color System Overhaul

### 2.1 UI Palette — From Phosphor to Paper

**Old CRT palette:**
```css
--phosphor:       #33ff88;    /* Green terminal glow */
--phosphor-dim:   #1a8844;
--bg-terminal:    #080c08;    /* Near-black green */
--bg-panel:       rgba(8,12,8,0.85);
```

**New clinical palette:**
```css
/* Paper & form foundation */
--paper:          #f5f0e8;    /* Warm cream — ruled notebook paper */
--paper-aged:     #e8e0d0;    /* Slightly yellowed — well-used forms */
--paper-shadow:   #d8d0c0;    /* Paper edge shadow, fold crease */
--ink:            #2a2520;    /* Dark brown-black — ballpoint pen ink */
--ink-light:      #6a6058;    /* Faded ink — old entries, disabled text */
--pencil:         #8a8478;    /* Graphite grey — secondary annotations */
--ruled-line:     #c8c0b8;    /* Faint ruled lines on paper */

/* Corporate accent colours */
--hazmat-yellow:  #f0c830;    /* Caution tape, warning labels, highlights */
--safety-orange:  #e87830;    /* Urgent/danger — HP critical, curfew warning */
--clipboard-blue: #4888c0;    /* Official forms, headers, Guild stamps */
--stamp-red:      #c04040;    /* DENIED / FAILED stamps, death report */
--check-green:    #48a858;    /* ✓ checkmarks, readiness passed */
--laminate-gloss: rgba(255,255,255,0.08);  /* Subtle sheen on card surfaces */

/* Hi-vis accents (suit resource colours — retained, brightened) */
--suit-spade:     #a0a0a0;    /* Grey — neutral/free resource */
--suit-club:      #00b8e8;    /* Bright cyan — energy */
--suit-diamond:   #00d880;    /* Bright green — battery */
--suit-heart:     #e85888;    /* Bright pink — HP */

/* Background (gameplay HUD panel, not viewport) */
--bg-clipboard:   #3a3430;    /* Dark brown — clipboard backing board */
--bg-form:        rgba(245,240,232,0.92);  /* Semi-transparent paper overlay */
```

### 2.2 What Changes Where

| Element | Old | New |
|---------|-----|-----|
| HUD panel background | `#080c08` (black-green) | `--bg-clipboard` with `--bg-form` paper layer |
| HUD text | Phosphor green monospace | `--ink` on `--paper`, ballpoint pen weight |
| Status bars (HP/EN) | Green gradient fills | Coloured fill on ruled-paper background with tick marks |
| Card slots | Dark purple-black bg | `--paper-aged` with laminate sheen |
| Toast notifications | Green/blue/yellow coding | Paper-slip style with coloured left border (filing tabs) |
| Dialog box | CRT terminal box | Memo pad with header stamp and ruled lines |
| Interact prompt | Green terminal bracket | Laminated instruction card with arrow |
| MenuBox faces | Dark glass blur | Clipboard faces — paper on brown backing board |
| Title screen | Dark with blue cube glow | Cream onboarding form with clipboard border |
| Splash screen | Near-black with blue glow | Hazmat-yellow safety label with stencil text |

---

## 3. HUD Redesign — Geriatric Size, Corporate Paperwork

The HUD should look like a **janitor's clipboard** clipped to the screen edge. Everything is oversized, legible, and labeled — like a safety-compliant workplace form that a 60-year-old janitor can read without glasses in a dim corridor.

### 3.1 Guiding Principles

- **Geriatric size.** Minimum 16px base text. Status labels visible at TV-viewing distance (3m from a 55" LG webOS display). No squinting.
- **Labeled everything.** "HP" is not just a bar — it says `OPERATIVE VITALS ─── ████████░░ 24/30` in print. Like a form field.
- **Line-ruled paper texture.** Faint horizontal lines (every 24px) behind all text areas. The HUD *is* a ruled form.
- **Clipboard border.** The left HUD column has a visible brown clipboard edge (2px `--bg-clipboard` strip) with a metal clip icon at the top.
- **Handwritten annotations.** Key stats (floor name, time of day) are rendered in a "handwriting" style — italic monospace with slight baseline variation (±1px random jitter per character on init, cached).
- **Checkbox / tick-box idiom.** Binary states use `☑` / `☐` instead of toggles or lights. "Minimap: ☑", "Card Fan: ☐".

### 3.2 Revised ASCII Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ┌─────────────────┐                                              │
│ │ 📋 FIELD REPORT │  3D VIEWPORT                                 │
│ │ ═══════════════ │  (raycaster canvas)                          │
│ │ Callsign: VIPER │                                              │
│ │ Class: Sentinel │                                              │
│ │ ─ ─ ─ ─ ─ ─ ─  │                                              │
│ │ VITALS          │                                              │
│ │ HP ████████░░░  │                                  ┌────────┐  │
│ │    24/30        │                                  │ MINIMAP│  │
│ │ EN █████░░░░░░  │                                  │  80×80 │  │
│ │    12/24        │                                  │(toggle)│  │
│ │ ─ ─ ─ ─ ─ ─ ─  │                                  └────────┘  │
│ │ BATTERY         │                                              │
│ │ ◈◈◈◈░░ 4/6     │                                              │
│ │ ─ ─ ─ ─ ─ ─ ─  │                                              │
│ │ 💰 47 coins     │         ┌────────────────┐                   │
│ │ ─ ─ ─ ─ ─ ─ ─  │         │  [F] Interact  │                   │
│ │ SUPPLIES        │         └────────────────┘                   │
│ │ ⚔ Mop (3/5)    │  ┌──────────────────────────────────────┐    │
│ │ 🧪 Solvent ×2   │  │       CARD TRAY (5 slots)            │    │
│ │ 🔑 Cellar Key   │  └──────────────────────────────────────┘    │
│ │                 │                                              │
│ └─────────────────┘                                              │
├──────────────────────────────────────────────────────────────────┤
│ [📋 REPORT] [🗺 MAP] [🎒 BAG 7/12]  ─  Floor 1 · Promenade · ▸N │
│                        STATUS BAR                                 │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 Key HUD Changes

| Element | Old | New | Why |
|---------|-----|-----|-----|
| Panel heading | `DEBRIEF` (military) | `📋 FIELD REPORT` (corporate) | Janitor filling out a form |
| HP bar | Green gradient, no label | Coloured fill with tick marks + `24/30` text | Form field with value |
| Battery pips | Tiny dots | Large `◈` diamonds with `4/6` counter | Geriatric legibility |
| Currency | Just a number | `💰 47 coins` with label | Explicit labeling |
| Quick bar heading | None | `SUPPLIES` section heading | Like a form section |
| Status bar labels | `[DEBRIEF] [MAP] [BAG]` | `[📋 REPORT] [🗺 MAP] [🎒 BAG 7/12]` | Emoji + text, larger hit targets |
| Background texture | Solid dark | Ruled-paper lines (faint `--ruled-line` horizontals) | Corporate form feel |
| Panel border | Phosphor green 1px | Brown clipboard edge with subtle paper shadow | Physical clipboard |

### 3.4 Plastic Tool Indicators

Tools in the quick bar should feel like **plastic cleaning equipment** — not weapons:

| Tool | Old Icon | New Icon/Style | Visual Treatment |
|------|----------|----------------|-----------------|
| Mop | ⚔ (sword) | 🧹 or custom mop sprite | Blue plastic handle, grey head, durability shown as "Uses: 3/5" |
| Scrub brush | Generic | 🪥 or custom | Yellow plastic, bristles visible |
| Spray bottle | Generic | 🧴 or custom | Orange trigger sprayer, "SOLVENT" label |
| Pressure washer | Generic | 🔫 (water gun) or custom | Hi-vis yellow body, blue nozzle |
| Keys | 🔑 | 🔑 unchanged | Janitor's key ring — familiar |

Tool durability is shown as a **ruled checkbox strip**: `Uses: ☑☑☑☐☐` (filled = used, empty = remaining). This is more readable at geriatric size than a thin progress bar.

---

## 4. Title Screen Pivot — Corporate Onboarding

The title screen currently uses a dark CRT cube aesthetic. The overhaul reframes character creation as **corporate onboarding** — the Gleaner's Guild is hiring, and you're filling out paperwork.

### 4.1 Phase 1 — Main Menu (The Cover Letter)

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│          DUNGEON GLEANER                             │
│          ═══════════════                             │
│          A Gleaner's Guild Production                │
│                                                      │
│  ┌────────────────────────────────┐                  │
│  │  ☐  NEW OPERATIVE             │  ← selected      │
│  │  ☐  RESUME SHIFT              │                   │
│  │  ☐  SETTINGS                  │                   │
│  └────────────────────────────────┘                  │
│                                                      │
│  ⚠ Gleaner's Guild — Licensed Dungeon Maintenance   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Visual details:**
- Background: `--paper` cream with faint `--ruled-line` horizontal lines (like a memo pad)
- Title: `--ink` bold, large (36px), slight letter-spacing
- Subtitle: `--pencil` grey, italic, 14px — like a hand-scrawled note
- Menu items: Checkbox idiom (`☐` / `☑`), `--ink` text, `--clipboard-blue` highlight on selected
- Footer: `--hazmat-yellow` ⚠ warning icon + `--ink-light` text
- Border: `--bg-clipboard` brown strip on left edge (clipboard backing)
- Metal clip: Small grey clip icon at top-left (decorative)

### 4.2 Phase 2 — Callsign Selection (The Name Badge)

```
┌──────────────────────────────────────────────────────┐
│  📋 OPERATIVE REGISTRATION — FORM 1A                 │
│  ═══════════════════════════════════                  │
│                                                      │
│  SECTION 1: CALLSIGN                                 │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                    │
│                                                      │
│  Assigned callsign:                                  │
│  ┌────────────────────────────────┐                  │
│  │           V I P E R            │  ← large, bold   │
│  └────────────────────────────────┘                  │
│       ◀  1 / 30  ▶                                   │
│                                                      │
│  Adjacent: ... Cobra   [VIPER]   Hawk ...            │
│                                                      │
│  [ENTER] Confirm        [ESC] Back                   │
└──────────────────────────────────────────────────────┘
```

**Visual details:**
- Header: `📋 OPERATIVE REGISTRATION — FORM 1A` in `--clipboard-blue` (corporate form number)
- Section label: `SECTION 1: CALLSIGN` in `--ink`, underlined with ruled line
- Callsign box: `--paper` background with heavy `--ink` border — like a form field
- Callsign text: Bold 28px, slightly tracked, centered — like a typed name badge
- Navigation: `◀ ▶` arrows in `--pencil` grey
- Adjacent preview: `--ink-light` faded, shows neighboring callsigns

### 4.3 Phase 3 — Class Selection (The Assignment Form)

```
┌──────────────────────────────────────────────────────┐
│  📋 OPERATIVE REGISTRATION — FORM 1B                 │
│  ═══════════════════════════════════                  │
│                                                      │
│  SECTION 2: OPERATIVE CLASSIFICATION                 │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 🗡 Blade │  │ 🏹 Ranger│  │ 🕵 Shadow│           │
│  │          │  │          │  │          │           │
│  │ +2 STR   │  │ +2 DEX   │  │ +2 STLH  │           │
│  │ "Brute   │  │ "Quiet   │  │ "Nobody  │           │
│  │  force." │  │  hands." │  │  saw me."│           │
│  └──────────┘  └──────────┘  └──────────┘           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 🛡Sentinl│  │ 🔮 Seer  │  │ 🃏 Wild  │           │
│  │          │  │          │  │          │           │
│  │ +4 HP    │  │ +3 EN    │  │ Random!  │           │
│  │ "Takes a │  │ "Reads   │  │ "Chaos   │           │
│  │  beating"│  │  the room"│  │  theory."│           │
│  └──────────┘  └──────────┘  └──────────┘           │
│                                                      │
│  ☑ SENTINEL selected                                 │
│  [ENTER] Confirm        [ESC] Back                   │
└──────────────────────────────────────────────────────┘
```

**Visual details:**
- Cards on `--paper-aged` background with `--ruled-line` horizontal lines inside
- Selected card: `--clipboard-blue` 2px border, `--check-green` checkmark
- Unselected: `--ruled-line` 1px border
- Class emoji: 18px serif (retained)
- Class name: Bold `--ink`, 13px
- Description: `--pencil` italic, 9px — like a handwritten note on the form
- Stat bonus: `--clipboard-blue` text

### 4.4 Phase 4 — Deployment Screen (The Shift Punch-In)

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  📋 GLEANER'S GUILD — SHIFT ASSIGNMENT               │
│  ═══════════════════════════════════                  │
│                                                      │
│              🛡                                       │
│           SENTINEL                                   │
│                                                      │
│      Operative: VIPER                                │
│      Classification: Sentinel                        │
│      Assignment: Coral Cellars                       │
│      Shift: Day 1 — 06:00                            │
│                                                      │
│      ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                            │
│                                                      │
│      CLOCKING IN ...                                 │
│      ████████░░░░░░░                                 │
│                                                      │
│  ⚠ Report to floor supervisor upon arrival.          │
│                                                      │
│  ───────────────────────────────────                  │
│  STAMP: [APPROVED] ← ink stamp visual                │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Visual details:**
- "CLOCKING IN ..." replaces "DEPLOYING..." — janitor punching a time clock
- Progress bar in `--hazmat-yellow` fill
- `[APPROVED]` stamp in `--stamp-red` with a slight rotation (2–5°) — like a rubber stamp
- Footer warning in `--hazmat-yellow` ⚠ with `--ink-light` text
- Paper background with clipboard border (consistent with all phases)

---

## 5. Card Fan Visual Refresh — Scrappy Modern Playing Cards

The card fan should look like **laminated playing cards carried in a janitor's vest pocket** — not arcane spell scrolls.

### 5.1 Card Surface Redesign

| Element | Old | New |
|---------|-----|-----|
| Background | `rgba(20,18,28,0.92)` (dark purple) | `--paper` cream with `--laminate-gloss` overlay |
| Border | `rgba(160,140,100,0.5)` (warm grey) | Suit-coloured border (2px solid `--suit-*`) |
| Name text | `#f0d070` (golden) | `--ink` bold on paper |
| Card body text | `#d8d0c0` (warm beige) | `--pencil` on ruled lines |
| Stack glow | `rgba(255,200,60,0.35)` (gold) | `--hazmat-yellow` at 0.2 opacity (safety highlight) |
| Card back | Not defined | `--clipboard-blue` with crosshatch pattern (corporate filler) |

### 5.2 Suit Corner Pips

Each card shows its suit pip in the top-left corner and bottom-right (rotated 180°), like real playing cards:

```
┌────────────┐
│ ♠ 7        │
│ ─ ─ ─ ─ ─ │
│ POWER      │
│ SCRUB      │
│ ─ ─ ─ ─ ─ │
│ Deal 7 dmg │
│ (free)     │
│        7 ♠ │
└────────────┘
```

**Suit colours** (retained but brightened for paper contrast):
- ♠ Spade: `--suit-spade` (`#a0a0a0`) — neutral grey
- ♣ Club: `--suit-club` (`#00b8e8`) — bright cyan (energy cost)
- ♦ Diamond: `--suit-diamond` (`#00d880`) — bright green (battery cost)
- ♥ Heart: `--suit-heart` (`#e85888`) — bright pink (HP cost)

### 5.3 Card Art Style

Card illustrations (when sprites are implemented) should use a **stencil / safety-poster** style:
- Bold outlines (3px), flat fill, 1–2 accent colours
- Like the silhouette icons on OSHA safety posters or airport signage
- Cleaning tools are drawn realistically but simplified (mop = long handle + rectangular head)
- Combat cards show the same tool being used aggressively (mop = swung like a baseball bat)

---

## 6. Biome Palette Nudges — Brighter, Funner, Higher Contrast

The exterior biomes (depth 1) need more visual pop without becoming cartoon. The interior and dungeon palettes stay moody — the contrast between cheerful town and grim dungeon is the point.

### 6.1 Philosophy

- **Exterior floors should feel like a sunny boardwalk town.** Think Seaside, Oregon or a Mediterranean promenade. Warm stone, bright sky, colourful awnings.
- **Interiors are a step darker.** Market halls, inns — warm but enclosed.
- **Dungeons stay dark and grim.** The cleaning work is here. The contrast makes the dungeon feel oppressive and the town feel like relief.

### 6.2 Floor "0" — The Approach (Tutorial Courtyard)

| Property | Current | Proposed | Delta |
|----------|---------|----------|-------|
| Floor colour | `#3a4a3a` (muted green-grey) | `#4a5e48` (brighter mossy green) | +20% lightness |
| Ceiling | `#1a2a3a` (dark blue) | `#3a5a7a` (clearer sky blue) | +30% lightness |
| Fog RGB | `30, 40, 55` (cool blue) | `40, 55, 70` (clearer blue) | Brighter, less murky |
| Wall light | `#7a8a7a` (grey-green) | `#8a9e88` (fresher green) | Greener, lighter |
| Wall dark | `#5a6a5a` (dark grey-green) | `#687868` (deeper green) | Slightly warmer |
| Parallax bg | `#1a2a1a` (very dark) | `#2a4028` (visible forest green) | Background readable |

**Goal:** The Approach should feel like arriving in a **public park on a clear morning**. Currently too dark and murky for a tutorial space.

### 6.3 Floor "1" — The Promenade (Sunset Boardwalk)

| Property | Current | Proposed | Delta |
|----------|---------|----------|-------|
| Floor colour | `#d4a878` (golden sandstone) | `#e0b888` (brighter gold) | +10% lightness |
| Ceiling | `#e8a070` (warm peach) | `#f0b080` (brighter peach) | +8% lightness |
| Fog RGB | `45, 28, 22` (warm sunset) | `55, 35, 28` (warmer, clearer) | Less muddy |
| Wall light | `#d4a080` (sandstone) | `#e0b090` (sunlit sandstone) | Warmer, brighter |
| Wall dark | `#a07858` (brown) | `#b08868` (warmer brown) | +10% lightness |
| Door | `#c89050` (gold) | `#d8a060` (brighter gold) | More inviting |

**Goal:** The Promenade is the player's home biome. It should feel **warm, safe, inviting** — like golden hour at a beach boardwalk. Currently good but could push 10% brighter across the board.

### 6.4 Floor "2" — Lantern Gardens (Evening Gardens)

| Property | Current | Proposed | Delta |
|----------|---------|----------|-------|
| Floor colour | `#3a5a50` (mossy teal) | `#488a70` (brighter jade) | +25% lightness |
| Ceiling | `#2a4a48` (dark teal) | `#3a6a68` (visible teal) | +20% lightness |
| Fog RGB | `12, 30, 28` (very dark green) | `20, 45, 40` (visible garden green) | Much brighter |
| Wall light | Inferred `#5a7a70` | `#68988a` (jade green) | Brighter, more colourful |
| Wall dark | Inferred `#3a5a4a` | `#4a6a58` (deeper jade) | Slightly brighter |

**Goal:** Lantern Gardens should feel like a **Japanese garden at twilight** with paper lanterns. Currently too dark to distinguish from a dungeon. The teal-jade palette is beautiful — it just needs more light.

### 6.5 Floor "3" — Frontier Gate (Dusk Frontier)

| Property | Current | Proposed | Delta |
|----------|---------|----------|-------|
| Floor colour | `#3a2a3a` (purple-brown) | `#4a3848` (brighter plum) | +15% lightness |
| Ceiling | `#4a2848` (dark magenta) | `#6a3868` (visible magenta) | +20% lightness |
| Fog RGB | `25, 12, 30` (cool purple) | `35, 20, 40` (richer purple) | Brighter, more saturated |
| Wall light | Inferred `#6a4a6a` | `#8a5a8a` (brighter mauve) | Warmer, more distinct |
| Wall dark | Inferred `#4a2a4a` | `#5a3a5a` (deeper purple) | Slightly brighter |

**Goal:** Frontier Gate should feel like **deep sunset at the edge of civilisation** — dramatic but not invisible. The purple palette is great for danger signaling; it just needs enough light to read the environment.

### 6.6 Contrast Comparison (Exterior Wall Light vs. Floor)

| Floor | Current Δ | Proposed Δ | Notes |
|-------|-----------|-----------|-------|
| "0" The Approach | Wall `#7a8a7a` vs Floor `#3a4a3a` = 40 steps | Wall `#8a9e88` vs Floor `#4a5e48` = 40 steps | Maintained |
| "1" Promenade | Wall `#d4a080` vs Floor `#d4a878` = ~8 steps | Wall `#e0b090` vs Floor `#e0b888` = ~10 steps | Slightly increased |
| "2" Lantern | Wall `~#5a7a70` vs Floor `#3a5a50` = 32 steps | Wall `#68988a` vs Floor `#488a70` = 20 steps | Tighter, more saturated |
| "3" Frontier | Wall `~#6a4a6a` vs Floor `#3a2a3a` = 32 steps | Wall `#8a5a8a` vs Floor `#4a3848` = 40 steps | More dramatic |

**Interior and dungeon palettes are NOT changed** — the darkness is intentional. The contrast between bright exterior and dark interior/dungeon is a key emotional beat: leaving the warm town to enter the grimy workplace.

---

## 7. MenuBox / Pause Screen — The Binder

The rotating box menu (OoT-style 4-face system) should look like a **ring binder** or **clipboard folder** rather than a floating glass cube.

### 7.1 Face Aesthetic

Each face of the MenuBox is a **tabbed section of a binder**:

| Face | Old Look | New Look | Tab Label |
|------|----------|----------|-----------|
| Face 0: Map | Glass blur + minimap | Paper page with map drawn in pen on grid paper | 🗺 MAP |
| Face 1: Skills/Journal | Glass blur + stat list | Ruled form page with checkboxes and handwritten stats | 📊 STATS |
| Face 2: Inventory | Glass blur + item grid | Grid paper with items drawn as labelled plastic tools | 🎒 SUPPLIES |
| Face 3: Settings | Glass blur + toggles | Settings form with checkbox toggles and slider bars | ⚙ CONFIG |

### 7.2 Visual Treatment

- **Background**: `--bg-clipboard` brown backing board fills the face quad
- **Paper layer**: `--paper` cream rectangle inset 8px from edges, with `--ruled-line` horizontal lines
- **Tab**: Coloured tab protruding from the right edge (each face has a distinct colour tab)
  - Map: `--clipboard-blue`
  - Stats: `--check-green`
  - Supplies: `--hazmat-yellow`
  - Config: `--pencil` grey
- **Fold animation**: The fold-up still works as-is — the "walls" are now the clipboard backing (brown cardboard texture)
- **Seam hold**: Between faces, the player sees the brown clipboard edge — like flipping between tabbed sections
- **Blur snapshot**: Replaced with a `--paper-shadow` vignette — the world behind the binder is dimmed, not blurred

### 7.3 Tab-Flip vs. Face-Rotate

Consider making navigation feel like **flipping between tabbed dividers** rather than rotating a 3D cube. The tabs along the right edge are always visible; clicking/pressing Q/E slides the current page left and the next page slides in from the right. The 3D rotation math stays the same under the hood — but the visual reads as "binder sections" rather than "spinning cube".

---

## 8. Typography — From Terminal to Form

### 8.1 Font Stack

**Old:**
```css
--font-terminal: 'Courier New', monospace;
```

**New (primary):**
```css
--font-form:     'Courier New', 'Courier', monospace;  /* Form field entries — keep monospace for numbers */
--font-label:    system-ui, -apple-system, sans-serif;  /* Section headers, labels — clean sans-serif */
--font-handwrite: 'Courier New', monospace;              /* "Handwritten" annotations — italic Courier with jitter */
```

**Rationale:** Monospace stays for the form-field aesthetic (typewritten entries). But section headers and labels switch to the system sans-serif for cleanliness. "Handwritten" annotations (floor name, time of day, informal notes) use italic Courier with slight baseline jitter.

**No new font files.** System fonts and Courier New only — zero build tools, no external CDN (per CLAUDE.md rules).

### 8.2 Size Scale (Geriatric)

| Context | Old Size | New Size | Reason |
|---------|----------|----------|--------|
| HUD labels | 12px | 16px | Readable at TV distance |
| HUD values | 14px | 20px bold | Primary information, large |
| Status bar | 12px | 14px | Less critical, still legible |
| Card name | 13px | 16px | Readable in card fan |
| Card body | 9px | 12px | Minimum readable |
| Dialog text | 14px | 18px | NPC speech, narrative |
| Toast text | 12px | 14px | Brief notifications |
| Title (splash) | 42px | 42px | Already large enough |
| Title (menu) | 32px | 36px | Slight bump |
| Form headers | 14px | 18px bold | Section structure |

### 8.3 Line-Ruled Paper Effect

All paper-background UI elements render faint horizontal rules:

```css
.paper-ruled {
  background-image: repeating-linear-gradient(
    transparent,
    transparent 23px,
    var(--ruled-line) 23px,
    var(--ruled-line) 24px
  );
}
```

This creates a ruled-paper look with a line every 24px. Text baselines should align to these rules when possible (multiples of 24px for line-height).

---

## 9. Player Archetype Visual Identity — Scrappy Modern

The six classes keep their operative codenames but gain **visual descriptions that lean into the janitor identity**:

### 9.1 Class Refresh

| Class | Old Emoji | New Emoji | Old Description | New Description | Visual Archetype |
|-------|-----------|-----------|----------------|-----------------|-----------------|
| Blade | 🗡️ | 🧹 | "High STR. Hits hard, takes hard." | "Brute force cleaning. If it won't come off, scrub harder." | Burly janitor with industrial mop |
| Ranger | 🏹 | 🔫 | "High DEX. Fast and precise." | "Precision spraying. Every drop counts." | Lean technician with spray bottle |
| Shadow | 🕵️ | 🥷 | "High Stealth. Unseen advantage." | "In and out. Nobody knows you were here." | Night-shift worker in dark coveralls |
| Sentinel | 🛡️ | 🦺 | "Balanced. Endures everything." | "Takes a beating. The stains, the smell, the overtime." | Safety-vest supervisor, hard hat |
| Seer | 🔮 | 📋 | "High Energy. More card plays." | "Reads the room. Paperwork is half the job." | Clipboard-wielding planner |
| Wildcard | 🃏 | 🎰 | "Random stats. Chaos run." | "Chaos theory. The mop does what it wants." | Disheveled, duct-tape-on-everything |

### 9.2 Ironic Naming Maintained

The operative classification system stays. The **Form 1B** title screen still says "OPERATIVE CLASSIFICATION". The stat labels still say STR, DEX, STLH. The dissonance between "operative classification" and "basically which kind of mop you prefer" is the joke. The player reads the corporate form language, looks at the emoji, and understands: *I am a very important janitor.*

---

## 10. Splash Screen Pivot — Hazmat Label

The splash screen (pre-title) should look like a **hazmat warning label** on a bright yellow background:

```
┌──────────────────────────────────────────────────────┐
│  ██████████████████████████████████████████████████  │
│                                                      │
│           ⚠  DUNGEON  GLEANER  ⚠                    │
│                                                      │
│      Licensed Dungeon Maintenance Personnel          │
│                                                      │
│  ██████████████████████████████████████████████████  │
│                                                      │
│            Press any key to clock in                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Visual details:**
- Background: `--hazmat-yellow` (`#f0c830`)
- Black hazard stripes (diagonal 45° repeating bars) top and bottom
- Title: `--ink` bold stencil-style (uppercase, wide letter-spacing 8px, bold)
- Subtitle: `--ink-light` smaller, clean sans-serif
- "Press any key" prompt: `--ink-light`, blinks
- Box border: Heavy black 3px stroke
- Easter egg glow: Retained but recoloured — `--hazmat-yellow` at varying intensities instead of blue/purple
- 3D box effect: Replaced with a flat label — or if the 3D cube is retained, the faces show hazmat-yellow with black diagonal stripes

---

## 11. Implementation Priority

### 11.1 Jam Scope (by April 5)

| Priority | Change | Module(s) | Est. Hours | Impact |
|----------|--------|-----------|-----------|--------|
| P0 | CSS palette swap (§2 colour variables) | `index.html` `<style>` | 1h | Transforms entire feel instantly |
| P0 | Title screen text + background recolour (§4) | `title-screen.js` | 1h | First impression |
| P1 | HUD panel background + text colour (§3) | `hud.js` | 1.5h | Gameplay feel |
| P1 | Card fan paper background + suit borders (§5) | `card-fan.js` | 1h | Card play feel |
| P1 | Exterior biome palette nudges (§6) | `floor-manager.js` | 0.5h | Hex value changes only |
| P2 | Splash screen hazmat reskin (§10) | `splash-screen.js`, `index.html` | 1h | Polish |
| P2 | Typography size bump (§8) | `hud.js`, `title-screen.js`, `dialog-box.js` | 1h | Geriatric legibility |
| P2 | Class emoji + description refresh (§9) | `title-screen.js` (AVATARS array) | 0.5h | Thematic alignment |

**Total jam estimate: ~7.5h** — all changes are CSS/colour constant swaps and string replacements. No new modules, no architecture changes.

### 11.2 Post-Jam Polish

| Priority | Change | Notes |
|----------|--------|-------|
| P3 | Ruled-paper CSS background texture (§8.3) | Pure CSS, but needs baseline alignment tuning |
| P3 | Clipboard border + metal clip decoration (§3) | Small canvas/CSS decoration |
| P3 | MenuBox binder-tab visual overhaul (§7) | Requires face renderer CSS changes |
| P3 | Card art stencil-style sprites (§5.3) | Requires artist assets |
| P4 | Handwriting jitter effect (§3.1) | Per-character baseline offset cached at init |
| P4 | Rubber stamp animation on deploy screen (§4.4) | Canvas 2D rotation + opacity fade-in |
| P4 | Hazard-stripe splash screen (§10) | CSS repeating-linear-gradient diagonal bars |

---

## 12. Design Axioms (Visual Overhaul Specific)

1. **The clipboard is the frame.** Every UI surface is paper on a clipboard. Brown backing board is always visible at the edges.
2. **Ink on paper, not light on screen.** Text is dark on light, not light on dark. The HUD reads as a physical document, not a digital display.
3. **Labels are mandatory.** If it has a number, it has a word next to it. "24" means nothing; "HP 24/30" means everything.
4. **Suit colours are the only neon.** The four suit colours (grey, cyan, green, pink) are allowed to be bright and saturated. Everything else is muted paper/ink/pencil tones.
5. **Bigger is funner.** When in doubt, make it 25% larger. Geriatric size is not a limitation — it's a design choice. Big labels, big icons, big hit targets.
6. **Exterior bright, interior dim, dungeon dark.** The colour gradient from town to dungeon is the emotional arc of the game. Town = relief. Dungeon = work.
7. **Corporate sincerity is funnier than corporate parody.** Don't wink at the player. Play it straight. "OPERATIVE CLASSIFICATION" on a form for choosing a mop type is funny *because* it's deadpan.

---

## § Cross-References

| Tag | Reference |
|-----|-----------|
| `→ DOC-4 §3` | Renderer Fidelity — retrofuturism visual philosophy (being partially overridden here) |
| `→ DOC-4 §11` | Biome Palettes — wall colours, fog values (hex adjustments in §6 of this doc) |
| `→ DOC-7 §6` | Juice Inventory — visual feedback specs that need palette-aware updates |
| `→ HUD_ROADMAP §8` | CRT Visual Theme — being superseded by clinical/paper theme (§2–§3 of this doc) |
| `→ HUD_ROADMAP §1–7` | ASCII Layout Canon — structural layout preserved, visual treatment updated |
| `→ GAME_FLOW_ROADMAP §5` | Title Screen — deployment flow structure preserved, visual treatment updated (§4) |
| `→ GAME_FLOW_ROADMAP §6` | MenuBox Rendering — fold/rotate mechanics preserved, face visuals updated (§7) |
| `→ SUIT_SYSTEM_ROADMAP` | Suit resource colours — retained and brightened for paper contrast (§2.1) |
| `⊕ PHASE G` | Visual Overhaul — implement §11.1 jam-scope palette + typography changes |
