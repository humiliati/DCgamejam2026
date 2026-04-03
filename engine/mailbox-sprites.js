/**
 * MailboxSprites — Spawns billboard emoji sprite for MAILBOX tiles.
 *
 * Follows the BonfireSprites pattern: scans the floor grid for MAILBOX
 * tiles, builds a cached sprite array for the raycaster, and provides
 * a simple flag-bob animation when reports are pending.
 *
 * Emoji states:
 *   📪 (U+1F4EA) — closed, flag down (empty / collected)
 *   📬 (U+1F4EC) — open, flag raised (reports pending)
 *   📫 (U+1F4EB) — closed, flag raised (player reading overlay)
 *
 * Layer 1 (depends on: TILES)
 */
var MailboxSprites = (function () {
  'use strict';

  // ── Emoji constants ──────────────────────────────────────────────
  var EMOJI_EMPTY   = '\uD83D\uDCEA'; // 📪
  var EMOJI_PENDING = '\uD83D\uDCEC'; // 📬
  var EMOJI_READING = '\uD83D\uDCEB'; // 📫

  // ── Sprite config ────────────────────────────────────────────────
  var SPRITE_SCALE = 0.50;  // Half-wall height billboard (matches bonfire tent)
  var BOB_AMP      = 2;     // Flag bob pixels amplitude
  var BOB_PERIOD   = 400;   // Flag bob period ms (sin wave)

  // ── State ────────────────────────────────────────────────────────
  var _cachedFloorId = null;
  var _cachedSprites = [];
  var _hasPending    = false;  // Set externally by MailboxPeek
  var _isReading     = false;  // Set externally when overlay is open

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Build sprites for all MAILBOX tiles on the current floor.
   * Cached per floorId — rebuilds only on floor change.
   */
  function buildSprites(floorId, grid, gridW, gridH) {
    if (floorId === _cachedFloorId) {
      // Update emoji state on cached sprites without rebuilding
      _updateEmojiState();
      return _cachedSprites;
    }

    _cachedSprites = [];
    _cachedFloorId = floorId;

    if (!grid || !gridW || !gridH) return _cachedSprites;

    var mailboxTile = (typeof TILES !== 'undefined') ? TILES.MAILBOX : 37;

    for (var gy = 0; gy < gridH; gy++) {
      if (!grid[gy]) continue;
      for (var gx = 0; gx < gridW; gx++) {
        if (grid[gy][gx] === mailboxTile) {
          _cachedSprites.push({
            x: gx + 0.5,
            y: gy + 0.5,
            emoji: _getCurrentEmoji(),
            scale: SPRITE_SCALE,
            mailbox: true,
            _bobOffset: 0
          });
        }
      }
    }

    return _cachedSprites;
  }

  /**
   * Animate mailbox sprites (call each render frame).
   * Pending state: gentle vertical bob on the emoji.
   */
  function animate(now) {
    if (!_hasPending || _cachedSprites.length === 0) return;

    var phase = (now % BOB_PERIOD) / BOB_PERIOD;
    var offset = Math.sin(phase * Math.PI * 2) * BOB_AMP;

    for (var i = 0; i < _cachedSprites.length; i++) {
      _cachedSprites[i]._bobOffset = offset;
    }
  }

  /**
   * Get the animated Y offset for a mailbox sprite.
   * @param {Object} sprite — sprite object with _bobOffset
   * @returns {number} vertical pixel offset
   */
  function getAnimatedY(sprite) {
    return (sprite && sprite._bobOffset) || 0;
  }

  /**
   * Set pending state (called by MailboxPeek when reports arrive/clear).
   */
  function setPending(hasPending) {
    _hasPending = !!hasPending;
    _updateEmojiState();
  }

  /**
   * Set reading state (called by MailboxPeek when overlay opens/closes).
   */
  function setReading(isReading) {
    _isReading = !!isReading;
    _updateEmojiState();
  }

  /**
   * Clear the cache (call on floor transition).
   */
  function clearCache() {
    _cachedFloorId = null;
    _cachedSprites = [];
  }

  // ── Internal ─────────────────────────────────────────────────────

  function _getCurrentEmoji() {
    if (_isReading) return EMOJI_READING;
    if (_hasPending) return EMOJI_PENDING;
    return EMOJI_EMPTY;
  }

  function _updateEmojiState() {
    var emoji = _getCurrentEmoji();
    for (var i = 0; i < _cachedSprites.length; i++) {
      _cachedSprites[i].emoji = emoji;
    }
  }

  return Object.freeze({
    buildSprites: buildSprites,
    animate:      animate,
    clearCache:   clearCache,
    getAnimatedY: getAnimatedY,
    setPending:   setPending,
    setReading:   setReading,
    EMOJI_EMPTY:   EMOJI_EMPTY,
    EMOJI_PENDING: EMOJI_PENDING,
    EMOJI_READING: EMOJI_READING
  });
})();
