'use strict';

const kOnData = Symbol('checker:ondata');
const kOnChild = Symbol('checker:onchild');
const kState = Symbol('checker:state');

/**
 * Checks byte belongs to the data element being processed.
 * onData: Optional hook to custom process byte, and return an alternate value if needed. `done` is passed as second parameter to onData to indicate end.
 *         Byte passed in can be undefined if the check determines out of bound for the data (ex: for Number)
 * onChild: When processing of a new child element starts, onChild is invoked. The new child checker object is passed in.
 *          Caller is responsible to call the checker.start. This also allows setting optional onData and onChild for the new checker.
 */
class Checker {
  constructor(context, c) {
    this[kState] = { 
      done: false,
      context,
      parent: context.checker,
      first: c,
      // child: null,
    };
    // Set current checker
    context.checker = this;
  }

  /**
   * Start. Lets delayed setting of onData, onChild
   * @param {Function} onData 
   * @param {Function} onChild 
   */
  start(onData, onChild) {
    const c = this[kState].first;
    this[kOnData] = onData;
    this[kOnChild] = onChild;
    return (c !== undefined && onData) ? onData(c) : c;
  }

  /**
   * Close the checker
   */
  _close() {
    this[kOnData] = undefined;
    this[kOnChild] = undefined;
    const state = this[kState];
    state.context.checker = state.parent;
    state.parent = undefined;
    state.done = true;
  }

  /**
   * Abstract check
   */
  check() {
    return false;
  }

  /**
   * Is space static helper
   * @param {Byte} c 
   */
  static isSpace(c) {
    switch (c) {
      case 0x20: // Space
      case 0x9: // Horizontal Tab
      case 0xD: // Carriage Return
      case 0xA: // Line Feed - New Line
      case 0xB: // Vertical Tab
      case 0xC: // Form Feed
        return true;
    }
    return false;
  }

  /**
   * Is numeric static helper
   * @param {Byte} c 
   */
  static isNumeric(c) {
    return c >= 0x30 && c <= 0x39;
  }

  /**
   * Is alphabet static helper
   * @param {Byte} c 
   */
  static isAlpha(c) {
    return (c >= 0x41 && c <= 0x5A) ||
            (c >= 0x61 && c <= 0x7A);
  }

  /**
   * Is alphanumeric static helper
   * @param {Byte} c 
   */
  static isAlphaNumeric(c) {
    return Checker.isAlpha(c) || Checker.isNumeric(c);
  }

  /**
   * Checks character to determine the type of the element 
   * and initiate checker for that.
   * @param {Object} context 
   * @param {Byte} c 
   */
  static getChecker(context, c) {
    switch (c) {
      case 0x5B: // '['
        return new ArrayChecker(context, c);
      case 0x7B: // '{'
        return new ObjectChecker(context, c);
      case 0x22: // '"'
        return new StringChecker(context, c);
    }
    if (Checker.isNumeric(c)) {
      return new NumberChecker(context, c);
    }
    if (!Checker.isSpace(c)) {
      console.error(`Unable to get handler for ${c}`);
    }
  }
}

/**
 * This is for string i.e. of form `"..."`
 */
class StringChecker extends Checker {
  /**
   * @param {Byte} c 
   */
  check(c) {
    const state = this[kState];
    if (state.done) return false;
    const ondata = this[kOnData];
    if (state.escaping) {
      state.escaping = false;
    } else {
      switch (c) {
        case 0x22: // '"'
          this._close();
          break;
        case 0x5C:  // '\'
          state.escaping = true;
          break;
      }
    }
    return (ondata) ? ondata(c, state.done) : c;
  }
}

/**
 * This is for number i.e. of form `1234`. This is bit lenient and supports forms like 0x2A.
 */
class NumberChecker extends Checker {
  /**
   * @param {Byte} c 
   */
  check(c) {
    const state = this[kState];
    if (state.done) return false;
    const ondata = this[kOnData];
    if (!Checker.isAlphaNumeric(c)) {
      this._close();
      ondata && ondata(undefined, true);
      return false;
    }
    return (ondata) ? ondata(c) : c;
  }
}

/**
 * This is for array i.e. of form `[...]`
 */
class ArrayChecker extends Checker {
  /**
   * @param {Byte} c 
   */
  check(c) {
    const state = this[kState];
    // if (state.child) {
    //   const result = state.child.check(c);
    //   if (result !== false) {
    //     return result;
    //   }
    //   // This means end of the child. Typically there would be ',' or space
    //   state.child = null;
    // }
    if (state.done) return false;
    const ondata = this[kOnData];
    if (c === 0x5D) { // ']'
      this._close();
    } else if (c !== 0x2C) { // ','
      const child = /*state.child =*/ Checker.getChecker(state.context, c);
      if (child) {
        // child.start would have handled the data
        if (this[kOnChild]) {
          // child.start would have called the onchild callback
          return this[kOnChild](child);
        } else {
          return child.start(ondata);
        }
      }
    }
    return (ondata) ? ondata(c, state.done) : c;
  }
}
/**
 * This is for object i.e. of form `{...}`
 */
class ObjectChecker extends Checker {
  constructor() {
    super(...arguments);
    this[kState].isKey = false;
  }
  /**
   * @param {Byte} c 
   */
  check(c) {
    const state = this[kState];
    // if (state.child) {
    //   const result = state.child.check(c);
    //   if (result !== false) {
    //     return result;
    //   }
    //   // This means end of the child. Typically there would be ',' or space
    //   state.child = null;
    // }
    if (state.done) return false;
    const ondata = this[kOnData];
    if (c === 0x7D) { // '}'
      this._close();
    } else if (c !== 0x2C && // ','
                  c !== 0x3A) { // :
      const child = /*state.child =*/ Checker.getChecker(state.context, c);
      if (child) {
        state.isKey = !state.isKey; // Flip
        // child start would have handled the data
        if (this[kOnChild]) {
          // child.start would have called the onchild callback
          return this[kOnChild](child, state.isKey);
        } else {
          return child.start(ondata);
        }
      }
    }
    return (ondata) ? ondata(c, state.done) : c;
  }
}

/**
 * Special checker where we know this is only one character
 */
class OneCharChecker extends Checker {
  constructor(context, onData) {
    super(context);
    this[kOnData] = onData;
  }
  /**
   * @param {Byte} c 
   */
  check(c) {
    if (this[kState].done) return false;
    const ondata = this[kOnData];
    this._close();
    return (ondata) ? ondata(c, true) : c;
  }
}

/**
 * This is main checker for an object element.
 * The first character '{' has to be specially handled.
 */
class MainChecker extends ObjectChecker {
  constructor(onChild) {
    super({checker: undefined});
    const context = this[kState].context;
    context.checker = undefined; // Special case MainChecker
    this[kOnChild] = onChild;
    /* this[kState].child =*/ new OneCharChecker(context);
  }

  check(c) {
    const context = this[kState].context;
    if (context.checker) {
      const result = context.checker.check(c);
      // Numbers need one more call to close
      if (result !== false) {
        return result;
      }
    }
    return (context.checker) ?
        context.checker.check(c) :
        super.check(c);
  }
}

module.exports = MainChecker;