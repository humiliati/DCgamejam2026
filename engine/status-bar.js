/**
 * StatusBar — bottom strip with clickable buttons and status readout.
 *
 * Replaces the top-positioned HUD for floor/heading info. The old #hud
 * div remains for HP/EN bars during the transition; StatusBar handles
 * the bottom strip with [DEBRIEF] [MAP] [BAG] buttons + floor/heading.
 *
 * Layer 2 (after DebriefFeed — wires button clicks to other modules)
 * Depends on: Player, FloorManager, Minimap, DebriefFeed, ScreenManager, i18n
 */
var StatusBar = (function () {
  'use strict';

  // ── Compass headings ────────────────────────────────────────────
  var HEADINGS = ['\u25B8 N', '\u25B8 E', '\u25B8 S', '\u25B8 W'];

  // ── DOM refs ────────────────────────────────────────────────────
  var _el        = null;  // #status-bar
  var _btnDebrief = null;
  var _btnMap     = null;
  var _btnBag     = null;
  var _btnDeck    = null;
  var _floorEl    = null;
  var _biomeEl    = null;
  var _headingEl  = null;
  var _goldEl     = null;  // #sb-gold — currency display
  var _btnPause   = null;  // #sb-pause — hamburger menu button
  var _visible    = false;

  // Tooltip footer (rolodex layout)
  var _tooltipArea    = null;  // #sb-tooltip-area
  var _tooltipLatest  = null;  // #sb-tooltip-latest (current row, bottom)
  var _tooltipHistory = null;  // #sb-tooltip-history (expanded scrollable)
  var _tooltipPreview = null;  // #sb-tooltip-preview (1-2 prev rows, fade)
  var _tooltipExpanded = false;
  var _history = [];           // { text, time, category } entries
  var MAX_HISTORY = 50;

  // ── Priority system (Canon: NORMAL < PERSISTENT < DIALOGUE) ──
  var PRIORITY = { NORMAL: 1, PERSISTENT: 2, DIALOGUE: 3 };
  var _activePriority = PRIORITY.NORMAL;

  // ── Inline dialogue state ────────────────────────────────────
  var _dialogueActive = false;
  var _dialogueNpcId  = null;     // speaker id for cleanup
  var _dialogueEl     = null;     // live DOM element in latest area
  var _dialogueTree   = null;     // tree reference for navigation
  var _dialogueNpc    = null;     // npc reference
  var _dialogueNodeId = null;     // current node id
  var _dialogueOnEnd  = null;     // callback when conversation ends
  var _dialogueNpcPos = null;     // { x, y } for walk-away detection
  var _dialoguePinned = false;    // pinned dialogues ignore walk-away (forced encounters)

  // ── Burst bark auto-expand tracking ──────────────────────────
  var _burstCount   = 0;          // Rapid entries in succession
  var _burstResetId = null;       // setTimeout id to reset burst count
  var BURST_THRESHOLD = 3;        // Auto-expand after N entries within window
  var BURST_WINDOW_MS = 2500;     // Time window for burst detection
  var AUTO_COLLAPSE_MS = 5000;    // Auto-collapse after dialogue ends
  var _autoCollapseId = null;     // setTimeout id for auto-collapse

  // ── Combat state ────────────────────────────────────────────────
  var _inCombat   = false;
  var _combatRound = 0;
  var _advantage   = '';
  var _combatEnergy = 0;
  var _onFleeCallback = null;  // Set by Game at init for FLEE button

  // ── Hose state (shared anchor with pause/flee) ─────────────────
  var _hoseActive    = false;
  var _onReelCallback = null;  // Set by Game at init for REEL button

  // ── Init ────────────────────────────────────────────────────────

  function init() {
    _el         = document.getElementById('status-bar');
    _btnDebrief = document.getElementById('sb-debrief');
    _btnMap     = document.getElementById('sb-map');
    _btnBag     = document.getElementById('sb-bag');
    _btnDeck    = document.getElementById('sb-deck');
    _floorEl    = document.getElementById('sb-floor');
    _biomeEl    = document.getElementById('sb-biome');
    _headingEl  = document.getElementById('sb-heading');
    _goldEl     = document.getElementById('sb-gold');
    _btnPause   = document.getElementById('sb-pause');

    // Tooltip footer (rolodex layout)
    _tooltipArea    = document.getElementById('sb-tooltip-area');
    _tooltipLatest  = document.getElementById('sb-tooltip-latest');
    _tooltipHistory = document.getElementById('sb-tooltip-history');
    _tooltipPreview = document.getElementById('sb-tooltip-preview');

    if (_tooltipArea) {
      // Use mousedown instead of click for the scrollbar guard: a click
      // on the native scrollbar track/thumb does NOT fire a DOM click in
      // Chromium, but mousedown DOES target the scrolling element. By
      // checking target === _tooltipHistory at mousedown we can detect
      // scrollbar interaction and skip the collapse toggle that would
      // otherwise fire on the subsequent click bubble.
      var _suppressNextToggle = false;
      _tooltipArea.addEventListener('mousedown', function (e) {
        // A mousedown whose target is the scrollable element itself
        // (not a child) means the user pressed on the scrollbar — mark
        // the next click so the toggle handler ignores it.
        if (_tooltipHistory && e.target === _tooltipHistory) {
          _suppressNextToggle = true;
        }
      });
      _tooltipArea.addEventListener('click', function (e) {
        // Don't toggle expand when clicking dialogue choices
        if (e.target.closest('.sb-dialogue-choice')) return;
        if (e.target.closest('.sb-dialogue-entry')) return;
        // NEVER collapse mid-dialogue. A player clicking fast through a
        // tree will sometimes miss the choice pill and hit the panel's
        // padding / gap area; without this guard the container click
        // handler toggles _setExpanded(false) and the reply options
        // disappear behind the collapsed footer, stranding the player
        // in an inactive-looking bar with no expand hint visible.
        if (_dialogueActive) return;
        // Clicks landing inside the scrollable history panel must NOT
        // collapse the tooltip: the player may be dragging the scroll
        // thumb, clicking the track to page through older entries, or
        // selecting text. Only clicks outside the history area (the
        // latest row, preview row, or background) toggle expand state.
        if (_tooltipExpanded && _tooltipHistory &&
            _tooltipHistory.contains(e.target)) return;
        if (_suppressNextToggle) { _suppressNextToggle = false; return; }
        e.stopPropagation();
        _setExpanded(!_tooltipExpanded);
      });
    }

    // Click-away collapse: clicking anywhere outside the tooltip area
    // auto-minimizes it (unless in a dialogue tree).
    document.addEventListener('click', function (e) {
      if (!_tooltipExpanded || _dialogueActive) return;
      if (_tooltipArea && _tooltipArea.contains(e.target)) return;
      _setExpanded(false);
    });

    // Keyboard shortcut: 1-5 selects dialogue choices during active dialogue.
    // Keys map directly to choice index (1 → idx 0, 2 → idx 1, etc.).
    document.addEventListener('keydown', function (e) {
      if (!_dialogueActive) return;
      var key = e.key;
      if (key >= '1' && key <= '5') {
        var idx = parseInt(key, 10) - 1;
        // Verify a choice exists at this index on the current node
        if (_dialogueTree && _dialogueNodeId) {
          var node = _dialogueTree.nodes[_dialogueNodeId];
          if (node && node.choices && node.choices[idx]) {
            e.preventDefault();
            e.stopPropagation();
            _onDialogueChoice(idx);
          }
        }
      }
    });

    // Button click handlers
    if (_btnDebrief) {
      _btnDebrief.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof DebriefFeed !== 'undefined') DebriefFeed.cycleMode();
      });
    }

    if (_btnMap) {
      _btnMap.addEventListener('click', function (e) {
        e.stopPropagation();
        if (_inCombat) {
          // During combat, this button is [FLEE]
          if (_onFleeCallback) _onFleeCallback();
        } else {
          // Normal mode — toggle minimap
          if (typeof Minimap !== 'undefined') {
            Minimap.toggle();
            _updateMapBtn();
          }
        }
      });
    }

    if (_btnBag) {
      _btnBag.addEventListener('click', function (e) {
        e.stopPropagation();
        // Toggle pause menu at Face 2 with bag focus
        if (typeof ScreenManager !== 'undefined') {
          if (ScreenManager.isPaused()) {
            // Already paused — if on Face 2, close. Otherwise navigate to bag.
            var onFace2 = (typeof MenuBox !== 'undefined' && MenuBox.getCurrentFace() === 2);
            if (onFace2) {
              // Toggle off: close menu, resume gameplay
              if (typeof MenuBox !== 'undefined') MenuBox.close();
              ScreenManager.resumeGameplay();
            } else {
              // Navigate to bag face
              if (typeof MenuBox !== 'undefined') MenuBox.snapToFace(2);
              if (typeof MenuFaces !== 'undefined' && MenuFaces.setInvFocus) MenuFaces.setInvFocus('bag');
            }
          } else if (ScreenManager.isPlaying()) {
            if (typeof Game !== 'undefined' && Game.requestPause) {
              Game.requestPause('pause', 2, 'bag');
            } else {
              ScreenManager.toPause();
            }
          }
        }
      });
    }

    // Deck button → opens pause menu on inventory face (face 2) with deck focus
    if (_btnDeck) {
      _btnDeck.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof ScreenManager !== 'undefined') {
          if (ScreenManager.isPaused()) {
            var onFace2d = (typeof MenuBox !== 'undefined' && MenuBox.getCurrentFace() === 2);
            if (onFace2d) {
              // Toggle off: close menu, resume gameplay
              if (typeof MenuBox !== 'undefined') MenuBox.close();
              ScreenManager.resumeGameplay();
            } else {
              if (typeof MenuBox !== 'undefined') MenuBox.snapToFace(2);
              if (typeof MenuFaces !== 'undefined' && MenuFaces.setInvFocus) MenuFaces.setInvFocus('deck');
            }
          } else if (ScreenManager.isPlaying()) {
            if (typeof Game !== 'undefined' && Game.requestPause) {
              Game.requestPause('pause', 2, 'deck');
            } else {
              ScreenManager.toPause();
            }
          }
        }
      });
    }

    // Gold/Currency button → opens pause menu on Face 1 (Journal / player stats)
    if (_goldEl) {
      _goldEl.style.cursor = 'pointer';
      _goldEl.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof ScreenManager !== 'undefined') {
          if (ScreenManager.isPaused()) {
            // If already on Face 1, close. Otherwise navigate.
            var onFace1 = (typeof MenuBox !== 'undefined' && MenuBox.getCurrentFace() === 1);
            if (onFace1) {
              if (typeof MenuBox !== 'undefined') MenuBox.close();
              ScreenManager.resumeGameplay();
            } else {
              if (typeof MenuBox !== 'undefined') MenuBox.snapToFace(1);
            }
          } else if (ScreenManager.isPlaying()) {
            if (typeof Game !== 'undefined' && Game.requestPause) {
              Game.requestPause('pause', 1);
            } else {
              ScreenManager.toPause();
            }
          }
        }
      });
    }

    // Shared action button: FLEE (combat) / REEL (hose) / ☰ PAUSE (normal).
    // Priority: combat > hose > normal.
    if (_btnPause) {
      _btnPause.addEventListener('click', function (e) {
        e.stopPropagation();
        if (_inCombat) {
          if (_onFleeCallback) _onFleeCallback();
          return;
        }
        if (_hoseActive) {
          if (_onReelCallback) _onReelCallback();
          return;
        }
        if (typeof ScreenManager !== 'undefined') {
          if (ScreenManager.isPaused()) {
            if (typeof MenuBox !== 'undefined') MenuBox.close();
            ScreenManager.resumeGameplay();
          } else if (ScreenManager.isPlaying()) {
            if (typeof Game !== 'undefined' && Game.requestPause) {
              Game.requestPause('pause', 0);
            } else {
              ScreenManager.toPause();
            }
          }
        }
      });
    }
  }

  // ── Shared action button refresh ────────────────────────────────
  // The #sb-pause button serves triple duty:
  //   Combat  → 🏃 FLEE  (red pulse, fires _onFleeCallback)
  //   Hose    → 🔄 REEL  (green, fires _onReelCallback)
  //   Normal  → ☰        (pause menu)
  // Priority: combat > hose > normal. Called by setCombat() and
  // setHoseActive() whenever their state changes.

  function _refreshActionButton() {
    if (!_btnPause) return;

    // Remove all mode classes first
    _btnPause.classList.remove('sb-flee-active', 'sb-reel-active');

    if (_inCombat) {
      _btnPause.textContent = '\u{1F3C3} FLEE';
      _btnPause.title       = 'Flee Combat (F)';
      _btnPause.classList.add('sb-flee-active');
    } else if (_hoseActive) {
      _btnPause.textContent = '\u{1F504} REEL';
      _btnPause.title       = 'Roll Up Hose (R)';
      _btnPause.classList.add('sb-reel-active');
      // TODO:SFX reel-button-hover — short zipline whir / cable tension
      // "zing" on hover/focus of the REEL button. 80-150ms, volume 0.2.
      // Conveys taut cable ready to release. Fire on pointerenter when
      // sb-reel-active is set; suppress repeats within 300ms debounce.
    } else {
      _btnPause.textContent = '\u2630';
      _btnPause.title       = 'Pause Menu (Esc)';
    }
  }

  /**
   * Set hose-active state. When active (and not in combat), the pause
   * button shows REEL instead of ☰.
   */
  function setHoseActive(active) {
    _hoseActive = !!active;
    _refreshActionButton();
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

  // ── Cinematic / monologue coordination ─────────────────────────
  //
  // Three states:
  //   1. Normal       — tooltip visible, bottom: 0
  //   2. Monologue    — tooltip HIDDEN (canvas bar text must be readable)
  //   3. Cinema+dlg   — tooltip VISIBLE, lifted above bar (dialogue choices clickable)
  //
  // setCinematicMode() is called every frame from the render loop.
  //
  var _cinemaState = 'normal';  // 'normal' | 'monologue' | 'cinema'

  /**
   * @param {boolean} cinemaActive  - CinematicCamera.isActive()
   * @param {boolean} monologueActive - MonologuePeek.isActive()
   * @param {number}  [barPx]       - CinematicCamera.getBarHeight(vpH)
   */
  function setCinematicMode(cinemaActive, monologueActive, barPx) {
    var newState;
    if (monologueActive) {
      newState = 'monologue';
    } else if (cinemaActive) {
      newState = 'cinema';
    } else {
      newState = 'normal';
    }

    // During combat the combat_lock cinematic runs and the render loop
    // calls setCinematicMode('cinema', ...) every frame. The 'cinema'
    // branch normally lifts the tooltip by barPx to float it above the
    // letterbox bar — but during combat the CardFan owns the bottom
    // footer region and a lifted tooltip translates directly over the
    // player's hand. Clamp the state to 'normal' whenever _inCombat so
    // the tooltip stays pinned to the bottom, out of the card fan's way.
    if (_inCombat && newState === 'cinema') {
      newState = 'normal';
      barPx = 0;
    }

    if (newState === _cinemaState) return;
    _cinemaState = newState;

    if (!_tooltipArea) return;

    if (newState === 'monologue') {
      // Hide tooltip so canvas monologue text on bars is readable
      _tooltipArea.style.visibility = 'hidden';
      _tooltipArea.style.transform  = '';
    } else if (newState === 'cinema') {
      // Tooltip visible and lifted above cinema bottom bar
      _tooltipArea.style.visibility = '';
      _tooltipArea.style.transform  = barPx ? 'translateY(-' + barPx + 'px)' : '';
    } else {
      // Normal — reset
      _tooltipArea.style.visibility = '';
      _tooltipArea.style.transform  = '';
    }
  }

  // ── Update methods ──────────────────────────────────────────────

  function updateFloor(floorNum, biome) {
    if (_floorEl) {
      _floorEl.innerHTML = i18n.t('status.floor', 'Floor') + ' <span>' + floorNum + '</span>';
    }
    if (_biomeEl) {
      _biomeEl.textContent = biome ? ('\u00B7 ' + biome) : '';
    }
  }

  function updateHeading(dirIndex) {
    // Compass heading now lives in the minimap time strip (#minimap-time-strip).
    // StatusBar heading element is reserved for combat energy display only.
    // No-op during normal exploration; combat mode writes to _headingEl directly.
    if (_inCombat) return;  // Don't overwrite combat energy text
    if (_headingEl) {
      _headingEl.textContent = '';
    }
  }

  function updateBag() {
    if (!_btnBag) return;
    var count = 0;
    var max = 12;
    if (typeof CardAuthority !== 'undefined') {
      count = CardAuthority.getBagSize();
      max = CardAuthority.getMaxBag();
    }
    _btnBag.textContent = '🎒 BAG ' + count + '/' + max;

    // Visual urgency by fullness
    var full = count / max;
    _btnBag.classList.remove('sb-active', 'sb-bag-critical', 'sb-bag-warn');
    if (full >= 0.90) {
      _btnBag.classList.add('sb-bag-critical');  // stamp-red border + pulse
    } else if (full > 0.70) {
      _btnBag.classList.add('sb-bag-warn');       // hazmat-yellow hint
    }
  }

  function updateDeck() {
    if (!_btnDeck) return;
    var handSize = 0;
    var deckSize = 0;
    if (typeof CardAuthority !== 'undefined') {
      handSize = CardAuthority.getHandSize();
      deckSize = CardAuthority.getBackupSize();
    }
    _btnDeck.textContent = '🃏 DECK ' + handSize + '/' + (handSize + deckSize);
  }

  function _updateMapBtn() {
    if (!_btnMap) return;
    var mapVisible = (typeof Minimap !== 'undefined' && Minimap.isVisible());
    if (mapVisible) {
      _btnMap.classList.add('sb-active');
    } else {
      _btnMap.classList.remove('sb-active');
    }
  }

  // ── Combat mode ─────────────────────────────────────────────────

  function setCombat(active, round, advantage, energy) {
    var wasInCombat = _inCombat;
    _inCombat = active;
    _combatRound = round || 0;
    _advantage = advantage || '';
    _combatEnergy = energy || 0;

    // Entering combat: collapse the tooltip footer so the expanded
    // history panel can never occlude the CardFan hand. Burst
    // auto-expand is also suppressed while _inCombat (see pushTooltip).
    // We also clear any leftover cinema lift transform — the
    // combat_lock cinematic will keep firing setCinematicMode every
    // frame, but the _inCombat clamp inside setCinematicMode pins it
    // to 'normal'; however the existing _cinemaState may still be
    // 'cinema' from the pre-combat hero cutscene, which would cause
    // the early-return (newState === _cinemaState) to skip the reset.
    // Force the state and transform to normal synchronously here.
    if (active && !wasInCombat) {
      forceCollapse();
      if (_tooltipArea) {
        _tooltipArea.style.visibility = '';
        _tooltipArea.style.transform  = '';
      }
      _cinemaState = 'normal';
    }

    if (!_visible) return;

    if (_inCombat) {
      // Swap compass to FLEE indicator during combat
      if (_btnMap) _btnMap.textContent = '!';
      // Update floor area with combat info
      if (_floorEl) {
        _floorEl.innerHTML = 'Round <span>' + _combatRound + '</span>';
      }
      if (_biomeEl) {
        _biomeEl.textContent = _advantage ? ('\u00B7 ' + _advantage) : '';
      }
      if (_headingEl) {
        _headingEl.textContent = '\u26A1' + _combatEnergy + ' EN';
      }
    } else {
      // Restore compass label
      if (_btnMap) _btnMap.textContent = 'N';
      _updateMapBtn();
    }

    // Shared anchor: refresh pause/flee/reel button state
    _refreshActionButton();
  }

  // ── Tooltip footer ─────────────────────────────────────────────

  /**
   * Push a message to the tooltip footer.
   * Shows as the latest line; previous messages scroll into history.
   * @param {string} text - Message to display
   * @param {string} [category] - Optional category (loot, dialogue, door, system)
   */
  /** Expand/collapse helper with class management. */
  function _setExpanded(expanded) {
    _tooltipExpanded = expanded;
    if (_el) _el.classList.toggle('sb-expanded', expanded);

    // Cancel any pending auto-collapse when toggling
    if (_autoCollapseId) { clearTimeout(_autoCollapseId); _autoCollapseId = null; }

    // When expanding, anchor the history viewport to the bottom so the
    // newest entry is immediately above the current/dialogue row. The
    // rebuild-time snap is skipped while collapsed to avoid thrash, so
    // this covers the common case of "accumulate tooltips, then open
    // the panel" — without it the panel opens pinned at the oldest row.
    if (expanded && _tooltipHistory) {
      // Defer one frame so the browser has applied the sb-expanded
      // max-height before we read scrollHeight.
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(function () {
          if (_tooltipExpanded && _tooltipHistory) {
            _tooltipHistory.scrollTop = _tooltipHistory.scrollHeight;
          }
        });
      } else {
        _tooltipHistory.scrollTop = _tooltipHistory.scrollHeight;
      }
    }

    // When expanding (from any source), start a gracious auto-collapse
    // timer so the tooltip doesn't stay expanded forever.
    if (expanded && !_dialogueActive) {
      _autoCollapseId = setTimeout(function () {
        if (!_dialogueActive) _setExpanded(false);
      }, AUTO_COLLAPSE_MS);
    }
  }

  /**
   * Collapse the tooltip if it's currently expanded (and not in a dialogue tree).
   * Called externally on movement or click-away.
   */
  function collapseIfIdle() {
    if (_tooltipExpanded && !_dialogueActive) {
      _setExpanded(false);
    }
  }

  /**
   * Unconditionally collapse the tooltip footer — tears down any active
   * dialogue, cancels pending auto-collapse timers, and drops burst
   * counters so a subsequent bark volley can't immediately re-expand.
   * Called on combat entry so the expanded tooltip panel can never
   * cover the CardFan hand. Safe to call repeatedly.
   */
  function forceCollapse() {
    if (_dialogueActive) {
      // Tear down the dialogue tree first. clearDialogue() would defer
      // the actual collapse by AUTO_COLLAPSE_MS, so we clear its state
      // flags here and then force-collapse synchronously below.
      _dialogueActive = false;
      _dialogueActiveHtml = '';
      _dialogueTree   = null;
      _dialogueNpc    = null;
      _dialogueNodeId = null;
      _dialogueNpcPos = null;
      _dialoguePinned = false;
      _activePriority = PRIORITY.NORMAL;
      if (_tooltipHistory) _tooltipHistory.classList.remove('sb-dialogue-mode');
      if (_tooltipLatest) {
        _tooltipLatest.style.display = '';
        _setLatestText(_history.length > 0 ? _history[0].text : 'Ready.');
      }
      if (_dialogueNpcId && typeof KaomojiCapsule !== 'undefined') {
        KaomojiCapsule.stopSpeech(_dialogueNpcId);
      }
      _dialogueNpcId = null;
      if (_dialogueOnEnd) {
        var fn = _dialogueOnEnd;
        _dialogueOnEnd = null;
        try { fn(); } catch (e) {}
      }
      _rebuildHistory();
      _rebuildPreview();
    }
    if (_autoCollapseId) { clearTimeout(_autoCollapseId); _autoCollapseId = null; }
    if (_burstResetId)   { clearTimeout(_burstResetId);   _burstResetId   = null; }
    _burstCount = 0;
    _setExpanded(false);
  }

  function pushTooltip(text, category) {
    if (!text) return;

    category = category || 'info';
    var time = _timestamp();

    // Push to history (always — even during dialogue, for scroll-back)
    _history.unshift({ text: text, time: time, category: category });
    if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;

    // Forward to ViewportRing bark display (north-anchored on ring).
    // All categories except 'system' and 'dim' get ring treatment —
    // inspect results, NPC barks, pickup notices all show on the ring.
    if (typeof ViewportRing !== 'undefined' && ViewportRing.showRingBark) {
      if (category !== 'system' && category !== 'dim') {
        ViewportRing.showRingBark(text);
      }
    }

    // If dialogue is active, log to history and rebuild — the bark appears
    // inline above the active dialogue node in the history panel.
    if (_dialogueActive) {
      _rebuildHistory();
      // Scroll to bottom so both the bark and active dialogue stay visible
      if (_tooltipHistory) _tooltipHistory.scrollTop = _tooltipHistory.scrollHeight;
      return;
    }

    // Update latest line (preserve LOG button child)
    _setLatestText(text);

    _rebuildHistory();
    _rebuildPreview();

    // ── Burst detection: auto-expand ONLY on rapid NPC barks ──
    // System messages, loot pickups, combat events, door transitions,
    // and cinematic/monologue prints must NOT count toward burst — only
    // genuine NPC bark chatter (category 'npc') should trigger the
    // history panel to pop open. This keeps auto-expand meaningful and
    // prevents the history from fluttering open during normal play.
    // During combat the CardFan hand occupies the footer zone — a burst
    // auto-expand would cover the player's attack cards, so suppress it
    // entirely while _inCombat is true. Barks still log to history and
    // update the latest row; they just can't pop the panel open.
    if (category === 'npc' && !_inCombat) {
      _burstCount++;
      if (_burstResetId) clearTimeout(_burstResetId);
      _burstResetId = setTimeout(function () { _burstCount = 0; }, BURST_WINDOW_MS);

      if (!_tooltipExpanded && _burstCount >= BURST_THRESHOLD) {
        // _setExpanded(true) schedules its own auto-collapse timer
        _setExpanded(true);
      }
    }

    // Flash the expand hint when new entry arrives (if collapsed)
    if (!_tooltipExpanded && _history.length > 2) {
      var hint = document.getElementById('sb-expand-hint');
      if (hint) {
        hint.style.opacity = '1';
        setTimeout(function () { hint.style.opacity = ''; }, 800);
      }
    }
  }

  /** Minimal HTML escaping for tooltip entries. */
  function _escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Set the latest row text without nuking the LOG button child. */
  function _setLatestText(text) {
    if (!_tooltipLatest) return;
    // Find or preserve the expand-hint span
    var hint = _tooltipLatest.querySelector('.sb-expand-hint');
    // Set text content via a text node (first child)
    var textNode = _tooltipLatest.firstChild;
    if (textNode && textNode.nodeType === 3) {
      textNode.textContent = text;
    } else {
      // Rebuild: text node + hint
      _tooltipLatest.textContent = '';
      _tooltipLatest.appendChild(document.createTextNode(text));
    }
    // Re-append hint if it got removed
    if (hint && !_tooltipLatest.contains(hint)) {
      _tooltipLatest.appendChild(hint);
    } else if (!hint) {
      hint = document.getElementById('sb-expand-hint');
      if (hint) _tooltipLatest.appendChild(hint);
    }
  }

  /**
   * Build the 1-2 preview rows above the current row (rolodex fade).
   * Shows history[1] and history[2] as dim fading lines.
   */
  function _rebuildPreview() {
    if (!_tooltipPreview) return;
    if (_dialogueActive) { _tooltipPreview.innerHTML = ''; return; }
    var html = '';
    // Show up to 2 previous entries (index 1 = previous, index 2 = older)
    var maxPreview = Math.min(_history.length, 3);
    for (var i = maxPreview - 1; i >= 1; i--) {
      var h = _history[i];
      var catDot = '<span class="sb-tt-cat sb-tt-cat-' + (h.category || 'info') + '" style="display:inline-block;width:5px;height:5px;border-radius:50%;margin-right:4px;vertical-align:middle;"></span>';
      html += '<div class="sb-tooltip-prev-row">' + catDot + _escHtml(h.text) + '</div>';
    }
    _tooltipPreview.innerHTML = html;
  }

  // ── Inline dialogue (Canon Phase 1) ─────────────────────────────

  /**
   * Start an inline dialogue in the tooltip area.
   * Renders speaker, text, and clickable [choices] in the latest line area.
   * Automatically expands the tooltip if collapsed.
   *
   * @param {Object}   npc       - { id, name, emoji }
   * @param {Object}   tree      - { root, nodes: { [id]: { text, choices } } }
   * @param {Function} [onEnd]   - Callback when conversation ends
   * @param {Object}   [opts]    - Options: { pinned: bool } — pinned dialogues
   *                                ignore walk-away detection (forced encounters).
   */
  function pushDialogue(npc, tree, onEnd, opts) {
    if (!tree || !tree.nodes || !tree.root) return;
    if (!_tooltipHistory) return;

    // Combat hard-block: the CardFan owns the bottom footer during a
    // fight, so an inline dialogue tree (expanded history + reply pills)
    // would render directly on top of the player's hand. Log the NPC's
    // opening line to history for scroll-back after combat and fire the
    // onEnd callback so the caller's state machine doesn't stall, but
    // do NOT enter dialogue mode or expand the panel.
    if (_inCombat) {
      var rootNode = tree.nodes[tree.root];
      if (rootNode && rootNode.text) {
        var speakerLbl = (npc && ((npc.emoji || '') + ' ' + (npc.name || '')).trim()) || '';
        var histLine = (speakerLbl ? speakerLbl + ': ' : '') + '\u201c' + rootNode.text + '\u201d';
        _history.unshift({ text: histLine, time: _timestamp(), category: 'dialogue' });
        if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;
        _rebuildPreview();
      }
      if (typeof onEnd === 'function') {
        try { onEnd(); } catch (e) {}
      }
      return;
    }

    // Cancel every pending timer that could collapse the panel out from
    // under the new dialogue. _autoCollapseId covers both the expand-
    // timeout and the post-clearDialogue timer; _burstResetId is cleared
    // defensively so a trailing bark burst from before the dialogue
    // opened can't be counted against the new one.
    if (_autoCollapseId) { clearTimeout(_autoCollapseId); _autoCollapseId = null; }
    if (_burstResetId)   { clearTimeout(_burstResetId);   _burstResetId   = null; }
    _burstCount = 0;

    _dialogueActive = true;
    _dialogueNpcId  = npc.id || null;
    _dialogueTree   = tree;
    _dialogueNpc    = npc;
    _dialogueNodeId = tree.root;
    _dialogueOnEnd  = onEnd || null;
    _dialoguePinned = !!(opts && opts.pinned);
    _activePriority = PRIORITY.DIALOGUE;

    // Store NPC position for walk-away detection (null if pinned — never walks away)
    _dialogueNpcPos = (!_dialoguePinned && npc.x != null && npc.y != null)
      ? { x: npc.x, y: npc.y } : null;

    // Auto-expand so the history panel is visible
    _setExpanded(true);

    // Toggle dialogue-mode CSS class — suppresses ruled-line background
    // on the history panel so dialogue entries don't get doubled lines.
    if (_tooltipHistory) _tooltipHistory.classList.add('sb-dialogue-mode');

    // Hide the latest row — dialogue lives entirely in history panel
    if (_tooltipLatest) _tooltipLatest.style.display = 'none';

    // Wire click delegation on history panel (once)
    if (_tooltipHistory && !_tooltipHistory._dialogueWired) {
      _tooltipHistory._dialogueWired = true;
      _tooltipHistory.addEventListener('click', function (e) {
        var choiceEl = e.target.closest('.sb-dialogue-choice');
        if (!choiceEl || !_dialogueActive) return;
        e.stopPropagation();
        var idx = parseInt(choiceEl.getAttribute('data-choice-idx'), 10);
        if (!isNaN(idx)) _onDialogueChoice(idx);
      });
    }

    // Dynamic root: if tree.root is a function, call it to resolve the
    // starting node (allows flag-gated greeting variants).
    var rootNode = typeof tree.root === 'function' ? tree.root() : tree.root;
    _renderDialogueNode(rootNode);
  }

  /**
   * Render a dialogue node into the history panel as the bottommost entry.
   * The active node (with clickable choices) is always last. All prior
   * exchanges, barks, and game tooltips appear above it chronologically.
   */
  function _renderDialogueNode(nodeId) {
    if (!_dialogueTree || !_dialogueTree.nodes) return;
    var node = _dialogueTree.nodes[nodeId];
    if (!node) { clearDialogue(); return; }

    _dialogueNodeId = nodeId;
    var npc = _dialogueNpc || {};
    var speaker = (npc.emoji || '') + ' ' + (npc.name || '');

    // ── DOC-107 quest fan-out (branch/node level) ───────────────────
    // Fire onNpcTalk with the node id as the branch so quest steps
    // predicating on a specific dialogue branch (e.g.
    // `{kind:'npc', npcId:'inn_keeper', branch:'rat_report'}`) can
    // advance when the player navigates to that node. The root-level
    // npc talk event is fired separately from NpcSystem.interact().
    if (typeof QuestChain !== 'undefined' &&
        typeof QuestChain.onNpcTalk === 'function' &&
        npc && typeof npc.id === 'string' &&
        typeof nodeId === 'string') {
      try { QuestChain.onNpcTalk(npc.id, nodeId); }
      catch (e) {
        if (typeof console !== 'undefined') {
          console.warn('[StatusBar] QuestChain.onNpcTalk threw:', e);
        }
      }
    }

    // Log NPC speech to history as plain text (for scroll-back after close)
    var histText = speaker.trim() + ': \u201c' + (node.text || '') + '\u201d';
    _history.unshift({ text: histText, time: _timestamp(), category: 'dialogue' });
    if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;

    // Rebuild the full history panel — _rebuildHistory appends the active
    // dialogue node at the bottom when _dialogueActive is true.
    _dialogueActiveHtml = _buildDialogueNodeHtml(npc, node);
    _rebuildHistory();

    // Scroll history to bottom so the active dialogue node is visible
    if (_tooltipHistory) {
      _tooltipHistory.scrollTop = _tooltipHistory.scrollHeight;
    }
  }

  // Cached HTML for the active dialogue node (appended by _rebuildHistory)
  var _dialogueActiveHtml = '';

  /**
   * Build the HTML for a dialogue node (speaker + text + choices).
   */
  function _buildDialogueNodeHtml(npc, node) {
    var speaker = (npc.emoji || '') + ' ' + (npc.name || '');
    var html = '<div class="sb-dialogue-entry sb-dialogue-active" data-npc="' + _escHtml(npc.id || '') + '">';
    html += '<span class="sb-dialogue-speaker">' + _escHtml(speaker.trim()) + '</span>';
    html += '<span class="sb-dialogue-text">' + _escHtml(node.text || '') + '</span>';

    if (node.choices && node.choices.length > 0) {
      // ── showIf gate: filter choices by player flag conditions ──
      // Each choice may have showIf: { flag: 'flagName' } (must be truthy)
      // or showIf: { flag: 'flagName', value: false } (must be falsy).
      // Choices without showIf are always visible.
      var visible = [];
      for (var vi = 0; vi < node.choices.length; vi++) {
        var vc = node.choices[vi];
        if (vc.showIf && typeof Player !== 'undefined') {
          var flagVal = Player.getFlag ? Player.getFlag(vc.showIf.flag)
                      : (Player.state().flags && Player.state().flags[vc.showIf.flag]);
          var want = vc.showIf.value !== undefined ? vc.showIf.value : true;
          if (want ? !flagVal : !!flagVal) continue;  // condition not met — skip
        }
        visible.push({ orig: vi, choice: vc });
      }

      html += '<span class="sb-dialogue-choices">';
      for (var i = 0; i < visible.length; i++) {
        var c = visible[i].choice;
        var origIdx = visible[i].orig;
        var visitedCls = c.visited ? ' sb-dialogue-choice-visited' : '';
        var keyNum = i + 1;  // 1-indexed for display (renumbered after filter)
        html += '<span class="sb-dialogue-choice' + visitedCls + '" data-choice-idx="' + origIdx + '">' +
                '<span class="sb-choice-key">' + keyNum + '</span>' +
                _escHtml(c.label || c.text || 'Continue') + '</span>';
      }
      html += '</span>';
    }
    html += '</div>';
    return html;
  }

  /**
   * Handle a choice click in the inline dialogue.
   */
  function _onDialogueChoice(idx) {
    if (!_dialogueTree || !_dialogueNodeId) return;
    var node = _dialogueTree.nodes[_dialogueNodeId];
    if (!node || !node.choices || !node.choices[idx]) return;

    var choice = node.choices[idx];

    // Mark visited
    choice.visited = true;

    // Apply effects — full Canon §Choice Effects table
    if (choice.effect) {
      // currency: add/subtract gold (negative = cost)
      if (choice.effect.currency && typeof CardAuthority !== 'undefined') {
        CardAuthority.addGold(choice.effect.currency);
        if (typeof HUD !== 'undefined') HUD.updatePlayer(Player.state());
      }
      // heal: restore HP (capped at maxHp)
      if (choice.effect.heal && typeof Player !== 'undefined') {
        var ps = Player.state();
        ps.hp = Math.min(ps.maxHp, ps.hp + choice.effect.heal);
        if (typeof HUD !== 'undefined') HUD.updatePlayer(ps);
      }
      // setFlag: set player.flags[key] = true
      if (choice.effect.setFlag && typeof Player !== 'undefined') {
        Player.state().flags[choice.effect.setFlag] = true;
      }
      // giveItem: add item to player bag
      if (choice.effect.giveItem && typeof CardAuthority !== 'undefined') {
        CardAuthority.addToBag(choice.effect.giveItem);
      }
      // openShop: open the Shop system (vendor dialogue end-action)
      if (choice.effect.openShop && typeof Shop !== 'undefined' && Shop.open) {
        var shopFaction = choice.effect.factionId || (_dialogueNpc && _dialogueNpc.factionId) || 'tide';
        Shop.open(shopFaction);
      }
      // callback: custom fn(ctx, npc) — Canon §Choice Effects
      // ctx provides the choice, current node, and tree for external callbacks.
      // Inline closures that take zero args still work (extra args ignored).
      if (typeof choice.effect.callback === 'function') {
        try {
          var ctx = { choice: choice, nodeId: _dialogueNodeId, tree: _dialogueTree };
          choice.effect.callback(ctx, _dialogueNpc);
        } catch (cbErr) {
          console.error('[StatusBar] Choice callback error:', cbErr);
        }
      }
    }

    // Log player choice to history
    _history.unshift({ text: '\u25B8 ' + (choice.label || 'Continue'), time: _timestamp(), category: 'dialogue' });
    if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;

    // null next = end conversation
    if (!choice.next) {
      clearDialogue();
      return;
    }

    // Navigate to next node
    _renderDialogueNode(choice.next);
  }

  /**
   * Clear active inline dialogue, restore normal tooltip.
   */
  function clearDialogue() {
    console.log('[StatusBar] clearDialogue — closing conversation');
    _dialogueActive = false;
    _dialogueActiveHtml = '';
    _dialogueTree   = null;
    _dialogueNpc    = null;
    _dialogueNodeId = null;
    _dialogueNpcPos = null;
    _dialoguePinned = false;
    _activePriority = PRIORITY.NORMAL;

    // Remove dialogue-mode class — restore ruled lines in history
    if (_tooltipHistory) _tooltipHistory.classList.remove('sb-dialogue-mode');

    // Restore the latest row
    if (_tooltipLatest) {
      _tooltipLatest.style.display = '';
      _setLatestText(_history.length > 0 ? _history[0].text : 'Ready.');
    }

    // Notify KaomojiCapsule to stop speech
    if (_dialogueNpcId && typeof KaomojiCapsule !== 'undefined') {
      KaomojiCapsule.stopSpeech(_dialogueNpcId);
    }
    _dialogueNpcId = null;

    if (_dialogueOnEnd) {
      var fn = _dialogueOnEnd;
      _dialogueOnEnd = null;
      fn();
    }

    _rebuildHistory();
    _rebuildPreview();

    // Schedule auto-collapse — tooltip minimizes after dialogue ends.
    // The timer must check _dialogueActive at fire time: the onEnd
    // callback above (or any code running in the next 5s) may chain
    // into a fresh pushDialogue, and without this guard the stale
    // timer would collapse the brand-new dialogue tree and wipe its
    // reply options from the history panel.
    if (_tooltipExpanded) {
      if (_autoCollapseId) clearTimeout(_autoCollapseId);
      _autoCollapseId = setTimeout(function () {
        if (_dialogueActive) return;
        _setExpanded(false);
      }, AUTO_COLLAPSE_MS);
    }
  }

  /** Check if dialogue is currently active (blocks movement). */
  function isDialogueActive() { return _dialogueActive; }

  /** Get number of choices on the current dialogue node (0 if no dialogue). */
  function getChoiceCount() {
    if (!_dialogueActive || !_dialogueTree || !_dialogueNodeId) return 0;
    var node = _dialogueTree.nodes[_dialogueNodeId];
    return (node && node.choices) ? node.choices.length : 0;
  }

  /**
   * Check if player has walked away from the NPC they're talking to.
   * Called from Game._onMoveFinish(). Manhattan distance > 2 = interrupt.
   * @param {number} px - Player grid x
   * @param {number} py - Player grid y
   */
  function checkWalkAway(px, py) {
    if (!_dialogueActive || !_dialogueNpcPos) return;
    var dx = Math.abs(px - _dialogueNpcPos.x);
    var dy = Math.abs(py - _dialogueNpcPos.y);
    if (dx + dy > 2) {
      // Log interruption
      _history.unshift({ text: '(walked away)', time: _timestamp(), category: 'dim' });
      if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;
      clearDialogue();
    }
  }

  /** Helper: current timestamp string — uses in-game DayCycle time. */
  function _timestamp() {
    if (typeof DayCycle !== 'undefined' && DayCycle.getTimeString) {
      return DayCycle.getTimeString();
    }
    // Fallback to wall clock if DayCycle not available yet
    var now = new Date();
    return ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
  }

  /** Rebuild history HTML (shared by pushTooltip and dialogue).
   *  Renders oldest at top, newest at bottom (closest to the current row).
   *  History array is newest-first (via unshift), so iterate in reverse.
   *  When dialogue is active, the active node (with choices) is appended
   *  as the bottommost entry — all barks/tooltips appear above it. */
  function _rebuildHistory() {
    if (!_tooltipHistory) return;
    var html = '';
    // During dialogue: render ALL history (index 0 is the NPC's current line).
    // Outside dialogue: skip index 0 (the latest row shows it).
    var end = _dialogueActive ? 0 : 1;
    for (var i = _history.length - 1; i >= end; i--) {
      var h = _history[i];
      var catClass = 'sb-tt-cat-' + (h.category || 'info');
      // Last entry (i === 0, rendered last) gets prominent styling
      var entryCls = 'sb-tooltip-entry' + (i === 0 && _dialogueActive ? ' sb-tooltip-entry-current' : '');
      html += '<div class="' + entryCls + '">' +
              '<span class="sb-tt-cat ' + catClass + '"></span>' +
              '<span class="sb-tt-time">' + h.time + '</span>' +
              '<span class="sb-tt-text">' + _escHtml(h.text) + '</span>' +
              '</div>';
    }

    // Append active dialogue node (with clickable choices) at the bottom
    if (_dialogueActive && _dialogueActiveHtml) {
      html += _dialogueActiveHtml;
    }

    _tooltipHistory.innerHTML = html;

    // Anchor the viewport to the bottom so the newest entry is the row
    // immediately above the latest/dialogue row. Without this the
    // scrollable panel stays pinned to the top after a rebuild, making
    // the second-from-bottom visible row one of the OLDEST entries
    // (confusing rolodex order). Only snap-to-bottom when the panel is
    // expanded, to avoid thrashing scroll state while collapsed.
    if (_tooltipExpanded && _tooltipHistory.scrollHeight > 0) {
      _tooltipHistory.scrollTop = _tooltipHistory.scrollHeight;
    }
  }

  // ── Gold coin-wheel ticker ──────────────────────────────────────
  var _goldCurrent = 0;           // Last displayed gold value
  var _goldAnimId  = null;        // requestAnimationFrame ID for ticker
  var _goldTrack   = null;        // #sb-gold-track element (cached)

  function _updateGoldWheel(newVal) {
    if (!_goldEl) return;
    if (!_goldTrack) _goldTrack = document.getElementById('sb-gold-track');
    if (!_goldTrack) {
      // Fallback — no wheel structure, set text directly
      _goldEl.textContent = '💰 ' + newVal + 'g';
      return;
    }

    if (newVal === _goldCurrent) return;

    var oldVal = _goldCurrent;
    _goldCurrent = newVal;
    var gained = newVal > oldVal;

    // Set wheel values for animation
    var prev = _goldTrack.querySelector('.sb-gold-wheel-prev');
    var curr = _goldTrack.querySelector('.sb-gold-wheel-curr');
    var next = _goldTrack.querySelector('.sb-gold-wheel-next');

    if (gained) {
      // Gain: show old (prev) → roll up to new (curr)
      if (prev) prev.textContent = oldVal;
      if (curr) curr.textContent = newVal;
      if (next) next.textContent = '';
      _goldTrack.style.transition = 'none';
      _goldTrack.style.transform = 'translateY(0)';  // start at prev
    } else {
      // Loss: show old (next) → roll down to new (curr)
      if (prev) prev.textContent = '';
      if (curr) curr.textContent = newVal;
      if (next) next.textContent = oldVal;
      _goldTrack.style.transition = 'none';
      _goldTrack.style.transform = 'translateY(-52px)';  // start at next
    }

    // Force reflow then animate to center (curr)
    void _goldTrack.offsetHeight;
    _goldTrack.style.transition = 'transform 0.25s cubic-bezier(0.22, 0.68, 0.35, 1.2)';
    _goldTrack.style.transform = 'translateY(-26px)';

    // Pulse highlight
    _goldEl.classList.add('sb-gold-changing');

    // Play coin sound (use EyesOnly jingles, fallback to sq-sq coins)
    if (typeof AudioSystem !== 'undefined' && oldVal !== 0) {
      if (gained) {
        AudioSystem.play('coin-jingle1', { volume: 0.45 });
      } else {
        AudioSystem.play('coin-jingle2', { volume: 0.35 });
      }
    }

    // After animation, snap to final state
    setTimeout(function () {
      _goldTrack.style.transition = 'none';
      if (curr) curr.textContent = newVal;
      _goldTrack.style.transform = 'translateY(-26px)';
      _goldEl.classList.remove('sb-gold-changing');
    }, 300);
  }

  // ── Refresh (called per frame or on state change) ───────────────

  function refresh() {
    if (!_visible) return;
    _updateMapBtn();
    updateBag();
    updateDeck();
    // Heading from Player direction
    if (typeof Player !== 'undefined' && Player.getDir) {
      updateHeading(Player.getDir());
    }
    // Gold counter (coin-wheel ticker)
    if (_goldEl && typeof Player !== 'undefined') {
      var p = Player.state();
      var g = (p && typeof p.currency === 'number') ? p.currency : 0;
      _updateGoldWheel(g);
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    