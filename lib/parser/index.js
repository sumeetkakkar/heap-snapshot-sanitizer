'use strict';
const assert = require('assert');

const Checker = require('./checker');
const KeyReader = require('./reader/key');
const {
  NodesReader,
  EdgesReader,
  LocationsReader,
  TraceNodeInfosReader,
  StringsReader,
} = require('./reader/section');

const kHandler = Symbol('parser:handler');
const kChecker = Symbol('parser:checker');
const kLogger = Symbol('parser:logger');
const kSectionReader = Symbol('parser:section');

class Parser {
  constructor({handler, logger=console.log.bind(console)}={}) {
    assert(handler, 'data handler for heap is required');
    if (typeof handler === 'string') {
      handler = new (require(handler))({logger});
    }
    this[kHandler] = handler;
    this[kLogger] = logger;
    this[kChecker] = new Checker(this._onChild.bind(this));
  }

  /**
   * Process the chunk
   * @param {Buffer|ArrayBuffer} chunk 
   */
  process(chunk) {
    // return this[kChecker].check(byte);
    for (const [idx, c] of chunk.entries()) {
      const result = this[kChecker].check(c);
      // TODO: Is there any other magic we can do there?
      if (c !== result) {
        // overwrite byte
        if (typeof result !== 'number') {
          this[kLogger](`Unexpected return value ${result} for ${c} at ${idx}`);
          continue;
        }
        chunk[idx] = result;
      }
    }
    return chunk;
  }

  /**
   * Hook to let handler clean up
   */
  end() { 
    if (this[kHandler].close) {
      this[kHandler].close();
    }
  }

  // _write(byte) {
  //   if (byte !== undefined) {
  //     // write byte
  //     this._writeCb(byte);
  //   } else {
  //     this[kLogger](`Nothing to write`);
  //   }
  // }

  _onChild(checker, isKey) {
    if (isKey) {
      this[kSectionReader] = undefined;
      const keyReader = new KeyReader(this._initSection.bind(this));
      return keyReader.start(checker);
    } else {
      if (this[kSectionReader]) {
        return this[kSectionReader].start(checker);
      } else {
        // No section reader - write everything
        return checker.start();
      }
    }
  }

  _initSection(section) {
    // this[kLogger](section);
    const handler = this[kHandler];
    switch (section) {
      case 'nodes':
        if (handler.processNode) {
          this[kSectionReader] = new NodesReader(handler.processNode.bind(handler));
        }
        break;
      case 'edges':
        if (handler.processEdge) {
          this[kSectionReader] = new EdgesReader(handler.processEdge.bind(handler));
        }
        break;
      case 'locations':
        if (handler.processLocation) {
          this[kSectionReader] = new LocationsReader(handler.processLocation.bind(handler));
        }
        break;
      case 'trace_function_info_fields':
        if (handler.processTraceNodeInfos) {
          this[kSectionReader] = new TraceNodeInfosReader(handler.processTraceNodeInfos.bind(handler));
        }
        break;
      case 'strings':
        if (handler.getStringDataSanitizer) {
          this[kSectionReader] = new StringsReader(handler.getStringDataSanitizer.bind(handler));
        }
        break;
      case 'snapshot':
      case 'trace_function_infos':
      case 'trace_tree':
      case 'samples':
      default:
        // do nothing
        this[kSectionReader] = undefined;
        break;
    }
  }
}

module.exports = Parser;