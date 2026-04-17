# BoxForge Agent Roadmap

**Created**: 2026-04-16
**Status**: Phase 0 (planning) — no slices shipped yet
**Sibling track**: `tools/short-roadmap.md` Track C (BO-V agent-feedback closeouts) — the blockout CLI is the template we mirror here
**Source tools**: `tools/boxforge.html` (canonical) and `tools/peek-workbench.html` (dev alias, kept in sync via `cp`)
**Goal**: make it possible to say "generate a 420×260×180 full-peek box for the cipher-lock puzzle with orb-in-lid and register it" and have the agent emit the CSS, scaffold the `engine/cipher-lock-peek.js` module, wire it into `PeekShell`, and hot-load it into a running game — end-to-end, without a human touching `boxforge.html` or hand-pasting a CSS string.

> **Read this first if you're picking up a slice**: §1 (today), §2 (target), §4 (phases) — §3 is the design rationale; §5 is cross-refs.

---

## 1. Where we are today

### 1.1 The tool

`tools/boxforge.html` is a 7,074-line single-file CSS-3D box editor (§ "What it does" in `tools/BF README.md`). It runs in any Chromium browser with no build step. It composes box shells, panes, glow sources, orb, pyramid, and phase animations across **P1/P2/P3/P4** states, and exports production CSS plus a `.boxforge.json` serialization.

What it already does well, grounded in the code:

- **Peek-type selector** (8 classifications: `none`, `full`, `action`, `step-on`, `face-passive`, `face-self`, `face-js`, `gated`) with phase-constraint enforcement via `PEEK_PHASE_MAP`. Wired April 8, 2026 — `docs/BOXFORGE_TOOLS_ROADMAP.md` §2.
- **JS Handoff** tag on P3 for minigames that bookend a dedicated JS module (field `jsHandoffModule` survives save/load; exported in CSS metadata header). `docs/BOXFORGE_NEXT_STEPS.md` §"JS Handoff Phase Sequence".
- **15 shipped templates** — Splash Cube, Chest, Bookshelf, Single Door, Double Doors, Crate, Torch, Torch (box), Corpse, Locked Door, Boss Door + Orb, Torch + Orb, Orb, Pyramid, Torch Peek (`tools/BF README.md` "Shipped templates").
- **Export pipeline** — `docs/BOXFORGE_AUDIT.md` (2026-04-07, re-verified 2026-04-09) closes all six bugs that were dropping alpha/biomeTag/wiring/lid-background/extra-pane-keyframes/wiring-summary on export. Nothing is silently lost anymore.
- **Public API** — `window.BoxForge.serialize()` and `window.BoxForge.load(data)` (`tools/BF README.md` "Public API"). This is the full keyhole we will build the CLI through.
- **Pane-to-Box** (April 9, 2026) — composite boxes (wardrobe = bookshelf+door, chest-of-drawers = chest+3 drawers) now compose natively without loose-pane assembly (`BOXFORGE_TOOLS_ROADMAP.md` §8).

### 1.2 The game integration today

A peek is a **`<name>-peek.js` module** under `engine/`. There are 17 of them:

`arch`, `bar-counter`, `bed`, `bookshelf`, `chest`, `corpse`, `crate`, `door`, `hose`, `locked-door`, `mailbox`, `merchant`, `monologue`, `peek-shell` (shared framework), `peek-slots`, `puzzle`, `torch`.

The wiring pattern, concretely (`engine/chest-peek.js` line 52):

```
// Chest variant CSS from BoxForge v1.0 — lines 1-414 from /tmp/chest_css.js
'.box3d-wrap.chest-variant {\n' +
  …
```

Every peek module pastes the BoxForge CSS export as a JS string literal, keyed on a `<variant>-variant` CSS class, then calls `PeekShell.register(tileId, descriptor)` in its IIFE tail. The descriptor schema is specified in `docs/PEEK_SYSTEM_ROADMAP.md` §2.1 (`variant`, `tileMatch`, `showDelay`, `openDelay`, `innerLabel`, `subLabel`, `glowColor`, `juice`, `buildContext`, lifecycle hooks). `PeekShell` owns facing-detect, debounce, lifecycle FSM, label layer, and juice layer.

Consequence: **shipping a new peek today is a four-step manual job** — author in BoxForge → copy CSS export → paste into a new `engine/<x>-peek.js` skeleton → hand-write the descriptor → add a `<script>` tag in `index.html`. The tool and the game know nothing about each other past the CSS string.

### 1.3 Peek status inventory

Grounded in `docs/INTERACTIVE_OBJECTS_AUDIT.md` and `docs/PEEK_SYSTEM_ROADMAP.md` §1:

| Peek | Tile | BoxForge template? | Module state | Notes |
|---|---|---|---|---|
| DoorPeek | DOOR / STAIRS / DOOR_BACK / DOOR_EXIT | Single Door, Double Doors | Shipped | direction label, target floor |
| LockedDoorPeek | LOCKED_DOOR | Locked Door | Shipped | shake + reshake loop |
| CratePeek | BREAKABLE | Crate | Shipped | "? LOOT ?" label, label z-order fix landed Apr 3 |
| ChestPeek | CHEST | Chest | Shipped | loot preview, unified-container semantics (INTERACTIVE_OBJECTS_AUDIT.md §CHEST) |
| BookshelfPeek | BOOKSHELF | Bookshelf | Shipped | title + snippet |
| BarCounterPeek | BAR_COUNTER | — | Shipped (no BoxForge template yet) | drink + effect preview |
| MerchantPeek | SHOP | — | Shipped (no BoxForge template yet) | faction + price hints |
| PuzzlePeek | PUZZLE | — | Shipped (no BoxForge template yet) | interactive sliding tiles |
| BedPeek | BED | — | Shipped (no BoxForge template yet) | rest / wake |
| ArchPeek | — | — | Shipped | architecture-only, no label |
| HosePeek | — | — | Shipped | pressure-wash state |
| MailboxPeek | MAILBOX | — | Shipped | dispatch view |
| MonologuePeek | — | — | Shipped | narration |
| **CorpsePeek** | CORPSE | Corpse | **⚠ broken (primitive)** | mirrors CratePeek shape but enemy-data binding is stale under rapid re-face; re-author via BoxForge targeted in Phase 3 |
| **TorchPeek** | TORCH_LIT / TORCH_UNLIT | Torch, Torch (box), Torch + Orb, Torch Peek | **⚠ broken (primitive)** | 3-slot fuel interior; phase transitions unstable under hose/water-bottle drop events. TORCH_LIT reclassified as context-gated peek on Apr 8 (`INTERACTIVE_OBJECTS_AUDIT.md`) — needs dual-variant rebuild in Phase 3 |

