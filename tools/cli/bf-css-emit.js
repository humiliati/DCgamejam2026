// ═══════════════════════════════════════════════════════════════
//  tools/cli/bf-css-emit.js — Pure-Node port of BoxForge's
//  generateExportCSS() (tools/boxforge.html, line ~4914).
//
//  Phase 3a of BOXFORGE_AGENT_ROADMAP.
//
//  INPUT:  a v4 .boxforge.json sidecar (shell/colors/panes/glows/
//          orbConfig/pyramidConfig/phaseAnims/phaseMode/orbOnly/
//          pyrPrimary/templateName/currentState).
//  OUTPUT: { css: string, pf: string } where `pf` is the prefix
//          used across the emitted selectors.
//
//  The port is deliberately faithful to the browser implementation
//  so an agent can regenerate an emitted peek module from its
//  sidecar alone. Only DOM-coupled helpers (document.createElement
//  inside `esc`) are replaced with pure equivalents; all math and
//  formatting matches the browser tool verbatim.
//
//  See the BoxForge descriptor/meta surface in §2.1 of the roadmap
//  and the v4 serialize shape in tools/boxforge.html#serializeProject.
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Color helpers (copied verbatim from boxforge.html) ─────────
function hexRgb(hex) {
  return parseInt(hex.slice(1, 3), 16) + ',' +
         parseInt(hex.slice(3, 5), 16) + ',' +
         parseInt(hex.slice(5, 7), 16);
}

function clampChannel(v) {
  return Math.max(0, Math.min(255, v));
}

