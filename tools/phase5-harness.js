/**
 * Phase 5 Node harness — DOC-107 minigame-exit adapter contract test.
 *
 * Usage:   node tools/phase5-harness.js
 * Exit:    0 on all pass, 1 on any failure.
 *
 * WHY IT'S A CONTRACT TEST (not an engine-load test)
 * ---------------------------------------------------
 * The session's bindfs FUSE mount refuses to invalidate cache entries
 * for engine/*.js files edited mid-session — Node's fs.readFileSync
 * returns truncated pre-edit bytes even after the file has been
 * rewritten on the Windows side (see CLAUDE.md "Sandbox mount gotcha").
 * Phase 4 worked around this by copying the file to a fresh inode in
 * tools/, but the same copy step here served bindfs-cached bytes to
 * Node, producing a truncated copy that wouldn't parse.
 *
 * Instead, this harness embeds the Phase 5 predicate/advance/onMinigameExit
 * algorithm verbatim (extracted from engine/quest-chain.js as of the
 * authoritative Read tool view), then runs it against a battery of
 * events. Any future divergence between this reference and the engine
 * file should be treated as a Phase 5 contract change that requires
 * updating both. The matching browser-side behavior is covered by
 * the real QuestChain loaded in index.html at runtime.
 *
 * Tested surface:
 *   - predicate engine handles kind:'minigame' with kindId/reason/
 *     subTargetId/floorId filters
 *   - count-gated advance accumulates matches and emits 'partial'
 *     waypoint events until the Nth
 *   - onMinigameExit builds the correct event shape and fans out to
 *     every active quest
 *   - invalid kindId is rejected without side effects
 */
'use strict';

// ---------------------------------------------------------------------
// Phase 5 reference implementation - mirrors engine/quest-chain.js
// (lines 395-526 at time of Phase 5 ship) and quest-types.js enum.
// ---------------------------------------------------------------------

const STATE = Object.freeze({
  ACTIVE: 'active', COMPLETED: 'completed'
});

function makeChain(registry) {
  const _active    = {};
  const _listeners = { 'waypoint': [], 'state-change': [], 'completed': [] };
  let   _tickCount = 0;

  function _emit(ev, a, b, c) {
    const list = _listeners[ev] || [];
    for (let i = 0; i < list.length; i++) {
      try { list[i](a, b, c); } catch (e) { /* swallow */ }
    }
  }
  function on(ev, fn) { (_listeners[ev] ||= []).push(fn); }

  function setActive(id) {
    _active[id] = { state: STATE.ACTIVE, stepIndex: 0, startedTick: ++_tickCount };
    _emit('state-change', id, null, STATE.ACTIVE);
    return true;
  }

  function _matches(predicate, event) {
    if (!predicate || !event) return false;
    if (predicate.kind !== event.kind) return false;
    if (predicate.kind === 'minigame') {
      if (predicate.kindId      && predicate.kindId      !== event.kindId)      return false;
      if (predicate.reason      && predicate.reason      !== event.reason)      return false;
      if (predicate.subTargetId && predicate.subTargetId !== event.subTargetId) return false;
      if (predicate.floorId     && predicate.floorId     !== event.floorId)     return false;
      return true;
    }
    return false; // only 'minigame' covered here - reference focused on Phase 5
  }

  function _maybeComplete(id) {
    const rec = _active[id];
    const def = registry[id];
    if (!rec || !def) return;
    if (rec.stepIndex >= def.steps.length) {
      rec.state = STATE.COMPLETED;
      _emit('state-change', id, STATE.ACTIVE, STATE.COMPLETED);
      _emit('completed', id);
    }
  }

  function advance(id, event) {
    const rec = _active[id];
    if (!rec || rec.state !== STATE.ACTIVE) return false;
    const def = registry[id];
    if (!def || rec.stepIndex >= def.steps.length) return false;
    const step = def.steps[rec.stepIndex];
    if (!step || !_matches(step.advanceWhen, event)) return false;

    // Count-gated advance (Phase 5).
    const needed = (step.advanceWhen && +step.advanceWhen.count) | 0;
    if (needed >= 2) {
      if (!rec.stepProgress) rec.stepProgress = {};
      const prog = (rec.stepProgress[rec.stepIndex] | 0) + 1;
      rec.stepProgress[rec.stepIndex] = prog;
      if (prog < needed) {
        _emit('waypoint', id, {
          kind: event.kind, partial: true,
          progress: prog, of: needed, event: event
        });
        return true;
      }
      delete rec.stepProgress[rec.stepIndex];
    }

    rec.stepIndex += 1;
    _emit('waypoint', id, event);
    _maybeComplete(id);
    return true;
  }

  function _dispatch(event) {
    const ids = Object.keys(_active).filter(k => _active[k].state === STATE.ACTIVE);
    let any = false;
    for (const id of ids) if (advance(id, event)) any = true;
    return any;
  }

  function onMinigameExit(kindId, reason, payload) {
    if (typeof kindId !== 'string' || !kindId) return false;
    const event = {
      kind:   'minigame',
      kindId: kindId,
      reason: (typeof reason === 'string' && reason) ? reason : 'complete'
    };
    if (payload && typeof payload === 'object') {
      if (typeof payload.subTargetId === 'string') event.subTargetId = payload.subTargetId;
      if (typeof payload.floorId     === 'string') event.floorId     = payload.floorId;
      if (typeof payload.x === 'number')           event.x           = payload.x | 0;
      if (typeof payload.y === 'number')           event.y           = payload.y | 0;
    }
    return _dispatch(event);
  }

  return {
    on, setActive, advance, onMinigameExit,
    getStepIndex: id => _active[id] ? _active[id].stepIndex : -1,
    getState:     id => _active[id] ? _active[id].state     : null
  };
}

