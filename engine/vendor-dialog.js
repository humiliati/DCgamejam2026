/**
 * VendorDialog — vendor greeting & bulk-sell flow (UI_ROADMAP Phase 6).
 *
 * When the player interacts with a SHOP tile, this module fires a
 * vendor greeting via StatusBar.pushDialogue, offering choices:
 *
 *   [Browse Wares]  [Sell All Junk]  [Leave]
 *
 * "Sell All Junk" batch-sells all salvage from the player's bag,
 * showing a receipt toast with haul commentary.
 *
 * Rep tier-up ceremony: when a sale pushes the player to a new
 * reputation tier, a special toast fires with a flourish message.
 *
 * Layer 3 — depends on: Shop, Player, StatusBar, Salvage, Toast
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

  // ── Haul commentary ────────────────────────────────────────────
  var HAUL_COMMENTS = [
    { min: 0,   text: 'Slim pickings today.' },
    { min: 10,  text: 'Decent haul.' },
    { min: 30,  text: 'Not bad at all, Gleaner.' },
    { min: 60,  text: 'Now that\'s a proper scavenge.' },
    { min: 100, text: 'Impressive haul \u2014 the faction takes notice.' },
    { min: 200, text: 'Outstanding. You\'re making a name for yourself.' }
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
  var _actionPending = null;  // 'browse' | 'sell' | null
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
    _actionPending = null;
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

    // Build dialogue tree — four choices, each leads to its own end node
    // that sets _actionPending before the dialogue closes.
    var tree = {
      root: 'greet',
      nodes: {
        greet: {
          text: greeting,
          choices: [
            { label: 'Browse Wares',  next: 'do_browse' },
            { label: 'Buy Supplies',  next: 'do_supply' },
            { label: 'Sell All Junk', next: 'do_sell' },
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
        },
        do_sell: {
          text: 'Let\u2019s see what you\u2019ve brought.',
          choices: [
            { label: 'Continue', next: null,
              effect: { setFlag: '__vendor_action_sell' } }
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

      if (flags.__vendor_action_sell) {
        delete flags.__vendor_action_sell;
        _bulkSell();
        // After selling, re-open dialog so they can browse or leave
        setTimeout(function () { _returnToVendor(); }, 800);
        return;
      }
    }

    // Default: Leave
    if (_onLeave) _onLeave();
  }

  // ── Bulk sell ──────────────────────────────────────────────────

  function _bulkSell() {
    if (typeof Shop === 'undefined' || typeof CardAuthority === 'undefined') return;

    var bag = CardAuthority.getBag();

    // Filter for sellable salvage (not quest items)
    var sellable = [];
    for (var i = 0; i < bag.length; i++) {
      var item = bag[i];
      if (item && item.type === 'salvage' && !item.quest) {
        sellable.push(item);
      }
    }

    if (sellable.length === 0) {
      if (typeof Toast !== 'undefined') {
        Toast.show('Nothing to sell.', 'dim');
      }
      return;
    }

    // Open shop session for faction
    var floorNum = parseInt(_floorId, 10) || 1;
    Shop.open(_factionId, floorNum);

    var totalGold = 0;
    var count = 0;
    var repBefore = (typeof Shop.getRepTier === 'function') ? Shop.getRepTier() : 0;

    for (var j = 0; j < sellable.length; j++) {
      var result = null;
      if (typeof Shop.sellPart === 'function') {
        result = Shop.sellPart(sellable[j].id);
      }

      if (result && result.ok) {
        totalGold += result.amount || 0;
        count++;
      }
    }

    var repAfter = (typeof Shop.getRepTier === 'function') ? Shop.getRepTier() : 0;

    // Receipt toast with haul commentary
    var comment = _getHaulComment(totalGold);
    if (typeof Toast !== 'undefined') {
      Toast.show(
        '\uD83D\uDCB0 Sold ' + count + ' items for ' + totalGold + 'g \u2014 ' + comment,
        'currency'
      );
    }

    // Update bag count on status bar
    if (typeof StatusBar !== 'undefined' && StatusBar.updateBag) {
      StatusBar.updateBag();
    }

    // Rep tier-up ceremony
    if (repAfter > repBefore && TIER_UP_MSG[repAfter]) {
      setTimeout(function () {
        if (typeof Toast !== 'undefined') {
          Toast.show(TIER_UP_MSG[repAfter], 'loot');
        }
        if (typeof AudioSystem !== 'undefined' && AudioSystem.play) {
          AudioSystem.play('tier_up');
        }
      }, 1200);
    }

    // Update HUD
    if (typeof HUD !== 'undefined' && HUD.updatePlayer) {
      HUD.updatePlayer(Player.state());
    }
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

        var result = Shop.buySupply(i);
        if (result.ok) {
          if (typeof Toast !== 'undefined') {
            Toast.show(result.item.emoji + ' ' + i18n.t('toast.bought', 'Bought') + ' ' + result.item.name + '  -' + result.cost + 'g', 'currency');
          }
          if (typeof AudioSystem !== 'undefined') AudioSystem.play('pickup', { volume: 0.4 });
          if (typeof HUD !== 'undefined' && HUD.updatePlayer) HUD.updatePlayer(Player.state());
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
   * Return to the main vendor greeting after supply shopping or selling.
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

  function _getHaulComment(gold) {
    var comment = HAUL_COMMENTS[0].text;
    for (var i = 0; i < HAUL_COMMENTS.length; i++) {
      if (gold >= HAUL_COMMENTS[i].min) {
        comment = HAUL_COMMENTS[i].text;
      }
    }
    return comment;
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
