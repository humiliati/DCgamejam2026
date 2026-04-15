# Floor Reciprocity Bugs — Pass 5b.1 Findings

**Discovered by:** `tools/world-designer.html` (Pass 5b.1 DG-native viewer)
**Date:** 2026-04-14
**Status:** Open — design fix list (next/soon)

The world-designer renders an edge for every `doorTargets[coord] = dst`
entry and flags it **non-reciprocal (red dashed)** when `dst` has no
matching entry pointing back at the source. At load time the viewer
reports 19 floors / 34 edges / **2 reciprocity warnings**.

These warnings are not runtime-fatal — `FloorManager` falls back to
convention-based resolution for `STAIRS_UP` (parent) and `STAIRS_DN`
(child or next sibling), so both staircases currently warp correctly in
game. But the `doorTargets` map is supposed to be the authoritative,
self-describing adjacency graph. Gaps in it mean: (a) graph tools can't
validate the world without re-running convention logic; (b) a future
refactor of the fallback conventions would silently break these
staircases; (c) Minimap breadcrumb and any future pathfinder that reads
`doorTargets` directly will disagree with the runtime.

Fix both by adding explicit, reciprocal entries.

---

## Bug #1 — `2.2 ⇄ 2.2.1` (Watchman's Post ⇄ Hero's Wake B1)

**Missing edge:** `2.2 → 2.2.1` (descent half of the pair).

Floor `2.2.1` correctly lists its ascent:

```js
// engine/floor-blockout-2-2-1.js:252
doorTargets: { '11,21': '2.2' },
```

Floor `2.2` has the STAIRS_DN tile at grid `(9, 2)` (row 2, col 9 of the
18×14 grid; see line 43 and `stairsDn: { x: 9, y: 2 }` at line 83 of
`engine/floor-blockout-2-2.js`) but its `doorTargets` only declares the
DOOR_EXIT:

```js
// engine/floor-blockout-2-2.js:86
doorTargets: { '9,12': '2' },  // DOOR_EXIT → Lantern Row
```

### Fix

Add the descent entry to `2.2`:

```js
// engine/floor-blockout-2-2.js (replacement for line 86)
doorTargets: {
  '9,12': '2',       // DOOR_EXIT  → Lantern Row (parent)
  '9,2':  '2.2.1'    // STAIRS_DN  → Hero's Wake B1 (child)
},
```

---

## Bug #2 — `2.2.1 ⇄ 2.2.2` (Hero's Wake B1 ⇄ B2)

**Missing edge:** `2.2.1 → 2.2.2` (descent half of the pair).

Floor `2.2.2` correctly lists its ascent:

```js
// engine/floor-blockout-2-2-2.js:186
doorTargets: { '10,18': '2.2.1' },
```

Floor `2.2.1` has the STAIRS_DN tile at grid `(1, 1)` (north hall,
row 1, col 1 of the 24×24 grid; see line 77 and `stairsDn: { x: 1, y: 1 }`
at line 249 of `engine/floor-blockout-2-2-1.js`) but its `doorTargets`
only declares the STAIRS_UP back to the parent:

```js
// engine/floor-blockout-2-2-1.js:252
doorTargets: { '11,21': '2.2' },
```

### Fix

Add the descent entry to `2.2.1`:

```js
// engine/floor-blockout-2-2-1.js (replacement for line 252)
doorTargets: {
  '11,21': '2.2',    // STAIRS_UP  → Watchman's Post (parent)
  '1,1':   '2.2.2'   // STAIRS_DN  → Hero's Wake B2 (deeper sibling)
},
```

---

## Verification

After applying both fixes:

1. Re-run `node tools/extract-floors.js` to rebuild `floor-data.json`
   and the `floor-data.js` sidecar.
2. Open `tools/world-designer.html` and click **Reload Data**.
3. Summary pill should read **Warnings: 0**. All edges for the `2.2`
   branch render in the dungeon-purple and interior-blue tones — no
   red dashed mismatch lines.
4. In-game smoke test: descend from Watchman's Post to B1, then B1 to
   B2, and ascend back out. Both pairs should warp identically to
   pre-fix behaviour (the fallback was already correct; we're just
   making the schema self-describing).

## Related schema note

The world-designer's reciprocity check is intentionally strict: it
does **not** apply `FloorManager.parentId` / `childId` /
`nextSiblingId` fallbacks. That's the right default for a schema
linter — the graph should stand alone without runtime conventions.
If we ever add exterior↔exterior sibling doors (e.g. `"0" ⇄ "1"`),
those require explicit `doorTargets` entries on both sides anyway,
so the same rule holds.

If convention-based fallbacks are the project policy going forward,
we can relax the viewer to treat a `STAIRS_UP` with no explicit target
as "implicitly parent" and suppress the warning — but the better
direction is the one taken above: fill in the schema, keep the linter
strict.