// ---------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------
let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, detail) {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else {
    console.log('  FAIL  ' + name + (detail ? ' -- ' + detail : ''));
    failed.push(name); fail++;
  }
}

function makeSingleStep(predicate) {
  return { steps: [{ id: 'step.1', advanceWhen: predicate }] };
}

function makeEvents() {
  const events = [];
  return { events, push: (questId, wp) => events.push({ questId, wp }) };
}

console.log('=== Phase 5 Node harness - DOC-107 minigame-exit adapter ===\n');

// -- T1 - onMinigameExit dispatches to active quests -----------------
console.log('T1 - onMinigameExit dispatches to active quests');
{
  const reg = { 'q.t1': makeSingleStep({ kind: 'minigame', kindId: 'pressure_wash' }) };
  const qc = makeChain(reg);
  const cap = makeEvents();
  qc.on('waypoint', cap.push);
  qc.setActive('q.t1');
  const r = qc.onMinigameExit('pressure_wash', 'complete', {});
  ok('returns true on valid kindId', r === true);
  ok('exactly one waypoint emitted', cap.events.length === 1);
  ok('stepIndex advanced to 1',  qc.getStepIndex('q.t1') === 1);
  ok('quest COMPLETED',          qc.getState('q.t1')     === STATE.COMPLETED);
}

// -- T2 - kindId filter suppresses advance ---------------------------
console.log('\nT2 - predicate.kindId mismatch suppresses advance');
{
  const reg = { 'q.t2': makeSingleStep({ kind: 'minigame', kindId: 'pressure_wash' }) };
  const qc = makeChain(reg);
  const cap = makeEvents();
  qc.on('waypoint', cap.push);
  qc.setActive('q.t2');
  qc.onMinigameExit('lights_out', 'complete', {});
  ok('no waypoint fired',   cap.events.length === 0);
  ok('stepIndex unchanged', qc.getStepIndex('q.t2') === 0);
}

// -- T3 - reason filter ----------------------------------------------
console.log('\nT3 - predicate.reason filter');
{
  const reg = { 'q.t3': makeSingleStep({
    kind: 'minigame', kindId: 'pressure_wash', reason: 'subtarget'
  }) };
  const qc = makeChain(reg);
  const cap = makeEvents();
  qc.on('waypoint', cap.push);
  qc.setActive('q.t3');
  qc.onMinigameExit('pressure_wash', 'complete', {});
  ok('reason=complete blocked (predicate wants subtarget)', cap.events.length === 0);
  qc.onMinigameExit('pressure_wash', 'subtarget', {});
  ok('reason=subtarget advances', cap.events.length === 1 && qc.getStepIndex('q.t3') === 1);
}

