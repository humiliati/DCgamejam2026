// ═══════════════════════════════════════════════════════════════
//  tools/cli/help-meta.js — Centralized command metadata
//  Slice C3 — Track C (agent-feedback closeouts)
//
//  Single source of truth for `bo help` (CLI) and `window.BO.help`
//  (browser). Every public action in the command vocabulary should
//  have an entry here with { description, args, example }.
//
//  Shape:
//    META['paint-rect'] = {
//      description: 'short one-liner — what the command does',
//      args: [
//        { name: '--floor <id>',    required: true,  about: '...' },
//        { name: '--at <x,y>',      required: true,  about: '...' },
//        { name: '--size <WxH>',    required: true,  about: '...' },
//        { name: '--tile <name>',   required: true,  about: '...' },
//        { name: '--outline',       required: false, about: '...' }
//      ],
//      example: 'node tools/blockout-cli.js paint-rect --floor 2.1 --at 5,5 --size 3x3 --tile WALL'
//    };
//
//  Global flags (--dry-run, --help) are NOT repeated per command;
//  they live in blockout-cli.js printHelp.
//
//  Closes blocker #3 from tools/BO-V agent feedback.md: "no `bo help
//  <command>` with args + worked example".
//
//  DUAL-MODE: this file is loaded by the Node CLI via `require()` AND
//  by the browser visualizer via a plain <script> tag (attaches to
//  window.BlockoutHelpMeta). No other deps — safe at any load order.
// ═══════════════════════════════════════════════════════════════
(function (root) {
'use strict';

function A(name, about, required) {
  return { name: name, about: about, required: !!required };
}

var META = {

  // ── commands-meta.js ─────────────────────────────────────────
  'list-floors': {
    description: 'List every floor in floor-data.json with dimensions, spawn, and biome.',
    args: [],
    example: 'node tools/blockout-cli.js list-floors'
  },
  'get-floor': {
    description: 'Dump full record for one floor — grid, spawn, doorTargets, rooms, entities.',
    args: [
      A('--floor <id>', 'Floor id, e.g. "2.1" or "1.3.1".', true)
    ],
    example: 'node tools/blockout-cli.js get-floor --floor 1.3.1'
  },
  'resize': {
    description: 'Add or trim a row/column on one side of the grid.',
    args: [
      A('--floor <id>',              'Floor id.', true),
      A('--side <top|bot|col-l|col-r>', 'Which edge to change.', true),
      A('--action <add|shrink>',     'Grow or shrink that edge.', true),
      A('--fill <tileId>',           'Tile id used when action=add (default 0 EMPTY).', false)
    ],
    example: 'node tools/blockout-cli.js resize --floor 2.1 --side col-r --action add --fill 0'
  },
  'set-spawn': {
    description: 'Move the player spawn point on a floor.',
    args: [
      A('--floor <id>', 'Floor id.', true),
      A('--at <x,y>',   'New spawn cell.', true),
      A('--dir <0-3>',  'Facing direction (0=E, 1=S, 2=W, 3=N). Defaults to current or 0.', false)
    ],
    example: 'node tools/blockout-cli.js set-spawn --floor 1.1 --at 8,5 --dir 3'
  },
  'set-door-target': {
    description: 'Bind a door cell to a target floor id (or pass --target "" to clear).',
    args: [
      A('--floor <id>',   'Source floor id.', true),
      A('--at <x,y>',     'Door cell (must be a DOOR/STAIRS tile).', true),
      A('--target <id>',  'Destination floor id; empty string to clear.', true)
    ],
    example: 'node tools/blockout-cli.js set-door-target --floor 1.1 --at 3,7 --target 1.2'
  },

  // ── commands-paint.js ────────────────────────────────────────
  'paint': {
    description: 'Paint a single tile at one cell.',
    args: [
      A('--floor <id>',   'Floor id.', true),
      A('--at <x,y>',     'Target cell.', true),
      A('--tile <name>',  'Tile name (e.g. WALL, FLOOR) or numeric id.', true)
    ],
    example: 'node tools/blockout-cli.js paint --floor 1.1 --at 5,5 --tile WALL'
  },
  'paint-rect': {
    description: 'Paint a filled (or hollow, with --outline) rectangle of tiles.',
    args: [
      A('--floor <id>',   'Floor id.', true),
      A('--at <x,y>',     'Top-left corner.', true),
      A('--size <WxH>',   'Width x height in tiles.', true),
      A('--tile <name>',  'Tile name or id.', true),
      A('--outline',      'Draw only the border, leaving interior untouched.', false)
    ],
    example: 'node tools/blockout-cli.js paint-rect --floor 2.1 --at 5,5 --size 3x3 --tile WALL'
  },
  'paint-line': {
    description: 'Paint a straight line of tiles between two cells (Bresenham).',
    args: [
      A('--floor <id>',   'Floor id.', true),
      A('--from <x,y>',   'Line start.', true),
      A('--to <x,y>',     'Line end.', true),
      A('--tile <name>',  'Tile name or id.', true)
    ],
    example: 'node tools/blockout-cli.js paint-line --floor 1.1 --from 0,0 --to 10,10 --tile WALL'
  },
  'flood-fill': {
    description: 'Flood-fill all connected cells of the seed\'s tile type with a new tile.',
    args: [
      A('--floor <id>',   'Floor id.', true),
      A('--at <x,y>',     'Seed cell; its current tile type is the fill target.', true),
      A('--tile <name>',  'Replacement tile name or id.', true)
    ],
    example: 'node tools/blockout-cli.js flood-fill --floor 1.1 --at 3,3 --tile EMPTY'
  },
  'replace': {
    description: 'Replace every cell of the seed\'s tile type across the whole floor.',
    args: [
      A('--floor <id>',   'Floor id.', true),
      A('--at <x,y>',     'Seed cell; its tile type is the match target.', true),
      A('--tile <name>',  'Replacement tile name or id.', true)
    ],
    example: 'node tools/blockout-cli.js replace --floor 1.1 --at 2,2 --tile STONE'
  },

  // ── commands-perception.js ───────────────────────────────────
  'render-ascii': {
    description: 'Render a floor as ASCII with glyph legend — the agent\'s primary vision.',
    args: [
      A('--floor <id>',              'Floor id.', true),
      A('--viewport <x,y,WxH>',      'Optional window (e.g. 0,0,40x20). Default: whole floor.', false)
    ],
    example: 'node tools/blockout-cli.js render-ascii --floor 1.3.1 --viewport 0,0,40x20'
  },
  'describe-cell': {
    description: 'Inspect one cell: tile, glyph, door target, room, spawn/entity membership.',
    args: [
      A('--floor <id>', 'Floor id.', true),
      A('--at <x,y>',   'Cell to inspect.', true)
    ],
    example: 'node tools/blockout-cli.js describe-cell --floor 1.1 --at 5,5'
  },
  'diff-ascii': {
    description: 'Compare current ASCII rendering against a saved snapshot JSON.',
    args: [
      A('--floor <id>',   'Floor id.', true),
      A('--before <path>','Path to previously-saved snapshot JSON.', true)
    ],
    example: 'node tools/blockout-cli.js diff-ascii --floor 1.1 --before /tmp/before.json'
  },

  // ── commands-validation.js ───────────────────────────────────
  'validate': {
    description: 'Run structural validation (spawn, door bindings, bounds) on one/all floors.',
    args: [
      A('--scope <all|current>', 'Scope of check. Default: current.', false),
      A('--floor <id>',          'Required when scope=current.', false),
      A('--out <path>',          'Write JSON report to file instead of stdout.', false)
    ],
    example: 'node tools/blockout-cli.js validate --scope all --out /tmp/errors.json'
  },
  'report-validation': {
    description: 'Alias for `validate` — same flags, same output.',
    args: [
      A('--scope <all|current>', 'Scope of check.', false),
      A('--floor <id>',          'Required when scope=current.', false),
      A('--out <path>',          'JSON output path.', false)
    ],
    example: 'node tools/blockout-cli.js report-validation --floor 2.1 --scope current'
  },

  // ── commands-tile-lookup.js ──────────────────────────────────
  'tile': {
    description: 'Resolve a tile name (e.g. WALL) to its numeric id.',
    args: [
      A('--name <tileName>', 'Tile name from TILES schema.', true)
    ],
    example: 'node tools/blockout-cli.js tile --name WALL'
  },
  'tile-name': {
    description: 'Resolve a numeric tile id back to its schema name.',
    args: [
      A('--id <n>', 'Numeric tile id.', true)
    ],
    example: 'node tools/blockout-cli.js tile-name --id 42'
  },
  'tile-schema': {
    description: 'Dump one or all tile schema rows (name, glyph, walk, opaque, flags).',
    args: [
      A('--id <n>',    'Specific tile id; omit for full schema.', false),
      A('--name <s>',  'Specific tile name; omit for full schema.', false)
    ],
    example: 'node tools/blockout-cli.js tile-schema --name WALL'
  },
  'find-tiles': {
    description: 'Search the tile schema by substring / regex / category / flags.',
    args: [
      A('--name <pattern>', 'Substring or /regex/flags against tile name.', false),
      A('--category <cat>', 'Category filter (e.g. door, stair, floor).', false),
      A('--glyph <ch>',     'Filter by ASCII glyph.', false),
      A('--walk <bool>',    'Filter by walkable flag.', false),
      A('--opq <bool>',     'Filter by opaque flag.', false)
    ],
    example: 'node tools/blockout-cli.js find-tiles --name /torch/i --walk true'
  },

  // ── commands-stamps.js ───────────────────────────────────────
  'stamp-room': {
    description: 'Paint a parametric room (hollow wall rectangle + floor fill).',
    args: [
      A('--floor <id>',         'Floor id.', true),
      A('--at <x,y>',           'Top-left corner.', true),
      A('--size <WxH>',         'Room size.', true),
      A('--wall-tile <name>',   'Tile for the border. Default: WALL.', false),
      A('--floor-tile <name>',  'Tile for the interior. Default: FLOOR.', false)
    ],
    example: 'node tools/blockout-cli.js stamp-room --floor 1.1 --at 2,2 --size 8x6 --wall-tile WALL --floor-tile FLOOR'
  },
  'stamp-corridor': {
    description: 'Paint a corridor (line with width, optional wall border).',
    args: [
      A('--floor <id>',         'Floor id.', true),
      A('--from <x,y>',         'Corridor start.', true),
      A('--to <x,y>',           'Corridor end.', true),
      A('--width <n>',          'Corridor thickness in tiles. Default: 1.', false),
      A('--floor-tile <name>',  'Interior tile. Default: FLOOR.', false),
      A('--wall-tile <name>',   'Optional wall border tile.', false)
    ],
    example: 'node tools/blockout-cli.js stamp-corridor --floor 1.1 --from 5,2 --to 5,10 --width 3 --floor-tile FLOOR'
  },
  'stamp-torch-ring': {
    description: 'Place torches in a ring pattern around a center cell.',
    args: [
      A('--floor <id>',        'Floor id.', true),
      A('--at <x,y>',          'Ring center.', true),
      A('--radius <n>',        'Ring radius in tiles.', true),
      A('--step <n>',          'Angular step between torches (cells). Default: 2.', false),
      A('--torch-tile <name>', 'Torch tile. Default: TORCH_LIT.', false)
    ],
    example: 'node tools/blockout-cli.js stamp-torch-ring --floor 1.1 --at 10,10 --radius 5 --step 2 --torch-tile TORCH_LIT'
  },
  'save-stamp': {
    description: 'Capture a grid region as a reusable named stamp (persists to stamps.json).',
    args: [
      A('--floor <id>', 'Floor id to read from.', true),
      A('--at <x,y>',   'Top-left of source region.', true),
      A('--size <WxH>', 'Region size.', true),
      A('--name <s>',   'Stamp name (used by apply-stamp).', true)
    ],
    example: 'node tools/blockout-cli.js save-stamp --floor 1.1 --at 0,0 --size 4x4 --name my_room'
  },
  'apply-stamp': {
    description: 'Paste a saved stamp at a target cell, optionally rotated/flipped.',
    args: [
      A('--floor <id>',  'Destination floor id.', true),
      A('--at <x,y>',    'Top-left of paste location.', true),
      A('--name <s>',    'Stamp name from save-stamp / stamps.json.', true),
      A('--rotate <n>',  'Rotation in degrees (0/90/180/270). Default: 0.', false),
      A('--flip-h',      'Mirror horizontally.', false),
      A('--flip-v',      'Mirror vertically.', false)
    ],
    example: 'node tools/blockout-cli.js apply-stamp --floor 1.2 --at 3,3 --name my_room --rotate 90'
  },
  'list-stamps': {
    description: 'List all stamps saved in tools/stamps.json with dimensions.',
    args: [],
    example: 'node tools/blockout-cli.js list-stamps'
  },
  'export-stamps': {
    description: 'Dump stamps.json to stdout (or --out <path>).',
    args: [
      A('--out <path>', 'File path; default stdout.', false)
    ],
    example: 'node tools/blockout-cli.js export-stamps --out /tmp/stamps-backup.json'
  },
  'delete-stamp': {
    description: 'Remove a saved stamp by name.',
    args: [
      A('--name <s>', 'Stamp name to delete.', true)
    ],
    example: 'node tools/blockout-cli.js delete-stamp --name my_room'
  },

  // ── Slice C4: biome-specific stamps ──────────────────────────
  'stamp-tunnel-corridor': {
    description: 'Paint a ribbed pressure-vessel corridor with tapered 3-wide mouths (submarine/engine-room biomes).',
    args: [
      A('--floor <id>',       'Floor id.', true),
      A('--at <x,y>',         'Leading corner of the corridor bounding box.', true),
      A('--len <n>',          'Corridor length along axis (min 4). Default: 6.', false),
      A('--dir <0-3>',        '0=E (default), 1=S, 2=W, 3=N — axis of travel.', false),
      A('--rib-tile <name>',  'Ribbed freeform tile. Default: TUNNEL_RIB.', false),
      A('--wall-tile <name>', 'Non-rib flank tile. Default: TUNNEL_WALL.', false),
      A('--floor-tile <name>','Walkway + mouth taper tile. Default: EMPTY.', false)
    ],
    example: 'node tools/blockout-cli.js stamp-tunnel-corridor --floor 3.1.1 --at 4,10 --len 8 --dir 0'
  },
  'stamp-porthole-wall': {
    description: 'Paint a row of portholes separated by jamb masonry (submarine/tower biomes).',
    args: [
      A('--floor <id>',       'Floor id.', true),
      A('--at <x,y>',         'Cell of the first porthole.', true),
      A('--side <L|R>',       'Extend leftward (L) or rightward (R) from --at. Default: R.', false),
      A('--span <n>',         'Number of portholes. Footprint is 2*span-1 tiles. Default: 3.', false),
      A('--tile <name>',      'Porthole tile. Default: PORTHOLE_OCEAN.', false),
      A('--jamb-tile <name>', 'Masonry between panes. Default: TUNNEL_WALL.', false)
    ],
    example: 'node tools/blockout-cli.js stamp-porthole-wall --floor 3.1.1 --at 2,6 --side R --span 4'
  },
  'stamp-alcove-flank': {
    description: 'Paint symmetric alcove-face pairs framing a vertical centerline (terminal-chamber approaches).',
    args: [
      A('--floor <id>',   'Floor id.', true),
      A('--at <x,y>',     'Anchor cell on the centerline (top of the first pair).', true),
      A('--count <n>',    'Number of alcove pairs. Default: 2.', false),
      A('--spacing <n>',  'Rows between successive pairs. Default: 2.', false),
      A('--depth <n>',    'Tiles-thick of each flank face. Default: 1.', false),
      A('--tile <name>',  'Alcove face tile. Default: TUNNEL_WALL.', false)
    ],
    example: 'node tools/blockout-cli.js stamp-alcove-flank --floor 3.1.1 --at 8,15 --count 3 --spacing 2'
  },

  // ── commands-floor.js ────────────────────────────────────────
  'create-floor': {
    description: 'Scaffold a new floor from a template or blank grid, pre-wired to a biome.',
    args: [
      A('--id <id>',         'New floor id (e.g. 4.1, 2.3.1).', true),
      A('--biome <name>',    'Biome tag; drives wall/floor/torch tile defaults.', true),
      A('--template <name>', 'Template: single-room | corridor | blank. Default: single-room.', false),
      A('--size <WxH>',      'Grid size. Default from template.', false),
      A('--force',           'Overwrite an existing floor with the same id.', false)
    ],
    example: 'node tools/blockout-cli.js create-floor --id 4.1 --biome bazaar --template single-room'
  },
  'set-biome': {
    description: 'Change a floor\'s biome tag (affects default tile palette).',
    args: [
      A('--floor <id>',   'Floor id.', true),
      A('--biome <name>', 'New biome tag.', true)
    ],
    example: 'node tools/blockout-cli.js set-biome --floor 4.1 --biome guild'
  },
  'place-entity': {
    description: 'Paint a semantic entity (CHEST, TORCH, SPAWNER…) and register it in entities[].',
    args: [
      A('--floor <id>', 'Floor id.', true),
      A('--at <x,y>',   'Cell to place the entity.', true),
      A('--kind <k>',   'Entity kind (CHEST, TORCH, …).', true),
      A('--key <s>',    'Stable key for this entity (referenced by quests/scripts).', false)
    ],
    example: 'node tools/blockout-cli.js place-entity --floor 4.1 --at 3,3 --kind CHEST --key treasure1'
  },
  'git-snapshot': {
    description: 'Stage floor-data.json + engine/ diffs and commit with a message.',
    args: [
      A('--message <s>', 'Commit message.', true)
    ],
    example: 'node tools/blockout-cli.js git-snapshot --message "scaffold 4.1"'
  },
  'git-diff': {
    description: 'Show diff summary (or --verbose full diff) of floor-data.json + engine/.',
    args: [
      A('--floor <id>', 'Limit to a single floor.', false),
      A('--verbose',    'Show full per-line diff instead of stat summary.', false)
    ],
    example: 'node tools/blockout-cli.js git-diff --floor 2.2.1 --verbose'
  },

  // ── commands-ingest.js (Slice C2) ────────────────────────────
  'ingest': {
    description: 'Parse engine/floor-blockout-<id>.js IIFE and merge the result into floor-data.json.',
    args: [
      A('--floor <id>',   'Floor id. If omitted, derived from --from filename.', false),
      A('--from <path>',  'Path to the IIFE. If omitted, derived from --floor.', false),
      A('--print',        'Emit the extracted payload to stdout; do NOT write floor-data.json.', false)
    ],
    example: 'node tools/blockout-cli.js ingest --floor 3.1.1'
  },

  // ── commands-emit.js (Slice C2) ──────────────────────────────
  'emit': {
    description: 'Emit a floor as engine-loadable IIFE or JSON (the inverse of `ingest`).',
    args: [
      A('--floor <id>',     'Floor id to emit.', true),
      A('--as <iife|json>', 'Output format. Default: iife.', false),
      A('--out <path>',     'Write to file instead of stdout.', false),
      A('--overwrite',      'Overwrite engine/floor-blockout-<id>.js directly. Mutually exclusive with --out.', false)
    ],
    example: 'node tools/blockout-cli.js emit --floor 2.2.1 --as iife --out /tmp/rt.js'
  },

  // ── dispatcher-level ─────────────────────────────────────────
  'describe': {
    description: 'Dispatcher sanity dump: floor-data.json path, floor count, available commands.',
    args: [],
    example: 'node tools/blockout-cli.js describe'
  },
  'help': {
    description: 'Print help for all commands, or one command\'s args + example.',
    args: [
      A('<command>',    'Optional. If omitted, lists every command.', false),
      A('--json',       'Emit as JSON (for agents) instead of human-readable text.', false)
    ],
    example: 'node tools/blockout-cli.js help paint-rect'
  }
};

// ── Public API ────────────────────────────────────────────────
function list() { return Object.keys(META).sort(); }
function get(name) { return META[name] || null; }

// Formatter: human-readable block for one command.
function formatBlock(name) {
  var m = META[name];
  if (!m) return 'help: unknown command "' + name + '" (try `bo help` for the full list)\n';
  var lines = [];
  lines.push(name);
  lines.push('  ' + m.description);
  if (m.args && m.args.length) {
    lines.push('');
    lines.push('  Arguments:');
    // Align arg names.
    var nameW = 0;
    m.args.forEach(function(a) { if (a.name.length > nameW) nameW = a.name.length; });
    m.args.forEach(function(a) {
      var pad = '                                '.slice(0, nameW - a.name.length);
      var tag = a.required ? ' (required)' : '';
      lines.push('    ' + a.name + pad + '  ' + a.about + tag);
    });
  } else {
    lines.push('');
    lines.push('  Arguments: (none)');
  }
  lines.push('');
  lines.push('  Example:');
  lines.push('    ' + m.example);
  lines.push('');
  return lines.join('\n');
}

// Formatter: flat list of all command names, grouped-alpha.
function formatIndex() {
  var names = list();
  var lines = [];
  lines.push('bo help <command>  — show args + example for one command.');
  lines.push('bo help            — this list.');
  lines.push('');
  lines.push('Available commands:');
  names.forEach(function(n) {
    var m = META[n];
    lines.push('  ' + n + (m && m.description ? '  — ' + m.description : ''));
  });
  lines.push('');
  lines.push('Global flags: --dry-run (preview without writing), --help / -h.');
  return lines.join('\n') + '\n';
}

var API = {
  META: META,
  list: list,
  get: get,
  formatBlock: formatBlock,
  formatIndex: formatIndex
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  root.BlockoutHelpMeta = API;
}

})(typeof window !== 'undefined' ? window : this);
