/**
 * DialogBox — canvas-rendered text box for narrative, NPC dialog, and lore.
 *
 * Two modes:
 *   1. Simple — show(text, opts) for signs, pickups, item descriptions
 *   2. Conversation — startConversation(npc, tree) for Morrowind-style
 *      branching NPC dialog with clickable choices
 *
 * Adapted from:
 *   - dcexjam2025 dialog_system.ts: dialogPush(), char-by-char reveal,
 *     transient vs modal, button responses, dialogMoveLocked()
 *   - EyesOnly dialogue-system.js: branching dialogue trees, choice
 *     selection, visited node tracking, priority system
 *   - EyesOnly TOOLTIP_SPACE_CANON.md: layout specs, speaker styling,
 *     choice rendering with [brackets]
 *
 * Canvas-rendered (not DOM) — composites on the raycaster canvas during
 * the render pipeline, after walls/sprites but before HUD overlays.
 *
 * Layer 2 (after HUD, before MenuBox)
 * Depends on: i18n, InputManager, UISprites (optional for panel sprite)
 */
var DialogBox = (function () {
  'use strict';

  // ── Timing ────────────────────────────────────────────────────
  var MS_PER_CHAR       = 18;    // Typewriter speed (ms per character)
  var MS_PER_CHAR_FAST  = 4;     // Fast-forward speed
  var TRANSIENT_FADE    = 1500;  // ms before transient dialog fades
  var TRANSIENT_LONG    = 4000;  // ms for transient_long
  var FADE_DURATION     = 300;   // ms fade-out
  var CHOICE_DEBOUNCE   = 200;   // ms before choices become clickable

  // ── Layout ────────────────────────────────────────────────────
  var BOX_PAD     = 16;     // Inner padding
  var BOX_MARGIN  = 24;     // Margin from viewport edges
  var BOX_RADIUS  = 8;      // Corner radius
  var NAME_H      = 20;     // Name label height
  var NAME_PAD    = 8;      // Name box horizontal padding
  var LINE_H      = 18;     // Line height for body text
  var CHOICE_H    = 24;     // Choice row height (tap target)
  var CHOICE_GAP  = 4;      // Gap between choices
  var PORTRAIT_SIZE = 48;   // Portrait frame (emoji or sprite)

  // ── Colors ────────────────────────────────────────────────────
  var COL = {
    bg:           'rgba(8,6,14,0.88)',
    border:       'rgba(160,140,100,0.5)',
    nameBg:       'rgba(20,18,28,0.92)',
    nameBorder:   'rgba(200,180,120,0.6)',
    nameText:     '#f0d070',
    text:         '#d8d0c0',
    textDim:      'rgba(216,208,192,0.5)',
    choice:       '#6c6',
    choiceHover:  '#afa',
    choiceVisited:'#585',
    choiceBracket:'#484',
    continueHint: 'rgba(255,255,255,0.35)',
    portrait:     '#fff'
  };

  // ── Priority system (EyesOnly pattern) ────────────────────────
  var PRIORITY = {
    NORMAL:     1,   // signs, pickups, item descriptions
    PERSISTENT: 2,   // quest updates, status messages
    DIALOGUE:   3    // NPC conversation — blocks all lower
  };

  // ── Button layout ──────────────────────────────────────────────
  var BTN_H       = 26;     // Button height (tap target)
  var BTN_PAD     = 12;     // Horizontal padding inside button
  var BTN_GAP     = 8;      // Gap between buttons
  var BTN_RADIUS  = 4;      // Corner radius

  // ── State ─────────────────────────────────────────────────────
  var _active   = null;    // Current DialogParam or null
  var _state    = null;    // DialogState or null
  var _canvas   = null;    // Game canvas reference
  var _queue    = [];      // Queued dialogs (show while one is active)
  var _buttonHitRects = []; // Per-button hit rects: { x, y, w, h, idx }

  // ── Dialog parameter format ───────────────────────────────────
  // {
  //   text:       string,           // Body text (supports \n for newlines)
  //   speaker:    string|null,      // Speaker name (renders in name box)
  //   portrait:   string|null,      // Emoji or sprite key for portrait
  //   pages:      string[]|null,    // Multi-page text (overrides text)
  //   choices:    [{ label, next, effect, visited }]|null,
  //   buttons:    [{ label, cb }]|null,       // Modal button row
  //   transient:  boolean,          // Auto-dismiss on move or timeout
  //   transientLong: boolean,       // Longer transient timeout
  //   instant:    boolean,          // Skip typewriter, show immediately
  //   priority:   number,           // PRIORITY level
  //   onClose:    function|null,    // Callback when dialog fully closes
  //   onChoice:   function|null,    // fn(choiceIdx) for conversation
  // }

  // ── Internal state object ─────────────────────────────────────
  function _createState() {
    return {
      charCount:    0,      // Characters revealed so far
      timer:        0,      // ms accumulator for typewriter
      fadeTimer:    0,      // ms into fade-out (0 = not fading)
      fading:       false,
      pageIndex:    0,      // Current page (for multi-page)
      choiceReady:  false,  // True after CHOICE_DEBOUNCE
      choiceTimer:  0,      // ms since choices appeared
      hoverChoice:  -1,     // Pointer-hovered choice index
      focusBtn:     0,      // Keyboard-focused button index (←/→ to move)
      fastForward:  false,  // Player holding advance key
      scrollLine:   0,      // Top visible line when body overflows maxBodyH
      maxScrollLine:0       // Computed each frame from wrapped line count
    };
  }

  // ── Init ──────────────────────────────────────────────────────

  function init(canvas) {
    _canvas = canvas;
  }

  // ── Show (simple mode) ────────────────────────────────────────

  /**
   * Show a dialog box.
   *
   * @param {Object} param - Dialog parameters
   * @param {string} param.text - Body text
   * @param {string} [param.speaker] - Speaker name
   * @param {string} [param.portrait] - Emoji for portrait slot
   * @param {string[]} [param.pages] - Multi-page text array
   * @param {Array} [param.choices] - Morrowind-style choices
   * @param {Array} [param.buttons] - Modal button row
   * @param {boolean} [param.transient] - Auto-dismiss
   * @param {boolean} [param.transientLong] - Longer auto-dismiss
   * @param {boolean} [param.instant] - Skip typewriter
   * @param {number} [param.priority] - Priority level
   * @param {Function} [param.onClose] - Close callback
   * @param {Function} [param.onChoice] - Choice callback fn(idx)
   */
  function show(param) {
    if (typeof param === 'string') {
      param = { text: param };
    }

    param.priority = param.priority || PRIORITY.NORMAL;

    // Priority gate — don't overwrite higher-priority dialog
    if (_active && _active.priority > param.priority) {
      // Queue it for after current closes
      _queue.push(param);
      return;
    }

    _active = param;
    _state = _createState();

    // Instant mode — reveal all text immediately
    if (param.instant) {
      _state.charCount = _getCurrentText().length;
    }

    console.log('[DialogBox] Show: ' + (param.speaker || '') + ' — ' +
                _getCurrentText().substring(0, 40) + '...');
  }

  /**
   * Start a Morrowind-style branching conversation.
   *
   * @param {Object} npc - { name, emoji, dialogueTree }
   * @param {Object} tree - { root: string, nodes: { [id]: { text, choices } } }
   */
  function startConversation(npc, tree) {
    if (!tree || !tree.nodes || !tree.root) {
      console.warn('[DialogBox] Invalid dialogue tree for ' + (npc.name || 'unknown'));
      return;
    }

    var node = tree.nodes[tree.root];
    if (!node) {
      console.warn('[DialogBox] Root node "' + tree.root + '" not found');
      return;
    }

    // Store tree reference on the param for navigation
    show({
      text: node.text,
      speaker: npc.name || '',
      portrait: npc.emoji || null,
      choices: node.choices || null,
      priority: PRIORITY.DIALOGUE,
      _tree: tree,
      _nodeId: tree.root,
      _npc: npc,
      onChoice: function (idx) {
        _navigateChoice(idx);
      }
    });
  }

  /**
   * Navigate to a choice's target node in the active dialogue tree.
   */
  function _navigateChoice(idx) {
    if (!_active || !_active.choices || !_active._tree) return;

    var choice = _active.choices[idx];
    if (!choice) return;

    // Mark visited
    choice.visited = true;

    // Apply effects
    if (choice.effect) {
      _applyEffect(choice.effect);
    }

    // null next = end conversation
    if (!choice.next) {
      close();
      return;
    }

    var tree = _active._tree;
    var nextNode = tree.nodes[choice.next];
    if (!nextNode) {
      console.warn('[DialogBox] Node "' + choice.next + '" not found in tree');
      close();
      return;
    }

    // Navigate to next node (preserve tree/npc context)
    var npc = _active._npc;
    _active.text = nextNode.text;
    _active.choices = nextNode.choices || null;
    _active._nodeId = choice.next;
    _state = _createState(); // Reset typewriter
  }

  /**
   * Apply a choice effect.
   */
  function _applyEffect(effect) {
    if (!effect) return;
    if (effect.currency && typeof CardAuthority !== 'undefined') {
      CardAuthority.addGold(effect.currency);
    }
    if (effect.heal && typeof Player !== 'undefined') {
      var ps = Player.state();
      ps.hp = Math.min(ps.maxHp, ps.hp + effect.heal);
    }
    if (effect.setFlag && typeof Player !== 'undefined') {
      Player.setFlag(effect.setFlag, true);
    }
    if (effect.callback && typeof effect.callback === 'function') {
      try { effect.callback(); } catch (e) {
        console.error('[DialogBox] Effect callback error:', e);
      }
    }
  }

  // ── Close / Advance ───────────────────────────────────────────

  function close() {
    var onClose = _active ? _active.onClose : null;
    _active = null;
    _state = null;

    if (onClose) {
      try { onClose(); } catch (e) {
        console.error('[DialogBox] onClose error:', e);
      }
    }

    // Dequeue next dialog if any
    if (_queue.length > 0) {
      show(_queue.shift());
    }
  }

  /**
   * Advance the dialog: finish typewriter, go to next page, or close.
   */
  function advance() {
    if (!_active || !_state) return;

    var fullText = _getCurrentText();

    // If typewriter hasn't finished, fast-forward to full text
    if (_state.charCount < fullText.length) {
      _state.charCount = fullText.length;
      return;
    }

    // If multi-page and not on last page, go to next page
    if (_active.pages && _state.pageIndex < _active.pages.length - 1) {
      _state.pageIndex++;
      _state.charCount = 0;
      _state.timer = 0;
      return;
    }

    // If choices are present, don't auto-close (player must click a choice)
    if (_active.choices && _active.choices.length > 0) {
      return;
    }

    // If buttons are present, fire the keyboard-focused button
    if (_active.buttons && _active.buttons.length > 0) {
      var idx = Math.max(0, Math.min(_state.focusBtn, _active.buttons.length - 1));
      var btn = _active.buttons[idx];
      if (btn && typeof btn.cb === 'function') btn.cb();
      close();
      return;
    }

    // Close
    close();
  }

  // ── Accessors ─────────────────────────────────────────────────

  function isOpen() { return _active !== null; }

  function isModal() {
    return _active !== null && !_active.transient;
  }

  /** Returns true if the dialog blocks player movement. */
  function moveLocked() {
    return _active !== null && !_active.transient;
  }

  /**
   * Get the active NPC's entity ID (for speech capsule attachment).
   * Returns null if no NPC dialogue is active.
   * @returns {string|number|null}
   */
  function getActiveSpeakerId() {
    if (!_active || !_active._npc) return null;
    return _active._npc.id || null;
  }

  function _getCurrentText() {
    if (!_active) return '';
    if (_active.pages && _active.pages.length > 0) {
      return _active.pages[_state.pageIndex] || '';
    }
    return _active.text || '';
  }

  // ── Update (called each frame) ────────────────────────────────

  function update(dt) {
    if (!_active || !_state) return;

    // Typewriter advance
    var fullText = _getCurrentText();
    if (_state.charCount < fullText.length) {
      var speed = _state.fastForward ? MS_PER_CHAR_FAST : MS_PER_CHAR;
      _state.timer += dt;
      while (_state.timer >= speed && _state.charCount < fullText.length) {
        _state.timer -= speed;
        _state.charCount++;
      }
    }

    // Choice debounce
    if (_active.choices && _state.charCount >= fullText.length) {
      _state.choiceTimer += dt;
      if (_state.choiceTimer >= CHOICE_DEBOUNCE) {
        _state.choiceReady = true;
      }
    }

    // Transient fade
    if (_active.transient && _state.charCount >= fullText.length) {
      var fadeStart = _active.transientLong ? TRANSIENT_LONG : TRANSIENT_FADE;
      _state.fadeTimer += dt;
      if (_state.fadeTimer >= fadeStart + FADE_DURATION) {
        close();
        return;
      }
    }

    // Fast-forward detection (Space/Enter held)
    _state.fastForward = false;
    if (typeof InputManager !== 'undefined') {
      if (InputManager.isDown('interact') || InputManager.isDown('pause')) {
        _state.fastForward = true;
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────

  /**
   * Render the dialog box on the canvas.
   * Called from Game._render() after world rendering.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW - Viewport width
   * @param {number} vpH - Viewport height
   */
  function render(ctx, vpW, vpH) {
    if (!_active || !_state) return;

    var fullText = _getCurrentText();
    var revealedText = fullText.substring(0, _state.charCount);

    // Compute fade alpha
    var alpha = 1;
    if (_active.transient) {
      var fadeStart = _active.transientLong ? TRANSIENT_LONG : TRANSIENT_FADE;
      if (_state.fadeTimer > fadeStart) {
        alpha = 1 - (_state.fadeTimer - fadeStart) / FADE_DURATION;
        alpha = Math.max(0, Math.min(1, alpha));
      }
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // ── Box dimensions ──
    var boxW = Math.min(vpW - BOX_MARGIN * 2, 520);
    var boxX = (vpW - boxW) / 2;

    // Measure text height
    ctx.font = '13px monospace';
    var lines = _wrapText(ctx, revealedText, boxW - BOX_PAD * 2 - (_active.portrait ? PORTRAIT_SIZE + 12 : 0));
    var fullTextLines = lines; // may be sliced below if scrolling

    // Choices height
    var choicesH = 0;
    if (_active.choices && _state.charCount >= fullText.length) {
      choicesH = _active.choices.length * (CHOICE_H + CHOICE_GAP) + 8;
    }

    // Buttons height
    var buttonsH = 0;
    if (_active.buttons && _state.charCount >= fullText.length) {
      buttonsH = 32;
    }

    // Continue hint height
    var hintH = 0;
    if (!_active.choices && !_active.buttons && _state.charCount >= fullText.length) {
      hintH = 20;
    }

    // ── Clamp body height to the viewport so long content (e.g. books
    //    with many lines per page) no longer overflows off-screen. Compute
    //    the maximum boxH that still fits above the card tray + status bar,
    //    then derive how many wrapped lines are visible and slice.
    var _sbEl = document.getElementById('status-bar');
    var _sbH  = (_sbEl && _sbEl.offsetHeight) ? _sbEl.offsetHeight : 0;
    var maxBoxH = vpH - BOX_MARGIN - NAME_H - BOX_MARGIN - 72 - _sbH;
    if (maxBoxH < 120) maxBoxH = 120;
    var maxBodyH = maxBoxH - BOX_PAD * 2 - choicesH - buttonsH - hintH;
    if (maxBodyH < LINE_H) maxBodyH = LINE_H;
    var maxVisibleLines = Math.max(1, Math.floor(maxBodyH / LINE_H));
    var overflow = fullTextLines.length > maxVisibleLines;
    var maxScrollLine = overflow ? (fullTextLines.length - maxVisibleLines) : 0;
    _state.maxScrollLine = maxScrollLine;
    if (_state.scrollLine > maxScrollLine) _state.scrollLine = maxScrollLine;
    if (_state.scrollLine < 0) _state.scrollLine = 0;
    var visibleLines = overflow
      ? fullTextLines.slice(_state.scrollLine, _state.scrollLine + maxVisibleLines)
      : fullTextLines;
    var textH = visibleLines.length * LINE_H;

    var boxH = BOX_PAD * 2 + textH + choicesH + buttonsH + hintH;
    // Lift box above the status-bar DOM overlay (which renders at z-index:12
    // over the canvas). When the bar is visible its offsetHeight clears the
    // canvas-drawn box from being covered by the opaque paper background.
    var boxY  = vpH - boxH - BOX_MARGIN - 72 - _sbH; // Above card tray + status bar

    // ── Name box (above main box) ──
    if (_active.speaker) {
      _renderNameBox(ctx, boxX, boxY, _active.speaker, _active.portrait);
    }

    // ── Main box background ──
    _roundRect(ctx, boxX, boxY, boxW, boxH, BOX_RADIUS);
    ctx.fillStyle = COL.bg;
    ctx.fill();
    ctx.strokeStyle = COL.border;
    ctx.lineWidth = 1.5;
    _roundRect(ctx, boxX, boxY, boxW, boxH, BOX_RADIUS);
    ctx.stroke();

    // ── Portrait ──
    var textX = boxX + BOX_PAD;
    var textW = boxW - BOX_PAD * 2;

    if (_active.portrait) {
      var portraitX = boxX + BOX_PAD;
      var portraitY = boxY + BOX_PAD;

      // Portrait frame
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(portraitX, portraitY, PORTRAIT_SIZE, PORTRAIT_SIZE);
      ctx.strokeStyle = COL.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(portraitX, portraitY, PORTRAIT_SIZE, PORTRAIT_SIZE);

      // Emoji portrait
      ctx.font = Math.floor(PORTRAIT_SIZE * 0.7) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COL.portrait;
      ctx.fillText(_active.portrait, portraitX + PORTRAIT_SIZE / 2, portraitY + PORTRAIT_SIZE / 2);

      textX = portraitX + PORTRAIT_SIZE + 12;
      textW = boxW - BOX_PAD - (PORTRAIT_SIZE + 12) - BOX_PAD;
    }

    // ── Body text (typewriter revealed) ──
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COL.text;

    var textY = boxY + BOX_PAD;
    for (var i = 0; i < visibleLines.length; i++) {
      ctx.fillText(visibleLines[i], textX, textY + i * LINE_H);
    }

    // ── Scrollbar (when wrapped body overflows the box) ──
    if (overflow) {
      var sbBarX = boxX + boxW - BOX_PAD + 4;
      var sbBarY = textY;
      var sbBarW = 4;
      var sbBarH = visibleLines.length * LINE_H;
      // Track
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(sbBarX, sbBarY, sbBarW, sbBarH);
      // Thumb — proportional to visible / total
      var thumbFrac = maxVisibleLines / fullTextLines.length;
      var thumbH    = Math.max(18, sbBarH * thumbFrac);
      var thumbY    = sbBarY + (sbBarH - thumbH) *
                      (maxScrollLine > 0 ? (_state.scrollLine / maxScrollLine) : 0);
      ctx.fillStyle = 'rgba(240,208,112,0.55)';
      ctx.fillRect(sbBarX, thumbY, sbBarW, thumbH);
      // Top/bottom indicators (▲ ▼) when more content exists in that direction
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (_state.scrollLine > 0) {
        ctx.fillStyle = 'rgba(240,208,112,0.8)';
        ctx.fillText('\u25B2', sbBarX + sbBarW / 2, sbBarY + 2);
      }
      if (_state.scrollLine < maxScrollLine) {
        ctx.fillStyle = 'rgba(240,208,112,0.8)';
        ctx.fillText('\u25BC', sbBarX + sbBarW / 2, sbBarY + sbBarH - 2);
      }
    }

    // ── Page indicator (multi-page) ──
    if (_active.pages && _active.pages.length > 1) {
      ctx.fillStyle = COL.continueHint;
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        (_state.pageIndex + 1) + '/' + _active.pages.length,
        boxX + boxW - BOX_PAD, boxY + BOX_PAD
      );
    }

    // ── Choices (Morrowind-style) ──
    if (_active.choices && _state.choiceReady) {
      var choiceY = textY + textH + 8;
      var choiceX = textX;

      // Check pointer position for hover
      _state.hoverChoice = -1;
      var ptr = (typeof InputManager !== 'undefined') ? InputManager.getPointer() : null;

      for (var c = 0; c < _active.choices.length; c++) {
        var ch = _active.choices[c];
        var cy = choiceY + c * (CHOICE_H + CHOICE_GAP);

        // Hit test for hover
        if (ptr && ptr.active &&
            ptr.x >= choiceX && ptr.x <= choiceX + textW &&
            ptr.y >= cy && ptr.y <= cy + CHOICE_H) {
          _state.hoverChoice = c;
        }

        var isHover = (_state.hoverChoice === c);
        var isVisited = ch.visited;

        // Choice background on hover
        if (isHover) {
          ctx.fillStyle = 'rgba(100,200,100,0.1)';
          _roundRect(ctx, choiceX - 4, cy, textW + 8, CHOICE_H, 3);
          ctx.fill();
        }

        // Choice text with brackets
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = isHover ? COL.choiceHover :
                        isVisited ? COL.choiceVisited : COL.choice;
        ctx.fillText('[' + ch.label + ']', choiceX, cy + CHOICE_H / 2 + 4);
      }
    }

    // ── Buttons (modal response row) ──
    _buttonHitRects = [];
    if (_active.buttons && _state.charCount >= fullText.length) {
      var btnY = textY + textH + choicesH + 4;
      var ptr2 = (typeof InputManager !== 'undefined') ? InputManager.getPointer() : null;

      // Measure all button widths first (for centering)
      ctx.font = 'bold 11px monospace';
      var btnWidths = [];
      var totalBtnW = 0;
      for (var bi = 0; bi < _active.buttons.length; bi++) {
        var bw = ctx.measureText(_active.buttons[bi].label).width + BTN_PAD * 2;
        btnWidths.push(bw);
        totalBtnW += bw;
      }
      totalBtnW += (_active.buttons.length - 1) * BTN_GAP;
      var btnStartX = boxX + (boxW - totalBtnW) / 2;

      for (var bj = 0; bj < _active.buttons.length; bj++) {
        var bx = btnStartX;
        for (var bk = 0; bk < bj; bk++) bx += btnWidths[bk] + BTN_GAP;
        var bw2 = btnWidths[bj];

        // Hover detection (pointer takes priority over keyboard focus)
        var btnHover = (ptr2 && ptr2.active &&
          ptr2.x >= bx && ptr2.x <= bx + bw2 &&
          ptr2.y >= btnY && ptr2.y <= btnY + BTN_H);
        var btnFocus = (!btnHover && bj === _state.focusBtn);
        var btnLit = btnHover || btnFocus;

        // Button background
        _roundRect(ctx, bx, btnY, bw2, BTN_H, BTN_RADIUS);
        ctx.fillStyle = btnHover ? 'rgba(100,200,120,0.2)' :
                        btnFocus ? 'rgba(240,208,112,0.15)' : 'rgba(60,55,40,0.4)';
        ctx.fill();
        ctx.strokeStyle = btnHover ? 'rgba(100,200,120,0.7)' :
                          btnFocus ? 'rgba(240,208,112,0.6)' : 'rgba(160,140,100,0.4)';
        ctx.lineWidth = btnLit ? 1.5 : 1;
        _roundRect(ctx, bx, btnY, bw2, BTN_H, BTN_RADIUS);
        ctx.stroke();

        // Focus caret (keyboard indicator)
        if (btnFocus) {
          ctx.fillStyle = '#f0d070';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('\u25B6', bx + 6, btnY + BTN_H / 2 + 1);
        }

        // Button label
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = btnHover ? '#afa' : btnFocus ? '#f0d070' : '#d8d0c0';
        ctx.fillText(_active.buttons[bj].label, bx + bw2 / 2, btnY + BTN_H / 2);

        // Store hit rect
        _buttonHitRects.push({ x: bx, y: btnY, w: bw2, h: BTN_H, idx: bj });
      }
    }

    // ── Continue hint ──
    if (!_active.choices && !_active.buttons &&
        _state.charCount >= fullText.length && !_active.transient) {
      var hintY = boxY + boxH - 16;
      ctx.fillStyle = COL.continueHint;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';

      // Blinking prompt
      var blink = Math.floor(Date.now() / 500) % 2 === 0;
      if (blink) {
        ctx.fillText(
          i18n.t('dialog.continue', '[ Enter / Click to continue ]'),
          boxX + boxW / 2, hintY
        );
      }
    }

    ctx.restore();
  }

  // ── Name box ──────────────────────────────────────────────────

  function _renderNameBox(ctx, boxX, boxY, speaker, portrait) {
    var nameText = (portrait ? portrait + ' ' : '') + speaker;
    ctx.font = 'bold 12px monospace';
    var nameW = ctx.measureText(nameText).width + NAME_PAD * 2;

    var nx = boxX + 12;
    var ny = boxY - NAME_H + 4;

    // Name box background
    _roundRect(ctx, nx, ny, nameW, NAME_H, 4);
    ctx.fillStyle = COL.nameBg;
    ctx.fill();
    ctx.strokeStyle = COL.nameBorder;
    ctx.lineWidth = 1;
    _roundRect(ctx, nx, ny, nameW, NAME_H, 4);
    ctx.stroke();

    // Name text
    ctx.fillStyle = COL.nameText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(nameText, nx + NAME_PAD, ny + NAME_H / 2);
  }

  // ── Pointer click handling ────────────────────────────────────

  /**
   * Handle a pointer click on the dialog box.
   * Returns true if the click was consumed.
   */
  function handlePointerClick() {
    if (!_active || !_state) return false;

    // Choice click
    if (_active.choices && _state.choiceReady && _state.hoverChoice >= 0) {
      var idx = _state.hoverChoice;
      if (_active.onChoice) {
        _active.onChoice(idx);
      }
      return true;
    }

    // Button click — hit-test individual buttons via stored rects
    if (_active.buttons && _state.charCount >= _getCurrentText().length) {
      var ptr = (typeof InputManager !== 'undefined') ? InputManager.getPointer() : null;
      if (ptr && ptr.active && _buttonHitRects.length > 0) {
        for (var bi = 0; bi < _buttonHitRects.length; bi++) {
          var hr = _buttonHitRects[bi];
          if (ptr.x >= hr.x && ptr.x <= hr.x + hr.w &&
              ptr.y >= hr.y && ptr.y <= hr.y + hr.h) {
            var btn = _active.buttons[hr.idx];
            if (btn && typeof btn.cb === 'function') btn.cb();
            close();
            return true;
          }
        }
        // Click was outside all buttons — ignore (don't auto-dismiss)
        return true;
      }
      // Fallback: no pointer data (keyboard Enter) — fire first button
      var btn0 = _active.buttons[0];
      if (btn0 && typeof btn0.cb === 'function') btn0.cb();
      close();
      return true;
    }

    // General click — advance
    advance();
    return true;
  }

  // ── Keyboard navigation for buttons ────────────────────────────

  /**
   * Handle directional key input for button focus cycling.
   * Returns true if the key was consumed.
   * @param {string} key - 'left', 'right', 'up', 'down'
   */
  function handleKey(key) {
    if (!_active || !_state) return false;

    // Button focus cycling (←/→)
    if (_active.buttons && _active.buttons.length > 1 &&
        _state.charCount >= _getCurrentText().length) {
      if (key === 'left' || key === 'up') {
        _state.focusBtn = (_state.focusBtn - 1 + _active.buttons.length) % _active.buttons.length;
        return true;
      }
      if (key === 'right' || key === 'down') {
        _state.focusBtn = (_state.focusBtn + 1) % _active.buttons.length;
        return true;
      }
    }
    return false;
  }

  // ── Text wrapping ─────────────────────────────────────────────

  function _wrapText(ctx, text, maxW) {
    if (!text) return [''];
    var paragraphs = text.split('\n');
    var lines = [];

    for (var p = 0; p < paragraphs.length; p++) {
      var words = paragraphs[p].split(' ');
      var line = '';

      for (var w = 0; w < words.length; w++) {
        var test = line ? (line + ' ' + words[w]) : words[w];
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line);
          line = words[w];
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
    }

    return lines.length ? lines : [''];
  }

  // ── Helpers ───────────────────────────────────────────────────

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Scroll (body overflow navigation) ─────────────────────────

  /**
   * Scroll the body text by `delta` wrapped lines. Positive = down.
   * No-op if the dialog is not currently overflowing.
   * @param {number} delta - Lines to scroll (e.g. -1, +1, -5 for page up)
   * @returns {boolean} true if the dialog consumed the scroll
   */
  function scroll(delta) {
    if (!_active || !_state) return false;
    if (!_state.maxScrollLine) return false; // no overflow → let caller handle
    _state.scrollLine = Math.max(0,
      Math.min(_state.maxScrollLine, (_state.scrollLine || 0) + delta));
    return true;
  }

  // ── Interrupt (walk away, combat start) ───────────────────────

  /**
   * Interrupt and close the dialog (e.g. player walks away, combat starts).
   */
  function interrupt() {
    if (_active) {
      console.log('[DialogBox] Interrupted');
      _active = null;
      _state = null;
      _queue = [];
    }
  }

  // ── Public API ────────────────────────────────────────────────

  return {
    init: init,
    show: show,
    startConversation: startConversation,
    advance: advance,
    close: close,
    interrupt: interrupt,
    isOpen: isOpen,
    isModal: isModal,
    moveLocked: moveLocked,
    getActiveSpeakerId: getActiveSpeakerId,
    update: update,
    render: render,
    handlePointerClick: handlePointerClick,
    handleKey: handleKey,
    scroll: scroll,
    PRIORITY: PRIORITY
  };
})();
