import { mkdir, readFile } from 'node:fs/promises';
import { createVSIX } from '@vscode/vsce';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await mkdir(new URL('../release/', import.meta.url), { recursive: true });
await createVSIX({
  packagePath: `release/${manifest.name}-${manifest.version}.vsix`,
  // Local installation only while the repository's license decision is pending.
  skipLicense: true,
  dependencies: false,
});
