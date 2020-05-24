'use strict';

const assert = require('assert');
const { Transform } = require('stream');
const Parser = require('./parser');
const Worker = require('./worker-proxy');

const kParser = Symbol('parser');
const kProcess = Symbol('process');

const sanitizerModule = require.resolve('./sanitizer');

/**
 * Processing is done in the worker thread.
 * The data is cloned while transferring to worker thread. Not sure overall this helps
 * @param {Buffer} chunk 
 * @param {String} encoding 
 * @param {Function} callback 
 */
function processWT(chunk, encoding, callback) {
  this[kParser].process(chunk).then((result) => {
    this.push(result);
    callback();
  }).catch((err) => {
    this[kParser].end();
    // console.error(`Error during chunk processing - ${err.stack}`);
    callback(err);
  });
}
/**
 * Calls Parser.process
 * @param {Buffer} chunk 
 * @param {String} encoding 
 * @param {Function} callback 
 */
function process(chunk, encoding, callback) {
  try {
    chunk = this[kParser].process(chunk)||chunk;
  } catch (ex) {
    return void callback(ex);
  }
  this.push(chunk);
  callback();
}

class Transformer extends Transform {
  constructor(options={useWorkerThread:false}) {
    super(options);
    const handler = options.handler || sanitizerModule;
    if (Worker && options.useWorkerThread) {
      assert(typeof handler === 'string',
         `handler should be a module name when worker thread is used for processing`);
      this[kParser] = new Worker({handler});
      this[kProcess] = processWT.bind(this);
    } else {
      this[kParser] = new Parser({handler});
      this[kProcess] = process.bind(this);
    }
  }

  /**
   * 
   * @param {Buffer} chunk 
   * @param {String} encoding 
   * @param {Function} callback 
   */
  _transform(chunk, encoding, callback) {
    this[kProcess](chunk, encoding, callback);
  }

  /**
   * This will be called when there is no more 
   * written data to be consumed, but before the 
   * 'end' event is emitted signaling the end of the Readable stream.
   * @param {Function} callback 
   */
  _flush(callback) {
    this[kParser].end();
    callback();
  }
}

module.exports = Transformer;