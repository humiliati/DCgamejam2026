# Verb-Node Overrides (DOC-110 P3 Ch.2 stretch)

Per-floor tweaks to the auto-derived verb-node registry produced by
`engine/dungeon-verb-nodes.js`. These overrides let you hand-tune depth
≥3 procgen dungeon floors without touching `data/verb-nodes.json`
(which is reserved for the hand-authored depth 1-2 floors loaded by
`engine/verb-node-seed.js`).

## Authoring

One JSON file per floor. **Filename must match `_meta.floorId`.**

```
tools/verb-node-overrides/
  2.2.1.json            ← override for floor "2.2.1"
  1.3.1.json            ← override for floor "1.3.1"
```

File shape (validated against `tools/verb-node-overrides-schema.json`):

```json
{
  "_meta": {
    "floorId":      "2.2.1",
    "description":  "Soft Cellar — bolt on a Tide faction_post near the entry",
    "generatedAt":  "2026-04-17T00:00:00Z",
    "schemaRef":    "tools/verb-node-overrides-schema.json"
  },
  "floorId": "2.2.1",

  "add": [
    { "id": "soft_cellar_tide_post",
      "type": "faction_post", "x": 5, "y": 7, "faction": "tide" }
  ],

  "remove": [
    "dvn_2.2.1_rest_4_4"
  ],

  "replace": [
    { "id": "dvn_2.2.1_8_3", "patch": { "type": "bulletin_board" } }
  ]
}
```

### Operation semantics

Applied **inside** `DungeonVerbNodes.populate()` in this order:

1. **replace** — mutate matching ids in the auto-derived list. Only
   `type`, `faction`, and `contested` can be patched; to move a node,
   `remove` + `add`.
2. **remove** — drop matching ids from the auto-derived list. Silent
   no-op if the id was never derived.
3. **add** — append new nodes. Ids must be unique within the floor
   (against both the surviving auto-derived nodes and other `add`
   entries).

## Pipeline

```
tools/verb-node-overrides/*.json     ← authored by hand (or BO-V in future)
            │
            ├── validator:  tools/validate-verb-node-overrides.js
            │               (schema + filename-matches-floorId + id-uniqueness)
            │
            ▼
tools/extract-verb-node-overrides.js ← normalise + bundle
            │
            ▼
data/verb-node-overrides.js          ← sidecar (auto-generated)
            │                          window.VERB_NODE_OVERRIDES_DATA
            ▼
engine/verb-node-overrides-seed.js   ← runtime loader
            │                          VerbNodeOverrides.apply(floorId, nodes)
            ▼
engine/dungeon-verb-nodes.js         ← calls apply() before VerbNodes.register
```

The pre-commit hook (§1e in `tools/.githooks/pre-commit`) validates +
regenerates the sidecar automatically when any file under this
directory is staged.

## Runtime behaviour

- If no override file exists for a floor, the auto-derivation runs
  unchanged — zero overhead.
- If an override file exists for a floor that never triggers
  auto-derivation (depth < 3, or `DungeonVerbNodes.populate` not
  called), the override is silently ignored — no error, no log spam.
- Overrides do **not** apply to hand-authored floors loaded via
  `VerbNodeSeed`. Edit `data/verb-nodes.json` directly for those.
- `remove` of an id that was never derived is a silent no-op (allows
  overrides to target eventual-consistency auto-scan output without
  needing exact alignment).

## Authoring a new override

```bash
# 1. Author the override JSON (use the example below or copy an existing file).
vim tools/verb-node-overrides/2.2.1.json

# 2. Validate (pre-commit does this automatically on stage).
node tools/validate-verb-node-overrides.js

# 3. Regenerate the sidecar (pre-commit does this automatically on stage).
node tools/extract-verb-node-overrides.js

# 4. Commit. Pre-commit gate confirms schema + filename + id uniqueness.
git add tools/verb-node-overrides/2.2.1.json data/verb-node-overrides.js
git commit -m "verb-nodes: add Tide faction_post override to soft_cellar"
```

## Files touched by this feature

| Path | Role |
|------|------|
| `tools/verb-node-overrides-schema.json` | Draft-07 schema for a single override file |
| `tools/verb-node-overrides-schema.js` | Generated sidecar (`window.VERB_NODE_OVERRIDES_SCHEMA`) |
| `tools/verb-node-overrides/*.json` | Per-floor authored overrides (this directory) |
| `tools/validate-verb-node-overrides.js` | CI + pre-commit validator |
| `tools/extract-verb-node-overrides.js` | Bundle + sidecar generator |
| `data/verb-node-overrides.js` | Runtime sidecar (`window.VERB_NODE_OVERRIDES_DATA`) |
| `engine/verb-node-overrides-seed.js` | Loader + `apply(floorId, nodes)` API |
| `engine/dungeon-verb-nodes.js` | Hook point inside `populate()` |
| `tools/.githooks/pre-commit` §1e | Automated validate + regen on stage |
