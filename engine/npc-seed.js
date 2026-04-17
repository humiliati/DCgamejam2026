/**
 * NpcSeed — Data-driven NPC population loader (DOC-110 Phase 0).
 *
 * Consumes `data/npcs.json` (authored via `tools/npc-designer.html`,
 * normalised by `tools/extract-npcs.js`) and registers every NPC
 * with NpcSystem via the public `register(floorId, defs)` API.
 *
 * PHASE 0 DEPLOYMENT NOTE
 * =======================
 * Chapter 5 SHIPPED 2026-04-17 — the inline ~740-line
 * _registerBuiltinPopulations() fallback in engine/npc-system.js
 * has been retired. data/npcs.json is now the SOLE source of truth:
 * if this module fails to load the JSON, NpcSystem.init() logs an
 * error and the game runs with an empty NPC registry. There is no
 * longer any second path to NPC data at runtime.
 *
 * Failure modes that now surface as errors (previously silently
 * fell back):
 *   1. NpcSeed module missing (older test harness / Node VM).
 *   2. data/npcs.json not fetchable (file:// on locked-down browsers
 *      or a malformed payload).
 *   3. populate() throws or returns ok:false.
 *
 * The optional `stack` (pinned emoji stack) and `sprites` (per-intent
 * PNG commission manifest) fields shipped by Phase 1.2 round-trip
 * through the whitelist; `_toRuntimeDef` below preserves them verbatim
 * so the runtime can consume them when the sprite pipeline is ready.
 *
 * Layer 3 — depends on NpcSystem (Layer 3) being loaded first.
 */
var NpcSeed = (function () {
  'use strict';

  var _data        = null;  // Raw parsed data/npcs.json
  var _didPopulate = false;

  /**
   * Synchronously fetch data/npcs.json. Mirrors the QuestRegistry
   * loader pattern (sync XHR — we load at init before any user
   * interaction, so the main-thread stall is acceptable).
   *
   * @returns {boolean} true on success, false if file missing / unparseable.
   */
  function load() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/npcs.json', false);
      xhr.send(null);
      if (xhr.status !== 200 && xhr.status !== 0) {
        console.warn('[NpcSeed] data/npcs.json not fetchable (status '
          + xhr.status + '). Inline populations will be used.');
        return false;
      }
      _data = JSON.parse(xhr.responseText);
      return true;
    } catch (e) {
      console.warn('[NpcSeed] Load failed: ' + (e && e.message) +
        '. Inline populations will be used.');
      _data = null;
      return false;
    }
  }

  /**
   * Translate the JSON envelope to the shape NpcSystem.register()
   * expects. The cleaner schema fields (kind, floorId, dialogueTreeId)
   * are stripped — the runtime uses dialogueTree registered separately
   * via registerTree().
   */
  function _toRuntimeDef(jsonNpc) {
    var def = {
      id:            jsonNpc.id,
      type:          jsonNpc.type,
      x:             jsonNpc.x,
      y:             jsonNpc.y,
      facing:        jsonNpc.facing,
      emoji:         jsonNpc.emoji,
      name:          jsonNpc.name,
      role:          jsonNpc.role || null,
      patrolPoints:  jsonNpc.patrolPoints || null,
      stepInterval:  jsonNpc.stepInterval,
      barkPool:      jsonNpc.barkPool,
      barkRadius:    jsonNpc.barkRadius,
      barkInterval:  jsonNpc.barkInterval,
      talkable:      !!jsonNpc.talkable,
      dialoguePool:  jsonNpc.dialoguePool || null,
      // dialogueTree is registered separately by npc-dialogue-trees.js;
      // we leave it null here and let registerTree() attach it by id.
      dialogueTree:  null,
      factionId:     jsonNpc.factionId || null,
      blocksMovement: !!jsonNpc.blocksMovement,
      gateCheck:     jsonNpc.gateCheck || null,
      verbArchetype: jsonNpc.verbArchetype || null,
      verbSet:       jsonNpc.verbSet || null,
      verbFaction:   jsonNpc.verbFaction || null
    };
    // DOC-110 Phase 1.2 authoring surface: pinned emoji stack + sprite
    // commissions pass through verbatim when present. Composer mode
    // (stack === null) leaves the runtime free to seed-generate from
    // NpcComposer, and an absent sprites field is the default "no PNG
    // overrides yet" state — render falls through to emoji stack.
    if (jsonNpc.stack != null) def.stack = jsonNpc.stack;
    if (jsonNpc.sprites != null) def.sprites = jsonNpc.sprites;
    return def;
  }

  /**
   * Register every NPC in the loaded JSON with NpcSystem.
   * Idempotent — calling twice is a no-op after the first success.
   *
   * @returns {Object} { ok, floorCount, npcCount, skipped }
   */
  function populate() {
    if (_didPopulate) {
      return { ok: true, floorCount: 0, npcCount: 0, skipped: 'already-populated' };
    }
    if (!_data) {
      if (!load()) {
        return { ok: false, floorCount: 0, npcCount: 0, skipped: 'load-failed' };
      }
    }
    if (typeof NpcSystem === 'undefined' || !NpcSystem.register) {
      return { ok: false, floorCount: 0, npcCount: 0, skipped: 'npc-system-missing' };
    }

    var byFloor = _data.npcsByFloor || {};
    var floorKeys = Object.keys(byFloor);
    var total = 0;
    for (var i = 0; i < floorKeys.length; i++) {
      var fid = floorKeys[i];
      var list = (byFloor[fid] || []).map(_toRuntimeDef);
      if (list.length > 0) {
        NpcSystem.register(fid, list);
        total += list.length;
      }
    }
    _didPopulate = true;
    console.log('[NpcSeed] Populated ' + total + ' NPCs across '
      + floorKeys.length + ' floor(s) from data/npcs.json');
    return { ok: true, floorCount: floorKeys.length, npcCount: total };
  }

  /** Reset — exposed for test harnesses only. */
  function reset() { _data = null; _didPopulate = false; }

  /** Peek at the loaded manifest without registering. */
  function manifest() { return _data; }

  return Object.freeze({
    load:     load,
    populate: populate,
    reset:    reset,
    manifest: manifest
  });
})();
