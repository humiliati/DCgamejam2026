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
  var _catalogByCategory = {}; // category → [book, book, ...]
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
          if (book.category) {
            if (!_catalogByCategory[book.category]) _catalogByCategory[book.category] = [];
            _catalogByCategory[book.category].push(book);
          }
        }
        _loaded = true;
        console.log('[BookshelfPeek] Loaded ' + _catalog.length + ' books');
      } else {
        // Non-200/non-0 status (e.g. 404, 403) — mark loaded to prevent
        // infinite retries, but log the failure for debugging.
        console.warn('[BookshelfPeek] books.json returned status ' + xhr.status + '; shelves will use biome fallback');
        _loaded = true;
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

    // 2. Terminal tiles prefer terminal-category entries
    var tile = floorData.grid[fy] ? floorData.grid[fy][fx] : 0;
    if (tile === TILES.TERMINAL && _catalogByCategory && _catalogByCategory['terminal']) {
      var tPool = _catalogByCategory['terminal'];
      if (tPool.length > 0) {
        var tIdx = ((fx * 11 + fy * 17) & 0x7fffffff) % tPool.length;
        return tPool[tIdx];
      }
    }

    // 3. Biome-appropriate random
    var biome = floorData.biome || 'guild';
    var pool = _catalogByBiome[biome];
    if (pool && pool.length > 0) {
      // Seeded-ish: use position as a stable index so same shelf → same book
      var idx = ((fx * 7 + fy * 13) & 0x7fffffff) % pool.length;
      return pool[idx];
    }

    // 4. Any book
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

    // Track this book as read
    if (typeof Player !== 'undefined' && book.id) {
      Player.setFlag('book_read_' + book.id, true);
    }

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
    var isCRT = book.category === 'terminal' || book.category === 'diagnostic';
    var page = book.pages[_currentPage];
    var pageLabel;
    var navParts = [];

    if (isCRT) {
      // CRT terminal style: green monospace feel, record/entry numbering
      pageLabel = '[RECORD ' + (_currentPage + 1) + '/' + book.pages.length + ']';
      if (_currentPage > 0) navParts.push('[A] << PREV');
      if (_currentPage < book.pages.length - 1) navParts.push('[D] NEXT >>');
      navParts.push('[W/S] SCROLL');
      navParts.push('[BACK] DISCONNECT');
      page = '> ' + page.replace(/\n/g, '\n> '); // CRT prompt prefix
    } else {
      pageLabel = '- Page ' + (_currentPage + 1) + ' of ' + book.pages.length + ' -';
      if (_currentPage > 0) navParts.push('[A] \u2190 Prev');
      if (_currentPage < book.pages.length - 1) navParts.push('[D] Next \u2192');
      navParts.push('[W/S] Scroll');
      navParts.push('[Back] Close');
    }

    var navHint = '\n\n' + navParts.join('   ');

    DialogBox.show({
      speaker: (isCRT ? '\uD83D\uDDA5\uFE0F ' : '') + book.icon + ' ' + book.title,
      text: page + '\n\n' + pageLabel + navHint,
      instant: true,
      priority: 2, // PERSISTENT — stays until explicitly closed
      style: isCRT ? 'terminal' : undefined
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
    // Vertical scroll within a long page (W/S or ArrowUp/ArrowDown).
    // Delegates to DialogBox.scroll which no-ops when the page fits.
    if (key === 'KeyW' || key === 'ArrowUp' || key === 'KeyI') {
      if (typeof DialogBox !== 'undefined' && DialogBox.scroll) {
        DialogBox.scroll(-1);
      }
      return true;
    }
    if (key === 'KeyS' || key === 'ArrowDown' || key === 'KeyK') {
      if (typeof DialogBox !== 'undefined' && DialogBox.scroll) {
        DialogBox.scroll(+1);
      }
      return true;
    }
    if (key === 'PageUp') {
      if (typeof DialogBox !== 'undefined' && DialogBox.scroll) DialogBox.scroll(-5);
      return true;
    }
    if (key === 'PageDown') {
      if (typeof DialogBox !== 'undefined' && DialogBox.scroll) DialogBox.scroll(+5);
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

    if (tile === TILES.BOOKSHELF || tile === TILES.TERMINAL) {
      // Yield to MailboxPeek on shared terminal positions (home mail station).
      // MailboxPeek takes priority — if it's showing, we stay dormant.
      if (typeof MailboxPeek !== 'undefined' && MailboxPeek.isShowing && MailboxPeek.isShowing()) {
        _timer = 0;
        if (_active) _hide();
        return;
      }

      _hideTimer = 0;
      if (_active && fx === _facingX && fy === _facingY) {
        // Already showing this bookshelf/terminal — keep it open
        return;
      }
      // New bookshelf/terminal or not yet active — debounce
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

  /** Force-hide the peek overlay. */
  function forceHide() { _hide(); }

  return {
    init: function () {
      _loadCatalog();
    },
    update: update,
    handleKey: handleKey,
    isActive: function () { return _active; },
    getBook: function () { return _currentBook; },
    getPage: function () { return _currentPage; },
    getCatalog: function () { return _catalog; },
    getBookById: function (id) { return _catalogById[id] || null; },
    forceHide: forceHide,

    /**
     * Immediately open the book peek for the bookshelf at (fx, fy).
     * Called by game.js on OK press — bypasses the autonomous 400ms debounce.
     * @param {number} fx - Grid x of the BOOKSHELF tile
     * @param {number} fy - Grid y of the BOOKSHELF tile
     * @returns {boolean} true if a book was shown
     */
    tryShow: function (fx, fy) {
      if (_active && fx === _facingX && fy === _facingY) return true; // already showing this one
      if (_active) _hide(); // close a different book first
      var floorData = (typeof FloorManager !== 'undefined') ? FloorManager.getFloorData() : null;
      if (!floorData) return false;
      if (!_loaded) _loadCatalog(); // last-ditch retry if init() missed
      _show(fx, fy, floorData);
      return _active;
    },

    /**
     * Check if a bookshelf at grid position (x, y) has any resolvable book.
     * Used by InteractPrompt to show a non-interactive state for empty shelves.
     * @param {number} fx - Grid x
     * @param {number} fy - Grid y
     * @returns {boolean}
     */
    hasBook: function (fx, fy) {
      if (!_loaded) return false;
      var floorData = (typeof FloorManager !== 'undefined') ? FloorManager.getFloorData() : null;
      if (!floorData) return false;
      return !!_resolveBook(fx, fy, floorData);
    },

    /**
     * Register the book catalog from a JS data file (Layer 5).
     * Called by data/books.js at load time — eliminates the XHR dependency
     * that fails silently on file:// in Chromium-based browsers.
     * @param {object} data - The parsed books.json structure ({ books: [...] })
     */
    registerCatalog: function (data) {
      var books = data.books || data || [];
      if (!Array.isArray(books)) books = [];
      _catalog = books;
      _catalogById = {};
      _catalogByBiome = {};
      _catalogByCategory = {};
      for (var i = 0; i < _catalog.length; i++) {
        var book = _catalog[i];
        _catalogById[book.id] = book;
        if (!_catalogByBiome[book.biome]) _catalogByBiome[book.biome] = [];
        _catalogByBiome[book.biome].push(book);
        if (book.category) {
          if (!_catalogByCategory[book.category]) _catalogByCategory[book.category] = [];
          _catalogByCategory[book.category].push(book);
        }
      }
      _loaded = true;
      console.log('[BookshelfPeek] Registered ' + _catalog.length + ' books via script');
    }
  };
})();
