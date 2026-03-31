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
  var _floorEl    = null;
  var _biomeEl    = null;
  var _headingEl  = null;
  var _visible    = false;

  // Tooltip footer
  var _tooltipArea    = null;  // #sb-tooltip-area
  var _tooltipLatest  = null;  // #sb-tooltip-latest
  var _tooltipHistory = null;  // #sb-tooltip-history
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

  // ── Init ────────────────────────────────────────────────────────

  function init() {
    _el         = document.getElementById('status-bar');
    _btnDebrief = document.getElementById('sb-debrief');
    _btnMap     = document.getElementById('sb-map');
    _btnBag     = document.getElementById('sb-bag');
    _floorEl    = document.getElementById('sb-floor');
    _biomeEl    = document.getElementById('sb-biome');
    _headingEl  = document.getElementById('sb-heading');

    // Tooltip footer
    _tooltipArea    = document.getElementById('sb-tooltip-area');
    _tooltipLatest  = document.getElementById('sb-tooltip-latest');
    _tooltipHistory = document.getElementById('sb-tooltip-history');

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
        if (typeof Minimap !== 'undefined') {
          Minimap.toggle();
          _updateMapBtn();
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
            // Signal game.js to open on inventory face
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
    _btnBag.textContent = 'BAG ' + count + '/' + max;

    // Pulse when >75% full
    var full = count / max;
    if (full > 0.75) {
      _btnBag.classList.add('sb-active');
    } else {
      _btnBag.classList.remove('sb-active');
    }
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
      // Swap [MAP] → [FLEE] label during combat
      if (_btnMap) _btnMap.textContent = 'FLEE';
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
      // Restore normal labels
      if (_btnMap) _btnMap.textContent = 'MAP';
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

    // Update latest line
    if (_tooltipLatest) {
      _tooltipLatest.textContent = text;
    }

    _rebuildHistory();

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
    if (_tooltipLatest) {
      _tooltipLatest.innerHTML = html;
    }

    // Also log to history as plain text
    var histText = speaker.trim() + ': \u201c' + (node.text || '') + '\u201d';
    _history.unshift({ text: histText, time: _timestamp(), category: 'dialogue' });
    if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;
    _rebuildHistory();

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
      _tooltipLatest.innerHTML = '';
      _tooltipLatest.textContent = _history.length > 0 ? _history[0].text : 'Ready.';
      _tooltipLatest.classList.remove('sb-dialogue-mode');
      _tooltipLatest.onclick = null;
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

  /** Rebuild history HTML (shared by pushTooltip and dialogue). */
  function _rebuildHistory() {
    if (!_tooltipHistory) return;
    var html = '';
    var start = _dialogueActive ? 0 : 1; // Skip first entry unless in dialogue (latest shows it)
    for (var i = start; i < _history.length; i++) {
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

  // ── Refresh (called per frame or on state change) ───────────────

  function refresh() {
    if (!_visible) return;
    _updateMapBtn();
    updateBag();
    // Heading from Player direction
    if (typeof Player !== 'undefined' && Player.getDir) {
      updateHeading(Player.getDir());
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
    setCombat:         setCombat,
    refresh:           refresh,
    pushTooltip:       pushTooltip,
    pushDialogue:      pushDialogue,
    clearDialogue:     clearDialogue,
    isDialogueActive:  isDialogueActive,
    checkWalkAway:     checkWalkAway
  };
})();
