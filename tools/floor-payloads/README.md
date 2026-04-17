# tools/floor-payloads/

Per-floor sidecar payloads, keyed by floor id.

Two flavours coexist here:

1. **`<floorId>.json`** — §3.1 world-designer payload (biome palette,
   required cells, dimension budget, narrative hints). Consumed by
   blockout-visualizer when creating a floor and merged by
   `tools/extract-floors.js` into `floor-data.json[fid]._payload`.

2. **`<floorId>.quest.json`** — quest anchors for this floor. Merged by
   `tools/extract-floors.js` into `floor-data.json[fid].quests`. At
   runtime `QuestRegistry.init()` harvests these via
   `FloorManager.getQuestAnchors()` and unions them with the
   `anchors` block of `data/quests.json`.

The `.quest.json` flavour is separated so the quest CLI (`bo add-quest`,
`bo place-waypoint`, `bo validate-quest` — see tools/cli/commands-quest.js)
can author/validate quest data without touching the world-designer
payload, and vice versa.

## `.quest.json` schema (v1)

A sidecar may carry any combination of the following top-level blocks.
Every block is optional, but at least one must be present.

- **`anchors`** *(Phase 6)* — named anchors whose definition lives next
  to the floor data they describe. Shape matches
  `data/quests.json.anchors` exactly (`{ anchorId: spec }` where `spec`
  has a `type` discriminator — `'literal'`, `'floor-data'`, `'entity'`,
  `'npc'`, `'dump-truck'`, `'door-to'`). QuestRegistry unions these
  with the central anchors block at init; collisions abort the init
  with a loud error naming both sources.
- **`quests`** *(Phase 0b)* — per-floor quest definitions that are
  merged into `floorData[fid].quests`.

```jsonc
{
  "version": 1,
  "floorId": "1.3.1",             // REQUIRED; must match filename stem before ".quest"
  "anchors": {                     // Phase 6 — named anchors anchored to this floor
    "pentagram_chamber": {
      "type": "literal",
      "floorId": "1.3.1",
      "x": 14,
      "y": 8
    }
  },
  "quests": [
    {
      "id": "side.1_3_1.scrub_boiler",    // must match /^[a-z0-9_.-]+$/
      "kind": "side",                      // 'main' | 'faction' | 'side' | 'tutorial'
      "title": "quest.sidequest.scrub_boiler.title",   // i18n key, NOT raw text
      "hook":  "quest.sidequest.scrub_boiler.hook",
      "giver": { "npcId": "janitor_9", "floorId": "1.3" },
      "prereq": {
        "flags":          {},             // e.g. { "heroWakeArrival": true }
        "minReadiness":   null,           // e.g. 0.4 (0.0-2.0 scale)
        "minReputation":  {}              // e.g. { "mss": "friendly" }
      },
      "steps": [
        {
          "id": "step.1",
          "kind": "floor",                // matches QuestTypes.WAYPOINT_KIND
          "label": "quest.sidequest.scrub_boiler.step.1.label",
          "advanceWhen": {
            "kind": "floor",
            "floorId": "1.3.1",
            "x": 12,
            "y": 7,
            "radius": 1
          }
        }
      ],
      "rewards": {
        "gold":  25,
        "items": [],
        "favor": { "mss": 50 },
        "flags": {}
      },
      "markerColor": null                 // optional minimap override
    }
  ]
}
```

## Authoring workflow

1. `node tools/blockout-cli.js add-quest --floor 1.3.1 --id side.1_3_1.scrub_boiler --kind side --title quest.sidequest.scrub_boiler.title`
   — creates or updates `tools/floor-payloads/1.3.1.quest.json`.
2. `node tools/blockout-cli.js place-waypoint --floor 1.3.1 --quest side.1_3_1.scrub_boiler --step step.1 --at 12,7 --kind floor`
   — appends/updates the step's `advanceWhen` predicate.
3. `node tools/blockout-cli.js validate-quest --floor 1.3.1`
   — structural + referential checks (ids unique, tiles walkable, i18n keys declared).
4. `node tools/extract-floors.js`
   — merges the sidecar into `tools/floor-data.json[1.3.1].quests`
   and into the `window.FLOOR_DATA` sidecar used by world-designer.

All CLI commands honour `--dry-run` — they print the JSON they would
write to stdout without touching disk.

## Validation rules (v1)

- `floorId` must match the filename stem (e.g. `1.3.1.quest.json` → `"1.3.1"`).
- Every `quest.id` must be unique across the file AND across all other
  `.quest.json` payloads AND across `data/quests.json`.
- `quest.id` must pass `QuestTypes.isValidId()` — `/^[a-z0-9_.-]+$/`.
- `quest.kind` must be one of the `QuestTypes.KIND` values.
- Every `step.advanceWhen.kind` must match `QuestTypes.WAYPOINT_KIND`.
- For `kind: 'floor'` waypoints, the `(x, y)` cell must be in-bounds and walkable.
- Title / hook / step-label strings must be i18n keys — raw text is a warning.
