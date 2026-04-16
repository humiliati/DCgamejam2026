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

### Phase 2 — `bf` CLI scaffolding (~1 day)

Mirror `tools/blockout-cli.js`. New files: `tools/boxforge-cli.js` (dispatcher) + `tools/cli/bf-*.js` (per-command modules) + `tools/cli/bf-help-meta.js` (dual-mode UMD).

- [ ] `bf list-templates` → prints status + variant + dimensions for every template in the local `tools/templates/peeks/` directory (new — seed with the 15 built-ins as `.boxforge.json` files extracted from BoxForge itself).
- [ ] `bf describe --variant <name>` → prints descriptor block + shell dims + phase map in human + `--json` forms.
- [ ] `bf list-peeks` → scans `engine/*-peek.js`, reports variant name, line count, BoxForge provenance comment (`// from BoxForge v1.0` etc.), and whether a matching `.boxforge.json` exists.
- [ ] `bf help` and `bf help <command>` + `bf help <command> --json` — mandatory per D2, never exits nonzero on an unknown command.
- [ ] Shared serialize/deserialize chokepoint in `tools/cli/bf-shared.js` with `setDryRun(true)` support so Phase 3's mutators get dry-run for free.

**Exit**: `bf list-templates`, `bf list-peeks`, `bf describe --variant chest` all return correct data on the current repo.

### Phase 3 — Ingest / emit round-trip (~1–1½ days)

This is the Slice C2 analogue. The canonical source is the `.boxforge.json` file; the `engine/<variant>-peek.js` module is a generated artifact that round-trips byte-identically.

- [ ] `tools/cli/bf-peek-sandbox.js` — VM sandbox for evaluating `<variant>-peek.js` files headlessly, stubbing `PeekShell.register` + `TILES` so we can harvest the descriptor + CSS string without running the game. Modeled on `tools/cli/iife-sandbox.js` (Slice C2).
- [ ] `bf ingest --from engine/chest-peek.js` — parses the CSS string literal, reconstructs a `.boxforge.json` project via a CSS→descriptor decoder (inverse of `generateExportCSS`), writes to `tools/templates/peeks/chest.boxforge.json`. Also parses the descriptor block.
- [ ] `bf emit --variant chest --as peek-module --out engine/chest-peek.js` — renders the `.boxforge.json` into a complete `engine/<variant>-peek.js` using a deterministic scaffold template (mirrors `tools/cli/emit-iife.js` from Slice C2).
- [ ] `--overwrite` / `--dry-run` / `--print` flags on both commands; emit under `--dry-run` prints only the payload metadata.
- [ ] Round-trip regression test: for every shipped peek, `bf ingest` → `bf emit` → diff against the original `engine/*-peek.js`. Expected diff = zero modulo a provenance comment line.
- [ ] Rebuild **CorpsePeek** and **TorchPeek** via the pipeline — author in BoxForge, emit, wire. These two are the ship-gate: if `bf emit` can't produce the working versions of these two from scratch, the pipeline is wrong.

**Exit**: every shipped peek round-trips; corpse-peek.js and torch-peek.js are regenerated artifacts rather than hand-written files; `INTERACTIVE_OBJECTS_AUDIT.md` §Torch / §Corpse marks the peek regressions closed.

### Phase 4 — Agent-facing docs (~½ day)

Close the loop that `tools/BO-V agent feedback.md` did for blockout. The audience is a subagent who has never opened BoxForge.

- [ ] `docs/BOXFORGE_AGENT_INSTRUCTIONS.md` — structured doc covering: (a) the descriptor schema, (b) the variant-naming convention, (c) the peek-type decision tree (full vs. action vs. micro vs. face-js), (d) worked examples ("I want a chest-shaped peek" → exact CLI sequence), (e) common failure modes ("why P3 greyed out" → peek-type constraint), (f) the handoff contract for minigame bookends.
- [ ] `bf help --agent` prints the one-screen cheat sheet (variant naming, peek-type picker, common shell dims for recognizable objects).
- [ ] Cross-ref from `CLAUDE.md`, `agents.md`, `docs/PEEK_SYSTEM_ROADMAP.md` top-matter, and `docs/MINIGAME_ROADMAP.md` §1.

**Exit**: a fresh subagent, given only `BOXFORGE_AGENT_INSTRUCTIONS.md` + the `bf help <command>` outputs, emits a valid new peek (variant name of our choice) that round-trips through ingest and registers without game-side hand-edits.

### Phase 5 — Peek-primitive stamps (~1 day)

The Slice C4 analogue. `bf` needs ready-made starting primitives for the recurring shapes in the MINIGAME_ROADMAP roster so the agent doesn't start from Splash Cube every time.

