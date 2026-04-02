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

    // Build dialogue tree — three choices, each leads to its own end node
    // that sets _actionPending before the dialogue closes.
    var tree = {
      root: 'greet',
      nodes: {
        greet: {
          text: greeting,
          choices: [
            { label: 'Browse Wares',  next: 'do_browse' },
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

      if (flags.__vendor_action_sell) {
        delete flags.__vendor_action_sell;
        _bulkSell();
        // After selling, re-open dialog so they can browse or leave
        var fid = _factionId;
        var flid = _floorId;
        var browse = _onBrowse;
        var leave = _onLeave;
        setTimeout(function () {
          open(fid, flid, { onBrowse: browse, onLeave: leave });
        }, 1000);
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
      if (typeof Shop.sellSalvage === 'function') {
        result = Shop.sellSalvage(sellable[j].id);
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
