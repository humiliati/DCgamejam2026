// ============================================================
// schema-validator.js — Draft-07 subset validator (DOC-110 P1.1)
// ============================================================
// Vanilla-JS JSON Schema validator covering only the features
// used by tools/actor-schema.json. No external deps, no build
// step, runs in the browser and in Node.
//
// Supported keywords:
//   - $ref (local only: "#/definitions/...")
//   - type (single string OR array, e.g. ["string","null"])
//   - const
//   - enum (any JSON value including null)
//   - pattern (ECMAScript regex via RegExp())
//   - minimum, maximum
//   - minLength, maxLength (string)
//   - minItems, maxItems (array)
//   - required (string[])
//   - additionalProperties: false
//   - properties (recursive)
//   - patternProperties (regex-keyed sub-schemas; matched keys
//     auto-whitelist against additionalProperties:false)
//   - items (schema OR tuple-array form)
//   - anyOf, oneOf
//
// Unsupported (warns on encounter, continues):
//   allOf, not, if/then/else, dependencies,
//   propertyNames, contains, uniqueItems, multipleOf, format
//
// Public API
// ----------
// SchemaValidator.validate(schema, value, rootSchema) → {
//   ok: boolean,
//   errors: [{ path: "/npcs/12/facing", message: "...", keyword: "enum" }]
// }
//
// SchemaValidator.validateActor(actor, rootSchema) → convenience:
//   validates against rootSchema.definitions.npcActor or enemyActor
//   based on actor.kind.
//
// Design notes
// ------------
// - Error paths use JSON Pointer form ("/a/b/0") rooted at the value
//   being validated. Callers prepend their own context (NPC id, etc.)
//   when rendering.
// - A single error per leaf violation — we do NOT expand anyOf/oneOf
//   failures into a tree of per-branch errors. Instead we report the
//   union as "matched 0 of N branches" with the closest branch's
//   error list attached for triage.
// - The validator is intentionally fail-open on unsupported keywords:
//   it logs to console.warn rather than throwing, so a schema with
//   e.g. `format: "date-time"` still validates the supported bits.
// ============================================================

