# Tooltip Space & NPC Bark System Roadmap (DOC-32)

**Created**: 2026-03-30 | **Updated**: 2026-03-30
**Status**: Phase 1 in progress, jam scope systems shipped
**Parent**: DOC-4 (HUD_ROADMAP), DOC-8 (NPC_SYSTEM_ROADMAP)
**Canon Source**: `docs/EYESONLYS_TOOLTIP_SPACE_CANON.md` (EyesOnly production spec)

---

## Overview

This document tracks the tooltip history system (StatusBar footer), NPC bark
delivery, speech gesture rendering (KaomojiCapsule), and the interactions
between all three. The long-term vision is a unified "tooltip space" that
serves as the player's scrollable log of everything said, earned, and lost,
supporting clickable NPC reply choices inline (Morrowind-style).

The EyesOnly production codebase ships a mature implementation of this vision
(documented in TOOLTIP_SPACE_CANON.md). This roadmap bridges the jam-scope
prototype toward that production target.

---

## EyesOnly Canon — Key Specs Adopted

The following specs from EYESONLYS_TOOLTIP_SPACE_CANON.md are now canonical
for Dungeon Gleaner's tooltip space:

### Layout Contract

| Context | Max Height | Font | Line Height | Timestamp |
|---------|-----------|------|-------------|-----------|
| Desktop (>900px) | 70vh | 11px | 1.2 | `[HH:MM:SS]` |
| Tablet (601-768px) | 60vh | 10px | 1.2 | `[HH:MM:SS]` |
| Mobile (<600px) | 45vh | 9px | 1.15 | `HH:MM` (no brackets) |

Current jam implementation: fixed 320px max-height, 11px font. Post-jam
alignment to Canon responsive breakpoints is Phase 4b.

### Priority System (adopted)

| Priority | Level | Source | Behavior |
|----------|-------|--------|----------|
| NORMAL | 1 | Toast, show(), showAction() | Auto-resets after timeout |
| PERSISTENT | 2 | showPersistent() | Stays until replaced by same/higher |
| DIALOGUE | 3 | pushDialogue() | Blocks lower-priority writes; requires clearDialogue() |

**Key rule**: When dialogue is active (level 3), game tooltips (combat, pickup,
movement) are still logged to history but do NOT overwrite the active dialogue
rendering. This prevents the original problem of tooltips "defaulting away from
relevant information."

### Dialogue Tree Format (adopted from Canon, matches DialogBox)

```javascript
{
  root: 'greeting',
  nodes: {
    greeting: {
      text: 'Hey stranger! What can I get you?',
      choices: [
        { label: 'Buy Drink -5g', next: 'buy_drink', effect: { currency: -5 } },
        { label: 'Ask about rumor', next: 'rumor' },
        { label: 'Leave', next: null }   // null = end conversation
      ]
    }
  }
}
```

### Choice Effects (adopted)

| Effect Key | Type | Description |
|-----------|------|-------------|
| `currency` | number | Add/subtract gold (negative = cost) |
| `setFlag` | string | Set `player.flags[key] = true` |
| `openShop` | boolean | Opens Shop system |
| `giveItem` | object | Adds item to player inventory |
| `heal` | number | Restore HP (capped at maxHp) |
| `callback` | function | Custom `fn(ctx, npc)` callback |

### Visited Node Styling (adopted)

Previously explored choices render with `.dialogue-choice-visited` styling:
dotted underline, muted green. Same pattern as DialogBox canvas rendering,
now also applied to StatusBar HTML entries.

### CSS Classes (to implement in StatusBar)

| Class | Purpose |
|-------|---------|
| `.dialogue-speaker` | Yellow bold NPC name/emoji |
| `.dialogue-text` | Light grey speech text |
| `.dialogue-choices` | Container for choice spans |
| `.dialogue-choice` | Green underlined clickable choice `[text]` |
| `.dialogue-choice-visited` | Dimmer green dotted underline |
| `.dialogue-choice:hover` | Brighter green with subtle background |

---

## What Shipped (Jam Scope)

### S1. Toast -> StatusBar Bridge
Every `Toast.show()` call auto-mirrors to `StatusBar.pushTooltip()`.
Category-colored dots, timestamps, structured HTML entries.

### S2. Card/Deck Transaction Tooltips
All economic card flows now print to tooltip uniformly.

