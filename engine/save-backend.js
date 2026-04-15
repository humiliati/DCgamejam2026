/**
 * SaveBackend — Layer 1 persistence adapter.
 *
 * A thin, swappable wrapper around a key-value store. The browser build uses
 * localStorage; the webOS TV build will swap in LGLauncher.getStorage() post-Jam.
 * SaveState (Layer 3) only talks to this module — it never touches localStorage
 * directly, so the backend switch is a one-line edit.
 *
 * Slot namespace:
 *   dg_save_slot_0   — manual slot A
 *   dg_save_slot_1   — manual slot B
 *   dg_save_slot_2   — manual slot C
 *   dg_save_autosave — rotating autosave
 *
 * SaveState normalizes the slot id strings; this module just reads/writes
 * whatever key it's given under the "dg_save_" prefix.
 *
 * Contract (all sync, all JSON-value):
 *   write(slot, obj)  → boolean (false on quota / JSON errors)
 *   read(slot)        → object | null (null on missing / parse fail)
 *   remove(slot)      → boolean
 *   list()            → [{slot, bytes}, ...]  (for save-slot UI)
 *   exists(slot)      → boolean  (cheap — avoids JSON.parse)
 */
var SaveBackend = (function () {
  'use strict';

  var PREFIX = 'dg_save_';

  function _key(slot) { return PREFIX + String(slot); }

  function write(slot, obj) {
    try {
      var json = JSON.stringify(obj);
      localStorage.setItem(_key(slot), json);
      return true;
    } catch (e) {
      // QuotaExceededError or circular-ref JSON error
      console.error('[SaveBackend] write("' + slot + '") failed:', e && e.message);
      return false;
    }
  }

  function read(slot) {
    try {
      var raw = localStorage.getItem(_key(slot));
      if (raw == null) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[SaveBackend] read("' + slot + '") failed:', e && e.message);
      return null;
    }
  }

  function remove(slot) {
    try {
      localStorage.removeItem(_key(slot));
      return true;
    } catch (e) {
      return false;
    }
  }

  function exists(slot) {
    try {
      return localStorage.getItem(_key(slot)) != null;
    } catch (e) {
      return false;
    }
  }

  /**
   * Enumerate all dg_save_* keys. Used by the title-screen save-slot UI to
   * populate the three manual slots + autosave thumbnail without needing to
   * JSON.parse each one (the UI only peeks at the header fields anyway).
   */
  function list() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) {
          var raw = localStorage.getItem(k);
          out.push({
            slot:  k.substring(PREFIX.length),
            bytes: raw ? raw.length : 0
          });
        }
      }
    } catch (e) {
      console.error('[SaveBackend] list() failed:', e && e.message);
    }
    return out;
  }

  return Object.freeze({
    write:  write,
    read:   read,
    remove: remove,
    exists: exists,
    list:   list
  });
})();
