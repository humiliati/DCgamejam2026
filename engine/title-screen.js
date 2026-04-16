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

  // ── Vaporwave theme colors ───────────────────────────────────────
  // Unified with DeployCutscene's synthwave palette so title → callsign →
  // class selection → deploy cutscene all read as one visual aesthetic.
  // Canonical palette source: engine/deploy-cutscene.js CSS.
  //   BG_DEEP      #120b12   panel black-purple
  //   BG_PURPLE    #2e0d3f   main backdrop
  //   MAGENTA      #b811c6   glow accent
  //   CYAN         #2afce0   grid / selected border
  //   SUN_YELLOW   #fcff1a   hot title accent
  //   SUN_AMBER    #fbe54f   warm accent
  var GLOW_COLOR       = 'rgb(42,252,224)';              // cyan #2afce0
  var GLOW_SPREAD      = 'rgba(184,17,198,0.78)';        // magenta spread
  var GLOW_DIM         = 'rgba(184,17,198,0.25)';
  var PAPER_BG         = 'rgba(18,11,18,0.92)';          // #120b12 @ 0.92
  var PAPER_CARD       = 'rgba(46,13,63,0.92)';          // #2e0d3f @ 0.92
  var PAPER_CARD_SEL   = 'rgba(42,252,224,0.10)';        // cyan wash
  var PAPER_BORDER     = 'rgba(184,17,198,0.45)';        // magenta border
  var PAPER_BORDER_SEL = 'rgba(42,252,224,0.85)';        // cyan selected
  var TEXT_WARM         = '#e8e0ff';                     // cool lavender-white
  var TEXT_DIM          = '#8890c0';                     // muted lavender
  var TEXT_MUTED        = '#544870';                     // deep muted purple
  var ACCENT_YELLOW     = '#fcff1a';                     // hot title glow
  var ACCENT_MAGENTA    = '#b811c6';
  var ACCENT_CYAN       = '#2afce0';

  // ── CRT font stack (console, NOT Courier) ─────────────────────────
  var CRT_FONT = "'Classic Console Neue', Consolas, Monaco, 'Lucida Console', monospace";

  // ── Hover tracking ────────────────────────────────────────────────
  var _mouseX = -1, _mouseY = -1;
  var _hoveredZoneIdx = -1;

  // ── Freelook ring (for parallax slide) ───────────────────────────
  // Mirrors the in-game MouseLook ring: inner 60% of the ring radius is
  // a dead zone, outer 40% drives a signed (-1..1) look offset on each
  // axis with a quadratic-ish acceleration curve. The title screen uses
  // it to slide the horizon parallax layers (canton, waterfront, arch)
  // back and forth when the cursor drifts toward the edges, so the
  // backdrop feels alive even while the menus are static.
  var LOOK_HITBOX_FRAC   = 0.45;  // ring radius as fraction of min(w,h)
  var LOOK_DEAD_FRAC     = 0.55;  // inner dead zone
  var LOOK_ACCEL_POWER   = 1.8;
  var LOOK_SMOOTH        = 0.08;  // lerp weight per render frame
  var _lookTargetX       = 0;     // raw target in [-1, 1]
  var _lookTargetY       = 0;
  var _lookX             = 0;     // smoothed output
  var _lookY             = 0;

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

  var TITLE_OPTIONS = ['new_game', 'continue', 'credits', 'placeholder_settings'];

  // ── Slot-picker state (phase 4) ───────────────────────────────────
  // Rows: 0 = autosave, 1..3 = slot_0..slot_2, 4 = BACK
  var SAVE_SLOT_IDS  = ['autosave', 'slot_0', 'slot_1', 'slot_2'];
  var SAVE_SLOT_BACK = SAVE_SLOT_IDS.length; // index of the BACK row
  var _slotPickerSelected = 0;
  var _slotPickerError   = null; // transient error text
  var _slotPickerErrorT  = 0;    // ms remaining

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

    // Unified hover→keyboard sync: if the hovered zone declares a
    // hoverSelect callback, run it so keyboard state (_settingsSelected,
    // _selected, etc.) lines up with whichever row the mouse is over.
    // Keyboard and mouse never disagree after this.
    _applyHoverSelect();
  }

  // Call the hoverSelect callback on the currently-hovered hit zone, if
  // any. Used from _onMouseMove (mouse-driven) and from the end of
  // render() (cursor didn't move but layout did — eg. scroll, phase
  // change, freshly-added row).
  function _applyHoverSelect() {
    if (_hoveredZoneIdx < 0 || _hoveredZoneIdx >= _hitZones.length) return;
    var z = _hitZones[_hoveredZoneIdx];
    if (z && typeof z.hoverSelect === 'function') {
      z.hoverSelect();
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
    } else if (_phase === 4) {
      var n4 = SAVE_SLOT_IDS.length + 1;
      _slotPickerSelected = (_slotPickerSelected - 1 + n4) % n4;
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
    } else if (_phase === 4) {
      var n4d = SAVE_SLOT_IDS.length + 1;
      _slotPickerSelected = (_slotPickerSelected + 1) % n4d;
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
        _phase = 4;
        _slotPickerSelected = 0;
        _slotPickerError = null;
        _slotPickerErrorT = 0;
      } else if (_selected === 2) {
        _creditsOpen = true;
        _creditsScroll = 0;
      } else if (_selected === 3) {
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
    } else if (_phase === 4) {
      if (_slotPickerSelected === SAVE_SLOT_BACK) {
        _phase = 0;
        _selected = 1; // keep cursor on CONTINUE
      } else {
        _loadSelectedSlot(SAVE_SLOT_IDS[_slotPickerSelected]);
      }
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
    } else if (_phase === 4) {
      _phase = 0;
      _selected = 1;
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

    // Begin the run's seed lifecycle BEFORE any class-stat rolls so the roll
    // is reproducible from the run seed. If a ?seed= URL param was decoded
    // in Game.init, it will have been stashed on window._pendingRunSeed.
    if (typeof SeededRNG !== 'undefined' && typeof SeededRNG.beginRun === 'function') {
      var pending = (typeof window !== 'undefined' && window._pendingRunSeed != null)
        ? window._pendingRunSeed : null;
      SeededRNG.beginRun(pending);
      if (typeof window !== 'undefined') window._pendingRunSeed = null;
    }

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
        p[stats[SeededRNG.randInt(0, 2)]] += 3;
        p.maxHp += SeededRNG.randInt(0, 2);
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

    // ── Freelook ring update ───────────────────────────────────────
    // Drive the parallax slide from the current mouse position using
    // the same inner-dead-zone / outer-acceleration-curve model as the
    // in-game MouseLook ring. Cursor near center = no slide; cursor
    // drifting toward the edge = smooth horizontal/vertical parallax.
    _updateLookTarget(w, h);
    _lookX += (_lookTargetX - _lookX) * LOOK_SMOOTH;
    _lookY += (_lookTargetY - _lookY) * LOOK_SMOOTH;

    // Background: Floor 3 east-facing arch view (frontier_title preset).
    // Canton/Vivec silhouette + drifting magenta cloud bands up top,
    // ocean-floor porthole view down below.
    if (typeof Skybox !== 'undefined') {
      Skybox.renderFull(_ctx, w, h, performance.now(), 'frontier_title');
    } else {
      _ctx.fillStyle = '#120b22';
      _ctx.fillRect(0, 0, w, h);
    }

    // ── Horizon band parallax (canton / waterfront / grand arch) ──
    // Layers slide by depth-weighted fraction of the look offset so the
    // near grand arch shifts most and the distant canton shifts least.
    _drawVaporwaveEmbellishments(w, h, _lookX, _lookY);

    // Subtle magenta vaporwave border accent
    _ctx.strokeStyle = PAPER_BORDER;
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
    } else if (_phase === 4) {
      _renderSlotPicker(w, h);
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
    // Sync keyboard state to whatever the cursor is over now. Without
    // this, a row that scrolls / appears under a stationary cursor
    // would light up as "hovered" while keyboard selection stayed on
    // a different row — the classic disjoint state.
    _applyHoverSelect();
  }

  /**
   * Compute freelook target (_lookTargetX/Y) from current mouse position.
   * Hidden circular ring centered on the canvas — inner 55% is a dead
   * zone, outer 45% drives a quadratic acceleration curve on each axis.
   * When the cursor is off-canvas (_mouseX<0) the target collapses to 0
   * so the parallax drifts back to rest.
   */
  function _updateLookTarget(w, h) {
    if (_mouseX < 0 || _mouseY < 0) {
      _lookTargetX = 0;
      _lookTargetY = 0;
      return;
    }
    var cx = w / 2;
    var cy = h / 2;
    var dx = _mouseX - cx;
    var dy = _mouseY - cy;
    var ringR = Math.min(w, h) * LOOK_HITBOX_FRAC;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.0001) {
      _lookTargetX = 0;
      _lookTargetY = 0;
      return;
    }
    var radial = Math.min(1, dist / ringR);
    if (radial < LOOK_DEAD_FRAC) {
      _lookTargetX = 0;
      _lookTargetY = 0;
      return;
    }
    // Remap [deadFrac..1] → [0..1] then apply acceleration curve
    var remapped = (radial - LOOK_DEAD_FRAC) / (1 - LOOK_DEAD_FRAC);
    var accel = Math.pow(remapped, LOOK_ACCEL_POWER);
    var nx = dx / dist;
    var ny = dy / dist;
    _lookTargetX = nx * accel;
    _lookTargetY = ny * accel;
  }

  // ── Drawing helpers ───────────────────────────────────────────────

  /**
   * Horizon band parallax — adapted from docs/vivec-parallax-concept.html.
   * Drawn on top of Skybox.renderFull between the sky and the water line.
   *
   * Layer stack (back → front):
   *   L1 — Canton skyline      (Vivec megablocks + temple spire)
   *   L2 — Industrial waterfront (warehouses, cranes, bridges)
   *   L3 — Grand Arch facade   (Floor 4 gate, focal point, cyan arch glow)
   *
   * The skybox's own shaped mountain (Mt. Tabor analog at depth 0.9) stays
   * as the farthest back layer, so we skip L0/L1 from the concept doc.
   * Vivec's warm amber palette is re-tinted to vaporwave: deep purple/black
   * silhouettes, magenta canton window lights, cyan arch spill.
   */
  function _drawVaporwaveEmbellishments(w, h, lookX, lookY) {
    var horizonY = Math.floor(h / 2);  // Skybox.renderFull splits at h/2
    var ctx = _ctx;

    // Parallax slide budgets — horizontal is generous, vertical subtle.
    // Canton = deepest (moves least), waterfront = mid, arch = nearest
    // (moves most). lookX/lookY are signed offsets in [-1, 1]. Names
    // deliberately NOT "lx/ly" — canton's light-position loop reuses
    // those via `var` hoisting, which would clobber outer params.
    var look_x = lookX || 0;
    var look_y = lookY || 0;
    var CANTON_PX = Math.min(w, h) * 0.022;
    var WATER_PX  = Math.min(w, h) * 0.038;
    var ARCH_PX   = Math.min(w, h) * 0.065;
    var V_PX      = Math.min(w, h) * 0.010;
    var cantonDX  = -look_x * CANTON_PX;  // cursor-right pushes scene left
    var waterDX   = -look_x * WATER_PX;
    var archDX    = -look_x * ARCH_PX;
    var cantonDY  = -look_y * V_PX * 0.4;
    var waterDY   = -look_y * V_PX * 0.7;
    var archDY    = -look_y * V_PX;

    // Deterministic 1D value noise — mirrors vivec-parallax-concept.html
    function vHash(x) {
      x = ((x >> 16) ^ x) * 0x45d9f3b;
      x = ((x >> 16) ^ x) * 0x45d9f3b;
      x = (x >> 16) ^ x;
      return ((x & 0x7fffffff) / 0x7fffffff);
    }
    function vNoise(x) {
      var xi = Math.floor(x);
      var xf = x - xi;
      var t = xf * xf * (3 - 2 * xf);
      return vHash(xi) * (1 - t) + vHash(xi + 1) * t;
    }

    ctx.save();

    // ═══ LAYER 1 — Canton skyline (Vivec megablocks + temple spire) ═══
    ctx.save();
    ctx.translate(cantonDX, cantonDY);
    ctx.fillStyle = 'rgba(14,8,28,0.94)';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (var cx = 0; cx < w; cx++) {
      var wx = cx * 0.006 + 200;

      // Base canton mass — wide blocks, step-quantized into Vivec tiers
      var base = vNoise(wx + 800) * 0.6 + vNoise(wx * 3 + 850) * 0.3;
      var canton = Math.floor(base * 4) / 4;
      canton = Math.max(canton, base * 0.5);

      // Temple spire — tall narrow peak slightly right of center
      var spireCenter = w * 0.55;
      var spireDist = Math.abs(cx - spireCenter);
      var spire = 0;
      if (spireDist < 22) spire = (1 - spireDist / 22) * 0.9;

      // Bridge-tower pylons — periodic tall spikes
      var pylon = vNoise(wx * 5 + 900);
      var pylonSpike = (pylon > 0.82) ? (pylon - 0.82) * 4.0 : 0;

      var mh = (canton + pylonSpike + spire) * h * 0.16;

      // City is EAST = right 80% of screen, fade in from left
      var cityFade = Math.min(1, Math.max(0, (cx - w * 0.18) / (w * 0.12)));
      mh *= cityFade;

      ctx.lineTo(cx, horizonY - mh);
    }
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();

    // Canton window lights — magenta/pink pixels scattered on canton mass
    for (var li = 0; li < 180; li++) {
      var lx = w * 0.22 + vHash(li * 31 + 1) * w * 0.75;
      var lyT = vHash(li * 37 + 3);
      var ly = horizonY - lyT * h * 0.14;
      if (ly < horizonY - 3 && vHash(li * 41 + 5) > 0.42) {
        var la = 0.35 + vHash(li * 43 + 7) * 0.55;
        // Mix magenta and cyan lights (80/20)
        if (vHash(li * 47 + 9) > 0.8) {
          ctx.fillStyle = 'rgba(42,252,224,' + la.toFixed(2) + ')';
        } else {
          ctx.fillStyle = 'rgba(252,80,198,' + la.toFixed(2) + ')';
        }
        ctx.fillRect(Math.floor(lx), Math.floor(ly), 2, 1);
      }
    }
    ctx.restore();  // End canton layer transform

    // ═══ LAYER 2 — Industrial waterfront (cranes, bridges, warehouses) ═══
    ctx.save();
    ctx.translate(waterDX, waterDY);
    ctx.fillStyle = 'rgba(8,4,16,0.96)';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (var ix = 0; ix < w; ix++) {
      var iwx = ix * 0.01 + 400;

      // Warehouse roofline — mid-height, step-quantized
      var roof = vNoise(iwx + 600) * 0.5 + vNoise(iwx * 2.5 + 650) * 0.25;
      roof = Math.floor(roof * 6) / 6;

      // Crane booms — tall thin spikes
      var crane = vNoise(iwx * 4 + 700);
      var craneSpike = 0;
      if (crane > 0.80) {
        craneSpike = (crane - 0.80) * 5.0;
        var arm = vNoise(iwx * 8 + 750);
        if (arm > 0.7) craneSpike += 0.06;
      }

      // Smokestack — periodic thin tall elements
      var stack = vNoise(iwx * 6 + 720);
      var stackSpike = (stack > 0.85) ? (stack - 0.85) * 6.0 : 0;

      // Bridge arcs — Burnside/Steel analogs
      var bridgeArc = 0;
      var b1 = Math.abs(ix - w * 0.40) / (w * 0.08);
      if (b1 < 1) bridgeArc = Math.max(bridgeArc, (1 - b1 * b1) * 0.15);
      if (Math.abs(ix - w * 0.34) < 3 || Math.abs(ix - w * 0.46) < 3) bridgeArc = Math.max(bridgeArc, 0.35);
      var b2 = Math.abs(ix - w * 0.72) / (w * 0.06);
      if (b2 < 1) bridgeArc = Math.max(bridgeArc, (1 - b2 * b2) * 0.12);
      if (Math.abs(ix - w * 0.67) < 3 || Math.abs(ix - w * 0.77) < 3) bridgeArc = Math.max(bridgeArc, 0.30);

      var imh = (roof + craneSpike + stackSpike + bridgeArc) * h * 0.10;
      var indFade = Math.min(1, Math.max(0, (ix - w * 0.13) / (w * 0.18)));
      imh *= indFade;

      ctx.lineTo(ix, horizonY - imh);
    }
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();

    // Magenta waterfront rim light — replaces vivec's amber glow
    var wfGrad = ctx.createLinearGradient(0, horizonY - 16, 0, horizonY);
    wfGrad.addColorStop(0, 'rgba(184,17,198,0)');
    wfGrad.addColorStop(1, 'rgba(252,80,198,0.22)');
    ctx.fillStyle = wfGrad;
    ctx.fillRect(w * 0.18, horizonY - 16, w * 0.82, 16);

    ctx.restore();  // End waterfront layer transform

    // ═══ LAYER 3 — Grand Arch facade (Floor 4 gate, focal point) ═══
    ctx.save();
    ctx.translate(archDX, archDY);
    var archCenter = Math.floor(w * 0.52);
    var archWidth  = Math.max(60, Math.floor(w * 0.065));
    var archHeight = Math.floor(h * 0.18);
    var wallH      = Math.floor(h * 0.075);
    var wallExtend = Math.floor(w * 0.14);

    // Wall flanks
    ctx.fillStyle = '#0f0620';
    ctx.fillRect(archCenter - archWidth / 2 - wallExtend, horizonY - wallH, wallExtend, wallH);
    ctx.fillRect(archCenter + archWidth / 2, horizonY - wallH, wallExtend, wallH);

    // Arch pillars + top bar
    ctx.fillStyle = '#180a2a';
    ctx.fillRect(archCenter - archWidth / 2 - 10, horizonY - archHeight, 10, archHeight);
    ctx.fillRect(archCenter + archWidth / 2,      horizonY - archHeight, 10, archHeight);
    ctx.fillRect(archCenter - archWidth / 2 - 10, horizonY - archHeight, archWidth + 20, 12);

    // Decorative cap — magenta highlight
    ctx.fillStyle = '#2a0d3d';
    ctx.fillRect(archCenter - archWidth / 2 - 14, horizonY - archHeight - 5, archWidth + 28, 5);

    // Arch opening — cyan light spilling through (replaces vivec amber)
    var archGlow = ctx.createRadialGradient(
      archCenter, horizonY - archHeight * 0.35, 8,
      archCenter, horizonY - archHeight * 0.35, archWidth * 0.75
    );
    archGlow.addColorStop(0.0, 'rgba(42,252,224,0.38)');
    archGlow.addColorStop(0.5, 'rgba(184,17,198,0.18)');
    archGlow.addColorStop(1.0, 'rgba(184,17,198,0)');
    ctx.fillStyle = archGlow;
    ctx.fillRect(archCenter - archWidth / 2 - 4, horizonY - archHeight + 12, archWidth + 8, archHeight - 12);

    // Lantern dots on arch pillars + magenta halos
    ctx.fillStyle = 'rgba(252,80,198,0.95)';
    ctx.fillRect(archCenter - archWidth / 2 - 5, horizonY - archHeight + 22, 3, 3);
    ctx.fillRect(archCenter + archWidth / 2 + 2, horizonY - archHeight + 22, 3, 3);
    ctx.fillStyle = 'rgba(252,80,198,0.18)';
    ctx.beginPath();
    ctx.arc(archCenter - archWidth / 2 - 4, horizonY - archHeight + 23, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(archCenter + archWidth / 2 + 4, horizonY - archHeight + 23, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();  // End Grand Arch layer transform

    // Thin cyan horizon line — sky/water seam highlight (no parallax)
    ctx.fillStyle = 'rgba(42,252,224,0.22)';
    ctx.fillRect(w * 0.12, horizonY - 1, w * 0.88, 1);

    ctx.restore();  // End outer _drawVaporwaveEmbellishments save
  }

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
    ctx.fillStyle = hovered ? 'rgba(46,13,63,0.95)' : (selected ? PAPER_CARD_SEL : PAPER_BG);
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
      grad.addColorStop(0, 'rgba(42,252,224,0)');
      grad.addColorStop(0.5, hovered ? 'rgba(42,252,224,0.30)' : 'rgba(42,252,224,0.15)');
      grad.addColorStop(1, 'rgba(42,252,224,0)');
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
    // Scroll body — deep purple vaporwave panel
    var scrollGrad = _ctx.createLinearGradient(scrollX, scrollY, scrollX, scrollY + scrollH);
    scrollGrad.addColorStop(0, 'rgba(46,13,63,0.85)');
    scrollGrad.addColorStop(0.1, 'rgba(18,11,18,0.92)');
    scrollGrad.addColorStop(0.9, 'rgba(18,11,18,0.92)');
    scrollGrad.addColorStop(1, 'rgba(46,13,63,0.85)');
    _roundRect(_ctx, scrollX, scrollY, scrollW, scrollH, 6);
    _ctx.fillStyle = scrollGrad;
    _ctx.fill();
    // Scroll border — magenta accent
    _ctx.strokeStyle = PAPER_BORDER;
    _ctx.lineWidth = 1.5;
    _roundRect(_ctx, scrollX, scrollY, scrollW, scrollH, 6);
    _ctx.stroke();
    // Ruled lines — cyan hairlines
    _ctx.strokeStyle = 'rgba(42,252,224,0.08)';
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
    _ctx.fillStyle = 'rgba(252,255,26,0.10)';
    _ctx.font = 'bold 72px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('title.game_name', 'DUNGEON GLEANER'), cx, h * 0.20);
    // Core text — hot yellow sun accent
    _ctx.shadowColor = GLOW_COLOR;
    _ctx.shadowBlur = 12;
    _ctx.fillStyle = ACCENT_YELLOW;
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
      i18n.t('title.continue', 'Continue'),
      i18n.t('title.credits', 'Credits'),
      i18n.t('title.settings', 'Settings')
    ];

    // Unify keyboard + mouse cursor: if the mouse is hovering one of the
    // title buttons, that row wins and the keyboard selection follows it.
    // This prevents two buttons lighting up at once (keyboard + hover).
    var titleZoneBase = _hitZones.length;
    if (_hoveredZoneIdx >= titleZoneBase && _hoveredZoneIdx < titleZoneBase + labels.length) {
      _selected = _hoveredZoneIdx - titleZoneBase;
    }

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
    _ctx.fillText(i18n.t('create.callsign_hint', '[\u2190 \u2192] Browse   [Enter] Confirm   [Back]'), cx, h * 0.92);
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
      _ctx.fillStyle = isSelected ? GLOW_COLOR : 'rgba(184,17,198,0.55)';
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
    _ctx.fillStyle = isPreviewHovered ? 'rgba(136,136,180,0.75)' : 'rgba(200,180,255,0.75)';
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
    _ctx.fillText(i18n.t('create.avatar_hint', '[\u2190 \u2192 \u2191 \u2193] Browse   [Enter] Deploy   [Back]'), cx, h - 12);
  }

  // ── Slot picker (phase 4) ─────────────────────────────────────────

  /**
   * Read the peek metadata for a slot without loading it.
   * Returns null if SaveState is unavailable or the slot is empty.
   */
  function _peekSlot(slotId) {
    if (typeof SaveState === 'undefined' || !SaveState.peek) return null;
    try { return SaveState.peek(slotId); }
    catch (e) { return null; }
  }

  /** Format a slot row label from peek metadata. */
  function _formatSlotLabel(slotId, meta) {
    var prefix;
    if (slotId === 'autosave') prefix = 'AUTOSAVE';
    else prefix = 'SLOT ' + (parseInt(slotId.replace('slot_', ''), 10) + 1);

    if (!meta) return prefix + ' \u2014 empty';

    var cs   = meta.callsign || '???';
    var cls  = (meta.class || '').toUpperCase();
    var flr  = meta.currentFloor || '?';
    var mins = Math.floor((meta.playtimeMs || 0) / 60000);
    var playtime = mins < 60
      ? mins + 'm'
      : Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';

    var buildBadge = '';
    var curBuild = (typeof SaveState !== 'undefined' && SaveState.BUILD_VERSION)
      ? SaveState.BUILD_VERSION : null;
    if (meta.buildVersion && curBuild && meta.buildVersion !== curBuild) {
      buildBadge = '  \u26A0 build ' + meta.buildVersion;
    }

    return prefix + ' \u2014 ' + cs + ' (' + cls + ')  floor ' + flr +
           '  \u00B7 ' + playtime + buildBadge;
  }

  function _renderSlotPicker(w, h) {
    var cx = w / 2;

    // Header
    _ctx.save();
    _ctx.shadowColor = GLOW_DIM;
    _ctx.shadowBlur = 8;
    _ctx.fillStyle = TEXT_WARM;
    _ctx.font = 'bold 36px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('title.continue', 'CONTINUE'), cx, h * 0.18);
    _ctx.restore();

    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '18px ' + CRT_FONT;
    _ctx.textAlign = 'center';
    _ctx.fillText('Select a save slot', cx, h * 0.18 + 36);

    // Rows
    var btnW = Math.min(640, w - 120);
    var btnH = 56;
    var gap  = 14;
    var rows = SAVE_SLOT_IDS.length + 1; // +1 for BACK
    var startY = h * 0.34;

    for (var i = 0; i < SAVE_SLOT_IDS.length; i++) {
      var slotId = SAVE_SLOT_IDS[i];
      var meta   = _peekSlot(slotId);
      var by     = startY + i * (btnH + gap);
      var bx     = cx - btnW / 2;
      var isSel  = (_slotPickerSelected === i);
      var zoneIdx = _hitZones.length;
      var disabled = !meta;

      _drawGlowButton(_ctx, bx, by, btnW, btnH, {
        selected: isSel,
        hovered: _isZoneHovered(zoneIdx),
        disabled: disabled
      });

      _ctx.textAlign = 'left';
      _ctx.textBaseline = 'middle';
      _ctx.font = (isSel ? 'bold ' : '') + '18px ' + CRT_FONT;
      if (disabled) _ctx.fillStyle = '#555';
      else if (isSel || _isZoneHovered(zoneIdx)) _ctx.fillStyle = '#fff';
      else _ctx.fillStyle = TEXT_WARM;
      _ctx.fillText(_formatSlotLabel(slotId, meta), bx + 20, by + btnH / 2);

      (function (rowIdx, hasMeta) {
        _hitZones.push({
          x: bx, y: by, w: btnW, h: btnH,
          action: function () {
            _slotPickerSelected = rowIdx;
            if (hasMeta) _confirm();
          }
        });
      })(i, !disabled);
    }

    // BACK row
    var byBack = startY + SAVE_SLOT_IDS.length * (btnH + gap) + 20;
    var bxBack = cx - btnW / 2;
    var isBackSel = (_slotPickerSelected === SAVE_SLOT_BACK);
    var backZone  = _hitZones.length;

    _drawGlowButton(_ctx, bxBack, byBack, btnW, btnH, {
      selected: isBackSel,
      hovered: _isZoneHovered(backZone),
      disabled: false
    });
    _ctx.textAlign = 'center';
    _ctx.font = (isBackSel ? 'bold ' : '') + '20px ' + CRT_FONT;
    _ctx.fillStyle = (isBackSel || _isZoneHovered(backZone)) ? '#fff' : TEXT_WARM;
    _ctx.fillText('BACK', cx, byBack + btnH / 2);

    _hitZones.push({
      x: bxBack, y: byBack, w: btnW, h: btnH,
      action: function () {
        _slotPickerSelected = SAVE_SLOT_BACK;
        _confirm();
      }
    });

    // Transient error toast (e.g., load failed)
    if (_slotPickerError && _slotPickerErrorT > 0) {
      _ctx.fillStyle = '#ff6b6b';
      _ctx.font = 'bold 18px ' + CRT_FONT;
      _ctx.textAlign = 'center';
      _ctx.fillText(_slotPickerError, cx, h - 72);
      _slotPickerErrorT -= 16; // approximate per-frame tick; set generously on error
    }
  }

  /**
   * Load a save slot and transition into gameplay.
   *
   * Build-version gate: if the saved blob was authored under a different
   * SaveState.BUILD_VERSION, we warn (via Toast + slot-picker banner) but
   * allow the load anyway. For Jam scope, schema breakage is unlikely —
   * additive extensions dominate — and forcing a lockout would orphan
   * playtesters across quick patches.
   */
  function _loadSelectedSlot(slotId) {
    if (typeof SaveState === 'undefined' || !SaveState.load) {
      _slotPickerError = 'Save system unavailable';
      _slotPickerErrorT = 2500;
      return;
    }

    var meta = _peekSlot(slotId);
    if (!meta) {
      _slotPickerError = 'Slot is empty';
      _slotPickerErrorT = 2000;
      return;
    }

    // ── Build-version gate ───────────────────────────────────────
    // If the save's buildVersion differs from the running code, show a
    // blocking "Load anyway / Cancel" dialog. The player must opt in
    // because schema drift can silently corrupt state.
    var curBuild = SaveState.BUILD_VERSION || null;
    if (meta.buildVersion && curBuild && meta.buildVersion !== curBuild) {
      console.warn('[TitleScreen] build mismatch: save=' + meta.buildVersion +
                   ' current=' + curBuild);
      if (typeof DialogBox !== 'undefined' && DialogBox.show) {
        DialogBox.show({
          text: '\u26A0 This save was created in build ' + meta.buildVersion +
                ' (current: ' + curBuild + '). Loading may cause errors.',
          speaker: 'SYSTEM',
          instant: true,
          choices: [
            { text: 'Load Anyway', next: '__close' },
            { text: 'Cancel',      next: '__close' }
          ],
          onChoice: function (idx) {
            if (idx === 0) {
              _executeLoad(slotId);
            }
            // idx === 1 (Cancel) — dialog closes, player stays in slot picker
          }
        });
        return; // wait for player choice
      }
      // Fallback if DialogBox unavailable — proceed with warning toast
      if (typeof Toast !== 'undefined' && Toast.show) {
        Toast.show('\u26A0 Build mismatch — attempting load...', 'warning');
      }
    }

    _executeLoad(slotId);
  }

  /**
   * Inner load-and-transition helper. Factored out of _loadSelectedSlot
   * so the build-version DialogBox callback can invoke it asynchronously.
   */
  function _executeLoad(slotId) {
    // Attempt load — SaveState.load restores all subsystems in-place.
    var ok = false;
    try {
      ok = !!SaveState.load(slotId);
    } catch (e) {
      console.error('[TitleScreen] SaveState.load threw:', e);
      ok = false;
    }

    if (!ok) {
      _slotPickerError = 'Failed to load save';
      _slotPickerErrorT = 2500;
      if (typeof Toast !== 'undefined' && Toast.show) {
        Toast.show('\u2716 Could not load save', 'error');
      }
      return;
    }

    // Hand off to gameplay. The load has already populated FloorManager,
    // CardAuthority, Player, Minimap, CrateSystem, DayCycle, SessionStats,
    // etc. Mark the resume handshake so Game._initGameplay skips the
    // fresh-run seeding path (starter deck, 15g, starter bag items,
    // class-item equip, deploy monologue, Floor 0 scaffolding).
    if (typeof SaveState !== 'undefined' && SaveState.setResuming) {
      SaveState.setResuming(slotId);
    }

    _active = false;
    _unbindInput();

    if (typeof AudioMusicManager !== 'undefined' && AudioMusicManager.stopTitle) {
      AudioMusicManager.stopTitle();
    }

    if (typeof ScreenManager !== 'undefined' && ScreenManager.toGameplay) {
      ScreenManager.toGameplay();
    }
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
    { key: 'renderScale', label: 'Render Scale', type: 'cycle',
      values: ['100% (native)', '75%', '50% (recommended)', '33%', '25% (lowest)'],
      map: [1.00, 0.75, 0.50, 0.33, 0.25] },
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
    renderScale: 0,  // index into SETTINGS_ITEMS renderScale values — synced from Raycaster
    gpEnabled: true, gpDeadzone: 1, gpVibration: true,
    quadStick: false, holdConfirm: 0, autoAim: false,
    largeText: false, highContrast: false, slowMode: false
  };

  /** Find the nearest render scale step index for a given raw scale (0.0-1.0). */
  function _findRenderScaleStepIdx(rawScale) {
    var map = [1.00, 0.75, 0.50, 0.33, 0.25];
    var bestI = 0, bestD = Infinity;
    for (var i = 0; i < map.length; i++) {
      var d = Math.abs(map[i] - rawScale);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return bestI;
  }

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

    // Sync render scale index from Raycaster (single source of truth).
    // Raycaster loads its own persisted value from 'dg_render_scale' on init.
    if (typeof Raycaster !== 'undefined' && Raycaster.getRenderScale) {
      _settings.renderScale = _findRenderScaleStepIdx(Raycaster.getRenderScale());
    }
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
    // Render scale — bridge to Raycaster (which persists via its own localStorage key)
    if (item.key === 'renderScale' && typeof Raycaster !== 'undefined' && Raycaster.setRenderScale) {
      Raycaster.setRenderScale(item.map[_settings.renderScale] || 1.0);
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
          _ctx.fillStyle = ACCENT_CYAN;
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
      _ctx.fillStyle = 'rgba(184,17,198,0.55)';
      _ctx.fillRect(sbX, thumbY, sbW, thumbH);
    }

    // Hint bar
    _ctx.textAlign = 'center';
    _ctx.fillStyle = TEXT_MUTED;
    _ctx.font = '14px ' + CRT_FONT;
    _ctx.fillText('[Back]   [Scroll] Navigate', cx, panelY + panelH - 14);
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
          _ctx.strokeStyle = 'rgba(184,17,198,0.35)';
          _ctx.lineWidth = 1;
          _ctx.beginPath();
          _ctx.moveTo(rowX, drawY + 4);
          _ctx.lineTo(rowX + rowW, drawY + 4);
          _ctx.stroke();

          _ctx.font = 'bold 16px ' + CRT_FONT;
          _ctx.fillStyle = ACCENT_CYAN;
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

        // Hit zone (only for visible items, clip-aware). hoverSelect
        // moves the keyboard cursor to whichever row the mouse is on,
        // so keyboard and hover never disagree.
        (function (idx) {
          _hitZones.push({
            x: rowX, y: rowTop, w: rowW, h: rowH,
            clipY: contentTop, clipH: contentH,
            hoverSelect: function () { _settingsSelected = idx; },
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

      // BACK uses the "past-last-nav-idx" sentinel, matching how
      // _navigateDown wraps into it. Hovering BACK moves keyboard
      // selection onto it so the highlight stays unified.
      (function (backIdx) {
        _hitZones.push({
          x: backX, y: backY, w: backBtnW, h: backBtnH,
          clipY: contentTop, clipH: contentH,
          hoverSelect: function () { _settingsSelected = backIdx; },
          action: function () { _settingsOpen = false; }
        });
      })(navIdx);
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
      _ctx.fillStyle = 'rgba(184,17,198,0.55)';
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
      : '[Back]   [Enter] Toggle   [\u2191\u2193] Navigate';
    _ctx.fillText(hintText, cx, panelY + panelH - 14);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

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
    _slotPickerSelected = 0;
    _slotPickerError = null;
    _slotPickerErrorT = 0;
    _mouseX = -1;
    _mouseY = -1;
    _hoveredZoneIdx = -1;
    _loadSettings();
    _bindInput();

    // Start title music
    if (typeof AudioMusicManager !== 'undefined') {
      AudioMusicManager.startTitle();
    }

    // Water cursor FX — reinforce cleaning theme right from the title.
    // Hover-trail droplets spray off the pointer; click bursts splash on
    // any menu selection. Tick/render is driven by game.js TITLE branch.
    if (typeof WaterCursorFX !== 'undefined') {
      WaterCursorFX.clear();
      WaterCursorFX.setActive(true);
    }
  }

  function stop() {
    _active = false;
    _unbindInput();
    if (_canvas) _canvas.style.cursor = 'default';
    if (typeof WaterCursorFX !== 'undefined') {
      WaterCursorFX.setActive(false);
    }
  }

  function isActive() { return _active; }

  // ── Public API ───────────────

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