"Primitive" vs "shipped" is **not** currently surfaced anywhere in BoxForge — the 15 templates all look equally real in the dropdown. That's the first wart to fix (Phase 0).

### 1.4 The parallel precedent we're copying

The **blockout** side of the house already finished the agent-friendly treatment we need to mirror. See `tools/short-roadmap.md` Track C (sliced out of `tools/BO-V agent feedback.md`, the raw field report from a subagent who gave up on the CLI and hand-authored Floor 3.1.1). Five concrete blockers were named and closed:

1. **Slice C1 — `--dry-run` on every mutator.** `tools/blockout-cli.js` intercepts `saveFloors` at a single chokepoint; any mutating action gains dry-run for free and returns a JSON diff.
2. **Slice C2 — IIFE round-trip.** `bo ingest --from engine/floor-blockout-3-1-1.js` parses the IIFE back into `floor-data.json`; `bo emit --floor 3.1.1 --as iife` regenerates the file. One canonical state, two file formats, byte-identical round-trip.
3. **Slice C3 — `bo help <command>` + `bo help <command> --json`.** Metadata centralized in `tools/cli/help-meta.js`, dual-mode UMD (Node CLI + browser `window.BlockoutHelpMeta`). Never exits nonzero on unknown commands so scripted pipelines don't break.
4. **Slice C4 — Biome-specific stamps.** `stamp-tunnel-corridor`, `stamp-porthole-wall`, `stamp-alcove-flank`, composable via `bo apply-stamp --name <n>`.
5. **Slice C5 — IIFE-aware perception.** `render-ascii` and `describe-cell` transparently fall back to evaluating the IIFE source when `floor-data.json` doesn't have the floor yet.

The BoxForge track needs the same five primitives, pointed at peek modules instead of floor IIFEs. Where the bo CLI operates on `engine/floor-blockout-*.js`, the bf CLI will operate on `engine/<variant>-peek.js`. Where bo has `stamp-tunnel-corridor`, bf will have `stamp-chest`, `stamp-coffin`, `stamp-bookshelf`. Where bo has `bo ingest` / `bo emit`, bf will have `bf ingest` / `bf emit`.

---

## 2. Where we're going

**North star**: A user asks `"generate a 420×260×180 full-peek box for a cipher-lock puzzle, peek type face-js, handoff module CipherLock, orb-in-lid with the torch-ember palette, register it against TILES.PUZZLE_CIPHER"` — and the agent:

1. Parses the ask into a `.boxforge.json` project (§4.2).
2. Emits the CSS and scaffolds `engine/cipher-lock-peek.js` with the descriptor pre-filled (§4.3).
3. Registers the module in `index.html` and (for live sessions) calls `PeekShell.register` on an already-loaded page (§4.6).
4. Returns a test-harness URL that reaches the peek without a full playthrough (§4.5).

And all of that works for the ~30 peeks implied by `docs/MINIGAME_ROADMAP.md` (Tiers 1–6) without a human hand-porting CSS.

**Success is binary, per the CLAUDE.md rule**: a variant is either scope-complete (author → emit → scaffold → register → gallery entry visible → smoke test passes) or it doesn't ship. Half-peeks stay out of the registry.

---

## 3. Design rationale

**D1. Keep BoxForge single-file.** `tools/boxforge.html` stays one HTML file, no build tools, no external deps (§5 rule in `BOXFORGE_TOOLS_ROADMAP.md`). All automation lives in a sibling CLI (`tools/boxforge-cli.js` + `tools/cli/bf-*.js` modules) that talks to BoxForge via its JSON keyhole.

**D2. One chokepoint, many commands.** Mirror the `saveFloors` pattern from `blockout-cli.js`: every mutation flows through a single serialize/deserialize pair. `--dry-run` gates at the chokepoint so new commands inherit it for free (`short-roadmap.md` Track C1).

**D3. Variant name is the primary key.** Today a peek is identified by its CSS class (`.chest-variant`, `.door-variant`) and its module file (`engine/chest-peek.js`). Keep that convention. The CLI, the JSON descriptor, the module file, and the CSS class all use the same kebab-case variant name.

**D4. Game-integration is append-only at runtime.** Adding a peek must not require restarting the game. `PeekShell.register` already supports hot registration; the unshipped piece is a dev-mode URL flag (`?injectPeek=<url>`) that fetches the scaffold and calls `register` after the game boots.

**D5. Broken peeks get rebuilt in BoxForge, not patched in place.** CorpsePeek and TorchPeek are re-authored as BoxForge projects (with templates flagged "primitive — needs rebuild"), exported fresh, and their current `engine/*-peek.js` files replaced wholesale. This is the test that the pipeline actually works end-to-end.

