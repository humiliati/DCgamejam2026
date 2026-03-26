/**
 * AudioSystem — Web Audio playback with sequenced sound support.
 *
 * Stub implementation: play() and playSequence() are no-ops until
 * audio assets are ported in Pass 7. The API shape matches EyesOnly's
 * AudioSystem so all callsites are already correct when assets land.
 */
var AudioSystem = (function () {
  'use strict';
  var _ready = false;

  function init() {
    // Will init AudioContext on user gesture
    _ready = true;
    console.log('[Audio] Stub initialized — full system in Pass 7');
  }

  /**
   * Play a single sound effect.
   * @param {string} name - manifest key
   * @param {Object} [opts] - { volume, playbackRate }
   */
  function play(name, opts) {
    // Stub — no-op until audio assets are ported
  }

  /**
   * Play a sequence of sounds with precise timing.
   * Used by DoorContractAudio transition sequences.
   *
   * @param {Array<{key:string, delay:number, volume?:number}>} sounds
   * @param {number} [baseOffset=0] - Additional ms offset added to all delays
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

  function playMusic(name) {}
  function stopMusic() {}
  function setMasterMute(m) {}
  function setSFXVolume(v) {}
  function setMusicVolume(v) {}

  return {
    init: init,
    play: play,
    playSequence: playSequence,
    playMusic: playMusic,
    stopMusic: stopMusic,
    setMasterMute: setMasterMute,
    setSFXVolume: setSFXVolume,
    setMusicVolume: setMusicVolume
  };
})();
