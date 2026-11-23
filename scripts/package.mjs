import { mkdir, readFile } from 'node:fs/promises';
import { createVSIX } from '@vscode/vsce';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await mkdir(new URL('../release/', import.meta.url), { recursive: true });
await createVSIX({
  packagePath:
    process.env.DUAL_MIND_PACKAGE_PATH || `release/${manifest.name}-${manifest.version}.vsix`,
  // Pin packaged README links to the release tag when preparing public artifacts.
  githubBranch: process.env.DUAL_MIND_RELEASE_REF,
  dependencies: false,
});