**D6. Minigame-aware by construction.** Every `face-js` peek in BoxForge carries a `jsHandoffModule` string; the emit step wires that module's mount/unmount into the scaffold. The MINIGAME_ROADMAP Tiers 1–6 become a drivable checklist (Phase 6).

---

## 4. Phased plan

Slice sizes: roughly PR-sized. Exit criteria are per-phase, not overall. Don't skip ahead — each phase builds on the previous chokepoint.

### Phase 0 — Template status badges (~½ day) ✅ SHIPPED 2026-04-16

Make the gap between "shipped" / "primitive" / "broken" visible inside BoxForge so the designer isn't lied to by the template dropdown.

- [x] `TEMPLATE_STATUS` map lives next to the `TEMPLATES` registry in both `tools/boxforge.html` (15 templates) and `tools/peek-workbench.html` (17 — the 15 + `Dragonfire` + `Hearth + Dragonfire`, both classified as primitives).
- [x] Status chip renders in `renderTemplateBar()` — green (`#5ed66a`) for shipped, yellow (`#e8c14a`) for primitive, red (`#e85454`) for broken. Broken templates are also dimmed to 0.78 opacity; primitives render italic. Chip has a `title=` tooltip explaining each tier.
- [x] Seed values wired per §1.3: `Splash Cube / Chest / Bookshelf / Single Door / Double Doors / Crate / Locked Door / Boss Door + Orb` = shipped; `Torch / Torch (box) / Torch + Orb / Torch Peek / Corpse` = broken; `Orb / Pyramid / Dragonfire / Hearth + Dragonfire` = primitive.
- [x] `window.BoxForge.serialize()` now emits `templateName` + `templateStatus` fields. `window.BoxForge.templateStatus` (the raw map), `window.BoxForge.getTemplateStatus(name)`, and `window.BoxForge.listTemplates()` are exposed so the forthcoming `bf` CLI can query status without HTML scraping.

**Exit**: designer opens BoxForge → loads any template → status chip matches the §1.3 inventory. No functional changes to the editor. ✅

**Verified**: grep confirms all five touch-points (`TEMPLATE_STATUS`, `getTemplateStatus`, `.tpl-status` CSS, `renderTemplateBar` chip render, `serializeProject` + `window.BoxForge` surface) are present in both tool files.

### Phase 1 — Peek descriptor JSON schema (~½ day) ✅ SHIPPED 2026-04-16

Extend the `.boxforge.json` shape (was v2/v3, now **v4**) to carry everything the game needs to scaffold a peek module. No CLI yet; just schema + getters.

- [x] Added `descriptor` block to the serialized project: `{ variant, tileMatch, showDelay, openDelay, holdTime, innerLabelTpl, subLabelTpl, glowColor, labelColor, juice, buildContext, jsHandoffModule }`. Defaults sourced from `docs/PEEK_SYSTEM_ROADMAP.md` §2.1, plus per-template overrides in `PEEK_DESCRIPTOR_VARIANT_OVERRIDES` for shipped templates (Chest, Bookshelf, Single/Double/Locked/Boss Door, Crate, Corpse, Torch, Hearth + Dragonfire).
- [x] Added `meta` block: `{ status, audit, owner, lastVerified }`. `status` is sourced from Phase 0's `TEMPLATE_STATUS`; `audit` / `owner` / `lastVerified` start empty and are reserved for future UI + CLI edits.
- [x] Bumped `_version` from 3 → **4** in `tools/peek-workbench.html` (17 templates) and from 2 → 4 in `tools/boxforge.html` (15 templates). `v<4` migration fills `descriptor` + `meta` from defaults so pre-Phase-1 saves still load cleanly; peek-workbench binds the live `jsHandoffModule` editor state onto the descriptor.
- [x] `window.BoxForge.validate(data)` returns `{ ok, errors, warnings }`. Six helper functions split by concern: `_validateFormat`, `_validateShell`, `_validatePanes`, `_validateDescriptor` (checks juice enums ENTRY `fade|pop|slide-up|slam`, OPEN `swing|slide-off|flip|shatter`, HAPT `none|light|medium|heavy`), `_validateMeta` (status enum), `_validateCrossRefs` (templateStatus↔meta.status agreement, `peekType==='face-js'` requires `jsHandoffModule`).
- [x] JSON sidecar emitted on CSS export: `<variant>.boxforge.json` downloaded alongside the `.css` clipboard write. Button text momentarily flips to `Copied + JSON!`. Sidecar `_downloadSidecar(variantName)` wraps `serializeProject()` so the descriptor's `variant` field matches the sidecar filename even if the user typed a one-off name in the export prompt. Failure is non-blocking (try/catch).
- [x] `window.BoxForge` surface extended with `descriptorDefaults`, `descriptorOverrides`, `resolveDescriptor`, `buildMeta`, and `validate` in both files.

**Exit**: ✅ round-trip `load(serialize(x)) ≡ x` over every shipped template. `validate` passes on all 15 shared templates + the 2 wb-only primitives.

**Verified**: `node tools/boxforge-phase1-smoke.js` passes 8/8 checks — DEFAULTS identical across both files, 15 shared OVERRIDES agree byte-for-byte (Dragonfire + Hearth + Dragonfire correctly wb-only), resolveDescriptor idempotent, every template produces a validator-clean payload, JSON round-trip stable, validator rejects 5 intentionally-malformed payloads (null, bad format, negative delay, bad entryAnim enum, bad meta.status enum).

### Phase 2 — `bf` CLI scaffolding ✅ SHIPPED 2026-04-16

Mirror `tools/blockout-cli.js`. New files: `tools/boxforge-cli.js` (dispatcher) + `tools/cli/bf-*.js` (per-command modules) + `tools/cli/bf-help-meta.js` (dual-mode UMD).

