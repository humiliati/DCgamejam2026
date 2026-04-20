# Build Version Policy (DOC-129)

Authored 2026-04-19 to close the playtester-feedback loop: when a tester reports a bug after pulling a fresh build, we need a trivial way to know *which build they played*.

## Problem

`engine/save-state.js` already carries `BUILD_VERSION = '0.14.2'` — a hand-maintained semver bumped on schema-breaking grid changes. It is load-bearing for save-compatibility logic (`TitleScreen` shows a "build mismatch" warning when a save's `buildVersion` differs from the running code). But:

1. It is only surfaced in save-mismatch warnings. A playtester with a clean save never sees it.
2. It does not change between semver bumps. Two playtesters on the same semver but different commits report identical strings.
3. It says nothing about the working-tree state at build time — dirty builds look identical to clean ones.

## Policy

Every build a playtester can pull embeds a `GameBuildStamp` surfaced in the UI. The stamp is generated from git at push time by `scripts/stamp-build.sh` / `.ps1` and writes `engine/game-build-stamp.js`. Playtesters cite the stamp's `display` string verbatim when reporting.

### Shape of the stamp

```js
window.GameBuildStamp = {
  commitHash:  'a1b2c3d',           // short SHA of HEAD
  commitDate:  '2026-04-19',        // author-commit date
  dirty:       false,               // uncommitted changes at stamp time
  semver:      '0.14.2',            // mirror of SaveState.BUILD_VERSION
  stampedAt:   '2026-04-19T14:22:08Z',
  display:     'build 0.14.2 · a1b2c3d · 2026-04-19'
};
```

The `display` string is the single thing we ask playtesters to report. It reads left-to-right as: semver, commit short-hash, commit date. A `+dirty` suffix attaches to the hash if the tree was not clean at stamp time.

### Load order

`engine/game-build-stamp.js` is Layer 0 (zero deps). It must load before `save-state.js`, `title-screen.js`, and any diagnostic code. Add its `<script>` tag in `index.html` immediately below the existing Layer 0 scripts (AudioSystem, i18n, TILES, SeededRNG). The script attaches `window.GameBuildStamp` synchronously — no async handshake.

## Developer workflow

**Before every `git push` that playtesters might pull:**

```sh
# POSIX
bash scripts/stamp-build.sh
git add engine/game-build-stamp.js
git commit --amend --no-edit        # (optional) fold into the current commit

# PowerShell
pwsh scripts/stamp-build.ps1
git add engine/game-build-stamp.js
git commit --amend --no-edit
```

Short form via the task runner / shell profile:

```sh
just stamp-build            # regenerate, do not commit
just stamp-and-commit       # regenerate + commit
dg-stamp-build              # shell-profile equivalent
```

The script is idempotent and fast (two `git` calls, one file write). Run it as often as you like.

### Fully automatic: pre-push hook

For teams who forget to stamp, wire the stamp into a `pre-push` hook:

```sh
# .git/hooks/pre-push (executable)
#!/usr/bin/env bash
bash "$(git rev-parse --show-toplevel)/scripts/stamp-build.sh"
if ! git diff-index --quiet HEAD -- engine/game-build-stamp.js; then
    echo "pre-push: build stamp changed. Amend and re-push." >&2
    exit 1
fi
```

This fails the push if a stamp was missed, forcing an amend. Not installed by default to keep the hook surface predictable — opt in via `git config core.hooksPath` or by copying into `.git/hooks/`.

## Playtester workflow

1. Pull the repo (or download the latest webOS `dist/` build).
2. Launch the game. The stamp shows on the title screen bottom-left and on the pause menu (see §UI integration).
3. When reporting a bug, quote the full `display` string.

A playtester who never navigates past the title screen still sees the stamp — it is rendered on the title's overlay corner.

## UI integration (recommended)

Not yet auto-wired into `title-screen.js` to keep this migration additive. When you are ready to surface the stamp in-game, the smallest-risk change is a new paint call at the end of `TitleScreen._renderPhase0` (or whichever phase serves as the persistent background):

```js
// At the bottom of the render function, after the main title paints.
var stamp = (typeof window !== 'undefined' && window.GameBuildStamp)
    ? window.GameBuildStamp.display
    : null;
if (stamp) {
    _ctx.save();
    _ctx.font = '11px monospace';
    _ctx.fillStyle = 'rgba(180,180,180,0.55)';
    _ctx.textAlign = 'left';
    _ctx.textBaseline = 'bottom';
    _ctx.fillText(stamp, 8, _canvas.height - 6);
    _ctx.restore();
}
```

Identical snippet in the pause menu's final render pass. Intentionally small, quiet, never interactive.

For the HUD-corner variant (while playing), add a conditional branch that only paints the stamp when a debug flag (`?build` URL param, or `localStorage['showBuildStamp']='1'`) is set — we do not want the stamp visible over gameplay on TV.

## Relationship to `SaveState.BUILD_VERSION`

- `SaveState.BUILD_VERSION` (semver) remains the authoritative **save-schema** version. Bump it when grids change shape, when the save serializer changes, etc.
- `GameBuildStamp.commitHash` is the authoritative **build identity** — unique per commit, trivial to grep git for.
- The stamp script reads `SaveState.BUILD_VERSION` and copies it into `GameBuildStamp.semver` so the two never disagree.

When a playtester reports `build 0.14.2 · a1b2c3d · 2026-04-19`, you can:

- `git show a1b2c3d` — see exactly which tree they ran.
- Compare against the current HEAD to know which fixes had / had not landed.
- Note the `+dirty` marker — if present, the maintainer shipped a tree with uncommitted changes. That is a release-hygiene bug; address separately.

## Known constraints

- **webOS dist bundles must include the stamp.** `scripts/build-webos.*` already whitelists `engine/`, so `engine/game-build-stamp.js` ships automatically — no whitelist edit needed. Verify by `ls <repo-root>/dist/engine/game-build-stamp.js` after a build.
- **Release branches and cherry-picks re-stamp.** The hash tracks the commit that *wrote* the stamp, not the branch's merge-base. Running `stamp-build` after cherry-pick, rebase, or merge produces a stamp that reflects the resulting HEAD, which is the thing playtesters ran.
- **Shallow clones work.** `git rev-parse --short HEAD` and `git show -s --format=%cs HEAD` both succeed on shallow clones.
- **CI-less environments are fine.** No CI is required; the developer runs the stamp script locally.

## Files

- `engine/game-build-stamp.js` — generated, committed, Layer-0 IIFE.
- `scripts/stamp-build.sh` / `.ps1` — generator.
- `justfile` recipe `stamp-build`.
- `scripts/dg-profile.{sh,ps1}` function `dg-stamp-build`.
- `docs/BUILD_VERSION_POLICY.md` — this doc.

## Cross-references

- `engine/save-state.js` §`BUILD_VERSION` — the semver side.
- `engine/title-screen.js` §`_loadSelectedSlot` — existing save-mismatch warning UI (untouched by this policy; the new stamp is complementary).
- `docs/CLI_TOOLS.md` (DOC-118) — where the stamp script is indexed.
- `docs/TOOLS_SHORT_ROADMAP.md` (DOC-128) Track B M2.5 — original `buildVersion` gate landing record.
