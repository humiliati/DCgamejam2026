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

    // Tooltip footer (rolodex layout)
    _tooltipArea    = document.getElementById('sb-tooltip-area');
    _tooltipLatest  = document.getElementById('sb-tooltip-latest');
    _tooltipHistory = document.getElementById('sb-tooltip-history');
    _tooltipPreview = document.getElementById('sb-tooltip-preview');

    if (_tooltipArea) {
      _tooltipArea.addEventListener('click', function (e) {
        // Don't toggle expand when clicking dialogue choices
        if (e.target.closest('.sb-dialogue-choice')) return;
        if (e.target.closest('.sb-dialogue-entry')) return;
        e.stopPropagation();
        _setExpanded(!_tooltipExpanded);
      });
    }

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
        // Toggle pause menu at Face 2 (Inventory)
        if (typeof ScreenManager !== 'undefined') {
          if (ScreenManager.isPaused()) {
            if (typeof MenuBox !== 'undefined') MenuBox.close();
          } else if (ScreenManager.isPlaying()) {
            if (typeof Game !== 'undefined' && Game.requestPause) {
              Game.requestPause('pause', 2);
            } else {
              ScreenManager.toPause();
            }
          }
        }
      });
    }

    // Deck button → opens pause menu on inventory face (face 2)
    if (_btnDeck) {
      _btnDeck.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof ScreenManager !== 'undefined') {
          if (ScreenManager.isPaused()) {
            if (typeof MenuBox !== 'undefined') MenuBox.close();
          } else if (ScreenManager.isPlaying()) {
            if (typeof Game !== 'undefined' && Game.requestPause) {
              Game.requestPause('pause', 2);
            } else {
              ScreenManager.toPause();
            }
          }
        }
      });
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
    if (_headingEl) {
      _headingEl.textContent = HEADINGS[dirIndex] || '';
    }
  }

  function updateBag() {
    if (!_btnBag) return;
    var count = 0;
    var max = 12;
    if (typeof Player !== 'undefined') {
      if (Player.getBag) count = Player.getBag().length;
      if (Player.MAX_BAG) max = Player.MAX_BAG;
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
    if (typeof CardSystem !== 'undefined') {
      if (CardSystem.getHand) handSize = CardSystem.getHand().length;
      if (CardSystem.getDeck) {
        deckSize = CardSystem.getDeck().length;
      } else if (CardSystem.getCollection) {
        // Fallback: collection minus hand = backup deck
        deckSize = Math.max(0, CardSystem.getCollection().length - handSize);
      }
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
    _inCombat = active;
    _combatRound = round || 0;
    _advantage = advantage || '';
    _combatEnergy = energy || 0;

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

    // Cancel any pending auto-collapse when manually toggling
    if (_autoCollapseId) { clearTimeout(_autoCollapseId); _autoCollapseId = null; }
  }

  function pushTooltip(text, category) {
    if (!text) return;

    category = category || 'info';
    var time = _timestamp();

    // Push to history (always — even during dialogue, for scroll-back)
    _history.unshift({ text: text, time: time, category: category });
    if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;

    // If dialogue is active, don't overwrite the latest line — just log
    if (_dialogueActive) {
      _rebuildHistory();
      return;
    }

    // Update latest line (preserve LOG button child)
    _setLatestText(text);

    _rebuildHistory();
    _rebuildPreview();

    // ── Burst detection: auto-expand on rapid entries ──
    _burstCount++;
    if (_burstResetId) clearTimeout(_burstResetId);
    _burstResetId = setTimeout(function () { _burstCount = 0; }, BURST_WINDOW_MS);

    if (!_tooltipExpanded && _burstCount >= BURST_THRESHOLD) {
      _setExpanded(true);
      // Schedule auto-collapse after activity settles
      if (_autoCollapseId) clearTimeout(_autoCollapseId);
      _autoCollapseId = setTimeout(function () {
        if (!_dialogueActive) _setExpanded(false);
      }, AUTO_COLLAPSE_MS);
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
   */
  function pushDialogue(npc, tree, onEnd) {
    if (!tree || !tree.nodes || !tree.root) return;
    if (!_tooltipLatest) return;

    // Cancel any pending auto-collapse
    if (_autoCollapseId) { clearTimeout(_autoCollapseId); _autoCollapseId = null; }

    _dialogueActive = true;
    _dialogueNpcId  = npc.id || null;
    _dialogueTree   = tree;
    _dialogueNpc    = npc;
    _dialogueNodeId = tree.root;
    _dialogueOnEnd  = onEnd || null;
    _activePriority = PRIORITY.DIALOGUE;

    // Store NPC position for walk-away detection
    _dialogueNpcPos = (npc.x != null && npc.y != null) ? { x: npc.x, y: npc.y } : null;

    // Auto-expand so choices are visible
    _setExpanded(true);

    // Add dialogue-mode class for CSS wrapping
    if (_tooltipLatest) _tooltipLatest.classList.add('sb-dialogue-mode');

    _renderDialogueNode(tree.root);
  }

  /**
   * Render a specific dialogue node into the tooltip latest area.
   */
  function _renderDialogueNode(nodeId) {
    if (!_dialogueTree || !_dialogueTree.nodes) return;
    var node = _dialogueTree.nodes[nodeId];
    if (!node) { clearDialogue(); return; }

    _dialogueNodeId = nodeId;
    var npc = _dialogueNpc || {};
    var speaker = (npc.emoji || '') + ' ' + (npc.name || '');

    // Build HTML
    var html = '<div class="sb-dialogue-entry" data-npc="' + _escHtml(npc.id || '') + '">';
    html += '<span class="sb-dialogue-speaker">' + _escHtml(speaker.trim()) + '</span>';
    html += '<span class="sb-dialogue-text">' + _escHtml(node.text || '') + '</span>';

    if (node.choices && node.choices.length > 0) {
      html += '<span class="sb-dialogue-choices">';
      for (var i = 0; i < node.choices.length; i++) {
        var c = node.choices[i];
        var visitedCls = c.visited ? ' sb-dialogue-choice-visited' : '';
        html += '<span class="sb-dialogue-choice' + visitedCls + '" data-choice-idx="' + i + '">' +
                '[' + _escHtml(c.label || c.text || 'Continue') + ']</span>';
      }
      html += '</span>';
    }
    html += '</div>';

    // Render into latest area (CSS class sb-dialogue-mode handles wrapping)
    // Preserve LOG button reference before replacing innerHTML
    if (_tooltipLatest) {
      var logBtn = _tooltipLatest.querySelector('.sb-expand-hint');
      _tooltipLatest.innerHTML = html;
      // Re-append LOG button so expand still works
      if (logBtn) _tooltipLatest.appendChild(logBtn);
    }

    // Also log to history as plain text
    var histText = speaker.trim() + ': \u201c' + (node.text || '') + '\u201d';
    _history.unshift({ text: histText, time: _timestamp(), category: 'dialogue' });
    if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;
    _rebuildHistory();
    _rebuildPreview();

    // Wire click handlers (delegation)
    if (_tooltipLatest) {
      // Remove old listener, add fresh one
      _tooltipLatest.onclick = function (e) {
        var choiceEl = e.target.closest('.sb-dialogue-choice');
        if (!choiceEl) return;
        e.stopPropagation();
        var idx = parseInt(choiceEl.getAttribute('data-choice-idx'), 10);
        if (!isNaN(idx)) _onDialogueChoice(idx);
      };
    }

    // Auto-scroll history to top so latest exchange is visible
    if (_tooltipHistory) _tooltipHistory.scrollTop = 0;
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

    // Apply effects (same as DialogBox)
    if (choice.effect) {
      if (choice.effect.currency && typeof Player !== 'undefined') {
        Player.addCurrency(choice.effect.currency);
        if (typeof HUD !== 'undefined') HUD.updatePlayer(Player.state());
      }
      if (choice.effect.heal && typeof Player !== 'undefined') {
        var ps = Player.state();
        ps.hp = Math.min(ps.maxHp, ps.hp + choice.effect.heal);
        if (typeof HUD !== 'undefined') HUD.updatePlayer(ps);
      }
      if (choice.effect.setFlag && typeof Player !== 'undefined') {
        Player.state().flags[choice.effect.setFlag] = true;
      }
      if (choice.effect.giveItem && typeof Player !== 'undefined' && Player.addToBag) {
        Player.addToBag(choice.effect.giveItem);
      }
    }

    // Log choice to history
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
    _dialogueActive = false;
    _dialogueTree   = null;
    _dialogueNpc    = null;
    _dialogueNodeId = null;
    _dialogueNpcPos = null;
    _activePriority = PRIORITY.NORMAL;

    if (_tooltipLatest) {
      _tooltipLatest.classList.remove('sb-dialogue-mode');
      _tooltipLatest.onclick = null;
      // Restore: text + LOG button
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

    // Schedule auto-collapse — tooltip minimizes after dialogue ends
    if (_tooltipExpanded) {
      if (_autoCollapseId) clearTimeout(_autoCollapseId);
      _autoCollapseId = setTimeout(function () {
        _setExpanded(false);
      }, AUTO_COLLAPSE_MS);
    }
  }

  /** Check if dialogue is currently active (blocks movement). */
  function isDialogueActive() { return _dialogueActive; }

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

  /** Helper: current timestamp string. */
  function _timestamp() {
    var now = new Date();
    return ('0' + now.getMinutes()).slice(-2) + ':' + ('0' + now.getSeconds()).slice(-2);
  }

  /** Rebuild history HTML (shared by pushTooltip and dialogue).
   *  Renders oldest at top, newest at bottom (closest to the current row).
   *  History array is newest-first (via unshift), so iterate in reverse. */
  function _rebuildHistory() {
    if (!_tooltipHistory) return;
    var html = '';
    var end = _dialogueActive ? 0 : 1; // Skip index 0 unless in dialogue (latest row shows it)
    for (var i = _history.length - 1; i >= end; i--) {
      var h = _history[i];
      var catClass = 'sb-tt-cat-' + (h.category || 'info');
      html += '<div class="sb-tooltip-entry">' +
              '<span class="sb-tt-cat ' + catClass + '"></span>' +
              '<span class="sb-tt-time">' + h.time + '</span>' +
              '<span class="sb-tt-text">' + _escHtml(h.text) + '</span>' +
              '</div>';
    }
    _tooltipHistory.innerHTML = html;
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
    init:              init,
    show:              show,
    hide:              hide,
    updateFloor:       updateFloor,
    updateHeading:     updateHeading,
    updateBag:         updateBag,
    updateDeck:        updateDeck,
    setCombat:         setCombat,
    refresh:           refresh,
    pushTooltip:       pushTooltip,
    pushDialogue:      pushDialogue,
    clearDialogue:     clearDialogue,
    isDialogueActive:  isDialogueActive,
    checkWalkAway:     checkWalkAway,
    setOnFlee: function (fn) { _onFleeCallback = fn; }
  };
})();
