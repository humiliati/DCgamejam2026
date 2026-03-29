/**
 * BookshelfPeek — autonomous peek overlay for BOOKSHELF tiles.
 *
 * When the player faces a BOOKSHELF tile, a book/document overlay appears
 * after a short debounce. The content is drawn from data/books.json, assigned
 * to bookshelves via floorData.books[] (a per-floor array mapping grid
 * positions to book IDs).
 *
 * If no book is assigned at the facing position, a random biome-appropriate
 * book is selected from the catalog.
 *
 * Multi-page navigation: left/right arrow keys or A/D, Escape to close.
 *
 * Layer 2 — depends on: TILES, Player, MovementController, FloorManager,
 *           DialogBox (for rendering), AudioSystem
 */
var BookshelfPeek = (function () {
  'use strict';

  var MC = typeof MovementController !== 'undefined' ? MovementController : null;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY = 400;  // ms debounce before peek shows
  var HIDE_DELAY = 200;  // ms before peek hides after looking away

  // ── Book catalog (loaded from data/books.json) ──────────────────
  var _catalog = [];           // Array of book objects
  var _catalogById = {};       // id → book lookup
  var _catalogByBiome = {};    // biome → [book, book, ...]
  var _loaded = false;

  // ── State ───────────────────────────────────────────────────────
  var _active     = false;
  var _timer      = 0;
  var _hideTimer  = 0;
  var _facingX    = -1;
  var _facingY    = -1;
  var _currentBook = null;    // Currently displayed book object
  var _currentPage = 0;       // Current page index

  // ── Load catalog ────────────────────────────────────────────────

  function _loadCatalog() {
    if (_loaded) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/books.json', false); // Sync load at init
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) {
        var data = JSON.parse(xhr.responseText);
        _catalog = data.books || [];
        for (var i = 0; i < _catalog.length; i++) {
          var book = _catalog[i];
          _catalogById[book.id] = book;
          if (!_catalogByBiome[book.biome]) _catalogByBiome[book.biome] = [];
          _catalogByBiome[book.biome].push(book);
        }
        _loaded = true;
        console.log('[BookshelfPeek] Loaded ' + _catalog.length + ' books');
      }
    } catch (e) {
      console.warn('[BookshelfPeek] Failed to load books.json:', e);
      _loaded = true; // Prevent retry loops
    }
  }

  // ── Book resolution ─────────────────────────────────────────────

  /**
   * Resolve which book to display at grid position (x, y).
   * Priority: explicit floorData.books assignment → biome random → generic fallback.
   */
  function _resolveBook(fx, fy, floorData) {
    // 1. Check explicit assignment
    var books = floorData.books;
    if (books) {
      for (var i = 0; i < books.length; i++) {
        if (books[i].x === fx && books[i].y === fy) {
          var assigned = _catalogById[books[i].bookId];
          if (assigned) return assigned;
        }
      }
    }

    // 2. Biome-appropriate random
    var biome = floorData.biome || 'guild';
    var pool = _catalogByBiome[biome];
    if (pool && pool.length > 0) {
      // Seeded-ish: use position as a stable index so same shelf → same book
      var idx = ((fx * 7 + fy * 13) & 0x7fffffff) % pool.length;
      return pool[idx];
    }

    // 3. Any book
    if (_catalog.length > 0) {
      var fallbackIdx = ((fx * 7 + fy * 13) & 0x7fffffff) % _catalog.length;
      return _catalog[fallbackIdx];
    }

    return null;
  }

  // ── Show / Hide ─────────────────────────────────────────────────

  function _show(fx, fy, floorData) {
    if (_active) return;

    var book = _resolveBook(fx, fy, floorData);
    if (!book) return;

    _currentBook = book;
    _currentPage = 0;
    _active = true;
    _facingX = fx;
    _facingY = fy;
    _hideTimer = 0;

    if (typeof AudioSystem !== 'undefined') AudioSystem.play('page-turn');

    _renderPage();
  }

  function _hide() {
    if (!_active) return;
    _active = false;
    _currentBook = null;
    _currentPage = 0;
    _facingX = -1;
    _facingY = -1;

    // Dismiss the dialog if it was ours
    if (typeof DialogBox !== 'undefined' && DialogBox.isOpen()) {
      DialogBox.close();
    }
  }

  function _renderPage() {
    if (!_currentBook || typeof DialogBox === 'undefined') return;

    var book = _currentBook;
    var page = book.pages[_currentPage];
    var pageLabel = '— Page ' + (_currentPage + 1) + ' of ' + book.pages.length + ' —';
    var navParts = [];
    if (_currentPage > 0) navParts.push('[A] \u2190 Prev');
    if (_currentPage < book.pages.length - 1) navParts.push('[D] Next \u2192');
    navParts.push('[Esc] Close');
    var navHint = '\n\n' + navParts.join('   ');

    DialogBox.show({
      speaker: book.icon + ' ' + book.title,
      text: page + '\n\n' + pageLabel + navHint,
      instant: true,
      priority: 2 // PERSISTENT — stays until explicitly closed
    });
  }

  // ── Key handling ────────────────────────────────────────────────

  function handleKey(key) {
    if (!_active || !_currentBook) return false;

    if (key === 'KeyD' || key === 'ArrowRight' || key === 'KeyL') {
      if (_currentPage < _currentBook.pages.length - 1) {
        _currentPage++;
        if (typeof AudioSystem !== 'undefined') AudioSystem.play('page-turn');
        _renderPage();
      }
      return true;
    }
    if (key === 'KeyA' || key === 'ArrowLeft' || key === 'KeyJ') {
      if (_currentPage > 0) {
        _currentPage--;
        if (typeof AudioSystem !== 'undefined') AudioSystem.play('page-turn');
        _renderPage();
      }
      return true;
    }
    if (key === 'Escape') {
      _hide();
      return true;
    }
    return false;
  }

  // ── Update (per-frame) ──────────────────────────────────────────

  function update(dt) {
    if (!MC || typeof FloorManager === 'undefined') return;

    var floorData = FloorManager.getFloorData();
    if (!floorData) { if (_active) _hide(); return; }

    var p = Player.getPos();
    var dir = Player.getDir();
    var fx = p.x + MC.DX[dir];
    var fy = p.y + MC.DY[dir];

    // Out of bounds
    if (fx < 0 || fx >= floorData.gridW || fy < 0 || fy >= floorData.gridH) {
      if (_active) {
        _hideTimer += dt;
        if (_hideTimer >= HIDE_DELAY) _hide();
      } else {
        _timer = 0;
      }
      return;
    }

    var tile = floorData.grid[fy][fx];

    if (tile === TILES.BOOKSHELF) {
      _hideTimer = 0;
      if (_active && fx === _facingX && fy === _facingY) {
        // Already showing this bookshelf — keep it open
        return;
      }
      // New bookshelf or not yet active — debounce
      if (!_active || fx !== _facingX || fy !== _facingY) {
        _timer += dt;
        if (_timer >= SHOW_DELAY) {
          if (_active) _hide(); // Close old one first
          _show(fx, fy, floorData);
        }
      }
    } else {
      _timer = 0;
      if (_active) {
        _hideTimer += dt;
        if (_hideTimer >= HIDE_DELAY) _hide();
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    init: function () {
      _loadCatalog();
    },
    update: update,
    handleKey: handleKey,
    isActive: function () { return _active; },
    getBook: function () { return _currentBook; },
    getPage: function () { return _currentPage; }
  };
})();
