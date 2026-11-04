import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('.next');
if (!existsSync(resolve(root, 'BUILD_ID'))) throw new Error('Build frontend before artifact inspection');
let inspected = 0;
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.name.endsWith('.js')) {
      inspected++;
      const source = readFileSync(path, 'utf8');
      if (['Local synthetic OAuth', 'e2e-synthetic-secret', 'E2eApplication', 'LocalOAuthProvider'].some(marker => source.includes(marker)))
        throw new Error('Test auth fixture found in frontend artifact');
    }
  }
}
visit(resolve(root, 'static'));
visit(resolve(root, 'server'));
if (inspected === 0) throw new Error('No built JavaScript inspected');
process.stdout.write('e2e_frontendArtifact_excludesTestAuth: PASS\n');