'use strict';
const inspector = require('inspector');
const fs = require('fs');
const http = require('http');
const url = require('url');
const path = require('path');
const { performance } = require('perf_hooks');
const { PassThrough } = require('stream');
const Sanitizer = require('../lib/index');

function getUniqueFilename(basedir='.', suffix) {
  return path.join(basedir, `${new Date().toJSON().replace(/[-\s:TZ\.]/g,'')}${suffix}.heapsnapshot`); // eslint-disable-line no-useless-escape
}

// const fsPromises = fs.promises;
// const tmp = (function () {
//   const tmpfolder = path.join(process.cwd(), '.tmp');
//   return {
//     async init() {
//       try {
//         await fsPromises.mkdir(tmpfolder);
//       } catch (ex) {
//         if (ex.code !== 'EEXIST') throw ex;
//       }
//     },
//     async clean() {
//       try {
//         const files = await fsPromises.readdir(tmpfolder);
//         for (const file of files) {
//           await fsPromises.unlink(path.join(tmpfolder, file));
//         }
//         await fsPromises.rmdir(tmpfolder);
//       } catch (ex) {
//         if (ex.code !== 'ENOENT') throw ex;
//       }
//     },
//     get filename() {
//       return getUniqueFilename(tmpfolder, getUniqueFilename());
//     }
//   };
// })();

async function captureHeap(sanitizer, filename) {
  console.log('[HeapProfiler] start heapsnapshot capture');
  const session = new inspector.Session();

  // const fd = fs.openSync(filename.replace(/\.(\w+)$/,'.$1.org'), 'w');
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
      // fs.writeSync(fd, m.params.chunk);
    });

    session.post('HeapProfiler.takeHeapSnapshot', null, (err, r) => {
      console.log('[HeapProfiler] takeHeapSnapshot done:', err, r);
      session.disconnect();
      sanitizer.end();
      // fs.closeSync(fd);
    });
  });
}

const port = 8111;
const targetDir = path.resolve(__dirname, '..', 'snapshots');
const server = http.createServer().listen(port, () => {
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);
  console.log(`http://127.0.0.1:${port}/?usr_email=john.doe@gmail.com&usr_pwd=change.me&usr_ssn=999-999-999[&redact=true&useworker=true]`);
});
server.on('request', async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  for (const [key, value] of Object.entries(reqUrl.query)) {
    if (!['redact','useworker'].includes(key)) console.log(`[Senstive data]`, key, value);
  }
  const redact = ['true','1'].includes(reqUrl.query.redact);
  const useWorkerThread = ['true','1'].includes(reqUrl.query.useworker);
  const sanitizer = redact && new Sanitizer({useWorkerThread}) || new PassThrough();
  const stTS = performance.now();
  try {
    const filename = await captureHeap(sanitizer, 
      getUniqueFilename(targetDir, `-${sanitizer.constructor.name.toLowerCase()}`));
    console.log(`Time Taken: ${performance.now() - stTS}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(filename);
  } catch (ex) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(ex.stack);
  }
});
