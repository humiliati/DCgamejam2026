/**
 * GameOverScreen — death overlay with stats and retry/title options.
 *
 * Layer 2 (depends on i18n, Player, ScreenManager). Not part of the
 * rotating box menu — the box doesn't protect you when you're dead.
 * This is a flat vignette overlay rendered on the main canvas.
 */
var GameOverScreen = (function () {
  'use strict';

  var _canvas = null;
  var _ctx = null;
  var _active = false;
  var _selected = 0;       // 0=Retry, 1=Title
  var _fadeIn = 0;         // 0–1 fade-in progress
  var _stats = null;

  var OPTIONS = ['retry', 'title'];

  var _keyHandler = null;
  var _clickHandler = null;

  // ── Input ─────────────────────────────────────────────────────────

  function _bindInput() {
    _keyHandler = function (e) {
      if (!_active || _fadeIn < 0.8) return;
      var key = e.key;
      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        e.preventDefault();
        _selected = (_selected - 1 + OPTIONS.length) % OPTIONS.length;
      } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        e.preventDefault();
        _selected = (_selected + 1) % OPTIONS.length;
      } else if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        _choose();
      }
    };
    _clickHandler = function (e) {
      if (!_active || _fadeIn < 0.8) return;
      var rect = _canvas.getBoundingClientRect();
      var mx = (e.clientX - rect.left) * (_canvas.width / rect.width);
      var my = (e.clientY - rect.top) * (_canvas.height / rect.height);
      for (var i = 0; i < _hitZones.length; i++) {
        var z = _hitZones[i];
        if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
          z.action();
          return;
        }
      }
    };
    window.addEventListener('keydown', _keyHandler);
    _canvas.addEventListener('click', _clickHandler);
  }

  function _unbindInput() {
    if (_keyHandler) window.removeEventListener('keydown', _keyHandler);
    if (_clickHandler) _canvas.removeEventListener('click', _clickHandler);
    _keyHandler = null;
    _clickHandler = null;
  }

  var _hitZones = [];

  function _choose() {
    _active = false;
    _unbindInput();
    if (_selected === 0) {
      ScreenManager.retry();
    } else {
      ScreenManager.returnToTitle();
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
  }

  function start(stats) {
    _active = true;
    _selected = 0;
    _fadeIn = 0;
    _stats = stats || {};
    _bindInput();
  }

  function stop() {
    _active = false;
    _unbindInput();
  }

  function isActive() { return _active; }

  // ── Update ────────────────────────────────────────────────────────

  function update(dt) {
    if (!_active) return;
    if (_fadeIn < 1) {
      _fadeIn = Math.min(1, _fadeIn + dt / 800);
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  function render() {
    if (!_active || !_ctx) return;
    _hitZones = [];

    var w = _canvas.width;
    var h = _canvas.height;

    // Vignette overlay
    _ctx.globalAlpha = _fadeIn * 0.85;
    _ctx.fillStyle = '#000';
    _ctx.fillRect(0, 0, w, h);
    _ctx.globalAlpha = _fadeIn;

    var cx = w / 2;

    // Death header
    _ctx.fillStyle = '#c44';
    _ctx.font = 'bold 28px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('gameover.header', 'YOU HAVE FALLEN'), cx, h * 0.2);

    // Skull
    _ctx.font = '40px serif';
    _ctx.fillText('💀', cx, h * 0.3);

    // Stats summary
    var statsY = h * 0.42;
    var statLines = [
      [i18n.t('gameover.floors', 'Floors explored'), _stats.floorsExplored || 0],
      [i18n.t('gameover.enemies', 'Enemies defeated'), _stats.enemiesDefeated || 0],
      [i18n.t('gameover.cards', 'Cards played'), _stats.cardsPlayed || 0],
      [i18n.t('gameover.damage_dealt', 'Damage dealt'), _stats.damageDealt || 0],
      [i18n.t('gameover.damage_taken', 'Damage taken'), _stats.damageTaken || 0]
    ];

    _ctx.font = '12px "Courier New", monospace';
    for (var i = 0; i < statLines.length; i++) {
      var sy = statsY + i * 20;
      _ctx.fillStyle = '#888';
      _ctx.textAlign = 'right';
      _ctx.fillText(statLines[i][0], cx - 10, sy);
      _ctx.fillStyle = '#ddd';
      _ctx.textAlign = 'left';
      _ctx.fillText(String(statLines[i][1]), cx + 10, sy);
    }

    // Options
    if (_fadeIn >= 0.8) {
      var optY = h * 0.73;
      var labels = [
        i18n.t('gameover.retry', 'Retry'),
        i18n.t('gameover.to_title', 'Return to Title')
      ];

      _ctx.textAlign = 'center';
      for (var j = 0; j < labels.length; j++) {
        var oy = optY + j * 32;
        var isSel = j === _selected;
        _ctx.font = (isSel ? 'bold ' : '') + '16px "Courier New", monospace';
        _ctx.fillStyle = isSel ? '#fff' : '#888';
        var label = (isSel ? '▸ ' : '  ') + labels[j];
        _ctx.fillText(label, cx, oy);

        var tw = _ctx.measureText(label).width;
        (function (idx) {
          _hitZones.push({
            x: cx - tw / 2 - 10, y: oy - 14, w: tw + 20, h: 28,
            action: function () { _selected = idx; _choose(); }
          });
        })(j);
      }
    }

    _ctx.globalAlpha = 1;
  }

  return {
    init: init,
    start: start,
    stop: stop,
    isActive: isActive,
    update: update,
    render: render
  };
})();
