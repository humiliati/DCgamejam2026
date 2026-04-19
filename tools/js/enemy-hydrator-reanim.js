// ============================================================
// tools/js/enemy-hydrator-reanim.js — DOC-110 P5.5 (Reanim)
// ------------------------------------------------------------
// Reanim Behavior tab. R/W (unlike observational 5.3/5.4): edits
// row.brain.reanimTier directly; Stats-tab exporter carries the
// change. brain.reanimTier is v1.1 canonical (actor-schema.json).
//
// Tier shapes:
//   null → corpse is salvage-only, no reanim
//   T1   → { tier: 'T1' }                               — wanderer
//   T2   → { tier: 'T2', dialogueTreeId: 'X' }          — NPC
//   T3   → { tier: 'T3', dispatchTarget: {
//            floorId (req), shopId?, processedVariantId? } }
//
// Writeback: mutate row.brain.reanimTier → markDirty(). No separate
// exporter. Legacy top-level row.reanimTier is info-surfaced only.
//
// Loose coupling (5.3/5.4 contract):
//   window.EnemyHydrator.currentRow / markDirty / toast
//   document 'enemy-hydrator:select' / ':revert'
//
// Dialogue-tree keys: regex-scan NpcDialogueTrees._sourceText if
// present; fallback seed list otherwise. Fields accept freeform.
// ============================================================
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────
  var TIERS = ['T1', 'T2', 'T3'];

  // Tag-based "do not reanim" signals. Lowercased substring match
  // against row.tags if present, or against row.archetype.
  var NON_REANIM_TAGS = ['spirit', 'construct-unreclaimed', 'swarm', 'void'];

  // T3 dispatch autocomplete seeds. Freeform inputs accept any value;
  // these just populate the <datalist> so authors don't fly blind.
  var FLOOR_ID_SEEDS  = ['1.3.1', '2.2.1', '2.2.2'];
  var SHOP_ID_SEEDS   = ['coral-bazaar', 'dispatcher-office', 'drift-inn'];
  var VARIANT_SEEDS   = ['clockwork_gear', 'bone_meal', 'ichor_vial', 'wet_pelt'];

  // Dialogue-tree key fallback (used if the scan returns nothing).
  var DIALOGUE_FALLBACK = ['generic_greet', 'reanim_q1', 'reanim_q2', 'reanim_q3', 'dispatcher_intro'];

  // ── Pure helpers ──────────────────────────────────────────
  function isPlainObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function hasStr(v) { return typeof v === 'string' && v.length > 0; }
  function arrHas(arr, v) {
    if (!Array.isArray(arr)) return false;
    for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true;
    return false;
  }
  function ratioOf(row) {
    if (!row) return 0;
    var hp = Number(row.hp) || 0;
    var str = Math.max(1, Number(row.str) || 1);
    return hp / str;
  }

  // Extract brain.reanimTier from a row, tolerant of missing brain.
  function getTier(row) {
    if (!row) return null;
    if (row.brain && Object.prototype.hasOwnProperty.call(row.brain, 'reanimTier')) {
      return row.brain.reanimTier;
    }
    return null;
  }

  // Detect a legacy top-level reanimTier, for info surfacing only.
  function getLegacyTier(row) {
    if (!row) return undefined;
    if (Object.prototype.hasOwnProperty.call(row, 'reanimTier')) return row.reanimTier;
    return undefined;
  }

  // Archetype / tag-based non-reanim flag.
  function isFlaggedNonReanim(row) {
    if (!row) return false;
    if (row.noReanim === true) return true;
    var arch = (row.archetype || '').toLowerCase();
    for (var i = 0; i < NON_REANIM_TAGS.length; i++) {
      if (arch === NON_REANIM_TAGS[i]) return true;
      if (arrHas(row.tags, NON_REANIM_TAGS[i])) return true;
    }
    return false;
  }

  // ── Validators ────────────────────────────────────────────
  // Returns { ok: bool, errs: [msg], warns: [msg] }. `tierObj` is the
  // candidate value for row.brain.reanimTier (null or tier object).
  function validateTier(tierObj, row) {
    var errs = [], warns = [];
    if (tierObj === null || tierObj === undefined) {
      // null is valid — corpse is salvage-only
      return { ok: true, errs: errs, warns: warns };
    }
    if (!isPlainObj(tierObj)) {
      errs.push('reanimTier must be an object or null (got ' + typeof tierObj + ').');
      return { ok: false, errs: errs, warns: warns };
    }
    if (!arrHas(TIERS, tierObj.tier)) {
      errs.push('tier must be one of T1/T2/T3 (got ' + JSON.stringify(tierObj.tier) + ').');
    }
    if (tierObj.tier === 'T1') {
      if (hasStr(tierObj.dialogueTreeId)) {
        warns.push('T1 ignores dialogueTreeId — will be stripped on save.');
      }
      if (tierObj.dispatchTarget) {
        warns.push('T1 ignores dispatchTarget — will be stripped on save.');
      }
    }
    if (tierObj.tier === 'T2') {
      if (!hasStr(tierObj.dialogueTreeId)) {
        errs.push('T2 requires dialogueTreeId.');
      }
      if (tierObj.dispatchTarget) {
        warns.push('T2 ignores dispatchTarget — will be stripped on save.');
      }
    }
    if (tierObj.tier === 'T3') {
      if (!isPlainObj(tierObj.dispatchTarget)) {
        errs.push('T3 requires dispatchTarget.floorId.');
      } else {
        if (!hasStr(tierObj.dispatchTarget.floorId)) {
          errs.push('T3 dispatchTarget.floorId is required.');
        }
        if (tierObj.dispatchTarget.shopId != null && !hasStr(tierObj.dispatchTarget.shopId)) {
          errs.push('T3 dispatchTarget.shopId, when set, must be a non-empty string.');
        }
        if (tierObj.dispatchTarget.processedVariantId != null && !hasStr(tierObj.dispatchTarget.processedVariantId)) {
          errs.push('T3 dispatchTarget.processedVariantId, when set, must be a non-empty string.');
        }
        if (hasStr(tierObj.dispatchTarget.processedVariantId) && !hasStr(tierObj.dispatchTarget.shopId)) {
          warns.push('T3 dispatchTarget.processedVariantId set without shopId — standalone drop-off is valid but unusual.');
        }
      }
      if (hasStr(tierObj.dialogueTreeId)) {
        warns.push('T3 ignores dialogueTreeId — will be stripped on save.');
      }
    }
    // Flag↔tier coherence
    if (row && isFlaggedNonReanim(row) && tierObj && tierObj.tier) {
      errs.push('Row is flagged non-reanimable but tier is ' + tierObj.tier +
                ' — clear the tier or clear the flag.');
    }
    return { ok: errs.length === 0, errs: errs, warns: warns };
  }

  // ── Suggest-tier heuristic ────────────────────────────────
  // Deterministic. Returns { tier, confidence, rationale[] }.
  // See spec §4 for the decision table.
  function suggestTier(row) {
    var rationale = [];
    if (!row) return { tier: null, confidence: 'high', rationale: ['no row'] };

    if (isFlaggedNonReanim(row)) {
      rationale.push('row.noReanim or non-reanim tag — corpse stays salvage-only');
      return { tier: null, confidence: 'high', rationale: rationale };
    }

    var tier = row.tier || 'standard';
    if (tier === 'boss') {
      rationale.push('boss tier defaults to null for jam scope — override manually for lore NPCs');
      return { tier: null, confidence: 'medium', rationale: rationale };
    }

    var r = ratioOf(row);
    if (tier === 'elite' && r <= 2) {
      rationale.push('elite + glass profile (hp/str ≤ 2) → smart dispatch candidate');
      return {
        tier: { tier: 'T3', dispatchTarget: { floorId: '2.1' } },
        confidence: 'medium',
        rationale: rationale
      };
    }
    if (tier === 'elite' && r >= 5) {
      rationale.push('elite + tanky profile (hp/str ≥ 5) → persistent NPC candidate');
      return {
        tier: { tier: 'T2', dialogueTreeId: 'generic_greet' },
        confidence: 'low',
        rationale: rationale
      };
    }
    // DRAIN/CC signal (needs deck data — may be absent)
    if (hasArchetypeSignal(row, ['DRAIN', 'CC'])) {
      rationale.push('DRAIN/CC intent in deck — semi-intelligent archetype');
      return {
        tier: { tier: 'T2', dialogueTreeId: 'generic_greet' },
        confidence: 'low',
        rationale: rationale
      };
    }
    rationale.push('default: standard enemy → wandering T1');
    return { tier: { tier: 'T1' }, confidence: 'high', rationale: rationale };
  }

  // Probe whether the deck (if present on the row via _deck sidecar snapshot)
  // carries any of the given intent types. Tolerant of missing data.
  function hasArchetypeSignal(row, intents) {
    if (!row || !row._deckIntents || !Array.isArray(row._deckIntents)) return false;
    for (var i = 0; i < row._deckIntents.length; i++) {
      for (var j = 0; j < intents.length; j++) {
        if (row._deckIntents[i] === intents[j]) return true;
      }
    }
    return false;
  }

  // ── Coherence report ──────────────────────────────────────
  // Builds { err, warn, info } arrays for the *current* tier choice
  // on the *current* row. Errors are validator-driven; warn/info are
  // editorial nudges (unknown floorId, missing dialogue key, legacy
  // top-level drift, etc).
  function coherenceReport(row, tierObj, dialogueKeys) {
    var rep = { err: [], warn: [], info: [] };
    var v = validateTier(tierObj, row);
    for (var i = 0; i < v.errs.length; i++) rep.err.push(v.errs[i]);
    for (var j = 0; j < v.warns.length; j++) rep.warn.push(v.warns[j]);

    if (!row) return rep;

    // Legacy top-level drift
    var legacy = getLegacyTier(row);
    if (legacy !== undefined) {
      var sameAsCanonical = _deepSimpleEqual(legacy, tierObj);
      if (!sameAsCanonical) {
        rep.info.push('legacy top-level reanimTier: ' + _shortTag(legacy) +
          ' — brain.reanimTier wins at runtime.');
      }
    }

    // Boss + non-null
    if (row.tier === 'boss' && isPlainObj(tierObj) && tierObj.tier) {
      rep.warn.push('boss reanim is unusual — confirm lore intent.');
    }

    // Non-lethal + T3
    if (row.nonLethal && isPlainObj(tierObj) && tierObj.tier === 'T3') {
      rep.info.push('non-lethal row dispatching — confirm reanim economy balance.');
    }

    // T2 dialogueTreeId unknown
    if (isPlainObj(tierObj) && tierObj.tier === 'T2' && hasStr(tierObj.dialogueTreeId)) {
      var keys = Array.isArray(dialogueKeys) ? dialogueKeys : [];
      if (keys.length && !arrHas(keys, tierObj.dialogueTreeId)) {
        rep.warn.push('dialogueTreeId "' + tierObj.dialogueTreeId +
          '" not found in npc-dialogue-trees.js — will fail silently at runtime.');
      }
    }

    // T3 floorId unknown (seed-based — not authoritative)
    if (isPlainObj(tierObj) && tierObj.tier === 'T3' &&
        isPlainObj(tierObj.dispatchTarget) && hasStr(tierObj.dispatchTarget.floorId)) {
      if (!arrHas(FLOOR_ID_SEEDS, tierObj.dispatchTarget.floorId)) {
        rep.warn.push('floorId "' + tierObj.dispatchTarget.floorId +
          '" is not in the seed list — verify it exists in floor-data.json.');
      }
    }

    return rep;
  }

  function _shortTag(v) {
    if (v == null) return 'null';
    if (isPlainObj(v)) return v.tier || JSON.stringify(v);
    return String(v);
  }
  function _deepSimpleEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == b;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
  }

  // ── Roster rollup ─────────────────────────────────────────
  function rollup(rows) {
    var total = 0, t1 = 0, t2 = 0, t3 = 0, nullCt = 0, nonReanim = 0, errs = 0, warns = 0;
    var byTier = { standard: { t1: 0, t2: 0, t3: 0, null: 0 },
                   elite:    { t1: 0, t2: 0, t3: 0, null: 0 },
                   boss:     { t1: 0, t2: 0, t3: 0, null: 0 } };
    var byProfile = { balanced: { t1: 0, t2: 0, t3: 0, null: 0 },
                      tanky:    { t1: 0, t2: 0, t3: 0, null: 0 },
                      glass:    { t1: 0, t2: 0, t3: 0, null: 0 } };
    var arr = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < arr.length; i++) {
      var row = arr[i];
      if (!row || !row.id) continue;
      total++;
      var tObj = getTier(row);
      var bucket = 'null';
      if (isPlainObj(tObj) && tObj.tier === 'T1') { t1++; bucket = 't1'; }
      else if (isPlainObj(tObj) && tObj.tier === 'T2') { t2++; bucket = 't2'; }
      else if (isPlainObj(tObj) && tObj.tier === 'T3') { t3++; bucket = 't3'; }
      else { nullCt++; bucket = 'null'; }
      if (isFlaggedNonReanim(row)) nonReanim++;

      var tier = row.tier || 'standard';
      if (byTier[tier]) byTier[tier][bucket]++;
      var prof = _profileFor(row);
      if (byProfile[prof]) byProfile[prof][bucket]++;

      var val = validateTier(tObj, row);
      if (!val.ok) errs++;
      else if (val.warns.length) warns++;
    }
    return {
      total: total, t1: t1, t2: t2, t3: t3, 'null': nullCt,
      nonReanim: nonReanim, errs: errs, warns: warns,
      byTier: byTier, byProfile: byProfile
    };
  }

  function _profileFor(row) {
    var r = ratioOf(row);
    if (r >= 5) return 'tanky';
    if (r <= 2) return 'glass';
    return 'balanced';
  }

  // ── Writeback normalize ───────────────────────────────────
  // Strips optional / stale fields so the saved shape is tier-minimal.
  // Returns the object that should be assigned to row.brain.reanimTier.
  function normalizeTierForWrite(tierObj) {
    if (tierObj === null || tierObj === undefined) return null;
    if (!isPlainObj(tierObj)) return null;
    if (!arrHas(TIERS, tierObj.tier)) return null;
    if (tierObj.tier === 'T1') return { tier: 'T1' };
    if (tierObj.tier === 'T2') {
      if (!hasStr(tierObj.dialogueTreeId)) return null; // invalid; caller should not land here
      return { tier: 'T2', dialogueTreeId: tierObj.dialogueTreeId };
    }
    if (tierObj.tier === 'T3') {
      if (!isPlainObj(tierObj.dispatchTarget) || !hasStr(tierObj.dispatchTarget.floorId)) return null;
      var dt = { floorId: tierObj.dispatchTarget.floorId };
      if (hasStr(tierObj.dispatchTarget.shopId)) dt.shopId = tierObj.dispatchTarget.shopId;
      if (hasStr(tierObj.dispatchTarget.processedVariantId)) {
        dt.processedVariantId = tierObj.dispatchTarget.processedVariantId;
      }
      return { tier: 'T3', dispatchTarget: dt };
    }
    return null;
  }

  // ── Dialogue tree key cache ───────────────────────────────
  var _dialogueKeysCache = null;
  function getDialogueKeys() {
    if (_dialogueKeysCache) return _dialogueKeysCache.slice();
    _dialogueKeysCache = _scanDialogueKeys();
    return _dialogueKeysCache.slice();
  }
  function _scanDialogueKeys() {
    try {
      var src = '';
      if (typeof window !== 'undefined' && window.NpcDialogueTrees &&
          typeof window.NpcDialogueTrees._sourceText === 'string') {
        src = window.NpcDialogueTrees._sourceText;
      }
      if (!src) return DIALOGUE_FALLBACK.slice();
      var keys = [];
      var re = /NpcSystem\.registerTree\(\s*['"]([^'"]+)['"]/g;
      var m;
      while ((m = re.exec(src)) !== null) keys.push(m[1]);
      if (!keys.length) return DIALOGUE_FALLBACK.slice();
      // De-dupe preserving order
      var seen = {}, out = [];
      for (var i = 0; i < keys.length; i++) {
        if (!seen[keys[i]]) { seen[keys[i]] = 1; out.push(keys[i]); }
      }
      return out;
    } catch (_) {
      return DIALOGUE_FALLBACK.slice();
    }
  }

  // ── View builder ──────────────────────────────────────────
  function buildView(row, allRows) {
    var tier = getTier(row);
    var legacy = getLegacyTier(row);
    var dialogueKeys = getDialogueKeys();
    var coh = coherenceReport(row, tier, dialogueKeys);
    var suggestion = suggestTier(row);
    var distribution = rollup(allRows || []);
    var meta = {
      id: row ? row.id : null,
      name: row ? (row.name || '') : '',
      tier: row ? (row.tier || 'standard') : 'standard',
      profile: _profileFor(row),
      ratio: Math.round(ratioOf(row) * 10) / 10,
      nonLethal: !!(row && row.nonLethal),
      flaggedNonReanim: isFlaggedNonReanim(row),
      hasLegacy: (legacy !== undefined),
      legacy: legacy
    };
    return {
      meta: meta,
      tier: tier,
      coherence: coh,
      suggestion: suggestion,
      distribution: distribution,
      dialogueKeys: dialogueKeys
    };
  }

  // ── DOM helpers ───────────────────────────────────────────
  function $(id) { return (typeof document !== 'undefined') ? document.getElementById(id) : null; }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function tierLabel(t) {
    if (t === null || t === undefined) return 'null';
    if (isPlainObj(t)) return t.tier || '?';
    return String(t);
  }

  // ── Renderers ─────────────────────────────────────────────
  function renderDistribution(dist) {
    var total = dist.total || 1;
    function bar(label, n) {
      var w = Math.max(0, Math.round(160 * (n / total)));
      return '<div class="ehr-dist-row">' +
        '<span class="ehr-dist-lbl">' + label + '</span>' +
        '<span class="ehr-dist-bar"><span class="ehr-dist-fill" style="width:' + w + 'px"></span></span>' +
        '<span class="ehr-dist-n">' + n + '</span></div>';
    }
    return '<div class="ehr-dist">' +
      '<div class="ehr-dist-head">Roster reanim distribution · ' + dist.total +
      ' total · errs:' + dist.errs + ' warns:' + dist.warns +
      (dist.nonReanim ? ' · nonReanim:' + dist.nonReanim : '') + '</div>' +
      bar('T1', dist.t1) +
      bar('T2', dist.t2) +
      bar('T3', dist.t3) +
      bar('\u2205', dist['null']) +
      '</div>';
  }

  function renderTierPills(currentTier) {
    var key = tierLabel(currentTier);
    function pill(val, label) {
      var sel = (val === key) ? ' ehr-pill-sel' : '';
      return '<button type="button" class="ehr-pill' + sel + '" data-tier="' + val + '">' + label + '</button>';
    }
    return '<div class="ehr-pills">' +
      pill('null', '\u2205 null') +
      pill('T1', 'T1 wander') +
      pill('T2', 'T2 dialogue') +
      pill('T3', 'T3 dispatch') +
      '</div>';
  }

  function renderSubForm(tier, dialogueKeys) {
    if (!isPlainObj(tier)) {
      return '<div class="ehr-sub ehr-sub-null">' +
        '<span class="ehr-dim">Corpse will be salvage-only. No reanim.</span></div>';
    }
    if (tier.tier === 'T1') {
      return '<div class="ehr-sub ehr-sub-t1">' +
        '<span class="ehr-dim">T1 wanderer — no extra fields.</span></div>';
    }
    if (tier.tier === 'T2') {
      var dv = hasStr(tier.dialogueTreeId) ? tier.dialogueTreeId : '';
      var opts = '';
      for (var i = 0; i < dialogueKeys.length; i++) {
        opts += '<option value="' + escapeHtml(dialogueKeys[i]) + '">';
      }
      return '<div class="ehr-sub ehr-sub-t2">' +
        '<label>dialogueTreeId ' +
          '<input type="text" id="ehr-dialogue" list="ehr-dialogue-keys" value="' + escapeHtml(dv) + '" />' +
        '</label>' +
        '<datalist id="ehr-dialogue-keys">' + opts + '</datalist>' +
        '<div class="ehr-dim">' + dialogueKeys.length + ' known keys (datalist)</div>' +
        '</div>';
    }
    if (tier.tier === 'T3') {
      var dt = isPlainObj(tier.dispatchTarget) ? tier.dispatchTarget : {};
      var fv = hasStr(dt.floorId) ? dt.floorId : '';
      var sv = hasStr(dt.shopId) ? dt.shopId : '';
      var pv = hasStr(dt.processedVariantId) ? dt.processedVariantId : '';
      function dlist(id, arr) {
        var o = '';
        for (var i = 0; i < arr.length; i++) o += '<option value="' + escapeHtml(arr[i]) + '">';
        return '<datalist id="' + id + '">' + o + '</datalist>';
      }
      return '<div class="ehr-sub ehr-sub-t3">' +
        '<label>floorId <span class="ehr-req">*</span> ' +
          '<input type="text" id="ehr-floor" list="ehr-floor-seeds" value="' + escapeHtml(fv) + '" />' +
        '</label>' +
        '<label>shopId ' +
          '<input type="text" id="ehr-shop" list="ehr-shop-seeds" value="' + escapeHtml(sv) + '" />' +
        '</label>' +
        '<label>processedVariantId ' +
          '<input type="text" id="ehr-variant" list="ehr-variant-seeds" value="' + escapeHtml(pv) + '" />' +
        '</label>' +
        dlist('ehr-floor-seeds', FLOOR_ID_SEEDS) +
        dlist('ehr-shop-seeds',  SHOP_ID_SEEDS) +
        dlist('ehr-variant-seeds', VARIANT_SEEDS) +
        '</div>';
    }
    return '';
  }

  function renderSuggestion(sug) {
    var tag = sug.tier ? (isPlainObj(sug.tier) ? sug.tier.tier : String(sug.tier)) : '\u2205';
    var conf = sug.confidence || 'med';
    var rat = (sug.rationale || []).join(' · ');
    return '<div class="ehr-sugg">' +
      '<button type="button" id="ehr-suggest-apply" class="ehr-sugg-btn">Suggest tier</button> ' +
      '<span class="ehr-sugg-tag">\u2192 ' + escapeHtml(tag) +
        ' <span class="ehr-conf ehr-conf-' + conf + '">' + conf + '</span></span>' +
      '<div class="ehr-sugg-rat ehr-dim">' + escapeHtml(rat) + '</div>' +
      '</div>';
  }

  function renderCoherence(coh) {
    var html = '';
    function line(level, msg) {
      return '<div class="ehr-coh-row ehr-coh-' + level + '">' +
        '<span class="ehr-coh-lvl">' + level + '</span> ' + escapeHtml(msg) + '</div>';
    }
    for (var i = 0; i < coh.err.length;  i++) html += line('err',  coh.err[i]);
    for (var j = 0; j < coh.warn.length; j++) html += line('warn', coh.warn[j]);
    for (var k = 0; k < coh.info.length; k++) html += line('info', coh.info[k]);
    if (!html) html = '<div class="ehr-coh-row ehr-coh-ok">no issues</div>';
    return '<div class="ehr-coh">' + html + '</div>';
  }

  // ── State ─────────────────────────────────────────────────
  var _view       = null;
  var _currentId  = null;
  var _editTier   = null;   // in-flight edit (not yet saved)
  var _dirtyLocal = false;

  // ── Render orchestrator ───────────────────────────────────
  function render() {
    var host = $('reanim-host');
    if (!host) return;
    var row = (typeof window !== 'undefined' && window.EnemyHydrator && window.EnemyHydrator.currentRow)
      ? window.EnemyHydrator.currentRow() : null;
    var allRows = (typeof window !== 'undefined' && window.EH && window.EH.rows) ? window.EH.rows() : [];

    if (!row) {
      host.innerHTML = '<div class="ehr-dim">Select an enemy to edit its reanim tier.</div>';
      return;
    }

    _view = buildView(row, allRows);
    if (_editTier === null || _editTier === undefined) _editTier = _view.tier;
    // recompute coherence for the in-flight edit
    var cohEdit = coherenceReport(row, _editTier, _view.dialogueKeys);

    var headLine = '<div class="ehr-head">' +
      '<strong>' + escapeHtml(_view.meta.id) + '</strong> ' + escapeHtml(_view.meta.name) +
      ' <span class="ehr-dim">· ' + _view.meta.tier + '/' + _view.meta.profile +
      ' · hp/str=' + _view.meta.ratio +
      (_view.meta.nonLethal ? ' · nonLethal' : '') +
      (_view.meta.flaggedNonReanim ? ' · <span class="ehr-flag">nonReanim flag</span>' : '') +
      '</span></div>';

    var html = '';
    html += renderDistribution(_view.distribution);
    html += headLine;
    html += '<div class="ehr-section"><h5>Current tier</h5>' + renderTierPills(_editTier) + '</div>';
    html += '<div class="ehr-section"><h5>Fields</h5>' + renderSubForm(_editTier, _view.dialogueKeys) + '</div>';
    html += '<div class="ehr-section"><h5>Suggest tier</h5>' + renderSuggestion(_view.suggestion) + '</div>';
    html += '<div class="ehr-section"><h5>Coherence</h5>' + renderCoherence(cohEdit) + '</div>';
    html += '<div class="ehr-actions">' +
      '<button type="button" id="ehr-revert" class="ehr-act">Revert</button> ' +
      '<button type="button" id="ehr-save" class="ehr-act ehr-act-primary"' +
        (cohEdit.err.length ? ' data-blocked="1"' : '') + '>Save to row' +
        (_dirtyLocal ? ' <span class="ehr-badge">dirty</span>' : '') +
        (cohEdit.err.length ? ' <span class="ehr-badge ehr-badge-err">errs:' + cohEdit.err.length + '</span>' : '') +
      '</button></div>';
    host.innerHTML = html;
    _wire(row);
  }

  function _wire(row) {
    var host = $('reanim-host');
    if (!host) return;
    var pills = host.querySelectorAll('.ehr-pill');
    for (var i = 0; i < pills.length; i++) {
      (function (btn) { btn.addEventListener('click', function () { _onPickTier(btn.getAttribute('data-tier')); }); })(pills[i]);
    }
    function bindInput(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('input', function () { fn(el.value); }); }
    bindInput('ehr-dialogue', function (v) { _onFieldChange('dialogueTreeId', v, false); });
    bindInput('ehr-floor',    function (v) { _onFieldChange('floorId', v, true); });
    bindInput('ehr-shop',     function (v) { _onFieldChange('shopId', v, true); });
    bindInput('ehr-variant',  function (v) { _onFieldChange('processedVariantId', v, true); });
    var sg = document.getElementById('ehr-suggest-apply');
    if (sg) sg.addEventListener('click', function () {
      if (_view && _view.suggestion) { _editTier = _view.suggestion.tier; _dirtyLocal = true; render(); }
    });
    var sv = document.getElementById('ehr-save');
    if (sv) sv.addEventListener('click', function () { _onSave(row); });
    var rv = document.getElementById('ehr-revert');
    if (rv) rv.addEventListener('click', function () { _onRevertLocal(row); });
  }

  function _onPickTier(val) {
    if (val === 'null') { _editTier = null; }
    else if (val === 'T1') { _editTier = { tier: 'T1' }; }
    else if (val === 'T2') {
      var prev = isPlainObj(_editTier) ? _editTier : {};
      _editTier = { tier: 'T2', dialogueTreeId: hasStr(prev.dialogueTreeId) ? prev.dialogueTreeId : '' };
    }
    else if (val === 'T3') {
      var p = isPlainObj(_editTier) ? _editTier : {};
      var dt = isPlainObj(p.dispatchTarget) ? p.dispatchTarget : {};
      _editTier = { tier: 'T3', dispatchTarget: {
        floorId: hasStr(dt.floorId) ? dt.floorId : '',
        shopId: hasStr(dt.shopId) ? dt.shopId : undefined,
        processedVariantId: hasStr(dt.processedVariantId) ? dt.processedVariantId : undefined
      }};
      // prune undefineds so normalize-for-write stays happy
      if (_editTier.dispatchTarget.shopId === undefined) delete _editTier.dispatchTarget.shopId;
      if (_editTier.dispatchTarget.processedVariantId === undefined) delete _editTier.dispatchTarget.processedVariantId;
    }
    _dirtyLocal = true;
    render();
  }

  // Unified field-change handler. `dispatch=true` targets dispatchTarget.*.
  function _onFieldChange(key, val, dispatch) {
    if (!isPlainObj(_editTier)) return;
    if (dispatch) {
      if (_editTier.tier !== 'T3') return;
      if (!isPlainObj(_editTier.dispatchTarget)) _editTier.dispatchTarget = { floorId: '' };
      if (hasStr(val)) _editTier.dispatchTarget[key] = val;
      else delete _editTier.dispatchTarget[key];
    } else {
      _editTier[key] = val;
    }
    _dirtyLocal = true;
    _rerenderCoherence();
  }
  function _rerenderCoherence() {
    var row = (window.EnemyHydrator && window.EnemyHydrator.currentRow) ? window.EnemyHydrator.currentRow() : null;
    if (!row) return;
    var coh = coherenceReport(row, _editTier, getDialogueKeys());
    var host = document.querySelector('#reanim-host .ehr-coh');
    if (host) host.outerHTML = renderCoherence(coh);
    // Update save button error badge
    var sv = document.getElementById('ehr-save');
    if (sv) {
      if (coh.err.length) sv.setAttribute('data-blocked', '1');
      else sv.removeAttribute('data-blocked');
    }
  }

  function _onSave(row) {
    var coh = coherenceReport(row, _editTier, getDialogueKeys());
    if (coh.err.length) {
      if (window.EnemyHydrator && window.EnemyHydrator.toast) {
        window.EnemyHydrator.toast('reanim errors prevent save: ' + coh.err[0], 'err');
      }
      return;
    }
    var norm = normalizeTierForWrite(_editTier);
    if (!row.brain) row.brain = {};
    row.brain.reanimTier = norm;
    _dirtyLocal = false;
    if (window.EnemyHydrator && window.EnemyHydrator.markDirty) window.EnemyHydrator.markDirty();
    if (window.EnemyHydrator && window.EnemyHydrator.toast) {
      window.EnemyHydrator.toast('reanim saved: ' + _shortTag(norm), 'ok');
    }
    render();
  }

  function _onRevertLocal(row) {
    _editTier = getTier(row);
    _dirtyLocal = false;
    render();
  }

  // ── Event wiring ──────────────────────────────────────────
  function onSelect(ev) {
    _currentId = (ev && ev.detail && ev.detail.id) || null;
    _editTier = null; // re-seed from row on next render
    _dirtyLocal = false;
    render();
  }
  function onRevert() {
    _editTier = null;
    _dirtyLocal = false;
    render();
  }

  function init() {
    if (typeof document === 'undefined') return;
    document.addEventListener('enemy-hydrator:select', onSelect);
    document.addEventListener('enemy-hydrator:revert', onRevert);
    if (window.EnemyHydrator && window.EnemyHydrator.currentRow) {
      var r = window.EnemyHydrator.currentRow();
      if (r && r.id) _currentId = r.id;
    }
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // ── Public debug surface ──────────────────────────────────
  // Mixed: pure functions (no DOM) for smoke + tooling, plus a few
  // state accessors. No setters beyond the canonical save path.
  if (typeof window !== 'undefined') {
    window.EnemyHydratorReanim = {
      TIERS:                  TIERS.slice(),
      NON_REANIM_TAGS:        NON_REANIM_TAGS.slice(),
      FLOOR_ID_SEEDS:         FLOOR_ID_SEEDS.slice(),
      SHOP_ID_SEEDS:          SHOP_ID_SEEDS.slice(),
      VARIANT_SEEDS:          VARIANT_SEEDS.slice(),
      DIALOGUE_FALLBACK:      DIALOGUE_FALLBACK.slice(),
      getTier:                getTier,
      getLegacyTier:          getLegacyTier,
      isFlaggedNonReanim:     isFlaggedNonReanim,
      validateTier:           validateTier,
      suggestTier:            suggestTier,
      coherenceReport:        coherenceReport,
      rollup:                 rollup,
      normalizeTierForWrite:  normalizeTierForWrite,
      getDialogueKeys:        getDialogueKeys,
      buildView:              buildView,
      getCurrentView:         function () { return _view; },
      getCurrentId:           function () { return _currentId; },
      getEditTier:            function () { return _editTier; },
      _version:               '1.0.0'
    };
  }
})();
