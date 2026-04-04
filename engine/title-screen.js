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

  // ── CRT font stack (console, NOT Courier) ─────────────────────────
  var CRT_FONT = "'Classic Console Neue', Consolas, Monaco, 'Lucida Console', monospace";

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
    { id: 'AVA-01', emoji: '\uD83D\uDDE1\uFE0F', name: 'Blade',     desc: 'High STR. Hits hard, takes hard.', stat: 'str',
      lore: 'Back in the day you ran point on breach teams - first through the door, last one standing. These days the only thing you breach is supply closets, but the muscle memory never left. Every mop handle still feels like a hilt.' },
    { id: 'AVA-02', emoji: '\uD83C\uDFF9', name: 'Ranger',    desc: 'High DEX. Fast and precise.',       stat: 'dex',
      lore: 'You used to place shots through keyholes at forty meters. Now you place trash bags into dumpsters from across the loading dock. The precision is the same; the stakes are just... different. You tell yourself that.' },
    { id: 'AVA-03', emoji: '\uD83D\uDD75\uFE0F', name: 'Shadow',    desc: 'High Stealth. Unseen advantage.',   stat: 'stealth',
      lore: 'Nobody notices the janitor. That was true in the field and it is true now. You learned to move through occupied rooms without displacing the air. Coworkers jump when you speak; they never heard you arrive.' },
    { id: 'AVA-04', emoji: '\uD83D\uDEE1\uFE0F', name: 'Sentinel',  desc: 'Balanced. Endures everything.',     stat: 'hp',
      lore: 'You have been shot, stabbed, burned, poisoned, and once hit by a municipal bus on an op gone sideways. You are still here. The overnight shift with its leaking pipes and hostile fauna is honestly a vacation by comparison.' },
    { id: 'AVA-05', emoji: '\uD83D\uDD2E', name: 'Seer',      desc: 'High Energy. More card plays.',     stat: 'energy',
      lore: 'Pattern recognition was your thing. You could read a room before the door finished opening. Dispatch says you are "overqualified" for janitorial. You say a building this strange needs someone who can see what is coming.' },
    { id: 'AVA-06', emoji: '\uD83C\uDCCF', name: 'Wildcard',  desc: 'Random stats. Chaos run.',          stat: 'random',
      lore: 'Your file is mostly redacted. Even you are not sure what half those missions were about. The agency put you here because you are "unpredictable" - their word, not yours. Every shift is a new you. That keeps things interesting.' }
  ];

  var _avatarIndex = 0;

  // ── Title menu options ────────────────────────────────────────────

  var TITLE_OPTIONS = ['new_game', 'credits', 'placeholder_settings'];

  // ── Credits state ──────────────────────────────────────────────────
  var _creditsOpen = false;
  var _creditsScroll = 0;
  var _creditsMaxScroll = 0;

  var CREDITS_DATA = [
    { type: 'header', label: 'DUNGEON GLEANER' },
    { type: 'sub',    label: 'DC Jam 2026' },
    { type: 'spacer' },
    { type: 'header', label: 'GAME DESIGN & DEVELOPMENT' },
    { type: 'name',   label: 'Stellar Aqua' },
    { type: 'spacer' },
    { type: 'header', label: 'PLAYER CONTROLLER, CAMERA & CHARACTER' },
    { type: 'name',   label: 'Tower of Hats' },
    { type: 'spacer' },
    { type: 'header', label: 'MUSIC' },
    { type: 'name',   label: 'Bober @ Itch' },
    { type: 'name',   label: 'Aliya Scott' },
    { type: 'name',   label: 'Turtlebox' },
    { type: 'spacer' },
    { type: 'header', label: 'LIGHTING & RENDERING' },
    { type: 'name',   label: 'Vinsidious' },
    { type: 'spacer' },
    { type: 'header', label: 'AI ENGINEERING & DEBUGGING' },
    { type: 'name',   label: 'Claude \u2014 Anthropic' },
    { type: 'spacer' },
    { type: 'header', label: 'DATA TABLES & BALANCING' },
    { type: 'name',   label: 'Minimax' },
    { type: 'spacer' },
    { type: 'header', label: 'BRAINSTORMING & DESIGN' },
    { type: 'name',   label: 'GPT \u2014 OpenAI' },
    { type: 'spacer' },
    { type: 'spacer' },
    { type: 'sub',    label: 'Someone has to restock the dungeons.' },
    { type: 'spacer' }
  ];

  // ── Input handling ────────────────────────────────────────────────

  var _keyHandler = null;
  var _clickHandler = null;
  var _moveHandler = null;

  var _wheelHandler = null;

  function _bindInput() {
    _keyHandler = function (e) { _onKey(e); };
    _clickHandler = function (e) { _onClick(e); };
    _moveHandler = function (e) { _onMouseMove(e); };
    _wheelHandler = function (e) {
      if (_creditsOpen) {
        e.preventDefault();
        _creditsScroll += (e.deltaY > 0 ? 40 : -40);
        _creditsScroll = Math.max(0, Math.min(_creditsMaxScroll, _creditsScroll));
      } else if (_settingsOpen) {
        e.preventDefault();
        _settingsScroll += (e.deltaY > 0 ? 40 : -40);
        _settingsScroll = Math.max(0, Math.min(_settingsMaxScroll, _settingsScroll));
        _settingsAutoScroll = false;  // User is driving scroll — don't snap back
      }
    };
    window.addEventListener('keydown', _keyHandler);
    _canvas.addEventListener('click', _clickHandler);
    _canvas.addEventListener('mousemove', _moveHandler);
    _canvas.addEventListener('wheel', _wheelHandler, { passive: false });
  }

  function _unbindInput() {
    if (_keyHandler) window.removeEventListener('keydown', _keyHandler);
    if (_clickHandler) _canvas.removeEventListener('click', _clickHandler);
    if (_moveHandler) _canvas.removeEventListener('mousemove', _moveHandler);
    if (_wheelHandler) _canvas.removeEventListener('wheel', _wheelHandler);
    _keyHandler = null;
    _clickHandler = null;
    _moveHandler = null;
    _wheelHandler = null;
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
      // Skip zones outside their clip region (scrollable settings items)
      if (z.clipY != null && (_mouseY < z.clipY || _mouseY > z.clipY + z.clipH)) continue;
      if (_mouseX >= z.x && _mouseX <= z.x + z.w && _mouseY >= z.y && _mouseY <= z.y + z.h) {
        _hoveredZoneIdx = i;
        break;
      }
    }
    _canvas.style.cursor = _hoveredZoneIdx >= 0 ? 'pointer' : 'default';

    // Phase 2 (avatar): hovering a class card moves keyboard selection to match.
    // Avatar cards are the first AVATARS.length hit zones in the avatar render.
    if (_phase === 2 && _hoveredZoneIdx >= 0 && _hoveredZoneIdx < AVATARS.length) {
      _avatarIndex = _hoveredZoneIdx;
    }
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
    if (_phase === 0 && _creditsOpen) return; // Credits has no keyboard nav — scroll only
    if (_phase === 0 && _settingsOpen) {
      _settingsSelected = (_settingsSelected - 1 + _settingsItemCount()) % _settingsItemCount();
      _settingsAutoScroll = true;  // Keyboard nav — snap scroll to selection
    } else if (_phase === 0) {
      _selected = (_selected - 1 + TITLE_OPTIONS.length) % TITLE_OPTIONS.length;
    } else if (_phase === 2) {
      _avatarIndex = (_avatarIndex - 1 + AVATARS.length) % AVATARS.length;
    }
  }

  function _navigateDown() {
    if (_phase === 0 && _creditsOpen) return; // Credits has no keyboard nav — scroll only
    if (_phase === 0 && _settingsOpen) {
      _settingsSelected = (_settingsSelected + 1) % _settingsItemCount();
      _settingsAutoScroll = true;  // Keyboard nav — snap scroll to selection
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
    // Count navigable items (skip headers) + 1 for BACK button
    var count = 0;
    for (var i = 0; i < SETTINGS_ITEMS.length; i++) {
      if (SETTINGS_ITEMS[i].type !== 'header') count++;
    }
    return count + 1; // +1 for BACK button
  }

  /** Map navigable index to actual SETTINGS_ITEMS index (skipping headers). */
  function _navToItemIdx(navIdx) {
    var nav = 0;
    for (var i = 0; i < SETTINGS_ITEMS.length; i++) {
      if (SETTINGS_ITEMS[i].type === 'header') continue;
      if (nav === navIdx) return i;
      nav++;
    }
    return -1; // BACK button
  }

  // ── Confirm ───────────────────────────────────────────────────
  function _confirm() {
    if (_phase === 0) {
      if (_creditsOpen) {
        _creditsOpen = false;
        return;
      }
      if (_settingsOpen) {
        var navCount = _settingsItemCount();
        if (_settingsSelected >= navCount - 1) {
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
      } else if (_selected === 1) {
        _creditsOpen = true;
        _creditsScroll = 0;
      } else if (_selected === 2) {
        _settingsOpen = true;
        _settingsSelected = 0;
        _settingsScroll = 0;
        _settingsAutoScroll = true;
      }
    } else if (_phase === 1) {
      _phase = 2;
      _avatarIndex = 0;
    } else if (_phase === 2) {
      _deploy();
    }
  }

  function _back() {
    if (_phase === 0 && _creditsOpen) {
      _creditsOpen = false;
      return;
    }
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
      // Skip zones outside their clip region (scrollable settings items)
      if (z.clipY != null && (my < z.clipY || my > z.clipY + z.clipH)) continue;
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
        // Play deploy cutscene (synthwave driving animation) before gameplay
        if (typeof DeployCutscene !== 'undefined') {
          DeployCutscene.play(function () {
            ScreenManager.toGameplay();
          });
        } else {
          ScreenManager.toGameplay();
        }
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
      if (_creditsOpen)  _renderCredits(w, h);
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
      if (z.clipY != null && (_mouseY < z.clipY || _mouseY > z.clipY + z.clipH)) continue;
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
  function _wrapText(ctx, text, maxWidth) {
    var words = text.split(' ');
    var lines = [];
    var current = '';
    for (var i = 0; i < words.length; i++) {
      var test = current ? current + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = words[i];
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

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

    // ── Paper scroll backdrop behind title ──
    var scrollW = Math.min(w * 0.85, 720);
    var scrollH = 140;
    var scrollX = cx - scrollW / 2;
    var scrollY = h * 0.20 - 64;

    _ctx.save();
    // Scroll body — warm parchment with torn-edge feel
    var scrollGrad = _ctx.createLinearGradient(scrollX, scrollY, scrollX, scrollY + scrollH);
    scrollGrad.addColorStop(0, 'rgba(62,52,38,0.85)');
    scrollGrad.addColorStop(0.1, 'rgba(48,40,28,0.92)');
    scrollGrad.addColorStop(0.9, 'rgba(48,40,28,0.92)');
    scrollGrad.addColorStop(1, 'rgba(62,52,38,0.85)');
    _roundRect(_ctx, scrollX, scrollY, scrollW, scrollH, 6);
    _ctx.fillStyle = scrollGrad;
    _ctx.fill();
    // Scroll border — warm gold accent
    _ctx.strokeStyle = 'rgba(200,170,80,0.45)';
    _ctx.lineWidth = 1.5;
    _roundRect(_ctx, scrollX, scrollY, scrollW, scrollH, 6);
    _ctx.stroke();
    // Ruled lines (paper feel)
    _ctx.strokeStyle = 'rgba(200,180,120,0.08)';
    _ctx.lineWidth = 1;
    for (var rl = 0; rl < 5; rl++) {
      var rlY = scrollY + 20 + rl * 22;
      _ctx.beginPath();
      _ctx.moveTo(scrollX + 20, rlY);
      _ctx.lineTo(scrollX + scrollW - 20, rlY);
      _ctx.stroke();
    }
    _ctx.restore();

    // Game title — large, with layered glow for high contrast
    _ctx.save();
    // Outer glow halo
    _ctx.shadowColor = GLOW_SPREAD;
    _ctx.shadowBlur = 35;
    _ctx.fillStyle = 'rgba(176,255,189,0.04)';
    _ctx.font = 'bold 72px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('title.game_name', 'DUNGEON GLEANER'), cx, h * 0.20);
    // Core text
    _ctx.shadowColor = GLOW_COLOR;
    _ctx.shadowBlur = 12;
    _ctx.fillStyle = '#fff';
    _ctx.fillText(i18n.t('title.game_name', 'DUNGEON GLEANER'), cx, h * 0.20);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    // Subtitle — slightly brighter
    _ctx.fillStyle = TEXT_WARM;
    _ctx.font = '26px ' + CRT_FONT;
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
      i18n.t('title.credits', 'Credits'),
      i18n.t('title.settings', 'Settings')
    ];

    for (var i = 0; i < labels.length; i++) {
      var by = startY + i * (btnH + gap);
      var bx = cx - btnW / 2;
      var isSelected = i === _selected;
      var isPlaceholder = false;  // No placeholders — all buttons active
      var zoneIdx = _hitZones.length;

      // Draw glow button
      _drawGlowButton(_ctx, bx, by, btnW, btnH, {
        selected: isSelected,
        hovered: _isZoneHovered(zoneIdx),
        disabled: false
      });

      // Button label
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.font = (isSelected ? 'bold ' : '') + '28px ' + CRT_FONT;
      if (isPlaceholder) {
        _ctx.fillStyle = '#444';
      } else if (isSelected || _isZoneHovered(zoneIdx)) {
        _ctx.fillStyle = '#fff';
      } else {
        _ctx.fillStyle = TEXT_WARM;
      }

      var label = labels[i];
      _ctx.fillText(label, cx, by + btnH / 2);

      // Hit zone — all buttons active
      (function (idx) {
        _hitZones.push({
          x: bx, y: by, w: btnW, h: btnH,
          action: function () { _selected = idx; _confirm(); }
        });
      })(i);
    }

    // Version / jam credit
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '16px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.fillText(i18n.t('title.jam_credit', 'DC Jam 2026'), cx, h - 36);
  }

  function _renderCallsign(w, h) {
    var cx = w / 2;

    // Header — brighter with glow
    _ctx.save();
    _ctx.shadowColor = GLOW_DIM;
    _ctx.shadowBlur = 8;
    _ctx.fillStyle = TEXT_WARM;
    _ctx.font = 'bold 28px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('create.callsign_header', 'CHOOSE YOUR CALLSIGN'), cx, h * 0.13);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    // Current callsign — large with layered glow for high contrast
    _ctx.save();
    _ctx.shadowColor = GLOW_SPREAD;
    _ctx.shadowBlur = 25;
    _ctx.fillStyle = '#fff';
    _ctx.font = 'bold 72px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
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
    _ctx.font = 'bold 36px ' + CRT_FONT;
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
    _ctx.font = 'bold 36px ' + CRT_FONT;
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
    _ctx.font = '22px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.fillText(CALLSIGNS[prevIdx], cx - 160, h * 0.48);
    _ctx.fillText(CALLSIGNS[nextIdx], cx + 160, h * 0.48);

    // Index counter
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '18px ' + CRT_FONT;
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
    _ctx.font = 'bold 26px ' + CRT_FONT;
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
    _ctx.font = '20px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('\u25C0 BACK', cx, backY + backBtnH / 2);
    _hitZones.push({
      x: backX, y: backY, w: backBtnW, h: backBtnH,
      action: function () { _back(); }
    });

    // Controls hint
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '16px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.fillText(i18n.t('create.callsign_hint', '[\u2190 \u2192] Browse   [Enter] Confirm   [Esc] Back'), cx, h * 0.92);
  }

  function _renderAvatar(w, h) {
    var cx = w / 2;

    // Header — brighter with glow
    _ctx.save();
    _ctx.shadowColor = GLOW_DIM;
    _ctx.shadowBlur = 8;
    _ctx.fillStyle = TEXT_WARM;
    _ctx.font = 'bold 28px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('create.avatar_header', 'CHOOSE YOUR CLASS'), cx, h * 0.05);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    // Callsign reminder — warm tint
    _ctx.fillStyle = GLOW_DIM;
    _ctx.font = '20px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
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
      _ctx.font = (isSelected ? 'bold ' : '') + '24px ' + CRT_FONT;
      _ctx.fillStyle = isSelected || isHovered ? '#fff' : TEXT_WARM;
      _ctx.fillText(AVATARS[i].name, ax + 64, ay + 30);

      // Description — now fits in the larger card
      _ctx.font = '16px ' + CRT_FONT;
      _ctx.fillStyle = isSelected || isHovered ? '#bbb' : TEXT_DIM;
      // Clip to card bounds for safety
      _ctx.save();
      _ctx.beginPath();
      _ctx.rect(ax + 64, ay + 45, cardW - 78, 40);
      _ctx.clip();
      _ctx.fillText(AVATARS[i].desc, ax + 64, ay + 62);
      _ctx.restore();

      // Stat badge (right side)
      _ctx.font = '13px ' + CRT_FONT;
      _ctx.textAlign = 'right';
      _ctx.fillStyle = isSelected ? GLOW_COLOR : 'rgba(176,255,189,0.4)';
      var statLabel = '+' + AVATARS[i].stat.toUpperCase();
      _ctx.fillText(statLabel, ax + cardW - 12, ay + 82);
      _ctx.textAlign = 'left';

      // Hit zone — click to SELECT + DEPLOY (hover already browsed to this card)
      (function (idx) {
        _hitZones.push({
          x: ax, y: ay, w: cardW, h: cardH,
          action: function () { _avatarIndex = idx; _deploy(); }
        });
      })(i);
    }

    // Determine which avatar to preview: hovered card takes priority over selected
    var previewIdx = _avatarIndex;
    if (_hoveredZoneIdx >= 0 && _hoveredZoneIdx < AVATARS.length) {
      previewIdx = _hoveredZoneIdx;
    }
    var ava = AVATARS[previewIdx];
    var isPreviewHovered = previewIdx !== _avatarIndex;

    // Detail section below grid — expanded with lore
    var detailY = startY + 3 * (cardH + gapY) + 8;

    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';

    // Emoji + Name on same row
    _ctx.save();
    _ctx.shadowColor = isPreviewHovered ? GLOW_DIM : GLOW_SPREAD;
    _ctx.shadowBlur = isPreviewHovered ? 8 : 15;
    _ctx.font = '44px serif';
    _ctx.fillStyle = '#fff';
    _ctx.fillText(ava.emoji, cx - 120, detailY + 6);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    _ctx.font = 'bold 28px ' + CRT_FONT;
    _ctx.fillStyle = isPreviewHovered ? TEXT_DIM : TEXT_WARM;
    _ctx.textAlign = 'left';
    _ctx.fillText(ava.name, cx - 80, detailY);

    // Short desc
    _ctx.font = '17px ' + CRT_FONT;
    _ctx.fillStyle = isPreviewHovered ? TEXT_MUTED : TEXT_DIM;
    _ctx.fillText(ava.desc, cx - 80, detailY + 26);

    // Lore text — word-wrapped
    _ctx.font = '14px ' + CRT_FONT;
    _ctx.fillStyle = isPreviewHovered ? 'rgba(136,128,112,0.7)' : 'rgba(200,180,120,0.6)';
    var loreLines = _wrapText(_ctx, ava.lore || '', gridW - 40);
    var loreY = detailY + 48;
    for (var li = 0; li < loreLines.length && li < 4; li++) {
      _ctx.fillText(loreLines[li], cx - gridW / 2 + 20, loreY + li * 18);
    }

    _ctx.textAlign = 'center';

    // DEPLOY button (centered below lore)
    var deployBtnW = 240;
    var deployBtnH = 48;
    var deployBtnX = cx - deployBtnW / 2;
    var deployBtnY = loreY + 4 * 18 + 8;
    var deployZoneIdx = _hitZones.length;
    var isDeployHovered = _isZoneHovered(deployZoneIdx);

    _drawGlowButton(_ctx, deployBtnX, deployBtnY, deployBtnW, deployBtnH, {
      selected: true, hovered: isDeployHovered, radius: 8
    });
    _ctx.font = 'bold 22px ' + CRT_FONT;
    _ctx.fillStyle = isDeployHovered ? '#fff' : GLOW_COLOR;
    _ctx.fillText('DEPLOY \u25B6', cx, deployBtnY + deployBtnH / 2);
    _hitZones.push({
      x: deployBtnX, y: deployBtnY, w: deployBtnW, h: deployBtnH,
      action: function () { _deploy(); }
    });

    // Back button (bottom center — matches callsign layout)
    var backBtnW = 160;
    var backBtnH = 44;
    var backX = cx - backBtnW / 2;
    var backY = h * 0.80;
    var backZoneIdx = _hitZones.length;

    _drawGlowButton(_ctx, backX, backY, backBtnW, backBtnH, {
      selected: false, hovered: _isZoneHovered(backZoneIdx)
    });
    _ctx.fillStyle = _isZoneHovered(backZoneIdx) ? '#fff' : TEXT_DIM;
    _ctx.font = '20px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('\u25C0 BACK', backX + backBtnW / 2, backY + backBtnH / 2);
    _hitZones.push({
      x: backX, y: backY, w: backBtnW, h: backBtnH,
      action: function () { _back(); }
    });

    // Controls hint
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '16px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.fillText(i18n.t('create.avatar_hint', '[\u2190 \u2192 \u2191 \u2193] Browse   [Enter] Deploy   [Esc] Back'), cx, h - 12);
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
    _ctx.font = 'bold 52px ' + CRT_FONT;
    _ctx.fillStyle = TEXT_WARM;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(_callsign, cx, h * 0.48);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    // Class
    _ctx.font = '26px ' + CRT_FONT;
    _ctx.fillStyle = TEXT_DIM;
    _ctx.textAlign = 'center';
    _ctx.fillText(ava.name + ' class', cx, h * 0.56);

    // Deploying message (blink after 600ms)
    if (_deployTimer > 400) {
      var blink = Math.sin(_deployTimer / 200) * 0.3 + 0.7;
      _ctx.globalAlpha = blink;
      _ctx.fillStyle = GLOW_COLOR;
      _ctx.font = 'bold 24px ' + CRT_FONT;
      _ctx.fillText(i18n.t('create.deploying', 'DEPLOYING...'), cx, h * 0.68);
    }

    _ctx.globalAlpha = 1;
  }

  // ── Settings overlay ───────────────────────────────────────────

  var SETTINGS_ITEMS = [
    // ── Audio & Display ──
    { key: 'sfx',    label: 'Sound Effects',    type: 'toggle', section: 'AUDIO & DISPLAY' },
    { key: 'music',  label: 'Music',            type: 'toggle' },
    { key: 'screen', label: 'Screen Shake',     type: 'toggle' },
    { key: 'invertY', label: 'Invert Free Look', type: 'toggle' },
    { key: 'lang',   label: 'Language',          type: 'toggle' },
    // ── Gamepad ──
    { key: '_header_gp', label: 'GAMEPAD', type: 'header' },
    { key: 'gpEnabled',   label: 'Gamepad Input',        type: 'toggle' },
    { key: 'gpDeadzone',  label: 'Stick Dead Zone',      type: 'cycle', values: ['Low (25%)', 'Normal (40%)', 'High (55%)'], map: [0.25, 0.40, 0.55] },
    { key: 'gpVibration', label: 'Vibration Feedback',   type: 'toggle' },
    // ── Accessibility ──
    { key: '_header_a11y', label: 'ACCESSIBILITY', type: 'header' },
    { key: 'quadStick',   label: 'QuadStick / Sip-Puff', type: 'toggle' },
    { key: 'holdConfirm', label: 'Hold-to-Confirm',      type: 'cycle', values: ['Off', '0.5s', '1.0s', '1.5s'], map: [0, 500, 1000, 1500] },
    { key: 'autoAim',     label: 'Aim Assist (Combat)',   type: 'toggle' },
    { key: 'largeText',   label: 'Large Text',            type: 'toggle' },
    { key: 'highContrast', label: 'High Contrast UI',     type: 'toggle' },
    { key: 'slowMode',    label: 'Reduced Game Speed',    type: 'toggle' }
  ];

  var _settings = {
    sfx: true, music: true, screen: true, invertY: false, lang: true,
    gpEnabled: true, gpDeadzone: 1, gpVibration: true,
    quadStick: false, holdConfirm: 0, autoAim: false,
    largeText: false, highContrast: false, slowMode: false
  };

  // Scroll state for settings panel
  var _settingsScroll = 0;
  var _settingsMaxScroll = 0;
  var _settingsAutoScroll = true;  // Only auto-scroll after keyboard nav, not every frame

  function _loadSettings() {
    try {
      var saved = localStorage.getItem('dg_settings');
      if (saved) {
        var parsed = JSON.parse(saved);
        for (var k in parsed) {
          if (_settings.hasOwnProperty(k)) _settings[k] = !!parsed[k];
        }
      }
      // Restore saved language
      var savedLang = localStorage.getItem('dg_lang');
      if (savedLang && typeof i18n !== 'undefined') {
        i18n.setLocale(savedLang);
      }
    } catch (e) { /* no localStorage — use defaults */ }
  }

  function _saveSettings() {
    try { localStorage.setItem('dg_settings', JSON.stringify(_settings)); }
    catch (e) { /* silent */ }
  }

  function _toggleSetting(navIdx) {
    var itemIdx = _navToItemIdx(navIdx);
    if (itemIdx < 0) return; // BACK button
    var item = SETTINGS_ITEMS[itemIdx];
    if (!item || item.type === 'header') return;

    // Language cycles through available locales
    if (item.key === 'lang') {
      var _codes = ['en', 'es', 'hi', 'ps'];
      var _cur = (typeof i18n !== 'undefined') ? i18n.getLocale() : 'en';
      var _idx = _codes.indexOf(_cur);
      var _next = _codes[(_idx + 1) % _codes.length];
      if (typeof i18n !== 'undefined') i18n.setLocale(_next);
      try { localStorage.setItem('dg_lang', _next); } catch (e2) {}
      if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-select', { volume: 0.5 });
      return;
    }

    // Cycle type: advance through values array
    if (item.type === 'cycle') {
      var cur = _settings[item.key] || 0;
      _settings[item.key] = (cur + 1) % item.values.length;
      _saveSettings();
      _applySettingSideEffect(item);
      if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-select', { volume: 0.5 });
      return;
    }

    // Toggle type
    _settings[item.key] = !_settings[item.key];
    _saveSettings();
    _applySettingSideEffect(item);
    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-select', { volume: 0.5 });
  }

  /** Apply runtime side-effects when a setting changes. */
  function _applySettingSideEffect(item) {
    if (!item) return;
    if (typeof AudioSystem !== 'undefined') {
      if (item.key === 'music') AudioSystem.setMusicVolume(_settings.music ? 1 : 0);
      if (item.key === 'sfx')   AudioSystem.setMasterVolume(_settings.sfx ? 1 : 0);
    }
    if (item.key === 'invertY' && typeof MouseLook !== 'undefined' && MouseLook.setInvertY) {
      MouseLook.setInvertY(_settings.invertY);
    }
    // Gamepad deadzone
    if (item.key === 'gpDeadzone' && typeof InputManager !== 'undefined' && InputManager.setGamepadDeadzone) {
      InputManager.setGamepadDeadzone(item.map[_settings.gpDeadzone] || 0.40);
    }
    // QuadStick mode: slow down game speed + increase hold timing
    if (item.key === 'quadStick') {
      // QuadStick enables high deadzone + slow mode + hold-to-confirm automatically
      if (_settings.quadStick) {
        _settings.gpDeadzone = 2;     // High (55%)
        _settings.holdConfirm = 2;    // 1.0s
        _settings.slowMode = true;
        _saveSettings();
      }
    }
  }

  // ── Credits overlay ───────────────────────────────────────────────
  function _renderCredits(w, h) {
    // Dim overlay
    _ctx.fillStyle = 'rgba(0,0,0,0.85)';
    _ctx.fillRect(0, 0, w, h);

    var cx = w / 2;
    var panelW = 520;
    var panelH = Math.min(h - 40, 600);
    var panelX = cx - panelW / 2;
    var panelY = h / 2 - panelH / 2;

    // Panel background with glow border
    _drawGlowButton(_ctx, panelX, panelY, panelW, panelH, {
      selected: true, radius: 12
    });

    // ── Measure content height ──
    var headerH  = 44;
    var subH     = 30;
    var nameH    = 36;
    var spacerH  = 20;
    var totalH   = 0;
    for (var ci = 0; ci < CREDITS_DATA.length; ci++) {
      var t = CREDITS_DATA[ci].type;
      totalH += t === 'header' ? headerH : t === 'sub' ? subH : t === 'name' ? nameH : spacerH;
    }
    totalH += 60; // BACK button space

    var contentTop = panelY + 20;
    var contentH   = panelH - 40;
    _creditsMaxScroll = Math.max(0, totalH - contentH);
    _creditsScroll = Math.max(0, Math.min(_creditsMaxScroll, _creditsScroll));

    // Clip to content area
    _ctx.save();
    _ctx.beginPath();
    _ctx.rect(panelX, contentTop, panelW, contentH);
    _ctx.clip();

    var drawY = contentTop - _creditsScroll;

    for (var ri = 0; ri < CREDITS_DATA.length; ri++) {
      var entry = CREDITS_DATA[ri];
      var ey;

      if (entry.type === 'header') {
        ey = drawY + headerH / 2;
        if (ey > contentTop - headerH && ey < contentTop + contentH + headerH) {
          _ctx.save();
          _ctx.shadowColor = GLOW_DIM;
          _ctx.shadowBlur = 8;
          _ctx.font = 'bold 20px ' + CRT_FONT;
          _ctx.fillStyle = 'rgba(200,180,120,0.7)';
          _ctx.textAlign = 'center';
          _ctx.textBaseline = 'middle';
          _ctx.fillText(entry.label, cx, ey);
          _ctx.shadowBlur = 0;
          _ctx.restore();
        }
        drawY += headerH;

      } else if (entry.type === 'sub') {
        ey = drawY + subH / 2;
        if (ey > contentTop - subH && ey < contentTop + contentH + subH) {
          _ctx.font = '16px ' + CRT_FONT;
          _ctx.fillStyle = TEXT_DIM;
          _ctx.textAlign = 'center';
          _ctx.textBaseline = 'middle';
          _ctx.fillText(entry.label, cx, ey);
        }
        drawY += subH;

      } else if (entry.type === 'name') {
        ey = drawY + nameH / 2;
        if (ey > contentTop - nameH && ey < contentTop + contentH + nameH) {
          _ctx.save();
          _ctx.shadowColor = GLOW_SPREAD;
          _ctx.shadowBlur = 6;
          _ctx.font = '24px ' + CRT_FONT;
          _ctx.fillStyle = '#fff';
          _ctx.textAlign = 'center';
          _ctx.textBaseline = 'middle';
          _ctx.fillText(entry.label, cx, ey);
          _ctx.shadowBlur = 0;
          _ctx.restore();
        }
        drawY += nameH;

      } else {
        // spacer
        drawY += spacerH;
      }
    }

    // BACK button
    var backBtnW = 200;
    var backBtnH = 42;
    var backX = cx - backBtnW / 2;
    var backY = drawY + 10;
    var backZoneIdx = _hitZones.length;
    var isBackHovered = _isZoneHovered(backZoneIdx);

    if (backY > contentTop - 50 && backY < contentTop + contentH + 50) {
      _drawGlowButton(_ctx, backX, backY, backBtnW, backBtnH, {
        selected: true, hovered: isBackHovered, radius: 8
      });
      _ctx.fillStyle = isBackHovered ? '#fff' : TEXT_WARM;
      _ctx.font = 'bold 20px ' + CRT_FONT;
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText('\u2716 BACK', cx, backY + backBtnH / 2);

      _hitZones.push({
        x: backX, y: backY, w: backBtnW, h: backBtnH,
        clipY: contentTop, clipH: contentH,
        action: function () { _creditsOpen = false; }
      });
    }

    _ctx.restore(); // End clip

    // Scrollbar
    if (_creditsMaxScroll > 0) {
      var sbX = panelX + panelW - 14;
      var sbW = 10;
      var sbH = contentH;
      var thumbH = Math.max(20, sbH * (contentH / (totalH || 1)));
      var thumbY = contentTop + (sbH - thumbH) * (_creditsScroll / (_creditsMaxScroll || 1));

      _ctx.fillStyle = 'rgba(255,255,255,0.06)';
      _ctx.fillRect(sbX, contentTop, sbW, sbH);
      _ctx.fillStyle = 'rgba(200,180,120,0.4)';
      _ctx.fillRect(sbX, thumbY, sbW, thumbH);
    }

    // Hint bar
    _ctx.textAlign = 'center';
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '14px ' + CRT_FONT;
    _ctx.fillText('[Esc] Back   [Scroll] Navigate', cx, panelY + panelH - 14);
  }

  function _renderSettings(w, h) {
    // Dim overlay
    _ctx.fillStyle = 'rgba(0,0,0,0.8)';
    _ctx.fillRect(0, 0, w, h);

    var cx = w / 2;
    var panelW = 500;
    var panelH = Math.min(h - 40, 580);
    var panelX = cx - panelW / 2;
    var panelY = h / 2 - panelH / 2;

    // Panel background with glow border
    _drawGlowButton(_ctx, panelX, panelY, panelW, panelH, {
      selected: true, radius: 12
    });

    // Title (fixed, not scrolled)
    _ctx.save();
    _ctx.shadowColor = GLOW_DIM;
    _ctx.shadowBlur = 10;
    _ctx.fillStyle = TEXT_WARM;
    _ctx.font = 'bold 32px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('SETTINGS', cx, panelY + 36);
    _ctx.shadowBlur = 0;
    _ctx.restore();

    // Gamepad connection indicator
    var gpConnected = (typeof InputManager !== 'undefined' && InputManager.isGamepadConnected());
    _ctx.font = '14px ' + CRT_FONT;
    _ctx.textAlign = 'right';
    _ctx.fillStyle = gpConnected ? 'rgba(80,220,120,0.8)' : 'rgba(180,80,80,0.5)';
    _ctx.fillText(gpConnected ? '\uD83C\uDFAE Connected' : '\uD83C\uDFAE No Gamepad', panelX + panelW - 24, panelY + 36);
    _ctx.textAlign = 'left';

    // ── Scrollable content area ──
    var contentTop = panelY + 64;
    var contentH = panelH - 64 - 44; // Reserve bottom 44px for hint bar
    var rowX = panelX + 24;
    var rowW = panelW - 48;
    var lineH = 46;
    var headerH = 32;

    // Calculate total content height
    var totalH = 0;
    for (var ci = 0; ci < SETTINGS_ITEMS.length; ci++) {
      totalH += SETTINGS_ITEMS[ci].type === 'header' ? headerH : lineH;
    }
    totalH += lineH; // BACK button
    _settingsMaxScroll = Math.max(0, totalH - contentH);

    // Auto-scroll to keep selected item visible (only after keyboard nav)
    if (_settingsAutoScroll) {
      var selY = 0;
      var navCount = 0;
      for (var ai = 0; ai < SETTINGS_ITEMS.length; ai++) {
        if (SETTINGS_ITEMS[ai].type === 'header') { selY += headerH; continue; }
        if (navCount === _settingsSelected) break;
        navCount++;
        selY += lineH;
      }
      if (selY - _settingsScroll < 0) _settingsScroll = selY;
      if (selY + lineH - _settingsScroll > contentH) _settingsScroll = selY + lineH - contentH;
    }
    _settingsScroll = Math.max(0, Math.min(_settingsMaxScroll, _settingsScroll));

    // Clip to content area
    _ctx.save();
    _ctx.beginPath();
    _ctx.rect(panelX, contentTop, panelW, contentH);
    _ctx.clip();

    // Render items
    var drawY = contentTop - _settingsScroll;
    var navIdx = 0;

    for (var ri = 0; ri < SETTINGS_ITEMS.length; ri++) {
      var item = SETTINGS_ITEMS[ri];

      // Section header
      if (item.type === 'header') {
        var hy = drawY + headerH / 2;
        if (hy > contentTop - headerH && hy < contentTop + contentH + headerH) {
          // Divider line
          _ctx.strokeStyle = 'rgba(200,180,120,0.25)';
          _ctx.lineWidth = 1;
          _ctx.beginPath();
          _ctx.moveTo(rowX, drawY + 4);
          _ctx.lineTo(rowX + rowW, drawY + 4);
          _ctx.stroke();

          _ctx.font = 'bold 16px ' + CRT_FONT;
          _ctx.fillStyle = 'rgba(200,180,120,0.6)';
          _ctx.textAlign = 'left';
          _ctx.textBaseline = 'middle';
          _ctx.fillText(item.label, rowX + 8, drawY + headerH / 2 + 4);
        }
        drawY += headerH;
        continue;
      }

      var y = drawY + lineH / 2;
      var isSel = navIdx === _settingsSelected;
      var rowTop = drawY;
      var rowH = lineH - 4;

      // Only render if visible
      if (y > contentTop - lineH && y < contentTop + contentH + lineH) {
        var zoneIdx = _hitZones.length;
        var isHovered = _isZoneHovered(zoneIdx);

        // Row glow button
        _drawGlowButton(_ctx, rowX, rowTop, rowW, rowH, {
          selected: isSel, hovered: isHovered, radius: 6
        });

        // Label
        _ctx.font = (isSel ? 'bold ' : '') + '20px ' + CRT_FONT;
        _ctx.fillStyle = isSel || isHovered ? '#fff' : TEXT_WARM;
        _ctx.textAlign = 'left';
        _ctx.textBaseline = 'middle';
        _ctx.fillText(item.label, rowX + 16, y);

        // Value display
        _ctx.textAlign = 'right';
        if (item.key === 'lang') {
          var _langLabels = { en: 'English', es: 'Español', hi: 'हिन्दी', ps: 'پښتو' };
          var _curLang = (typeof i18n !== 'undefined') ? i18n.getLocale() : 'en';
          _ctx.fillStyle = GLOW_COLOR;
          _ctx.font = 'bold 20px ' + CRT_FONT;
          _ctx.fillText(_langLabels[_curLang] || _curLang, rowX + rowW - 16, y);
        } else if (item.type === 'cycle') {
          var cycleVal = _settings[item.key] || 0;
          _ctx.fillStyle = GLOW_COLOR;
          _ctx.font = 'bold 20px ' + CRT_FONT;
          _ctx.fillText(item.values[cycleVal] || '?', rowX + rowW - 16, y);
        } else {
          var isOn = !!_settings[item.key];
          _ctx.fillStyle = isOn ? GLOW_COLOR : '#c44';
          _ctx.font = 'bold 20px ' + CRT_FONT;
          _ctx.fillText(isOn ? 'ON' : 'OFF', rowX + rowW - 16, y);
        }

        // Hit zone (only for visible items, clip-aware)
        (function (idx) {
          _hitZones.push({
            x: rowX, y: rowTop, w: rowW, h: rowH,
            clipY: contentTop, clipH: contentH,
            action: function () { _settingsSelected = idx; _toggleSetting(idx); }
          });
        })(navIdx);
      }

      drawY += lineH;
      navIdx++;
    }

    // BACK button
    var backY = drawY;
    var backBtnW = 200;
    var backBtnH = 42;
    var backX = cx - backBtnW / 2;
    var isBackSel = _settingsSelected >= navIdx;
    var backZoneIdx = _hitZones.length;
    var isBackHovered = _isZoneHovered(backZoneIdx);

    if (backY > contentTop - lineH && backY < contentTop + contentH + lineH) {
      _drawGlowButton(_ctx, backX, backY, backBtnW, backBtnH, {
        selected: isBackSel, hovered: isBackHovered, radius: 8
      });
      _ctx.fillStyle = isBackSel || isBackHovered ? '#fff' : TEXT_DIM;
      _ctx.font = 'bold 20px ' + CRT_FONT;
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText('\u2716 BACK', cx, backY + backBtnH / 2);

      _hitZones.push({
        x: backX, y: backY, w: backBtnW, h: backBtnH,
        clipY: contentTop, clipH: contentH,
        action: function () { _settingsOpen = false; }
      });
    }

    _ctx.restore(); // End clip

    // ── Scrollbar (right edge) ──
    if (_settingsMaxScroll > 0) {
      var sbX = panelX + panelW - 14;
      var sbW = 10;
      var sbH = contentH;
      var thumbH = Math.max(20, sbH * (contentH / (totalH || 1)));
      var thumbY = contentTop + (sbH - thumbH) * (_settingsScroll / (_settingsMaxScroll || 1));

      // Track
      _ctx.fillStyle = 'rgba(255,255,255,0.06)';
      _ctx.fillRect(sbX, contentTop, sbW, sbH);
      // Thumb
      _ctx.fillStyle = 'rgba(200,180,120,0.4)';
      _ctx.fillRect(sbX, thumbY, sbW, thumbH);

      // Clickable scrollbar hit zone — maps click Y to scroll position
      (function (sTop, sH, sThumbH, sMaxScroll) {
        _hitZones.push({
          x: sbX - 4, y: sTop, w: sbW + 8, h: sH,
          action: function () {
            // Map click Y to scroll fraction
            var clickY = _mouseY - sTop - sThumbH / 2;
            var range = sH - sThumbH;
            if (range <= 0) return;
            var frac = Math.max(0, Math.min(1, clickY / range));
            _settingsScroll = Math.round(frac * sMaxScroll);
          }
        });
      })(contentTop, sbH, thumbH, _settingsMaxScroll);
    }

    // Hint bar (fixed at bottom)
    _ctx.textAlign = 'center';
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '14px ' + CRT_FONT;
    var hintText = gpConnected
      ? '[Esc/B] Back   [Enter/A] Toggle   [\u2191\u2193] Navigate'
      : '[Esc] Back   [Enter] Toggle   [\u2191\u2193] Navigate';
    _ctx.fillText(hintText, cx, panelY + panelH - 14);
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
    _creditsOpen = false;
    _creditsScroll = 0;
    _callsignIndex = 0;
    _callsign = CALLSIGNS[0];
    _avatarIndex = 0;
    _deployTimer = 0;
    _mouseX = -1;
    _mouseY = -1;
    _hoveredZoneIdx = -1;
    _loadSettings();
    _bindInput();

    // Start title music
    if (typeof AudioMusicManager !== 'undefined') {
      AudioMusicManager.startTitle();
    }
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
