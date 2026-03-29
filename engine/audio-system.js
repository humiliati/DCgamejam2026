/**
 * AudioSystem — Web Audio playback for Dungeon Gleaner (Pass 7).
 *
 * Ported from EyesOnly's 940-line AudioSystem, stripped to jam essentials:
 *   - AudioContext with gesture-unlock (webOS / browser autoplay policy)
 *   - Three-tier gain bus: master → sfx | bgm → destination
 *   - SFX: fetch() → decodeAudioData() → buffer cache → createBufferSource()
 *   - Music: <audio> element streaming (no full decode — low memory)
 *   - 80ms rate limiter per clip (prevents overlapping spam)
 *   - WebM/Opus only (no MP3 fallback — LG webOS 3.0+ native Opus)
 *
 * Volume model:
 *   master  0.0–1.0  — overall gain multiplier applied to all output
 *   sfx     0.0–1.0  — applied to one-shot effects (play, playSequence)
 *   bgm     0.0–1.0  — applied to looping music tracks (playMusic)
 *   Effective SFX  = master × sfx × per-clip volume
 *   Effective BGM  = master × bgm
 *
 * Layer 0 — zero dependencies. Loads manifest from data/audio-manifest.json.
 */
var AudioSystem = (function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────
  var _ctx        = null;  // AudioContext (created on gesture)
  var _masterGain = null;  // GainNode — master bus
  var _sfxGain    = null;  // GainNode — SFX channel
  var _bgmGain    = null;  // GainNode — music channel
  var _ready      = false;
  var _manifest   = null;  // Parsed audio-manifest.json
  var _buffers    = {};    // name → AudioBuffer (decoded SFX cache)
  var _loading    = {};    // name → Promise (in-flight fetches)
  var _cooldowns  = {};    // name → last play timestamp (rate limiter)
  var _muted      = false;

  // Music state
  var _musicEl    = null;  // <audio> element for BGM streaming
  var _musicName  = null;  // Currently playing music key

  var COOLDOWN_MS = 80;    // Minimum ms between identical SFX plays
  var FADE_MS     = 400;   // Music crossfade duration

  // ── Volume state ─────────────────────────────────────────────────
  var _volumes = {
    master: 0.8,
    sfx:    1.0,
    bgm:    0.6
  };

  // ── Init ─────────────────────────────────────────────────────────

  /**
   * Initialize: load manifest, set up gesture listener for AudioContext.
   * Call once from game init. Safe to call before user gesture — context
   * creation defers until the first interaction event.
   */
  function init() {
    // Load manifest synchronously (it's small — <10KB)
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/audio-manifest.json', false);
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) {
        _manifest = JSON.parse(xhr.responseText);
      }
    } catch (e) {
      console.warn('[Audio] Failed to load manifest:', e);
      _manifest = {};
    }

    // Set up gesture listener to create AudioContext
    var gestureEvents = ['click', 'touchstart', 'keydown', 'pointerdown'];
    function onGesture() {
      if (_ctx) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { console.warn('[Audio] No AudioContext support'); return; }
        _ctx = new AC();

        // Build gain bus: master → sfx → destination
        //                 master → bgm → destination
        _masterGain = _ctx.createGain();
        _sfxGain    = _ctx.createGain();
        _bgmGain    = _ctx.createGain();

        _masterGain.connect(_ctx.destination);
        _sfxGain.connect(_masterGain);
        _bgmGain.connect(_masterGain);

        _applyVolumes();

        // Create <audio> element for music streaming
        _musicEl = document.createElement('audio');
        _musicEl.loop = true;
        _musicEl.preload = 'auto';
        // Connect through gain bus
        var musicSource = _ctx.createMediaElementSource(_musicEl);
        musicSource.connect(_bgmGain);

        _ready = true;
        console.log('[Audio] Context created (' + _ctx.sampleRate + 'Hz). ' +
                     Object.keys(_manifest).filter(function(k){return k[0]!=='_'}).length + ' manifest entries.');
      } catch (e) {
        console.warn('[Audio] Context init failed:', e);
      }

      // Keep listener alive until context is running (webOS may need multiple gestures)
      if (_ctx && _ctx.state === 'running') {
        for (var i = 0; i < gestureEvents.length; i++) {
          document.removeEventListener(gestureEvents[i], onGesture, true);
        }
      }
    }

    for (var i = 0; i < gestureEvents.length; i++) {
      document.addEventListener(gestureEvents[i], onGesture, true);
    }

    console.log('[Audio] Initialized — waiting for user gesture to create context');
  }

  // ── Volume internals ─────────────────────────────────────────────

  function _applyVolumes() {
    if (!_masterGain) return;
    _masterGain.gain.value = _muted ? 0 : _volumes.master;
    _sfxGain.gain.value    = _volumes.sfx;
    _bgmGain.gain.value    = _volumes.bgm;
  }

  // ── SFX buffer loading ───────────────────────────────────────────

  /**
   * Fetch + decode an SFX clip into the buffer cache.
   * Returns a Promise<AudioBuffer>. Deduplicates in-flight requests.
   */
  function _loadBuffer(name) {
    if (_buffers[name]) return Promise.resolve(_buffers[name]);
    if (_loading[name]) return _loading[name];

    var entry = _manifest[name];
    if (!entry || !entry.src) {
      return Promise.reject(new Error('No manifest entry: ' + name));
    }

    var url = (_manifest._meta && _manifest._meta.basePath || '') + entry.src;

    _loading[name] = fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
        return res.arrayBuffer();
      })
      .then(function (ab) {
        return _ctx.decodeAudioData(ab);
      })
      .then(function (buf) {
        _buffers[name] = buf;
        delete _loading[name];
        return buf;
      })
      .catch(function (err) {
        delete _loading[name];
        console.warn('[Audio] Load failed:', name, err.message || err);
        return null;
      });

    return _loading[name];
  }

  // ── SFX playback ─────────────────────────────────────────────────

  /**
   * Play a single sound effect.
   * If the buffer isn't cached yet, triggers async load and plays on arrival.
   *
   * @param {string} name - Manifest key (e.g. 'card-pickup', 'hit-spade')
   * @param {Object} [opts] - { volume?: 0-1, playbackRate?: number }
   */
  function play(name, opts) {
    if (!_ready || !_ctx || _muted) return;
    if (!_manifest[name]) return;

    // Category guard: don't play music entries via SFX pipeline
    if (_manifest[name].category === 'music') return;

    // Rate limiter — 80ms cooldown per clip name
    var now = Date.now();
    if (_cooldowns[name] && (now - _cooldowns[name]) < COOLDOWN_MS) return;
    _cooldowns[name] = now;

    opts = opts || {};
    var clipVol = (typeof opts.volume === 'number') ? opts.volume : 1;
    var rate    = opts.playbackRate || 1;

    // Resume suspended context (webOS sometimes suspends on focus loss)
    if (_ctx.state === 'suspended') {
      try { _ctx.resume(); } catch (e) {}
    }

    var buf = _buffers[name];
    if (buf) {
      _playSFXBuffer(buf, clipVol, rate);
    } else {
      // Async load → play on arrival
      _loadBuffer(name).then(function (b) {
        if (b) _playSFXBuffer(b, clipVol, rate);
      });
    }
  }

  function _playSFXBuffer(buffer, volume, rate) {
    if (!_ctx || !buffer) return;
    var source = _ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    // Per-clip gain node → sfx bus
    var gain = _ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(_sfxGain);
    source.start(0);
  }

  /**
   * Play a random variant of a sound.
   * Looks up name, name2, name3, etc. and picks one at random.
   *
   * @param {string} baseName - e.g. 'card-pickup' → picks from card-pickup, card-pickup2, card-pickup3
   * @param {Object} [opts]
   */
  function playRandom(baseName, opts) {
    var variants = [baseName];
    for (var i = 2; i <= 9; i++) {
      if (_manifest[baseName + i]) variants.push(baseName + i);
      else break;
    }
    var pick = variants[Math.floor(Math.random() * variants.length)];
    play(pick, opts);
  }

  // ── Sequenced playback ───────────────────────────────────────────

  /**
   * Play a sequence of sounds with precise timing.
   * @param {Array<{key:string, delay:number, volume?:number, playbackRate?:number}>} sounds
   * @param {number} [baseOffset=0]
   */
  function playSequence(sounds, baseOffset) {
    if (!sounds || !sounds.length || !_ready) return;
    baseOffset = baseOffset || 0;
    for (var i = 0; i < sounds.length; i++) {
      (function (snd) {
        var totalDelay = (snd.delay || 0) + baseOffset;
        var opts = { volume: snd.volume || 0.5 };
        if (snd.playbackRate) opts.playbackRate = snd.playbackRate;
        if (totalDelay <= 0) {
          play(snd.key, opts);
        } else {
          setTimeout(function () { play(snd.key, opts); }, totalDelay);
        }
      })(sounds[i]);
    }
  }

  // ── Music (streaming via <audio> element) ────────────────────────

  /**
   * Start a looping BGM track. Crossfades from current track.
   * Uses <audio> element streaming — no full decode into memory.
   *
   * @param {string} name - Manifest key (e.g. 'music-graveyard')
   */
  function playMusic(name) {
    if (!_ready || !_musicEl) return;
    if (name === _musicName) return;  // Already playing

    var entry = _manifest[name];
    if (!entry || !entry.src) {
      console.warn('[Audio] No music entry:', name);
      return;
    }

    var url = (_manifest._meta && _manifest._meta.basePath || '') + entry.src;

    // Crossfade: ramp current down, switch, ramp up
    if (_musicEl.src && !_musicEl.paused) {
      _bgmGain.gain.setValueAtTime(_bgmGain.gain.value, _ctx.currentTime);
      _bgmGain.gain.linearRampToValueAtTime(0, _ctx.currentTime + FADE_MS / 1000);

      setTimeout(function () {
        _musicEl.src = url;
        _musicEl.play().catch(function () {});
        _bgmGain.gain.setValueAtTime(0, _ctx.currentTime);
        _bgmGain.gain.linearRampToValueAtTime(_volumes.bgm, _ctx.currentTime + FADE_MS / 1000);
      }, FADE_MS);
    } else {
      _musicEl.src = url;
      _musicEl.play().catch(function () {});
    }

    _musicName = name;
  }

  /** Stop the current BGM track with a short fade. */
  function stopMusic() {
    if (!_ready || !_musicEl) return;
    if (_bgmGain && _ctx) {
      _bgmGain.gain.setValueAtTime(_bgmGain.gain.value, _ctx.currentTime);
      _bgmGain.gain.linearRampToValueAtTime(0, _ctx.currentTime + 0.3);
      setTimeout(function () {
        _musicEl.pause();
        _musicEl.src = '';
        _musicName = null;
        _bgmGain.gain.value = _volumes.bgm;
      }, 350);
    } else {
      _musicEl.pause();
      _musicEl.src = '';
      _musicName = null;
    }
  }

  /** Get the currently playing music key, or null. */
  function getCurrentMusic() { return _musicName; }

  // ── Preloading ───────────────────────────────────────────────────

  /**
   * Preload a batch of SFX by category. Fire-and-forget.
   * Call during floor transitions to warm the cache.
   *
   * @param {string} category - e.g. 'card', 'combat', 'ui'
   */
  function preloadCategory(category) {
    if (!_ready || !_manifest) return;
    var keys = Object.keys(_manifest);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k[0] === '_') continue;
      if (_manifest[k].category === category) _loadBuffer(k);
    }
  }

  // ── Volume setters ───────────────────────────────────────────────

  function setMasterVolume(v) {
    _volumes.master = Math.max(0, Math.min(1, v));
    _applyVolumes();
  }

  function setSFXVolume(v) {
    _volumes.sfx = Math.max(0, Math.min(1, v));
    _applyVolumes();
  }

  function setMusicVolume(v) {
    _volumes.bgm = Math.max(0, Math.min(1, v));
    _applyVolumes();
  }

  function setSFXVolumeLegacy(v) { setSFXVolume(v); }

  function setMasterMute(muted) {
    _muted = !!muted;
    _applyVolumes();
    if (_muted && _musicEl && !_musicEl.paused) {
      _musicEl.pause();
    } else if (!_muted && _musicName && _musicEl && _musicEl.paused) {
      _musicEl.play().catch(function () {});
    }
  }

  function getVolumes() {
    return {
      master: Math.round(_volumes.master * 100),
      sfx:    Math.round(_volumes.sfx    * 100),
      bgm:    Math.round(_volumes.bgm    * 100)
    };
  }

  /** Check if audio context is active and ready. */
  function isReady() { return _ready && _ctx && _ctx.state === 'running'; }

  // ── Public API ───────────────────────────────────────────────────

  return {
    init:            init,
    play:            play,
    playRandom:      playRandom,
    playSequence:    playSequence,
    playMusic:       playMusic,
    stopMusic:       stopMusic,
    getCurrentMusic: getCurrentMusic,
    preloadCategory: preloadCategory,
    setMasterVolume: setMasterVolume,
    setSFXVolume:    setSFXVolume,
    setMusicVolume:  setMusicVolume,
    setMasterMute:   setMasterMute,
    getVolumes:      getVolumes,
    isReady:         isReady,
    // Legacy aliases matching EyesOnly's AudioSystem API
    setSFXVolumeLegacy: setSFXVolumeLegacy
  };
})();
