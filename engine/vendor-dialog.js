/**
 * VendorDialog — vendor greeting & supply shop flow (UI_ROADMAP Phase 6).
 *
 * When the player interacts with a SHOP tile, this module fires a
 * vendor greeting via StatusBar.pushDialogue, offering choices:
 *
 *   [Browse Wares]  [Buy Supplies]  [Leave]
 *
 * "Browse Wares" opens the card shop via the pause menu.
 * "Buy Supplies" opens an inline supply purchase dialogue.
 *
 * Rep tier-up ceremony: when a purchase pushes the player to a new
 * reputation tier, a special toast fires with a flourish message.
 *
 * Layer 3 — depends on: Shop, Player, StatusBar, Toast, i18n
 *
 * @module VendorDialog
 */
var VendorDialog = (function () {
  'use strict';

  // ── Vendor greeting templates (by faction) ─────────────────────
  var GREETINGS = {
    tide: [
      'The salt remembers who trades fair.',
      'Tide Council keeps honest ledgers.',
      'What floats your way, Gleaner?'
    ],
    foundry: [
      'Gears turn for those who bring parts.',
      'The Foundry buys quality scrap.',
      'You look like you\'ve been busy down there.'
    ],
    admiralty: [
      'The Admiralty notes your service.',
      'Every piece you bring strengthens the fleet.',
      'Let\'s see what you\'ve dragged up.'
    ]
  };
  var DEFAULT_GREETINGS = [
    'Welcome, Gleaner.',
    'What can I do for you?',
    'Show me what you\'ve got.'
  ];

  // ── Rep tier-up messages ───────────────────────────────────────
  var TIER_UP_MSG = [
    null,
    '\u2B50 Rep Up \u2014 now an Acquaintance. Prices improved.',
    '\u2B50\u2B50 Rep Up \u2014 now an Associate. Better stock unlocked.',
    '\u2B50\u2B50\u2B50 Rep Up \u2014 Trusted Ally. Best prices & rare cards.'
  ];

  // ── State ──────────────────────────────────────────────────────
  var _active = false;
  var _factionId = null;
  var _floorId = null;
  var _onBrowse = null;
  var _onLeave = null;

  // ── Open vendor dialog ─────────────────────────────────────────

  /**
   * Open the vendor dialog for the given faction.
   *
   * @param {string} factionId - 'tide' | 'foundry' | 'admiralty'
   * @param {string} floorId   - Current floor ID
   * @param {Object} [opts]    - { onBrowse(factionId), onLeave() }
   */
  function open(factionId, floorId, opts) {
    opts = opts || {};
    _factionId = factionId || 'tide';
    _floorId = floorId || '1';
    _active = true;
    _onBrowse = opts.onBrowse || null;
    _onLeave = opts.onLeave || null;

    // Pick a random greeting
    var pool = GREETINGS[_factionId] || DEFAULT_GREETINGS;
    var greeting = pool[Math.floor(Math.random() * pool.length)];

    // Resolve vendor display data
    var vendorName = _factionId;
    var vendorEmoji = '\uD83D\uDED2';
    if (typeof Shop !== 'undefined') {
      if (Shop.getFactionLabel) vendorName = Shop.getFactionLabel(_factionId);
      if (Shop.getFactionEmoji) vendorEmoji = Shop.getFactionEmoji(_factionId) || vendorEmoji;
    }

    // Build dialogue tree — three choices, each leads to its own end node
    // that sets a flag before the dialogue closes.
    var tree = {
      root: 'greet',
      nodes: {
        greet: {
          text: greeting,
          choices: [
            { label: 'Browse Wares',  next: 'do_browse' },
            { label: 'Buy Supplies',  next: 'do_supply' },
            { label: 'Leave',         next: null }
          ]
        },
        do_browse: {
          text: 'Take your time, Gleaner.',
          choices: [
            { label: 'Continue', next: null,
              effect: { setFlag: '__vendor_action_browse' } }
          ]
        },
        do_supply: {
          text: 'Supplies are always in stock. What do you need?',
          choices: [
            { label: 'Continue', next: null,
              effect: { setFlag: '__vendor_action_supply' } }
          ]
        }
      }
    };

    var npc = {
      id: 'vendor_' + _factionId,
      name: vendorName,
      emoji: vendorEmoji
    };

    if (typeof StatusBar !== 'undefined' && StatusBar.pushDialogue) {
      StatusBar.pushDialogue(npc, tree, function () {
        _onDialogueEnd();
      });
    }
  }

  /**
   * Called when StatusBar dialogue closes.
   * Reads the flag set by the effect system to determine which action.
   */
  function _onDialogueEnd() {
    _active = false;

    // Check which action flag was set
    if (typeof Player !== 'undefined' && Player.state) {
      var flags = Player.state().flags || {};

      if (flags.__vendor_action_browse) {
        delete flags.__vendor_action_browse;
        if (_onBrowse) _onBrowse(_factionId);
        return;
      }

      if (flags.__vendor_action_supply) {
        delete flags.__vendor_action_supply;
        _openSupplyMenu();
        return;
      }
    }

    // Default: Leave
    if (_onLeave) _onLeave();
  }

  // ── Supply shop (DEPTH3 §5) ─────────────────────────────────────

  /**
   * Open an interactive supply purchase dialogue.
   * Each supply item appears as a choice with emoji + name + price.
   * Buying an item loops back to the supply list for multi-purchase.
   * "Done" returns to the main vendor greeting.
   */
  function _openSupplyMenu() {
    if (typeof Shop === 'undefined' || !Shop.getSupplyStock) {
      if (typeof Toast !== 'undefined') Toast.show('No supplies available.', 'dim');
      _returnToVendor();
      return;
    }

    var stock = Shop.getSupplyStock();
    var gold = (typeof CardAuthority !== 'undefined') ? CardAuthority.getGold() : 0;
    var bagFree = (typeof CardAuthority !== 'undefined')
      ? CardAuthority.getMaxBag() - CardAuthority.getBagSize()
      : 0;

    // Build choices — one per supply item + "Done" at the end
    var choices = [];
    for (var i = 0; i < stock.length; i++) {
      var s = stock[i];
      var affordable = gold >= s.shopPrice;
      var label = s.emoji + ' ' + s.name + '  ' + s.shopPrice + 'g';
      if (!affordable) label += ' (need ' + (s.shopPrice - gold) + 'g)';
      choices.push({
        label: label,
        next: null,
        effect: { setFlag: '__supply_buy_' + i },
        disabled: !affordable || bagFree <= 0
      });
    }
    choices.push({ label: '\u2190 Done', next: null });

    var headerText = '\uD83D\uDCB0 ' + gold + 'g  |  \uD83C\uDF92 ' + bagFree + ' slot' + (bagFree !== 1 ? 's' : '') + ' free';

    var tree = {
      root: 'supply_list',
      nodes: {
        supply_list: {
          text: headerText,
          choices: choices
        }
      }
    };

    var npc = {
      id: 'vendor_supply_' + _factionId,
      name: 'Supply Stock',
      emoji: '\uD83D\uDCE6'
    };

    if (typeof StatusBar !== 'undefined' && StatusBar.pushDialogue) {
      StatusBar.pushDialogue(npc, tree, function () {
        _onSupplyDialogueEnd(stock);
      });
    }
  }

  /**
   * After the supply dialogue closes, check which item was purchased.
   * If an item was bought, execute the purchase and re-open the supply menu.
   * If "Done" was chosen (no flag set), return to vendor greeting.
   */
  function _onSupplyDialogueEnd(stock) {
    if (typeof Player === 'undefined') { _returnToVendor(); return; }

    var flags = Player.state().flags || {};
    var bought = false;

    for (var i = 0; i < stock.length; i++) {
      var flagKey = '__supply_buy_' + i;
      if (flags[flagKey]) {
        delete flags[flagKey];

        // Execute purchase through Shop
        var floorNum = parseInt(_floorId, 10) || 1;
        if (!Shop.isOpen()) Shop.open(_factionId, floorNum);

        var repBefore = (typeof Shop.getRepTier === 'function') ? Shop.getRepTier() : 0;
        var result = Shop.buySupply(i);

        if (result.ok) {
          if (typeof Toast !== 'undefined') {
            Toast.show(result.item.emoji + ' ' + i18n.t('toast.bought', 'Bought') + ' ' + result.item.name + '  -' + result.cost + 'g', 'currency');
          }
          if (typeof AudioSystem !== 'undefined') AudioSystem.play('pickup', { volume: 0.4 });
          if (typeof HUD !== 'undefined' && HUD.updatePlayer) HUD.updatePlayer(Player.state());

          // Rep tier-up ceremony
          var repAfter = (typeof Shop.getRepTier === 'function') ? Shop.getRepTier() : 0;
          if (repAfter > repBefore && TIER_UP_MSG[repAfter]) {
            setTimeout(function () {
              if (typeof Toast !== 'undefined') Toast.show(TIER_UP_MSG[repAfter], 'loot');
              if (typeof AudioSystem !== 'undefined') AudioSystem.play('tier_up');
            }, 1200);
          }
        } else if (result.reason === 'no_gold') {
          if (typeof Toast !== 'undefined') Toast.show(i18n.t('toast.no_gold', 'Not enough gold.'), 'warning');
        } else if (result.reason === 'bag_full') {
          if (typeof Toast !== 'undefined') Toast.show(i18n.t('toast.bag_full', 'Bag is full!'), 'warning');
        }

        bought = true;
        break;
      }
    }

    if (bought) {
      // Re-open supply menu for multi-purchase
      setTimeout(function () { _openSupplyMenu(); }, 300);
    } else {
      // "Done" — return to main vendor dialog
      _returnToVendor();
    }
  }

  /**
   * Return to the main vendor greeting after supply shopping.
   */
  function _returnToVendor() {
    var fid = _factionId;
    var flid = _floorId;
    var browse = _onBrowse;
    var leave = _onLeave;
    setTimeout(function () {
      open(fid, flid, { onBrowse: browse, onLeave: leave });
    }, 400);
  }

  // ── Close / query ──────────────────────────────────────────────

  function close() {
    _active = false;
    _factionId = null;
    if (typeof StatusBar !== 'undefined' && StatusBar.clearDialogue) {
      StatusBar.clearDialogue();
    }
  }

  function isActive() { return _active; }

  // ── Public API ─────────────────────────────────────────────────

  return {
    open:     open,
    close:    close,
    isActive: isActive
  };
})();
