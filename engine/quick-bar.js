/**
 * QuickBar — 3 equipped-item slots anchored below the debrief feed.
 *
 * Each slot is clickable (use item) and will support drag-and-drop
 * in Phase 3. Slot layout:
 *   0 — Weapon (passive stat bonus, click = tooltip)
 *   1 — Consumable (click = use on self, heals/buffs)
 *   2 — Key item (click = use on facing tile, targeting mode)
 *
 * DOM-driven (not canvas). Styled via CRT theme CSS in index.html.
 *
 * Layer 2 (after DebriefFeed)
 * Depends on: Player, i18n, Toast (optional)
 */
var QuickBar = (function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var SLOT_COUNT = 3;
  var SLOT_LABELS = ['WEAPON', 'ITEM', 'KEY'];
  var SLOT_EMPTY_ICONS = ['\u2694\uFE0F', '\uD83E\uDDEA', '\uD83D\uDD11']; // ⚔️ 🧪 🔑

  // ── State ───────────────────────────────────────────────────────
  var _slots   = [null, null, null]; // DOM elements
  var _el      = null;               // #quick-bar
  var _visible = false;

  // ── Init ────────────────────────────────────────────────────────

  function init() {
    _el = document.getElementById('quick-bar');

    for (var i = 0; i < SLOT_COUNT; i++) {
      _slots[i] = document.getElementById('qb-' + i);
      if (_slots[i]) {
        (function (slotIdx) {
          _slots[slotIdx].addEventListener('click', function (e) {
            e.stopPropagation();
            _onSlotClick(slotIdx);
          });
        })(i);
      }
    }
  }

  // ── Show / Hide ─────────────────────────────────────────────────

  function show() {
    _visible = true;
    if (_el) _el.style.display = 'flex';
  }

  function hide() {
    _visible = false;
    if (_el) _el.style.display = 'none';
  }

  // ── Render / Refresh ────────────────────────────────────────────

  function refresh() {
    if (!_visible) return;
    var equipped = [null, null, null];
    if (typeof Player !== 'undefined' && Player.state) {
      var st = Player.state();
      equipped = st.equipped || equipped;
    }

    for (var i = 0; i < SLOT_COUNT; i++) {
      var slot = _slots[i];
      if (!slot) continue;
      var item = equipped[i];
      var iconEl = slot.querySelector('.qb-icon');
      var labelEl = slot.querySelector('.qb-label');

      if (item) {
        slot.classList.remove('qb-empty');
        if (iconEl) iconEl.textContent = item.emoji || SLOT_EMPTY_ICONS[i];
        if (labelEl) labelEl.textContent = item.name || SLOT_LABELS[i];
      } else {
        slot.classList.add('qb-empty');
        if (iconEl) iconEl.textContent = SLOT_EMPTY_ICONS[i];
        if (labelEl) labelEl.textContent = 'EMPTY';
      }
    }
  }

  // ── Click handler ───────────────────────────────────────────────

  function _onSlotClick(idx) {
    var equipped = [null, null, null];
    if (typeof Player !== 'undefined' && Player.state) {
      equipped = Player.state().equipped || equipped;
    }
    var item = equipped[idx];
    if (!item) return; // Empty slot — nothing to do

    if (idx === 0) {
      // Weapon — show stats tooltip
      if (typeof Toast !== 'undefined') {
        var desc = item.emoji + ' ' + item.name;
        if (item.attack) desc += ' ATK+' + item.attack;
        Toast.show(desc, 'info');
      }
    } else if (idx === 1) {
      // Consumable — use immediately
      if (typeof Player !== 'undefined' && Player.useItem) {
        var result = Player.useItem(1);
        if (result && typeof Toast !== 'undefined') {
          Toast.show(
            i18n.t('quick.used', 'Used') + ' ' + item.emoji + ' ' + item.name,
            'loot'
          );
        }
        refresh();
        // Update debrief feed + NCH widget (bag/equipped changed)
        if (typeof DebriefFeed !== 'undefined') {
          DebriefFeed.logEvent('Used ' + item.name, 'heal');
          DebriefFeed.refresh();
        }
        if (typeof NchWidget !== 'undefined') NchWidget.refresh();
        if (typeof HUD !== 'undefined') HUD.updatePlayer(Player.state());
      }
    } else if (idx === 2) {
      // Key item — enter targeting mode (future: reticle on viewport)
      if (typeof Toast !== 'undefined') {
        Toast.show(
          i18n.t('quick.target', 'Use') + ' ' + item.emoji + ' ' + item.name + ' — face target & press [F]',
          'info'
        );
      }
    }
  }

  // ── DragDrop Integration ─────────────────────────────────────────

  var ZONE_QB = ['qb-weapon', 'qb-consumable', 'qb-key'];
  var SLOT_TYPE_MAP = { 0: 'weapon', 1: 'consumable', 2: 'key' };
  var _qbZonesRegistered = false;

  /**
   * Register QuickBar slots as DragDrop target zones.
   * Items dragged from the inventory bag can be dropped onto
   * these slots to equip them directly from the game HUD.
   */
  function registerDragZones() {
    if (typeof DragDrop === 'undefined') return;
    if (_qbZonesRegistered) return;

    for (var i = 0; i < SLOT_COUNT; i++) {
      (function (idx) {
        DragDrop.registerZone(ZONE_QB[idx], {
          x: 0, y: 0, w: 0, h: 0,
          accepts: function (payload) {
            if (!payload || payload.type !== 'item') return false;
            var data = payload.data;
            if (!data) return false;
            return data.type === SLOT_TYPE_MAP[idx];
          },
          onDrop: function (payload) {
            if (!payload || !payload.data) return false;
            var item = payload.data;
            if (item.type !== SLOT_TYPE_MAP[idx]) return false;

            // Remove from source by item ID
            if (payload.zone === 'bag' && typeof Player !== 'undefined') {
              Player.removeFromBag(item.id);
            }

            // Swap if occupied (put old item back in bag)
            var existing = Player.getEquipped()[idx];
            if (existing) {
              Player.addToBag(existing);
            }
            // Direct equip (item already removed from source)
            Player.equipDirect(idx, item);

            refresh();
            if (typeof HUD !== 'undefined') HUD.updatePlayer(Player.state());
            if (typeof Toast !== 'undefined') {
              Toast.show(item.emoji + ' equipped to ' + SLOT_LABELS[idx], 'loot');
            }
            return true;
          },
          onHover: function () {
            if (_slots[idx]) _slots[idx].style.boxShadow = '0 0 12px rgba(100,255,100,0.5)';
          },
          onLeave: function () {
            if (_slots[idx]) _slots[idx].style.boxShadow = '';
          }
        });
      })(i);
    }
    _qbZonesRegistered = true;
    _updateQBZoneBounds();
  }

  function unregisterDragZones() {
    if (typeof DragDrop === 'undefined') return;
    for (var i = 0; i < SLOT_COUNT; i++) {
      DragDrop.removeZone(ZONE_QB[i]);
    }
    _qbZonesRegistered = false;
  }

  function _updateQBZoneBounds() {
    if (typeof DragDrop === 'undefined' || !_qbZonesRegistered) return;
    var canvas = document.getElementById('view-canvas');
    var cRect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };

    for (var i = 0; i < SLOT_COUNT; i++) {
      if (!_slots[i]) continue;
      var rect = _slots[i].getBoundingClientRect();
      DragDrop.updateZone(ZONE_QB[i], {
        x: rect.left - cRect.left,
        y: rect.top - cRect.top,
        w: rect.width,
        h: rect.height
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    init:                init,
    show:                show,
    hide:                hide,
    refresh:             refresh,
    registerDragZones:   registerDragZones,
    unregisterDragZones: unregisterDragZones
  };
})();
