/**
 * DeployCutscene — synthwave driving animation between character creation
 * and floor 0 deposit.
 *
 * Pure CSS animation of a vehicle driving through a retrowave landscape.
 * Plays after class selection, gives systems time to initialize, and sets
 * the tone: "you were just dropped off."
 *
 * The bumper reads "DRAGON" — a detail players won't understand until
 * the conspiracy layer reveals itself.
 *
 * Layer 2 — depends on nothing (pure DOM overlay)
 */
var DeployCutscene = (function () {
  'use strict';

  var _overlay = null;
  var _onComplete = null;
  var _timer = null;
  var _active = false;
  var _skipHandler = null;

  // Duration in ms — 2 full car animation cycles (4s each) + 1s fade
  var CUTSCENE_DURATION = 8500;
  var FADE_DURATION = 800;

  // ── Build DOM ──────────────────────────────────────────────────

  function _buildHTML() {
    return '' +
      '<div id="deployCutsceneRoot">' +
        '<div id="synthwave">' +
          '<div id="stars">' +
            '<div id="star0"></div><div id="star1"></div><div id="star2"></div>' +
            '<div id="star3"></div><div id="star4"></div><div id="star5"></div>' +
            '<div id="star6"></div><div id="star7"></div><div id="star8"></div>' +
            '<div id="star9"></div><div id="star10"></div><div id="star11"></div>' +
            '<div id="star12"></div><div id="star13"></div>' +
          '</div>' +
          '<div id="sun">' +
            '<div id="ball"></div>' +
            '<div id="stripe0"></div><div id="stripe1"></div>' +
            '<div id="stripe2"></div><div id="stripe3"></div>' +
            '<div id="stripe4"></div><div id="stripe5"></div>' +
            '<div id="stripe6"></div>' +
          '</div>' +
          '<div id="fog"></div>' +
          '<div id="land">' +
            '<div id="roadSide0"><div id="roadSideGrid0"></div></div>' +
            '<div id="roadSide1"><div id="roadSideGrid1"></div></div>' +
            '<div id="roadLines"><div id="lines">' +
              '<div id="line0"></div><div id="line1"></div><div id="line2"></div>' +
              '<div id="line3"></div><div id="line4"></div><div id="line5"></div>' +
              '<div id="line6"></div><div id="line7"></div>' +
            '</div></div>' +
            '<div id="hill"></div><div id="hill2"></div>' +
            '<div id="tree"><div id="dcTree0"></div></div>' +
            '<div id="tree2"><div id="dcTree1"></div></div>' +
            '<div id="car">' +
              '<div id="windowsSection">' +
                '<div id="sunReflection"></div>' +
                '<div id="window"></div>' +
              '</div>' +
              '<div id="lightsSection">' +
                '<div id="lightStripe0"></div><div id="lightStripe1"></div>' +
                '<div id="lightStripe2"></div><div id="lightStripe3"></div>' +
                '<div id="lights1"></div>' +
                '<div id="lights2">' +
                  '<div id="tailLight1">' +
                    '<div id="tailLight1a"></div><div id="tailLight1b"></div>' +
                    '<div id="tailLight1c"></div><div id="tailLight1d"></div>' +
                    '<div id="cageLine0"></div><div id="cageLine1"></div>' +
                  '</div>' +
                  '<div id="logo"></div>' +
                  '<div id="tailLight0">' +
                    '<div id="tailLight0a"></div><div id="tailLight0b"></div>' +
                    '<div id="tailLight0c"></div><div id="tailLight0d"></div>' +
                    '<div id="cageLine0"></div><div id="cageLine1"></div>' +
                  '</div>' +
                '</div>' +
                '<div id="lights0"></div>' +
              '</div>' +
              '<div id="bumperSection">' +
                '<div id="bumper0"></div>' +
                '<div id="bumper1"></div>' +
                '<div id="bumper2">DRAGON</div>' +
                '<div id="bumper3">' +
                  '<div></div><div></div><div></div><div></div>' +
                  '<div></div><div></div><div></div><div></div>' +
                '</div>' +
                '<div id="exhaust0"></div>' +
                '<div id="exhaust1"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div id="fog2"></div>' +
          '<div id="cutout"></div>' +
        '</div>' +
      '</div>';
  }

  // ── Build CSS ─────────────────────────────────────────────────

  function _buildCSS() {
    return '' +
      '#deployCutsceneRoot {' +
        'position: fixed;' +
        'top: 0; left: 0; right: 0; bottom: 0;' +
        'z-index: 9999;' +
        'background: #000;' +
        'display: flex;' +
        'align-items: center;' +
        'justify-content: center;' +
        'transition: opacity ' + FADE_DURATION + 'ms ease-out;' +
        'opacity: 1;' +
      '}' +
      '#synthwave {' +
        'position: relative;' +
        'width: 600px;' +
        'height: 500px;' +
        'background-color: #2e0d3f;' +
        'transform: scale(1);' +
      '}' +
      '#sunReflection {' +
        'background-color: yellow;' +
        'height: 10px;' +
        'position: absolute;' +
        'width: 132px;' +
        'left: 50%;' +
        'transform: translate(-50%);' +
        'clip-path: polygon(0% 100%, 100% 100%, 98% 0%, 2% 0%);' +
        'top: -6px;' +
        'filter: blur(6px);' +
        'border-radius: 50%;' +
      '}' +
      '#window {' +
        'background-color: black;' +
        'height: 40px;' +
        'position: absolute;' +
        'width: 164px;' +
        'left: 50%;' +
        'transform: translate(-50%);' +
        'clip-path: polygon(0% 100%, 100% 100%, 93% 0%, 7% 0%);' +
        'top: -10px;' +
      '}' +
      '#logo {' +
        'position: absolute;' +
        'left: 50%;' +
        'transform: translate(-50%);' +
        'background-color: rgb(18, 18, 18);' +
        'width: 50px;' +
        'height: 16px;' +
        'border-radius: 4px;' +
        'bottom: 16px;' +
      '}' +
      '#lightsSection { z-index: 2; }' +
      '#lightStripe2, #lightStripe3 {' +
        'background-color: red;' +
        'width: 10px;' +
        'right: 98px;' +
        'height: 140px;' +
        'position: absolute;' +
        'filter: blur(12px);' +
        'border-radius: 50%;' +
        'top: -10px;' +
        'animation: dcBlinkLights infinite 2s;' +
      '}' +
      '#lightStripe0, #lightStripe1 {' +
        'background-color: red;' +
        'width: 10px;' +
        'left: 98px;' +
        'height: 140px;' +
        'position: absolute;' +
        'filter: blur(12px);' +
        'border-radius: 50%;' +
        'top: -10px;' +
        'animation: dcBlinkLights infinite 2s 1s;' +
      '}' +
      '#lightStripe0, #lightStripe2 { transform: rotate(30deg); }' +
      '#lightStripe1, #lightStripe3 { transform: rotate(-30deg); }' +
      '@keyframes dcBlinkLights {' +
        '0%, 49% { opacity: 1; }' +
        '50%, 100% { opacity: 0; }' +
      '}' +
      '#lights2 {' +
        'border: black solid 4px;' +
        'bottom: 10px;' +
        'position: absolute;' +
        'background-color: black;' +
        'left: 50%;' +
        'transform: translate(-50%);' +
        'height: 30px;' +
        'width: 224px;' +
        'clip-path: polygon(0% 100%, 100% 100%, 93% 0%, 7% 0%);' +
        'display: grid;' +
        'grid-template-columns: 70px 1fr 70px;' +
        'grid-template-rows: 1fr;' +
      '}' +
      '#cageLine0 {' +
        'background-color: black;' +
        'width: 100%;' +
        'height: 2px;' +
        'top: 6px;' +
        'position: absolute;' +
      '}' +
      '#cageLine1 {' +
        'background-color: black;' +
        'width: 100%;' +
        'height: 2px;' +
        'bottom: 6px;' +
        'position: absolute;' +
      '}' +
      '#tailLight1d {' +
        'background-color: rgb(116, 0, 0);' +
        'height: 100%;' +
        'width: 10px;' +
        'position: absolute;' +
        'left: 20px;' +
      '}' +
      '#tailLight0d {' +
        'background-color: rgb(116, 0, 0);' +
        'height: 100%;' +
        'width: 10px;' +
        'position: absolute;' +
        'right: 20px;' +
      '}' +
      '#tailLight0c {' +
        'clip-path: polygon(0% 100%, 100% 100%, 100% 0%, 5% 0%);' +
        'background-color: rgb(50, 0, 0);' +
        'height: 100%;' +
        'width: 38px;' +
        'position: absolute;' +
        'right: 8px;' +
      '}' +
      '#tailLight1c {' +
        'clip-path: polygon(0% 100%, 100% 100%, 95% 0%, 0% 0%);' +
        'background-color: rgb(50, 0, 0);' +
        'height: 100%;' +
        'width: 38px;' +
        'position: absolute;' +
        'left: 8px;' +
      '}' +
      '#tailLight0b {' +
        'clip-path: polygon(0% 100%, 100% 100%, 100% 0%, 5% 0%);' +
        'background-color: gray;' +
        'height: 100%;' +
        'width: 46px;' +
        'position: absolute;' +
        'right: 0;' +
      '}' +
      '#tailLight1b {' +
        'clip-path: polygon(0% 100%, 100% 100%, 95% 0%, 0% 0%);' +
        'background-color: gray;' +
        'height: 100%;' +
        'width: 46px;' +
        'position: absolute;' +
        'left: 0;' +
      '}' +
      '#tailLight0a {' +
        'clip-path: polygon(0% 100%, 100% 100%, 100% 0%, 5% 0%);' +
        'background-color: rgba(75, 75, 0, 0.658);' +
        'height: 100%;' +
        'width: 58px;' +
        'position: absolute;' +
        'right: 0;' +
      '}' +
      '#tailLight1a {' +
        'clip-path: polygon(0% 100%, 100% 100%, 95% 0%, 0% 0%);' +
        'background-color: rgba(75, 75, 0, 0.658);' +
        'height: 100%;' +
        'width: 58px;' +
        'position: absolute;' +
        'left: 0;' +
      '}' +
      '#tailLight0, #tailLight1 {' +
        'background-color: rgba(255, 255, 0, 0.46);' +
        'position: relative;' +
      '}' +
      '#tailLight0 {' +
        'clip-path: polygon(2% 100%, 100% 100%, 100% 0%, 20% 0%);' +
      '}' +
      '#tailLight1 {' +
        'clip-path: polygon(0% 100%, 98% 100%, 80% 0%, 0% 0%);' +
      '}' +
      '#lights1 {' +
        'position: absolute;' +
        'width: 75%;' +
        'height: 100%;' +
        'background-color: gray;' +
        'left: 50%;' +
        'transform: translate(-50%);' +
        'bottom: 8px;' +
        'clip-path: polygon(0% 100%, 100% 100%, 80% 0%, 20% 0%);' +
      '}' +
      '#lights0 {' +
        'position: absolute;' +
        'width: 246px;' +
        'height: 10px;' +
        'background-color: rgb(115, 115, 115);' +
        'left: 50%;' +
        'transform: translate(-50%);' +
        'bottom: -2px;' +
      '}' +
      '#exhaust1 {' +
        'position: absolute;' +
        'right: 25%;' +
        'width: 20px;' +
        'height: 20px;' +
        'background-color: black;' +
        'border-radius: 50%;' +
        'bottom: 20px;' +
      '}' +
      '#exhaust1::before {' +
        'content: "";' +
        'position: absolute;' +
        'left: 50%;' +
        'top: 70%;' +
        'transform: translate(-50%, -50%);' +
        'width: 14px;' +
        'height: 18px;' +
        'background-color: gray;' +
        'border-radius: 30%;' +
        'bottom: 16px;' +
      '}' +
      '#exhaust0 {' +
        'position: absolute;' +
        'left: 25%;' +
        'width: 20px;' +
        'height: 20px;' +
        'background-color: black;' +
        'border-radius: 50%;' +
        'bottom: 20px;' +
      '}' +
      '#exhaust0::before {' +
        'content: "";' +
        'position: absolute;' +
        'left: 50%;' +
        'top: 70%;' +
        'transform: translate(-50%, -50%);' +
        'width: 14px;' +
        'height: 18px;' +
        'background-color: gray;' +
        'border-radius: 30%;' +
        'bottom: 16px;' +
      '}' +
      '#bumper3 {' +
        'position: absolute;' +
        'left: 50%;' +
        'bottom: 46px;' +
        'transform: translate(-50%);' +
        'width: 200px;' +
        'height: 4px;' +
        'display: grid;' +
        'grid-template-columns: repeat(8, 1fr);' +
        'grid-template-rows: 1fr;' +
        'grid-column-gap: 10px;' +
      '}' +
      '#bumper3 div {' +
        'background-color: black;' +
        'border-radius: 10px;' +
      '}' +
      '#bumper2 {' +
        'background-color: black;' +
        'position: absolute;' +
        'left: 50%;' +
        'bottom: 24px;' +
        'transform: translate(-50%);' +
        'width: 220px;' +
        'height: 12px;' +
        'color: rgba(255, 255, 255, 0.7);' +
        'font-family: Verdana, Geneva, Tahoma, sans-serif;' +
        'font-weight: bold;' +
        'font-size: 11px;' +
        'letter-spacing: 6px;' +
        'text-align: center;' +
        'line-height: 12px;' +
      '}' +
      '#bumper1 {' +
        'background-color: black;' +
        'position: absolute;' +
        'left: 50%;' +
        'top: 2px;' +
        'transform: translate(-50%);' +
        'width: 242px;' +
        'height: 30%;' +
        'clip-path: polygon(2% 100%, 98% 100%, 100% 0%, 0% 0%);' +
      '}' +
      '#bumper0 {' +
        'clip-path: polygon(5% 100%, 95% 100%, 100% 0%, 0% 0%);' +
        'background-color: gray;' +
        'position: absolute;' +
        'left: 50%;' +
        'top: 0px;' +
        'transform: translate(-50%);' +
        'width: 74%;' +
        'height: 50px;' +
      '}' +
      '#bumperSection, #lightsSection, #windowsSection {' +
        'position: relative;' +
        'perspective: 1600px;' +
      '}' +
      '#car {' +
        'display: grid;' +
        'grid-template-columns: 1fr;' +
        'grid-template-rows: repeat(3, 1fr);' +
        'position: absolute;' +
        'height: 50%;' +
        'width: 55%;' +
        'left: 50%;' +
        'bottom: 0;' +
        'transform: translate(-50%);' +
        'animation: dcMovingCar infinite 4s;' +
      '}' +
      '@keyframes dcMovingCar {' +
        '0% { bottom: 0; transform: translate(-50%) scale(1); left: 50%; }' +
        '19% { bottom: 80px; transform: translate(-50%) scale(0); left: 23%; }' +
        '20% { bottom: -1200px; transform: translate(-50%) scale(2); left: 80%; }' +
        '30% { bottom: 0; transform: translate(-50%) scale(1); left: 50%; }' +
      '}' +
      '#cutout {' +
        'background-color: transparent;' +
        'width: 100%;' +
        'height: 100%;' +
        'position: absolute;' +
        'overflow: hidden;' +
        'top: 0; left: 0;' +
      '}' +
      '#cutout::before {' +
        'content: "";' +
        'position: absolute;' +
        'top: 50%;' +
        'left: 50%;' +
        'transform: translate(-50%, -50%);' +
        'width: 520px;' +
        'height: 450px;' +
        'background-color: transparent;' +
        'border-radius: 40px;' +
        'box-shadow: 0 0 0 2000px rgb(19, 19, 19);' +
      '}' +
      '#hill, #hill2 {' +
        'width: 200px;' +
        'height: 200px;' +
        'position: absolute;' +
        'top: 100px;' +
        'scale: 0.4;' +
      '}' +
      '#hill { right: 60px; }' +
      '#hill2 { left: 60px; transform: scaleX(-1); }' +
      '#tree {' +
        'position: absolute;' +
        'width: 240px;' +
        'height: 240px;' +
        'left: 55%;' +
        'transform: translateX(-100%);' +
        'bottom: 130px;' +
        'animation: dcMovingTree infinite 4s;' +
        'transform-origin: 50% 70%;' +
      '}' +
      '#tree2 {' +
        'position: absolute;' +
        'width: 240px;' +
        'height: 240px;' +
        'right: 55%;' +
        'transform: translateX(100%) scaleX(-1) rotate(8deg);' +
        'animation: dcMovingTree2 infinite 4s 0.5s;' +
        'bottom: 130px;' +
        'transform-origin: 50% 70%;' +
      '}' +
      '@keyframes dcMovingTree {' +
        '0% { transform: translateX(-100%) rotate(8deg); }' +
        '50% { transform: translateX(-100%) rotate(-8deg); }' +
        '100% { transform: translateX(-100%) rotate(8deg); }' +
      '}' +
      '@keyframes dcMovingTree2 {' +
        '0% { transform: translateX(100%) scaleX(-1) rotate(8deg); }' +
        '50% { transform: translateX(100%) scaleX(-1) rotate(-8deg); }' +
        '100% { transform: translateX(100%) scaleX(-1) rotate(8deg); }' +
      '}' +
      '#line1, #line2, #line3, #line4, #line5, #line6, #line7 {' +
        'border-radius: 20px;' +
        'background-color: #fcff1a;' +
        'animation: dcMovingLines infinite 0.5s linear;' +
      '}' +
      '@keyframes dcMovingLines {' +
        '0% { transform: translateY(0px); }' +
        '100% { transform: translateY(260px); }' +
      '}' +
      '#line0 {' +
        'border-radius: 20px;' +
        'background-color: #fcff1a;' +
        'animation: dcMovingLines0 infinite 0.5s linear;' +
      '}' +
      '@keyframes dcMovingLines0 {' +
        '0% { transform: translateY(0px); height: 0%; }' +
        '100% { transform: translateY(260px); height: 100%; }' +
      '}' +
      '#roadLines {' +
        'perspective: 1600px;' +
        'position: absolute;' +
        'left: 50%;' +
        'transform: translateX(-50%);' +
        'bottom: -850px;' +
        'width: 12px;' +
        'height: 2000px;' +
      '}' +
      '#lines {' +
        'transform: rotateX(85deg);' +
        'transform-origin: center;' +
        'box-shadow: 0 20px 40px rgba(252, 255, 26, 0.2);' +
        'display: grid;' +
        'grid-template-columns: 1fr;' +
        'grid-template-rows: repeat(8, 1fr);' +
        'grid-row-gap: 60px;' +
        'width: 100%;' +
        'height: 100%;' +
      '}' +
      '#sun {' +
        'overflow: hidden;' +
        'width: 240px;' +
        'height: 240px;' +
        'position: absolute;' +
        'top: 50%;' +
        'left: 50%;' +
        'transform: translate(-50%, -70%);' +
      '}' +
      '#ball {' +
        'width: 240px;' +
        'height: 240px;' +
        'border-radius: 50%;' +
        'background-color: #fbe54f;' +
      '}' +
      '#stripe0 { position: absolute; width: 100%; height: 0px; background-color: #2e0d3f; top: 20px; left: 50%; transform: translate(-50%); animation: dcStripe0 infinite 1s linear; }' +
      '@keyframes dcStripe0 { 0% { top: 20px; height: 0px; } 99% { top: 40px; height: 6px; } 100% { height: 0px; top: 20px; } }' +
      '#stripe1 { position: absolute; width: 100%; height: 6px; background-color: #2e0d3f; top: 40px; left: 50%; transform: translate(-50%); animation: dcStripe1 infinite 1s linear; }' +
      '@keyframes dcStripe1 { 0% { top: 40px; height: 6px; } 99% { top: 62px; height: 8px; } 100% { top: 40px; height: 6px; } }' +
      '#stripe2 { position: absolute; width: 100%; height: 8px; background-color: #2e0d3f; top: 62px; left: 50%; transform: translate(-50%); animation: dcStripe2 infinite 1s linear; }' +
      '@keyframes dcStripe2 { 0% { top: 62px; height: 8px; } 99% { top: 88px; height: 8px; } 100% { top: 62px; height: 8px; } }' +
      '#stripe3 { position: absolute; width: 100%; height: 8px; background-color: #2e0d3f; top: 88px; left: 50%; transform: translate(-50%); animation: dcStripe3 infinite 1s linear; }' +
      '@keyframes dcStripe3 { 0% { top: 88px; height: 8px; } 99% { top: 116px; height: 10px; } 100% { top: 88px; height: 8px; } }' +
      '#stripe4 { position: absolute; width: 100%; height: 10px; background-color: #2e0d3f; top: 116px; left: 50%; transform: translate(-50%); animation: dcStripe4 infinite 1s linear; }' +
      '@keyframes dcStripe4 { 0% { top: 116px; height: 10px; } 99% { top: 150px; height: 16px; } 100% { top: 116px; height: 10px; } }' +
      '#stripe5 { position: absolute; width: 100%; height: 16px; background-color: #2e0d3f; top: 150px; left: 50%; transform: translate(-50%); animation: dcStripe5 infinite 1s linear; }' +
      '@keyframes dcStripe5 { 0% { top: 150px; height: 16px; } 99% { top: 194px; height: 18px; } 100% { top: 150px; height: 16px; } }' +
      '#stripe6 { position: absolute; width: 100%; height: 18px; background-color: #2e0d3f; top: 194px; left: 50%; transform: translate(-50%); animation: dcStripe6 infinite 1s linear; }' +
      '@keyframes dcStripe6 { 0% { top: 194px; height: 18px; } 99% { top: 240px; height: 18px; } 100% { top: 194px; height: 18px; } }' +
      '#fog {' +
        'position: absolute;' +
        'top: 100px;' +
        'width: 100%;' +
        'height: 80%;' +
        'background-image: linear-gradient(transparent, #b811c6);' +
      '}' +
      '#fog2 {' +
        'position: absolute;' +
        'top: 298px;' +
        'width: 600px;' +
        'height: 1000px;' +
        'background-image: linear-gradient(transparent, #b711c63f);' +
        'transform: rotate(180deg);' +
      '}' +
      '#stars { position: absolute; width: 100%; height: 100%; }' +
      '#stars div { background-color: white; border-radius: 50%; position: absolute; }' +
      '#star0 { width: 4px; height: 4px; left: 40px; top: 20px; }' +
      '#star1 { width: 4px; height: 4px; left: 160px; top: 140px; }' +
      '#star2 { width: 4px; height: 4px; left: 70px; top: 180px; }' +
      '#star3 { width: 4px; height: 4px; left: 280px; top: 60px; }' +
      '#star4 { width: 4px; height: 4px; left: 80px; top: 100px; }' +
      '#star5 { width: 6px; height: 6px; left: 180px; top: 40px; }' +
      '#star6 { width: 6px; height: 6px; left: 140px; top: 240px; }' +
      '#star7 { width: 4px; height: 4px; right: 140px; top: 180px; }' +
      '#star8 { width: 6px; height: 6px; right: 20px; top: 100px; }' +
      '#star9 { width: 6px; height: 6px; right: 180px; top: 80px; }' +
      '#star10 { width: 6px; height: 6px; right: 90px; top: 40px; }' +
      '#star11 { width: 6px; height: 6px; right: 120px; top: 240px; }' +
      '#star12 { width: 6px; height: 6px; right: 100px; top: 120px; }' +
      '#star13 { width: 6px; height: 6px; right: 240px; top: 20px; }' +
      '#land {' +
        'width: 100%;' +
        'height: 40%;' +
        'bottom: 0;' +
        'position: absolute;' +
        'background-color: #120b12;' +
      '}' +
      '#roadSide0 {' +
        'position: absolute;' +
        'width: 340px;' +
        'height: 1660px;' +
        'perspective: 1600px;' +
        'bottom: -676px;' +
        'left: -140px;' +
      '}' +
      '#roadSideGrid0 {' +
        'border: solid #2afce0 6px;' +
        'width: 100%;' +
        'height: 100%;' +
        'background: linear-gradient(to right, #2afce0 2px, transparent 2px) 0 0 / 40px 40px,' +
                    'linear-gradient(to bottom, #2afce0 2px, #120b12 2px) 0 0 / 40px 40px;' +
        'transform: rotateX(85deg) rotateZ(10deg);' +
        'transform-origin: center;' +
        'box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);' +
        'animation: dcMovingGrid0 infinite 0.2s linear;' +
      '}' +
      '@keyframes dcMovingGrid0 {' +
        '0% { transform: rotateX(85deg) rotateZ(10deg) translateY(0px); }' +
        '99% { transform: rotateX(85deg) rotateZ(10deg) translateY(40px); }' +
        '100% { transform: rotateX(85deg) rotateZ(10deg) translateY(0px); }' +
      '}' +
      '#roadSide1 {' +
        'position: absolute;' +
        'width: 340px;' +
        'height: 1660px;' +
        'perspective: 1600px;' +
        'bottom: -676px;' +
        'right: -140px;' +
      '}' +
      '#roadSideGrid1 {' +
        'border: solid #2afce0 4px;' +
        'width: 100%;' +
        'height: 100%;' +
        'background: linear-gradient(to right, #2afce0 2px, transparent 2px) 0 0 / 40px 40px,' +
                    'linear-gradient(to bottom, #2afce0 2px, #120b12 2px) 0 0 / 40px 40px;' +
        'transform: rotateX(85deg) rotateZ(-10deg);' +
        'transform-origin: center;' +
        'box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);' +
        'animation: dcMovingGrid1 infinite 0.2s linear;' +
      '}' +
      '@keyframes dcMovingGrid1 {' +
        '0% { transform: rotateX(85deg) rotateZ(-10deg) translateY(0px); }' +
        '99% { transform: rotateX(85deg) rotateZ(-10deg) translateY(40px); }' +
        '100% { transform: rotateX(85deg) rotateZ(-10deg) translateY(0px); }' +
      '}';
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Play the deploy cutscene.
   * @param {Function} onComplete — called when cutscene finishes
   */
  function play(onComplete) {
    if (_active) return;
    _active = true;
    _onComplete = onComplete || function () {};

    // Inject CSS
    var style = document.createElement('style');
    style.id = 'deployCutsceneCSS';
    style.textContent = _buildCSS();
    document.head.appendChild(style);

    // Inject DOM
    var container = document.createElement('div');
    container.innerHTML = _buildHTML();
    _overlay = container.firstChild;
    document.body.appendChild(_overlay);

    // Allow skip on any key/click (after a brief delay to avoid accidental skip)
    setTimeout(function () {
      _skipHandler = function () { skip(); };
      document.addEventListener('keydown', _skipHandler);
      document.addEventListener('click', _skipHandler);
    }, 1500);

    // Schedule fade + teardown
    _timer = setTimeout(function () {
      // Begin fade out
      _overlay.style.opacity = '0';

      setTimeout(function () {
        _teardown();
        _active = false;
        _onComplete();
      }, FADE_DURATION);
    }, CUTSCENE_DURATION);
  }

  /**
   * Skip cutscene immediately (e.g., on keypress).
   */
  function skip() {
    if (!_active) return;
    if (_timer) clearTimeout(_timer);
    _teardown();
    _active = false;
    if (_onComplete) _onComplete();
  }

  function _teardown() {
    if (_skipHandler) {
      document.removeEventListener('keydown', _skipHandler);
      document.removeEventListener('click', _skipHandler);
      _skipHandler = null;
    }
    if (_overlay && _overlay.parentNode) {
      _overlay.parentNode.removeChild(_overlay);
    }
    var css = document.getElementById('deployCutsceneCSS');
    if (css) css.parentNode.removeChild(css);
    _overlay = null;
    _timer = null;
  }

  function isActive() {
    return _active;
  }

  // ── Return ────────────────────────────────────────────────────

  return Object.freeze({
    play: play,
    skip: skip,
    isActive: isActive
  });
})();
