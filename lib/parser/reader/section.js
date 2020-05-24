'use strict';
const kOnData = Symbol('section:ondata');
const kOnChild = Symbol('section:onchild');
const kOnBefore = Symbol('section:onbefore');
const kOnComplete = Symbol('section:oncomplete');
const kState = Symbol('section:state');

/**
 * Base section reader
 */
class SectionReader {
  constructor(onData) {
    this[kOnData]= onData;
  }

  /**
   * Start related data checker
   * @param {Object} checker 
   */
  start(checker) {
    return checker.start(this[kOnData], this[kOnChild]);
  }
}

/**
 * Generic numbers array reader
 */
class NumbersArrayReader extends SectionReader {
  constructor(onNumbers, numbersCount) {
    super();
    this[kOnChild] = this._initNumber.bind(this);
    this[kOnComplete] = onNumbers;
    this[kState] = { values: [], maxCount: numbersCount, current: 0 };
  }
  
  /**
   * Called before number is processed
   * @param {Object} checker 
   */
  _initNumber(checker) {
    this[kState].current = 0;
    return checker.start(this._incrementNumber.bind(this));
  }

  /**
   * Called for each byte
   * @param {Byte} 
   * @param {Boolean} done 
   */
  _incrementNumber(c, done) {
    const state = this[kState];
    if (c !== undefined) {
      state.current *= 10;
      state.current += c - 0x30;
    } else {
      done = true;
    }
    if (done) {
      state.values.push(state.current);
      state.current = 0;
      if (state.values.length === state.maxCount) {
        this[kOnComplete](...state.values);
        state.values.length = 0;
      }
    }
    return c;
  }
}

/**
 * Reader for nodes. A node is defined as a combination of 6 numbers
 * type, name (string index), id, self size, children count, trace node id
 * Refer SerializeNode in https://github.com/nodejs/node/blob/master/deps/v8/src/profiler/heap-snapshot-generator.cc
 */
class NodesReader extends NumbersArrayReader {
  constructor(onNode) {
    super(onNode, 6);
  }
}

/**
 * Reader for edges. A edge is defined as a combination of 3 numbers
 * type, edge_name_or_index (edge index or edge name string index), edge to
 * Refer SerializeEdge in https://github.com/nodejs/node/blob/master/deps/v8/src/profiler/heap-snapshot-generator.cc
 */
class EdgesReader extends NumbersArrayReader {
  constructor(onEdge) {
    super(onEdge, 3);
  }
}

/**
 * Reader for locations. A location is defined as a combination of 4 numbers
 * location entry index's node index, script id, line, col
 * Refer SerializeLocation in https://github.com/nodejs/node/blob/master/deps/v8/src/profiler/heap-snapshot-generator.cc
 */
class LocationsReader extends NumbersArrayReader {
  constructor(onLocation) {
    super(onLocation, 4);
  }
}

/**
 * Reader for tracenodeinfos. A traceNodeInfos is defined as a combination of 6 numbers
 * function_id, name, script_name, script_id, line, column
 * Refer SerializeTraceNodeInfos in https://github.com/nodejs/node/blob/master/deps/v8/src/profiler/heap-snapshot-generator.cc
 */
class TraceNodeInfosReader extends NumbersArrayReader {
  constructor(OnTraceNodeInfos) {
    super(OnTraceNodeInfos, 6);
  }
}

/**
 * Reader for strings. Tracks string index.
 */
class StringsReader extends SectionReader {
  constructor(onBeforeString) {
    super();
    this[kOnChild] = this._initString.bind(this);
    this[kOnBefore] = onBeforeString;
    this[kState] = { index: 0 };
  }

  /**
   * Called before string is processed
   * @param {Object} checker 
   */
  _initString(checker) {
    const onstrdata = this[kOnBefore] && this[kOnBefore](this[kState].index++);
    return checker.start(onstrdata);
  }
}

module.exports = {
  NodesReader,
  EdgesReader,
  LocationsReader,
  TraceNodeInfosReader,
  StringsReader,
};