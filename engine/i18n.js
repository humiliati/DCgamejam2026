/**
 * i18n — Internationalization string lookup.
 *
 * Layer 0 (zero dependencies). All user-facing text in the engine goes
 * through i18n.t('key') so nothing is hardcoded. Required for LG Content
 * Store compliance — the device locale must be respected.
 *
 * Usage:
 *   i18n.register('en', { 'title.new_game': 'New Game', ... });
 *   i18n.t('title.new_game')  // → 'New Game'
 *   i18n.t('missing.key')     // → 'missing.key' (key as fallback)
 */
var i18n = (function () {
  'use strict';

  var _locale = 'en';
  var _strings = {};

  /** Set active locale. Falls back to 'en' for missing keys. */
  function setLocale(loc) { _locale = loc; }

  /** Get active locale code. */
  function getLocale() { return _locale; }

  /** Register a batch of key→value strings for a locale. */
  function register(locale, strings) {
    if (!_strings[locale]) _strings[locale] = {};
    var keys = Object.keys(strings);
    for (var i = 0; i < keys.length; i++) {
      _strings[locale][keys[i]] = strings[keys[i]];
    }
  }

  /**
   * Translate a key. Checks active locale first, then 'en' fallback,
   * then returns the raw key string.
   * @param {string} key    — dot-namespaced key, e.g. 'hud.hp'
   * @param {string} [fallback] — explicit fallback (overrides key echo)
   */
  function t(key, fallback) {
    if (_strings[_locale] && _strings[_locale][key] !== undefined) {
      return _strings[_locale][key];
    }
    if (_strings['en'] && _strings['en'][key] !== undefined) {
      return _strings['en'][key];
    }
    return fallback !== undefined ? fallback : key;
  }

  /** Get all registered locale codes. */
  function getLocales() {
    return Object.keys(_strings);
  }

  return {
    setLocale: setLocale,
    getLocale: getLocale,
    register: register,
    t: t,
    getLocales: getLocales
  };
})();
