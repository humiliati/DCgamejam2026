/**
 * CardRenderer — DOM-based card & item rendering for all LOD contexts.
 *
 * Ported from EyesOnly's SharedCardRenderer + hand-fan-component.css.
 * All rendering is DOM-based (not canvas). Cards are HTML elements with
 * CSS classes controlling resource tint, lifecycle opacity, quality borders,
 * and state transitions (hover, selected, ghost, unaffordable, BLVCK).
 *
 * LOD contexts:
 *   FULL     — Hand fan cards (combat/explore): 120×168px scaled by mode
 *   MEDIUM   — Menu/inventory slots: 80×112px, emoji + name + suit pip
 *   SMALL    — Bag/stash grid: 48×48px square, emoji + abbreviated name
 *   GHOST    — Drag ghost: cloneNode(true) of source card, fixed position
 *
 * Resource color system (from EyesOnly RESOURCE_COLOR_SYSTEM):
 *   energy=#00D4FF, battery=#00FFA6, hp=#FF6B9D, currency=#FFFF00,
 *   xp=#C88FFF, fatigue=#A0522D, focus=#FFF9B0, ammo=#DA70D6
 *
 * Layer 1 — depends on: nothing (pure DOM/CSS)
 */
var CardRenderer = (function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────
  var LIFECYCLE_MAP = {
    'disposable': 'consumable',
    'LIFE_001': 'consumable',
    'exhaust': 'exhaust',
    'LIFE_002': 'exhaust',
    'power': 'power',
    'LIFE_003': 'power',
    'gated': 'gated',
    'LIFE_004': 'gated',
    'persistent': 'core',
    'LIFE_005': 'core',
    'core': 'core'
  };

  var QUALITY_COLORS = {
    'cracked': '#666',
    'worn': '#999',
    'standard': '#fff',
    'fine': '#4fc3f7',
    'superior': '#ffeb3b',
    'elite': '#ff9800',
    'masterwork': '#ffd700',
    'near_perfect': '#8bc34a',
    'perfect': '#9c27b0'
  };

  // Sprint 0: SUIT_DATA and RES_COLORS are now owned by CardAuthority.
  // CardRenderer delegates to CardAuthority when available, keeping local
  // copies only as a safety fallback (e.g. if script load order is off).
  var _LOCAL_SUIT_DATA = {
    spade:   { sym: '\u2660', color: 'rgba(180,170,150,0.85)', res: 'free'    },
    club:    { sym: '\u2663', color: '#00D4FF',                 res: 'energy'  },
    diamond: { sym: '\u2666', color: '#00FFA6',                 res: 'battery' },
    heart:   { sym: '\u2665', color: '#FF6B9D',                 res: 'hp'      }
  };
  var _LOCAL_RES_COLORS = {
    energy:   { r: 0,   g: 212, b: 255 },
    battery:  { r: 0,   g: 255, b: 166 },
    hp:       { r: 255, g: 107, b: 157 },
    currency: { r: 255, g: 255, b: 0   },
    xp:       { r: 200, g: 143, b: 255 },
    fatigue:  { r: 160, g: 82,  b: 45  },
    focus:    { r: 255, g: 249, b: 176 },
    ammo:     { r: 218, g: 112, b: 214 },
    key_ammo: { r: 255, g: 138, b: 61  },
    cards:    { r: 128, g: 0,   b: 128 },
    free:     { r: 180, g: 170, b: 150 }
  };
  var SUIT_DATA  = (typeof CardAuthority !== 'undefined' && CardAuthority.SUIT_DATA)
    ? CardAuthority.SUIT_DATA : _LOCAL_SUIT_DATA;
  var RES_COLORS = (typeof CardAuthority !== 'undefined' && CardAuthority.RES_COLORS)
    ? CardAuthority.RES_COLORS : _LOCAL_RES_COLORS;

  // ── CSS injection flag ────────────────────────────────────────────
  var _stylesInjected = false;

  /**
   * Inject the CardRenderer stylesheet into the document head.
   * Called once on first use.
   */
  function _injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;

    var style = document.createElement('style');
    style.id = 'card-renderer-styles';
    style.textContent = [
      // ═══════════════════════════════════════════════════════════════
      //  FULL CARD (.cr-card) — Hand fan cards
      // ═══════════════════════════════════════════════════════════════
      '.cr-card {',
      '  position: relative;',
      '  border-radius: 8px;',
      '  overflow: hidden;',
      '  transition: border-color 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease, opacity 0.2s ease;',
      '  user-select: none;',
      '  touch-action: none;',
      '  display: flex;',
      '  flex-direction: column;',
      '  will-change: transform;',
      '  font-family: "Courier New", monospace;',
      '  --res-r: 128; --res-g: 128; --res-b: 128;',
      '  box-shadow: 0 0 2px rgba(128,0,128,0.35), 0 0 4px rgba(128,0,128,0.2);',
      '}',

      // Resource color CSS custom properties
      '.cr-card[data-resource="energy"]   { --res-r: 0;   --res-g: 212; --res-b: 255; }',
      '.cr-card[data-resource="ammo"]     { --res-r: 218; --res-g: 112; --res-b: 214; }',
      '.cr-card[data-resource="battery"]  { --res-r: 0;   --res-g: 255; --res-b: 166; }',
      '.cr-card[data-resource="fatigue"]  { --res-r: 160; --res-g: 82;  --res-b: 45; }',
      '.cr-card[data-resource="focus"]    { --res-r: 255; --res-g: 249; --res-b: 176; }',
      '.cr-card[data-resource="hp"]       { --res-r: 255; --res-g: 107; --res-b: 157; }',
      '.cr-card[data-resource="currency"] { --res-r: 255; --res-g: 255; --res-b: 0; }',
      '.cr-card[data-resource="key_ammo"] { --res-r: 255; --res-g: 138; --res-b: 61; }',
      '.cr-card[data-resource="cards"]    { --res-r: 128; --res-g: 0;   --res-b: 128; }',

      // Lifecycle: one-time use (~30% opacity)
      '.cr-card.cr-consumable {',
      '  background: linear-gradient(135deg, rgba(var(--res-r),var(--res-g),var(--res-b),0.20) 0%, rgba(var(--res-r),var(--res-g),var(--res-b),0.30) 100%);',
      '  backdrop-filter: blur(3px);',
      '  border: 2px solid rgba(var(--res-r),var(--res-g),var(--res-b),0.25);',
      '}',
      '.cr-card.cr-exhaust {',
      '  background: linear-gradient(135deg, rgba(var(--res-r),var(--res-g),var(--res-b),0.22) 0%, rgba(var(--res-r),var(--res-g),var(--res-b),0.30) 100%);',
      '  backdrop-filter: blur(3px);',
      '  border: 2px solid rgba(var(--res-r),var(--res-g),var(--res-b),0.28);',
      '}',

      // Lifecycle: reusable (~50% opacity)
      '.cr-card.cr-power {',
      '  background: linear-gradient(135deg, rgba(var(--res-r),var(--res-g),var(--res-b),0.40) 0%, rgba(var(--res-r),var(--res-g),var(--res-b),0.50) 100%);',
      '  backdrop-filter: blur(5px);',
      '  border: 2px solid rgba(var(--res-r),var(--res-g),var(--res-b),0.40);',
      '}',
      '.cr-card.cr-gated {',
      '  background: linear-gradient(135deg, rgba(var(--res-r),var(--res-g),var(--res-b),0.38) 0%, rgba(var(--res-r),var(--res-g),var(--res-b),0.48) 100%);',
      '  backdrop-filter: blur(5px);',
      '  border: 2px solid rgba(var(--res-r),var(--res-g),var(--res-b),0.38);',
      '}',
      '.cr-card.cr-core {',
      '  background: linear-gradient(135deg, rgba(var(--res-r),var(--res-g),var(--res-b),0.42) 0%, rgba(var(--res-r),var(--res-g),var(--res-b),0.52) 100%);',
      '  backdrop-filter: blur(6px);',
      '  border: 2px solid rgba(var(--res-r),var(--res-g),var(--res-b),0.45);',
      '}',

      // BLVCK identity
      '.cr-card.cr-blvck {',
      '  background: linear-gradient(135deg, rgba(0,0,0,0.82) 0%, rgba(15,15,15,0.72) 50%, rgba(0,0,0,0.88) 100%);',
      '  border: 1px solid rgba(80,80,80,0.30);',
      '  box-shadow: 0 0 3px rgba(0,0,0,0.6), 0 0 6px rgba(0,0,0,0.3);',
      '  backdrop-filter: blur(3px);',
      '}',
      '.cr-card.cr-blvck .cr-emoji { opacity: 0.35; filter: grayscale(1) brightness(0.6); }',
      '.cr-card.cr-blvck .cr-name { font-family: "Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.45; }',
      '.cr-card.cr-blvck .cr-cost { opacity: 0.25; }',

      // Unaffordable (BLVCK-frame treatment)
      '.cr-card.cr-unaffordable {',
      '  background: linear-gradient(135deg, rgba(5,5,5,0.78) 0%, rgba(20,20,20,0.68) 50%, rgba(5,5,5,0.82) 100%);',
      '  border: 1px solid rgba(80,80,80,0.30);',
      '  box-shadow: 0 0 3px rgba(0,0,0,0.6), 0 0 6px rgba(0,0,0,0.3);',
      '  backdrop-filter: blur(3px);',
      '}',
      '.cr-card.cr-unaffordable .cr-emoji { opacity: 0.40; filter: grayscale(0.8) brightness(0.65); }',
      '.cr-card.cr-unaffordable .cr-name { opacity: 0.50; color: rgba(140,140,140,0.7); }',
      '.cr-card.cr-unaffordable .cr-cost { opacity: 0.60; color: #DA70D6; }',

      // Quality borders
      '.cr-card[data-quality="cracked"]      { border-color: #666 !important; box-shadow: 0 0 4px rgba(128,0,128,0.1); }',
      '.cr-card[data-quality="worn"]         { border-color: #999 !important; box-shadow: 0 0 5px rgba(128,0,128,0.15); }',
      '.cr-card[data-quality="standard"]     { border-color: #fff !important; box-shadow: 0 0 6px rgba(128,0,128,0.2); }',
      '.cr-card[data-quality="fine"]         { border-color: #4fc3f7 !important; box-shadow: 0 0 8px rgba(79,195,247,0.3), 0 0 16px rgba(128,0,128,0.2); }',
      '.cr-card[data-quality="superior"]     { border-color: #ffeb3b !important; box-shadow: 0 0 8px rgba(255,235,59,0.3), 0 0 18px rgba(128,0,128,0.25); }',
      '.cr-card[data-quality="elite"]        { border-color: #ff9800 !important; box-shadow: 0 0 10px rgba(255,152,0,0.35), 0 0 20px rgba(128,0,128,0.3); }',
      '.cr-card[data-quality="masterwork"]   { border-color: #ffd700 !important; box-shadow: 0 0 12px rgba(255,215,0,0.4), 0 0 24px rgba(128,0,128,0.35); }',
      '.cr-card[data-quality="near_perfect"] { border-color: #8bc34a !important; box-shadow: 0 0 14px rgba(139,195,74,0.4), 0 0 28px rgba(128,0,128,0.4); }',
      '.cr-card[data-quality="perfect"]      { border-color: #9c27b0 !important; box-shadow: 0 0 16px rgba(156,39,176,0.5), 0 0 32px rgba(128,0,128,0.5); }',

      // Card states
      '.cr-card.cr-hover { box-shadow: 0 4px 20px rgba(28,255,155,0.5); }',
      '.cr-card.cr-selected {',
      '  border-color: rgba(28,255,155,0.75) !important;',
      '  box-shadow: 0 0 0 1px rgba(28,255,155,0.25) inset, 0 0 18px rgba(28,255,155,0.35), 0 0 4px rgba(128,0,128,0.55), 0 0 8px rgba(128,0,128,0.3) !important;',
      '}',
      '.cr-card.cr-stacked {',
      '  border-color: #f0d070 !important;',
      '  box-shadow: 0 0 8px rgba(240,208,112,0.35), 0 0 4px rgba(128,0,128,0.3) !important;',
      '}',

      // Synergy glow
      '.cr-card.cr-synergy-glow {',
      '  animation: cr-synergy-pulse 2s ease-in-out infinite;',
      '}',
      '@keyframes cr-synergy-pulse {',
      '  0%, 100% { box-shadow: 0 0 5px rgba(128,0,128,0.5), 0 0 8px rgba(var(--synergy-r,128),var(--synergy-g,0),var(--synergy-b,128),0.25); }',
      '  50% { box-shadow: 0 0 6px rgba(var(--synergy-r,128),var(--synergy-g,0),var(--synergy-b,128),0.5), 0 0 10px rgba(128,0,128,0.4); }',
      '}',

      // Coin border (outer brass rim — for FULL cards)
      '.cr-coin-outer {',
      '  width: 100%; height: 100%; border-radius: 8px; padding: 3px;',
      '  background: linear-gradient(135deg, rgba(180,160,100,0.6) 0%, rgba(220,200,140,0.4) 50%, rgba(140,120,70,0.5) 100%);',
      '  box-shadow: inset 0 1px 0 rgba(220,200,140,0.3), inset 0 -1px 0 rgba(0,0,0,0.5), 0 4px 20px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.4);',
      '}',
      '.cr-coin-inner {',
      '  width: 100%; height: 100%; border-radius: 6px; position: relative; overflow: hidden;',
      '  box-shadow: inset 0 2px 4px rgba(0,0,0,0.9), inset 0 -1px 3px rgba(0,0,0,0.7), inset 2px 0 3px rgba(0,0,0,0.5), inset -2px 0 3px rgba(0,0,0,0.5);',
      '}',
      // Metallic sheen sweep
      '.cr-coin-inner::before {',
      '  content: ""; position: absolute; inset: 0; border-radius: 6px;',
      '  background: linear-gradient(115deg, transparent 0%, transparent 38%, rgba(220,200,140,0.03) 44%, rgba(220,200,140,0.06) 50%, rgba(220,200,140,0.03) 56%, transparent 62%, transparent 100%);',
      '  background-size: 200% 100%; animation: cr-sheen 6s ease-in-out infinite; z-index: 50; pointer-events: none;',
      '}',
      '@keyframes cr-sheen { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }',

      // Paper texture overlay (CSS pseudo-element noise)
      '.cr-coin-inner::after {',
      '  content: ""; position: absolute; inset: 0; border-radius: 6px;',
      '  background: repeating-conic-gradient(rgba(128,128,128,0.015) 0% 25%, transparent 0% 50%) 0 0 / 4px 4px;',
      '  z-index: 1; pointer-events: none; mix-blend-mode: overlay; opacity: 0.6;',
      '}',

      // Card content elements (FULL)
      '.cr-cost {',
      '  position: absolute; top: 4px; left: 4px; width: 24px; height: 24px;',
      '  background: rgba(0,0,0,0.85); border: 2px solid rgba(var(--res-r),var(--res-g),var(--res-b),0.7);',
      '  border-radius: 50%; display: flex; align-items: center; justify-content: center;',
      '  font-size: 14px; font-weight: bold; color: rgb(var(--res-r),var(--res-g),var(--res-b));',
      '  z-index: 10;',
      '}',
      '.cr-artwork {',
      '  flex: 1; display: flex; align-items: center; justify-content: center;',
      '  background: rgba(0,0,0,0.2); padding: 10px; position: relative;',
      '}',
      // Type-based artwork glow
      '.cr-card[data-card-type="attack"] .cr-artwork { background: radial-gradient(ellipse at center, rgba(255,68,68,0.25) 0%, rgba(0,0,0,0.2) 70%); }',
      '.cr-card[data-card-type="defense"] .cr-artwork { background: radial-gradient(ellipse at center, rgba(68,68,255,0.25) 0%, rgba(0,0,0,0.2) 70%); }',
      '.cr-card[data-card-type="utility"] .cr-artwork { background: radial-gradient(ellipse at center, rgba(255,170,0,0.25) 0%, rgba(0,0,0,0.2) 70%); }',
      '.cr-card[data-card-type="heal"] .cr-artwork { background: radial-gradient(ellipse at center, rgba(0,255,166,0.25) 0%, rgba(0,0,0,0.2) 70%); }',
      '.cr-emoji { font-size: 30px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); z-index: 2; }',
      '.cr-name {',
      '  background: rgba(0,0,0,0.8); color: #f0d070; font-size: 11px; font-weight: bold;',
      '  text-align: center; padding: 5px 4px; text-transform: uppercase; letter-spacing: 0.5px;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; z-index: 2;',
      '}',

      // Suit symbols (TL + BR rotated 180deg)
      '.cr-suit-tl {',
      '  position: absolute; top: 4px; left: 4px; font-size: 14px; font-weight: bold;',
      '  z-index: 10; text-shadow: 0 1px 2px rgba(0,0,0,0.7);',
      '}',
      '.cr-suit-br {',
      '  position: absolute; bottom: 4px; right: 4px; font-size: 14px; font-weight: bold;',
      '  z-index: 10; transform: rotate(180deg); text-shadow: 0 1px 2px rgba(0,0,0,0.7);',
      '}',
      // Move TL suit down when cost badge present
      '.cr-card.cr-has-cost .cr-suit-tl { top: 32px; }',

      // Stack badge
      '.cr-stack-badge {',
      '  position: absolute; top: 4px; right: 4px; width: 20px; height: 20px;',
      '  background: rgba(240,208,112,0.9); border-radius: 4px; display: flex;',
      '  align-items: center; justify-content: center; font-size: 12px; font-weight: bold;',
      '  color: #1a1520; z-index: 10;',
      '}',

      // ═══════════════════════════════════════════════════════════════
      //  MEDIUM CARD (.cr-med) — Menu/inventory slots
      // ═══════════════════════════════════════════════════════════════
      '.cr-med {',
      '  position: relative; border-radius: 6px; overflow: hidden;',
      '  display: flex; flex-direction: column; align-items: center; justify-content: center;',
      '  gap: 1px; padding: 4px 3px 3px;',
      '  border: 1px solid rgba(var(--res-r),var(--res-g),var(--res-b),0.3);',
      '  background: linear-gradient(135deg, rgba(var(--res-r),var(--res-g),var(--res-b),0.08) 0%, rgba(0,0,0,0.35) 100%);',
      '  transition: border-color 0.2s, background 0.2s;',
      '  user-select: none; cursor: pointer; font-family: "Courier New", monospace;',
      '  --res-r: 128; --res-g: 128; --res-b: 128;',
      '}',
      '.cr-med[data-resource="energy"]   { --res-r: 0;   --res-g: 212; --res-b: 255; }',
      '.cr-med[data-resource="battery"]  { --res-r: 0;   --res-g: 255; --res-b: 166; }',
      '.cr-med[data-resource="hp"]       { --res-r: 255; --res-g: 107; --res-b: 157; }',
      '.cr-med[data-resource="currency"] { --res-r: 255; --res-g: 255; --res-b: 0; }',
      '.cr-med[data-resource="ammo"]     { --res-r: 218; --res-g: 112; --res-b: 214; }',
      '.cr-med[data-resource="cards"]    { --res-r: 128; --res-g: 0;   --res-b: 128; }',

      '.cr-med:hover { border-color: rgba(var(--res-r),var(--res-g),var(--res-b),0.6); background: rgba(var(--res-r),var(--res-g),var(--res-b),0.12); }',
      '.cr-med .cr-med-emoji { font-size: 1.8em; line-height: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }',
      '.cr-med .cr-med-name { font-size: 0.55em; color: #f0d070; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }',
      '.cr-med .cr-med-suit { position: absolute; top: 2px; left: 3px; font-size: 0.7em; font-weight: bold; }',
      '.cr-med .cr-med-cost { position: absolute; top: 2px; right: 3px; font-size: 0.55em; font-weight: bold; color: rgb(var(--res-r),var(--res-g),var(--res-b)); }',

      // Item variant (no resource tint — green accent)
      '.cr-med.cr-med-item { border-color: rgba(255,255,255,0.15); background: rgba(0,0,0,0.35); }',
      '.cr-med.cr-med-item:hover { border-color: rgba(51,255,136,0.6); background: rgba(51,255,136,0.08); }',
      '.cr-med.cr-med-item .cr-med-name { color: #d8d0c0; }',

      // ═══════════════════════════════════════════════════════════════
      //  SMALL CARD (.cr-sm) — Bag/stash grid
      // ═══════════════════════════════════════════════════════════════
      '.cr-sm {',
      '  position: relative; border-radius: 4px; overflow: hidden;',
      '  display: flex; flex-direction: column; align-items: center; justify-content: center;',
      '  gap: 0; padding: 2px;',
      '  border: 1px solid rgba(255,255,255,0.12);',
      '  background: rgba(0,0,0,0.35);',
      '  transition: border-color 0.2s, background 0.2s;',
      '  user-select: none; cursor: pointer; font-family: "Courier New", monospace;',
      '}',
      '.cr-sm:hover { border-color: rgba(51,255,136,0.6); background: rgba(51,255,136,0.08); }',
      '.cr-sm .cr-sm-emoji { font-size: 1.4em; line-height: 1; }',
      '.cr-sm .cr-sm-name { font-size: 0.4em; color: #d8d0c0; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }',

      // Card-in-bag purple glow
      '.cr-sm.cr-sm-card { border-color: rgba(180,100,255,0.3); background: rgba(128,0,255,0.06); }',
      '.cr-sm.cr-sm-card:hover { border-color: rgba(180,100,255,0.6); background: rgba(128,0,255,0.12); }',

      // ═══════════════════════════════════════════════════════════════
      //  EMPTY SLOT (.cr-empty)
      // ═══════════════════════════════════════════════════════════════
      '.cr-empty {',
      '  border: 1px dashed rgba(255,255,255,0.08); border-radius: 4px;',
      '  background: rgba(0,0,0,0.15);',
      '}',

      // ═══════════════════════════════════════════════════════════════
      //  GHOST (.cr-ghost) — Drag overlay
      // ═══════════════════════════════════════════════════════════════
      '.cr-ghost {',
      '  position: fixed; z-index: 10000; pointer-events: none;',
      '  transform: scale(0.90); opacity: 0.92;',
      '  box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 2px 8px rgba(128,0,128,0.3);',
      '  border-radius: 8px;',
      '}',

      // ═══════════════════════════════════════════════════════════════
      //  DRAG PLACEHOLDER (.cr-placeholder)
      // ═══════════════════════════════════════════════════════════════
      '.cr-placeholder {',
      '  border: 2px dashed rgba(128,0,128,0.5); border-radius: 8px;',
      '  background: rgba(128,0,128,0.06); pointer-events: none;',
      '}',

      // ═══════════════════════════════════════════════════════════════
      //  FAN WRAPPER (.cr-fan-wrapper)
      // ═══════════════════════════════════════════════════════════════
      '.cr-fan-wrapper {',
      '  position: relative;',
      '  transition: transform 0.2s ease;',
      '  cursor: pointer;',
      '  transform: translateY(var(--fan-ty, 0px)) rotate(var(--fan-rot, 0deg));',
      '}',
      '.cr-fan-wrapper:hover {',
      '  transform: translateY(calc(var(--fan-ty, 0px) - 20px)) rotate(var(--fan-rot, 0deg)) scale(1.05);',
      '  z-index: 200;',
      '}'
    ].join('\n');

    document.head.appendChild(style);
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function _getLifecycle(card) {
    var lc = (card && (card.lifecycleType || card.lifecycle || card.consumable)) || 'core';
    return LIFECYCLE_MAP[lc] || 'core';
  }

  function _getResColor(card) {
    // Delegate to CardAuthority when available (Sprint 0 canonical source)
    if (typeof CardAuthority !== 'undefined' && CardAuthority.getResColor) {
      return CardAuthority.getResColor(card);
    }
    var res = card.resource || card.costResource || null;
    if (res && RES_COLORS[res]) return RES_COLORS[res];
    var sd = card.suit ? SUIT_DATA[card.suit] : null;
    if (sd && RES_COLORS[sd.res]) return RES_COLORS[sd.res];
    return RES_COLORS.cards;
  }

  function _abbreviate(name, maxLen) {
    if (!name) return '';
    if (!maxLen || name.length <= maxLen) return name;
    return name.substring(0, maxLen - 1) + '\u2026';
  }

  // ═════════════════════════════════════════════════════════════════
  //  LOD: FULL — Create a full-detail card DOM element
  // ═════════════════════════════════════════════════════════════════

  /**
   * Create a full-detail card element for the hand fan.
   *
   * @param {Object} card - Card data object
   * @param {number} index - Hand index (for data attribute)
   * @param {Object} [opts] - Options
   * @param {number} [opts.width=120] - Card width in px
   * @param {number} [opts.height=168] - Card height in px
   * @returns {HTMLElement} .cr-fan-wrapper element containing .cr-card
   */
  function createFullCard(card, index, opts) {
    _injectStyles();
    card = card || {};
    opts = opts || {};
    var w = opts.width || 120;
    var h = opts.height || 168;

    var wrapper = document.createElement('div');
    wrapper.className = 'cr-fan-wrapper';
    wrapper.dataset.cardIndex = index;

    var cardEl = document.createElement('div');
    cardEl.className = 'cr-card';
    cardEl.style.width = w + 'px';
    cardEl.style.height = h + 'px';

    // BLVCK identity
    var isBlvck = card.id === 'ACT-000' || card.name === 'BLVCK';
    if (isBlvck) {
      cardEl.classList.add('cr-blvck');
    }

    // Lifecycle
    var lifecycle = _getLifecycle(card);
    cardEl.classList.add('cr-' + lifecycle);

    // Quality
    if (card.quality || card.qualityName) {
      var quality = (card.quality || card.qualityName).toLowerCase().replace(/ /g, '_');
      cardEl.dataset.quality = quality;
    }

    // Resource color
    var costRes = card.resource || card.costResource || card.spendResource || '';
    if (costRes) {
      cardEl.dataset.resource = costRes.toLowerCase();
    } else if (card.suit && SUIT_DATA[card.suit]) {
      cardEl.dataset.resource = SUIT_DATA[card.suit].res;
    }

    // Card type
    var cardType = card.type || card.cardType || '';
    if (cardType) {
      cardEl.dataset.cardType = cardType.toLowerCase();
    }

    // Build inner HTML using coin-border anatomy
    var html = '<div class="cr-coin-outer"><div class="cr-coin-inner">';

    // Cost badge — cost may be number OR { type, value } object
    var _costVal = card.cost;
    if (typeof _costVal === 'object' && _costVal !== null && _costVal.value !== undefined) {
      _costVal = _costVal.value;
    }
    if (_costVal !== undefined && _costVal !== null) {
      html += '<div class="cr-cost">' + _costVal + '</div>';
      cardEl.classList.add('cr-has-cost');
    }

    // Suit symbols (TL + BR)
    var sd = card.suit ? SUIT_DATA[card.suit] : null;
    if (sd) {
      html += '<span class="cr-suit-tl" style="color:' + sd.color + '">' + sd.sym + '</span>';
      html += '<span class="cr-suit-br" style="color:' + sd.color + '">' + sd.sym + '</span>';
    }

    // Artwork
    html += '<div class="cr-artwork"><div class="cr-emoji">' + (card.emoji || '\uD83C\uDCCF') + '</div></div>';

    // Name
    var cardName = card.name || 'Unknown';
    html += '<div class="cr-name">' + _abbreviate(cardName, 14) + '</div>';

    html += '</div></div>'; // close cr-coin-inner, cr-coin-outer

    cardEl.innerHTML = html;
    wrapper.appendChild(cardEl);
    return wrapper;
  }

  // ═════════════════════════════════════════════════════════════════
  //  LOD: MEDIUM — Menu/inventory slot element
  // ═════════════════════════════════════════════════════════════════

  /**
   * Create a medium-detail card/item element for menu slots.
   *
   * @param {Object} item - Card or item data
   * @param {Object} [opts] - Options
   * @param {number} [opts.width=80] - Slot width in px
   * @param {number} [opts.height=112] - Slot height in px
   * @param {boolean} [opts.isCard=true] - True for cards, false for items
   * @returns {HTMLElement} .cr-med element
   */
  function createMediumCard(item, opts) {
    _injectStyles();
    item = item || {};
    opts = opts || {};
    var w = opts.width || 80;
    var h = opts.height || 112;
    var isCard = opts.isCard !== false;

    var el = document.createElement('div');
    el.className = 'cr-med' + (isCard ? '' : ' cr-med-item');
    el.style.width = w + 'px';
    el.style.height = h + 'px';

    // Resource color (cards only)
    if (isCard) {
      var costRes = item.resource || item.costResource || item.spendResource || '';
      if (costRes) {
        el.dataset.resource = costRes.toLowerCase();
      } else if (item.suit && SUIT_DATA[item.suit]) {
        el.dataset.resource = SUIT_DATA[item.suit].res;
      }
    }

    var html = '';

    // Suit pip (cards)
    if (isCard && item.suit && SUIT_DATA[item.suit]) {
      var sd = SUIT_DATA[item.suit];
      html += '<span class="cr-med-suit" style="color:' + sd.color + '">' + sd.sym + '</span>';
    }

    // Cost (cards)
    if (isCard && item.cost !== undefined && item.cost !== null) {
      html += '<span class="cr-med-cost">' + item.cost + '</span>';
    }

    // Emoji
    html += '<span class="cr-med-emoji">' + (item.emoji || '?') + '</span>';

    // Name
    var name = item.name || '';
    html += '<span class="cr-med-name">' + _abbreviate(name, 10) + '</span>';

    el.innerHTML = html;
    return el;
  }

  // ═════════════════════════════════════════════════════════════════
  //  LOD: SMALL — Bag/stash grid element
  // ═════════════════════════════════════════════════════════════════

  /**
   * Create a small-detail item element for bag/stash grids.
   *
   * @param {Object} item - Item/card data
   * @param {Object} [opts] - Options
   * @param {number} [opts.size=48] - Square slot size in px
   * @param {boolean} [opts.isCard=false] - Purple glow for cards in bag
   * @returns {HTMLElement} .cr-sm element
   */
  function createSmallCard(item, opts) {
    _injectStyles();
    item = item || {};
    opts = opts || {};
    var size = opts.size || 48;
    var isCard = !!opts.isCard;

    var el = document.createElement('div');
    el.className = 'cr-sm' + (isCard ? ' cr-sm-card' : '');
    el.style.width = size + 'px';
    el.style.height = size + 'px';

    var html = '';
    html += '<span class="cr-sm-emoji">' + (item.emoji || '?') + '</span>';
    var name = item.name || '';
    html += '<span class="cr-sm-name">' + _abbreviate(name, 7) + '</span>';

    el.innerHTML = html;
    return el;
  }

  // ═════════════════════════════════════════════════════════════════
  //  EMPTY SLOT
  // ═════════════════════════════════════════════════════════════════

  /**
   * Create an empty slot placeholder element.
   *
   * @param {number} w - Width in px
   * @param {number} h - Height in px
   * @returns {HTMLElement} .cr-empty element
   */
  function createEmptySlot(w, h) {
    _injectStyles();
    var el = document.createElement('div');
    el.className = 'cr-empty';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    return el;
  }

  // ═════════════════════════════════════════════════════════════════
  //  GHOST — Clone source element as drag ghost
  // ═════════════════════════════════════════════════════════════════

  /**
   * Create a ghost element by cloning a source card element.
   * Matches EyesOnly CardDragController._createGhost pattern.
   *
   * @param {HTMLElement} sourceEl - The card element to clone
   * @returns {HTMLElement} Ghost element (not yet appended to DOM)
   */
  function createGhost(sourceEl) {
    _injectStyles();
    var ghost = sourceEl.cloneNode(true);
    var rect = sourceEl.getBoundingClientRect();
    ghost.classList.add('cr-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    // Reset fan transform
    ghost.style.setProperty('--fan-ty', '0px');
    ghost.style.setProperty('--fan-rot', '0deg');
    ghost.style.transform = 'scale(0.90)';
    return ghost;
  }

  /**
   * Create a lightweight ghost from card data (when no source element exists).
   * Used for cross-zone drags initiated from canvas-rendered contexts.
   *
   * @param {Object} card - Card/item data
   * @returns {HTMLElement} Ghost element
   */
  function createGhostFromData(card) {
    _injectStyles();
    card = card || {};
    var rc = _getResColor(card);
    var sd = card.suit ? SUIT_DATA[card.suit] : null;
    var sym = sd ? sd.sym : '';
    var emoji = card.emoji || '\uD83C\uDCCF';
    var name = card.name || card.id || '???';

    var el = document.createElement('div');
    el.className = 'cr-ghost';
    el.style.cssText =
      'position:fixed;z-index:10000;pointer-events:none;' +
      'padding:8px 12px;border-radius:8px;' +
      'font:bold 13px "Courier New",monospace;color:#f0d070;' +
      'white-space:nowrap;' +
      'transform:scale(0.90);opacity:0.92;' +
      'background:linear-gradient(135deg,' +
        'rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.15) 0%,' +
        'rgba(20,18,28,0.94) 100%);' +
      'border:2px solid rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.5);' +
      'box-shadow:' +
        '0 8px 24px rgba(0,0,0,0.5),' +
        '0 2px 8px rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.25),' +
        '0 0 12px rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.15);';

    el.innerHTML =
      '<span style="font-size:18px;vertical-align:middle;margin-right:4px">' + emoji + '</span>' +
      '<span style="color:rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.8);margin-right:3px">' + sym + '</span>' +
      '<span>' + name + '</span>';

    return el;
  }

  // ═════════════════════════════════════════════════════════════════
  //  PLACEHOLDER — Drag placeholder
  // ═════════════════════════════════════════════════════════════════

  /**
   * Create a drag placeholder matching the source card's dimensions.
   *
   * @param {number} w - Width in px
   * @param {number} h - Height in px
   * @returns {HTMLElement} .cr-placeholder element
   */
  function createPlaceholder(w, h) {
    _injectStyles();
    var el = document.createElement('div');
    el.className = 'cr-placeholder';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    return el;
  }

  // ═════════════════════════════════════════════════════════════════
  //  FAN LAYOUT — Apply fan arc transform
  // ═════════════════════════════════════════════════════════════════

  /**
   * Apply fan transform to a card wrapper (EyesOnly applyFanTransform).
   *
   * @param {HTMLElement} wrapper - .cr-fan-wrapper element
   * @param {number} index - Card position
   * @param {number} total - Total cards in fan
   * @param {Object} [opts] - { maxRotation, maxVertical, overlapPct, baseWidth, flat }
   */
  function applyFanTransform(wrapper, index, total, opts) {
    opts = opts || {};
    var flat = !!opts.flat;
    var maxRotation = opts.maxRotation !== undefined ? opts.maxRotation : 8;
    var maxVertical = opts.maxVertical !== undefined ? opts.maxVertical : 15;
    var overlapPct = opts.overlapPct !== undefined ? opts.overlapPct : 30;
    var baseWidth = opts.baseWidth !== undefined ? opts.baseWidth : 120;

    if (flat || total <= 1) {
      var flatOverlap = baseWidth * (overlapPct / 100);
      wrapper.style.setProperty('--fan-ty', '0px');
      wrapper.style.setProperty('--fan-rot', '0deg');
      wrapper.style.transform = 'translateY(0) rotate(0deg)';
      wrapper.style.marginLeft = (index === 0 ? 0 : -flatOverlap) + 'px';
      wrapper.style.zIndex = String(index);
      return;
    }

    var centerIndex = (total - 1) / 2;
    var offset = index - centerIndex;
    var rotation = centerIndex > 0 ? offset * (maxRotation / centerIndex) : 0;
    var verticalOffset = centerIndex > 0 ? Math.abs(offset) * (maxVertical / centerIndex) : 0;
    var overlapWidth = baseWidth * (overlapPct / 100);
    var zIndex = 100 - Math.abs(offset * 10);

    wrapper.style.setProperty('--fan-ty', String(verticalOffset) + 'px');
    wrapper.style.setProperty('--fan-rot', String(rotation) + 'deg');
    wrapper.style.transform = 'translateY(' + verticalOffset + 'px) rotate(' + rotation + 'deg)';
    wrapper.style.marginLeft = (index === 0 ? 0 : -overlapWidth) + 'px';
    wrapper.style.zIndex = String(zIndex);
  }

  // ═════════════════════════════════════════════════════════════════
  //  STATE MANAGEMENT — Add/remove card states
  // ═════════════════════════════════════════════════════════════════

  /**
   * Set a card element's visual state.
   * @param {HTMLElement} cardEl - .cr-card element (or wrapper containing it)
   * @param {string} state - 'hover'|'selected'|'stacked'|'unaffordable'|'synergy-glow'
   * @param {boolean} active - True to add, false to remove
   */
  function setCardState(cardEl, state, active) {
    // Find the .cr-card if we got the wrapper
    var el = cardEl.classList.contains('cr-card') ? cardEl : cardEl.querySelector('.cr-card');
    if (!el) return;
    var cls = 'cr-' + state;
    if (active) {
      el.classList.add(cls);
    } else {
      el.classList.remove(cls);
    }
  }

  /**
   * Set the stack badge number on a card.
   * @param {HTMLElement} cardEl - .cr-card element
   * @param {number|null} num - Stack position (1-based), or null to remove
   */
  function setStackBadge(cardEl, num) {
    var el = cardEl.classList.contains('cr-card') ? cardEl : cardEl.querySelector('.cr-card');
    if (!el) return;
    var existing = el.querySelector('.cr-stack-badge');
    if (num === null || num === undefined) {
      if (existing) existing.remove();
      return;
    }
    if (!existing) {
      existing = document.createElement('div');
      existing.className = 'cr-stack-badge';
      el.appendChild(existing);
    }
    existing.textContent = String(num);
  }

  // ── Public API ────────────────────────────────────────────────────
  return Object.freeze({
    // LOD factories
    createFullCard:   createFullCard,
    createMediumCard: createMediumCard,
    createSmallCard:  createSmallCard,
    createEmptySlot:  createEmptySlot,

    // Ghost & placeholder
    createGhost:          createGhost,
    createGhostFromData:  createGhostFromData,
    createPlaceholder:    createPlaceholder,

    // Fan layout
    applyFanTransform: applyFanTransform,

    // State management
    setCardState:   setCardState,
    setStackBadge:  setStackBadge,

    // Style injection (call early if needed)
    ensureStyles: _injectStyles,

    // Constants (delegates to CardAuthority when available)
    RES_COLORS:     RES_COLORS,
    SUIT_DATA:      SUIT_DATA,
    QUALITY_COLORS: QUALITY_COLORS,
    LIFECYCLE_MAP:  LIFECYCLE_MAP
  });
})();
