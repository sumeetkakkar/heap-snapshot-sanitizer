'use strict';

const kRedactStrings = Symbol('sanitizer:redactstrings');
const kTrackedObjNames = Symbol('sanitizer:trackednames');
const kLogger = Symbol('parser:logger');

/**
 * Tracks string which need redaction. Handles redaction
 */
class Sanitizer {
  constructor({logger=console.log.bind(console)}={}) {
    this[kRedactStrings] = new Set();
    this[kLogger] = logger;
    // This is just for tracking whether encountered string is an object/edge name.
    // This doesn't contain all object/edge names
    this[kTrackedObjNames] = new Set();
  }

  /**
   * For string index get the sanitizer. This return sanitizer only if redaction is needed
   * @param {Number} stringIdx 
   */
  getStringDataSanitizer(stringIdx) {
    const redactValue = this[kRedactStrings].has(stringIdx);
    if (redactValue) {
      // this[kLogger](`restract ${stringIdx}`);
      let first = true;
      return function stringDataSanitizer(c, done) {
        if (first || done) {
          first = false;
          return c; // 0x22 - '"'
        }
        return 0x2A; // '*'
      };
    }
    // else use default handling
  }

  // /**
  //  * A location is defined as a combination of 4 numbers
  //  * location entry index's node index, script id, line, col
  //  * Refer SerializeLocation in https://github.com/nodejs/node/blob/master/deps/v8/src/profiler/heap-snapshot-generator.cc
  //  */
  // processLocation(object_index, script_id, line, column) {
  //   // this[kLogger](`Location: ${object_index}, ${script_id}, ${line}, ${column}`);
  // }

/**
 * A traceNodeInfos is defined as a combination of 6 numbers
 * function_id, name, script_name, script_id, line, column
 * Refer SerializeTraceNodeInfos in https://github.com/nodejs/node/blob/master/deps/v8/src/profiler/heap-snapshot-generator.cc
 */
  processTraceNodeInfos(function_id, name, script_name, script_id, line, column) { // eslint-disable-line no-unused-vars
    // this[kLogger](`TraceNodeInfos: ${function_id}, ${name}, ${script_name}, ${script_id}, ${line}, ${column}`);
    this[kRedactStrings].delete(name);
    this[kRedactStrings].delete(script_name);
  }

  /**
   * A edge is defined as a combination of 3 numbers
   * type, edge_name_or_index (edge index or edge name string index), edge to
   * Refer SerializeEdge in https://github.com/nodejs/node/blob/master/deps/v8/src/profiler/heap-snapshot-generator.cc
   * https://github.com/nodejs/node/blob/6a349019da7ea79cd394101faad119db56b76bfa/deps/v8/include/v8-profiler.h#L387
   * enum Type {
   *   kContextVariable = 0,  // A variable from a function context.
   *   kElement = 1,          // An element of an array.
   *   kProperty = 2,         // A named object property.
   *   kInternal = 3,         // A link that can't be accessed from JS,
   *                          // thus, its name isn't a real property name
   *                          // (e.g. parts of a ConsString).
   *   kHidden = 4,           // A link that is needed for proper sizes
   *                          // calculation, but may be hidden from user.
   *   kShortcut = 5,         // A link that must not be followed during
   *                          // sizes calculation.
   *   kWeak = 6              // A weak reference (ignored by the GC).
   * };
   */
  processEdge(type, name_or_index, to_node) { // eslint-disable-line no-unused-vars
    // this[kLogger](`Edge: ${type}, ${name_or_index}, ${to_node}`);
    // kElement and kHidden have edge index. Others have edge->name()
    if (type !== 1 && type !== 4) {
      this[kRedactStrings].delete(name_or_index);
    }
  }

  /**
   * A node is defined as a combination of 6 numbers
   * type, name (string index), id, self size, children count, trace node id
   * Refer SerializeNode in https://github.com/nodejs/node/blob/master/deps/v8/src/profiler/heap-snapshot-generator.cc
   * https://github.com/nodejs/node/blob/6a349019da7ea79cd394101faad119db56b76bfa/deps/v8/src/profiler/heap-snapshot-generator.h#L101
   * https://github.com/nodejs/node/blob/6a349019da7ea79cd394101faad119db56b76bfa/deps/v8/include/v8-profiler.h#L423
   * enum Type {
   *   kHidden = 0,         // Hidden node, may be filtered when shown to user.
   *   kArray = 1,          // An array of elements.
   *   kString = 2,         // A string.
   *   kObject = 3,         // A JS object (except for arrays and strings).
   *   kCode = 4,           // Compiled code.
   *   kClosure = 5,        // Function closure.
   *   kRegExp = 6,         // RegExp.
   *   kHeapNumber = 7,     // Number stored in the heap.
   *   kNative = 8,         // Native object (not from V8 heap).
   *   kSynthetic = 9,      // Synthetic object, usually used for grouping
   *                        // snapshot items together.
   *   kConsString = 10,    // Concatenated string. A pair of pointers to strings.
   *   kSlicedString = 11,  // Sliced string. A fragment of another string.
   *   kSymbol = 12,        // A Symbol (ES6).
   *   kBigInt = 13         // BigInt.
   * };
   */
  processNode(type, name, id, self_size, children_count, trace_node_id) { // eslint-disable-line no-unused-vars
    //this[kLogger](`Node: ${type}, ${name}, ${id}, ${self_size}, ${children_count}, ${trace_node_id}`);
    if (type === 2) { //kString
      if (!this[kTrackedObjNames].has(name)) {
        // string is not an object name. This is potential a candidate
        this[kRedactStrings].add(name);
      }
    } else {
      // Try deleting string from restract strings set
      if (!this[kRedactStrings].delete(name)) {
        // string not in redact strings set. We may find it later
        this[kTrackedObjNames].add(name);
      }
    }
  }
}

module.exports = Sanitizer;