- [x] `bf list-templates` → prints status + variant + dimensions for every template in the local `tools/templates/peeks/` directory (seeded with the 15 built-ins as `.boxforge.json` files extracted from BoxForge itself via `tools/cli/bf-seed-from-html.js`).
- [x] `bf describe --variant <name>` → prints descriptor block + shell dims + phase map + effects stack + inline `validateProject()` verdict, in human + `--json` forms.
- [x] `bf list-peeks` → scans `engine/*-peek.js`, reports variant name, line count, BoxForge provenance markers (`window.BoxForge`, `BoxForge`, `boxforge.html`, `BOXFORGE_AGENT_ROADMAP` — scanned in first 4KB), and whether a matching `.boxforge.json` exists. Flags: `--json`, `--orphans`.
- [x] `bf help` and `bf help <command>` + `bf help <command> --json` — mirrors `commands-help.js`, never exits nonzero on an unknown command.
- [x] Shared serialize/deserialize chokepoint in `tools/cli/bf-shared.js` with `setDryRun(true)` support so Phase 3's mutators get dry-run for free. `boxforge-cli.js` dispatcher wires `NO_LOAD` + `READ_ONLY` sets and prints a `{ dryRun, command, readOnly, saveCallsSuppressed, wouldChange:false }` envelope under `--dry-run` (no-op in Phase 2 since every command is read-only).

**Exit**: ✅ `bf list-templates`, `bf list-peeks`, `bf describe --variant chest` all return correct data on the current repo.

**Verified**:
- 15 `.boxforge.json` sidecars seeded into `tools/templates/peeks/` from `boxforge.html` built-ins via `tools/cli/bf-seed-from-html.js` (vm-sandbox extraction mirroring `boxforge-phase1-smoke.js`). All 15 pass `validateProject()` with 0 errors / 0 warnings.
- All four commands (`list-templates`, `describe`, `list-peeks`, `help`) return correct human + `--json` output on the current repo. Exit codes 0/1/2 verified for ok / usage-error / runtime-error paths.
- Phase 1 smoke test re-run — 8/8 still passing, no regression.
- Dispatcher structure mirrors `blockout-cli.js` exactly so Phase 3 ingest/emit mutators drop straight into the existing `--dry-run` plumbing.

### Phase 3 — Ingest / emit round-trip

This is the Slice C2 analogue. The canonical source is the `.boxforge.json` file; the `engine/<variant>-peek.js` module is a generated artifact that round-trips byte-identically.

Phase 3 was split mid-implementation into **3a (forward-only)** and **3b (legacy support + ship-gate)** to keep progress auditable. 3a establishes the pipeline against the 15 existing sidecars; 3b closes the loop on pre-Phase-3 hand-authored peeks and regenerates the two broken ones. The split follows CLAUDE.md's "cut features, don't cut corners" principle — every shipped slice is correct, not partial.

#### Phase 3a — Forward-only pipeline (BF-DATA round-trip) ✅ SHIPPED 2026-04-17

Ship the authoring pipeline end-to-end for sidecars we already own. Emitted peek modules carry their own sidecar JSON inside a `/* BF-DATA-START ... BF-DATA-END */` block, so `bf ingest` reads that block rather than decoding CSS. This proves the dispatcher plumbing, the sandbox harness, and the scaffold shape without blocking on the CSS decoder.

- [x] `tools/cli/bf-peek-sandbox.js` — VM sandbox for evaluating `engine/*-peek.js` headlessly. Stubs `PeekShell.register` (captures descriptors into an array), `TILES` (Proxy returning numeric codes), and ~20 engine globals on both top-level and `window.*` (peek IIFEs gate on `window.PeekShell`). Modeled on `tools/cli/iife-sandbox.js`. Exports `createPeekSandbox()`, `loadPeekModule(relPath)`, `extractBfData(src)`, and the shared `BF_DATA_RE`.
- [x] `tools/cli/bf-css-emit.js` — Pure-Node port of `boxforge.html#generateExportCSS` (~4914). `emitCSS(project, overrideName) → {css, pf}` and `emitHTML(project, overrideName) → string`. All math/string formatting copied verbatim; the one DOM reference (`esc()`) replaced with a regex HTML escape. Keeps state in the `project` parameter rather than module-level globals.
- [x] `bf emit --variant <v> [--as peek-module] [--out <path>] [--print] [--overwrite] [--dry-run]` — renders a deterministic IIFE scaffold using `PeekShell.register()`. Scaffold layout: banner → `ensureStyle()` (injects `<style id="bf-css-<variant>">` once) → `makeContentEl()` (creates host DOM with emitted HTML) → descriptor literal via stable-key `jsLit()` → `PeekShell.register(DESC)` → `BF-DATA` block at EOF.
- [x] `bf ingest --from <path> | --variant <v> [--print] [--overwrite] [--dry-run]` — extracts the BF-DATA block, validates via `validateProject()`, runs the peek through the vm-sandbox to capture the `PeekShell.register` descriptor (reports in `shellCheck`), and writes the sidecar via `S.savePeekFile()` (so `--dry-run` flows through the existing envelope).
- [x] Safety rails: both commands refuse to clobber existing targets unless the new output is byte-identical to what exists or `--overwrite` is passed. `--print` and `--dry-run` always short-circuit writes.
- [x] Dispatcher wiring (`tools/boxforge-cli.js`): ingest/emit composed into `COMMANDS` via `Object.assign()`, removed from the `READ_ONLY` set so their `--dry-run` output reports `wouldChange: true` and the count of save calls suppressed. `--help` banner updated to reference both.
- [x] `tools/boxforge-phase3a-smoke.js` — regression harness. For every sidecar in `tools/templates/peeks/`: emit to a tmp module, extract BF-DATA, deep-equal against the source, load the module through the sandbox, assert PeekShell.register was called with matching variant + tileMatch. Exits 0 only if all 15 pass.

