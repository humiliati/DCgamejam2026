/**
 * BoxAnim — modular 3D box open/close/envelop animation controller.
 *
 * Layer 2 (DOM-based overlay system, zero engine dependencies).
 * Manages CSS 3D box instances that can be created, opened, closed,
 * and triggered to "envelop" the screen with their interior glow.
 *
 * Four built-in variants share the same DOM structure but differ in
 * size, color palette, and hinge axis via CSS custom properties:
 *
 *   splash  — 120px blue, lid hinges bottom, splash reveal
 *   chest   — 80px gold/amber, lid hinges bottom, treasure pickup
 *   door    — 100×140 steel/grey, lid hinges left (swings open)
 *   button  — 50px green, lid hinges top, momentary press
 *
 * Usage:
 *   BoxAnim.open('splash-box');        // add .opened class
 *   BoxAnim.close('splash-box');       // remove .opened class
 *   BoxAnim.envelop('splash-box', cb); // glow fills screen, cb on done
 *   BoxAnim.create('chest', parentEl); // build a new chest box in DOM
 *   BoxAnim.destroy(id);               // remove DOM + cleanup
 */
var BoxAnim = (function () {
  'use strict';

  var _instances = {};  // id → { el, variant, state }
  var _counter = 0;

  // ── Template HTML for a box3d instance ────────────────────────────

  var TEMPLATE =
    '<div class="box3d-scene">' +
      '<div class="box3d-spin spinning">' +
        '<div class="box3d-glow"></div>' +
        '<div class="box3d-face bf-back"></div>' +
        '<div class="box3d-face bf-left"></div>' +
        '<div class="box3d-face bf-right"></div>' +
        '<div class="box3d-face bf-bottom"></div>' +
        '<div class="box3d-face bf-top"></div>' +
        '<div class="box3d-lid"><div class="box3d-face"></div></div>' +
      '</div>' +
    '</div>';

  // ── Register an existing DOM box (e.g. splash-box in index.html) ─

  function register(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var variant = 'splash';
    if (el.classList.contains('chest-variant'))  variant = 'chest';
    if (el.classList.contains('door-variant'))   variant = 'door';
    if (el.classList.contains('button-variant')) variant = 'button';
    _instances[id] = { el: el, variant: variant, state: 'closed' };
    return id;
  }

  // ── Create a new box in the DOM ───────────────────────────────────

  /**
   * @param {string} variant - 'splash', 'chest', 'door', 'button'
   * @param {HTMLElement} parentEl - Container to append into
   * @param {Object} [opts] - { spin: true, id: 'custom-id' }
   * @returns {string} Instance ID
   */
  function create(variant, parentEl, opts) {
    opts = opts || {};
    var id = opts.id || ('box3d-' + (++_counter));
    var wrap = document.createElement('div');
    wrap.id = id;
    wrap.className = 'box3d-wrap ' + (variant || 'splash') + '-variant';
    wrap.innerHTML = TEMPLATE;

    // Optionally disable spin
    if (opts.spin === false) {
      var spinEl = wrap.querySelector('.box3d-spin');
      if (spinEl) spinEl.classList.remove('spinning');
    }

    parentEl.appendChild(wrap);
    _instances[id] = { el: wrap, variant: variant || 'splash', state: 'closed' };
    return id;
  }

  // ── State transitions ─────────────────────────────────────────────

  function open(id) {
    var inst = _instances[id];
    if (!inst) return;
    inst.el.classList.add('opened');
    inst.el.classList.remove('envelop');
    inst.state = 'open';
  }

  function close(id) {
    var inst = _instances[id];
    if (!inst) return;
    inst.el.classList.remove('opened', 'envelop');
    inst.state = 'closed';
  }

  /**
   * Trigger the "envelop" effect — interior glow expands to fill
   * the screen. Calls `cb` after the CSS transition completes.
   *
   * @param {string} id
   * @param {function} [cb] - Callback when envelop animation ends
   */
  function envelop(id, cb) {
    var inst = _instances[id];
    if (!inst) return;
    inst.el.classList.add('opened', 'envelop');
    inst.state = 'envelop';

    // Also add envelop-bg to any ancestor overlay
    var overlay = inst.el.closest('#splash-overlay');
    if (overlay) overlay.classList.add('envelop-bg');

    if (cb) {
      // Wait for the glow transform transition to finish (~1s)
      setTimeout(cb, 1000);
    }
  }

  function getState(id) {
    var inst = _instances[id];
    return inst ? inst.state : null;
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  function destroy(id) {
    var inst = _instances[id];
    if (!inst) return;
    if (inst.el.parentNode) inst.el.parentNode.removeChild(inst.el);
    delete _instances[id];
  }

  // ── Spin control ──────────────────────────────────────────────────

  function setSpin(id, spinning) {
    var inst = _instances[id];
    if (!inst) return;
    var spinEl = inst.el.querySelector('.box3d-spin');
    if (!spinEl) return;
    if (spinning) spinEl.classList.add('spinning');
    else spinEl.classList.remove('spinning');
  }

  // ── Public API ────────────────────────────────────────────────────

  return {
    register: register,
    create:   create,
    open:     open,
    close:    close,
    envelop:  envelop,
    getState: getState,
    destroy:  destroy,
    setSpin:  setSpin
  };
})();
