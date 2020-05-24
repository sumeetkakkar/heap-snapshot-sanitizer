'use strict';

const kOnComplete = Symbol('key:oncomplete');
const kState = Symbol('key:state');

/**
 * Handles key data
 */
class KeyReader {
  constructor(onComplete) {
    this[kState] = { buf: new Uint8Array(256), size : 0 };
    this[kOnComplete] = onComplete
  }

  /**
   * Start related data checker. This should be string checker
   * @param {Object} checker 
   */
  start(checker) {
    return checker.start(this._setChar.bind(this));
  }

  /**
   * Called for each string byte
   * @param {Byte} c 
   * @param {Boolean} done 
   */
  _setChar(c, done) {
    const state = this[kState];
    if (c !== undefined) {
      if (state.size < state.buf.length) { // Safety
        state.buf[state.size] = c;
        state.size++;
      }
    } else {
      done = true;
    }
    if (done) {
      const key = String.fromCharCode(...state.buf.slice(1, state.size-1));
      this[kOnComplete] && this[kOnComplete](key);
    }
    return c;
  }
}

module.exports = KeyReader;