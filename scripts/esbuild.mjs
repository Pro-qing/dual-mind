import { context } from 'esbuild';

const watch = process.argv.includes('--watch');
const build = await context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: true,
  sourcesContent: false,
  logLevel: 'info',
});

if (watch) {
  await build.watch();
} else {
  try {
    await build.rebuild();
  } finally {
    await build.dispose();
  }
}
