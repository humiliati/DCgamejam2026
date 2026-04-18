// ============================================================
// tools/js/enemy-hydrator-loot.js — DOC-110 P5.4 (Loot tab)
// ------------------------------------------------------------
// Loot tab for tools/enemy-hydrator.html. Purely *observational*:
// closed-form expected-value (EV) breakdown of an enemy's drop
// table, cross-referenced against data/loot-tables.json, with a
// volatility signal on each slot, per-biome card-rarity rolldown,
// and a normalized "total value" scalar for cross-enemy comparison.
// Does not mutate data. Does not register exporters.
//
// What the view contains, per enemy:
//   1. Summary card      — gold range, total drop chance, XP,
//                          guaranteed drops, total value, volatility
//   2. Per-slot breakdown — one row per resource slot with
//                          { chance, ev, volatility, contribPct }
//   3. Card-rarity panel  — aggregate row (equal-weight mean) +
//                          one row per enemy biome
//   4. Warnings           — observational, never blocking
//
// Closed-form EV (no Monte Carlo):
//   range slot       → ev = chance × (min + max) / 2
//   chance-only slot → ev = chance × 1
//   guaranteed drop  → ev floor of 1 on the tier-designated slot
//
// Volatility signal (cheap, no simulation):
//   range slot       → spread = max - min        → low / medium / high
//   chance-only slot → p × (1 - p)               → low / medium / high
//   rollup           → contribPct-weighted mean of slot volatilities
//
// Total value (normalized scalar for cross-enemy comparison):
//   totalValue = Σ (slot.ev × VALUE_WEIGHTS[slotKey])
//
// VALUE_WEIGHTS are designer-calibratable. They are rough economic
// proxies, not a balance authority — a card drop is worth ~6x a
// gold piece not because it is, but because designers eyeballing
// tuning want cards to register heavier than coins. Tune here.
//
// Forward hook: estimateDropsOverRounds(enemy, rounds) — bridges
// 5.3 time to 5.4 reward, gives gold/XP-per-round pacing scalars
// so later tooling can compare enemy efficiency at different fight
// lengths without rewriting the EV layer.
//
// Loose coupling with the main hydrator IIFE (same contract as 5.3):
//
//   window.EnemyHydrator.currentRow()          ← read selected enemy
//   window.EnemyHydrator.toast(msg, cls)       ← user feedback (rare)
//
//   document 'enemy-hydrator:select' event     ← selection changed
//   document 'enemy-hydrator:revert' event     ← main state reverted
//
// Reads: window.LOOT_TABLES_DATA.  Writes: none.
// ============================================================
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────
  // Six slot keys, fixed order — matches loot-tables.json profile shape.
  var SLOT_KEYS = ['currency', 'battery', 'food', 'card', 'salvage', 'key_frag'];

  // Designer-calibratable value weights. 1 gold = 1 unit.
  // Pick numbers the table below should read as "cards feel heavier
  // than coins, keys heavier than cards" without claiming precision.
  var VALUE_WEIGHTS = {
    currency: 1.0,
    battery:  2.0,
    food:     1.5,
    card:     6.0,
    salvage:  2.5,
    key_frag: 8.0
  };

  // Per-slot display colour. Picked to echo the Stats-tab tier chips
  // (amber/cyan/violet) without colliding with the intent palette in 5.3.
  var SLOT_COLORS = {
    currency: '#f4c768',
    battery:  '#67c7e8',
    food:     '#9fd27a',
    card:     '#d17ae2',
    salvage:  '#c78a5a',
    key_frag: '#f0f0a8'
  };

  // Volatility bucket labels + numeric score for rollup.
  var VOL_LOW = 'low', VOL_MED = 'medium', VOL_HIGH = 'high';
  var VOL_SCORE = { low: 1, medium: 2, high: 3 };

  // Range-spread thresholds (max - min)
  var VOL_RANGE_LOW = 2;    // spread < 2  → low
  var VOL_RANGE_MED = 4;    // spread ≤ 4 → medium; > 4 → high

  // Chance-variance thresholds (p × (1-p), max 0.25 at p=0.5)
  var VOL_CHANCE_LOW = 0.09; // |p-0.5| > ~0.30
  var VOL_CHANCE_MED = 0.21; // |p-0.5| > ~0.04

  // ── Pure helpers ──────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function round3(v) { return Math.round(v * 1000) / 1000; }

  function volForRange(lo, hi) {
    var s = Math.max(0, (hi || 0) - (lo || 0));
    if (s < VOL_RANGE_LOW) return VOL_LOW;
    if (s <= VOL_RANGE_MED) return VOL_MED;
    return VOL_HIGH;
  }
  function volForChance(p) {
    var v = p * (1 - p);
    if (v < VOL_CHANCE_LOW) return VOL_LOW;
    if (v < VOL_CHANCE_MED) return VOL_MED;
    return VOL_HIGH;
  }

  // Compute a single slot's { enabled, chance, min, max, ev, volatility }.
  // Tier additions apply to `card` (card_chance_add) and `salvage`
  // (salvage_chance_add). `currency_max_mult` scales the max only.
  function computeSlot(profileSlot, slotKey, tierMults) {
    if (!profileSlot || profileSlot.enabled === false) {
      return { enabled: false, chance: 0, min: 0, max: 0, ev: 0, volatility: VOL_LOW };
    }
    var chance = typeof profileSlot.chance === 'number' ? profileSlot.chance : 1.0;
    var min    = typeof profileSlot.min === 'number' ? profileSlot.min : 1;
    var max    = typeof profileSlot.max === 'number' ? profileSlot.max : min;

    if (slotKey === 'currency' && tierMults && typeof tierMults.currency_max_mult === 'number') {
      max = Math.round(max * tierMults.currency_max_mult);
    }
    if (slotKey === 'card' && tierMults && typeof tierMults.card_chance_add === 'number') {
      chance = clamp(chance + tierMults.card_chance_add, 0, 1);
    }
    if (slotKey === 'salvage' && tierMults && typeof tierMults.salvage_chance_add === 'number') {
      chance = clamp(chance + tierMults.salvage_chance_add, 0, 1);
    }

    var hasRange = (slotKey === 'currency' || slotKey === 'battery') && max >= min;
    var ev, vol;
    if (hasRange) {
      ev  = chance * ((min + max) / 2);
      vol = volForRange(min, max);
    } else {
      ev  = chance * 1;
      vol = volForChance(chance);
    }
    return {
      enabled:    true,
      chance:     round3(chance),
      min:        hasRange ? min : null,
      max:        hasRange ? max : null,
      ev:         round3(ev),
      volatility: vol,
      pool:       profileSlot.pool || null,
      bias:       profileSlot.bias || null
    };
  }

  // Equal-weight mean of two rarity weight maps; used for the
  // aggregate card-rarity row when the enemy spans multiple biomes.
  function meanWeights(weightSets) {
    var out = {};
    var n = weightSets.length;
    if (!n) return out;
    for (var i = 0; i < n; i++) {
      var w = weightSets[i] || {};
      for (var k in w) if (w.hasOwnProperty(k) && typeof w[k] === 'number') {
        out[k] = (out[k] || 0) + w[k] / n;
      }
    }
    for (var k2 in out) out[k2] = round2(out[k2]);
    return out;
  }

  function normalizeWeights(weights) {
    // Return a {key: pct} map summing to 100 for bar rendering.
    var sum = 0, keys = Object.keys(weights || {});
    for (var i = 0; i < keys.length; i++) sum += weights[keys[i]] || 0;
    if (sum <= 0) return {};
    var out = {};
    for (var j = 0; j < keys.length; j++) out[keys[j]] = round2(100 * (weights[keys[j]] / sum));
    return out;
  }

  // ── View builder ──────────────────────────────────────────
  function buildView(row, tables) {
    var warnings = [];
    var view = {
      meta: {
        enemyId:       row && row.id ? row.id : null,
        lootProfile:   row && row.lootProfile ? row.lootProfile : null,
        tier:          row && row.tier ? row.tier : null,
        biomes:        (row && Array.isArray(row.biomes)) ? row.biomes.slice() : [],
        nonLethal:     !!(row && row.nonLethal),
        profileMissing: false,
        tierMissing:   false
      },
      slots: {},
      summary: {
        goldMin: 0, goldMax: 0, goldEv: 0,
        totalDropChance: 0, totalValue: 0, xp: 0,
        volatility: VOL_LOW,
        guaranteed: null
      },
      cardDrops: { aggregate: null, perBiome: [] },
      warnings: warnings
    };

    if (!row) { warnings.push({ level: 'warn', msg: 'No enemy selected.' }); return view; }
    if (!tables) { warnings.push({ level: 'err', msg: 'Loot tables not loaded.' }); return view; }

    // ── non-lethal early out (category label, not an error) ──
    if (!view.meta.lootProfile) {
      if (view.meta.nonLethal) {
        warnings.push({ level: 'info', msg: 'N/A — non-lethal enemy, no loot profile.' });
      } else {
        warnings.push({ level: 'warn', msg: 'No lootProfile set.' });
      }
      return view;
    }
    if (view.meta.nonLethal) {
      // Has both — valid design pattern (sparring, disarm, capture).
      warnings.push({ level: 'info', msg: 'Non-lethal drop source (valid pattern — sparring / disarm / capture).' });
    }

    // ── resolve profile ──
    var profile = tables.enemy_resource_profiles && tables.enemy_resource_profiles[view.meta.lootProfile];
    if (!profile) {
      view.meta.profileMissing = true;
      warnings.push({ level: 'err', msg: 'Unknown lootProfile "' + view.meta.lootProfile + '" — not in enemy_resource_profiles.' });
      return view;
    }

    // ── resolve tier multipliers ──
    var tierMults = tables.enemy_tier_multipliers && tables.enemy_tier_multipliers[view.meta.tier];
    if (!tierMults) {
      view.meta.tierMissing = true;
      tierMults = { currency_max_mult: 1, card_chance_add: 0, salvage_chance_add: 0, xp: 0 };
      warnings.push({ level: 'warn', msg: 'Unknown tier "' + (view.meta.tier || '?') + '" — falling back to neutral multipliers.' });
    }

    // ── per-slot EV ──
    var goldMin = 0, goldMax = 0, goldEv = 0, totalDropChance = 0, totalValue = 0;
    var enabledSlots = [];
    for (var i = 0; i < SLOT_KEYS.length; i++) {
      var key = SLOT_KEYS[i];
      var slot = computeSlot(profile[key], key, tierMults);
      view.slots[key] = slot;
      if (!slot.enabled) continue;
      enabledSlots.push(key);
      totalDropChance += slot.chance;
      totalValue      += slot.ev * (VALUE_WEIGHTS[key] || 1);
      if (key === 'currency') {
        goldMin = slot.min || 0;
        goldMax = slot.max || 0;
        goldEv  = slot.ev;
      }
    }

    // ── guaranteed drops ──
    if (tierMults.guaranteed_drop) {
      var gType = tierMults.guaranteed_type || 'card';
      view.summary.guaranteed = {
        type:       gType,
        bonusRelic: !!tierMults.bonus_relic
      };
      totalValue += (VALUE_WEIGHTS[gType] != null) ? VALUE_WEIGHTS[gType] : VALUE_WEIGHTS.card;
      if (tierMults.bonus_relic) totalValue += VALUE_WEIGHTS.card; // relic treated as card-weight
    }

    // ── contribution % + volatility rollup ──
    var volNum = 0, volDenom = 0;
    for (var j = 0; j < SLOT_KEYS.length; j++) {
      var k2 = SLOT_KEYS[j];
      var s2 = view.slots[k2];
      if (!s2.enabled) { s2.contribPct = 0; continue; }
      var slotValue = s2.ev * (VALUE_WEIGHTS[k2] || 1);
      s2.contribPct = totalValue > 0 ? round2(100 * (slotValue / totalValue)) : 0;
      volNum   += VOL_SCORE[s2.volatility] * s2.contribPct;
      volDenom += s2.contribPct;
    }
    var volAvg = volDenom > 0 ? (volNum / volDenom) : 1;
    view.summary.volatility = (volAvg < 1.67) ? VOL_LOW : (volAvg < 2.34 ? VOL_MED : VOL_HIGH);

    view.summary.goldMin         = goldMin;
    view.summary.goldMax         = goldMax;
    view.summary.goldEv          = round3(goldEv);
    view.summary.totalDropChance = round3(clamp(totalDropChance, 0, (SLOT_KEYS.length)));
    view.summary.totalValue      = round2(totalValue);
    view.summary.xp              = tierMults.xp || 0;

    // ── card-rarity rolldown ──
    var cardDrops = tables.card_drops || {};
    var elementBias = cardDrops._element_bias || {};
    var biomeRows = [];
    var missingBiomes = [];
    for (var b = 0; b < view.meta.biomes.length; b++) {
      var biome = view.meta.biomes[b];
      var rarities = cardDrops[biome];
      if (!rarities || typeof rarities !== 'object') {
        missingBiomes.push(biome);
        continue;
      }
      // Strip comment keys.
      var raw = {};
      for (var rk in rarities) if (rarities.hasOwnProperty(rk) && rk[0] !== '_' && typeof rarities[rk] === 'number') raw[rk] = rarities[rk];
      biomeRows.push({
        biome:     biome,
        rarityRaw: raw,
        rarityPct: normalizeWeights(raw),
        elementRaw: elementBias[biome] || null,
        elementPct: normalizeWeights(elementBias[biome] || {})
      });
    }
    if (missingBiomes.length) {
      warnings.push({ level: 'warn', msg: 'No card_drops table for biome(s): ' + missingBiomes.join(', ') + '.' });
    }
    if (biomeRows.length > 1) {
      var rarityMean  = meanWeights(biomeRows.map(function (r) { return r.rarityRaw; }));
      var elementMean = meanWeights(biomeRows.map(function (r) { return r.elementRaw || {}; }));
      view.cardDrops.aggregate = {
        weight:     round2(1 / biomeRows.length),
        rarityRaw:  rarityMean,
        rarityPct:  normalizeWeights(rarityMean),
        elementRaw: elementMean,
        elementPct: normalizeWeights(elementMean)
      };
    }
    view.cardDrops.perBiome = biomeRows;

    return view;
  }

  // Forward hook — bridges 5.3 (fight length) to 5.4 (reward).
  // Drops realize once on kill; this normalizes the reward payload
  // over N rounds so later tooling can ask "gold/round", "xp/round"
  // without rewriting the EV layer.
  function estimateDropsOverRounds(row, tables, rounds) {
    var R = (typeof rounds === 'number' && rounds > 0) ? rounds : 6;
    var v = buildView(row, tables);
    return {
      rounds:        R,
      perFight: {
        goldEv:     v.summary.goldEv,
        totalValue: v.summary.totalValue,
        xp:         v.summary.xp
      },
      perRound: {
        goldEv:     round3(v.summary.goldEv / R),
        totalValue: round3(v.summary.totalValue / R),
        xp:         round3(v.summary.xp / R)
      },
      volatility:   v.summary.volatility
    };
  }

  // ── DOM helpers ───────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function volBadge(vol) {
    return '<span class="ehl-vol ehl-vol-' + vol + '">' + vol + '</span>';
  }

  // ── Renderers ─────────────────────────────────────────────
  function renderSummary(view) {
    var s = view.summary;
    var goldLine = (s.goldMin === 0 && s.goldMax === 0)
      ? '<span class="ehl-dim">—</span>'
      : (s.goldMin + '–' + s.goldMax + ' <span class="ehl-dim">(EV ' + s.goldEv + ')</span>');
    var g = s.guaranteed
      ? '<strong>' + escapeHtml(s.guaranteed.type) + '</strong>' + (s.guaranteed.bonusRelic ? ' + relic' : '')
      : '<span class="ehl-dim">none</span>';
    return '<div class="ehl-summary">' +
      '<div class="ehl-kpi"><div class="ehl-kpi-v">' + goldLine + '</div><div class="ehl-kpi-k">Gold (min–max, EV)</div></div>' +
      '<div class="ehl-kpi"><div class="ehl-kpi-v">' + round2(s.totalDropChance * 100) / 100 + '</div><div class="ehl-kpi-k">Total drop chance</div></div>' +
      '<div class="ehl-kpi"><div class="ehl-kpi-v">' + s.xp + '</div><div class="ehl-kpi-k">XP</div></div>' +
      '<div class="ehl-kpi"><div class="ehl-kpi-v">' + g + '</div><div class="ehl-kpi-k">Guaranteed</div></div>' +
      '<div class="ehl-kpi"><div class="ehl-kpi-v">' + s.totalValue + '</div><div class="ehl-kpi-k">Total value</div></div>' +
      '<div class="ehl-kpi"><div class="ehl-kpi-v">' + volBadge(s.volatility) + '</div><div class="ehl-kpi-k">Volatility</div></div>' +
      '</div>';
  }

  function renderSlots(view) {
    var rows = '';
    for (var i = 0; i < SLOT_KEYS.length; i++) {
      var k = SLOT_KEYS[i];
      var s = view.slots[k];
      if (!s) continue;
      var swatch = '<span class="ehl-dot" style="background:' + SLOT_COLORS[k] + '"></span>';
      if (!s.enabled) {
        rows += '<tr class="ehl-off"><td>' + swatch + k + '</td>' +
                '<td colspan="5"><span class="ehl-dim">disabled</span></td></tr>';
        continue;
      }
      var range = (s.min != null) ? (s.min + '–' + s.max) : '—';
      var tags = [];
      if (s.pool) tags.push('pool=' + (Array.isArray(s.pool) ? s.pool.join('/') : s.pool));
      if (s.bias) tags.push('bias=' + s.bias);
      rows += '<tr>' +
        '<td>' + swatch + k + '</td>' +
        '<td>' + (s.chance * 100).toFixed(1) + '%</td>' +
        '<td>' + range + '</td>' +
        '<td>' + s.ev + '</td>' +
        '<td>' + volBadge(s.volatility) + '</td>' +
        '<td>' + (s.contribPct || 0) + '%' +
          (tags.length ? ' <span class="ehl-dim">' + escapeHtml(tags.join(' · ')) + '</span>' : '') +
        '</td>' +
        '</tr>';
    }
    return '<table class="ehl-slots"><thead><tr>' +
      '<th>Slot</th><th>Chance</th><th>Range</th><th>EV</th><th>Vol.</th><th>Share</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderWeightBar(pct, label, swatch) {
    var w = Math.max(1, Math.min(100, pct || 0));
    return '<div class="ehl-wbar-row">' +
      '<span class="ehl-wbar-lbl">' + (swatch || '') + escapeHtml(label) + '</span>' +
      '<span class="ehl-wbar"><span class="ehl-wbar-fill" style="width:' + w + '%"></span></span>' +
      '<span class="ehl-wbar-pct">' + (pct || 0) + '%</span>' +
      '</div>';
  }

  function renderCardDropRow(label, rarityPct, elementPct, isAggregate) {
    if (!rarityPct || !Object.keys(rarityPct).length) {
      return '<div class="ehl-cd-row' + (isAggregate ? ' ehl-cd-agg' : '') + '">' +
        '<div class="ehl-cd-head">' + escapeHtml(label) + ' <span class="ehl-dim">— no rarity data</span></div></div>';
    }
    var rorder = ['common', 'uncommon', 'rare', 'epic'];
    var bars = '';
    for (var i = 0; i < rorder.length; i++) {
      if (rarityPct[rorder[i]] != null) bars += renderWeightBar(rarityPct[rorder[i]], rorder[i]);
    }
    var el = '';
    if (elementPct && Object.keys(elementPct).length) {
      var eorder = ['flame', 'frost', 'storm', 'neutral'];
      for (var j = 0; j < eorder.length; j++) {
        if (elementPct[eorder[j]] != null) el += renderWeightBar(elementPct[eorder[j]], eorder[j]);
      }
    }
    return '<div class="ehl-cd-row' + (isAggregate ? ' ehl-cd-agg' : '') + '">' +
      '<div class="ehl-cd-head">' + escapeHtml(label) + '</div>' +
      '<div class="ehl-cd-cols">' +
        '<div class="ehl-cd-col"><h6>Rarity</h6>' + bars + '</div>' +
        '<div class="ehl-cd-col"><h6>Element</h6>' + (el || '<span class="ehl-dim">—</span>') + '</div>' +
      '</div></div>';
  }

  function renderWarnings(view) {
    if (!view.warnings.length) return '';
    var html = '';
    for (var i = 0; i < view.warnings.length; i++) {
      var w = view.warnings[i];
      html += '<div class="ehl-warn ehl-warn-' + w.level + '">' + escapeHtml(w.msg) + '</div>';
    }
    return html;
  }

  // ── State ─────────────────────────────────────────────────
  var _tables    = null;
  var _view      = null;
  var _currentId = null;

  function loadTables() {
    if (window.LOOT_TABLES_DATA && typeof window.LOOT_TABLES_DATA === 'object') {
      _tables = window.LOOT_TABLES_DATA;
      return true;
    }
    _tables = null;
    return false;
  }

  // ── Render orchestrator ───────────────────────────────────
  function render() {
    var host = $('loot-host');
    if (!host) return;
    var headEl = $('loot-head');
    var metaEl = $('loot-meta');
    var bodyEl = $('loot-body');

    if (!_currentId) {
      if (headEl) headEl.textContent = '—';
      if (metaEl) metaEl.innerHTML = '<span class="ehl-dim">Select an enemy to see its loot breakdown.</span>';
      if (bodyEl) bodyEl.innerHTML = '';
      return;
    }
    var row = (window.EnemyHydrator && window.EnemyHydrator.currentRow && window.EnemyHydrator.currentRow()) || null;
    if (!row) {
      if (headEl) headEl.textContent = _currentId;
      if (metaEl) metaEl.innerHTML = '<span class="ehl-dim">Enemy not found in roster.</span>';
      if (bodyEl) bodyEl.innerHTML = '';
      return;
    }
    _view = buildView(row, _tables);

    if (headEl) {
      headEl.textContent = _currentId + ' · ' + (row.name || '') +
        ' · tier=' + (row.tier || '?') +
        ' · profile=' + (row.lootProfile || '—');
    }
    var bits = [];
    bits.push('biomes=' + (_view.meta.biomes.join('/') || '—'));
    if (_view.meta.nonLethal) bits.push('<span class="ehl-flag">nonLethal</span>');
    if (_view.meta.profileMissing) bits.push('<span class="ehl-flag ehl-flag-err">profile missing</span>');
    if (_view.meta.tierMissing) bits.push('<span class="ehl-flag">tier missing</span>');
    if (metaEl) metaEl.innerHTML = bits.join(' · ');

    if (!bodyEl) return;
    var html = '';
    html += renderWarnings(_view);
    html += '<div class="ehl-section"><h5>Summary</h5>' + renderSummary(_view) + '</div>';
    if (_view.meta.lootProfile && !_view.meta.profileMissing) {
      html += '<div class="ehl-section"><h5>Per-slot breakdown</h5>' + renderSlots(_view) + '</div>';
      html += '<div class="ehl-section"><h5>Card-rarity rolldown</h5>';
      if (_view.cardDrops.aggregate) {
        html += renderCardDropRow('Encounter mix (equal-weight · 1/' + _view.cardDrops.perBiome.length + ' each)',
          _view.cardDrops.aggregate.rarityPct, _view.cardDrops.aggregate.elementPct, true);
      }
      for (var i = 0; i < _view.cardDrops.perBiome.length; i++) {
        var b = _view.cardDrops.perBiome[i];
        html += renderCardDropRow(b.biome, b.rarityPct, b.elementPct, false);
      }
      if (!_view.cardDrops.perBiome.length) {
        html += '<div class="ehl-dim">No biome-keyed card rarity data for this enemy.</div>';
      }
      html += '</div>';
    }
    bodyEl.innerHTML = html;
  }

  // ── Event wiring ──────────────────────────────────────────
  function onSelect(ev) { _currentId = (ev && ev.detail && ev.detail.id) || null; render(); }
  function onRevert() { render(); }

  function init() {
    if (!loadTables()) {
      if (window.EnemyHydrator && window.EnemyHydrator.toast) {
        window.EnemyHydrator.toast('loot-tables sidecar failed to load', 'err');
      }
    }
    document.addEventListener('enemy-hydrator:select', onSelect);
    document.addEventListener('enemy-hydrator:revert', onRevert);
    if (window.EnemyHydrator && window.EnemyHydrator.currentRow) {
      var r = window.EnemyHydrator.currentRow();
      if (r && r.id) _currentId = r.id;
    }
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public debug surface ──────────────────────────────────
  // Purely observational. No setters. Exposed for the smoke harness
  // + devtool inspection + future tooling that wants EV numbers.
  window.EnemyHydratorLoot = {
    SLOT_KEYS:               SLOT_KEYS.slice(),
    VALUE_WEIGHTS:           VALUE_WEIGHTS,
    SLOT_COLORS:             SLOT_COLORS,
    volForRange:             volForRange,
    volForChance:            volForChance,
    computeSlot:             computeSlot,
    meanWeights:             meanWeights,
    normalizeWeights:        normalizeWeights,
    buildView:               buildView,
    estimateDropsOverRounds: estimateDropsOverRounds,
    getCurrentView:          function () { return _view; },
    getCurrentId:            function () { return _currentId; }
  };
})();
