import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/tests/**/*.test.js',
  version: process.env.VSCODE_TEST_VERSION || 'stable',
  // Allow slow first-time editor downloads in development and CI.
  download: { timeout: 120000 },
  launchArgs: ['--disable-extensions', '--disable-gpu', '--skip-welcome', '--skip-release-notes'],
  mocha: { ui: 'tdd', timeout: 30000 },
});
