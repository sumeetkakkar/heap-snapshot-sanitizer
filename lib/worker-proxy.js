'use strict';
const {
  Worker, isMainThread
} = (() => {
  try {
    return require('worker_threads');
  } catch (ex) {
    return {};
  }
})();

if (!Worker || !isMainThread) {
  // Worker Threads not supported, or this is already running in the worker thread
  return void (module.exports = undefined);
}

const { resolve: resolvePath } = require('path');
const kWorker = Symbol('worker');
const kState = Symbol('state');
class ParserProxy {
  constructor(handler) {
    this[kWorker] = undefined;
    this[kState] = {
      handler,
      callback: undefined
    };
  }
  _invokeCallback(err, result) {
    const callback = this[kState].callback;
    if (callback) {
      callback(err, result);
    }
  }
  get _worker() {
    if (this[kWorker] === undefined) {
      const worker = this[kWorker] = new Worker(resolvePath(__dirname, 'worker.js'), { workerData: this[kState].handler });
      worker.on('exit', (code) => {
        this[kWorker] = null; // worker is done. We should not create it if it is done
        this[kState].exitcode = code;
        const msg = `Worker stopped with exit code ${code}`;
        // if (code !== 0) {
        //   console.error(new Error(msg));
        // } else {
        //   console.log(msg);
        // }
        this._invokeCallback(new Error(msg));
      });
      worker.on('message', ({name, data}) => {
        switch (name) {
          case 'complete':
            this._invokeCallback(null, data);
            break;
          case 'log':
            console.log(`[Worker]`, data);
            break;
          default:
            console.log(`Worker: ${data}`);
            break;
        }
      });
      worker.on('error', this._invokeCallback.bind(this));
    }
    return this[kWorker];
  } 

  async process(data) {
    const worker = this._worker;
    const state = this[kState];
    if (!worker) {
      throw new Error(`Worker already exited with ${state.exitcode}`);
    }
    return await new Promise((resolve, reject) => {
      state.callback = (err, result) => {
        state.callback = undefined;
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      };
      try {
        worker.postMessage({name: 'data', data});
      } catch (ex) {
        this._invokeCallback(ex);
      }
    });
  }

  end() {
    const worker = this[kWorker];
    if (worker) {
      try {
        worker.postMessage({name: 'end'});
      } catch(ex) {
        console.error(`Error sending end [${err.stack}]`);
      }
    }
  }
}
module.exports = ParserProxy;