**Exit** (met): all 15 sidecars (bookshelf, boss-door-plus-orb, chest, corpse, crate, double-doors, locked-door, orb, pyramid, single-door, splash-cube, torch-box, torch-peek, torch-plus-orb, torch) pass `boxforge-phase3a-smoke.js` with byte-stable round-trip and matching PeekShell capture.

**Verified 2026-04-17**:
- Dispatcher parses clean after heredoc-forced bindfs cache refresh: `node tools/boxforge-cli.js --help` lists all 6 commands (describe, emit, help, ingest, list-peeks, list-templates).
- Single-variant round-trip: `bf emit --variant crate --out /tmp/bf-test/crate-peek.js --overwrite` produces a 29 111-byte module (css=14 350, html=1 269). `bf ingest --from /tmp/bf-test/crate-peek.js --print` returns the BF-DATA block; stable-stringify comparison against the source sidecar matches byte-for-byte (6 256 bytes on both sides).
- `--dry-run` envelope: `bf ingest --from ... --dry-run` prints `saveCallsSuppressed: 1, wouldChange: true` and no file is written.
- Full 15-variant smoke: `node tools/boxforge-phase3a-smoke.js` prints "ALL 15 VARIANTS PASSED" in ~110 ms. Verbose run reports emitted module sizes ranging 13 380 – 29 111 bytes and PeekShell capture for every sidecar with a declared `tileMatch` (orb, pyramid, splash-cube have `tileMatch: null` — flagged as `-` in the smoke output, which is expected).
- PeekShell sandbox capture fix: engine globals now mirrored onto `sandbox.window.*` so the emitted `if (!window.PeekShell) return;` gate passes in headless mode. Previously captured zero registrations.

**Bindfs-cache workaround institutional memory**: three files this session required the `cat > path << 'EOF'` heredoc workaround after Edit/Write operations failed to bust the FUSE cache (`tools/boxforge-cli.js`, `tools/cli/bf-peek-sandbox.js`, `tools/boxforge-phase3a-smoke.js`). CLAUDE.md §"Sandbox mount gotcha" already documents this; worth re-reading before any bash-driven verification step on a mid-session-edited file.

#### Phase 3b — Legacy CSS decoder + ship-gate (deferred)

Still pending. 3a shipped the pipeline for sidecars we already have; 3b closes the loop for the three hand-authored peek modules predating the pipeline (`engine/chest-peek.js`, `engine/corpse-peek.js`, `engine/torch-peek.js`), which carry no BF-DATA block.

- [ ] CSS → descriptor decoder inside `bf-peek-sandbox.js` or a new `bf-css-decode.js`. Inverse of `emitCSS()`: parse the injected `<style>` body (or the CSS literal in the source), reconstruct shell dimensions, pane transforms, glow definitions, phase animations. Can lean on the vm-sandbox to harvest the live `PeekShell.register` descriptor for fields that CSS doesn't carry (showDelay, openDelay, juice, jsHandoffModule).
- [ ] `bf ingest --from engine/corpse-peek.js` should fall back to the CSS decoder when no BF-DATA block is present and still write a valid v4 sidecar. Add `--legacy` explicit opt-in to make the slow path discoverable.
- [ ] Rebuild **CorpsePeek** and **TorchPeek** via the pipeline — ingest the current hand-authored modules (CSS-decode path), author fixes in BoxForge or `.boxforge.json` directly, re-emit via `bf emit`. These two are the ship-gate: `INTERACTIVE_OBJECTS_AUDIT.md` §Torch / §Corpse lists the regressions; Phase 3b closes them.
- [ ] Round-trip regression extended: re-ingest every engine peek (including the three legacy ones after the CSS decoder lands), re-emit, byte-diff against the currently shipped file. Expected diff: zero modulo the generation timestamp in the banner comment.

**Exit**: every engine peek is either a `bf emit` artifact or round-trips cleanly through `bf ingest → bf emit`; `corpse-peek.js` and `torch-peek.js` are regenerated from sidecars rather than hand-maintained; INTERACTIVE_OBJECTS_AUDIT.md §Torch / §Corpse marks the peek regressions closed.

### Phase 4 — Agent-facing docs (~½ day)

Close the loop that `tools/BO-V agent feedback.md` did for blockout. The audience is a subagent who has never opened BoxForge.

- [ ] `docs/BOXFORGE_AGENT_INSTRUCTIONS.md` — structured doc covering: (a) the descriptor schema, (b) the variant-naming convention, (c) the peek-type decision tree (full vs. action vs. micro vs. face-js), (d) worked examples ("I want a chest-shaped peek" → exact CLI sequence), (e) common failure modes ("why P3 greyed out" → peek-type constraint), (f) the handoff contract for minigame bookends.
- [ ] `bf help --agent` prints the one-screen cheat sheet (variant naming, peek-type picker, common shell dims for recognizable objects).
- [ ] Cross-ref from `CLAUDE.md`, `agents.md`, `docs/PEEK_SYSTEM_ROADMAP.md` top-matter, and `docs/MINIGAME_ROADMAP.md` §1.

**Exit**: a fresh subagent, given only `BOXFORGE_AGENT_INSTRUCTIONS.md` + the `bf help <command>` outputs, emits a valid new peek (variant name of our choice) that round-trips through ingest and registers without game-side hand-edits.

### Phase 5 — Peek-primitive stamps (~2 days)

The Slice C4 analogue. `bf` needs ready-made starting primitives for the recurring shapes in the MINIGAME_ROADMAP + tile-schema roster so the agent doesn't start from Splash Cube every time.

