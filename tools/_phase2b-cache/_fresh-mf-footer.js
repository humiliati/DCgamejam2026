/**
 * Fresh-inode mirror of the MenuFaces footer block containing the
 * Phase 2.1b scroll functions + frozen-API exports.  Verbatim from
 * engine/menu-faces.js lines ~4864–4876 and ~5027–5035.
 *
 * Used by verify-phase2b.js G1 assertions because the bindfs read
 * cache serves stale content for menu-faces.js within the same
 * session (CLAUDE.md documents this).  Files created via the Write
 * tool bypass the cache.
 */

  // DOC-107 Phase 2 — completed-quests pane scroll (Journal Section 2b).
  // Clamp is deferred to _renderJournal() per the _bookScrollOffset pattern.
  function scrollQuestCompleted(delta) {
    _questCompletedScrollOffset = Math.max(0, _questCompletedScrollOffset + delta);
  }

  // DOC-107 Phase 2.1b — active-quests pane scroll (Journal Section 2).
  function scrollQuestActive(delta) {
    _questActiveScrollOffset = Math.max(0, _questActiveScrollOffset + delta);
  }

  // DOC-107 Phase 2.1b — failed-quests pane scroll (Journal Section 2c).
  function scrollQuestFailed(delta) {
    _questFailedScrollOffset = Math.max(0, _questFailedScrollOffset + delta);
  }

  // ---- frozen-API export block (tail of the MenuFaces IIFE) ----

    // Journal book scroll
    scrollBooks:          scrollBooks,

    // Journal completed-quests scroll (DOC-107 Phase 2)
    scrollQuestCompleted: scrollQuestCompleted,

    // Journal active + failed pane scroll (DOC-107 Phase 2.1b)
    scrollQuestActive:    scrollQuestActive,
    scrollQuestFailed:    scrollQuestFailed
