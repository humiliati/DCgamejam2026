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
  var _failed     = {};    // name → true (permanently failed — don't retry)
  var _cooldowns  = {};    // name → last play timestamp (rate limiter)
  var _muted      = false;

  // Music state
  var _musicEl    = null;  // <audio> element for BGM streaming
  var _musicName  = null;  // Currently playing music key
  var _bgmFilter  = null;  // BiquadFilterNode for muffle (lowpass)
  var _muffled    = false; // Current muffle state

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
    // Load manifest — try XHR first, fall back to <script> global.
    // file:// origins block XHR/fetch, so data/audio-manifest.js provides
    // window.AUDIO_MANIFEST as a synchronous fallback.
    _manifest = null;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/audio-manifest.json', false);
      xhr.send();
      if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText && xhr.responseText.length > 2) {
        _manifest = JSON.parse(xhr.responseText);
      }
    } catch (e) {
      // XHR failed (file:// CORS or parse error) — fall through to global
    }
    // Fallback: pick up the <script>-loaded global
    if (!_manifest && typeof AUDIO_MANIFEST !== 'undefined') {
      _manifest = AUDIO_MANIFEST;
    }
    if (!_manifest) {
      console.warn('[Audio] No manifest loaded (XHR failed, no AUDIO_MANIFEST global)');
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

        // Create lowpass filter for interior muffle effect
        _bgmFilter = _ctx.createBiquadFilter();
        _bgmFilter.type = 'lowpass';
        _bgmFilter.frequency.value = 22050;  // Wide open by default
        _bgmFilter.Q.value = 0.7;

        // Create <audio> element for music streaming
        _musicEl = document.createElement('audio');
        _musicEl.loop = true;
        _musicEl.preload = 'auto';
        // Connect through gain bus: audio → filter → bgmGain → master
        var musicSource = _ctx.createMediaElementSource(_musicEl);
        musicSource.connect(_bgmFilter);
        _bgmFilter.connect(_bgmGain);

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
    if (_failed[name])  return Promise.resolve(null);   // Don't retry known failures
    if (_loading[name]) return _loading[name];

    var entry = _manifest[name];
    if (!entry || !entry.src) {
      _failed[name] = true;
      return Promise.resolve(null);
    }

    var url = (_manifest._meta && _manifest._meta.basePath || '') + entry.src;

    // Use XHR instead of fetch() for file:// compatibility.
    // fetch() fails on file:// origins; XHR with responseType works on http://.
    _loading[name] = new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = function () {
        if (xhr.response && xhr.response.byteLength > 0) {
          resolve(xhr.response);
        } else {
          reject(new Error('Empty response for ' + url));
        }
      };
      xhr.onerror = function () { reject(new Error('XHR error for ' + url)); };
      xhr.send();
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
        _failed[name] = true;   // Cache failure — never retry this clip
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
   * @param {number} [fadeInMs] - Optional cold-start fade-in duration in
   *        milliseconds. Only used when nothing is currently playing —
   *        the crossfade branch keeps its own FADE_MS ramp. Pass a large
   *        value (e.g. 3000) for cinematic title-screen entrances.
   */
  function playMusic(name, fadeInMs) {
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
      // Cold start. If a fadeInMs was requested, ramp _bgmGain from 0
      // to the current target volume over that duration. Otherwise start
      // at full volume immediately (legacy behavior).
      _musicEl.src = url;
      var playPromise = _musicEl.play();
      if (playPromise && playPromise.catch) playPromise.catch(function () {});

      if (fadeInMs && fadeInMs > 0 && _bgmGain && _ctx) {
        // Master mute/volume is handled at _masterGain, so _bgmGain's
        // target is just _volumes.bgm (matching _applyVolumes).
        _bgmGain.gain.cancelScheduledValues(_ctx.currentTime);
        _bgmGain.gain.setValueAtTime(0, _ctx.currentTime);
        _bgmGain.gain.linearRampToValueAtTime(_volumes.bgm, _ctx.currentTime + fadeInMs / 1000);
      }
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

  // ── Muffle (lowpass filter for interior/building BGM) ────────────

  /**
   * Apply lowpass muffle to BGM. Ramps filter frequency over 400ms.
   * @param {boolean} on - true = muffle (800Hz cutoff), false = clear (22kHz)
   * @param {number} [cutoff=800] - Lowpass frequency when muffled
   */
  function setMuffle(on, cutoff) {
    if (!_bgmFilter || !_ctx) return;
    _muffled = !!on;
    var freq = on ? (cutoff || 800) : 22050;
    _bgmFilter.frequency.setValueAtTime(_bgmFilter.frequency.value, _ctx.currentTime);
    _bgmFilter.frequency.linearRampToValueAtTime(freq, _ctx.currentTime + 0.4);
  }

  /** Check if BGM is currently muffled. */
  function isMuffled() { return _muffled; }

  // ── Music duck (temporary volume reduction) ──────────────────────

  var _duckLevel = null;  // Saved bgm volume before duck

  /**
   * Duck the BGM to a lower volume (e.g. during cinematics).
   * @param {number} [level=0.35] - Target bgm volume during duck
   */
  function duckMusic(level) {
    if (!_bgmGain || !_ctx) return;
    if (_duckLevel !== null) return;  // Already ducked
    _duckLevel = _volumes.bgm;
    var target = (typeof level === 'number') ? level : 0.35;
    _bgmGain.gain.setValueAtTime(_bgmGain.gain.value, _ctx.currentTime);
    _bgmGain.gain.linearRampToValueAtTime(target, _ctx.currentTime + 0.3);
  }

  /** Restore BGM volume after a duck. */
  function unduckMusic() {
    if (!_bgmGain || !_ctx || _duckLevel === null) return;
    _bgmGain.gain.setValueAtTime(_bgmGain.gain.value, _ctx.currentTime);
    _bgmGain.gain.linearRampToValueAtTime(_duckLevel, _ctx.currentTime + 0.5);
    _duckLevel = null;
  }

  // ── Spatial SFX (distance-attenuated playback) ───────────────────

  /**
   * Play a sound with distance-based volume attenuation.
   * No stereo panning yet — bare-bones volume-only spatial.
   *
   * @param {string} name - Manifest key
   * @param {number} srcX - Source world tile X
   * @param {number} srcY - Source world tile Y
   * @param {number} plX  - Player world tile X
   * @param {number} plY  - Player world tile Y
   * @param {Object} [opts] - { volume, playbackRate, maxDist }
   */
  function playSpatial(name, srcX, srcY, plX, plY, opts) {
    opts = opts || {};
    var dx = srcX - plX;
    var dy = srcY - plY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var maxDist = opts.maxDist || 8;
    if (dist > maxDist) return;

    var attenuation = 1 - (dist / maxDist);
    var vol = (opts.volume || 0.5) * attenuation * attenuation;  // Inverse-square
    play(name, { volume: vol, playbackRate: opts.playbackRate || 1 });
  }

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
    // Muffle (interior lowpass)
    setMuffle:       setMuffle,
    isMuffled:       isMuffled,
    // Duck (cinematic volume reduction)
    duckMusic:       duckMusic,
    unduckMusic:     unduckMusic,
    // Spatial SFX
    playSpatial:     playSpatial,
    // Legacy aliases matching EyesOnly's AudioSystem API
    setSFXVolumeLegacy: setSFXVolumeLegacy
  };
})();
