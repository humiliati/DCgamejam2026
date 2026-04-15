/**
 * EnemyDeck — per-enemy attack-card decks (Gone-Rogue pattern).
 *
 * Replaces the old combat-engine stub that had every enemy committing a
 * generic "{name} Strike" card regardless of species. Each enemy type
 * (keyed by ENM-### id) now owns a curated deck of EATK-### cards pulled
 * from data/enemy-cards.json. On each beat, CombatEngine asks this module
 * "what does this enemy commit next?" and EnemyDeck returns a card object
 * in the exact shape CardStack.enemyCommitCard() expects.
 *
 * Architecture:
 *   data/enemy-cards.json  →  flat registry of attack cards (EATK-### ids)
 *   data/enemy-decks.json  →  ENM-### → { cards: [EATK-id, ...], greed?, _note }
 *
 * The data separation matches Gone Rogue: cards are reusable primitives,
 * decks are enemy-specific compositions. A deck can repeat a card id to
 * weight its draw frequency (Gone Rogue treats duplicates as multiple
 * copies in the shuffle — we do the same).
 *
 * Per-combat draw state:
 *   Each call to beginCombatFor(enemy) builds a shuffled pile from the
 *   enemy's deck. drawNextFor(enemy) pops one card; when the pile empties
 *   it reshuffles. This gives a fair distribution without letting the
 *   same card fire 5 times in a row.
 *
 * Fallback:
 *   If an enemy has no registered deck, or enemy-cards.json failed to
 *   load, drawNextFor falls back to a generated Strike matching the
 *   enemy's suit — identical to the old CombatEngine stub, so combat
 *   never hard-crashes on missing data.
 *
 * Layer 1 — depends on: (none). Consumed by CombatEngine.
 */
