'use strict';

const inspector = require('inspector');
const fs = require('fs');
const assert = require('assert');
const readline = require('readline');
const url = require('url');
const http = require('http');
const { PassThrough } = require('stream');
const Sanitizer = require('../lib/index');

async function request(port) {
  const rurl = `http://127.0.0.1:${port}/?usr_email=john.doe@gmail.com&usr_pwd=change.me&usr_ssn=999-999-999`;
  return await new Promise((resolve, reject)=>{
    const req = http.request(rurl, (res) => {
      const { statusCode } = res;
      let rawdata = '';
      res.on('data', (chunk) => { rawdata+=chunk; });
      res.on('end', () => {
        if (statusCode >= 400) {
          reject(new Error(rawdata||`Unexpected error: ${statusCode}`));
        } else {
          resolve(rawdata);
        }
      });
    }).on('error', (e) => {
      reject(e);
    });
    req.end();
  });
}

async function startServer() {
  return await new Promise((resolve) => {
    const server = http.createServer().listen(() => {
      resolve(server);
    });
  });
}

async function captureHeap(sanitizer, filename) {
  console.log('[HeapProfiler] start heapsnapshot capture');
  const session = new inspector.Session();

  const fstrm = filename && fs.createWriteStream(filename);

  session.connect();

  fstrm && sanitizer.pipe(fstrm);

  return await new Promise((resolve, reject) => {
    let done = (err, result) => {
      if (err) reject(err);
      else resolve(result);
      done = () => {};
    };
    if (fstrm) {
      fstrm.on('error', (err) => {
        console.error(`HeapProfiler] Error writing heapsnapshot`, err);
        done(err);
      });
    }
    sanitizer.on('error', (err) => {
      console.error(`HeapProfiler] Error during sanitize`, err);
      done(err);
    });
    sanitizer.on('end', () => {
      console.log('[HeapProfiler] processing end');
      sanitizer.unpipe();
      fstrm && fstrm.end();
      done(null, filename);
    });
    session.on('HeapProfiler.addHeapSnapshotChunk', (m) => {
      sanitizer.write(m.params.chunk); sanitizer.resume();
    });

    session.post('HeapProfiler.takeHeapSnapshot', null, (err, r) => {
      console.log('[HeapProfiler] takeHeapSnapshot done:', err, r);
      session.disconnect();
      sanitizer.end();
    });
  });
}

function initiateCapture(server, sanitizer, filename) {
  server.removeAllListeners('request');

  server.on('request', async (req, res) => {
    const reqUrl = url.parse(req.url, true);
    for (const [key, value] of Object.entries(reqUrl.query)) {
      console.log(`[Senstive data]`, key, value);
    }
    try {
      await captureHeap(sanitizer, filename);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(filename);
    } catch (ex) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(ex.stack);
    }
  });
}

async function getMatchCount(stream, regexp) {
  // Note: we use the crlfDelay option to recognize all instances of CR LF
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });
  const STRINGS_START_EX = /^"strings":\["/;
  const STRINGS_END_EX = /"\]\}$/;
  const stringsChecks = [ STRINGS_START_EX, STRINGS_END_EX ];
  let count = 0;
  for await (const line of rl) {
    // Each line in the stream will be successively available here as `line`.
    if (stringsChecks.length > 0 && stringsChecks[0].test(line)) {
      stringsChecks.shift();
    } else if (stringsChecks.length === 1) {
      // Processing strings. Check the pattern
      if (regexp.test(line)) count++;
    }
  }
  // if strings section is not fully processed return -1
  return (stringsChecks.length > 0) ? -1 : count;
}

describe('transform', function () {
  let server, port;

  before(async ()=>{
    inspector.open(7777);
    server = await startServer();
    port = server.address().port;
  });

  after(async () => {
    if (server) server.close();
  });

  const SENSITIVE_RX = /(john\.doe@gmail\.com|change\.me|999-\d\d\d-999)/;
  it('default: should contain sensitive data', async function () {
    this.timeout(10000);
    const sanitizer = new PassThrough();
    initiateCapture(server, sanitizer);
    const cpromise = getMatchCount(sanitizer, SENSITIVE_RX);
    await request(port);
    const linecount = await cpromise;
    if (linecount < 0) {
      assert.fail('strings section not found');
    } else {
      assert(linecount > 0, 'lines containing sensitive data should exist');
    }
  });

  it('sanitized: should not contain sensitive data', async function () {
    this.timeout(10000);
    const sanitizer = new Sanitizer();
    initiateCapture(server, sanitizer);
    const cpromise = getMatchCount(sanitizer, SENSITIVE_RX);
    await request(port);
    const linecount = await cpromise;
    if (linecount < 0) {
      assert.fail('strings section not found');
    } else {
      assert.equal(linecount, 0, 'lines containing sensitive data should not exist');
    }
  });

  it('sanitized: should not contain sensitive data - worker thread', async function () {
    this.timeout(10000);
    const sanitizer = new Sanitizer({useWorkerThread:true});
    initiateCapture(server, sanitizer);
    const cpromise = getMatchCount(sanitizer, SENSITIVE_RX);
    await request(port);
    const linecount = await cpromise;
    if (linecount < 0) {
      assert.fail('strings section not found');
    } else {
      assert.equal(linecount, 0, 'lines containing sensitive data should not exist');
    }
  });
});