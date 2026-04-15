# DOC_GRAPH_BLOCKOUT_ARC.md — Document Graph for the Blockout Refresh Arc

**Purpose**: Visual map for a lower-context engineer getting delegated blockout work. Shows which docs to read before touching code, which specs govern the implementation, and what breaks (or unblocks) downstream when the blockout lands.

**Scope**: The blockout refresh arc only — *not* the whole docs/ corpus. For the full catalog, see `TABLE_OF_CONTENTS_CROSS_ROADMAP.md`.

**How to read**:

- **Solid arrow** (`-->`) = prerequisite / depends-on. Read the source node first.
- **Dashed arrow** (`-.->`) = informs / influences. Helpful context, not blocking.
- **Dotted arrow** (`..>`) = downstream consumer. Landing the blockout unblocks this work.

---

## The graph

```mermaid
flowchart LR
    %% ============ CENTER ============
    BRP["<b>BLOCKOUT_REFRESH_PLAN</b><br/>(this arc)"]:::center

    %% ============ PREREQUISITES ============
    subgraph PREREQ["Prerequisites — read first"]
        direction TB
        LIB["LIVING_INFRASTRUCTURE_BLOCKOUT<br/><i>living-shop/economy frame</i>"]:::prereq
        MGT["MINIGAME_TILES<br/><i>verb-node tile vocabulary 40-48</i>"]:::prereq
        BP["Biome Plan.html (v5)<br/><i>world/biome/enemy design doc</i>"]:::prereq
        BA["BLOCKOUT_ALIGNMENT<br/><i>grid/scale conventions</i>"]:::prereq
        ANO["ACT2_NARRATIVE_OUTLINE<br/><i>story beats the blockout serves</i>"]:::prereq
        SCN["STREET_CHRONICLES_NARRATIVE_OUTLINE<br/><i>faction + NPC roster</i>"]:::prereq
    end

    %% ============ IMPLEMENTATION SPEC ============
    subgraph SPEC["Implementation spec — read while coding"]
        direction TB
        DAR["DOOR_ARCHITECTURE_ROADMAP<br/><i>DOOR_FACADE + recess (§1.5)</i>"]:::spec
        TAR["TRAPDOOR_ARCHITECTURE_ROADMAP<br/><i>TRAPDOOR_DN/UP tiles 75/76</i>"]:::spec
        LWR["LIVING_WINDOWS_ROADMAP<br/><i>WINDOW_FACADE future tile</i>"]:::spec
        RER["RAYCASTER_EXTRACTION_ROADMAP<br/><i>7-IIFE split, freeform hotpath</i>"]:::spec
        SPC["SPATIAL_CONTRACTS<br/><i>tileFreeform / heights / offsets</i>"]:::spec
        PZD["PROXY_ZONE_DESIGN<br/><i>interior proxy + gap filler rules</i>"]:::spec
        WMR["WEATHER_MODULE_ROADMAP<br/><i>exterior depth-1 pass</i>"]:::spec
    end

    %% ============ CODE LEAF NODES ============
    subgraph CODE["Engine files touched"]
        direction TB
        C1["engine/raycaster.js<br/>+ 6 raycaster-* sub-modules"]:::code
        C2["engine/door-sprites.js"]:::code
        C3["engine/spatial-contract.js"]:::code
        C4["engine/floor-manager.js"]:::code
        C5["engine/tiles.js"]:::code
        C6["engine/building-registry.js"]:::code
    end

    %% ============ DOWNSTREAM CONSUMERS ============
    subgraph DOWN["Downstream — unblocked when blockout lands"]
        direction TB
        NRP["NPC_REFRESH_PLAN<br/><i>(pending DOC-103)</i>"]:::down
        D3A["D3_AI_LIVING_INFRA_PROCGEN_AUDIT"]:::down
        DCL["DEPTH3_CLEANING_LOOP_BALANCE"]:::down
        HFE["HERO_FOYER_ENCOUNTER"]:::down
        CZI["COZY_INTERIORS_DESIGN"]:::down
        F2B["FLOOR2_BLOCKOUT_PREP"]:::down
        F3B["floor3-crosshair-blockout"]:::down
    end

    %% ============ VERIFICATION / META ============
    subgraph META["Verification + coordination"]
        direction TB
        THR["TEST_HARNESS_ROADMAP"]:::meta
        SDO["SPATIAL_DEBUG_OVERLAY_VISION"]:::meta
        PBP["PLAYTEST_AND_BLOCKOUT_PROCEDURE"]:::meta
        DNS["DEBUG_NOTES_SCREENER"]:::meta
        TOC["TABLE_OF_CONTENTS_CROSS_ROADMAP<br/><i>full doc index</i>"]:::meta
        CRG["code-review-graph MCP<br/><i>detect_changes, query_graph,<br/>get_impact_radius</i>"]:::meta
    end

    %% ============ TOOLING ============
    subgraph TOOL["Tooling — the grid-cut surface"]
        direction TB
        BOV["Blockout Visualizer (BO-V)<br/><i>tools/blockout-visualizer.html<br/>window.BO.run + tools/blockout-cli.js</i>"]:::tool
        BOVR["tools/BO-V README.md<br/><i>agent workflows, save patcher,<br/>meta panel, help modal</i>"]:::tool
        BVR2["BLOCKOUT_VISUALIZER_ROADMAPv2<br/><i>Tier plan + short-roadmap.md</i>"]:::tool
    end

    %% ============ EDGES: prereq -> center ============
    LIB --> BRP
    MGT --> BRP
    BP --> BRP
    BA --> BRP
    ANO -.-> BRP
    SCN -.-> BRP

    %% ============ EDGES: spec -> center ============
    DAR --> BRP
    TAR --> BRP
    LWR -.-> BRP
    RER --> BRP
    SPC --> BRP
    PZD -.-> BRP
    WMR -.-> BRP

    %% ============ EDGES: spec -> code ============
    DAR --> C1
    DAR --> C2
    TAR --> C1
    RER --> C1
    SPC --> C3
    SPC --> C4
    LWR -.-> C5
    PZD -.-> C3

    %% ============ EDGES: center -> code ============
    BRP --> C1
    BRP --> C3
    BRP --> C4
    BRP --> C5
    BRP --> C6

    %% ============ EDGES: center -> downstream ============
    BRP ..> NRP
    BRP ..> D3A
    BRP ..> DCL
    BRP ..> HFE
    BRP ..> CZI
    BRP ..> F2B
    BRP ..> F3B

    %% ============ EDGES: meta side ties ============
    THR -.-> BRP
    SDO -.-> BRP
    PBP -.-> BRP
    DNS -.-> BRP
    CRG -.-> C1
    TOC -.-> BRP

    %% ============ EDGES: tooling ties ============
    BOV --> BRP
    BOVR -.-> BOV
    BVR2 -.-> BOV
    BOV -.-> C5
    BOV -.-> C4
    SPC -.-> BOV
    DAR -.-> BOV

    %% ============ STYLES ============
    classDef center fill:#fff2cc,stroke:#b58900,stroke-width:3px,color:#000
    classDef prereq fill:#dbeafe,stroke:#1e40af,stroke-width:1px,color:#000
    classDef spec fill:#e0f2e9,stroke:#15803d,stroke-width:1px,color:#000
    classDef code fill:#f3e8ff,stroke:#6b21a8,stroke-width:1px,color:#000
    classDef down fill:#ffe4e6,stroke:#9f1239,stroke-width:1px,color:#000
    classDef meta fill:#f1f5f9,stroke:#475569,stroke-width:1px,color:#000
    classDef tool fill:#fff7ed,stroke:#c2410c,stroke-width:1px,color:#000
```

