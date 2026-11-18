import { context } from 'esbuild';

const watch = process.argv.includes('--watch');
const shared = { bundle: true, sourcemap: true, sourcesContent: false, logLevel: 'info' };
const builds = await Promise.all([
  context({
    ...shared,
    entryPoints: ['src/extension.ts'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/extension.js',
    external: ['vscode'],
  }),
  context({
    ...shared,
    entryPoints: ['webview/src/main.tsx'],
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    outfile: 'dist/webview/main.js',
    define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
    minify: !watch,
  }),
]);
if (watch) {
  await Promise.all(builds.map((build) => build.watch()));
} else {
  try {
    await Promise.all(builds.map((build) => build.rebuild()));
  } finally {
    await Promise.all(builds.map((build) => build.dispose()));
  }
}