### S3. Depth-Scaled Bark Radius
Exterior: ~3 tile surround + 5-tile forward cone. Interior: native radius.
Dungeon: 20-tile radius (echo chamber).

### S4. KaomojiCapsule Speech Wiring
Rolling ellipsis above barking NPCs. Greeting kaomoji on direct interaction.

### S5. Dialogue Ping-Pong
Two NPCs within 2 tiles alternate speech capsule at 1.8s beats (6 total).

### S6. WorldPopup 3D Feedback
Billboard-projected text at interaction points.

### S7. Tooltip UI Polish
Expand button, 320px max, category dots, scrollbar.

---

## Phase 1: Inline Tooltip Dialogue (IN PROGRESS)

**Priority**: Critical for jam | **Status**: Building now

Implement `StatusBar.pushDialogue()` — renders NPC dialogue with clickable
`[choice]` spans directly in the tooltip footer. Player clicks a choice,
which fires the same tree navigation as DialogBox. The first-person viewport
stays visible throughout the conversation.

### Implementation

1. `StatusBar.pushDialogue(speaker, text, choices, onChoice)` — new API
2. Priority gating: dialogue entries block lower-priority pushTooltip writes
3. Choice `<span>` elements with click delegation
4. Visited choice dimming (dotted underline, muted green)
5. Auto-scroll to active dialogue entry
6. `StatusBar.clearDialogue()` — restores normal tooltip flow
7. DialogBox delegates to StatusBar for non-modal conversations
   (bark-initiated, proximity-triggered); full-screen overlay for modal ones

### Layout (Canon-aligned)

Desktop: `[speaker emoji] Speaker Name: dialogue text [Choice1] [Choice2] [Bye]`
Mobile: Choices break to separate line, 24px min-height tap targets.

---

## Phase 2: NPC Bark Content Audit
Ensure every faction has floor-specific bark pools, conspiracy breadcrumbs at
appropriate depths, landmark references. Dispatcher barks escalate.

## Phase 3: Bark Gesture Variety
Context-appropriate kaomoji: vendor='confident', faction='thinking',
shaken='surprised'. New `gesture` field on BarkLibrary entries.

## Phase 4: Tooltip Polish & Responsive
4a. Category filter tabs (All | NPC | Loot | Combat | System)
4b. Responsive layout matching Canon breakpoints (70vh/60vh/45vh)
4c. Text search, sticky entries, clipboard export

## Phase 5: Spatial Audio Bark Attenuation
Distance-based opacity, stereo panning for left/right barks.

## Phase 6: Full Canon Port
Multi-panel layout, quest tracking in tooltip margin, NPC portrait
thumbnails, entry animations, keyboard navigation.

---

## Integration Map

```
BarkLibrary.fire()
  |--> displayFn (game.js)
  |      |--> DialogBox.show()           [style: 'dialog', modal]
  |      |--> StatusBar.pushDialogue()   [style: 'dialog', inline choices]
  |      '--> StatusBar.pushTooltip()    [style: toast/bubble/npc]
  |
NpcSystem._tickBark()
  |--> BarkLibrary.fire()                [bark text routing]
  |--> KaomojiCapsule.startSpeech()      [rolling ellipsis above sprite]
  '--> setTimeout -> stopSpeech()        [3s auto-dismiss]
  |
NpcSystem._tickDialoguePingPong()
  |--> KaomojiCapsule.startSpeech()      [speaker A]
  '--> KaomojiCapsule.stopSpeech()       [listener B]
       (alternates every 1.8s, 6 beats total)
  |
NpcSystem._interactInteractive()
  |--> DialogBox.startConversation()     [full tree: modal canvas overlay]
  '--> StatusBar.pushDialogue()          [bark pool: inline tooltip]
  |
Toast.show()
  '--> StatusBar.pushTooltip()           [all toasts mirror to history]
```

## Cross-References

- DOC-4 HUD_ROADMAP -- StatusBar tooltip footer layout
- DOC-7 STREET_CHRONICLES_NARRATIVE_OUTLINE -- NPC dialogue content
- DOC-8 NPC_SYSTEM_ROADMAP -- NPC types, Hero type (future bark pools)
- DOC-31 COBWEB_TRAP_STRATEGY_ROADMAP -- cobweb/trap toast feedback
- EYESONLYS_TOOLTIP_SPACE_CANON.md -- production reference (Canon source)
