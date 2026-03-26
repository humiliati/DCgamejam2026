/**
 * HUD — updates on-screen HUD elements (HP, energy, floor, cards).
 */
var HUD = (function () {
  'use strict';

  var _els = {};

  function init() {
    _els.hp = document.getElementById('hud-hp');
    _els.hpFill = document.getElementById('hud-hp-fill');
    _els.energy = document.getElementById('hud-energy');
    _els.energyFill = document.getElementById('hud-energy-fill');
    _els.floor = document.getElementById('hud-floor');
    _els.advantage = document.getElementById('hud-advantage');
    _els.combatOverlay = document.getElementById('combat-overlay');
    _els.combatLog = document.getElementById('combat-log');
    _els.floorTransition = document.getElementById('floor-transition');
    _els.floorTransitionText = document.getElementById('floor-transition-text');
    _els.cardSlots = [];
    for (var i = 0; i < 5; i++) {
      _els.cardSlots.push(document.getElementById('card-' + i));
    }
  }

  function updatePlayer(player) {
    if (_els.hp) {
      _els.hp.textContent = player.hp + '/' + player.maxHp;
      var pct = (player.hp / player.maxHp * 100);
      _els.hpFill.style.width = pct + '%';
      _els.hpFill.style.background = pct < 30 ? '#f44' : pct < 60 ? '#fa4' : '#e44';
    }
    if (_els.energy) {
      _els.energy.textContent = player.energy + '/' + player.maxEnergy;
      _els.energyFill.style.width = (player.energy / player.maxEnergy * 100) + '%';
    }
  }

  function updateFloor(floorNum, label) {
    if (_els.floor) {
      _els.floor.textContent = label ? (floorNum + ' — ' + label) : floorNum;
    }
  }

  function updateCards(hand) {
    for (var i = 0; i < 5; i++) {
      var slot = _els.cardSlots[i];
      if (!slot) continue;
      var card = hand ? hand[i] : null;
      if (card) {
        slot.classList.remove('empty');
        slot.children[0].textContent = card.emoji || '?';
        slot.children[1].textContent = card.name || '';
      } else {
        slot.classList.add('empty');
        slot.children[0].textContent = '-';
        slot.children[1].textContent = '';
      }
    }
  }

  function showCombatLog(text) {
    if (_els.combatOverlay) _els.combatOverlay.classList.add('active');
    if (_els.combatLog) _els.combatLog.textContent = text;
  }

  function hideCombat() {
    if (_els.combatOverlay) _els.combatOverlay.classList.remove('active');
  }

  function showFloorTransition(text) {
    if (_els.floorTransition) {
      _els.floorTransitionText.textContent = text || 'Descending...';
      _els.floorTransition.classList.add('active');
    }
  }

  function hideFloorTransition() {
    if (_els.floorTransition) _els.floorTransition.classList.remove('active');
  }

  function setAdvantage(text) {
    if (_els.advantage) _els.advantage.textContent = text || '';
  }

  return {
    init: init,
    updatePlayer: updatePlayer,
    updateFloor: updateFloor,
    updateCards: updateCards,
    showCombatLog: showCombatLog,
    hideCombat: hideCombat,
    showFloorTransition: showFloorTransition,
    hideFloorTransition: hideFloorTransition,
    setAdvantage: setAdvantage
  };
})();