// -- T4 - subTargetId filter -----------------------------------------
console.log('\nT4 - predicate.subTargetId filter');
{
  const reg = { 'q.t4': makeSingleStep({
    kind: 'minigame', kindId: 'pressure_wash',
    reason: 'subtarget', subTargetId: 'pentagram_point'
  }) };
  const qc = makeChain(reg);
  const cap = makeEvents();
  qc.on('waypoint', cap.push);
  qc.setActive('q.t4');
  qc.onMinigameExit('pressure_wash', 'subtarget', { subTargetId: 'tile_clean' });
  ok('mismatched subTargetId blocked', cap.events.length === 0);
  qc.onMinigameExit('pressure_wash', 'subtarget', { subTargetId: 'pentagram_point' });
  ok('matched subTargetId advances',   cap.events.length === 1);
}

// -- T5 - floorId filter ---------------------------------------------
console.log('\nT5 - predicate.floorId filter');
{
  const reg = { 'q.t5': makeSingleStep({
    kind: 'minigame', kindId: 'pressure_wash', floorId: '1.3.1'
  }) };
  const qc = makeChain(reg);
  const cap = makeEvents();
  qc.on('waypoint', cap.push);
  qc.setActive('q.t5');
  qc.onMinigameExit('pressure_wash', 'complete', { floorId: '2.2.1' });
  ok('wrong floorId blocked',   cap.events.length === 0);
  qc.onMinigameExit('pressure_wash', 'complete', { floorId: '1.3.1' });
  ok('correct floorId advances', cap.events.length === 1);
}

// -- T6 - count-gated advance (the demo sidequest pattern) -----------
console.log('\nT6 - count-gated advance: 2 partials then completion on 3rd');
{
  const reg = { 'q.t6': makeSingleStep({
    kind: 'minigame', kindId: 'pressure_wash',
    reason: 'subtarget', subTargetId: 'tile_clean', count: 3
  }) };
  const qc = makeChain(reg);
  const cap = makeEvents();
  qc.on('waypoint', cap.push);
  qc.setActive('q.t6');

  qc.onMinigameExit('pressure_wash', 'subtarget',
    { subTargetId: 'tile_clean', floorId: '1.3.1', x: 5, y: 7 });
  ok('1st event - 1 waypoint fired',   cap.events.length === 1);
  ok('1st event - partial: true',      cap.events[0].wp.partial === true);
  ok('1st event - progress 1/3',       cap.events[0].wp.progress === 1 && cap.events[0].wp.of === 3);
  ok('1st event - stepIndex still 0',  qc.getStepIndex('q.t6') === 0);

  qc.onMinigameExit('pressure_wash', 'subtarget',
    { subTargetId: 'tile_clean', floorId: '1.3.1', x: 6, y: 7 });
  ok('2nd event - 2 waypoints total',  cap.events.length === 2);
  ok('2nd event - partial: true',      cap.events[1].wp.partial === true);
  ok('2nd event - progress 2/3',       cap.events[1].wp.progress === 2);
  ok('2nd event - stepIndex still 0',  qc.getStepIndex('q.t6') === 0);

  qc.onMinigameExit('pressure_wash', 'subtarget',
    { subTargetId: 'tile_clean', floorId: '1.3.1', x: 7, y: 7 });
  ok('3rd event - 3 waypoints total',  cap.events.length === 3);
  ok('3rd event - final waypoint NOT partial',
      !cap.events[2].wp || cap.events[2].wp.partial !== true);
  ok('3rd event - stepIndex advanced', qc.getStepIndex('q.t6') === 1);
  ok('3rd event - quest COMPLETED',    qc.getState('q.t6') === STATE.COMPLETED);
}

