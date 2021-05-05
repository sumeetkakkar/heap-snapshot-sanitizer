# heap-snapshot-sanitizer
Stream transform implementation to sanitize heap snapshot.
This is to redact sensitive data in the heap snapshots.
All strings which are not name of `nodes` or `edges` are obfuscated.

# why is it needed?
Heap-snapshots are helpful to diagnose memory leaks.
One reason they are discouraged in production is that they can contain sensitive data like PII.
Obfuscating strings in the heap-snapshot tries to remediate this. 

## sample usage
```javascript
  ...
  const Sanitizer = require('heap-sanpshot-santizer');
  ...

  const session = new inspector.Session();
  const fstrm = fs.createWriteStream(filename);
  const sanitizer = new Sanitizer(/*options*/);
  
  session.connect();

  sanitizer.pipe(fstrm);
  fstrm.on('error', (e) => {
    // console.error(e);
  });
  sanitizer.on('error', (e) => {
    // console.error(e);
  });
  sanitizer.on('end', function() {
    sanitizer.unpipe();
    // fstrm.end(); // unpipe should end the filestream
  });
  session.on('HeapProfiler.addHeapSnapshotChunk', (m) => {
    sanitizer.write(m.params.chunk);
    sanitizer.resume();
  });

  session.post('HeapProfiler.takeHeapSnapshot', null, (err, r) => {
    // console.log('Runtime.takeHeapSnapshot done:', err, r);
    session.disconnect();
    sanitizer.end();
  });
  ...
```

## options

* `useWorkerThread`: {Boolean} Default is `false`. The chunk is processed in the worker thread.
                     Node.js clones the chunk while passing it over to the worker thread.
