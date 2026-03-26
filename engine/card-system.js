/**
 * CardSystem — card loading, hand management, quality rolls.
 * Stub with starter deck. Full extraction from EyesOnly in Pass 5.
 */
var CardSystem = (function () {
  'use strict';

  var _allCards = [];
  var _deck = [];
  var _hand = [];

  var STARTER_CARDS = [
    { id: 'SLASH', name: 'Slash', emoji: '⚔️', effects: [{ type: 'damage', value: 2 }], synergyTags: ['melee'] },
    { id: 'BLOCK', name: 'Block', emoji: '🛡️', effects: [{ type: 'defense', value: 2 }], synergyTags: ['defensive'] },
    { id: 'HEAL',  name: 'Heal',  emoji: '💚', effects: [{ type: 'hp', value: 3 }], synergyTags: ['medical'] },
    { id: 'ARROW', name: 'Arrow', emoji: '🏹', effects: [{ type: 'damage', value: 3 }], synergyTags: ['ranged'] },
    { id: 'BASH',  name: 'Bash',  emoji: '🔨', effects: [{ type: 'damage', value: 4 }], synergyTags: ['melee', 'stun'] }
  ];

  function init() {
    _allCards = STARTER_CARDS.slice();
    resetDeck();
  }

  function resetDeck() {
    _deck = _allCards.slice();
    SeededRNG.shuffle(_deck);
    _hand = [];
  }

  function drawHand(count) {
    count = count || 5;
    _hand = [];
    for (var i = 0; i < count; i++) {
      if (_deck.length === 0) {
        _deck = _allCards.slice();
        SeededRNG.shuffle(_deck);
      }
      _hand.push(_deck.pop());
    }
    return _hand;
  }

  function getHand() { return _hand; }

  function playFromHand(index) {
    if (index < 0 || index >= _hand.length) return null;
    return _hand.splice(index, 1)[0];
  }

  function addCard(card) {
    _allCards.push(card);
  }

  function getAllCards() { return _allCards; }

  return {
    init: init,
    resetDeck: resetDeck,
    drawHand: drawHand,
    getHand: getHand,
    playFromHand: playFromHand,
    addCard: addCard,
    getAllCards: getAllCards
  };
})();
