#!/usr/bin/env node
/**
 * validate-dialogue-trees.js
 *
 * Structural validator for data/dialogue-trees.json.
 * Checks schema shape, orphan nodes, dangling next targets,
 * circular chains, empty text, and cross-references vs npc-manifest.
 *
 * Usage:
 *   node tools/validate-dialogue-trees.js          — validate, exit 0/1
 *   node tools/validate-dialogue-trees.js --json    — emit JSON report
 *
 * Exit code 0 = pass (warnings OK), 1 = errors found.
 */
'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT   = path.resolve(__dirname, '..');
var DATA   = path.join(ROOT, 'data', 'dialogue-trees.json');
var SCHEMA = path.join(ROOT, 'tools', 'dialogue-tree-schema.json');
var MANIFEST = path.join(ROOT, 'tools', 'npc-manifest.json');

var jsonMode = process.argv.indexOf('--json') !== -1;

// ── Load data ──────────────────────────────────────────────────

var raw;
try {
  raw = fs.readFileSync(DATA, 'utf8');
} catch (e) {
  fail('Cannot read ' + DATA + ': ' + e.message);
}

var data;
try {
  data = JSON.parse(raw);
} catch (e) {
  fail('Invalid JSON in ' + DATA + ': ' + e.message);
}

// ── Collect issues ─────────────────────────────────────────────

var errors   = [];   // hard failures
var warnings = [];   // advisory

function err(tree, msg)  { errors.push({ tree: tree, message: msg }); }
function warn(tree, msg) { warnings.push({ tree: tree, message: msg }); }

// ── Shape checks ───────────────────────────────────────────────

if (!data._meta || typeof data._meta.treeCount !== 'number') {
  err(null, 'Missing or malformed _meta block');
}
if (!data.trees || typeof data.trees !== 'object') {
  fail('Missing trees object');
}

var treeIds = Object.keys(data.trees);

if (data._meta && data._meta.treeCount !== treeIds.length) {
  err(null, '_meta.treeCount (' + data._meta.treeCount + ') != actual tree count (' + treeIds.length + ')');
}

// ── Per-tree structural validation ─────────────────────────────

for (var t = 0; t < treeIds.length; t++) {
  var id   = treeIds[t];
  var tree = data.trees[id];

  if (!tree.root) {
    err(id, 'Missing root');
    continue;
  }
  if (!tree.nodes || typeof tree.nodes !== 'object') {
    err(id, 'Missing or invalid nodes object');
    continue;
  }

  var nodeIds = Object.keys(tree.nodes);
  if (nodeIds.length === 0) {
    err(id, 'Tree has zero nodes');
    continue;
  }

  // Collect root entry points
  var rootEntries = [];
  if (typeof tree.root === 'string') {
    rootEntries.push(tree.root);
  } else if (tree.root && tree.root.ifTrue && tree.root.ifFalse) {
    rootEntries.push(tree.root.ifTrue);
    rootEntries.push(tree.root.ifFalse);
    if (!tree.root.condition || !tree.root.condition.flag) {
      err(id, 'Conditional root missing condition.flag');
    }
  } else {
    err(id, 'Root is neither a string nor a valid conditional');
    continue;
  }

  // Verify root entries exist in nodes
  for (var r = 0; r < rootEntries.length; r++) {
    if (!tree.nodes[rootEntries[r]]) {
      err(id, 'Root entry "' + rootEntries[r] + '" does not exist in nodes');
    }
  }

  // Collect all next targets and build reachability
  var allNexts    = [];
  var nextToNode  = {};   // next target → which node/choice references it
  var terminals   = [];

  for (var n = 0; n < nodeIds.length; n++) {
    var nid  = nodeIds[n];
    var node = tree.nodes[nid];

    // Empty text check
    if (!node.text && node.text !== '') {
      err(id, 'Node "' + nid + '" missing text property');
    } else if (node.text.trim() === '') {
      warn(id, 'Node "' + nid + '" has empty text');
    }

    if (node.choices && node.choices.length > 0) {
      var hasExitChoice = false;
      for (var c = 0; c < node.choices.length; c++) {
        var choice = node.choices[c];

        if (!choice.label) {
          err(id, 'Node "' + nid + '" choice[' + c + '] missing label');
        }
        if (choice.next === undefined) {
          err(id, 'Node "' + nid + '" choice[' + c + '] missing next property');
        } else if (choice.next === null) {
          // null next = "exit conversation" — valid terminal choice
          hasExitChoice = true;
        } else if (typeof choice.next === 'string' && choice.next.length > 0) {
          allNexts.push(choice.next);
          nextToNode[choice.next] = nid + '.choices[' + c + ']';
        } else {
          err(id, 'Node "' + nid + '" choice[' + c + '] next must be a string or null');
        }
      }
      if (hasExitChoice) terminals.push(nid);
    } else {
      // Node with no choices at all = implicit terminal
      terminals.push(nid);
    }
  }

  // Dangling next: points to a node that doesn't exist
  var danglingSet = {};
  for (var d = 0; d < allNexts.length; d++) {
    if (!tree.nodes[allNexts[d]] && !danglingSet[allNexts[d]]) {
      err(id, 'Dangling next "' + allNexts[d] + '" (from ' + nextToNode[allNexts[d]] + ') — node does not exist');
      danglingSet[allNexts[d]] = true;
    }
  }

  // Orphan nodes: not reachable from root or any choice's next
  var reachable = {};
  for (var re = 0; re < rootEntries.length; re++) reachable[rootEntries[re]] = true;
  for (var nx = 0; nx < allNexts.length; nx++) reachable[allNexts[nx]] = true;

  for (var o = 0; o < nodeIds.length; o++) {
    if (!reachable[nodeIds[o]]) {
      warn(id, 'Orphan node "' + nodeIds[o] + '" — not reachable from root or any choice');
    }
  }

  // Circular chain detection (DFS from each root entry)
  for (var cr = 0; cr < rootEntries.length; cr++) {
    var cycles = detectCycles(tree, rootEntries[cr]);
    for (var cy = 0; cy < cycles.length; cy++) {
      warn(id, 'Circular path: ' + cycles[cy].join(' -> '));
    }
  }

  // Terminal count check (at least 1 terminal = conversation can end)
  if (terminals.length === 0) {
    warn(id, 'No exit paths — every node leads deeper (conversation may never end)');
  }
}