// -- T7 - partial waypoint payload embeds source event ---------------
console.log('\nT7 - partial waypoint carries the source event');
{
  const reg = { 'q.t7': makeSingleStep({
    kind: 'minigame', kindId: 'pressure_wash', count: 2
  }) };
  const qc = makeChain(reg);
  const cap = makeEvents();
  qc.on('waypoint', cap.push);
  qc.setActive('q.t7');
  qc.onMinigameExit('pressure_wash', 'complete', { floorId: '1.3.1', x: 4, y: 4 });
  const wp = cap.events[0].wp;
  ok('partial wp has embedded event',  wp.event && wp.event.kind === 'minigame');
  ok('event.kindId preserved',         wp.event.kindId === 'pressure_wash');
  ok('event.x/y preserved',            wp.event.x === 4 && wp.event.y === 4);
}

// -- T8 - count gate only counts matching events ---------------------
console.log('\nT8 - count gate skips non-matching events');
{
  const reg = { 'q.t8': makeSingleStep({
    kind: 'minigame', kindId: 'pressure_wash',
    reason: 'subtarget', count: 3
  }) };
  const qc = makeChain(reg);
  const cap = makeEvents();
  qc.on('waypoint', cap.push);
  qc.setActive('q.t8');
  qc.onMinigameExit('pressure_wash', 'complete',  {});         // wrong reason
  qc.onMinigameExit('lights_out',    'subtarget', {});         // wrong kindId
  qc.onMinigameExit('pressure_wash', 'subtarget', {});         // first match
  ok('only 1 waypoint fired',  cap.events.length === 1);
  ok('progress is 1 of 3',     cap.events[0].wp.progress === 1);
}

// -- T9 - invalid kindId rejected cleanly ----------------------------
console.log('\nT9 - invalid kindId rejected');
{
  const qc = makeChain({});
  let r1, r2, r3;
  try { r1 = qc.onMinigameExit('',         'complete', {}); } catch (_) { r1 = 'THREW'; }
  try { r2 = qc.onMinigameExit(null,       'complete', {}); } catch (_) { r2 = 'THREW'; }
  try { r3 = qc.onMinigameExit(undefined,  'complete', {}); } catch (_) { r3 = 'THREW'; }
  ok('empty string returns false', r1 === false);
  ok('null returns false',         r2 === false);
  ok('undefined returns false',    r3 === false);
}

// -- T10 - payload subTargetId/floorId/x/y propagate -----------------
console.log('\nT10 - payload fields reach the predicate');
{
  const reg = { 'q.t10': makeSingleStep({
    kind: 'minigame', kindId: 'pressure_wash',
    subTargetId: 'tile_clean', floorId: '1.3.1'
  }) };
  const qc = makeChain(reg);
  qc.setActive('q.t10');
  qc.onMinigameExit('pressure_wash', 'subtarget',
    { subTargetId: 'tile_clean', floorId: '1.3.1', x: 11, y: 22 });
  ok('quest advanced via full payload match', qc.getStepIndex('q.t10') === 1);
}

// -- T11 - multiple active quests all fan out ------------------------
console.log('\nT11 - fan-out: multiple active quests each process the event');
{
  const reg = {
    'q.t11a': makeSingleStep({ kind: 'minigame', kindId: 'pressure_wash', count: 2 }),
    'q.t11b': makeSingleStep({ kind: 'minigame', kindId: 'pressure_wash' })
  };
  const qc = makeChain(reg);
  const cap = makeEvents();
  qc.on('waypoint', cap.push);
  qc.setActive('q.t11a');
  qc.setActive('q.t11b');
  qc.onMinigameExit('pressure_wash', 'complete', {});
  // q.t11a should emit 1 partial; q.t11b should complete immediately
  const emittedFor = id => cap.events.filter(e => e.questId === id).length;
  ok('q.t11a got exactly 1 waypoint (partial)', emittedFor('q.t11a') === 1);
  ok('q.t11a still at stepIndex 0',             qc.getStepIndex('q.t11a') === 0);
  ok('q.t11b got exactly 1 waypoint',           emittedFor('q.t11b') === 1);
  ok('q.t11b COMPLETED',                        qc.getState('q.t11b') === STATE.COMPLETED);
}

// -- Summary ---------------------------------------------------------
console.log('\n=== Result: ' + pass + ' passed, ' + fail + ' failed ===');
if (fail > 0) console.log('Failed:', failed.join(', '));
process.exit(fail > 0 ? 1 : 0);
