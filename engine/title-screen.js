/**
 * TitleScreen — title menu with character creation.
 *
 * Layer 2 (depends on i18n, Player, ScreenManager). Canvas-rendered
 * title screen with a 3-phase character creation flow:
 *
 *   Phase 0 — TITLE    : game title + "New Game" / placeholder options
 *   Phase 1 — CALLSIGN : pick a callsign (name) with left/right cycling
 *   Phase 2 — AVATAR   : pick a class from card grid
 *   Phase 3 — DEPLOYING: brief deploy animation, then gameplay
 *
 * Visual theme: paper + green glow (adapted from flapsandseals.com
 * partner button styling). All elements scaled 70-120% larger than
 * original for geriatric mobile-first readability.
 */
var TitleScreen = (function () {
  'use strict';

  var _canvas = null;
  var _ctx = null;
  var _active = false;
  var _phase = 0;         // 0=title, 1=callsign, 2=avatar, 3=deploying
  var _selected = 0;      // Currently highlighted option index
  var _deployTimer = 0;

  // ── Glow theme colors ─────────────────────────────────────────────
  var GLOW_COLOR       = 'rgb(176,255,189)';
  var GLOW_SPREAD      = 'rgba(123,255,160,0.78)';
  var GLOW_DIM         = 'rgba(123,255,160,0.25)';
  var PAPER_BG         = 'rgba(30,28,24,0.92)';
  var PAPER_CARD       = 'rgba(42,38,32,0.95)';
  var PAPER_CARD_SEL   = 'rgba(24,40,28,0.95)';
  var PAPER_BORDER     = 'rgba(200,180,120,0.4)';
  var PAPER_BORDER_SEL = 'rgba(176,255,189,0.7)';
  var TEXT_WARM         = '#e8dcc8';
  var TEXT_DIM          = '#888070';
  var TEXT_MUTED        = '#5a5548';

  // ── Hover tracking ────────────────────────────────────────────────
  var _mouseX = -1, _mouseY = -1;
  var _hoveredZoneIdx = -1;

  // ── Callsign data ─────────────────────────────────────────────────

  var CALLSIGNS = [
    'ROOK', 'WREN', 'CIPHER', 'DUSK', 'FLINT', 'GHOST',
    'HAZE', 'IRON', 'JINX', 'KNAVE', 'LYNX', 'MOTH',
    'NEON', 'OAK', 'PIKE', 'QUILL', 'RUNE', 'SHADE',
    'THORN', 'VALE', 'WISP', 'ZEN', 'ASH', 'BOLT',
    'CRAG', 'DRIFT', 'EMBER', 'FROST', 'GALE', 'HAWK'
  ];

  var _callsignIndex = 0;
  var _callsign = CALLSIGNS[0];

  // ── Avatar data ───────────────────────────────────────────────────

  var AVATARS = [
    { id: 'AVA-01', emoji: '\uD83D\uDDE1\uFE0F', name: 'Blade',     desc: 'High STR. Hits hard, takes hard.', stat: 'str' },
    { id: 'AVA-02', emoji: '\uD83C\uDFF9', name: 'Ranger',    desc: 'High DEX. Fast and precise.',       stat: 'dex' },
    { id: 'AVA-03', emoji: '\uD83D\uDD75\uFE0F', name: 'Shadow',    desc: 'High Stealth. Unseen advantage.',   stat: 'stealth' },
    { id: 'AVA-04', emoji: '\uD83D\uDEE1\uFE0F', name: 'Sentinel',  desc: 'Balanced. Endures everything.',     stat: 'hp' },
    { id: 'AVA-05', emoji: '\uD83D\uDD2E', name: 'Seer',      desc: 'High Energy. More card plays.',     stat: 'energy' },
    { id: 'AVA-06', emoji: '\uD83C\uDCCF', name: 'Wildcard',  desc: 'Random stats. Chaos run.',          stat: 'random' }
  ];

  var _avatarIndex = 0;

  // ── Title menu options ────────────────────────────────────────────

  var TITLE_OPTIONS = ['new_game', 'placeholder_continue', 'placeholder_settings'];

  // ── Input handling ────────────────────────────────────────────────

  var _keyHandler = null;
  var _clickHandler = null;
  var _moveHandler = null;

  function _bindInput() {
    _keyHandler = function (e) { _onKey(e); };
    _clickHandler = function (e) { _onClick(e); };
    _moveHandler = function (e) { _onMouseMove(e); };
    window.addEventListener('keydown', _keyHandler);
    _canvas.addEventListener('click', _clickHandler);
    _canvas.addEventListener('mousemove', _moveHandler);
  }

  function _unbindInput() {
    if (_keyHandler) window.removeEventListener('keydown', _keyHandler);
    if (_clickHandler) _canvas.removeEventListener('click', _clickHandler);
    if (_moveHandler) _canvas.removeEventListener('mousemove', _moveHandler);
    _keyHandler = null;
    _clickHandler = null;
    _moveHandler = null;
  }

  function _canvasCoords(e) {
    var rect = _canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (_canvas.width / rect.width),
      y: (e.clientY - rect.top) * (_canvas.height / rect.height)
    };
  }

  function _onMouseMove(e) {
    var p = _canvasCoords(e);
    _mouseX = p.x;
    _mouseY = p.y;
    // Update hover index
    _hoveredZoneIdx = -1;
    for (var i = 0; i < _hitZones.length; i++) {
      var z = _hitZones[i];
      if (_mouseX >= z.x && _mouseX <= z.x + z.w && _mouseY >= z.y && _mouseY <= z.y + z.h) {
        _hoveredZoneIdx = i;
        break;
      }
    }
    _canvas.style.cursor = _hoveredZoneIdx >= 0 ? 'pointer' : 'default';
  }

  function _onKey(e) {
    if (_phase === 3) return; // deploying, ignore input

    var key = e.key;

    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      e.preventDefault();
      _navigateUp();
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      e.preventDefault();
      _navigateDown();
    } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      e.preventDefault();
      _navigateLeft();
    } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      e.preventDefault();
      _navigateRight();
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      _confirm();
    } else if (key === 'Escape' || key === 'Backspace') {
      e.preventDefault();
      _back();
    }
  }

  function _onClick(e) {
    if (_phase === 3) return;
    var p = _canvasCoords(e);
    _hitTest(p.x, p.y);
  }

  // ── Navigation ────────────────────────────────────────────────────

  function _navigateUp() {
    if (_phase === 0 && _settingsOpen) {
      _settingsSelected = (_settingsSelected - 1 + _settingsItemCount()) % _settingsItemCount();
    } else if (_phase === 0) {
      _selected = (_selected - 1 + TITLE_OPTIONS.length) % TITLE_OPTIONS.length;
    } else if (_phase === 2) {
      _avatarIndex = (_avatarIndex - 1 + AVATARS.length) % AVATARS.length;
    }
  }

  function _navigateDown() {
    if (_phase === 0 && _settingsOpen) {
      _settingsSelected = (_settingsSelected + 1) % _settingsItemCount();
    } else if (_phase === 0) {
      _selected = (_selected + 1) % TITLE_OPTIONS.length;
    } else if (_phase === 2) {
      _avatarIndex = (_avatarIndex + 1) % AVATARS.length;
    }
  }

  function _navigateLeft() {
    if (_phase === 1) {
      _callsignIndex = (_callsignIndex - 1 + CALLSIGNS.length) % CALLSIGNS.length;
      _callsign = CALLSIGNS[_callsignIndex];
    } else if (_phase === 2) {
      _avatarIndex = (_avatarIndex - 1 + AVATARS.length) % AVATARS.length;
    }
  }

  function _navigateRight() {
    if (_phase === 1) {
      _callsignIndex = (_callsignIndex + 1) % CALLSIGNS.length;
      _callsign = CALLSIGNS[_callsignIndex];
    } else if (_phase === 2) {
      _avatarIndex = (_avatarIndex + 1) % AVATARS.length;
    }
  }

  // ── Settings overlay state ─────────────────────────────────────
  var _settingsOpen = false;
  var _settingsSelected = 0;

  function _settingsItemCount() {
    return SETTINGS_ITEMS.length + 1; // +1 for BACK button
  }

  // ── Confirm ───────────────────────────────────────────────────
  function _confirm() {
    if (_phase === 0) {
      if (_settingsOpen) {
        if (_settingsSelected >= SETTINGS_ITEMS.length) {
          // BACK button selected
          _settingsOpen = false;
          return;
        }
        _toggleSetting(_settingsSelected);
        return;
      }
      if (_selected === 0) {
        _phase = 1;
        _callsignIndex = 0;
        _callsign = CALLSIGNS[0];
      } else if (_selected === 2) {
        _settingsOpen = true;
        _settingsSelected = 0;
      }
    } else if (_phase === 1) {
      _phase = 2;
      _avatarIndex = 0;
    } else if (_phase === 2) {
      _deploy();
    }
  }

  function _back() {
    if (_phase === 0 && _settingsOpen) {
      _settingsOpen = false;
      return;
    }
    if (_phase === 1) {
      _phase = 0;
      _selected = 0;
    } else if (_phase === 2) {
      _phase = 1;
    }
  }

  // ── Hit test (click support) ──────────────────────────────────────

  /** @type {Array<{x:number,y:number,w:number,h:number,action:function,id:string}>} */
  var _hitZones = [];

  function _hitTest(mx, my) {
    for (var i = 0; i < _hitZones.length; i++) {
      var z = _hitZones[i];
      if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-select', { volume: 0.3 });
        z.action();
        return;
      }
    }
  }

  function _isZoneHovered(zoneIndex) {
    if (_hoveredZoneIdx < 0 || zoneIndex !== _hoveredZoneIdx) return false;
    return true;
  }

  // ── Deploy ────────────────────────────────────────────────────────

  function _deploy() {
    _phase = 3;
    _deployTimer = 0;

    var ava = AVATARS[_avatarIndex];
    var p = Player.state();
    p.callsign = _callsign;
    p.avatarId = ava.id;
    p.avatarEmoji = ava.emoji;
    p.avatarName = ava.name;

    switch (ava.stat) {
      case 'str':     p.str += 2; break;
      case 'dex':     p.dex += 2; break;
      case 'stealth': p.stealth += 2; break;
      case 'hp':      p.maxHp += 4; p.hp = p.maxHp; break;
      case 'energy':  p.maxEnergy += 3; p.energy = p.maxEnergy; break;
      case 'random':
        var stats = ['str', 'dex', 'stealth'];
        p[stats[Math.floor(Math.random() * 3)]] += 3;
        p.maxHp += Math.floor(Math.random() * 3);
        p.hp = p.maxHp;
        break;
    }
  }

  // ── Update ────────────────────────────────────────────────────────

  function update(dt) {
    if (!_active) return;

    if (_phase === 3) {
      _deployTimer += dt;
      if (_deployTimer >= 1200) {
        _active = false;
        _unbindInput();
        ScreenManager.toGameplay();
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  function render() {
    if (!_active || !_ctx) return;
    _hitZones = [];

    var w = _canvas.width;
    var h = _canvas.height;

    // Background: Skybox lake scene or plain fallback
    if (typeof Skybox !== 'undefined') {
      Skybox.renderFull(_ctx, w, h, performance.now(), 'title');
    } else {
      _ctx.fillStyle = '#0a0a0a';
      _ctx.fillRect(0, 0, w, h);
    }

    // Subtle paper-toned border accent
    _ctx.strokeStyle = 'rgba(200,180,120,0.2)';
    _ctx.lineWidth = 2;
    _roundRect(_ctx, 16, 16, w - 32, h - 32, 8);
    _ctx.stroke();

    if (_phase === 0) {
      _renderTitle(w, h);
      if (_settingsOpen) _renderSettings(w, h);
    } else if (_phase === 1) {
      _renderCallsign(w, h);
    } else if (_phase === 2) {
      _renderAvatar(w, h);
    } else if (_phase === 3) {
      _renderDeploy(w, h);
    }

    // Update hover after drawing (zones are now populated)
    _hoveredZoneIdx = -1;
    for (var i = 0; i < _hitZones.length; i++) {
      var z = _hitZones[i];
      if (_mouseX >= z.x && _mouseX <= z.x + z.w && _mouseY >= z.y && _mouseY <= z.y + z.h) {
        _hoveredZoneIdx = i;
        break;
      }
    }
  }

  // ── Drawing helpers ───────────────────────────────────────────────

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

  /**
   * Draw a glow button — rounded rect with multi-layer glow.
   * Adapted from flapsandseals.com partner button CSS:
   *   box-shadow: 0 0 1em .25em var(--glow-color),
   *               0 0 4em 1em var(--glow-spread-color),
   *               inset 0 0 .05em .25em var(--glow-color);
   */
  function _drawGlowButton(ctx, x, y, w, h, opts) {
    var hovered = opts && opts.hovered;
    var selected = opts && opts.selected;
    var disabled = opts && opts.disabled;
    var r = opts && opts.radius != null ? opts.radius : 10;

    ctx.save();

    if (disabled) {
      // Muted appearance for disabled buttons
      _roundRect(ctx, x, y, w, h, r);
      ctx.fillStyle = 'rgba(30,28,24,0.7)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(100,90,70,0.3)';
      ctx.lineWidth = 1;
      _roundRect(ctx, x, y, w, h, r);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Outer glow (larger, diffuse)
    if (selected || hovered) {
      ctx.shadowColor = GLOW_SPREAD;
      ctx.shadowBlur = hovered ? 40 : 25;
      _roundRect(ctx, x, y, w, h, r);
      ctx.fillStyle = 'rgba(0,0,0,0.01)';
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Button body
    _roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = hovered ? 'rgba(24,40,28,0.95)' : (selected ? 'rgba(20,35,24,0.92)' : PAPER_BG);
    ctx.fill();

    // Inner glow border
    ctx.shadowColor = selected || hovered ? GLOW_COLOR : 'transparent';
    ctx.shadowBlur = selected || hovered ? 12 : 0;
    _roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = hovered ? GLOW_COLOR : (selected ? PAPER_BORDER_SEL : PAPER_BORDER);
    ctx.lineWidth = hovered ? 2.5 : (selected ? 2 : 1.2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Bottom reflection line (::after effect from CSS)
    if (selected || hovered) {
      var refY = y + h + 4;
      var refW = w * 0.6;
      var refX = x + (w - refW) / 2;
      var grad = ctx.createLinearGradient(refX, refY, refX + refW, refY);
      grad.addColorStop(0, 'rgba(176,255,189,0)');
      grad.addColorStop(0.5, hovered ? 'rgba(176,255,189,0.25)' : 'rgba(176,255,189,0.12)');
      grad.addColorStop(1, 'rgba(176,255,189,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(refX, refY, refW, 3);
    }

    ctx.restore();
  }

  // ── Phase renderers ───────────────────────────────────────────────

  function _renderTitle(w, h) {
    var cx = w / 2;

    // Game title — large, with glow
    _ctx.save();
    _ctx.shadowColor = GLOW_DIM;
    _ctx.shadowBlur = 20;
    _ctx.fillStyle = TEXT_WARM;
    _ctx.font = 'bold 72px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('title.game_name', 'DUNGEON GLEANER'), cx, h * 0.20);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    // Subtitle
    _ctx.fillStyle = TEXT_DIM;
    _ctx.font = '26px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('title.subtitle', 'A Dungeon Crawler'), cx, h * 0.20 + 56);

    // Menu options — glow buttons
    var startY = h * 0.46;
    var btnW = 360;
    var btnH = 56;
    var gap = 18;
    var labels = [
      i18n.t('title.new_game', 'New Game'),
      i18n.t('title.continue', 'Continue'),
      i18n.t('title.settings', 'Settings')
    ];

    for (var i = 0; i < labels.length; i++) {
      var by = startY + i * (btnH + gap);
      var bx = cx - btnW / 2;
      var isSelected = i === _selected;
      var isPlaceholder = i === 1;
      var zoneIdx = _hitZones.length;

      // Draw glow button
      _drawGlowButton(_ctx, bx, by, btnW, btnH, {
        selected: isSelected,
        hovered: !isPlaceholder && _isZoneHovered(zoneIdx),
        disabled: isPlaceholder
      });

      // Button label
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.font = (isSelected ? 'bold ' : '') + '28px "Courier New", monospace';
      if (isPlaceholder) {
        _ctx.fillStyle = '#444';
      } else if (isSelected || _isZoneHovered(zoneIdx)) {
        _ctx.fillStyle = '#fff';
      } else {
        _ctx.fillStyle = TEXT_WARM;
      }

      var label = labels[i];
      if (isPlaceholder) label += '  [\u2014]';
      _ctx.fillText(label, cx, by + btnH / 2);

      // Hit zone
      if (!isPlaceholder) {
        (function (idx) {
          _hitZones.push({
            x: bx, y: by, w: btnW, h: btnH,
            action: function () { _selected = idx; _confirm(); }
          });
        })(i);
      }
    }

    // Version / jam credit
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '16px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.fillText(i18n.t('title.jam_credit', 'DC Jam 2026'), cx, h - 36);
  }

  function _renderCallsign(w, h) {
    var cx = w / 2;

    // Header
    _ctx.fillStyle = TEXT_DIM;
    _ctx.font = 'bold 28px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('create.callsign_header', 'CHOOSE YOUR CALLSIGN'), cx, h * 0.13);

    // Current callsign — large with glow
    _ctx.save();
    _ctx.shadowColor = GLOW_DIM;
    _ctx.shadowBlur = 18;
    _ctx.fillStyle = '#fff';
    _ctx.font = 'bold 72px "Courier New", monospace';
    _ctx.fillText(_callsign, cx, h * 0.32);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    // Arrow buttons — glow style
    var arrowBtnW = 64;
    var arrowBtnH = 64;
    var arrowY = h * 0.32 - arrowBtnH / 2;
    var leftArrowX = cx - 240;
    var rightArrowX = cx + 240 - arrowBtnW;

    // Left arrow
    var leftZoneIdx = _hitZones.length;
    _drawGlowButton(_ctx, leftArrowX, arrowY, arrowBtnW, arrowBtnH, {
      selected: false, hovered: _isZoneHovered(leftZoneIdx), radius: 8
    });
    _ctx.fillStyle = _isZoneHovered(leftZoneIdx) ? '#fff' : TEXT_WARM;
    _ctx.font = 'bold 36px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('\u25C0', leftArrowX + arrowBtnW / 2, arrowY + arrowBtnH / 2);
    _hitZones.push({
      x: leftArrowX, y: arrowY, w: arrowBtnW, h: arrowBtnH,
      action: function () { _navigateLeft(); }
    });

    // Right arrow
    var rightZoneIdx = _hitZones.length;
    _drawGlowButton(_ctx, rightArrowX, arrowY, arrowBtnW, arrowBtnH, {
      selected: false, hovered: _isZoneHovered(rightZoneIdx), radius: 8
    });
    _ctx.fillStyle = _isZoneHovered(rightZoneIdx) ? '#fff' : TEXT_WARM;
    _ctx.font = 'bold 36px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.fillText('\u25B6', rightArrowX + arrowBtnW / 2, arrowY + arrowBtnH / 2);
    _hitZones.push({
      x: rightArrowX, y: arrowY, w: arrowBtnW, h: arrowBtnH,
      action: function () { _navigateRight(); }
    });

    // Preview: show adjacent callsigns
    var prevIdx = (_callsignIndex - 1 + CALLSIGNS.length) % CALLSIGNS.length;
    var nextIdx = (_callsignIndex + 1) % CALLSIGNS.length;
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '22px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.fillText(CALLSIGNS[prevIdx], cx - 160, h * 0.48);
    _ctx.fillText(CALLSIGNS[nextIdx], cx + 160, h * 0.48);

    // Index counter
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '18px "Courier New", monospace';
    _ctx.fillText((_callsignIndex + 1) + ' / ' + CALLSIGNS.length, cx, h * 0.57);

    // Confirm button
    var confirmBtnW = 280;
    var confirmBtnH = 56;
    var confirmX = cx - confirmBtnW / 2;
    var confirmY = h * 0.67;
    var confirmZoneIdx = _hitZones.length;

    _drawGlowButton(_ctx, confirmX, confirmY, confirmBtnW, confirmBtnH, {
      selected: true, hovered: _isZoneHovered(confirmZoneIdx)
    });
    _ctx.fillStyle = _isZoneHovered(confirmZoneIdx) ? '#fff' : GLOW_COLOR;
    _ctx.font = 'bold 26px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('CONFIRM \u25B6', cx, confirmY + confirmBtnH / 2);
    _hitZones.push({
      x: confirmX, y: confirmY, w: confirmBtnW, h: confirmBtnH,
      action: function () { _confirm(); }
    });

    // Back button
    var backBtnW = 160;
    var backBtnH = 44;
    var backX = cx - backBtnW / 2;
    var backY = h * 0.80;
    var backZoneIdx = _hitZones.length;

    _drawGlowButton(_ctx, backX, backY, backBtnW, backBtnH, {
      selected: false, hovered: _isZoneHovered(backZoneIdx)
    });
    _ctx.fillStyle = _isZoneHovered(backZoneIdx) ? '#fff' : TEXT_DIM;
    _ctx.font = '20px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('\u25C0 BACK', cx, backY + backBtnH / 2);
    _hitZones.push({
      x: backX, y: backY, w: backBtnW, h: backBtnH,
      action: function () { _back(); }
    });

    // Controls hint
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '16px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.fillText(i18n.t('create.callsign_hint', '[\u2190 \u2192] Browse   [Enter] Confirm   [Esc] Back'), cx, h * 0.92);
  }

  function _renderAvatar(w, h) {
    var cx = w / 2;

    // Header
    _ctx.fillStyle = TEXT_DIM;
    _ctx.font = 'bold 28px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('create.avatar_header', 'CHOOSE YOUR CLASS'), cx, h * 0.05);

    // Callsign reminder
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '20px "Courier New", monospace';
    _ctx.fillText('Agent ' + _callsign, cx, h * 0.10);

    // Avatar grid (2 columns x 3 rows) — large cards for readability
    var cols = 2;
    var cardW = 320;
    var cardH = 100;
    var gapX = 20;
    var gapY = 16;
    var gridW = cols * cardW + (cols - 1) * gapX;
    var startX = cx - gridW / 2;
    var startY = h * 0.15;

    for (var i = 0; i < AVATARS.length; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var ax = startX + col * (cardW + gapX);
      var ay = startY + row * (cardH + gapY);
      var isSelected = i === _avatarIndex;
      var zoneIdx = _hitZones.length;
      var isHovered = _isZoneHovered(zoneIdx);

      // Card as glow button
      _drawGlowButton(_ctx, ax, ay, cardW, cardH, {
        selected: isSelected, hovered: isHovered, radius: 8
      });

      // Emoji (large)
      _ctx.font = '40px serif';
      _ctx.textAlign = 'left';
      _ctx.textBaseline = 'middle';
      _ctx.fillStyle = '#fff';
      _ctx.fillText(AVATARS[i].emoji, ax + 14, ay + 36);

      // Name (bold, readable)
      _ctx.font = (isSelected ? 'bold ' : '') + '24px "Courier New", monospace';
      _ctx.fillStyle = isSelected || isHovered ? '#fff' : TEXT_WARM;
      _ctx.fillText(AVATARS[i].name, ax + 64, ay + 30);

      // Description — now fits in the larger card
      _ctx.font = '16px "Courier New", monospace';
      _ctx.fillStyle = isSelected || isHovered ? '#bbb' : TEXT_DIM;
      // Clip to card bounds for safety
      _ctx.save();
      _ctx.beginPath();
      _ctx.rect(ax + 64, ay + 45, cardW - 78, 40);
      _ctx.clip();
      _ctx.fillText(AVATARS[i].desc, ax + 64, ay + 62);
      _ctx.restore();

      // Stat badge (right side)
      _ctx.font = '13px "Courier New", monospace';
      _ctx.textAlign = 'right';
      _ctx.fillStyle = isSelected ? GLOW_COLOR : 'rgba(176,255,189,0.4)';
      var statLabel = '+' + AVATARS[i].stat.toUpperCase();
      _ctx.fillText(statLabel, ax + cardW - 12, ay + 82);
      _ctx.textAlign = 'left';

      // Hit zone
      (function (idx) {
        _hitZones.push({
          x: ax, y: ay, w: cardW, h: cardH,
          action: function () { _avatarIndex = idx; _confirm(); }
        });
      })(i);
    }

    // Selected avatar detail (larger preview below grid)
    var ava = AVATARS[_avatarIndex];
    var detailY = startY + 3 * (cardH + gapY) + 16;

    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';

    // Emoji
    _ctx.save();
    _ctx.shadowColor = GLOW_SPREAD;
    _ctx.shadowBlur = 15;
    _ctx.font = '56px serif';
    _ctx.fillStyle = '#fff';
    _ctx.fillText(ava.emoji, cx, detailY);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    // Name
    _ctx.font = 'bold 30px "Courier New", monospace';
    _ctx.fillStyle = TEXT_WARM;
    _ctx.fillText(ava.name, cx, detailY + 42);

    // Desc
    _ctx.font = '20px "Courier New", monospace';
    _ctx.fillStyle = TEXT_DIM;
    _ctx.fillText(ava.desc, cx, detailY + 70);

    // Back button (bottom left area)
    var backBtnW = 160;
    var backBtnH = 44;
    var backX = cx - backBtnW / 2;
    var backY = h - 52;
    var backZoneIdx = _hitZones.length;

    _drawGlowButton(_ctx, backX, backY, backBtnW, backBtnH, {
      selected: false, hovered: _isZoneHovered(backZoneIdx)
    });
    _ctx.fillStyle = _isZoneHovered(backZoneIdx) ? '#fff' : TEXT_DIM;
    _ctx.font = '20px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('\u25C0 BACK', cx, backY + backBtnH / 2);
    _hitZones.push({
      x: backX, y: backY, w: backBtnW, h: backBtnH,
      action: function () { _back(); }
    });

    // Controls hint
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '16px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.fillText(i18n.t('create.avatar_hint', '[\u2191 \u2193] Browse   [Enter] Deploy   [Esc] Back'), cx, h - 12);
  }

  function _renderDeploy(w, h) {
    var cx = w / 2;
    var ava = AVATARS[_avatarIndex];

    // Fade in
    var alpha = Math.min(1, _deployTimer / 400);
    _ctx.globalAlpha = alpha;

    // Avatar emoji (very large with glow)
    _ctx.save();
    _ctx.shadowColor = GLOW_SPREAD;
    _ctx.shadowBlur = 30;
    _ctx.font = '96px serif';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillStyle = '#fff';
    _ctx.fillText(ava.emoji, cx, h * 0.30);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    // Callsign
    _ctx.save();
    _ctx.shadowColor = GLOW_DIM;
    _ctx.shadowBlur = 12;
    _ctx.font = 'bold 52px "Courier New", monospace';
    _ctx.fillStyle = TEXT_WARM;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(_callsign, cx, h * 0.48);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    // Class
    _ctx.font = '26px "Courier New", monospace';
    _ctx.fillStyle = TEXT_DIM;
    _ctx.textAlign = 'center';
    _ctx.fillText(ava.name + ' class', cx, h * 0.56);

    // Deploying message (blink after 600ms)
    if (_deployTimer > 400) {
      var blink = Math.sin(_deployTimer / 200) * 0.3 + 0.7;
      _ctx.globalAlpha = blink;
      _ctx.fillStyle = GLOW_COLOR;
      _ctx.font = 'bold 24px "Courier New", monospace';
      _ctx.fillText(i18n.t('create.deploying', 'DEPLOYING...'), cx, h * 0.68);
    }

    _ctx.globalAlpha = 1;
  }

  // ── Settings overlay ───────────────────────────────────────────

  var SETTINGS_ITEMS = [
    { key: 'sfx',    label: 'Sound Effects', type: 'toggle' },
    { key: 'music',  label: 'Music',         type: 'toggle' },
    { key: 'screen', label: 'Screen Shake',  type: 'toggle' }
  ];

  var _settings = { sfx: true, music: true, screen: true };

  function _loadSettings() {
    try {
      var saved = localStorage.getItem('dg_settings');
      if (saved) {
        var parsed = JSON.parse(saved);
        for (var k in parsed) {
          if (_settings.hasOwnProperty(k)) _settings[k] = !!parsed[k];
        }
      }
    } catch (e) { /* no localStorage — use defaults */ }
  }

  function _saveSettings() {
    try { localStorage.setItem('dg_settings', JSON.stringify(_settings)); }
    catch (e) { /* silent */ }
  }

  function _toggleSetting(idx) {
    var item = SETTINGS_ITEMS[idx];
    if (!item) return;
    _settings[item.key] = !_settings[item.key];
    _saveSettings();

    if (typeof AudioSystem !== 'undefined') {
      if (item.key === 'music') AudioSystem.setMusicVolume(_settings.music ? 1 : 0);
      if (item.key === 'sfx')   AudioSystem.setMasterVolume(_settings.sfx ? 1 : 0);
    }
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('ui-select', { volume: 0.5 });
    }
  }

  function _renderSettings(w, h) {
    // Dim overlay
    _ctx.fillStyle = 'rgba(0,0,0,0.8)';
    _ctx.fillRect(0, 0, w, h);

    var cx = w / 2;
    var panelW = 480;
    var panelH = 380;
    var panelX = cx - panelW / 2;
    var panelY = h / 2 - panelH / 2;

    // Panel background with glow border
    _drawGlowButton(_ctx, panelX, panelY, panelW, panelH, {
      selected: true, radius: 12
    });

    // Title
    _ctx.save();
    _ctx.shadowColor = GLOW_DIM;
    _ctx.shadowBlur = 10;
    _ctx.fillStyle = TEXT_WARM;
    _ctx.font = 'bold 36px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('SETTINGS', cx, panelY + 48);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    // Items
    var startY = panelY + 100;
    var lineH = 60;

    for (var i = 0; i < SETTINGS_ITEMS.length; i++) {
      var y = startY + i * lineH;
      var item = SETTINGS_ITEMS[i];
      var isOn = _settings[item.key];
      var isSel = i === _settingsSelected;
      var rowX = panelX + 24;
      var rowW = panelW - 48;
      var rowH = 48;
      var zoneIdx = _hitZones.length;
      var isHovered = _isZoneHovered(zoneIdx);

      // Row glow button
      _drawGlowButton(_ctx, rowX, y - rowH / 2, rowW, rowH, {
        selected: isSel, hovered: isHovered, radius: 6
      });

      // Label
      _ctx.font = (isSel ? 'bold ' : '') + '24px "Courier New", monospace';
      _ctx.fillStyle = isSel || isHovered ? '#fff' : TEXT_WARM;
      _ctx.textAlign = 'left';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(item.label, rowX + 16, y);

      // Toggle indicator
      _ctx.textAlign = 'right';
      _ctx.fillStyle = isOn ? GLOW_COLOR : '#c44';
      _ctx.font = 'bold 24px "Courier New", monospace';
      _ctx.fillText(isOn ? 'ON' : 'OFF', rowX + rowW - 16, y);

      // Hit zone
      (function (idx) {
        _hitZones.push({
          x: rowX, y: y - rowH / 2, w: rowW, h: rowH,
          action: function () { _settingsSelected = idx; _toggleSetting(idx); }
        });
      })(i);
    }

    // BACK button — clickable exit
    var backY = startY + SETTINGS_ITEMS.length * lineH + 16;
    var backBtnW = 200;
    var backBtnH = 48;
    var backX = cx - backBtnW / 2;
    var isSel = _settingsSelected >= SETTINGS_ITEMS.length;
    var backZoneIdx = _hitZones.length;
    var isBackHovered = _isZoneHovered(backZoneIdx);

    _drawGlowButton(_ctx, backX, backY, backBtnW, backBtnH, {
      selected: isSel, hovered: isBackHovered, radius: 8
    });
    _ctx.fillStyle = isSel || isBackHovered ? '#fff' : TEXT_DIM;
    _ctx.font = 'bold 22px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('\u2716 BACK', cx, backY + backBtnH / 2);

    _hitZones.push({
      x: backX, y: backY, w: backBtnW, h: backBtnH,
      action: function () { _settingsOpen = false; }
    });

    // Hint
    _ctx.textAlign = 'center';
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '16px "Courier New", monospace';
    _ctx.fillText('[Esc] Back   [Enter] Toggle', cx, panelY + panelH - 20);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
  }

  function start() {
    _active = true;
    _phase = 0;
    _selected = 0;
    _settingsOpen = false;
    _settingsSelected = 0;
    _callsignIndex = 0;
    _callsign = CALLSIGNS[0];
    _avatarIndex = 0;
    _deployTimer = 0;
    _mouseX = -1;
    _mouseY = -1;
    _hoveredZoneIdx = -1;
    _loadSettings();
    _bindInput();
  }

  function stop() {
    _active = false;
    _unbindInput();
    if (_canvas) _canvas.style.cursor = 'default';
  }

  function isActive() { return _active; }

  // ── Public API ───────────────────────────────────────────────────

  return {
    init: init,
    start: start,
    stop: stop,
    isActive: isActive,
    update: update,
    render: render,
    CALLSIGNS: CALLSIGNS,
    AVATARS: AVATARS
  };
})();