function darken(hex) {
  var r = clampChannel(parseInt(hex.slice(1, 3), 16) - 30);
  var g = clampChannel(parseInt(hex.slice(3, 5), 16) - 30);
  var b = clampChannel(parseInt(hex.slice(5, 7), 16) - 30);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function lighten(hex) {
  var r = clampChannel(parseInt(hex.slice(1, 3), 16) + 30);
  var g = clampChannel(parseInt(hex.slice(3, 5), 16) + 30);
  var b = clampChannel(parseInt(hex.slice(5, 7), 16) + 30);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ── ORB palettes (copied verbatim from boxforge.html#1600) ─────
var ORB_PALETTES = {
  fire:   ['#ff220088','#ff440088','#ff660088','#ff880088','#ffaa0088','#ff660088','#ff440088','#cc330088','#ff880088'],
  ember:  ['#ff550088','#0a0a0a88','#ff660088','#0a0a0a88','#ff440088','#0a0a0a88','#ff770088','#0a0a0a88','#ff550088'],
  ice:    ['#0088ff88','#00bbff88','#00eeff88','#44ccff88','#0066cc88','#22aadd88','#0099ee88','#44ddff88','#0077dd88'],
  poison: ['#00cc0088','#44ff0088','#22aa2288','#00ff4488','#33cc3388','#00ee0088','#66ff2288','#11bb1188','#44dd4488'],
  arcane: ['#8800ff88','#aa44ff88','#cc00ff88','#6622cc88','#9933ff88','#bb22ee88','#7711dd88','#dd55ff88','#9944ee88'],
  holy:   ['#ffdd4488','#ffeeaa88','#ffcc2288','#ffffcc88','#ffbb0088','#ffeedd88','#ffdd6688','#fff5cc88','#ffcc4488'],
  smoke:  ['#88888866','#aaaaaa55','#66666666','#99999955','#bbbbbb44','#77777766','#cccccc44','#55555566','#99999955']
};

// ── Transform helpers (boxforge.html#4707) ─────────────────────
function getFaceTransform(face, W, H, D, ox, oy, oz) {
  ox = ox || 0; oy = oy || 0; oz = oz || 0;
  switch (face) {
    case 'back':   return 'translateZ(' + (-D + oz) + 'px) translate(' + ox + 'px,' + oy + 'px)';
    case 'front':  return 'translateZ(' + (D + oz) + 'px) translate(' + ox + 'px,' + oy + 'px)';
    case 'left':   return 'translate(' + (ox - W/2) + 'px,' + oy + 'px) rotateY(90deg) translateZ(' + oz + 'px)';
    case 'right':  return 'translate(' + (ox + W/2) + 'px,' + oy + 'px) rotateY(90deg) translateZ(' + oz + 'px)';
    case 'top':    return 'translate(' + ox + 'px,' + oy + 'px) rotateX(90deg) translateZ(' + (H/2) + 'px) translateY(' + oz + 'px)';
    case 'bottom': return 'translate(' + ox + 'px,' + oy + 'px) rotateX(90deg) translateZ(' + (-H/2) + 'px) translateY(' + oz + 'px)';
  }
  return '';
}

function getPaneRotSuffix(p) {
  if (!p.rotX && !p.rotY && !p.rotZ) return '';
  var s = '';
  if (p.rotX) s += ' rotateX(' + p.rotX + 'deg)';
  if (p.rotY) s += ' rotateY(' + p.rotY + 'deg)';
  if (p.rotZ) s += ' rotateZ(' + p.rotZ + 'deg)';
  return s;
}

function getLidBaseTransform(face, W, H, D, ox, oy, pw, ph, oz) {
  ox = ox || 0; oy = oy || 0; oz = oz || 0;
  switch (face) {
    case 'front':  return 'translateZ(' + (D + oz) + 'px) translate(' + ox + 'px,' + oy + 'px)';
    case 'back':   return 'translateZ(' + (-D + oz) + 'px) translate(' + ox + 'px,' + oy + 'px)';
    case 'left':   return 'translate(' + (ox - W/2) + 'px,' + oy + 'px) rotateY(90deg) translateZ(' + oz + 'px)';
    case 'right':  return 'translate(' + (ox + W/2) + 'px,' + oy + 'px) rotateY(90deg) translateZ(' + oz + 'px)';
    case 'top':    return 'translate(' + ox + 'px,' + oy + 'px) rotateX(90deg) translateZ(' + (H/2) + 'px) translateY(' + oz + 'px)';
    case 'bottom': return 'translate(' + ox + 'px,' + oy + 'px) rotateX(90deg) translateZ(' + (-H/2) + 'px) translateY(' + oz + 'px)';
  }
  return '';
}

function getHingeOrigin(hinge, pw, ph) {
  switch (hinge) {
    case 'bottom': return 'center ' + ph + 'px';
    case 'top':    return 'center 0px';
    case 'left':   return '0px center';
    case 'right':  return pw + 'px center';
    default:       return 'center center';
  }
}

function getHingeOpen(hinge, angle, isOpen, isHover, hoverAngle) {
  var ha = hoverAngle != null ? hoverAngle : 25;
  var a = 0;
  if (isOpen) a = angle;
  else if (isHover) a = ha;
  var slidePct = isOpen ? Math.min(angle, 100) : isHover ? Math.min(ha, 30) : 0;
  switch (hinge) {
    case 'bottom':      return 'rotateX(' + (-a) + 'deg)';
    case 'top':         return 'rotateX(' + a + 'deg)';
    case 'left':        return 'rotateY(' + (-a) + 'deg)';
    case 'right':       return 'rotateY(' + a + 'deg)';
    case 'slide-right': return 'translateX(' + slidePct + '%)';
    case 'slide-left':  return 'translateX(' + (-slidePct) + '%)';
    case 'slide-up':    return 'translateY(' + (-slidePct) + '%)';
    case 'slide-down':  return 'translateY(' + slidePct + '%)';
  }
  return '';
}

// ── Texture helpers (boxforge.html#4775) ───────────────────────
// `colors` must be passed in (was module-level in boxforge.html).
function getTextureBg(p, colors) {
  var c1 = colors.cDark, c2 = colors.cLight, pc = p.color;
  switch (p.texture) {
    case 'gradient': return 'linear-gradient(to top, ' + c1 + ', ' + c2 + ')';
    case 'solid':    return pc;
    case 'hidden':   return 'transparent';
    case 'wood-plank':
      return 'repeating-linear-gradient(0deg, ' + pc + ' 0px, ' + pc + ' 8px, ' + darken(pc) + ' 8px, ' + darken(pc) + ' 9px)';
    case 'dark-wood':
      return 'repeating-linear-gradient(0deg, #3a2810 0px, #3a2810 7px, #2a1c08 7px, #2a1c08 8px, #4a3418 8px, #4a3418 15px, #2a1c08 15px, #2a1c08 16px)';
    case 'brick':
      return 'repeating-linear-gradient(0deg, ' + pc + ' 0px, ' + pc + ' 14px, ' + darken(pc) + ' 14px, ' + darken(pc) + ' 15px, ' + lighten(pc) + ' 15px, ' + lighten(pc) + ' 29px, ' + darken(pc) + ' 29px, ' + darken(pc) + ' 30px)';
    case 'stone':
      return 'linear-gradient(to top, ' + darken(pc) + ', ' + pc + ' 40%, ' + darken(pc) + ' 70%, ' + darken(pc) + ')';
    case 'cathedral-stone':
      return 'linear-gradient(to top, #1a1028, #3a2850 30%, #2a1c40 60%, #1a1028), repeating-linear-gradient(90deg, transparent 0px, transparent 30px, rgba(255,255,255,0.04) 30px, rgba(255,255,255,0.04) 31px)';
    case 'iron-plate':
      return 'linear-gradient(135deg, ' + darken(pc) + ', ' + pc + ' 50%, ' + darken(pc) + ')';
    case 'concrete':
      return 'linear-gradient(180deg, #4a4a48, #3a3a38 40%, #4a4a48 80%), repeating-linear-gradient(90deg, transparent 0px, transparent 31px, rgba(0,0,0,0.15) 31px, rgba(0,0,0,0.15) 32px)';
    case 'grid-lines':
      return 'repeating-linear-gradient(0deg, transparent 0px, transparent 11px, rgba(0,0,0,0.35) 11px, rgba(0,0,0,0.35) 12px), repeating-linear-gradient(90deg, transparent 0px, transparent 11px, rgba(0,0,0,0.35) 11px, rgba(0,0,0,0.35) 12px), ' + pc;
    case 'boss-red':
      return 'linear-gradient(to top, #1a0404, #8a1818 30%, #c02020 50%, #8a1818 70%, #1a0404), repeating-linear-gradient(90deg, transparent 0px, transparent 20px, rgba(255,180,60,0.08) 20px, rgba(255,180,60,0.08) 21px)';
    case 'boss-blue':
      return 'linear-gradient(to top, #04041a, #182888 30%, #2040c0 50%, #182888 70%, #04041a), repeating-linear-gradient(0deg, transparent 0px, transparent 16px, rgba(100,200,255,0.1) 16px, rgba(100,200,255,0.1) 17px)';
    case 'boss-gold':
      return 'linear-gradient(to top, #1a1204, #8a6818 30%, #c09820 50%, #8a6818 70%, #1a1204), repeating-linear-gradient(45deg, transparent 0px, transparent 12px, rgba(255,240,180,0.1) 12px, rgba(255,240,180,0.1) 13px)';
    case 'locked-chains':
      return 'linear-gradient(to top, #1a1a1a, #3a3a3a), repeating-linear-gradient(45deg, transparent 0px, transparent 8px, rgba(255,255,255,0.06) 8px, rgba(255,255,255,0.06) 9px), repeating-linear-gradient(-45deg, transparent 0px, transparent 8px, rgba(255,255,255,0.06) 8px, rgba(255,255,255,0.06) 9px)';
    case 'runed-glow':
      return 'radial-gradient(circle at 30% 40%, rgba(100,200,255,0.25) 0%, transparent 30%), radial-gradient(circle at 70% 60%, rgba(100,200,255,0.2) 0%, transparent 25%), linear-gradient(to top, #0a0a1a, #1a1a3a)';
  }
  return pc;
}

// ── Structural size helpers (boxforge.html#3975) ───────────────
function getStructDefaultW(face, shell) {
  if (face === 'back' || face === 'front' || face === 'top' || face === 'bottom') return shell.bw;
  return shell.bd * 2;
}
function getStructDefaultH(face, shell) {
  if (face === 'back' || face === 'front' || face === 'left' || face === 'right') return shell.bh;
  return shell.bd * 2;
}
function getStructW(p, shell) {
  if (p._pwOverride) return p.pw;
  return getStructDefaultW(p.face, shell);
}
function getStructH(p, shell) {
  if (p._phOverride) return p.ph;
  return getStructDefaultH(p.face, shell);
}

// ═══════════════════════════════════════════════════════════════
//  Main entry: emitCSS(project, overrideName?) → { css, pf }
//  Faithful port of generateExportCSS (boxforge.html#4914).
// ═══════════════════════════════════════════════════════════════
function emitCSS(project, overrideName) {
  var name = overrideName || project.templateName || 'custom';
  var pf = name.toLowerCase().replace(/\s+/g, '-');
  var shell = project.shell || { bw: 400, bh: 400, bd: 200, persp: 800, rx: -18, ry: -10 };
  var colors = project.colors || { cDark: '#2a1408', cLight: '#8a5c20', cFloor: '#1a0804', cCeil: '#4a2c10', cGlow: '#8a5c20' };
  var panes = project.panes || [];
  var glows = project.glows || [];
  var orbConfig = project.orbConfig || null;
  var pyramidConfig = project.pyramidConfig || null;
  var phaseAnims = project.phaseAnims || { p1:{}, p2:{}, p3:{} };
  var phaseMode = project.phaseMode || 'box';

  var W = shell.bw, H = shell.bh, D = shell.bd;
  var lids = panes.filter(function(p) { return p.role === 'lid'; });
  var structs = panes.filter(function(p) { return p.structural && p.role !== 'lid'; });
  var extras = panes.filter(function(p) { return !p.structural && p.role !== 'lid'; });

  function emitSubBoxCSS(parentSel, p, pw, ph) {
    if (!p.box) return '';
    var out = '';
    var bd = p.box.bd;
    var ec = p.box.edgeColor || p.color || colors.cLight;
    var ea = (p.box.edgeAlpha != null ? p.box.edgeAlpha : p.alpha) / 100;
    var edgeBg = 'linear-gradient(to top, ' + darken(ec) + ', ' + ec + ')';
    out += '/* Sub-box: depth ' + bd + 'px */\n';
    out += parentSel + ' { transform-style: preserve-3d; }\n';
    var EDGE_FACES = [
      { face: 'back',   w: pw,     h: ph,     show: p.box.showBack !== false },
      { face: 'left',   w: bd * 2, h: ph,     show: true },
      { face: 'right',  w: bd * 2, h: ph,     show: true },
      { face: 'top',    w: pw,     h: bd * 2, show: true },
      { face: 'bottom', w: pw,     h: bd * 2, show: true }
    ];
    EDGE_FACES.forEach(function(ef) {
      if (!ef.show) return;
      var edgeSel = parentSel + ' > .sub-edge-' + ef.face;
      var cl = (pw - ef.w) / 2, ct = (ph - ef.h) / 2;
      out += edgeSel + ' {\n';
      out += '  position: absolute; pointer-events: none;\n';
      out += '  width: ' + ef.w + 'px; height: ' + ef.h + 'px;\n';
      if (cl || ct) out += '  left: ' + cl + 'px; top: ' + ct + 'px;\n';
      out += '  background: ' + edgeBg + ';\n';
      if (ea < 1) out += '  opacity: ' + ea + ';\n';
      out += '  border: 1px solid rgba(255,255,255,0.08);\n';
      out += '  transform-style: preserve-3d;\n';
      out += '  transform: ' + getFaceTransform(ef.face, pw, ph, bd, 0, 0, 0) + ';\n';
      out += '}\n';
    });
    if (p.box.children && p.box.children.length) {
      p.box.children.forEach(function(child, ci) {
        var cpw = child.pw, cph = child.ph;
        var childSel = parentSel + ' > .sub-child-' + ci;
        var cl = (pw - cpw) / 2, ct = (ph - cph) / 2;
        out += childSel + ' {\n';
        out += '  position: absolute; pointer-events: none;\n';
        out += '  width: ' + cpw + 'px; height: ' + cph + 'px;\n';
        if (cl || ct) out += '  left: ' + cl + 'px; top: ' + ct + 'px;\n';
        out += '  background: ' + getTextureBg(child, colors) + ';\n';
        if ((child.alpha || 100) < 100) out += '  opacity: ' + ((child.alpha || 100) / 100) + ';\n';
        out += '  border: 1px solid rgba(255,255,255,0.08);\n';
        out += '  transform-style: preserve-3d;\n';
        out += '  transform: translateZ(' + ((child.oz || 0) + 1) + 'px) translate(' + (child.ox || 0) + 'px,' + (child.oy || 0) + 'px);\n';
        out += '}\n';
        if (child.box) out += emitSubBoxCSS(childSel, child, cpw, cph);
      });
    }
    return out;
  }

  function emitAttachCSS(parentSel, p, pw, ph) {
    if (!p.attachments || !p.attachments.length) return '';
    var out = '';
    p.attachments.forEach(function(att, ai) {
      var sel = parentSel + ' > .pane-attach-' + ai;
      out += '/* Attachment: ' + att.type + ' (id ' + att.id + ') */\n';
      out += sel + ' {\n';
      out += '  position: absolute; pointer-events: none; transform-style: preserve-3d;\n';
      var sc = att.scale || 1;
      var tfm = 'translate(' + (att.ox || 0) + 'px,' + (att.oy || 0) + 'px) translateZ(' + (att.oz || 0) + 'px)';
      if (att.rotX) tfm += ' rotateX(' + att.rotX + 'deg)';
      if (att.rotY) tfm += ' rotateY(' + att.rotY + 'deg)';
      if (att.rotZ) tfm += ' rotateZ(' + att.rotZ + 'deg)';
      if (sc !== 1) tfm += ' scale3d(' + sc + ',' + sc + ',' + sc + ')';
      if (att.type === 'orb') {
        out += '  width: ' + att.size + 'px; height: ' + att.size + 'px;\n';
        out += '  left: ' + ((pw - att.size) / 2) + 'px; top: ' + ((ph - att.size) / 2) + 'px;\n';
        out += '  transform: ' + tfm + ';\n';
        out += '  /* orb: ' + att.rings + ' rings \u00d7 ' + att.slices + ' slices, palette:' + att.palette + ', state:' + att.state + ', speed:' + att.speed + 's */\n';
      } else if (att.type === 'pyramid') {
        var pyrH = att.height > 0 ? att.height : att.size;
        out += '  width: ' + att.size + 'px; height: ' + pyrH + 'px;\n';
        out += '  left: ' + ((pw - att.size) / 2) + 'px; top: ' + ((ph - pyrH) / 2) + 'px;\n';
        out += '  transform: ' + tfm + ';\n';
        out += '  /* pyramid: shape:' + att.shape + ', spread:' + att.spread + ', speed:' + att.speed + 's, colors:(' + att.color1 + ',' + att.color2 + ',' + att.color3 + ') */\n';
      }
      out += '}\n';
    });
    return out;
  }

  var css = '/* === Variant: ' + name + ' (' + W + 'x' + H + ', depth ' + (D*2) + ') === */\n';
  css += '/* Generated by BoxForge v1.0 \u2014 ' + panes.length + ' panes (' + structs.length + ' struct, ' + lids.length + ' lid, ' + extras.length + ' extra) */\n\n';

  css += '.box3d-wrap.' + pf + '-variant {\n';
  css += '  --' + pf + '-w: ' + W + 'px;\n';
  css += '  --' + pf + '-h: ' + H + 'px;\n';
  css += '  --box-d: ' + D + 'px;\n';
  css += '  --box-half: ' + (-D) + 'px;\n';
  css += '  --bevel-w: 2px;\n';
  css += '  --box-dark: ' + colors.cDark + ';\n';
  css += '  --box-dark2: ' + darken(colors.cDark) + ';\n';
  css += '  --box-light: ' + colors.cLight + ';\n';
  css += '  --box-floor: ' + colors.cFloor + ';\n';
  css += '  --box-ceil: ' + colors.cCeil + ';\n';
  css += '  --box-glow: rgba(' + hexRgb(colors.cGlow) + ',0.6);\n';
  css += '  --perspective: ' + shell.persp + 'px;\n';
  css += '  perspective: ' + shell.persp + 'px;\n';
  css += '  width: ' + W + 'px;\n';
  css += '  height: ' + H + 'px;\n';
  css += '}\n';
  css += '.box3d-wrap.' + pf + '-variant .box3d-scene {\n';
  css += '  width: ' + W + 'px; height: ' + H + 'px;\n';
  css += '  transform: rotateX(' + shell.rx + 'deg) rotateY(' + shell.ry + 'deg);\n';
  css += '}\n';
  css += '.box3d-wrap.' + pf + '-variant .box3d-spin {\n';
  css += '  width: ' + W + 'px; height: ' + H + 'px;\n';
  css += '}\n';
  css += '.' + pf + '-variant .box3d-body {\n';
  css += '  width: ' + W + 'px; height: ' + H + 'px;\n';
  css += '}\n\n';

  // Structural faces
  var _faceCount = {};
  structs.forEach(function(p) {
    var pw = getStructW(p, shell), ph = getStructH(p, shell);
    var tfm = getFaceTransform(p.face, W, H, D, p.ox, p.oy, p.oz) + getPaneRotSuffix(p);
    _faceCount[p.face] = (_faceCount[p.face] || 0) + 1;
    var faceClass = 'bf-' + p.face + (_faceCount[p.face] > 1 ? '-' + _faceCount[p.face] : '');
    css += '/* ' + p.name + ' (' + p.face + '): ' + pw + ' x ' + ph;
    if (p.biomeTag) css += ' [biome: ' + p.biomeTag + ']';
    if (p.labelText) css += ' [label: "' + p.labelText + '" dir:' + p.labelDir + ' ' + p.labelSize + 'px]';
    css += ' */\n';
    var centerL = (W - pw) / 2, centerT = (H - ph) / 2;
    css += '.box3d-wrap.' + pf + '-variant .' + faceClass + ' {\n';
    css += '  width: ' + pw + 'px; height: ' + ph + 'px;\n';
    if (centerL || centerT) css += '  left: ' + centerL + 'px; top: ' + centerT + 'px;\n';
    css += '  background: ' + getTextureBg(p, colors) + ';\n';
    css += '  transform: ' + tfm + ';\n';
    if (p.alpha < 100) css += '  opacity: ' + (p.alpha / 100) + ';\n';
    if (p.borderRadius) css += '  border-radius: ' + p.borderRadius + '%;\n';
    if (p.texture === 'hidden') css += '  display: none;\n';
    if (p.wiring) css += '  /* wiring: ' + p.wiring.replace(/\n/g, ' | ') + ' */\n';
    css += '}\n';
    if (p.box) css += emitSubBoxCSS('.box3d-wrap.' + pf + '-variant .' + faceClass, p, pw, ph);
    css += emitAttachCSS('.box3d-wrap.' + pf + '-variant .' + faceClass, p, pw, ph);
  });

  // Lids
  lids.forEach(function(p, i) {
    var pw = p.pw, ph = p.ph;
    var lidBase = getLidBaseTransform(p.face, W, H, D, p.ox, p.oy, pw, ph, p.oz) + getPaneRotSuffix(p);
    var origin = getHingeOrigin(p.hinge, pw, ph);
    var openTfm = getHingeOpen(p.hinge, p.angle, true, false, p.hoverAngle);
    var hoverTfm = getHingeOpen(p.hinge, p.angle, false, true, p.hoverAngle);
    var lidSel = lids.length > 1 ? '--' + i : '';
    var centerL = (W - pw) / 2, centerT = (H - ph) / 2;

    css += '\n/* Lid: ' + p.name + ' (' + pw + 'x' + ph + ', hinge: ' + p.hinge + ', open: ' + p.angle + '\u00b0, hover: ' + p.hoverAngle + '\u00b0)';
    if (p.biomeTag) css += ' [biome: ' + p.biomeTag + ']';
    if (p.labelText) css += ' [label: "' + p.labelText + '" dir:' + p.labelDir + ' ' + p.labelSize + 'px]';
    css += ' */\n';
    css += '.box3d-wrap.' + pf + '-variant .box3d-lid-wrap' + lidSel + ' {\n';
    css += '  position: absolute; transform-style: preserve-3d;\n';
    css += '  width: ' + pw + 'px; height: ' + ph + 'px;\n';
    if (centerL || centerT) css += '  left: ' + centerL + 'px; top: ' + centerT + 'px;\n';
    css += '  transform: ' + lidBase + ';\n';
    css += '}\n';
    css += '.box3d-wrap.' + pf + '-variant .box3d-lid' + lidSel + ' {\n';
    css += '  width: ' + pw + 'px; height: ' + ph + 'px;\n';
    css += '  background: ' + getTextureBg(p, colors) + ';\n';
    if (p.alpha < 100) css += '  opacity: ' + (p.alpha / 100) + ';\n';
    if (p.borderRadius) css += '  border-radius: ' + p.borderRadius + '%;\n';
    css += '  transform-origin: ' + origin + ';\n';
    css += '  transition: transform 0.4s cubic-bezier(0.33, 1, 0.68, 1);\n';
    if (p.wiring) css += '  /* wiring: ' + p.wiring.replace(/\n/g, ' | ') + ' */\n';
    css += '}\n';
    css += '.box3d-wrap.' + pf + '-variant.hovered .box3d-lid' + lidSel + ' {\n';
    css += '  transform: ' + hoverTfm + ';\n';
    css += '}\n';
    css += '.box3d-wrap.' + pf + '-variant.opened .box3d-lid' + lidSel + ' {\n';
    css += '  transform: ' + openTfm + ';\n';
    css += '}\n';
    if (p.box) css += emitSubBoxCSS('.box3d-wrap.' + pf + '-variant .box3d-lid' + lidSel, p, pw, ph);
    css += emitAttachCSS('.box3d-wrap.' + pf + '-variant .box3d-lid' + lidSel, p, pw, ph);
  });

  // Extras
  if (extras.length) {
    css += '\n/* === EXTRA PANES (' + extras.length + ') === */\n';
    extras.forEach(function(p, i) {
      var pw = p.pw, ph = p.ph;
      var tfm = getFaceTransform(p.face, W, H, D, p.ox, p.oy, p.oz) + getPaneRotSuffix(p);
      _faceCount[p.face] = (_faceCount[p.face] || 0) + 1;
      var faceClass = 'bf-' + p.face + (_faceCount[p.face] > 1 ? '-' + _faceCount[p.face] : '');
      var centerL = (W - pw) / 2, centerT = (H - ph) / 2;
      css += '/* ' + p.name + ' (' + p.face + ', ' + pw + 'x' + ph + ', role: ' + p.role + ') */\n';
      css += '.box3d-wrap.' + pf + '-variant .' + faceClass + ' {\n';
      css += '  width: ' + pw + 'px; height: ' + ph + 'px;\n';
      if (centerL || centerT) css += '  left: ' + centerL + 'px; top: ' + centerT + 'px;\n';
      css += '  transform: ' + tfm + ';\n';
      css += '  background: ' + getTextureBg(p, colors) + ';\n';
      if (p.alpha < 100) css += '  opacity: ' + (p.alpha / 100) + ';\n';
      if (p.borderRadius) css += '  border-radius: ' + p.borderRadius + '%;\n';
      if (p.texture === 'hidden') css += '  display: none;\n';
      if (p.spinX || p.spinY) {
        css += '  animation: ' + pf + '-extra-spin-' + i + ' ' + Math.round(360 / Math.max(p.spinX || 1, p.spinY || 1)) + 's linear infinite;\n';
      }
      if (p.labelText) css += '  /* label: "' + p.labelText + '" dir:' + p.labelDir + ' ' + p.labelSize + 'px */\n';
      if (p.biomeTag) css += '  /* biome: ' + p.biomeTag + ' */\n';
      if (p.wiring) css += '  /* wiring: ' + p.wiring.replace(/\n/g, ' | ') + ' */\n';
      css += '}\n';
      if (p.spinX || p.spinY) {
        var kfName = pf + '-extra-spin-' + i;
        css += '@keyframes ' + kfName + ' {\n';
        css += '  from { transform: ' + tfm + '; }\n';
        css += '  to { transform: ' + tfm + ' rotateX(' + (p.spinX ? 360 : 0) + 'deg) rotateY(' + (p.spinY ? 360 : 0) + 'deg); }\n';
        css += '}\n';
      }
      if (p.box) css += emitSubBoxCSS('.box3d-wrap.' + pf + '-variant .' + faceClass, p, pw, ph);
      css += emitAttachCSS('.box3d-wrap.' + pf + '-variant .' + faceClass, p, pw, ph);
    });
  }

  // Orb
  if (orbConfig) {
    css += '\n/* === ORB (CSS Geodesic Sphere) \u2014 Per-Phase Config === */\n';
    css += '/* phaseMode: ' + phaseMode + ' */\n';
    ['p1','p2','p3'].forEach(function(pk, idx) {
      var ph = orbConfig[pk];
      if (!ph) return;
      var label = idx === 0 ? 'Phase 1 (idle/closed)' : idx === 1 ? 'Phase 2 (hover)' : 'Phase 3 (activated/open)';
      css += '/* ' + label + ': ' + ph.palette + ' ' + ph.state + ' | ' + ph.size + 'px | ' + ph.rings + '\u00d7' + ph.slices + ' | speed ' + ph.speed + 's | xyz(' + ph.x + ',' + ph.y + ',' + ph.z + ') */\n';
    });
    function emitOrbVars(ph) {
      var s = '';
      s += '  --orb-size: ' + ph.size + 'px;\n';
      s += '  --orb-speed: ' + ph.speed + 's;\n';
      s += '  --orb-rings: ' + ph.rings + ';\n';
      s += '  --orb-slices: ' + ph.slices + ';\n';
      s += '  --orb-x: ' + ph.x + 'px;\n';
      s += '  --orb-y: ' + ph.y + 'px;\n';
      s += '  --orb-z: ' + ph.z + 'px;\n';
      s += '  --orb-palette: ' + ph.palette + ';\n';
      s += '  --orb-state: ' + ph.state + ';\n';
      return s;
    }
    var p3 = orbConfig.p3;
    css += '.' + pf + '-orb {\n';
    css += emitOrbVars(p3);
    css += '  width: var(--orb-size); height: var(--orb-size);\n';
    css += '  transform-style: preserve-3d;\n';
    css += '  animation: orb-spin var(--orb-speed) linear infinite;\n';
    css += '  position: absolute;\n';
    css += '  left: calc(50% - var(--orb-size) / 2 + var(--orb-x));\n';
    css += '  top: calc(50% - var(--orb-size) / 2 + var(--orb-y));\n';
    css += '  transform: translateZ(var(--orb-z));\n';
    css += '}\n';
    var p1 = orbConfig.p1;
    css += '/* Phase 1 (closed): */\n';
    css += '.box3d-wrap.' + pf + '-variant .' + pf + '-orb {\n';
    css += emitOrbVars(p1);
    css += '  transform: translateZ(' + p1.z + 'px);\n';
    css += '}\n';
    var p2 = orbConfig.p2;
    css += '/* Phase 2 (hover): */\n';
    css += '.box3d-wrap.' + pf + '-variant.hovered .' + pf + '-orb {\n';
    css += emitOrbVars(p2);
    css += '  transform: translateZ(' + p2.z + 'px);\n';
    css += '}\n';
    css += '/* Phase 3 (open): */\n';
    css += '.box3d-wrap.' + pf + '-variant.opened .' + pf + '-orb {\n';
    css += emitOrbVars(p3);
    css += '  transform: translateZ(' + p3.z + 'px);\n';
    css += '}\n';
    css += '/* Palette colors (p3): ' + (ORB_PALETTES[p3.palette] || []).join(', ') + ' */\n';
    css += '/* Build ' + p3.rings + ' .orb-ring divs, each rotated ' + Math.round(180 / p3.rings) + 'deg apart */\n';
    css += '/* Each ring has ' + p3.slices + ' .orb-slice divs, each rotateY(' + Math.round(360 / p3.slices) + 'deg) apart */\n';
    css += '/* Max total elements: ' + (p3.rings * p3.slices) + ' */\n\n';
  }

  // Pyramid
  if (pyramidConfig) {
    css += '\n/* === PYRAMID (CSS 3D Tetrahedron) \u2014 Per-Phase Config === */\n';
    css += '/* shape: ' + (pyramidConfig.shape || 'triangle') + ' | spinning: ' + (pyramidConfig.spinning !== false) + ' | invert: ' + (!!pyramidConfig.invert) + ' */\n';
    ['p1','p2','p3'].forEach(function(pk, idx) {
      var pp = pyramidConfig[pk];
      if (!pp) return;
      var label = idx === 0 ? 'Phase 1 (idle)' : idx === 1 ? 'Phase 2 (hover)' : 'Phase 3 (activated)';
      var hVal = pp.height > 0 ? pp.height + 'px' : 'auto (= width)';
      css += '/* ' + label + ': w' + pp.size + 'px h' + hVal + ' spread' + (pp.spread != null ? pp.spread : 30) + '\u00b0 | speed ' + pp.speed + 's | colors(' + pp.color1 + ',' + pp.color2 + ',' + pp.color3 + ') | glow(' + pp.glow + ') | xyz(' + pp.x + ',' + pp.y + ',' + pp.z + ') */\n';
    });
    var pp3 = pyramidConfig.p3;
    css += '.' + pf + '-pyramid {\n';
    css += '  --pyr-w: ' + pp3.size + 'px;\n';
    css += '  --pyr-h: ' + (pp3.height > 0 ? pp3.height : pp3.size) + 'px;\n';
    css += '  --pyr-spread: ' + (pp3.spread != null ? pp3.spread : 30) + 'deg;\n';
    css += '  --pyr-speed: ' + pp3.speed + 's;\n';
    css += '  --pyr-color1: ' + pp3.color1 + ';\n';
    css += '  --pyr-color2: ' + pp3.color2 + ';\n';
    css += '  --pyr-color3: ' + pp3.color3 + ';\n';
    css += '  --pyr-glow: ' + pp3.glow + ';\n';
    css += '  width: var(--pyr-w); height: var(--pyr-h);\n';
    css += '  transform-style: preserve-3d;\n';
    css += '  position: absolute;\n';
    css += '}\n';
    css += '.' + pf + '-pyramid .pyr-side { transform-origin: center top; }\n';
    css += '.' + pf + '-pyramid .pyr-1 { transform: rotateZ(calc(-1 * var(--pyr-spread))) rotateY(90deg); }\n';
    css += '.' + pf + '-pyramid .pyr-2 { transform: rotateZ(var(--pyr-spread)) rotateY(90deg); }\n';
    css += '.' + pf + '-pyramid .pyr-3 { transform: rotateX(var(--pyr-spread)); }\n';
    css += '.' + pf + '-pyramid .pyr-4 { transform: rotateX(calc(-1 * var(--pyr-spread))); }\n';
    var pp1 = pyramidConfig.p1, pp2 = pyramidConfig.p2;
    if (pp1) {
      css += '/* Phase 1 (closed): */\n';
      css += '.box3d-wrap.' + pf + '-variant .' + pf + '-pyramid {\n';
      css += '  --pyr-w: ' + pp1.size + 'px; --pyr-h: ' + (pp1.height > 0 ? pp1.height : pp1.size) + 'px;\n';
      css += '  --pyr-spread: ' + (pp1.spread != null ? pp1.spread : 30) + 'deg; --pyr-speed: ' + pp1.speed + 's;\n';
      css += '  --pyr-color1: ' + pp1.color1 + '; --pyr-color2: ' + pp1.color2 + '; --pyr-color3: ' + pp1.color3 + ';\n';
      css += '  --pyr-glow: ' + pp1.glow + ';\n';
      css += '  transform: translateZ(' + pp1.z + 'px); left: calc(50% - ' + pp1.size/2 + 'px + ' + pp1.x + 'px); top: calc(50% - ' + (pp1.height > 0 ? pp1.height/2 : pp1.size/2) + 'px + ' + pp1.y + 'px);\n';
      css += '}\n';
    }
    if (pp2) {
      css += '/* Phase 2 (hover): */\n';
      css += '.box3d-wrap.' + pf + '-variant.hovered .' + pf + '-pyramid {\n';
      css += '  --pyr-w: ' + pp2.size + 'px; --pyr-h: ' + (pp2.height > 0 ? pp2.height : pp2.size) + 'px;\n';
      css += '  --pyr-spread: ' + (pp2.spread != null ? pp2.spread : 30) + 'deg; --pyr-speed: ' + pp2.speed + 's;\n';
      css += '  --pyr-color1: ' + pp2.color1 + '; --pyr-color2: ' + pp2.color2 + '; --pyr-color3: ' + pp2.color3 + ';\n';
      css += '  --pyr-glow: ' + pp2.glow + ';\n';
      css += '  transform: translateZ(' + pp2.z + 'px); left: calc(50% - ' + pp2.size/2 + 'px + ' + pp2.x + 'px); top: calc(50% - ' + (pp2.height > 0 ? pp2.height/2 : pp2.size/2) + 'px + ' + pp2.y + 'px);\n';
      css += '}\n';
    }
    css += '/* Phase 3 (open): */\n';
    css += '.box3d-wrap.' + pf + '-variant.opened .' + pf + '-pyramid {\n';
    css += '  --pyr-w: ' + pp3.size + 'px; --pyr-h: ' + (pp3.height > 0 ? pp3.height : pp3.size) + 'px;\n';
    css += '  --pyr-spread: ' + (pp3.spread != null ? pp3.spread : 30) + 'deg; --pyr-speed: ' + pp3.speed + 's;\n';
    css += '  --pyr-color1: ' + pp3.color1 + '; --pyr-color2: ' + pp3.color2 + '; --pyr-color3: ' + pp3.color3 + ';\n';
    css += '  --pyr-glow: ' + pp3.glow + ';\n';
    css += '  transform: translateZ(' + pp3.z + 'px); left: calc(50% - ' + pp3.size/2 + 'px + ' + pp3.x + 'px); top: calc(50% - ' + (pp3.height > 0 ? pp3.height/2 : pp3.size/2) + 'px + ' + pp3.y + 'px);\n';
    css += '}\n\n';
  }

  // Glows
  if (glows.length) {
    css += '\n/* === GLOW SOURCES (' + glows.length + ') === */\n';
    glows.forEach(function(g, i) {
      var gr = parseInt(g.color.slice(1,3),16), gg = parseInt(g.color.slice(3,5),16), gb = parseInt(g.color.slice(5,7),16);
      var gw = Math.round(W * g.size / 100), gh = Math.round(H * g.size / 100);
      css += '.' + pf + '-glow-' + i + ' { /* ' + g.name + ' */\n';
      css += '  position: absolute;\n';
      css += '  width: ' + gw + 'px; height: ' + gh + 'px;\n';
      css += '  left: calc(50% - ' + (gw/2) + 'px + ' + g.ox + 'px);\n';
      css += '  top: calc(50% - ' + (gh/2) + 'px + ' + g.oy + 'px);\n';
      css += '  transform: translateZ(' + g.oz + 'px) rotateX(' + g.rotX + 'deg) rotateY(' + g.rotY + 'deg);\n';
      css += '  background: radial-gradient(' + g.shape + ', rgba(' + gr + ',' + gg + ',' + gb + ',' + (g.alpha/100) + ') 0%, transparent 70%);\n';
      css += '  filter: blur(' + g.blur + 'px);\n';
      css += '  pointer-events: none;\n';
      if (g.spinX || g.spinY) {
        css += '  animation: ' + pf + '-glow-spin-' + i + ' ' + Math.round(360 / Math.max(g.spinX || 1, g.spinY || 1)) + 's linear infinite;\n';
      }
      css += '}\n';
      if (g.spinX || g.spinY) {
        css += '@keyframes ' + pf + '-glow-spin-' + i + ' {\n';
        css += '  to { transform: translateZ(' + g.oz + 'px) rotateX(' + (g.rotX + (g.spinX ? 360 : 0)) + 'deg) rotateY(' + (g.rotY + (g.spinY ? 360 : 0)) + 'deg); }\n';
        css += '}\n';
      }
      if (g.child && g.child.text) {
        var cp1 = g.child.p1, cp2 = g.child.p2, cp3 = g.child.p3;
        css += '/* Glow child: "' + g.child.text + '" */\n';
        css += '.' + pf + '-glow-child-' + i + ' {\n';
        css += '  position: absolute;\n';
        css += '  left: 50%; top: 50%;\n';
        css += '  pointer-events: none;\n';
        css += '  line-height: 1; white-space: nowrap;\n';
        css += '  transition: all 0.4s cubic-bezier(0.33,1,0.68,1);\n';
        css += '  text-shadow: 0 0 12px rgba(' + gr + ',' + gg + ',' + gb + ',0.5);\n';
        css += '  font-size: ' + cp1.size + 'px;\n';
        css += '  opacity: ' + (cp1.alpha / 100) + ';\n';
        css += '  transform: translate(-50%,-50%) translateY(' + cp1.oy + 'px) translateZ(' + (g.oz + cp1.oz) + 'px) rotateX(' + (g.rotX + (cp1.rotX || 0)) + 'deg) rotateY(' + (g.rotY + (cp1.rotY || 0)) + 'deg);\n';
        css += '}\n';
        css += '.box3d-wrap.' + pf + '-variant.hovered .' + pf + '-glow-child-' + i + ' {\n';
        css += '  font-size: ' + cp2.size + 'px;\n';
        css += '  opacity: ' + (cp2.alpha / 100) + ';\n';
        css += '  transform: translate(-50%,-50%) translateY(' + cp2.oy + 'px) translateZ(' + (g.oz + cp2.oz) + 'px) rotateX(' + (g.rotX + (cp2.rotX || 0)) + 'deg) rotateY(' + (g.rotY + (cp2.rotY || 0)) + 'deg);\n';
        css += '}\n';
        css += '.box3d-wrap.' + pf + '-variant.opened .' + pf + '-glow-child-' + i + ' {\n';
        css += '  font-size: ' + cp3.size + 'px;\n';
        css += '  opacity: ' + (cp3.alpha / 100) + ';\n';
        css += '  transform: translate(-50%,-50%) translateY(' + cp3.oy + 'px) translateZ(' + (g.oz + cp3.oz) + 'px) rotateX(' + (g.rotX + (cp3.rotX || 0)) + 'deg) rotateY(' + (g.rotY + (cp3.rotY || 0)) + 'deg);\n';
        css += '}\n';
      }
    });
    css += '\n';
  }

  // Phase animation toggles
  var PA_KEYS = ['squish','bounce','poke','spin','tilt','glow'];
  var INTENSITY_KEYS = ['squish','bounce','poke'];
  var hasAnyPhaseAnims = ['p1','p2','p3'].some(function(pk) {
    var pa = phaseAnims[pk];
    return pa && PA_KEYS.some(function(k) { return pa[k] > 0; });
  });
  if (hasAnyPhaseAnims) {
    css += '\n/* === PHASE ANIMATIONS (applied to wrapper) === */\n';
    ['p1','p2','p3'].forEach(function(pk, idx) {
      var pa = phaseAnims[pk];
      if (!pa) return;
      var active = PA_KEYS.filter(function(k) { return pa[k] > 0; });
      if (active.length) {
        var label = idx === 0 ? 'Phase 1' : idx === 1 ? 'Phase 2' : 'Phase 3';
        var details = active.map(function(k) {
          return INTENSITY_KEYS.indexOf(k) >= 0 ? k + ':' + pa[k] + '%' : k;
        });
        css += '/* ' + label + ': ' + details.join(', ') + ' */\n';
      }
    });
    css += '\n';
  }

  // Wiring notes
  var wiringNotes = [];
  panes.forEach(function(p) {
    if (p.wiring) wiringNotes.push('  ' + p.name + ': ' + p.wiring.replace(/\n/g, '\n    '));
    if (p.labelText) wiringNotes.push('  ' + p.name + ' label: "' + p.labelText + '" (' + p.labelDir + ', ' + p.labelSize + 'px)');
    if (p.biomeTag) wiringNotes.push('  ' + p.name + ' biome: ' + p.biomeTag);
  });
  if (wiringNotes.length) {
    css += '\n/*\n * === WIRING NOTES (for JS implementation) ===\n';
    css += wiringNotes.join('\n') + '\n */\n';
  }

  var labelPanes = panes.filter(function(p) { return p.labelText; });
  if (labelPanes.length) {
    css += '\n/*\n * === PANE TEXT / LABEL ASSIGNMENTS ===\n';
    labelPanes.forEach(function(p) {
      css += ' *   ' + p.name + ' (' + p.face + '): "' + p.labelText + '"';
      css += '  direction: ' + p.labelDir + '  size: ' + p.labelSize + 'px';
      css += '  texture: ' + p.texture;
      if (p.biomeTag) css += '  biome: ' + p.biomeTag;
      css += '\n';
    });
    css += ' *\n * Wire these labels in the peek module\'s _show() method via:\n';
    css += ' *   el.querySelector(\'.box3d-lid .box3d-face\').textContent = labelText;\n';
    css += ' *   el.querySelector(\'.box3d-lid .box3d-face\').style.writingMode = ...;\n';
    css += ' */\n';
  }

  return { css: css, pf: pf };
}

// ═══════════════════════════════════════════════════════════════
//  emitHTML(project, overrideName?) → string
//  Produces the DOM fragment that pairs with the CSS above:
//    <div class="box3d-wrap {pf}-variant">
//      <div class="box3d-scene">
//        <div class="box3d-spin">
//          <div class="box3d-body">
//            <div class="bf-<face>"></div> × structural + extra panes
//            <div class="box3d-lid-wrap[--i]">
//              <div class="box3d-lid[--i]">
//                (+ sub-box edges / attachments / lid sub-children)
//              </div>
//            </div> × lids
//          </div>
//          <div class="{pf}-orb">(+ rings × slices stubs)</div>
//          <div class="{pf}-pyramid">(+ 4 pyr-side)</div>
//          <div class="{pf}-glow-{i}">(+ glow-child)</div> × glows
//        </div>
//      </div>
//    </div>
//  Structure mirrors the browser's box3d box — this is what
//  PeekShell.register's `contentEl` wraps.
// ═══════════════════════════════════════════════════════════════
function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escText(s) {
  return String(s).replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function emitHTML(project, overrideName) {
  var name = overrideName || project.templateName || 'custom';
  var pf = name.toLowerCase().replace(/\s+/g, '-');
  var panes = project.panes || [];
  var glows = project.glows || [];
  var orbConfig = project.orbConfig || null;
  var pyramidConfig = project.pyramidConfig || null;

  var lids = panes.filter(function(p) { return p.role === 'lid'; });
  var structs = panes.filter(function(p) { return p.structural && p.role !== 'lid'; });
  var extras = panes.filter(function(p) { return !p.structural && p.role !== 'lid'; });

  var _faceCount = {};
  function classForPane(p) {
    _faceCount[p.face] = (_faceCount[p.face] || 0) + 1;
    return 'bf-' + p.face + (_faceCount[p.face] > 1 ? '-' + _faceCount[p.face] : '');
  }

  // Recursive sub-box DOM — matches emitSubBoxCSS selectors.
  function subBoxHTML(p) {
    if (!p.box) return '';
    var parts = [];
    var EDGE_FACES = ['back','left','right','top','bottom'];
    EDGE_FACES.forEach(function(face) {
      if (face === 'back' && p.box.showBack === false) return;
      parts.push('<div class="sub-edge-' + face + '"></div>');
    });
    if (p.box.children && p.box.children.length) {
      p.box.children.forEach(function(child, ci) {
        var inner = subBoxHTML(child);
        parts.push('<div class="sub-child-' + ci + '">' + inner + '</div>');
      });
    }
    return parts.join('');
  }

  function attachmentHTML(p) {
    if (!p.attachments || !p.attachments.length) return '';
    return p.attachments.map(function(att, ai) {
      return '<div class="pane-attach-' + ai + '" data-attach-type="' + escAttr(att.type) + '"></div>';
    }).join('');
  }

  function paneHTML(p, klass, innerLabel) {
    var inside = subBoxHTML(p) + attachmentHTML(p);
    if (p.labelText) {
      inside = '<span class="bf-label" data-dir="' + escAttr(p.labelDir || 'ltr') +
               '" style="font-size:' + (p.labelSize || 14) + 'px">' + escText(p.labelText) + '</span>' + inside;
    }
    return '<div class="' + klass + '">' + inside + '</div>';
  }

  var bodyInner = '';
  structs.forEach(function(p) { bodyInner += paneHTML(p, classForPane(p)) + '\n'; });
  lids.forEach(function(p, i) {
    var suffix = lids.length > 1 ? '--' + i : '';
    var inside = subBoxHTML(p) + attachmentHTML(p);
    if (p.labelText) {
      inside = '<span class="bf-label" data-dir="' + escAttr(p.labelDir || 'ltr') +
               '" style="font-size:' + (p.labelSize || 14) + 'px">' + escText(p.labelText) + '</span>' + inside;
    }
    bodyInner +=
      '<div class="box3d-lid-wrap' + suffix + '">' +
        '<div class="box3d-lid' + suffix + '">' + inside + '</div>' +
      '</div>\n';
  });
  extras.forEach(function(p) { bodyInner += paneHTML(p, classForPane(p)) + '\n'; });

  // Orb / pyramid / glow stubs (real rendering is runtime)
  var spinChildren = '';
  if (orbConfig) {
    var orbP3 = orbConfig.p3 || { rings: 1, slices: 1 };
    var rings = [];
    for (var r = 0; r < (orbP3.rings || 1); r++) {
      var slices = [];
      for (var s = 0; s < (orbP3.slices || 1); s++) {
        slices.push('<div class="orb-slice"></div>');
      }
      rings.push('<div class="orb-ring">' + slices.join('') + '</div>');
    }
    spinChildren += '<div class="' + pf + '-orb">' + rings.join('') + '</div>\n';
  }
  if (pyramidConfig) {
    spinChildren += '<div class="' + pf + '-pyramid">' +
      '<div class="pyr-side pyr-1"></div>' +
      '<div class="pyr-side pyr-2"></div>' +
      '<div class="pyr-side pyr-3"></div>' +
      '<div class="pyr-side pyr-4"></div>' +
    '</div>\n';
  }
  glows.forEach(function(g, i) {
    var childHtml = '';
    if (g.child && g.child.text) {
      childHtml = '<div class="' + pf + '-glow-child-' + i + '">' + escText(g.child.text) + '</div>';
    }
    spinChildren += '<div class="' + pf + '-glow-' + i + '"></div>' + childHtml + '\n';
  });

  return (
    '<div class="box3d-wrap ' + pf + '-variant">' +
      '<div class="box3d-scene">' +
        '<div class="box3d-spin">' +
          '<div class="box3d-body">\n' + bodyInner + '</div>\n' +
          spinChildren +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

module.exports = {
  emitCSS: emitCSS,
  emitHTML: emitHTML,
  // Exported for independent testing and potential reuse by bf-peek-sandbox:
  _helpers: {
    hexRgb: hexRgb, darken: darken, lighten: lighten,
    getFaceTransform: getFaceTransform, getPaneRotSuffix: getPaneRotSuffix,
    getLidBaseTransform: getLidBaseTransform,
    getHingeOrigin: getHingeOrigin, getHingeOpen: getHingeOpen,
    getTextureBg: getTextureBg,
    getStructW: getStructW, getStructH: getStructH,
    ORB_PALETTES: ORB_PALETTES
  }
};
