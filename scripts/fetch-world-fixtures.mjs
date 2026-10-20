import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fixtures, fixtureRoot, sourceUrl } from '../tests/worldFixtures.js';

await mkdir(fixtureRoot, { recursive: true });
for (const fixture of fixtures) {
  const path = new URL(`${fixture.name}.wld`, fixtureRoot);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const cached = await readFile(path).catch(() => null);
  if (cached && hash(cached) === fixture.sha256) continue;
  const response = await fetch(`${sourceUrl}/${fixture.name}.wld`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Cannot download fixture ${fixture.name}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (hash(bytes) !== fixture.sha256) throw new Error(`Fixture checksum mismatch: ${fixture.name}`);
  await writeFile(path, bytes);
}
console.log(`World fixtures ready: ${fixtures.length} pinned SHA-256 verified files.`);
