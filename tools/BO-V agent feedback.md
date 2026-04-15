Floor 3.1.1 (Sealab Depths) shipped at engine/floor-blockout-3-1-1.js and registered in index.html right after floor-blockout-3-1.js. Layout hits every showcase tile:

STAIRS_UP at (10,2) → doorTargets '10,2': '3.1' (back to Armory stair alcove)
Spawn (10,3) facing south — player lands one tile south of stairs, looking into the base
Row 3 — two PILLAR (10) singletons for scale reference
Row 4 — BONFIRE at (9,4) for overheal checkpoint
Rows 6, 8, 14 — PORTHOLE_OCEAN (96) windows punched into side walls so the ocean-skybox filler renders flanking both the porthole gallery and the terminal chamber
Row 7 — two PILLAR_QUAD (88) at (8,7) and (10,7), flanking the gallery centerline
Rows 10–13 — TUNNEL_RIB (94) pressure corridor, 3-wide at the mouths narrowing to a 1-wide walkway with ribbed freeform flanks
Rows 15 & 17 — TUNNEL_WALL (95) alcove faces framing a terminal chamber with a central TABLE (28)
Rows 1–2 — two BOOKSHELF (25) supply lockers seeded with Ironhold lore books

Test harness URL: test-harness.html?debug=1&floor=3.1.1.
Blockout workflow trial — honest report
What I tried. Authored 3.1.1 raw (edited engine/floor-blockout-3-1-1.js directly, modeled on floor-blockout-2-2-1.js). Did not drive the CLI / visualizer for this floor after the recon pass exposed the blockers below.
Why raw won this time.

The CLI has no --dry-run and no preview-before-commit step. Every mutating command writes floor-data.json immediately. For a 20×20 hand-designed layout with flow requirements (spawn line-of-sight, pillar pairing, alcove symmetry) I need to iterate in seconds and undo cheaply. Editing a prettier-ignored 2D array in one file gives me that; the CLI would force a commit-then-revert loop.
The canonical state diverges. Hand-authored floors live in engine/floor-blockout-*.js and register via FloorManager.registerFloorBuilder. The visualizer/CLI operate on floor-data.json. There is no documented round-trip: if I blockout via CLI I get a JSON artifact the engine doesn't read for this pipeline, and I'd still have to transcribe it into an IIFE. That's two sources of truth and a manual conversion.
No per-command --help. blockout-cli.js list lists commands but descriptions are one-liners. For paint, stamp, set-spawn the arg grammar (--name vs --ref, coordinate order, whether --tile wants a TILES constant name or a numeric ID) isn't discoverable without reading the module source.
Stamps are solid. single-room, two-room-corridor, cellar-3x3-grid are genuinely useful primitives. For a symmetric submarine base I wanted ribbed corridor, porthole gallery, alcove terminal — none exist. A stamp library keyed to the new tiles (TUNNEL_RIB run, PORTHOLE_OCEAN pair, TUNNEL_WALL alcove-flank-3) would make the CLI competitive with raw authoring for this kind of dungeon.
render-ascii is the one output I actively want. Being able to eyeball a layout in text before loading the harness is exactly what a headless agent needs. But right now it's stuck reading floor-data.json, so it won't render a hand-authored IIFE floor.

What would unblock agent-driven blockout.

A bo ingest --from engine/floor-blockout-X.js round-trip that parses the GRID array into floor-data.json, and a reciprocal bo emit --as iife that writes a fresh IIFE. One source of truth, CLI works for both pipelines.
--dry-run on every mutator, returning the ASCII diff the command would produce.
bo help <command> printing arg grammar, accepted tile-name forms, and one worked example per command.
A bo validate that checks: spawn is walkable, every stairs has a doorTargets entry, room rects don't contain wall tiles, every freeform-tile depth matches the contract's tileWallHeights table. Right now I eyeball all four of those.
Stamp expansion: tunnel-corridor --len N, porthole-wall --side L|R --span N, alcove-flank --count N. The existing stamps prove the primitive works.

Net. Raw authoring took ~8 minutes for 3.1.1 with full confidence. CLI-driven would have been slower on this one and produced a JSON artifact I'd still have to hand-port. The tooling isn't broken — it's aimed at a different pipeline (proc-gen composed dungeons via JSON) than the hand-authored IIFE pipeline. Bridging those is the highest-leverage improvement.
Deferred (acknowledged): the tower-under-Floor-3 underwater dungeon remains a future floor — not built this pass.