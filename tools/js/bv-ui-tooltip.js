// ═══════════════════════════════════════════════════════════════
//  bv-ui-tooltip.js — Custom styled UI tooltip
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Styled hover popover for any element with a `title` attribute.
//  Strips native title → data-tt so the browser's OS-default
//  tooltip doesn't also fire, then shows a dark-themed popover
//  near the cursor. Uses event delegation so buttons added
//  dynamically (metadata panel, windows panel, tile picker) also
//  get styled tooltips.
//
//  Self-contained IIFE — no cross-module dependencies.
//  Skips elements with id='cv' (canvas has its own #tooltip).
// ═══════════════════════════════════════════════════════════════
'use strict';

(function() {
  var tip = document.createElement('div');
  tip.id = 'ui-tooltip';
  document.body.appendChild(tip);

  var currentEl = null;

  function readTitle(el) {
    if (el.hasAttribute('title')) {
      var t = el.getAttribute('title');
      if (t) {
        el.setAttribute('data-tt', t);
        el.removeAttribute('title');
      }
    }
    return el.getAttribute('data-tt') || '';
  }

  function highlightKeys(text) {
    var esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/\(([A-Za-z0-9+\/\s\-]+)\)/g, '(<span class="tt-key">$1</span>)');
  }

  function showFor(el, clientX, clientY) {
    var text = readTitle(el);
    if (!text) { hide(); return; }
    currentEl = el;
    tip.innerHTML = highlightKeys(text);
    tip.style.display = 'block';
    var pad = 12;
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;
    var x = clientX + pad;
    var y = clientY + pad;
    if (x + w > window.innerWidth - 4) x = clientX - w - pad;
    if (y + h > window.innerHeight - 4) y = clientY - h - pad;
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function hide() {
    tip.style.display = 'none';
    currentEl = null;
  }

  function findTipTarget(el) {
    while (el && el !== document.body) {
      if (el.hasAttribute && (el.hasAttribute('data-tt') || el.hasAttribute('title'))) {
        return el;
      }
      el = el.parentNode;
    }
    return null;
  }

  document.addEventListener('mouseover', function(e) {
    var t = findTipTarget(e.target);
    if (!t) { hide(); return; }
    if (t.id === 'cv') { hide(); return; }
    if (t !== currentEl) showFor(t, e.clientX, e.clientY);
  });

  document.addEventListener('mousemove', function(e) {
    if (!currentEl) return;
    var pad = 12;
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;
    var x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth - 4) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 4) y = e.clientY - h - pad;
    if (x < 4) x = 4; if (y < 4) y = 4;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  });

  document.addEventListener('mouseout', function(e) {
    if (!e.relatedTarget || e.relatedTarget === document.body) hide();
  });

  document.addEventListener('mousedown', hide, true);
  document.addEventListener('keydown', hide, true);
  window.addEventListener('blur', hide);
})();