// ── Cross-reference vs NPC manifest ────────────────────────────

var manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
} catch (e) {
  warn(null, 'Could not load npc-manifest.json for cross-reference: ' + e.message);
}

if (manifest && manifest.byDialogueTree) {
  // Trees in JSON that have no NPC referencing them
  for (var ti = 0; ti < treeIds.length; ti++) {
    if (!manifest.byDialogueTree[treeIds[ti]]) {
      warn(treeIds[ti], 'No NPC in manifest references this dialogue tree');
    }
  }
  // NPCs referencing trees not in the JSON
  var manifestTrees = Object.keys(manifest.byDialogueTree);
  for (var mi = 0; mi < manifestTrees.length; mi++) {
    if (!data.trees[manifestTrees[mi]]) {
      err(null, 'NPC manifest references tree "' + manifestTrees[mi] + '" but it is not in dialogue-trees.json');
    }
  }
}

// ── Cycle detection ────────────────────────────────────────────

function detectCycles(tree, startNode) {
  var cycles  = [];
  var visited = {};
  var stack   = {};

  function dfs(nodeId, path) {
    if (!nodeId) return;  // null next = exit, skip
    if (!tree.nodes[nodeId]) return;
    if (stack[nodeId]) {
      // Found cycle — extract the loop portion
      var loopStart = path.indexOf(nodeId);
      if (loopStart !== -1) {
        cycles.push(path.slice(loopStart).concat(nodeId));
      }
      return;
    }
    if (visited[nodeId]) return;

    visited[nodeId] = true;
    stack[nodeId]   = true;
    path.push(nodeId);

    var node = tree.nodes[nodeId];
    if (node.choices) {
      for (var i = 0; i < node.choices.length; i++) {
        dfs(node.choices[i].next, path.slice());
      }
    }

    stack[nodeId] = false;
  }

  dfs(startNode, []);
  return cycles;
}

// ── Report ─────────────────────────────────────────────────────

if (jsonMode) {
  var report = {
    file: DATA,
    trees: treeIds.length,
    errors: errors,
    warnings: warnings,
    pass: errors.length === 0
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  if (errors.length > 0) {
    console.log('\n  ERRORS (' + errors.length + '):');
    for (var ei = 0; ei < errors.length; ei++) {
      var e = errors[ei];
      console.log('    ' + (e.tree ? '[' + e.tree + '] ' : '') + e.message);
    }
  }
  if (warnings.length > 0) {
    console.log('\n  WARNINGS (' + warnings.length + '):');
    for (var wi = 0; wi < warnings.length; wi++) {
      var w = warnings[wi];
      console.log('    ' + (w.tree ? '[' + w.tree + '] ' : '') + w.message);
    }
  }
  if (errors.length === 0 && warnings.length === 0) {
    console.log('[validate-dialogue-trees] All clean — ' + treeIds.length + ' trees, 0 errors, 0 warnings');
  } else {
    console.log('\n[validate-dialogue-trees] ' + treeIds.length + ' trees — ' +
      errors.length + ' error(s), ' + warnings.length + ' warning(s)');
  }
}

process.exit(errors.length > 0 ? 1 : 0);

// ── Helpers ────────────────────────────────────────────────────

function fail(msg) {
  if (jsonMode) {
    process.stdout.write(JSON.stringify({ file: DATA, fatal: msg, pass: false }, null, 2) + '\n');
  } else {
    console.error('[validate-dialogue-trees] FATAL: ' + msg);
  }
  process.exit(1);
}