**Foundation doc**: `docs/BOXFORGE_PEEK_COVERAGE_MATRIX.md` (DOC-112) — the canonical inventory of every tile that needs a peek, what primitive it derives from, and the stamp queue that unlocks it. Do not author a stamp without first reading the matrix's §5 priority queue and §3 gap inventory; skipping it risks inventing stamps that duplicate coverage or miss the trap/creature/economy families entirely. The matrix recognizes 12 stamp slots (7 primitive sidecars + 5 wired-archetype sidecars) that collectively cover 30 unwired tiles across furnishing, infra, creature, economy, light, and trap families.

Stamp authoring order below matches DOC-112 §5. Each stamp takes the named primitive sidecar as its parametric base, exposes the dimensional + tone knobs an agent would edit, and registers a `help-meta.js` entry with at least one worked example pulled from DOC-112 §3.

#### 5.0 Schema widen — trap + cobweb tiles (prerequisite)

Before the trap-family stamps can land, `tools/tile-schema.json` has to grow six new tile IDs per DOC-112 §6. The current schema ships only a generic `TRAP (8)` plus instant-hazard tiles (`FIRE 15`, `SPIKES 16`, `POISON 17`) that fire on step with no approach moment. Gleaner's cleanup narrative ("re-arm for the next delve") needs the mechanism-before-fire family instead.

- [ ] Add to `engine/tiles.js` (tile-schema.json is generated from this file via `tools/extract-floors.js`, so engine is authoritative). Current max ID is 96 (PORTHOLE_OCEAN); new family slots in at 97-102:
  - `97 TRAP_PRESSURE_PLATE` (hazard) — floor-level plate, `isWalkable: true`, `isOpaque: false`
  - `98 TRAP_DART_LAUNCHER` (hazard) — wall-mounted mechanism, `isWalkable: false`, `isOpaque: true`
  - `99 TRAP_TRIPWIRE` (hazard) — thin-strip floor tile, `isWalkable: true`, `isOpaque: false`
  - `100 TRAP_SPIKE_PIT` (hazard) — open pit in floor, `isWalkable: false` (until re-rigged), `isOpaque: false`
  - `101 TRAP_TELEPORT_DISC` (hazard) — floor rune, `isWalkable: true`, `isOpaque: false`
  - `102 COBWEB` (creature) — vertical translucent strands, `isWalkable: true`, `isOpaque: false`
