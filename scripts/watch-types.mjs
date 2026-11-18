import { spawn } from 'node:child_process';
const projects = ['tsconfig.json', 'webview/tsconfig.json', 'tests/local/tsconfig.json'];
const children = projects.map((project) =>
  spawn(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '--watch',
      '--preserveWatchOutput',
      '-p',
      project,
    ],
    { stdio: 'inherit' },
  ),
);
let closing = false;
function close() {
  if (closing) {
    return;
  }
  closing = true;
  children.forEach((child) => child.kill());
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, close);
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
    close();
  });
  child.on('exit', (code) => {
    if (!closing) {
      process.exitCode = code || 1;
      close();
    }
  });
}