var EnemyDeck = (function () {
  'use strict';

  var _cardsById = {};   // EATK-### → card def
  var _decks     = {};   // ENM-### → { cards: [...], greed?, _note }
  var _loaded    = false;

  // Per-enemy draw piles. Keyed by enemy entity (via _pileKey) so multiple
  // live enemies don't share shuffle state. Cleared by clearPileFor()
  // when combat ends.
  var _piles = {};

  // ── Loading ──────────────────────────────────────────────────────────

  function _load() {
    if (_loaded) return;
    _loaded = true;

    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/enemy-cards.json', false);
      xhr.send();
      if (xhr.status === 200) {
        var parsed = JSON.parse(xhr.responseText);
        var cards = Array.isArray(parsed) ? parsed
                  : (Array.isArray(parsed.cards) ? parsed.cards : []);
        for (var i = 0; i < cards.length; i++) {
          if (cards[i] && cards[i].id) _cardsById[cards[i].id] = cards[i];
        }
        console.log('[EnemyDeck] Loaded ' + cards.length + ' enemy cards');
      } else {
        console.warn('[EnemyDeck] enemy-cards.json HTTP ' + xhr.status);
      }
    } catch (e) {
      console.error('[EnemyDeck] enemy-cards.json load failed:', e);
    }

    try {
      var xhr2 = new XMLHttpRequest();
      xhr2.open('GET', 'data/enemy-decks.json', false);
      xhr2.send();
      if (xhr2.status === 200) {
        var parsed2 = JSON.parse(xhr2.responseText);
        var count = 0;
        for (var k in parsed2) {
          if (!Object.prototype.hasOwnProperty.call(parsed2, k)) continue;
          if (k === '_schema') continue;
          if (!parsed2[k] || !Array.isArray(parsed2[k].cards)) continue;
          _decks[k] = parsed2[k];
          count++;
        }
        console.log('[EnemyDeck] Loaded ' + count + ' enemy decks');
      } else {
        console.warn('[EnemyDeck] enemy-decks.json HTTP ' + xhr2.status);
      }
    } catch (e2) {
      console.error('[EnemyDeck] enemy-decks.json load failed:', e2);
    }
  }

  function init() { _load(); }

  // ── Accessors ────────────────────────────────────────────────────────

  function getCard(id)     { _load(); return _cardsById[id] || null; }
  function getDeck(enmId)  { _load(); return _decks[enmId] || null; }
  function hasDeck(enmId)  { _load(); return !!_decks[enmId]; }

  /**
   * Optional greed override for a specific enemy — lets boss decks
   * specify a larger stack size without mutating CardStack defaults.
   * @returns {number|null} greed or null if not overridden
   */
  function getGreedFor(enemy) {
    _load();
    if (!enemy || !enemy.id) return null;
    var deck = _decks[enemy.id];
    return (deck && typeof deck.greed === 'number') ? deck.greed : null;
  }

  // ── Draw pile management ─────────────────────────────────────────────

  function _pileKey(enemy) {
    // Prefer a live instance handle if game.js stamps one; otherwise
    // fall back to type id. Multiple concurrent instances of the same
    // enemy type currently share a pile — acceptable for 1v1 combat.
    return (enemy && (enemy._uid || enemy.id)) || '_default';
  }

  function _shuffle(arr) {
    // Fisher-Yates in place — uses SeededRNG for reproducibility.
    var rnd = (typeof SeededRNG !== 'undefined') ? SeededRNG.random : Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function _buildPile(enemy) {
    var deck = _decks[enemy && enemy.id];
    if (!deck || !Array.isArray(deck.cards) || deck.cards.length === 0) {
      return null;
    }
    // Resolve ids → card defs, dropping unknowns but warning once.
    var pile = [];
    for (var i = 0; i < deck.cards.length; i++) {
      var card = _cardsById[deck.cards[i]];
      if (card) pile.push(card);
      else console.warn('[EnemyDeck] Unknown card id in ' + enemy.id + ': ' + deck.cards[i]);
    }
    if (pile.length === 0) return null;
    return _shuffle(pile);
  }

  /**
   * Initialize (or reset) the draw pile for an enemy at combat start.
   * Safe to call multiple times — each call reshuffles.
   */
  function beginCombatFor(enemy) {
    _load();
    if (!enemy) return;
    var pile = _buildPile(enemy);
    if (pile) _piles[_pileKey(enemy)] = pile;
  }

  /**
   * Pop the next card for an enemy's next beat. Reshuffles the deck
   * when the pile runs out. Returns null only if no deck exists AND
   * the caller hasn't supplied a fallback.
   */
  function drawNextFor(enemy) {
    _load();
    if (!enemy) return null;

    var key = _pileKey(enemy);
    var pile = _piles[key];

    // Lazy-build if combat started without beginCombatFor (e.g. legacy
    // combat entry paths) — also handles empty piles by reshuffling.
    if (!pile || pile.length === 0) {
      pile = _buildPile(enemy);
      if (!pile) return _fallbackStrike(enemy);
      _piles[key] = pile;
    }

    return pile.shift();
  }

  /**
   * Generate a baseline Strike card for enemies without a registered
   * deck. Mirrors the old CombatEngine stub behavior, but suit-aware
   * so intent telegraph coloring stays correct.
   */
  function _fallbackStrike(enemy) {
    var str = (enemy && enemy.str) || 1;
    var suit = (enemy && enemy.suit) || 'spade';
    return {
      id: 'EATK-FALLBACK-' + ((enemy && enemy.id) || 'generic'),
      name: (enemy && enemy.name ? enemy.name : 'Enemy') + ' Strike',
      emoji: (enemy && enemy.emoji) || '\ud83d\udc80',
      suit: suit,
      intentType: 'BASIC',
      effects: [{ type: 'damage', value: Math.max(1, str), target: 'player' }],
      synergyTags: ['melee', suit]
    };
  }

  /** Clear the draw pile for an enemy — called by CombatBridge on combat end. */
  function clearPileFor(enemy) {
    if (!enemy) return;
    delete _piles[_pileKey(enemy)];
  }

  /** Nuke all piles (debug / scene reset). */
  function reset() {
    _piles = {};
  }

  // ── Public API ───────────────────────────────────────────────────────

  return {
    init:            init,
    getCard:         getCard,
    getDeck:         getDeck,
    hasDeck:         hasDeck,
    getGreedFor:     getGreedFor,
    beginCombatFor:  beginCombatFor,
    drawNextFor:     drawNextFor,
    clearPileFor:    clearPileFor,
    reset:           reset
  };
})();
