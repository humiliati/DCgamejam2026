<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

---

## Document Graph (for docs/, not code)

The code-review-graph above indexes code only. For navigating the **docs/**
corpus — especially when picking up a delegated slice of the blockout arc —
use the Mermaid document graph:

- **`docs/DOC_GRAPH_BLOCKOUT_ARC.md`** — visual map centered on
  `BLOCKOUT_REFRESH_PLAN` with five clusters:
  - **Prerequisites** (blue): LIVING_INFRASTRUCTURE_BLOCKOUT, MINIGAME_TILES,
    Biome Plan.html, BLOCKOUT_ALIGNMENT, ACT2_NARRATIVE_OUTLINE, STREET_CHRONICLES
  - **Implementation spec** (green): DOOR_ARCHITECTURE_ROADMAP,
    TRAPDOOR_ARCHITECTURE_ROADMAP, LIVING_WINDOWS_ROADMAP,
    RAYCASTER_EXTRACTION_ROADMAP, SPATIAL_CONTRACTS, PROXY_ZONE_DESIGN,
    WEATHER_MODULE_ROADMAP
  - **Engine files** (purple): raycaster.js + sub-modules, door-sprites.js,
    spatial-contract.js, floor-manager.js, tiles.js, building-registry.js
  - **Downstream** (red): NPC_REFRESH_PLAN, D3_AI_LIVING_INFRA_PROCGEN_AUDIT,
    DEPTH3_CLEANING_LOOP_BALANCE, HERO_FOYER_ENCOUNTER, COZY_INTERIORS_DESIGN,
    FLOOR2_BLOCKOUT_PREP, floor3-crosshair-blockout
  - **Meta** (grey): TEST_HARNESS_ROADMAP, SPATIAL_DEBUG_OVERLAY_VISION,
    PLAYTEST_AND_BLOCKOUT_PROCEDURE, DEBUG_NOTES_SCREENER, TOC, code-review-graph

Edge semantics: solid = prerequisite, dashed = informs, dotted = downstream.
Renders natively in GitHub and VS Code preview.

**Arc-scoped, not corpus-wide.** The full doc index lives in
`docs/TABLE_OF_CONTENTS_CROSS_ROADMAP.md` (DOC-104 registers the graph).
Archive `DOC_GRAPH_BLOCKOUT_ARC.md` when the arc closes and start a fresh
arc graph for the next cluster (likely NPC refresh → living economy).

### Workflow for delegated blockout work

1. Open `docs/DOC_GRAPH_BLOCKOUT_ARC.md` — orient on where your slice sits.
2. Read the blue cluster docs in order.
3. Pull only the green-cluster spec docs your slice touches.
4. Hit `code-review-graph` (`semantic_search_nodes`, `get_impact_radius`)
   **before** opening any engine file.
5. Implement. Verify via the grey cluster (test harness + playtest procedure).
6. On handoff, flag any red-cluster docs that now need a revision pass.
