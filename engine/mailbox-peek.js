/**
 * MailboxPeek — report inbox & history system.
 *
 * Two interaction surfaces:
 *
 *   1. **Exterior Mailbox (Floor 1)** — MAILBOX tile adjacent to house door.
 *      Dwell-detect → overlay → A/D page → [F] collect → reports move to history.
 *      Emoji state driven by MailboxSprites (📪/📬/📫).
 *
 *   2. **Interior History (Floor 1.6)** — PILLAR tile inside Gleaner's Home.
 *      Dwell-detect → DialogBox → A/D page through all collected reports.
 *      Read-only — no collect action.
 *
 * Layer 3 — depends on: TILES, Player, MovementController, FloorManager,
 *           MailboxSprites, DialogBox, AudioSystem, Toast, CardAuthority, i18n
 *
 * §14 of READINESS_BAR_ROADMAP.md
 */
var MailboxPeek = (function () {
  'use strict';

  // ── Report storage ─────────────────────────────────────────────
  var _pending   = [];     // Reports delivered, not yet collected
  var _collected = [];     // Collected reports (history, newest-first)
  var MAX_PENDING = 10;    // FIFO cap on pending
  var MAX_HISTORY = 20;    // Cap on collected history

  // ── Interaction state ──────────────────────────────────────────
  var _currentIndex = 0;   // Page index within current view
  var _isShowing    = false;
  var _mode         = null; // 'exterior' | 'history' | null
  var _dwellTime    = 0;
  var _hideTimer    = 0;
  var _overlay      = null;
  var _onCollect    = null;

  // ── Timing ─────────────────────────────────────────────────────
  var DWELL_THRESHOLD = 300;  // ms before exterior overlay shows
  var DWELL_HISTORY   = 400;  // ms before interior history shows (bookshelf pace)
  var HIDE_DEBOUNCE   = 200;  // ms before hiding after looking away

  // ── Position lookups (blockout-agnostic) ───────────────────────

  /**
   * Find the exterior MAILBOX tile position on the given floor.
   * Scans the grid for TILES.MAILBOX — blockout-agnostic.
   */
  function _findMailboxTile(floorId) {
    if (typeof FloorManager === 'undefined') return null;
    var fd = FloorManager.getFloorData ? FloorManager.getFloorData(floorId) : null;
    if (!fd || !fd.grid) return null;
    var mailboxType = (typeof TILES !== 'undefined') ? TILES.MAILBOX : 37;
    for (var gy = 0; gy < fd.gridH; gy++) {
      if (!fd.grid[gy]) continue;
      for (var gx = 0; gx < fd.gridW; gx++) {
        if (fd.grid[gy][gx] === mailboxType) {
          return { x: gx, y: gy };
        }
      }
    }
    return null;
  }

  /**
   * Get the interior history interaction position for a floor.
   * Reads from floorData.mailboxHistory if defined, else fallback.
   */
  function _getHistoryPos(floorId) {
    if (typeof FloorManager === 'undefined') return null;
    var fd = FloorManager.getFloorData ? FloorManager.getFloorData(floorId) : null;
    if (fd && fd.mailboxHistory) return fd.mailboxHistory;
    // Legacy fallback for Floor 1.6 — the PILLAR at (19,6)
    if (floorId === '1.6') return { x: 19, y: 6 };
    return null;
  }

  /**
   * Determine which floor IDs have an exterior mailbox.
   * Currently only Floor 1 (Promenade) has one.
   */
  function _isExteriorMailboxFloor(floorId) {
    return floorId === '1';
  }

  /**
   * Determine which floor IDs have an interior history point.
   */
  function _isHistoryFloor(floorId) {
    return floorId === '1.6';
  }

  // ── Facing detection ───────────────────────────────────────────

  function _getFacingPos() {
    if (typeof Player === 'undefined') return null;
    var pos = Player.getGridPos();
    var dir = Player.getDirection();
    var fx = pos.x;
    var fy = pos.y;
    if (dir === 0) fx += 1;       // EAST
    else if (dir === 1) fy += 1;  // SOUTH
    else if (dir === 2) fx -= 1;  // WEST
    else if (dir === 3) fy -= 1;  // NORTH
    return { x: fx, y: fy };
  }

  function _isFacingPos(target) {
    if (!target) return false;
    var fp = _getFacingPos();
    if (!fp) return false;
    return fp.x === target.x && fp.y === target.y;
  }

  // ── Overlay management ─────────────────────────────────────────

  function init() {
    _pending = [];
    _collected = [];
    _currentIndex = 0;
    _isShowing = false;
    _mode = null;
    _dwellTime = 0;
    _hideTimer = 0;
    _overlay = null;

    // Create overlay element
    _overlay = document.createElement('div');
    _overlay.id = 'mailbox-peek-overlay';
    _overlay.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'z-index:20;background:rgba(20,15,10,0.92);border:2px solid rgba(180,160,120,0.4);' +
      'border-radius:8px;padding:24px 32px;color:#d4c8a0;font:16px monospace;' +
      'text-align:left;pointer-events:none;opacity:0;transition:opacity 0.3s ease;' +
      'min-width:340px;max-width:460px;max-height:440px;overflow-y:auto;';
    document.body.appendChild(_overlay);

    // Register input handlers
    if (typeof InputManager !== 'undefined') {
      InputManager.on('interact', function () {
        if (_isShowing && _mode === 'exterior') _collectAll();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (!_isShowing) return;
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        _pagePrev();
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        _pageNext();
      } else if (e.key === 'Escape') {
        _hide();
      }
    });
  }

  function _show(mode) {
    _mode = mode;
    _currentIndex = 0;
    _hideTimer = 0;
    _render();
    _overlay.style.opacity = '1';
    _isShowing = true;

    // Notify MailboxSprites
    if (mode === 'exterior' && typeof MailboxSprites !== 'undefined') {
      MailboxSprites.setReading(true);
    }
  }

  function _hide() {
    _overlay.style.opacity = '0';
    _isShowing = false;
    _dwellTime = 0;
    _currentIndex = 0;

    // Notify MailboxSprites
    if (_mode === 'exterior' && typeof MailboxSprites !== 'undefined') {
      MailboxSprites.setReading(false);
    }
    _mode = null;
  }

  // ── Rendering ──────────────────────────────────────────────────

  function _render() {
    if (_mode === 'exterior') {
      _renderExterior();
    } else if (_mode === 'history') {
      _renderHistory();
    }
  }

  function _renderExterior() {
    if (_pending.length === 0) {
      _renderNoMail();
      return;
    }
    var report = _pending[_currentIndex];
    var html = _buildReportCard(report);

    // Page indicator + controls
    var footer = '<div style="margin-top:12px;font-size:12px;color:#888;">';
    if (_pending.length > 1) {
      footer += (_currentIndex + 1) + ' of ' + _pending.length + '  |  ';
    }
    footer += '[F] Collect All  |  [Esc] Close';
    if (_pending.length > 1) {
      footer += '  |  A/D to page';
    }
    footer += '</div>';

    _overlay.innerHTML = html + footer;
  }

  function _renderHistory() {
    if (_collected.length === 0) {
      _overlay.innerHTML = '<div style="text-align:center;">' +
        '\uD83D\uDCCB Mailbox History<br/><br/>' +
        'No reports filed yet.' +
        '</div>';
      return;
    }
    var report = _collected[_currentIndex];
    var html = '<div style="margin-bottom:8px;color:#888;font-size:13px;">' +
      '\uD83D\uDCCB Mailbox History</div>';
    html += _buildReportCard(report);

    var footer = '<div style="margin-top:12px;font-size:12px;color:#888;">';
    footer += 'Report ' + (_currentIndex + 1) + ' of ' + _collected.length;
    if (_collected.length > 1) {
      footer += '  |  [A] \u2190 [D] \u2192';
    }
    footer += '  |  [Esc] Close</div>';

    _overlay.innerHTML = html + footer;
  }

  function _renderNoMail() {
    var nextInfo = '';
    if (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getNextGroup) {
      var next = DungeonSchedule.getNextGroup();
      if (next) {
        var daysUntil = next.actualDay - (DungeonSchedule.getCurrentDay ? DungeonSchedule.getCurrentDay() : 0);
        nextInfo = '<br/>Next hero day: ' + next.label + ' in ' + daysUntil + ' day' + (daysUntil !== 1 ? 's' : '') + '.';
      }
    } else if (typeof DayCycle !== 'undefined') {
      var nextHeroCycle = 7 - ((DayCycle.getCurrentDay ? DayCycle.getCurrentDay() : 0) % 7);
      nextInfo = '<br/>Next hero cycle: ' + nextHeroCycle + ' days.';
    }

    _overlay.innerHTML = '<div style="text-align:center;">' +
      '\uD83D\uDCED No new mail.' + nextInfo +
      '<br/><br/><span style="font-size:12px;color:#888;">[Esc] Close</span>' +
      '</div>';
  }

  /**
   * Build a formatted report card HTML string.
   * Used by both exterior (pending) and history (collected) views.
   */
  function _buildReportCard(report) {
    if (!report) return '';

    var onSchedule = report.onSchedule !== false;
    var shifted = !onSchedule;
    var borderStyle = shifted
      ? 'border:2px solid rgba(255,80,80,0.6);'
      : 'border:2px solid rgba(180,160,120,0.3);';

    var html = '<div style="' + borderStyle + 'border-radius:6px;padding:12px;margin-bottom:8px;">';

    // Header: shifted warning
    if (shifted) {
      html += '<div style="color:#ff6666;font-weight:bold;margin-bottom:8px;">' +
        '\u26A0 EARLY DISPATCH</div>';
    }

    // Hero + day line
    var heroEmoji = report.heroEmoji || '\u2694\uFE0F';
    var heroType = report.heroType || 'Hero';
    var label = report.label || report.groupId || 'Unknown';
    html += '<div style="font-weight:bold;font-size:16px;margin-bottom:8px;">' +
      heroEmoji + ' ' + label + ' \u2014 Day ' + (report.day || '?') + ' Report</div>';

    // Schedule status
    html += '<div style="margin-bottom:6px;">Hero: The ' + heroType + '</div>';
    if (shifted) {
      html += '<div style="margin-bottom:8px;color:#ff8888;">' +
        'Schedule: \u26A0 EARLY (Day ' + report.day + ' of ' + report.scheduledDay + ')</div>';
    } else {
      html += '<div style="margin-bottom:8px;color:#88ff88;">' +
        'Schedule: \u2713 ON TIME (Day ' + report.day + ' of ' + report.scheduledDay + ')</div>';
    }

    // Core readiness
    var readiness = report.readiness !== undefined
      ? Math.round(report.readiness * 100) : '?';
    var target = report.target !== undefined
      ? Math.round(report.target * 100) : 60;
    var passed = report.passed !== false;

    html += '<div style="margin-bottom:4px;">Core Readiness: ' + readiness +
      '%  (target: ' + target + '%)</div>';

    // Breakdown bars
    if (report.breakdown) {
      var categories = ['crate', 'clean', 'torch', 'trap'];
      var catLabels  = ['Crates', 'Clean', 'Torches', 'Traps'];
      for (var i = 0; i < categories.length; i++) {
        var val = report.breakdown[categories[i]];
        if (val !== undefined) {
          var pct = Math.round(val * 100);
          var barW = Math.min(pct, 100);
          html += '<div style="font-size:13px;margin:2px 0;">' +
            '\u251C\u2500 ' + catLabels[i] + ': ' +
            '<span style="display:inline-block;width:80px;height:10px;' +
            'background:rgba(100,100,100,0.4);border-radius:3px;vertical-align:middle;">' +
            '<span style="display:inline-block;width:' + barW + '%;height:100%;' +
            'background:' + (pct >= target ? 'rgba(100,220,100,0.7)' : 'rgba(220,100,100,0.7)') +
            ';border-radius:3px;"></span></span> ' + pct + '%</div>';
        }
      }
    }

    // Status + payout
    html += '<div style="margin-top:8px;font-weight:bold;color:' +
      (passed ? '#88ff88' : '#ff6666') + ';">' +
      'Status: ' + (passed ? '\u2605 PASS' : '\u2717 FAIL') + '</div>';

    var payout = report.payout !== undefined ? report.payout : 0;
    var payoutMods = '';
    if (shifted) payoutMods += ' \u00D7 0.5 (death penalty)';
    if (report.comboMult && report.comboMult > 1.0) {
      payoutMods += ' \u00D7 ' + report.comboMult.toFixed(1) + ' (combo \u2605)';
    }
    html += '<div style="color:#f0d000;margin-top:4px;">Payout: ' +
      payout + ' coin' + payoutMods + '</div>';

    // Combo status
    if (report.comboStreak !== undefined) {
      var stars = '';
      for (var s = 0; s < Math.min(report.comboStreak, 3); s++) stars += '\u2605';
      if (report.comboStreak > 0) {
        html += '<div style="margin-top:4px;">Combo: ' + stars +
          ' (' + report.comboStreak + ' of 2)</div>';
      } else {
        html += '<div style="margin-top:4px;color:#ff8888;">Combo: BROKEN (streak reset)</div>';
      }
    }

    // Flavor text
    if (report.flavor) {
      html += '<div style="margin-top:8px;font-style:italic;color:#b0a880;font-size:13px;">' +
        '"' + report.flavor + '"</div>';
    }

    // Floor-by-floor results (legacy format compatibility)
    if (report.floors && report.floors.length > 0) {
      html += '<div style="margin-top:8px;border-top:1px solid rgba(180,160,120,0.2);padding-top:8px;">';
      for (var f = 0; f < report.floors.length; f++) {
        var floor = report.floors[f];
        var floorName = floor.name || floor.floorId || 'Unknown';
        var floorReadiness = floor.readiness !== undefined ? floor.readiness : '?';
        var floorPayout = floor.payout !== undefined ? floor.payout : 0;
        var result = floor.result || 'unknown';
        var resultIcon = result === 'cleared' ? '\u2713' : result === 'failed' ? '\u2717' : '\u25CB';
        html += '<div style="font-size:13px;margin-bottom:4px;">' +
          resultIcon + ' ' + floorName + ' \u2014 ' +
          floorReadiness + '% ready, +' + floorPayout + ' coins</div>';
      }
      html += '</div>';
    }

    // Card drop
    if (report.cardDrop) {
      html += '<div style="margin-top:8px;color:#f0d000;">' +
        '\uD83D\uDCB3 Card: ' + report.cardDrop.name + ' (' + report.cardDrop.suit + ')</div>';
    }

    html += '</div>'; // close card container
    return html;
  }

  // ── Collection ─────────────────────────────────────────────────

  function _collectAll() {
    if (_pending.length === 0) {
      _hide();
      return;
    }

    var totalCoins = 0;
    var cardDrops = [];

    for (var i = 0; i < _pending.length; i++) {
      var report = _pending[i];
      totalCoins += report.totalPayout || report.payout || 0;
      if (report.cardDrop) cardDrops.push(report.cardDrop);
    }

    // Stagger toast sequence
    var toastDelay = _pending.length >= 5 ? 300 : 200;
    for (var j = 0; j < _pending.length; j++) {
      var rep = _pending[j];
      (function (delay, label, payout) {
        setTimeout(function () {
          if (typeof Toast !== 'undefined' && Toast.show) {
            Toast.show('\uD83D\uDCDC ' + label + ': +' + payout + ' coins', 'success');
          }
        }, delay);
      })(j * toastDelay, rep.label || ('Day ' + rep.day), rep.totalPayout || rep.payout || 0);
    }

    // Total toast
    var totalDelay = _pending.length * toastDelay + 200;
    setTimeout(function () {
      if (typeof Toast !== 'undefined' && Toast.show) {
        var style = (_pending.length >= 5) ? 'legendary' : 'success';
        Toast.show('\uD83D\uDCB0 Total: +' + totalCoins + ' coins!', style);
      }
    }, totalDelay);

    // Back-pay drama
    if (_pending.length >= 3) {
      setTimeout(function () {
        if (typeof Toast !== 'undefined' && Toast.show) {
          Toast.show('\uD83D\uDCEC That\'s a lot of back pay, Gleaner.', 'info');
        }
      }, totalDelay + 400);
    }

    // Card drop toasts
    for (var k = 0; k < cardDrops.length; k++) {
      (function (delay, card) {
        setTimeout(function () {
          if (typeof Toast !== 'undefined' && Toast.show) {
            Toast.show('\uD83D\uDCB3 Card: ' + card.name + ' (' + card.suit + ')!', 'success');
          }
        }, delay);
      })(totalDelay + 800 + (k * 300), cardDrops[k]);
    }

    // Add currency
    if (typeof CardAuthority !== 'undefined' && CardAuthority.addGold) {
      CardAuthority.addGold(totalCoins);
    }

    // Play sound
    if (typeof AudioSystem !== 'undefined' && AudioSystem.playSFX) {
      AudioSystem.playSFX('pickup-success');
    }

    // Fire callback
    if (_onCollect) _onCollect(totalCoins);

    // Move pending → collected (newest first in _collected)
    for (var m = 0; m < _pending.length; m++) {
      _collected.unshift(_pending[m]);
    }

    // Prune history
    if (_collected.length > MAX_HISTORY) {
      _collected = _collected.slice(0, MAX_HISTORY);
    }

    // Clear pending
    _pending = [];
    _currentIndex = 0;

    // Update sprite state
    if (typeof MailboxSprites !== 'undefined') {
      MailboxSprites.setPending(false);
    }

    _hide();
  }

  // ── Paging ─────────────────────────────────────────────────────

  function _pageNext() {
    if (!_isShowing) return;
    var list = _mode === 'history' ? _collected : _pending;
    if (list.length <= 1) return;
    _currentIndex = (_currentIndex + 1) % list.length;
    _render();
  }

  function _pagePrev() {
    if (!_isShowing) return;
    var list = _mode === 'history' ? _collected : _pending;
    if (list.length <= 1) return;
    _currentIndex = (_currentIndex - 1 + list.length) % list.length;
    _render();
  }

  // ── Per-frame update ───────────────────────────────────────────

  function update(dt) {
    if (typeof FloorManager === 'undefined') return;
    var floorId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : null;
    if (!floorId) return;

    var isExterior = _isExteriorMailboxFloor(floorId);
    var isHistory  = _isHistoryFloor(floorId);

    // Not on a mailbox floor — hide and bail
    if (!isExterior && !isHistory) {
      if (_isShowing) _hide();
      _dwellTime = 0;
      return;
    }

    // Determine target position
    var targetPos = null;
    var targetMode = null;
    var threshold = DWELL_THRESHOLD;

    if (isExterior) {
      targetPos = _findMailboxTile(floorId);
      targetMode = 'exterior';
      threshold = DWELL_THRESHOLD;
    } else if (isHistory) {
      targetPos = _getHistoryPos(floorId);
      targetMode = 'history';
      threshold = DWELL_HISTORY;
    }

    if (!targetPos) {
      if (_isShowing) _hide();
      _dwellTime = 0;
      return;
    }

    // Check facing
    if (_isFacingPos(targetPos)) {
      _hideTimer = 0;
      _dwellTime += dt;

      if (_dwellTime >= threshold && !_isShowing) {
        _show(targetMode);
      }
    } else {
      // Debounce hide
      if (_isShowing) {
        _hideTimer += dt;
        if (_hideTimer >= HIDE_DEBOUNCE) {
          _hide();
        }
      }
      _dwellTime = 0;
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Add a hero-run report to the pending mailbox.
   * Called by DungeonSchedule._resolveGroup().
   */
  function addReport(report) {
    if (!report) return;
    _pending.push(report);

    // FIFO cap
    if (_pending.length > MAX_PENDING) {
      _pending = _pending.slice(_pending.length - MAX_PENDING);
    }

    // Update sprite state
    if (typeof MailboxSprites !== 'undefined') {
      MailboxSprites.setPending(true);
    }

    // Notify toast if player is on the exterior floor
    if (typeof FloorManager !== 'undefined' && FloorManager.getCurrentFloorId) {
      var currentFloor = FloorManager.getCurrentFloorId();
      if (_isExteriorMailboxFloor(currentFloor)) {
        if (typeof Toast !== 'undefined' && Toast.show) {
          Toast.show('\uD83D\uDCEC New report in your mailbox!', 'info');
        }
      }
    }
  }

  return Object.freeze({
    init:       init,
    update:     update,
    addReport:  addReport,

    // Pending queries
    hasPending: function () { return _pending.length > 0; },
    getPendingCount: function () { return _pending.length; },

    // History queries
    getHistory: function () { return _collected.slice(); },
    getHistoryCount: function () { return _collected.length; },

    // Legacy compat aliases
    hasUnread:     function () { return _pending.length > 0; },
    getUnreadCount: function () { return _pending.length; },

    // State
    isShowing: function () { return _isShowing; },
    getMode:   function () { return _mode; },

    // Callbacks
    setOnCollect: function (fn) { _onCollect = fn; },

    // Manual triggers (for InputManager bindings)
    handleInteract: function () { if (_isShowing && _mode === 'exterior') _collectAll(); },
    handlePageNext: _pageNext,
    handlePagePrev: _pagePrev
  });
})();