- [ ] Mirror into the `T.isWalkable` / `T.isHazard` / `T.isOpaque` classification functions in `engine/tiles.js` (additive — do not remove anything existing).
- [ ] Update `T.isHazard` to include TRAP_PRESSURE_PLATE, TRAP_DART_LAUNCHER, TRAP_TRIPWIRE, TRAP_SPIKE_PIT, TRAP_TELEPORT_DISC. COBWEB is not a hazard — it's a creature-family obstacle.
- [ ] Regenerate `tools/tile-schema.json` via `node tools/extract-floors.js`. Expect `tileCount: 103, maxId: 102`.
- [ ] Append the six rows to `tools/biome-map.json` palettes where thematically appropriate (soft cellar, hero's wake, darker biomes). Biome additions can ship in a follow-up slice — the schema widen itself only needs the tiles to exist, not to be placed.
- [ ] Smoke: `node tools/extract-floors.js` still clean; BO-V `bo validate` still passes on the existing 11 floors (the new tiles are additive, not required).

**Exit**: `tile-schema.json` lists 103 tiles (was 97); `TILES.TRAP_PRESSURE_PLATE` et al resolve at runtime; no existing floor breaks.

#### 5.1 `stamp-braizer` — unlocks 6 peeks

Derived from the `torch-box` primitive. Box shell + top-mounted flame/glow pane. Covers every "fire-inside-a-vessel" archetype.

- [ ] Register `stamp-braizer` in `tools/cli/bf-stamps.js` with tunable `{ bw, bh, bd, flameColor, embersColor, lit: true|false, biomeTag }`. Recommended peek type: `context-gated` for ambient fires, `action` for the minigame bookends.
- [ ] Worked examples per DOC-112 §3: `HEARTH (29)`, `BONFIRE (18)`, `CITY_BONFIRE (69)`, `ANVIL (43)`, `SOUP_KITCHEN (47)`, `INCINERATOR (58)`.
- [ ] First shipped sidecar: `hearth.boxforge.json` (context-gated, lit/cold phase). Serves as the reference implementation for the rest of the family.

#### 5.2 `stamp-flat-sprite` — unlocks 9 peeks

Derived from the `corpse` sidecar. Flat horizontal plate + central sprite overlay. Covers any "low-silhouette object on the floor" family.

- [ ] Register `stamp-flat-sprite` with `{ plateW, plateH, spriteId, spriteTintHex, thickness, wearState }` plus optional `occupant` flag for triage-bed / bench variants.
- [ ] Worked examples: `TABLE (28)`, `BENCH (41)`, `COT (48)`, `NEST (50)`, `STRETCHER_DOCK (55)`, `TRIAGE_BED (56)`, `MORGUE_TABLE (57)`, `TRAP_PRESSURE_PLATE (84)`, `TRAP_TRIPWIRE (86)`.
- [ ] First shipped sidecar: `table.boxforge.json` (micro peek, cozy-quip toast). Second: `trap-pressure-plate.boxforge.json` (action peek, "Re-arm plate" label).

#### 5.3 `stamp-fixture-plus-orb` — unlocks 2 peeks

Derived from `torch-plus-orb`. Vertical fixture + floating orb. Covers "charged mechanism" archetype.

- [ ] Register `stamp-fixture-plus-orb` with `{ bw, bh, bd, orbColor, orbPulseRate, armatureStyle }`.
- [ ] Worked examples: `CHARGING_CRADLE (45)`, `ENERGY_CONDUIT (53)`.

#### 5.4 `stamp-vertical-fixture` — unlocks 4 peeks

Derived from `torch`. Bare vertical pane stack, no box shell. Covers anything that projects from a wall or mounts on a post.

- [ ] Register `stamp-vertical-fixture` with `{ postH, postW, topCapStyle, glowColor, mountFace }`.
- [ ] Worked examples: `WELL (40)`, `ROOST (49)`, `TRAP_DART_LAUNCHER (85)`, `COBWEB (89)`.
- [ ] Wall-mount variant for `TRAP_DART_LAUNCHER` + translucent-strand variant for `COBWEB` are both first-class knobs, not afterthoughts — DOC-112 §3.6 lists the UX tone.

#### 5.5 `stamp-bookshelf` — unlocks 2 peeks

Derived from `bookshelf`. Upright panel variant for routing/switchboard UIs.

- [ ] Register `stamp-bookshelf` with `{ shelfCount, panelMode: 'books'|'panel'|'arrangement' }`. Panel mode reuses the bookshelf shell but swaps the content layer.
- [ ] Worked examples: `SWITCHBOARD (46)` (panel mode), `NOTICE_BOARD (42)` (arrangement mode).

#### 5.6 `stamp-box-lidded` — unlocks 5 peeks

Derived from `crate` (generalized — not the same as `stamp-chest`, which stays as its own sidecar template for treasure chests). Covers container-with-lid archetype.

- [ ] Register `stamp-box-lidded` with `{ bw, bh, bd, lidHinge: 'top'|'front', staveTexture, interiorCavity }`.
- [ ] Worked examples: `BARREL (44)` (no-lid + stave texture), `DEN (51)` (interior-cavity variant), `REFRIG_LOCKER (59)`, `TRAP_SPIKE_PIT (87)` (open-pit variant), `TRAP_TRAPDOOR_RIG` (reusing `TRAPDOOR_DN (75)`).

#### 5.7 `stamp-pyramid-shrine` — unlocks 2 peeks

Derived from `pyramid`. Conic/tetrahedral shrine shape for altars, mounds, discs.

- [ ] Register `stamp-pyramid-shrine` with `{ baseW, apexH, glowColor, flatDiscMode }`. Flat-disc mode for floor-embedded variants (teleport runes).
- [ ] Worked examples: `FUNGAL_PATCH (52)`, `TRAP_TELEPORT_DISC (88)`.

#### 5.8 `stamp-splash-primitive` — scaffold + TERRITORIAL_MARK

Derived from `splash-cube`. Generic cube + splash/emit phase animation for micro peeks and new-tile scaffolds.

- [ ] Register `stamp-splash-primitive` with `{ bw, bh, bd, splashColor, splashShape: 'paw'|'rune'|'spatter' }`.
- [ ] Worked example: `TERRITORIAL_MARK (54)` (paw-print / faction sigil). Also serves as the fallback stamp for any future tile that doesn't cleanly fit the other 7.

#### 5.9 CLI plumbing

- [ ] `bf apply-stamp --name <stamp> --bw 420 --bh 260 --bd 180 --variant <x> [--out <path>]` outputs a fresh `.boxforge.json` with the shell dims substituted, ready for descriptor/glow tailoring. Must honor `--dry-run`.
- [ ] `bf list-stamps` + `bf list-stamps --json` surface the roster with their tunable knobs.
- [ ] `help-meta.js` entries for each stamp, each carrying at least one worked example from DOC-112 §3.
- [ ] Smoke harness `tools/boxforge-phase5-smoke.js` — for each stamp, apply it to a test tile, emit, ingest, assert validator-clean + round-trip stable.

**Exit**: agent prompt "give me a hearth at 360×300×180 with amber embers for floor 1.2" → `bf apply-stamp --name braizer --bw 360 --bh 300 --bd 180 --variant hearth` → `bf emit --variant hearth` → `engine/hearth-peek.js` exists, registers against `TILES.HEARTH`, round-trips through the Phase 3a smoke harness. Time from prompt to registered peek: under 60 seconds. All 8 stamps pass the Phase 5 smoke. DOC-112 §4 minigame checkboxes flip from ❌ to ✅ for the 16 stamp-covered bookends.

### Phase 6 — Runtime hot-load (~½ day)

Don't require a game restart to try a new peek. This is what turns the CLI from "build tool" into "live design partner."

- [ ] Dev-mode URL flag `?injectPeek=<variant>&src=<url-or-path>` in `engine/game.js` boot path. When set, after `PeekShell` initializes, fetch the peek-module source, `new Function(...)` evaluate it in an isolated scope, observe the resulting `PeekShell.register` call.
- [ ] `bf serve --variant <name> --port 8123` — tiny static file server that hosts the current `.boxforge.json` + its rendered `engine/<variant>-peek.js` so the game can fetch it.
- [ ] `bf register --variant <name>` — emits + serves + opens the game in a new tab with `?injectPeek=…` pre-wired.
- [ ] Gallery harness: extend `test-harness.html` to accept `?peek=<variant>` and spawn a floor with exactly one tile of the matching type plus the player spawned facing it. Modeled on the floor-level harness already supported via `?floor=3.1.1`.

**Exit**: `bf register --variant cipher_lock` opens the test harness, and the peek fires the first time the player walks up to the puzzle tile. No restart, no index.html edit.

### Phase 7 — MINIGAME_ROADMAP drive-through (~2–3 days, sequential)

With Phases 0–6 in place, plow the Tier 1 roster from `docs/MINIGAME_ROADMAP.md` §2. Stamp names match the DOC-112 §5 queue — Phase 7 consumes stamps authored in Phase 5, it does not introduce new primitives.

- [ ] `WELL_PUMP` → `stamp-vertical-fixture` + action-peek → register against `TILES.WELL` (40).
- [ ] `SOUP_LADLE` → `stamp-braizer` + action-peek → register against `TILES.SOUP_KITCHEN` (47).
- [ ] `ANVIL_HAMMER` → `stamp-braizer` + action-peek → register against `TILES.ANVIL` (43).
- [ ] `BARREL_TAP` → `stamp-box-lidded` (no-lid + stave variant) + action-peek → register against `TILES.BARREL` (44).
- [ ] `FUNGAL_HARVEST` → `stamp-pyramid-shrine` + action-peek → register against `TILES.FUNGAL_PATCH` (52).

Each lands as a `face-js` peek with the bookend P1→P2→[JS]→P4 contract from `BOXFORGE_NEXT_STEPS.md`. Tier 2 (Magic Remote showcase) and Tier 3 (card-reuse) follow with their own stamp set, drawn from the same 8-stamp roster — see DOC-112 §4 for the ✅/❌ checklist across all 16+ minigames.

**Exit**: all 5 Tier-1 minigames have live peeks that open via `bf register` and wire into their minigame-module JS handoff without hand-porting CSS. The gallery floor from `MINIGAME_ROADMAP.md` §6 shows all five. DOC-112 §4 flips those five rows to ✅.

### Phase 8 — Stretch / parked

- Full-pipeline CI smoke test — CI bot runs `bf ingest` → `bf emit` → diff on every shipped peek.
- Cross-face pane snap (deferred from `BOXFORGE_TOOLS_ROADMAP.md` §1 footnote) is now back on the table because agents will author fully programmatically and need geometric constraints solved rather than eyeballed.
- Audio-key autocomplete in the descriptor editor sourced from `AudioSystem` registry.
- Template tags (biome, peek type, input tier) for `bf list-templates --tag interior`.

---

## 5. Cross-references

- `tools/BF README.md` — BoxForge v2.0 user-facing readme, file manifest, public API, `.boxforge.json` v2 format.
- `tools/peek-workbench.html` / `tools/boxforge.html` — the tool itself (7,074 lines, kept in sync via `cp`).
- `tools/BO-V agent feedback.md` — the field report that drove the parallel blockout track. Same shape of gaps; read this before Phase 4.
- `tools/short-roadmap.md` Track C (C1–C5) — the exact precedent this roadmap mirrors. Slices we copy directly: `--dry-run` chokepoint (C1), ingest/emit IIFE round-trip (C2), `help <cmd>` UMD metadata (C3), biome-specific stamps (C4), IIFE-aware perception (C5).
- `docs/BOXFORGE_AUDIT.md` — 2026-04-07/09 export-pipeline all-clear. Baseline that Phases 1–3 must not regress.
- `docs/BOXFORGE_TOOLS_ROADMAP.md` — parent roadmap for the editor itself. This document extends it with agent/CLI concerns.
- `docs/BOXFORGE_NEXT_STEPS.md` — phase-mapping + JS handoff bookend semantics. Phase 7 consumes this directly.
- `docs/PEEK_SYSTEM_ROADMAP.md` — §2.1 descriptor schema, §2.2 lifecycle FSM. Phase 1 schema block inherits from here.
- `docs/PEEK_WORKBENCH_SCOPE.md` — known editor bugs (pyramid sliders lack dirty-label reset; glow locked in pyr-primary mode). Not blocking this roadmap but worth flagging when Phase 0 touches templates.
- `docs/MINIGAME_ROADMAP.md` — the ~30-peek workload the pipeline must serve (Phase 7 driver).
- `docs/INTERACTIVE_OBJECTS_AUDIT.md` — §Torch + §Corpse capture the current "broken" state that Phase 3 must close.
- `docs/BOXFORGE_PEEK_COVERAGE_MATRIX.md` (DOC-112) — canonical tile × peek × stamp inventory. Phase 5 reads this before authoring any stamp; schema widen (§5.0) is driven from §6, stamp ordering (§5.1–5.8) mirrors DOC-112 §5, and minigame coverage (Phase 7) is validated against DOC-112 §4.
- `engine/peek-shell.js` — `PeekShell.register`, lifecycle FSM, dwell detect. The runtime hot-load (Phase 6) attaches here.
- `engine/chest-peek.js` line 52 — canonical example of the "paste CSS + call register" pattern the pipeline generates.

---

## 6. Open questions

- **CSS → descriptor decoder fidelity.** The `bf ingest` step needs to parse BoxForge's export CSS back into a project. `generateExportCSS` is one-way today and carries metadata in `/* */` comments. Decision needed: do we commit to round-trippable CSS (preferred — keeps the JSON authoritative), or do we always emit CSS + sidecar JSON and use the JSON for ingest? Sidecar is easier and fits the `tools/floor-payloads/<id>.json` precedent from Track B M3.
- **Shell-dim grammar for agent prompts.** Is it `420x260x180` (compact) or `--bw 420 --bh 260 --bd 180` (explicit)? Pick one and enforce across stamps and `bf edit`.
- **Hot-reload security.** `?injectPeek=<url>` is dev-only. Phase 6 needs a CSP-compatible path and a refusal to run in production builds.
- **Multi-variant peeks.** Torch has lit and unlit sharing a module. Does the pipeline treat those as one `.boxforge.json` with two descriptor entries or two separate files with a shared shell reference? Lean toward the former — it matches the context-gated peek type.
- **Naming: `bf` vs `boxforge-cli`.** The dispatcher file is `tools/boxforge-cli.js` (mirrors `tools/blockout-cli.js`), but the binary-name in examples is `bf` for typeability. Document the alias once and stay consistent.
