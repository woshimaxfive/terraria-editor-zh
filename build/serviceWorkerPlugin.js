import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function serviceWorkerPlugin() {
  return {
    name: 'service-worker-version',
    writeBundle(options) {
      const outDir = options.dir || path.resolve('dist');
      const workerPath = path.join(outDir, 'service-worker.js');
      const files = fs.readdirSync(outDir, { recursive: true })
        .filter(file => file !== 'service-worker.js' && fs.statSync(path.join(outDir, file)).isFile())
        .sort();
      const hash = createHash('sha256');
      for (const file of files) {
        hash.update(file);
        hash.update(fs.readFileSync(path.join(outDir, file)));
      }
      const urls = files.map(file => './' + file.split(path.sep).join('/'));
      const worker = fs.readFileSync(workerPath, 'utf8')
        .replace('__SW_VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE_URLS__', JSON.stringify(urls));
      fs.writeFileSync(workerPath, worker, 'utf8');
    },
  };
}
