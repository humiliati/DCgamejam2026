/**
 * QuickFill — auto-fill crate slots from bag inventory.
 *
 * Layer 2 — depends on: CrateSystem, CardAuthority, AudioSystem, Toast,
 *           SessionStats, i18n (all typeof-guarded)
 */

var QuickFill = (function() {
  'use strict';

  function fill(fx, fy, floorId) {
    var crate = CrateSystem.getContainer(fx, fy, floorId);
    if (!crate || crate.sealed) return false;

    var filled = 0;

    for (var s = 0; s < crate.slots.length; s++) {
      var slot = crate.slots[s];
      if (slot.filled) continue;

      var bag = CardAuthority.getBag();
      var bestIdx = -1;
      for (var b = 0; b < bag.length; b++) {
        if (CrateSystem.doesItemMatch(bag[b], slot.frameTag)) {
          bestIdx = b;
          break;
        }
      }

      if (bestIdx === -1) continue;

      var item = CardAuthority.removeFromBag(bestIdx);
      if (!item) continue;

      CrateSystem.fillSlot(fx, fy, floorId, s, item);
      filled++;
    }

    if (filled === 0) return false;

    AudioSystem.play('pickup', { volume: 0.4 });
    Toast.show('\uD83D\uDCE6 ' + i18n.t('toast.quick_fill', 'Auto-stocked') + ' ' + filled + ' ' + i18n.t('toast.slots', 'slot' + (filled > 1 ? 's' : '')), 'info');

    if (CrateSystem.canSeal(fx, fy, floorId)) {
      var result = CrateSystem.seal(fx, fy, floorId);
      if (result) {
        AudioSystem.play('ui-confirm', { volume: 0.6 });
        Toast.show('\u2705 ' + i18n.t('toast.crate_sealed', 'Crate sealed!') + ' +' + result.totalCoins + 'g', 'loot');
        SessionStats.inc('cratesSealed');
      }
      return true;
    }

    return false;
  }

  return Object.freeze({
    fill: fill
  });
})();
