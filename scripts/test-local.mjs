import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';

const files = (await readdir('tests/local'))
  .filter((name) => /\.test\.tsx?$/.test(name))
  .map((name) => `tests/local/${name}`);
await build({
  entryPoints: files,
  outdir: 'out/local-tests',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  jsx: 'automatic',
  sourcemap: true,
});
const outputs = files.map(
  (file) =>
    `out/local-tests/${file
      .split('/')
      .at(-1)
      .replace(/\.tsx?$/, '.cjs')}`,
);
const child = spawn(process.execPath, ['--test', '--test-timeout=30000', ...outputs], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test' },
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