var SchemaValidator = (function () {
  'use strict';

  // ── $ref resolution ────────────────────────────────────────

  function _resolveRef(ref, rootSchema) {
    if (typeof ref !== 'string' || ref.indexOf('#/') !== 0) {
      throw new Error('schema-validator: only local refs supported (got "' + ref + '")');
    }
    var parts = ref.slice(2).split('/').map(function (p) {
      // JSON Pointer escape: ~1 → /, ~0 → ~
      return p.replace(/~1/g, '/').replace(/~0/g, '~');
    });
    var cur = rootSchema;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return null;
      cur = cur[parts[i]];
    }
    return cur == null ? null : cur;
  }

  // ── Type check ─────────────────────────────────────────────

  function _jsonType(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    var t = typeof v;
    if (t === 'number') {
      return Number.isInteger(v) ? 'integer' : 'number';
    }
    return t; // string, boolean, object, undefined
  }

  function _typeMatches(expected, actual) {
    // JSON Schema: an integer also satisfies type: "number".
    if (expected === 'number' && actual === 'integer') return true;
    return expected === actual;
  }

  // ── Error construction ─────────────────────────────────────

  function _err(path, keyword, message) {
    return { path: path || '/', keyword: keyword, message: message };
  }

  function _joinPath(base, segment) {
    // JSON Pointer: slashes in segments must be escaped
    var escaped = String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
    return (base === '/' ? '' : base) + '/' + escaped;
  }

  // ── Core: validate one value against one schema ────────────

  function _validate(schema, value, path, rootSchema, errors) {
    if (schema == null || typeof schema !== 'object') return;

    // $ref — resolve and recurse. Draft-07 $ref siblings are ignored.
    if (schema.$ref) {
      var resolved = _resolveRef(schema.$ref, rootSchema);
      if (!resolved) {
        errors.push(_err(path, '$ref', 'unresolved ref "' + schema.$ref + '"'));
        return;
      }
      _validate(resolved, value, path, rootSchema, errors);
      return;
    }

    // const
    if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
      if (!_deepEqual(schema.const, value)) {
        errors.push(_err(path, 'const', 'must equal ' + JSON.stringify(schema.const)));
        return;
      }
    }

    // enum (null counts as a valid enum value)
    if (Object.prototype.hasOwnProperty.call(schema, 'enum')) {
      var found = false;
      for (var i = 0; i < schema.enum.length; i++) {
        if (_deepEqual(schema.enum[i], value)) { found = true; break; }
      }
      if (!found) {
        errors.push(_err(path, 'enum',
          'must be one of: ' + schema.enum.map(JSON.stringify).join(', ')));
      }
    }

    // type
    if (schema.type) {
      var actual = _jsonType(value);
      var expected = Array.isArray(schema.type) ? schema.type : [schema.type];
      var ok = false;
      for (var t = 0; t < expected.length; t++) {
        if (_typeMatches(expected[t], actual)) { ok = true; break; }
      }
      if (!ok) {
        errors.push(_err(path, 'type',
          'expected type ' + expected.join('|') + ', got ' + actual));
        // Short-circuit: downstream keywords assume the right type.
        return;
      }
    }

    // anyOf — short-circuit on first pass
    if (Array.isArray(schema.anyOf)) {
      var branchErrors = [];
      var anyMatched = false;
      for (var a = 0; a < schema.anyOf.length; a++) {
        var be = [];
        _validate(schema.anyOf[a], value, path, rootSchema, be);
        if (be.length === 0) { anyMatched = true; break; }
        branchErrors.push(be);
      }
      if (!anyMatched) {
        errors.push(_err(path, 'anyOf',
          'matched 0 of ' + schema.anyOf.length + ' branches' +
          _shortestBranchSummary(branchErrors)));
      }
    }

    // oneOf — must match exactly one
    if (Array.isArray(schema.oneOf)) {
      var matched = 0;
      var oneBranchErrors = [];
      for (var o = 0; o < schema.oneOf.length; o++) {
        var oe = [];
        _validate(schema.oneOf[o], value, path, rootSchema, oe);
        if (oe.length === 0) matched++;
        else oneBranchErrors.push(oe);
      }
      if (matched !== 1) {
        errors.push(_err(path, 'oneOf',
          'matched ' + matched + ' of ' + schema.oneOf.length + ' branches (need exactly 1)' +
          (matched === 0 ? _shortestBranchSummary(oneBranchErrors) : '')));
      }
    }

    // Per-type keywords
    var actualType = _jsonType(value);

    if (actualType === 'string') {
      if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
        errors.push(_err(path, 'minLength',
          'length ' + value.length + ' < minLength ' + schema.minLength));
      }
      if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
        errors.push(_err(path, 'maxLength',
          'length ' + value.length + ' > maxLength ' + schema.maxLength));
      }
      if (schema.pattern) {
        var re;
        try { re = new RegExp(schema.pattern); }
        catch (e) {
          errors.push(_err(path, 'pattern', 'invalid regex: ' + e.message));
          return;
        }
        if (!re.test(value)) {
          errors.push(_err(path, 'pattern',
            'does not match pattern /' + schema.pattern + '/'));
        }
      }
    }

    if (actualType === 'integer' || actualType === 'number') {
      if (typeof schema.minimum === 'number' && value < schema.minimum) {
        errors.push(_err(path, 'minimum',
          value + ' < minimum ' + schema.minimum));
      }
      if (typeof schema.maximum === 'number' && value > schema.maximum) {
        errors.push(_err(path, 'maximum',
          value + ' > maximum ' + schema.maximum));
      }
    }

    if (actualType === 'array') {
      if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
        errors.push(_err(path, 'minItems',
          'length ' + value.length + ' < minItems ' + schema.minItems));
      }
      if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
        errors.push(_err(path, 'maxItems',
          'length ' + value.length + ' > maxItems ' + schema.maxItems));
      }
      if (schema.items) {
        if (Array.isArray(schema.items)) {
          // Tuple form: each index validated against its own schema
          for (var ti = 0; ti < Math.min(value.length, schema.items.length); ti++) {
            _validate(schema.items[ti], value[ti], _joinPath(path, ti), rootSchema, errors);
          }
        } else {
          // Single-schema form
          for (var si = 0; si < value.length; si++) {
            _validate(schema.items, value[si], _joinPath(path, si), rootSchema, errors);
          }
        }
      }
    }

    if (actualType === 'object') {
      // required
      if (Array.isArray(schema.required)) {
        for (var r = 0; r < schema.required.length; r++) {
          var key = schema.required[r];
          if (!Object.prototype.hasOwnProperty.call(value, key)) {
            errors.push(_err(path, 'required', 'missing required field "' + key + '"'));
          }
        }
      }
      // properties
      var knownKeys = {};
      if (schema.properties) {
        for (var pk in schema.properties) {
          if (!Object.prototype.hasOwnProperty.call(schema.properties, pk)) continue;
          knownKeys[pk] = true;
          if (Object.prototype.hasOwnProperty.call(value, pk)) {
            _validate(schema.properties[pk], value[pk],
              _joinPath(path, pk), rootSchema, errors);
          }
        }
      }
      // patternProperties — each value key that matches a pattern is
      // validated against that pattern's schema, and the pattern match
      // also whitelists the key against additionalProperties: false.
      var patternSchemas = null;
      if (schema.patternProperties && typeof schema.patternProperties === 'object') {
        patternSchemas = [];
        for (var patKey in schema.patternProperties) {
          if (!Object.prototype.hasOwnProperty.call(schema.patternProperties, patKey)) continue;
          try {
            patternSchemas.push({ re: new RegExp(patKey), sub: schema.patternProperties[patKey] });
          } catch (reErr) {
            console.warn('[schema-validator] invalid patternProperties regex "' + patKey + '" at ' + path);
          }
        }
        // Walk value keys, test against each pattern
        for (var vkp in value) {
          if (!Object.prototype.hasOwnProperty.call(value, vkp)) continue;
          for (var pi = 0; pi < patternSchemas.length; pi++) {
            if (patternSchemas[pi].re.test(vkp)) {
              knownKeys[vkp] = true;
              _validate(patternSchemas[pi].sub, value[vkp],
                _joinPath(path, vkp), rootSchema, errors);
            }
          }
        }
      }
      // additionalProperties: false
      if (schema.additionalProperties === false) {
        for (var vk in value) {
          if (!Object.prototype.hasOwnProperty.call(value, vk)) continue;
          if (!knownKeys[vk]) {
            errors.push(_err(_joinPath(path, vk), 'additionalProperties',
              'unknown field "' + vk + '"'));
          }
        }
      }

      // Warn — unsupported object-level keywords
      if (schema.propertyNames || schema.dependencies) {
        console.warn('[schema-validator] unsupported object keyword in schema at ' + path +
          ' — silently skipped (propertyNames/dependencies).');
      }
    }

    // Warn — unsupported global keywords
    if (schema.allOf || schema.not || schema['if'] || schema.then || schema['else']) {
      console.warn('[schema-validator] unsupported logical keyword in schema at ' + path +
        ' — silently skipped (allOf/not/if/then/else).');
    }
  }

  // anyOf/oneOf produce a pile of per-branch errors; we surface only
  // the shortest branch since it's almost always the correct one when
  // the caller intended that shape (e.g. anyOf:[null, {$ref:...}]).
  function _shortestBranchSummary(branchErrors) {
    if (!branchErrors.length) return '';
    var shortest = branchErrors[0];
    for (var i = 1; i < branchErrors.length; i++) {
      if (branchErrors[i].length < shortest.length) shortest = branchErrors[i];
    }
    if (!shortest.length) return '';
    var first = shortest[0];
    return ' (closest: ' + first.path + ' ' + first.keyword + ' — ' + first.message + ')';
  }

  // ── Deep equality for const/enum ──────────────────────────

  function _deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) {
        if (!_deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    var ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (var k = 0; k < ak.length; k++) {
      if (!Object.prototype.hasOwnProperty.call(b, ak[k])) return false;
      if (!_deepEqual(a[ak[k]], b[ak[k]])) return false;
    }
    return true;
  }

  // ── Public API ─────────────────────────────────────────────

  function validate(schema, value, rootSchema) {
    var errors = [];
    _validate(schema, value, '/', rootSchema || schema, errors);
    return { ok: errors.length === 0, errors: errors };
  }

  /**
   * Convenience: route an actor to the right subschema based on its
   * `kind` field. Returns the same shape as validate().
   *
   * Actors with no `kind` are rejected upfront since neither npcActor
   * nor enemyActor would accept them.
   */
  function validateActor(actor, rootSchema) {
    if (!actor || typeof actor !== 'object') {
      return { ok: false, errors: [_err('/', 'type', 'actor must be an object')] };
    }
    var defs = rootSchema && rootSchema.definitions;
    if (!defs || (!defs.npcActor && !defs.enemyActor)) {
      return { ok: false, errors: [_err('/', '$ref',
        'rootSchema missing definitions.npcActor or definitions.enemyActor')] };
    }
    var sub;
    if (actor.kind === 'npc') sub = defs.npcActor;
    else if (actor.kind === 'enemy') sub = defs.enemyActor;
    else {
      return { ok: false, errors: [_err('/kind', 'const',
        'actor.kind must be "npc" or "enemy" (got ' + JSON.stringify(actor.kind) + ')')] };
    }
    return validate(sub, actor, rootSchema);
  }

  return {
    validate: validate,
    validateActor: validateActor,
    // Exposed for tests + tooling that wants raw ref resolution
    _resolveRef: _resolveRef
  };
})();

// Node / CommonJS export for the Node test harness.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SchemaValidator;
}
