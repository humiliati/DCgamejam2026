/**
 * TitleScreen — title menu with character creation.
 *
 * Layer 2 (depends on i18n, Player, ScreenManager). Canvas-rendered
 * title screen with a 2-phase character creation flow adapted from
 * EyesOnly's gone-rogue launcher:
 *
 *   Phase 0 — TITLE    : game title + "New Game" / placeholder options
 *   Phase 1 — CALLSIGN : pick or type a callsign (name)
 *   Phase 2 — AVATAR   : pick a class from card grid
 *
 * After avatar selection, a brief deploy message plays, then
 * ScreenManager transitions to GAMEPLAY.
 *
 * Later replaced by MenuBox rotating box over skybox. For now this
 * is a flat canvas-drawn placeholder that gets the flow working.
 */
var TitleScreen = (function () {
  'use strict';

  var _canvas = null;
  var _ctx = null;
  var _active = false;
  var _phase = 0;         // 0=title, 1=callsign, 2=avatar, 3=deploying
  var _selected = 0;      // Currently highlighted option index
  var _deployTimer = 0;

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
    { id: 'AVA-01', emoji: '🗡️', name: 'Blade',     desc: 'High STR. Hits hard, takes hard.', stat: 'str' },
    { id: 'AVA-02', emoji: '🏹', name: 'Ranger',    desc: 'High DEX. Fast and precise.',       stat: 'dex' },
    { id: 'AVA-03', emoji: '🕵️', name: 'Shadow',    desc: 'High Stealth. Unseen advantage.',   stat: 'stealth' },
    { id: 'AVA-04', emoji: '🛡️', name: 'Sentinel',  desc: 'Balanced. Endures everything.',     stat: 'hp' },
    { id: 'AVA-05', emoji: '🔮', name: 'Seer',      desc: 'High Energy. More card plays.',     stat: 'energy' },
    { id: 'AVA-06', emoji: '🃏', name: 'Wildcard',  desc: 'Random stats. Chaos run.',          stat: 'random' }
  ];

  var _avatarIndex = 0;

  // ── Title menu options ────────────────────────────────────────────

  var TITLE_OPTIONS = ['new_game', 'placeholder_continue', 'placeholder_settings'];

  // ── Input handling ────────────────────────────────────────────────

  var _keyHandler = null;
  var _clickHandler = null;

  function _bindInput() {
    _keyHandler = function (e) { _onKey(e); };
    _clickHandler = function (e) { _onClick(e); };
    window.addEventListener('keydown', _keyHandler);
    _canvas.addEventListener('click', _clickHandler);
  }

  function _unbindInput() {
    if (_keyHandler) window.removeEventListener('keydown', _keyHandler);
    if (_clickHandler) _canvas.removeEventListener('click', _clickHandler);
    _keyHandler = null;
    _clickHandler = null;
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

    var rect = _canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (_canvas.width / rect.width);
    var y = (e.clientY - rect.top) * (_canvas.height / rect.height);

    _hitTest(x, y);
  }

  // ── Navigation ────────────────────────────────────────────────────

  function _navigateUp() {
    if (_phase === 0 && _settingsOpen) {
      _settingsSelected = (_settingsSelected - 1 + SETTINGS_ITEMS.length) % SETTINGS_ITEMS.length;
    } else if (_phase === 0) {
      _selected = (_selected - 1 + TITLE_OPTIONS.length) % TITLE_OPTIONS.length;
    } else if (_phase === 2) {
      _avatarIndex = (_avatarIndex - 1 + AVATARS.length) % AVATARS.length;
    }
  }

  function _navigateDown() {
    if (_phase === 0 && _settingsOpen) {
      _settingsSelected = (_settingsSelected + 1) % SETTINGS_ITEMS.length;
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

  // ── Confirm ───────────────────────────────────────────────────
  function _confirm() {
    if (_phase === 0) {
      if (_settingsOpen) {
        // Inside settings overlay — handle setting toggle
        _toggleSetting(_settingsSelected);
        return;
      }
      if (_selected === 0) {
        // New Game → callsign
        _phase = 1;
        _callsignIndex = 0;
        _callsign = CALLSIGNS[0];
      } else if (_selected === 2) {
        // Settings → open overlay
        _settingsOpen = true;
        _settingsSelected = 0;
      }
    } else if (_phase === 1) {
      // Callsign confirmed → avatar
      _phase = 2;
      _avatarIndex = 0;
    } else if (_phase === 2) {
      // Avatar confirmed → deploy
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

  /** @type {Array<{x:number,y:number,w:number,h:number,action:function}>} */
  var _hitZones = [];

  function _hitTest(mx, my) {
    for (var i = 0; i < _hitZones.length; i++) {
      var z = _hitZones[i];
      if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        z.action();
        return;
      }
    }
  }

  // ── Deploy ────────────────────────────────────────────────────────

  function _deploy() {
    _phase = 3;
    _deployTimer = 0;

    // Apply avatar to player
    var ava = AVATARS[_avatarIndex];
    var p = Player.state();
    p.callsign = _callsign;
    p.avatarId = ava.id;
    p.avatarEmoji = ava.emoji;
    p.avatarName = ava.name;

    // Apply stat bonus based on class
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

    // Subtle border accent
    _ctx.strokeStyle = 'rgba(51,51,51,0.5)';
    _ctx.lineWidth = 1;
    _ctx.strokeRect(20, 20, w - 40, h - 40);

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
  }

  // ── Phase renderers ───────────────────────────────────────────────

  function _renderTitle(w, h) {
    var cx = w / 2;

    // Game title
    _ctx.fillStyle = '#ddd';
    _ctx.font = 'bold 48px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('title.game_name', 'DUNGEON GLEANER'), cx, h * 0.22);

    // Subtitle
    _ctx.fillStyle = '#666';
    _ctx.font = '18px "Courier New", monospace';
    _ctx.fillText(i18n.t('title.subtitle', 'A Dungeon Crawler'), cx, h * 0.22 + 46);

    // Menu options
    var startY = h * 0.48;
    var lineH = 52;
    var labels = [
      i18n.t('title.new_game', 'New Game'),
      i18n.t('title.continue', 'Continue'),
      i18n.t('title.settings', 'Settings')
    ];

    for (var i = 0; i < labels.length; i++) {
      var y = startY + i * lineH;
      var isSelected = i === _selected;
      // Continue is placeholder, Settings is clickable (opens settings overlay)
      var isPlaceholder = i === 1;

      _ctx.font = (isSelected ? 'bold ' : '') + '22px "Courier New", monospace';
      _ctx.fillStyle = isPlaceholder ? '#444' : (isSelected ? '#fff' : '#999');

      var label = (isSelected ? '▸ ' : '  ') + labels[i];
      if (isPlaceholder) label += '  [—]';
      _ctx.fillText(label, cx, y);

      // Hit zone (clickable for non-placeholder options)
      if (!isPlaceholder) {
        var tw = _ctx.measureText(label).width;
        (function (idx) {
          _hitZones.push({
            x: cx - tw / 2 - 10, y: y - 18,
            w: tw + 20, h: 36,
            action: function () { _selected = idx; _confirm(); }
          });
        })(i);
      }
    }

    // Version / jam credit
    _ctx.fillStyle = '#444';
    _ctx.font = '12px "Courier New", monospace';
    _ctx.fillText(i18n.t('title.jam_credit', 'DC Jam 2026'), cx, h - 32);
  }

  function _renderCallsign(w, h) {
    var cx = w / 2;

    // Header
    _ctx.fillStyle = '#888';
    _ctx.font = '18px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('create.callsign_header', 'CHOOSE YOUR CALLSIGN'), cx, h * 0.15);

    // Current callsign (large)
    _ctx.fillStyle = '#fff';
    _ctx.font = 'bold 42px "Courier New", monospace';
    _ctx.fillText(_callsign, cx, h * 0.32);

    // Arrow indicators
    _ctx.fillStyle = '#888';
    _ctx.font = '28px "Courier New", monospace';
    _ctx.fillText('◀', cx - 180, h * 0.32);
    _ctx.fillText('▶', cx + 180, h * 0.32);

    // Left arrow hit zone
    _hitZones.push({
      x: cx - 200, y: h * 0.32 - 20, w: 50, h: 40,
      action: function () { _navigateLeft(); }
    });
    // Right arrow hit zone
    _hitZones.push({
      x: cx + 155, y: h * 0.32 - 20, w: 50, h: 40,
      action: function () { _navigateRight(); }
    });

    // Preview: show adjacent callsigns
    var prevIdx = (_callsignIndex - 1 + CALLSIGNS.length) % CALLSIGNS.length;
    var nextIdx = (_callsignIndex + 1) % CALLSIGNS.length;
    _ctx.fillStyle = '#444';
    _ctx.font = '16px "Courier New", monospace';
    _ctx.fillText(CALLSIGNS[prevIdx], cx - 130, h * 0.47);
    _ctx.fillText(CALLSIGNS[nextIdx], cx + 130, h * 0.47);

    // Index counter
    _ctx.fillStyle = '#555';
    _ctx.font = '14px "Courier New", monospace';
    _ctx.fillText((_callsignIndex + 1) + ' / ' + CALLSIGNS.length, cx, h * 0.56);

    // Controls hint
    _ctx.fillStyle = '#555';
    _ctx.font = '14px "Courier New", monospace';
    _ctx.fillText(i18n.t('create.callsign_hint', '[← →] Browse   [Enter] Confirm   [Esc] Back'), cx, h * 0.85);

    // Confirm hit zone (large central area)
    var tw = _ctx.measureText(_callsign).width;
    _hitZones.push({
      x: cx - tw / 2 - 30, y: h * 0.32 - 28, w: tw + 60, h: 56,
      action: function () { _confirm(); }
    });
  }

  function _renderAvatar(w, h) {
    var cx = w / 2;

    // Header
    _ctx.fillStyle = '#888';
    _ctx.font = '18px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('create.avatar_header', 'CHOOSE YOUR CLASS'), cx, h * 0.06);

    // Callsign reminder
    _ctx.fillStyle = '#555';
    _ctx.font = '14px "Courier New", monospace';
    _ctx.fillText('Agent ' + _callsign, cx, h * 0.12);

    // Avatar grid (2 columns × 3 rows) — wider cards to prevent text overflow
    var cols = 2;
    var cardW = 200;
    var cardH = 62;
    var gapX = 16;
    var gapY = 12;
    var gridW = cols * cardW + (cols - 1) * gapX;
    var startX = cx - gridW / 2;
    var startY = h * 0.18;

    for (var i = 0; i < AVATARS.length; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var ax = startX + col * (cardW + gapX);
      var ay = startY + row * (cardH + gapY);
      var isSelected = i === _avatarIndex;

      // Card background
      _ctx.fillStyle = isSelected ? '#1a2a1a' : '#111';
      _ctx.fillRect(ax, ay, cardW, cardH);

      // Card border
      _ctx.strokeStyle = isSelected ? '#4a4' : '#333';
      _ctx.lineWidth = isSelected ? 2 : 1;
      _ctx.strokeRect(ax, ay, cardW, cardH);

      // Emoji
      _ctx.font = '24px serif';
      _ctx.textAlign = 'left';
      _ctx.fillStyle = '#fff';
      _ctx.fillText(AVATARS[i].emoji, ax + 10, ay + 26);

      // Name
      _ctx.font = (isSelected ? 'bold ' : '') + '16px "Courier New", monospace';
      _ctx.fillStyle = isSelected ? '#fff' : '#aaa';
      _ctx.fillText(AVATARS[i].name, ax + 44, ay + 24);

      // Description — clip to card width
      _ctx.save();
      _ctx.beginPath();
      _ctx.rect(ax, ay, cardW, cardH);
      _ctx.clip();
      _ctx.font = '11px "Courier New", monospace';
      _ctx.fillStyle = '#666';
      _ctx.fillText(AVATARS[i].desc, ax + 44, ay + 44);
      _ctx.restore();

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
    var detailY = startY + 3 * (cardH + gapY) + 20;

    _ctx.textAlign = 'center';
    _ctx.font = '36px serif';
    _ctx.fillStyle = '#fff';
    _ctx.fillText(ava.emoji, cx, detailY);

    _ctx.font = 'bold 20px "Courier New", monospace';
    _ctx.fillStyle = '#ddd';
    _ctx.fillText(ava.name, cx, detailY + 34);

    _ctx.font = '14px "Courier New", monospace';
    _ctx.fillStyle = '#888';
    _ctx.fillText(ava.desc, cx, detailY + 56);

    // Controls hint
    _ctx.fillStyle = '#555';
    _ctx.font = '14px "Courier New", monospace';
    _ctx.fillText(i18n.t('create.avatar_hint', '[↑ ↓] Browse   [Enter] Deploy   [Esc] Back'), cx, h - 24);
  }

  function _renderDeploy(w, h) {
    var cx = w / 2;
    var ava = AVATARS[_avatarIndex];

    // Fade in
    var alpha = Math.min(1, _deployTimer / 400);
    _ctx.globalAlpha = alpha;

    // Avatar emoji (large)
    _ctx.font = '64px serif';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillStyle = '#fff';
    _ctx.fillText(ava.emoji, cx, h * 0.32);

    // Callsign
    _ctx.font = 'bold 32px "Courier New", monospace';
    _ctx.fillStyle = '#ddd';
    _ctx.fillText(_callsign, cx, h * 0.5);

    // Class
    _ctx.font = '18px "Courier New", monospace';
    _ctx.fillStyle = '#888';
    _ctx.fillText(ava.name + ' class', cx, h * 0.58);

    // Deploying message (blink after 600ms)
    if (_deployTimer > 400) {
      var blink = Math.sin(_deployTimer / 200) * 0.3 + 0.7;
      _ctx.globalAlpha = blink;
      _ctx.fillStyle = '#666';
      _ctx.font = '16px "Courier New", monospace';
      _ctx.fillText(i18n.t('create.deploying', 'DEPLOYING...'), cx, h * 0.7);
    }

    _ctx.globalAlpha = 1;
  }

  // ── Settings overlay ───────────────────────────────────────────

  var SETTINGS_ITEMS = [
    { key: 'sfx',    label: 'Sound Effects', type: 'toggle' },
    { key: 'music',  label: 'Music',         type: 'toggle' },
    { key: 'screen', label: 'Screen Shake',  type: 'toggle' }
  ];

  // Settings live in memory — persisted to localStorage if available.
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

    // Apply immediately via volume API
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
    _ctx.fillStyle = 'rgba(0,0,0,0.75)';
    _ctx.fillRect(0, 0, w, h);

    var cx = w / 2;

    // Title
    _ctx.fillStyle = '#ddd';
    _ctx.font = 'bold 28px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('SETTINGS', cx, h * 0.18);

    // Items
    var startY = h * 0.32;
    var lineH = 52;

    for (var i = 0; i < SETTINGS_ITEMS.length; i++) {
      var y = startY + i * lineH;
      var item = SETTINGS_ITEMS[i];
      var isOn = _settings[item.key];
      var isSel = i === _settingsSelected;

      // Row background highlight
      if (isSel) {
        _ctx.fillStyle = 'rgba(51,255,136,0.06)';
        _ctx.fillRect(cx - 160, y - 18, 320, 36);
      }

      // Label
      _ctx.font = (isSel ? 'bold ' : '') + '20px "Courier New", monospace';
      _ctx.fillStyle = isSel ? '#fff' : '#999';
      _ctx.textAlign = 'left';
      _ctx.fillText((isSel ? '▸ ' : '  ') + item.label, cx - 140, y);

      // Toggle indicator
      _ctx.textAlign = 'right';
      _ctx.fillStyle = isOn ? '#4f4' : '#744';
      _ctx.font = 'bold 20px "Courier New", monospace';
      _ctx.fillText(isOn ? 'ON' : 'OFF', cx + 140, y);

      // Hit zone
      (function (idx) {
        _hitZones.push({
          x: cx - 160, y: y - 18,
          w: 320, h: 36,
          action: function () { _settingsSelected = idx; _toggleSetting(idx); }
        });
      })(i);
    }

    // Hint
    _ctx.textAlign = 'center';
    _ctx.fillStyle = '#555';
    _ctx.font = '14px "Courier New", monospace';
    _ctx.fillText('[Esc] Back   [Enter] Toggle', cx, h * 0.82);
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
    _loadSettings();
    _bindInput();
  }

  function stop() {
    _active = false;
    _unbindInput();
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
