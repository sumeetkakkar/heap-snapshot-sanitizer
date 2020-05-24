'use strict';
const { isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
  throw new Error('This is for worker thread');
}

const Parser = require('./parser');
const { handler } = workerData;
const parser = new Parser({handler, logger});

function logger(msg) {
  parentPort.postMessage({name: 'log', data: msg});
}

parentPort.on('message', ({name, data}) => {
  switch(name) {
    case 'data':
      data = parser.process(data);
      parentPort.postMessage({name: 'complete', data});
      break;
    case 'end':
      parser.end();
      parentPort.removeAllListeners();
      parentPort.close();
      break;
    default:
      parentPort.postMessage({name: 'invalid'});
      break;
  };
});