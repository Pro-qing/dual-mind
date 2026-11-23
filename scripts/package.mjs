import { verifyBundledPackage } from './verify-bundled-package.mjs';
import { loadManifest, verifyPrepared } from './bundled-tools.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import { createVSIX } from '@vscode/vsce';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await mkdir(new URL('../release/', import.meta.url), { recursive: true });
const packagePath =
  process.env.DUAL_MIND_PACKAGE_PATH || `release/${manifest.name}-${manifest.version}.vsix`;
await createVSIX({
  packagePath,
  // Pin packaged README links to the release tag when preparing public artifacts.
  githubBranch: process.env.DUAL_MIND_RELEASE_REF,
  dependencies: false,
});

await verifyPrepared(await loadManifest());
const checked = await verifyBundledPackage(packagePath, await loadManifest());
console.log('Verified bundled VSIX tools:', checked);
