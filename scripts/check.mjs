import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const dir of ['api', 'lib', 'scripts', 'fixtures', 'tests', 'public']) {
  for (const file of await fs.readdir(dir)) if (/\.(mjs|js)$/.test(file)) {
    const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { encoding: 'utf8' });
    if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
  }
}
JSON.parse(await fs.readFile('vercel.json', 'utf8'));
console.log('Build check passed. Static frontend and Node API functions are ready.');
