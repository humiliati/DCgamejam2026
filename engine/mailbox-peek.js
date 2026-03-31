var MailboxPeek = (function() {
  'use strict';

  // Module state
  var _reports = [];
  var _currentReportIndex = 0;
  var _isShowing = false;
  var _dwellTime = 0;
  var _dwellThreshold = 300;
  var _overlay = null;
  var _onCollect = null;

  // Constants
  var MAILBOX_FLOOR_ID = '1.6';
  var MAILBOX_POS = { x: 2, y: 5 };
  var MAILBOX_TILE_TYPE = 'PILLAR'; // The tile type we check for
  var MAX_REPORTS = 10;
  var DWELL_THRESHOLD = 300; // ms before overlay shows

  /**
   * Initialize the module
   */
  function init() {
    _reports = [];
    _currentReportIndex = 0;
    _isShowing = false;
    _dwellTime = 0;
    _overlay = null;

    // Create overlay element
    _overlay = document.createElement('div');
    _overlay.id = 'mailbox-peek-overlay';
    _overlay.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'z-index:20;background:rgba(20,15,10,0.92);border:2px solid rgba(180,160,120,0.4);' +
      'border-radius:8px;padding:24px 32px;color:#d4c8a0;font:16px monospace;' +
      'text-align:left;pointer-events:none;opacity:0;transition:opacity 0.3s ease;' +
      'min-width:340px;max-width:420px;max-height:400px;overflow-y:auto;';
    document.body.appendChild(_overlay);

    // Register input handlers for interact (F) and page navigation (A/D)
    if (typeof InputManager !== 'undefined') {
      InputManager.on('interact', function () {
        if (_isShowing) _handleInteract();
      });
    }

    // Listen for A/D keys (page navigation between reports)
    document.addEventListener('keydown', function (e) {
      if (!_isShowing) return;
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        _handlePagePrev();
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        _handlePageNext();
      } else if (e.key === 'Escape') {
        _hide();
      }
    });
  }

  /**
   * Add a hero-run report to the mailbox
   */
  function addReport(report) {
    if (!report) return;

    _reports.push(report);

    // FIFO: keep max 10 reports
    if (_reports.length > MAX_REPORTS) {
      _reports = _reports.slice(_reports.length - MAX_REPORTS);
    }
  }

  /**
   * Check if player is facing the mailbox
   */
  function _isFacingMailbox() {
    var playerFloor = FloorManager.getCurrentFloorId();
    if (playerFloor !== MAILBOX_FLOOR_ID) return false;

    var playerPos = Player.getGridPos();
    var playerDir = Player.getDirection();

    // Player position + direction offset should point to mailbox
    var checkPos = { x: playerPos.x, y: playerPos.y };

    // Apply direction offset
    if (playerDir === 0) { // EAST
      checkPos.x += 1;
    } else if (playerDir === 1) { // SOUTH
      checkPos.y += 1;
    } else if (playerDir === 2) { // WEST
      checkPos.x -= 1;
    } else if (playerDir === 3) { // NORTH
      checkPos.y -= 1;
    }

    return checkPos.x === MAILBOX_POS.x && checkPos.y === MAILBOX_POS.y;
  }

  /**
   * Show the overlay with current report
   */
  function _showOverlay() {
    if (_reports.length === 0) {
      _renderNoMail();
    } else {
      _renderReport(_reports[_currentReportIndex]);
    }

    _overlay.style.opacity = '1';
    _isShowing = true;
  }

  /**
   * Hide the overlay
   */
  function _hideOverlay() {
    _overlay.style.opacity = '0';
    _isShowing = false;
    _dwellTime = 0;
    _currentReportIndex = 0;
  }

  /**
   * Render the "no mail" state
   */
  function _renderNoMail() {
    var nextHeroCycle = DayCycle ? (7 - (DayCycle.getCurrentDay() % 7)) : 7;
    var html = '<div style="text-align:center;">' +
      '📭 No new mail.<br/>' +
      'Next hero cycle: ' + nextHeroCycle + ' days.' +
      '</div>';
    _overlay.innerHTML = html;
  }

  /**
   * Render a hero-run report
   */
  function _renderReport(report) {
    if (!report) {
      _renderNoMail();
      return;
    }

    var pageIndicator = '';
    if (_reports.length > 1) {
      pageIndicator = '<div style="margin-bottom:12px;color:#888;font-size:12px;">(' +
        (_currentReportIndex + 1) + ' of ' + _reports.length + ')</div>';
    }

    var heroLine = '<div style="margin-bottom:16px;font-weight:bold;font-size:18px;">' +
      (report.heroEmoji || '⚔️') + ' ' + (report.heroType || 'Hero') + ' (Day ' + report.day + ')</div>';

    var floorsHtml = '';
    if (report.floors && report.floors.length > 0) {
      floorsHtml = '<div style="margin-bottom:16px;border-top:1px solid rgba(180,160,120,0.2);padding-top:12px;">';
      for (var i = 0; i < report.floors.length; i++) {
        var floor = report.floors[i];
        var floorName = floor.name || floor.floorId || 'Unknown';
        var readiness = floor.readiness !== undefined ? floor.readiness : '?';
        var payout = floor.payout !== undefined ? floor.payout : 0;
        var result = floor.result || 'unknown';

        var resultIcon = '';
        if (result === 'cleared') resultIcon = '✓';
        else if (result === 'skipped') resultIcon = '○';
        else if (result === 'failed') resultIcon = '✗';

        floorsHtml += '<div style="margin-bottom:8px;font-size:14px;">' +
          resultIcon + ' ' + floorName + ' — ' +
          readiness + '% ready, +' + payout + ' coins</div>';
      }
      floorsHtml += '</div>';
    }

    var cardHtml = '';
    if (report.cardDrop) {
      cardHtml = '<div style="margin:12px 0;color:#f0d000;">💳 Card: ' +
        report.cardDrop.name + ' (' + report.cardDrop.suit + ')</div>';
    }

    var totalPayout = '<div style="margin-top:16px;border-top:1px solid rgba(180,160,120,0.2);' +
      'padding-top:12px;font-weight:bold;color:#f0d000;font-size:16px;">' +
      'Total Payout: +' + (report.totalPayout || 0) + ' coins</div>';

    var controls = '<div style="margin-top:12px;font-size:12px;color:#888;">' +
      'A/D to page | [F] Collect</div>';

    var html = pageIndicator + heroLine + floorsHtml + cardHtml + totalPayout + controls;
    _overlay.innerHTML = html;
  }

  /**
   * Collect all payouts and display toast sequence
   */
  function _collectPayouts() {
    if (_reports.length === 0) {
      _hideOverlay();
      return;
    }

    var totalCoins = 0;
    var cardDrops = [];

    // Calculate total and gather card drops
    for (var i = 0; i < _reports.length; i++) {
      var report = _reports[i];
      totalCoins += report.totalPayout || 0;
      if (report.cardDrop) {
        cardDrops.push(report.cardDrop);
      }
    }

    // Stagger Toast sequence based on number of reports
    var toastDelay = 200;
    if (_reports.length >= 5) {
      toastDelay = 300; // Increased drama
    }

    // Show per-report toasts
    for (var j = 0; j < _reports.length; j++) {
      var rep = _reports[j];
      (function(delay, day, payout) {
        setTimeout(function() {
          if (Toast && Toast.show) {
            Toast.show('📜 Day ' + day + ': +' + payout + ' coins', 'success');
          }
        }, delay);
      })(j * toastDelay, rep.day, rep.totalPayout || 0);
    }

    // Show total payout toast
    var totalDelay = _reports.length * toastDelay + 200;
    setTimeout(function() {
      if (Toast && Toast.show) {
        var style = (_reports.length >= 5) ? 'legendary' : 'success';
        Toast.show('💰 Total: +' + totalCoins + ' coins!', style);
      }
    }, totalDelay);

    // Show extra drama message if lots of back pay
    if (_reports.length >= 3) {
      setTimeout(function() {
        if (Toast && Toast.show) {
          Toast.show('📬 That\'s a lot of back pay, Gleaner.', 'info');
        }
      }, totalDelay + 400);
    }

    // Show card drops
    for (var k = 0; k < cardDrops.length; k++) {
      (function(delay, card) {
        setTimeout(function() {
          if (Toast && Toast.show) {
            Toast.show('💳 Card: ' + card.name + ' (' + card.suit + ')!', 'success');
          }
        }, delay);
      })(totalDelay + 800 + (k * 300), cardDrops[k]);
    }

    // Add currency
    if (Player && Player.addCurrency) {
      Player.addCurrency(totalCoins);
    }

    // Play sound
    if (AudioSystem && AudioSystem.playSFX) {
      AudioSystem.playSFX('pickup-success');
    }

    // Fire callback
    if (_onCollect) {
      _onCollect(totalCoins);
    }

    // Clear reports and hide
    _reports = [];
    _currentReportIndex = 0;
    _hideOverlay();
  }

  /**
   * Handle interact key (F)
   */
  function _handleInteract() {
    if (!_isShowing) return;

    _collectPayouts();
  }

  /**
   * Handle page forward (D key)
   */
  function _handlePageNext() {
    if (!_isShowing || _reports.length <= 1) return;

    _currentReportIndex = (_currentReportIndex + 1) % _reports.length;
    _renderReport(_reports[_currentReportIndex]);
  }

  /**
   * Handle page back (A key)
   */
  function _handlePagePrev() {
    if (!_isShowing || _reports.length <= 1) return;

    _currentReportIndex = (_currentReportIndex - 1 + _reports.length) % _reports.length;
    _renderReport(_reports[_currentReportIndex]);
  }

  /**
   * Per-frame update
   */
  function update(dt) {
    var playerFloor = FloorManager ? FloorManager.getCurrentFloorId() : null;

    // Only active on Floor 1.6
    if (playerFloor !== MAILBOX_FLOOR_ID) {
      if (_isShowing) {
        _hideOverlay();
      }
      _dwellTime = 0;
      return;
    }

    // Check if facing mailbox
    if (_isFacingMailbox()) {
      _dwellTime += dt;

      // Show overlay after dwell threshold
      if (_dwellTime >= DWELL_THRESHOLD && !_isShowing) {
        _showOverlay();
      }
    } else {
      if (_isShowing) {
        _hideOverlay();
      }
      _dwellTime = 0;
    }
  }

  /**
   * Public API
   */
  return Object.freeze({
    init: init,
    update: update,
    addReport: addReport,
    hasUnread: function() {
      return _reports.length > 0;
    },
    getUnreadCount: function() {
      return _reports.length;
    },
    setOnCollect: function(fn) {
      _onCollect = fn;
    },
    isShowing: function() {
      return _isShowing;
    },
    handleInteract: _handleInteract,
    handlePageNext: _handlePageNext,
    handlePagePrev: _handlePagePrev
  });
})();
