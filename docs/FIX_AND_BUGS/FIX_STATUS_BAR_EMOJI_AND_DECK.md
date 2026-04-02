# FIX_STATUS_BAR_EMOJI_AND_DECK.md

## Problem

Three interconnected issues in the status bar:

1. **Emoji encoding broken**: BAG button shows literal text `\uD83C\uDF92` instead of the 🎒 emoji. DECK button shows literal `\uD83C\uDCCF` instead of 🃏. The Unicode escape sequences are not being interpreted by the browser.

2. **DECK shows 0/0 at load**: The deck count is zero until the player makes their first movement input, because CardSystem hasn't populated the collection yet at the time `StatusBar.init()` runs.

3. **DECK format incomplete**: Currently shows `DECK N` (just collection total). Required format: `hand.n / deck+hand.n` — showing hand count over total (hand + backup deck).

## Root Cause

### Emoji Encoding Issue

In `engine/status-bar.js`, `updateBag()` and `updateDeck()` methods set text like:
```javascript
_btnBag.textContent = '\uD83C\uDF92 BAG ' + count + '/' + max;
_btnDeck.textContent = '\uD83C\uDCCF DECK ' + count;
```

The sequences `\uD83C\uDF92` (U+1F392 backpack) and `\uD83C\uDCCF` (U+1F0CF playing card) are surrogate pairs for valid emoji characters. However, they appear as literal text in the DOM, suggesting the source file contains the escape notation as **literal text characters** (8 visible characters including backslashes) rather than as interpreted JavaScript escape sequences. This typically occurs when:
- A text editor or tool writes the escape notation literally instead of encoding the actual Unicode character
- The file is not being parsed as UTF-8
- The escapes were double-escaped at some point

### DECK 0/0 at Load

In `engine/status-bar.js`, `updateDeck()` runs during initialization or first render, before CardSystem has loaded or dealt card data. `CardSystem.getCollection()` returns an empty array at that point, resulting in `0/0` display.

### DECK Format Incomplete

The current implementation only reads total collection count. It does not distinguish between:
- Hand cards (currently playable)
- Deck cards (backup/reserve pool)

The required format is: `hand.n / (hand.n + deck.n)` to show hand size over total playable cards.

## Files to Modify

- `engine/status-bar.js` — `updateBag()`, `updateDeck()`, `init()` methods
- `engine/game.js` — ensure `StatusBar.updateDeck()` and `StatusBar.updateBag()` are called after CardSystem initializes the player's hand and deck

## Implementation Steps

### Step 1: Fix Emoji Encoding in status-bar.js

Replace all Unicode escape sequences with literal emoji characters. This guarantees correct rendering regardless of escape parsing quirks.

**In `updateBag()` method** (around line 192):
```javascript
// OLD:
_btnBag.textContent = '\uD83C\uDF92 BAG ' + count + '/' + max;

// NEW:
_btnBag.textContent = '🎒 BAG ' + count + '/' + max;
```

**In `updateDeck()` method**:
```javascript
// OLD:
_btnDeck.textContent = '\uD83C\uDCCF DECK ' + count;

// NEW:
_btnDeck.textContent = '🃏 DECK ' + handSize + '/' + totalSize;
```

**Scan entire status-bar.js** for any other surrogate pair escapes (patterns like `\uD8xx\uDxxx`) and replace with literal emoji characters.

### Step 2: Fix DECK Format in updateDeck() Method

Rewrite `updateDeck()` to calculate and display hand size over total:

```javascript
function updateDeck() {
  var handSize = 0;
  var deckSize = 0;

  if (typeof CardSystem !== 'undefined') {
    // Try to get hand from CardSystem
    if (CardSystem.getHand && typeof CardSystem.getHand === 'function') {
      var hand = CardSystem.getHand();
      handSize = hand ? hand.length : 0;
    }

    // Try to get deck from CardSystem
    if (CardSystem.getDeck && typeof CardSystem.getDeck === 'function') {
      var deck = CardSystem.getDeck();
      deckSize = deck ? deck.length : 0;
    } else {
      // Fallback: calculate deck as (collection - hand)
      if (CardSystem.getCollection && typeof CardSystem.getCollection === 'function') {
        var collection = CardSystem.getCollection();
        deckSize = collection ? (collection.length - handSize) : 0;
      }
    }
  }

  var totalSize = handSize + deckSize;
  _btnDeck.textContent = '🃏 DECK ' + handSize + '/' + totalSize;
}
```

### Step 3: Fix 0/0 at Load

In `engine/game.js`, after CardSystem deals the starting hand or loads card data:
1. Locate where CardSystem initializes the player's hand and deck
2. After that initialization, call:
   ```javascript
   StatusBar.updateDeck();
   StatusBar.updateBag();
   ```

3. **Also wire callbacks** for any card transactions (draw, discard, shop purchase, synergy activation). Ensure `StatusBar.updateDeck()` is called after:
   - Drawing a card (`CardSystem.drawCard()`)
   - Discarding a card (`CardSystem.discard()`)
   - Purchasing a card from a shop
   - Synergy triggers that modify the hand/deck

If CardSystem exposes a callback API, register `StatusBar.updateDeck` and `StatusBar.updateBag` as observers for card collection changes.

### Step 4: Verify CardSystem API

Confirm the actual function names in `engine/card-system.js`:
- `CardSystem.getHand()` — returns array of hand cards
- `CardSystem.getDeck()` — returns array of backup/deck cards (if it exists)
- `CardSystem.getCollection()` — returns array of all cards (or fallback to hand + deck)

If the API differs, adjust the calls in `updateDeck()` accordingly.

## Acceptance Criteria

- BAG button displays 🎒 emoji (not literal `\uD83C\uDF92` text)
- DECK button displays 🃏 emoji (not literal `\uD83C\uDCCF` text)
- DECK format shows `🃏 DECK 5/15` meaning 5 cards in hand out of 15 total (hand + deck)
- At game load (before first player input), DECK shows correct counts (not `0/0`)
- After drawing a card, DECK count increments immediately (e.g., `6/15`)
- After discarding a card, DECK count decrements immediately (e.g., `4/15`)
- After purchasing a card from a shop, DECK count updates correctly
- All emoji render with proper Unicode interpretation in all browsers (Chrome, Brave, webOS)
- No console errors related to CardSystem API calls in `updateDeck()`