- [ ] `stamp-chest`, `stamp-crate`, `stamp-coffin`, `stamp-bookshelf`, `stamp-door` (single/double), `stamp-locked-door`, `stamp-torch-bracket`, `stamp-terminal`, `stamp-button-panel`, `stamp-card-table`, `stamp-pane-to-box-composite` — each a parametric shell + pane layout keyed on dimensions, registered in `tools/cli/bf-stamps.js`.
- [ ] `bf apply-stamp --name chest --bw 420 --bh 260 --bd 180 --variant golden_chest` outputs a fresh `.boxforge.json` with the shell dims substituted, ready for descriptor/glow/orb tailoring.
- [ ] Stamp metadata carries the recommended peek type (chest → full, torch-bracket → context-gated, button-panel → action).
- [ ] `help-meta.js` entries for each, with a worked example per stamp.

**Exit**: agent prompt "give me a 420×260×180 chest with an amber orb in the lid" → `bf apply-stamp --name chest --bw 420 --bh 260 --bd 180` → `bf edit …` → `bf emit` without touching `boxforge.html`. Time from prompt to registered peek: under 60 seconds.

### Phase 6 — Runtime hot-load (~½ day)

Don't require a game restart to try a new peek. This is what turns the CLI from "build tool" into "live design partner."

- [ ] Dev-mode URL flag `?injectPeek=<variant>&src=<url-or-path>` in `engine/game.js` boot path. When set, after `PeekShell` initializes, fetch the peek-module source, `new Function(...)` evaluate it in an isolated scope, observe the resulting `PeekShell.register` call.
- [ ] `bf serve --variant <name> --port 8123` — tiny static file server that hosts the current `.boxforge.json` + its rendered `engine/<variant>-peek.js` so the game can fetch it.
- [ ] `bf register --variant <name>` — emits + serves + opens the game in a new tab with `?injectPeek=…` pre-wired.
- [ ] Gallery harness: extend `test-harness.html` to accept `?peek=<variant>` and spawn a floor with exactly one tile of the matching type plus the player spawned facing it. Modeled on the floor-level harness already supported via `?floor=3.1.1`.

**Exit**: `bf register --variant cipher_lock` opens the test harness, and the peek fires the first time the player walks up to the puzzle tile. No restart, no index.html edit.

### Phase 7 — MINIGAME_ROADMAP drive-through (~2–3 days, sequential)

With Phases 0–6 in place, plow the Tier 1 roster from `docs/MINIGAME_ROADMAP.md` §2:

- [ ] `WELL_PUMP` → `stamp-pump` + full-peek → register against `TILES.WELL` (40).
- [ ] `SOUP_LADLE` → `stamp-cauldron` → register against `TILES.SOUP_KITCHEN` (47).
- [ ] `ANVIL_HAMMER` → `stamp-anvil` → register against `TILES.ANVIL` (43).
- [ ] `BARREL_TAP` → `stamp-barrel` → register against `TILES.BARREL` (44).
- [ ] `FUNGAL_HARVEST` → `stamp-fungal-patch` → register against `TILES.FUNGAL_PATCH` (52).

Each lands as a `face-js` peek with the bookend P1→P2→[JS]→P4 contract from `BOXFORGE_NEXT_STEPS.md`. Tier 2 (Magic Remote showcase) and Tier 3 (card-reuse) follow with their own stamp set.

**Exit**: all 5 Tier-1 minigames have live peeks that open via `bf register` and wire into their minigame-module JS handoff without hand-porting CSS. The gallery floor from `MINIGAME_ROADMAP.md` §6 shows all five.

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
- `engine/peek-shell.js` — `PeekShell.register`, lifecycle FSM, dwell detect. The runtime hot-load (Phase 6) attaches here.
- `engine/chest-peek.js` line 52 — canonical example of the "paste CSS + call register" pattern the pipeline generates.

---

## 6. Open questions

- **CSS → descriptor decoder fidelity.** The `bf ingest` step needs to parse BoxForge's export CSS back into a project. `generateExportCSS` is one-way today and carries metadata in `/* */` comments. Decision needed: do we commit to round-trippable CSS (preferred — keeps the JSON authoritative), or do we always emit CSS + sidecar JSON and use the JSON for ingest? Sidecar is easier and fits the `tools/floor-payloads/<id>.json` precedent from Track B M3.
- **Shell-dim grammar for agent prompts.** Is it `420x260x180` (compact) or `--bw 420 --bh 260 --bd 180` (explicit)? Pick one and enforce across stamps and `bf edit`.
- **Hot-reload security.** `?injectPeek=<url>` is dev-only. Phase 6 needs a CSP-compatible path and a refusal to run in production builds.
- **Multi-variant peeks.** Torch has lit and unlit sharing a module. Does the pipeline treat those as one `.boxforge.json` with two descriptor entries or two separate files with a shared shell reference? Lean toward the former — it matches the context-gated peek type.
- **Naming: `bf` vs `boxforge-cli`.** The dispatcher file is `tools/boxforge-cli.js` (mirrors `tools/blockout-cli.js`), but the binary-name in examples is `bf` for typeability. Document the alias once and stay consistent.