---

## Reading order for a delegated engineer

1. **Orient** — skim this file + `TABLE_OF_CONTENTS_CROSS_ROADMAP.md` §Outstanding.
2. **Prereqs** (the blue cluster) — in order: `Biome Plan.html` → `LIVING_INFRASTRUCTURE_BLOCKOUT` → `MINIGAME_TILES` → `BLOCKOUT_ALIGNMENT`. Read `ACT2_NARRATIVE_OUTLINE` + `STREET_CHRONICLES` lightly for narrative intent.
3. **Spec** (the green cluster) — pull only the ones your slice touches. If you're on doors, it's `DOOR_ARCHITECTURE_ROADMAP` + `SPATIAL_CONTRACTS` + `RAYCASTER_EXTRACTION_ROADMAP`. If you're on trapdoors, swap in `TRAPDOOR_ARCHITECTURE_ROADMAP`.
4. **Before opening code** — hit `code-review-graph` MCP: `semantic_search_nodes` for the target subsystem, then `get_impact_radius` on functions you intend to edit. Cheaper than grep + safer than blind edits.
4.5. **Grid edits go through the tool, not by hand.** Open `tools/blockout-visualizer.html`, press `?` for the in-tool help, and read `tools/BO-V README.md` — the "What this tool is / isn't" and "Workflows for AI agents" sections. `Ctrl+S` patches `GRID`, `SPAWN`, and `doorTargets` in place. For headless edits, use `window.BO.run({action,...})` in the browser or `node tools/blockout-cli.js <action>`. Never hand-edit `engine/floor-blockout-*.js` arrays.
5. **Implement** — the purple cluster shows which engine files the blockout work generally touches. Not all slices touch all six.
6. **Verify** — `TEST_HARNESS_ROADMAP` + `PLAYTEST_AND_BLOCKOUT_PROCEDURE`. Use `SPATIAL_DEBUG_OVERLAY_VISION` patterns if you add overlays.
7. **Handoff** — update `DEBUG_NOTES_SCREENER` and flag any downstream-cluster docs (red) that now need a revision pass.

---

## Legend

| Cluster | Color | Meaning |
|---|---|---|
| Prerequisites | blue | Must-read before touching blockout |
| Implementation spec | green | Specs that govern what you write |
| Engine files | purple | Leaf nodes — the actual code |
| Downstream | red | Work that unblocks (or breaks) when this lands |
| Meta / verification | grey | Testing, overlays, procedure, coordination |
| Tooling | orange | Editor + CLI + agent API that produces the grid |
| **BLOCKOUT_REFRESH_PLAN** | **yellow** | **The arc this graph is centered on** |

---

## Maintenance

This graph is scoped to the blockout arc and should be updated when:

- A new prerequisite doc lands (add to blue cluster)
- A new spec is carved off `BLOCKOUT_REFRESH_PLAN` (add to green cluster)
- `NPC_REFRESH_PLAN` lands (promote DOC-103 from "pending" label)
- A downstream doc is completed — move it out of the red cluster and off this graph; it's no longer part of the arc

When the blockout arc closes out, archive this file alongside `BLOCKOUT_REFRESH_PLAN` and start a fresh arc graph for whatever comes next (likely NPC refresh → living economy).
