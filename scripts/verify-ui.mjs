/* global window, document, getComputedStyle */
import { _electron } from 'playwright-core';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join, dirname } from 'node:path';

const root = process.cwd();
const executable =
  process.env.VSCODE_TEST_EXECUTABLE ||
  (await downloadAndUnzipVSCode(process.env.VSCODE_TEST_VERSION || 'stable'));
const version = JSON.parse(
  await readFile(join(dirname(executable), 'resources/app/package.json'), 'utf8'),
).version;
const artifacts = resolve('.vscode-test/ui-validation', version);
await mkdir(artifacts, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), 'dualmind-ui-'));
const profile = join(temporary, 'profile');
const workspace = join(temporary, 'workspace');
const otherWorkspace = join(temporary, 'other-workspace');
for (const folder of [
  join(profile, 'User'),
  workspace,
  otherWorkspace,
  join(temporary, 'extensions'),
]) {
  await mkdir(folder, { recursive: true });
}
await writeFile(
  join(profile, 'User/settings.json'),
  JSON.stringify({
    'workbench.startupEditor': 'none',
    'security.workspace.trust.enabled': false,
    'workbench.colorTheme': 'Dark Modern',
    'window.commandCenter': false,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'workbench.activityBar.location': 'default',
    'chat.disableAIFeatures': true,
    'git.enabled': false,
    'window.restoreWindows': 'none',
  }),
);
// A disposable repository proves draft/settings/query flows never prepare task branches.
const gitEnvironment = { ...process.env };
for (const key of Object.keys(gitEnvironment)) {
  if (key.startsWith('GIT_')) {
    delete gitEnvironment[key];
  }
}
const testGitConfig = join(temporary, 'gitconfig');
await writeFile(testGitConfig, '');
Object.assign(gitEnvironment, {
  GIT_CONFIG_GLOBAL: testGitConfig,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
});
const execGit = promisify(execFile);
const fixtureGit = async (...args) =>
  (
    await execGit(
      'git',
      ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args],
      { cwd: workspace, env: gitEnvironment, timeout: 10000, maxBuffer: 2 * 1024 * 1024 },
    )
  ).stdout;
await fixtureGit('init');
await fixtureGit('config', 'user.name', 'DualMind UI Test');
await fixtureGit('config', 'user.email', 'ui-test@example.invalid');
await writeFile(join(workspace, 'fixture.txt'), 'Isolated UI fixture.\n');
await fixtureGit('add', '--', 'fixture.txt');
await fixtureGit('commit', '-m', 'UI fixture');
await fixtureGit('branch', 'ui-target');
const originalBranch = (await fixtureGit('symbolic-ref', '--short', 'HEAD')).trim();
const initialBranches = await fixtureGit('for-each-ref', '--format=%(refname)', 'refs/heads/');
const initialWorktrees = await fixtureGit('worktree', 'list', '--porcelain');
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
let app;
const captures = [];
const testKey = 'dualmind-local-ui-test-key';
const modelIds = [
  'example-model-alpha',
  'example-model-beta',
  ...Array.from({ length: 40 }, (_, i) => `example-model-${i + 1}`),
];
const requests = [];
let responseMode = 'success';
const inferenceRequests = [];
let holdWorker = false;
let readingOnly = false;
let longCommand = false;
let workerRequestObserved;
let workerTurns = 0,
  reviewTurns = 0;
const server = createServer((request, response) => {
  if (
    request.method === 'POST' &&
    request.headers.authorization === `Bearer ${testKey}` &&
    (request.url?.endsWith('/chat/completions') || request.url?.endsWith('/responses'))
  ) {
    let raw = '';
    request.on('data', (chunk) => {
      raw += String(chunk);
    });
    request.on('end', () => {
      const body = JSON.parse(raw);
      const worker = body.tools.some((tool) => (tool.function?.name || tool.name) === 'write_file');
      inferenceRequests.push({ worker, body, path: request.url });
      const turn = worker ? ++workerTurns : ++reviewTurns;
      if (worker && holdWorker) {
        workerRequestObserved?.();
        return;
      }
      const planning = body.tools.some(
        (tool) => (tool.function?.name || tool.name) === 'submit_plan',
      );
      const messages = body.messages || body.input;
      const handoff = messages
        .flatMap((m) => {
          if (m.role !== 'user') {
            return [];
          }
          try {
            const value = JSON.parse(m.content);
            return value.handoff === 'worker_artifacts' ? [value] : [];
          } catch {
            return [];
          }
        })
        .at(-1);
      const commandIds = messages
        .flatMap((m) => {
          if (m.role !== 'tool' && m.type !== 'function_call_output') {
            return [];
          }
          try {
            const value = JSON.parse(m.content || m.output);
            return value.purpose === 'verify' && value.id ? [value.id] : [];
          } catch {
            return [];
          }
        })
        .slice(-1);
      const plan = {
        objective: 'Write fixed to result.txt',
        requirements: 'Provide the requested artifact',
        steps: ['Inspect related files', 'Write and verify result.txt'],
        criteria: [
          {
            id: 'result',
            description: 'result.txt contains fixed',
            verification: readingOnly ? 'reading' : 'command',
            evidence: 'Inspect result.txt and actual execution evidence',
            reason: readingOnly ? 'A plain text document can be directly inspected' : '',
          },
        ],
        revisionReason: planning ? '' : 'Repair the failed artifact and provide new evidence',
      };
      const step = (turn - 1) % (readingOnly ? 2 : 3);
      const approve = (handoff?.round ?? 0) > 1;
      const call = planning
        ? { name: 'submit_plan', arguments: JSON.stringify(plan) }
        : worker
          ? step === 0
            ? {
                name: 'write_file',
                arguments: JSON.stringify({
                  path: 'result.txt',
                  content: longCommand || turn > 1 ? 'fixed' : 'bad',
                }),
              }
            : !readingOnly && step === 1
              ? {
                  name: 'run_command',
                  arguments: JSON.stringify({
                    name: 'Verify result',
                    program: process.execPath,
                    args: [
                      '-e',
                      longCommand
                        ? 'require("node:fs").writeFileSync("command-started",String(process.pid));setInterval(()=>{},1000)'
                        : 'if(require("node:fs").readFileSync("result.txt","utf8")!=="fixed")process.exit(1)',
                    ],
                    purpose: 'verify',
                    criterionIds: ['result'],
                  }),
                }
              : {
                  name: 'finish_work',
                  arguments: JSON.stringify({
                    summary: 'Updated result.txt for acceptance.',
                    completedSteps: ['Updated artifact'],
                    evidence: [
                      {
                        criterionId: 'result',
                        commandIds: readingOnly ? [] : commandIds,
                        evidence: 'Inspect the saved artifact',
                      },
                    ],
                    unresolved: [],
                  }),
                }
          : {
              name: 'submit_review',
              arguments: JSON.stringify({
                verdict: approve ? 'approve' : 'changes_requested',
                summary: approve ? 'Artifact accepted.' : 'Fix the failed artifact.',
                acceptance: [
                  {
                    criterionId: 'result',
                    passed: approve,
                    commandIds: handoff?.submission?.evidence?.[0]?.commandIds ?? [],
                    evidence: 'Inspected the actual result.txt and supplied host evidence',
                  },
                ],
                ...(approve ? {} : { nextPlan: plan }),
              }),
            };
      const id = `${worker ? 'worker' : 'reviewer'}-${turn}`;
      response.setHeader('Content-Type', 'text/event-stream');
      const events = request.url.endsWith('/responses')
        ? [
            { type: 'response.output_text.delta', delta: 'Reviewing the task artifact.\n' },
            {
              type: 'response.completed',
              response: {
                status: 'completed',
                output: [
                  { type: 'reasoning', encrypted_content: 'reviewer-private-state' },
                  { type: 'function_call', id: `item-${id}`, call_id: id, ...call },
                ],
              },
            },
          ]
        : [
            {
              choices: [
                {
                  index: 0,
                  delta: {
                    content: 'Working on the isolated task artifact.\n',
                    tool_calls: [{ index: 0, id, type: 'function', function: call }],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            },
            '[DONE]',
          ];
      response.end(
        events
          .map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`)
          .join(''),
      );
    });
    return;
  }

  requests.push({
    method: request.method,
    url: request.url,
    authorized: request.headers.authorization === `Bearer ${testKey}`,
    hasBody: Boolean(request.headers['content-length'] || request.headers['transfer-encoding']),
  });
  response.setHeader('Content-Type', 'application/json');
  if (
    request.headers.authorization !== `Bearer ${testKey}` ||
    request.method !== 'GET' ||
    !request.url?.endsWith('/v1/models')
  ) {
    response.writeHead(403);
    response.end('{}');
    return;
  }
  if (responseMode === 'failure') {
    response.writeHead(503);
    response.end('{}');
    return;
  }
  response.end(
    JSON.stringify({ data: (responseMode === 'empty' ? [] : modelIds).map((id) => ({ id })) }),
  );
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const apiUrl = `http://127.0.0.1:${server.address().port}/v1`;

async function launch(folder = workspace) {
  app = await _electron.launch({
    executablePath: executable,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--password-store=basic',
      ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : []),
      '--force-device-scale-factor=1',
      '--skip-welcome',
      '--skip-release-notes',
      `--user-data-dir=${profile}`,
      `--extensions-dir=${join(temporary, 'extensions')}`,
      `--extensionDevelopmentPath=${root}`,
      folder,
    ],
    env: environment,
    timeout: 45000,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await page.waitForSelector('.monaco-workbench');
  await size(1600, 1100);
  return page;
}
async function size(width, height) {
  const page = await app.firstWindow();
  // VS Code restores saved bounds asynchronously during startup. Reapply if that
  // restoration races our requested size, while still verifying the real viewport.
  for (let attempt = 0; attempt < 3; attempt++) {
    const targetWidth = await app.evaluate(
      async ({ BrowserWindow }, bounds) => {
        let actualWidth = bounds.width;
        for (const window of BrowserWindow.getAllWindows()) {
          if (window.isMaximized()) {
            await new Promise((resolve) => {
              window.once('unmaximize', resolve);
              window.unmaximize();
            });
          }
          const [minimumWidth, minimumHeight] = window.getMinimumSize();
          actualWidth = Math.max(bounds.width, minimumWidth);
          window.setSize(actualWidth, Math.max(bounds.height, minimumHeight));
        }
        return actualWidth;
      },
      { width, height },
    );
    try {
      await page.waitForFunction(
        (width) => window.innerWidth <= width + 2 && window.innerWidth >= width - 80,
        targetWidth,
        { timeout: 3000 },
      );
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }
}

async function command(page, name) {
  await page
    .locator('.menubar-menu-button')
    .filter({ hasText: /^View$/ })
    .click({ delay: 100 });
  await page.getByRole('menuitem', { name: /Command Palette/ }).click({ delay: 250 });
  await page.locator('.quick-input-widget input').fill(`>${name}`);
  const item = page.locator('.quick-input-list .monaco-list-row').filter({ hasText: name }).first();
  await item.waitFor();
  await item.click();
}
async function frame(page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const candidate of page.frames()) {
      try {
        if (await candidate.locator('.dm-app').count()) {
          return candidate;
        }
      } catch {
        /* Frame was replaced during reload. */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The React workbench did not render.');
}
async function taskSidebar(page, visible) {
  const sidebar = page.locator('.part.sidebar');
  if (!visible) {
    await command(page, 'View: Close Primary Side Bar');
  } else if (!(await sidebar.isVisible())) {
    await page
      .locator('.activitybar')
      .getByRole('tab', { name: /DualMind/ })
      .click();
  }
  await sidebar.waitFor({ state: visible ? 'visible' : 'hidden' });
}
async function click(f, name) {
  await f.getByRole('button', { name, exact: true }).first().click();
}
async function saved(f, text = 'Saved locally') {
  await f.getByRole('status').filter({ hasText: text }).waitFor();
}
async function dismiss(f) {
  // Toasts can expire between locating and clicking; dismiss any current ones atomically.
  await f.locator('.toast .icon-button').evaluateAll((buttons) => {
    for (const button of buttons) {
      button.click();
    }
  });
}
async function screenshot(page, f, name) {
  await dismiss(f);
  if (!(await f.getByRole('listbox').count())) {
    await f.evaluate(() => window.scrollTo(0, 0));
  }
  const outerWidth = await page.evaluate(() => window.innerWidth);
  await f.waitForFunction((width) => window.innerWidth <= width, outerWidth);
  await f.evaluate(
    () =>
      new Promise((resolve) =>
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({ path: join(artifacts, `${name}.png`) });
  const metrics = await f.evaluate(() => ({
    width: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    metrics.scroll <= metrics.width + 2,
    `${name}: horizontal overflow ${JSON.stringify(metrics)}`,
  );
  if (name.includes('narrow')) {
    assert.ok(
      metrics.width <= 820,
      `${name}: expected an actual narrow Webview, got ${metrics.width}`,
    );
  }
  if (name === 'zh-reading-acceptance-narrow') {
    const columns = await f
      .locator('.plan-columns')
      .first()
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    assert.equal(columns.trim().split(/\s+/).length, 1, 'Plan must stack in a narrow Webview');
  }
  captures.push(`${name}.png`);
}
async function assertMenuBounds(f) {
  // Positioning is applied after React commits; wait for the visible layout, not its first frame.
  await f.waitForFunction(
    () => {
      const element = document.querySelector('[role="listbox"]');
      if (!element) {
        return false;
      }
      const bounds = element.getBoundingClientRect();
      const dialog = element.closest('.dialog-content')?.getBoundingClientRect();
      return (
        bounds.left >= 0 &&
        bounds.right <= window.innerWidth + 2 &&
        bounds.top >= Math.max(0, dialog?.top ?? 0) - 2 &&
        bounds.bottom <= Math.min(window.innerHeight, dialog?.bottom ?? window.innerHeight) + 2 &&
        element.scrollHeight > element.clientHeight
      );
    },
    undefined,
    { timeout: 3000 },
  );
  const bounds = await f.getByRole('listbox').evaluate((element) => {
    const menu = element.getBoundingClientRect();
    const dialog = element.closest('.dialog-content')?.getBoundingClientRect();
    return {
      left: menu.left,
      right: menu.right,
      top: menu.top,
      bottom: menu.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
      dialogTop: dialog?.top,
      dialogBottom: dialog?.bottom,
      scrolls: element.scrollHeight > element.clientHeight,
    };
  });
  assert.ok(
    bounds.left >= 0 && bounds.right <= bounds.width + 2,
    'Menu must stay within viewport width',
  );
  assert.ok(
    bounds.top >= Math.max(0, bounds.dialogTop ?? 0) - 2 &&
      bounds.bottom <= Math.min(bounds.height, bounds.dialogBottom ?? bounds.height) + 2,
    'Menu must stay inside the visible dialog',
  );
  assert.ok(bounds.scrolls, 'Long model lists must scroll inside the menu');
}
try {
  let page = await launch();
  // Remove the native explorer to give the editor its own wide design canvas.
  await page
    .locator('.activitybar')
    .getByRole('tab', { name: /DualMind/ })
    .click();
  await page.getByRole('button', { name: 'Open workbench', exact: true }).click();
  let f = await frame(page);
  await f.getByRole('heading', { name: 'No tasks yet', exact: true }).waitFor();
  await taskSidebar(page, false);
  await screenshot(page, f, 'en-empty');
  await taskSidebar(page, true);
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await f.getByRole('dialog', { name: 'New task', exact: true }).waitFor();
  await click(f, 'Cancel');
  await taskSidebar(page, false);
  await click(f, 'Settings');
  await f.getByRole('button', { name: /^Back to (?:task|home)$/ }).click();
  assert.equal(
    await f.getByRole('dialog').count(),
    0,
    'A consumed sidebar request must not reopen the dialog',
  );
  await click(f, 'View examples');
  await screenshot(page, f, 'en-workbench');
  assert.equal(await f.locator('.task-item').count(), 4);
  await click(f, 'Open task: Fix retry cancellation');
  assert.ok(await f.getByRole('button', { name: 'Start', exact: true }).isDisabled());
  await click(f, 'Exit examples');
  await click(f, 'Settings');
  await f.getByLabel('Connection name', { exact: false }).fill('UI verification endpoint');
  await f.getByLabel('Base URL', { exact: false }).fill(apiUrl);
  const defaultModel = () => f.getByRole('combobox', { name: /Default model ID/ });
  assert.equal(await defaultModel().inputValue(), '');
  assert.ok(await f.getByRole('button', { name: 'Test & fetch models', exact: true }).isDisabled());
  await click(f, 'Save connection');
  await saved(f);
  await click(f, 'Set key');
  const password = page.locator('.quick-input-widget input[type="password"]');
  await password.fill(testKey);
  await password.press('Enter');
  await f.getByRole('button', { name: 'Replace key', exact: true }).waitFor();
  assert.equal(requests.length, 0);
  await click(f, 'Test & fetch models');
  await f.getByText('Model list accessible', { exact: true }).waitFor();
  assert.equal(requests.length, 1);
  assert.equal(await defaultModel().inputValue(), '');
  await defaultModel().click();
  await f.getByRole('option', { name: 'example-model-alpha', exact: true }).waitFor();
  await screenshot(page, f, 'en-api-model-discovery');
  await defaultModel().fill('example-model-a');
  await defaultModel().press('ArrowDown');
  await defaultModel().press('Enter');
  assert.equal(await defaultModel().inputValue(), 'example-model-alpha');
  await f.getByRole('listbox').waitFor({ state: 'hidden' });
  await defaultModel().fill('private-model');
  await f
    .getByRole('listbox')
    .getByText('No matching IDs. Keep typing to use a custom ID.', { exact: true })
    .waitFor();
  await click(f, 'Refresh models');
  await f.getByText('Model list accessible', { exact: true }).waitFor();
  assert.equal(requests.length, 2);
  assert.equal(await defaultModel().inputValue(), 'private-model');
  responseMode = 'empty';
  await click(f, 'Refresh models');
  await f
    .locator('.model-query-actions')
    .getByText('No models returned. Manual input is available.', { exact: true })
    .waitFor();
  assert.equal(await defaultModel().inputValue(), 'private-model');
  await defaultModel().click();
  await f
    .getByRole('listbox')
    .getByText('No models returned. Manual input is available.', { exact: true })
    .waitFor();
  await defaultModel().press('Escape');
  responseMode = 'failure';
  await click(f, 'Refresh models');
  await f
    .locator('.model-query-actions')
    .getByText('The service could not complete the request. Retry later.', { exact: true })
    .waitFor();
  assert.equal(await defaultModel().inputValue(), 'private-model');
  await defaultModel().click();
  await f
    .getByRole('listbox')
    .getByText('The service could not complete the request. Retry later.', { exact: true })
    .waitFor();
  await defaultModel().press('Escape');
  responseMode = 'success';
  await f.getByLabel('Base URL', { exact: false }).fill(apiUrl.replace('/v1', '/gateway/v1'));
  assert.ok(await f.getByRole('button', { name: 'Test & fetch models', exact: true }).isDisabled());
  await click(f, 'Save connection');
  await saved(f);
  await click(f, 'Test & fetch models');
  await f.getByText('Model list accessible', { exact: true }).waitFor();
  assert.ok(requests.at(-1).url === '/gateway/v1/models');
  await defaultModel().click();
  await f.getByRole('option', { name: 'example-model-alpha', exact: true }).click();
  await f.getByRole('listbox').waitFor({ state: 'hidden' });
  await click(f, 'Save connection');
  await saved(f);
  await screenshot(page, f, 'en-api-settings');
  assert.equal(await f.getByRole('button', { name: 'Save defaults', exact: true }).count(), 0);
  const queriesBeforeDefaults = requests.length;
  await click(f, 'Defaults for new tasks');
  const unboundWorker = f.getByRole('combobox', { name: 'Worker Model ID', exact: true });
  await unboundWorker.click();
  await f.getByRole('listbox').getByText('Select a connection…', { exact: true }).waitFor();
  await unboundWorker.press('Escape');
  await f
    .getByLabel('Worker Connection', { exact: true })
    .selectOption({ label: 'UI verification endpoint' });
  await f
    .getByLabel('Reviewer Connection', { exact: true })
    .selectOption({ label: 'UI verification endpoint' });
  await f
    .getByRole('combobox', { name: 'Reviewer Model ID', exact: true })
    .fill('manual-reviewer-model');
  await click(f, 'Save defaults');
  await saved(f);
  assert.equal(requests.length, queriesBeforeDefaults);
  await screenshot(page, f, 'en-task-defaults');
  const defaultsFrame = f;
  const defaultsDetached = page.waitForEvent('framedetached', {
    predicate: (candidate) => candidate === defaultsFrame,
    timeout: 30000,
  });
  await command(page, 'Developer: Reload Window');
  await defaultsDetached;
  f = await frame(page);
  await f.getByRole('heading', { name: 'Defaults for new tasks', exact: true }).waitFor();
  assert.equal(
    await f.getByRole('combobox', { name: 'Worker Model ID', exact: true }).inputValue(),
    'example-model-alpha',
  );
  assert.equal(
    await f.getByRole('combobox', { name: 'Reviewer Model ID', exact: true }).inputValue(),
    'manual-reviewer-model',
  );
  assert.equal(requests.length, queriesBeforeDefaults);
  await click(f, 'Reviewer Roles');
  await f
    .getByLabel('Review instructions', { exact: false })
    .fill('English review instructions retained across UI language changes.');
  await f.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  await f.getByRole('dialog', { name: 'Unsaved role instructions', exact: true }).waitFor();
  await click(f, 'Cancel');
  assert.equal(
    await f.getByLabel('Review instructions', { exact: false }).inputValue(),
    'English review instructions retained across UI language changes.',
  );
  await f.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  await f.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await f.getByRole('button', { name: '保存角色', exact: true }).waitFor();
  assert.match(await f.getByLabel('审查指令', { exact: false }).inputValue(), /你是/);
  await screenshot(page, f, 'zh-reviewer-roles');
  await click(f, '新增角色');
  await f.getByLabel('角色名称', { exact: false }).fill('自定义原文角色');
  await f.getByLabel('用途说明', { exact: true }).fill('Original bilingual purpose 原文');
  await f.getByLabel('审查指令', { exact: false }).fill('Keep this 原始指令.');
  await click(f, '保存角色');
  await saved(f, '已保存到本地');
  await f.getByRole('button', { name: '删除角色', exact: true }).waitFor();
  await f.getByLabel('界面语言', { exact: true }).selectOption('en');
  await f.getByRole('button', { name: 'Save role', exact: true }).waitFor();
  assert.equal(await f.getByLabel('Role name', { exact: false }).inputValue(), '自定义原文角色');
  assert.equal(
    await f.getByLabel('Review instructions', { exact: false }).inputValue(),
    'Keep this 原始指令.',
  );
  await f.getByRole('button', { name: /^Back to (?:task|home)$/ }).click();
  await click(f, 'New task');
  await f.getByLabel('Task name', { exact: false }).fill('Persistent UI task');
  await f
    .getByLabel('Task requirements', { exact: false })
    .fill('Verify a saved task without sending any model request.');
  await f.getByRole('radio', { name: /^Bug/ }).check();
  assert.equal(
    await f.getByRole('combobox', { name: 'Worker Model ID', exact: true }).inputValue(),
    'example-model-alpha',
  );
  assert.equal(
    await f.getByRole('combobox', { name: 'Reviewer Model ID', exact: true }).inputValue(),
    'manual-reviewer-model',
  );
  await f.getByRole('combobox', { name: 'Worker Model ID', exact: true }).click();
  await screenshot(page, f, 'en-task-model-selection');
  await f.getByRole('combobox', { name: 'Worker Model ID', exact: true }).press('Escape');
  await f.getByRole('dialog').waitFor();
  await screenshot(page, f, 'en-new-task');
  await click(f, 'Create task');
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  await f.getByRole('heading', { name: 'Persistent UI task', exact: true }).waitFor();
  assert.equal(await f.locator('.task-list').count(), 0);
  assert.equal(inferenceRequests.length, 0);
  await click(f, 'Back to home');
  assert.equal(await f.locator('.agent-grid').count(), 0);
  await screenshot(page, f, 'en-task-home');
  await click(f, 'Open task: Persistent UI task');
  await screenshot(page, f, 'en-task-detail');
  await f.locator('details summary').click();
  assert.equal(
    await f.locator('.instruction-snapshot').innerText(),
    'English review instructions retained across UI language changes.',
  );
  await click(f, 'Settings');
  await f.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  await f.getByRole('button', { name: /^返回(?:任务|主页)$/ }).click();
  await screenshot(page, f, 'zh-pending-task');
  // Reload exercises real global/workspace storage, configuration, serializer and Webview assets.
  const oldFrame = f;
  const detached = page.waitForEvent('framedetached', {
    predicate: (candidate) => candidate === oldFrame,
    timeout: 30000,
  });
  await command(page, 'Developer: Reload Window');
  await detached;
  f = await frame(page);
  await f.getByRole('heading', { name: 'Persistent UI task', exact: true }).waitFor();
  await f.getByRole('button', { name: '设置', exact: true }).first().waitFor();
  await click(f, '编辑任务');
  assert.equal(
    await f.getByRole('combobox', { name: 'Worker（执行者） 模型 ID', exact: true }).inputValue(),
    'example-model-alpha',
  );
  assert.equal(
    await f.getByRole('combobox', { name: 'Reviewer（审查者） 模型 ID', exact: true }).inputValue(),
    'manual-reviewer-model',
  );
  await f.getByLabel('最大轮次', { exact: true }).fill('7');
  await click(f, '保存任务');
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.ok((await f.locator('.task-summary .task-metadata').innerText()).includes('7'));
  await command(page, 'DualMind: Open Workbench');
  f = await frame(page);
  assert.equal(await page.locator('.tab').filter({ hasText: 'DualMind' }).count(), 1);
  // Task snapshots remain English while the surrounding UI is Chinese.
  await f.locator('details summary').click();
  assert.equal(
    await f.locator('.instruction-snapshot').innerText(),
    'English review instructions retained across UI language changes.',
  );
  await click(f, '返回主页');
  await click(f, '查看示例');
  await click(f, '打开任务: 修复重试取消问题');
  if (await f.locator('details[open]').count()) {
    await f.locator('details summary').click();
  }
  await screenshot(page, f, 'zh-workbench');
  await size(820, 1040);
  await screenshot(page, f, 'zh-workbench-narrow');
  const columns = await f
    .locator('.agent-grid')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  assert.equal(columns.trim().split(/\s+/).length, 1);
  await click(f, '退出示例');
  await click(f, '设置');
  await screenshot(page, f, 'zh-api-narrow');
  await click(f, '测试并获取模型');
  await f.locator('.model-query-actions').getByText('模型列表可访问', { exact: true }).waitFor();
  const narrowModel = f.getByRole('combobox', { name: /默认模型 ID/ });
  await narrowModel.click();
  await screenshot(page, f, 'zh-api-models-narrow');
  await assertMenuBounds(f);
  await narrowModel.press('Escape');
  await click(f, '新任务的默认配置');
  const defaultsColumns = await f
    .locator('.defaults-section .two-fields')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  assert.equal(defaultsColumns.trim().split(/\s+/).length, 1);
  await screenshot(page, f, 'zh-task-defaults-narrow');
  const defaultWorker = f.getByRole('combobox', { name: 'Worker（执行者） 模型 ID', exact: true });
  await defaultWorker.click();
  await assertMenuBounds(f);
  await screenshot(page, f, 'zh-task-defaults-models-narrow');
  await defaultWorker.press('Escape');
  await f.getByLabel('界面语言', { exact: true }).selectOption('en');
  await f.getByRole('heading', { name: 'Defaults for new tasks', exact: true }).waitFor();
  await size(360, 1040);
  await screenshot(page, f, 'en-settings-tabs-wrapped');
  const tabRows = await f
    .locator('.settings-tabs button')
    .evaluateAll(
      (buttons) =>
        new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top))).size,
    );
  assert.ok(tabRows > 1, 'Settings tabs must wrap on small windows');
  await f.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  await size(820, 1040);
  await click(f, 'Reviewer 角色');
  await screenshot(page, f, 'zh-roles-narrow');
  await f.getByLabel('界面语言', { exact: true }).selectOption('en');
  await f.getByRole('button', { name: /^Back to (?:task|home)$/ }).click();
  await click(f, 'View examples');
  await screenshot(page, f, 'en-workbench-narrow');
  await click(f, 'Exit examples');
  await click(f, 'Open task: Persistent UI task');
  await click(f, 'Edit task');
  const narrowWorker = f.getByRole('combobox', { name: 'Worker Model ID', exact: true });
  const bindingColumns = await f
    .locator('.dialog .two-fields')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  assert.equal(
    bindingColumns.trim().split(/\s+/).length,
    1,
    'Narrow task bindings must stack vertically',
  );
  const footerVisible = await f.locator('.dialog-footer').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
  });
  assert.ok(footerVisible, 'Draft actions must remain visible');
  await narrowWorker.click();
  await screenshot(page, f, 'en-task-models-narrow');
  await assertMenuBounds(f);
  await narrowWorker.press('Escape');
  await click(f, 'Cancel');
  await size(1600, 1100);
  await app.close();
  app = undefined;
  // A different workspace shares settings and presets, but has no saved task.
  page = await launch(otherWorkspace);
  await command(page, 'DualMind: Open Workbench');
  f = await frame(page);
  await f.getByRole('heading', { name: 'No tasks yet', exact: true }).waitFor();
  await click(f, 'Settings');
  assert.ok(await f.getByRole('button', { name: /UI verification endpoint/ }).count());
  await click(f, 'Reviewer Roles');
  assert.ok(await f.getByRole('button', { name: /自定义原文角色/ }).count());
  await app.close();
  app = undefined;
  page = await launch(workspace);
  await command(page, 'DualMind: Open Workbench');
  f = await frame(page);
  await f.getByRole('heading', { name: 'Persistent UI task', exact: true }).waitFor();
  assert.equal(
    await fixtureGit('for-each-ref', '--format=%(refname)', 'refs/heads/'),
    initialBranches,
    'Drafts/settings/discovery must not create branches',
  );
  assert.equal(await fixtureGit('worktree', 'list', '--porcelain'), initialWorktrees);
  await click(f, 'Settings');
  await click(f, 'New connection');
  await f.getByLabel('Connection name', { exact: false }).fill('UI reviewer endpoint');
  await f.getByLabel('Base URL', { exact: false }).fill(apiUrl);
  await f.getByLabel('Inference protocol', { exact: true }).selectOption('responses');
  await f.getByRole('combobox', { name: /Default model ID/ }).fill('reviewer-model');
  await click(f, 'Save connection');
  await saved(f);
  await click(f, 'Set key');
  await page.locator('.quick-input-widget input[type="password"]').fill(testKey);
  await page.locator('.quick-input-widget input[type="password"]').press('Enter');
  await f.getByRole('button', { name: 'Replace key', exact: true }).waitFor();
  await click(f, 'Task execution');
  await f.getByText('Advanced settings', { exact: true }).click();
  await f.getByLabel('Enable additional custom commands', { exact: true }).check();
  await click(f, 'Add preparation command');
  let preset = f.locator('.command-preset').last();
  await preset.getByLabel('Command name', { exact: true }).fill('Prepare fixture');
  await preset.getByLabel('Executable', { exact: true }).fill(process.execPath);
  await preset
    .getByLabel('Arguments — one per line', { exact: true })
    .fill('-e\nconsole.log("fixture prepared")');
  await click(f, 'Add check command');
  preset = f.locator('.command-preset').last();
  await preset.getByLabel('Command name', { exact: true }).fill('Check result');
  await preset.getByLabel('Executable', { exact: true }).fill(process.execPath);
  await preset
    .getByLabel('Arguments — one per line', { exact: true })
    .fill('-e\nif(require("node:fs").readFileSync("result.txt","utf8")!=="fixed")process.exit(1)');
  await click(f, 'Save execution settings');
  await screenshot(page, f, 'en-execution-settings');
  await f.getByRole('button', { name: /^Back to (?:task|home)$/ }).click();
  await click(f, 'Edit task');
  await f
    .getByLabel('Task requirements', { exact: false })
    .fill(
      'Write fixed to result.txt, run the configured check, and independently review the artifact.',
    );
  await f
    .getByLabel('Reviewer Connection', { exact: true })
    .selectOption({ label: 'UI reviewer endpoint' });
  await click(f, 'Save task');
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  await click(f, 'Start');
  await f
    .getByRole('status')
    .filter({ hasText: /Completed — acceptance passed|Failed/ })
    .waitFor({ timeout: 60000 });
  await f.getByRole('status').filter({ hasText: 'Completed — acceptance passed' }).waitFor();
  assert.equal(workerTurns, 6);
  assert.equal(reviewTurns, 3);
  await f.getByText('Tools, checks and review evidence', { exact: true }).click();
  assert.ok((await f.locator('.execution-evidence').innerText()).includes('FAIL'));
  assert.ok((await f.locator('.execution-evidence').innerText()).includes('PASS'));
  await f.locator('[data-error-code="commandFailed"]').first().waitFor();
  assert.match(
    await f.locator('[data-error-code="commandFailed"]').first().innerText(),
    /Command .+ failed/,
  );
  await screenshot(page, f, 'en-command-error-history');
  await f.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  await f
    .locator('[data-error-code="commandFailed"]')
    .filter({ hasText: /命令.+执行失败/ })
    .first()
    .waitFor();
  assert.match(
    await f.locator('[data-error-code="commandFailed"]').first().innerText(),
    /命令.+执行失败/,
  );
  await screenshot(page, f, 'zh-command-error-history');
  await f.getByLabel('界面语言', { exact: true }).selectOption('en');
  await screenshot(page, f, 'en-execution-complete');
  await size(820, 1040);
  await screenshot(page, f, 'en-execution-narrow');
  await size(1600, 1100);
  const taskWorktrees = await fixtureGit('worktree', 'list', '--porcelain');
  const taskDirectory = taskWorktrees
    .split('\n\n')
    .find((block) => block.includes('refs/heads/dualmind/task/'))
    .split('\n')[0]
    .slice('worktree '.length);
  assert.equal(await readFile(join(taskDirectory, 'result.txt'), 'utf8'), 'fixed');
  await assert.rejects(readFile(join(workspace, 'result.txt')), { code: 'ENOENT' });
  assert.equal(await fixtureGit('status', '--porcelain'), '');
  assert.ok(inferenceRequests.some((request) => request.path.endsWith('/responses')));
  assert.ok(inferenceRequests.some((request) => request.path.endsWith('/chat/completions')));
  assert.ok(
    inferenceRequests
      .filter((request) => request.worker)
      .every((request) => !JSON.stringify(request.body).includes('reviewer-private-state')),
  );
  await click(f, 'Preview changes');
  await page.locator('.tab').filter({ hasText: 'Task Changes.diff' }).waitFor();
  await page.locator('.view-lines').filter({ hasText: 'result.txt' }).first().waitFor();
  await page.locator('.tab').filter({ hasText: 'DualMind' }).click();
  f = await frame(page);
  longCommand = true;
  workerTurns = 0;
  reviewTurns = 0;
  await click(f, 'Restart execution');
  await f.getByRole('status').filter({ hasText: 'Worker executing' }).waitFor();
  const marker = join(taskDirectory, 'command-started');
  const commandDeadline = Date.now() + 15000;
  while (!(await readFile(marker, 'utf8').catch(() => ''))) {
    assert.ok(Date.now() < commandDeadline, 'Worker command must actually start before stopping');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await click(f, 'Stop');
  await f
    .getByRole('status')
    .filter({ hasText: /^Stopped(?: ·|$)/ })
    .waitFor();
  const stoppedPid = Number(await readFile(marker, 'utf8'));
  await assert.rejects(readFile(`/proc/${stoppedPid}/stat`), { code: 'ENOENT' });
  await screenshot(page, f, 'en-command-stopped');
  longCommand = false;
  holdWorker = true;
  const nextRequest = new Promise((resolve) => {
    workerRequestObserved = resolve;
  });
  await click(f, 'Restart execution');
  await nextRequest;
  const requestsBeforeReload = inferenceRequests.length;
  const executingFrame = f;
  const executionDetached = page.waitForEvent('framedetached', {
    predicate: (candidate) => candidate === executingFrame,
    timeout: 30000,
  });
  await command(page, 'Developer: Reload Window');
  await executionDetached;
  await page.locator('.tab').filter({ hasText: 'DualMind' }).click();
  f = await frame(page);
  await f.getByRole('status').filter({ hasText: 'Interrupted — restart explicitly' }).waitFor();
  assert.equal(
    inferenceRequests.length,
    requestsBeforeReload,
    'Reload must not replay model requests',
  );
  assert.equal(await readFile(join(taskDirectory, 'result.txt'), 'utf8'), 'fixed');
  await screenshot(page, f, 'en-execution-interrupted');
  await click(f, 'Delete task: Persistent UI task');
  await screenshot(page, f, 'en-delete-task');
  await f.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await f.getByRole('heading', { name: 'No tasks yet', exact: true }).waitFor();
  assert.ok(requests.length >= 6);
  assert.ok(
    requests.every((request) => request.method === 'GET' && request.authorized && !request.hasBody),
  );
  assert.equal(
    await readFile(join(taskDirectory, 'result.txt'), 'utf8'),
    'fixed',
    'Deleting task records must preserve artifacts',
  );
  assert.equal(await fixtureGit('status', '--porcelain'), '');
  // Direct strategies use only this disposable project, never the development repository.
  holdWorker = false;
  for (const mode of ['current', 'branch']) {
    workerTurns = 0;
    reviewTurns = 0;
    const beforeBranches = await fixtureGit('for-each-ref', '--format=%(refname)', 'refs/heads/');
    const beforeWorktrees = (await fixtureGit('worktree', 'list', '--porcelain')).split(
      'worktree ',
    ).length;
    const name = `Direct ${mode} task`;
    await click(f, 'New task');
    await f.getByLabel('Task name', { exact: false }).fill(name);
    await f
      .getByLabel('Task requirements', { exact: false })
      .fill('Write fixed to result.txt and review the checks.');
    await f.getByRole('radio', { name: /^Bug/ }).check();
    const strategy = f.getByRole('combobox', { name: 'Development branch', exact: true });
    assert.equal(await strategy.inputValue(), 'managed');
    await strategy.selectOption(mode);
    if (mode === 'branch') {
      await f
        .getByRole('option', { name: 'ui-target', exact: true })
        .waitFor({ state: 'attached' });
      await f
        .getByRole('combobox', { name: 'Local branch', exact: true })
        .selectOption('ui-target');
      await click(f, 'Refresh branches');
      await f.getByRole('button', { name: 'Refresh branches', exact: true }).waitFor();
    }
    await f
      .getByLabel('Reviewer Connection', { exact: true })
      .selectOption({ label: 'UI reviewer endpoint' });
    await strategy.scrollIntoViewIfNeeded();
    await screenshot(page, f, `en-git-${mode}`);
    await size(820, 1040);
    await strategy.scrollIntoViewIfNeeded();
    await screenshot(page, f, `en-git-${mode}-narrow`);
    await size(1600, 1100);
    assert.equal((await fixtureGit('symbolic-ref', '--short', 'HEAD')).trim(), originalBranch);
    await click(f, 'Create task');
    await f.getByRole('dialog').waitFor({ state: 'hidden' });
    if (mode === 'branch') {
      const previousFrame = f;
      const detached = page.waitForEvent('framedetached', {
        predicate: (candidate) => candidate === previousFrame,
        timeout: 30000,
      });
      await command(page, 'Developer: Reload Window');
      await detached;
      await page.locator('.tab').filter({ hasText: 'DualMind' }).click();
      f = await frame(page);
      await f.getByRole('heading', { name, exact: true }).waitFor();
    }
    await click(f, 'Edit task');
    assert.equal(
      await f.getByRole('combobox', { name: 'Development branch', exact: true }).inputValue(),
      mode,
    );
    await click(f, 'Cancel');
    await click(f, 'Start');
    await f
      .getByRole('status')
      .filter({ hasText: 'Completed — acceptance passed' })
      .waitFor({ timeout: 60000 });
    assert.equal(await readFile(join(workspace, 'result.txt'), 'utf8'), 'fixed');
    assert.equal(
      (await fixtureGit('symbolic-ref', '--short', 'HEAD')).trim(),
      mode === 'branch' ? 'ui-target' : originalBranch,
    );
    assert.equal(
      await fixtureGit('for-each-ref', '--format=%(refname)', 'refs/heads/'),
      beforeBranches,
    );
    assert.equal(
      (await fixtureGit('worktree', 'list', '--porcelain')).split('worktree ').length,
      beforeWorktrees,
    );
    await click(f, 'Edit task');
    assert.equal(
      await f.getByRole('combobox', { name: 'Development branch', exact: true }).isDisabled(),
      true,
    );
    await click(f, 'Cancel');
    await screenshot(page, f, `en-git-${mode}-completed`);
    await click(f, `Delete task: ${name}`);
    await f.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await f.getByRole('heading', { name: 'No tasks yet', exact: true }).waitFor();
    assert.equal(await readFile(join(workspace, 'result.txt'), 'utf8'), 'fixed');
    // Simulate the user's explicit handling of results before the next execution.
    await fixtureGit('add', 'result.txt');
    await fixtureGit('commit', '-m', `Preserve direct ${mode} result`);
  }
  // Reading-only acceptance remains independent of command execution.
  readingOnly = true;
  workerTurns = 0;
  reviewTurns = 0;
  await click(f, 'Settings');
  await click(f, 'Task execution');
  await f.getByText('Advanced settings', { exact: true }).click();
  await f.getByLabel('Enable additional custom commands', { exact: true }).uncheck();
  await click(f, 'Save execution settings');
  await screenshot(page, f, 'en-automatic-execution-settings');
  await f.getByRole('button', { name: /^Back to (?:task|home)$/ }).click();
  await click(f, 'New task');
  await f.getByLabel('Task name', { exact: false }).fill('Reading acceptance task');
  await f
    .getByLabel('Task requirements', { exact: false })
    .fill('Write fixed to result.txt and verify by reading this text document.');
  await f.getByRole('radio', { name: /^Feature/ }).check();
  await f
    .getByLabel('Reviewer Connection', { exact: true })
    .selectOption({ label: 'UI reviewer endpoint' });
  await click(f, 'Create task');
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  await click(f, 'Start');
  await f
    .getByRole('status')
    .filter({ hasText: 'Completed — acceptance passed' })
    .waitFor({ timeout: 30000 });
  assert.equal(workerTurns, 4);
  assert.equal(reviewTurns, 3);
  await f.getByRole('heading', { name: 'Reviewer execution plan · v2' }).first().waitFor();
  await f.getByRole('heading', { name: 'Acceptance passed · v2', exact: true }).first().waitFor();
  await screenshot(page, f, 'en-reading-acceptance');
  await f.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  await f.getByRole('status').filter({ hasText: '已完成：验收通过' }).waitFor();
  await screenshot(page, f, 'zh-reading-acceptance');
  await size(820, 1040);
  await screenshot(page, f, 'zh-reading-acceptance-narrow');
  await size(1600, 1100);
  await f.getByLabel('界面语言', { exact: true }).selectOption('en');
  holdWorker = true;
  const heldReadingRequest = new Promise((resolve) => {
    workerRequestObserved = resolve;
  });
  await click(f, 'Restart execution');
  await heldReadingRequest;
  const readingRequestCount = inferenceRequests.length;
  const readingFrame = f;
  const readingDetached = page.waitForEvent('framedetached', {
    predicate: (candidate) => candidate === readingFrame,
    timeout: 30000,
  });
  await command(page, 'Developer: Reload Window');
  await readingDetached;
  await page.locator('.tab').filter({ hasText: 'DualMind' }).click();
  f = await frame(page);
  await f.getByRole('status').filter({ hasText: 'Interrupted — restart explicitly' }).waitFor();
  assert.equal(inferenceRequests.length, readingRequestCount, 'Reload never replays Worker calls');
  await f.getByRole('heading', { name: 'Reviewer execution plan · v1' }).first().waitFor();
  await screenshot(page, f, 'en-reading-reload-interrupted');
  holdWorker = false;
  await click(f, 'Delete task: Reading acceptance task');
  await f.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await f.getByRole('heading', { name: 'No tasks yet', exact: true }).waitFor();
  readingOnly = false;
  await click(f, 'Settings');
  await f.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  await f.getByRole('button', { name: /^返回(?:任务|主页)$/ }).click();
  await click(f, '新建任务');
  await f.getByRole('combobox', { name: '开发分支', exact: true }).selectOption('branch');
  await f.getByRole('option', { name: 'ui-target', exact: true }).waitFor({ state: 'attached' });
  await f.getByRole('combobox', { name: '本地分支', exact: true }).selectOption('ui-target');
  await screenshot(page, f, 'zh-git-branch');
  await size(820, 1040);
  await f.getByRole('combobox', { name: '本地分支', exact: true }).scrollIntoViewIfNeeded();
  await screenshot(page, f, 'zh-git-branch-narrow');
  await f.getByRole('combobox', { name: '开发分支', exact: true }).selectOption('current');
  await screenshot(page, f, 'zh-git-current-narrow');
  await click(f, '取消');
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify(
      {
        version,
        passed: true,
        interfacePassed: true,
        commandExecutionPassed: true,
        commandErrorLocalesPassed: true,
        commandStopPassed: true,
        skipped: [],
        screenshots: captures,
        profile,
        workspace,
        modelQueries: requests.length,
        taskBranchesCreated: 2,
        readingAcceptancePassed: true,
        readingRevisionCyclePassed: true,
        inferenceRequests: inferenceRequests.length,
        activityBarEntry: true,
        reloadInterrupted: true,
        directBranchModes: ['current', 'branch'],
      },
      null,
      2,
    ),
  );
  console.log(
    `Real Webview UI verification passed on VS Code ${version}; ${captures.length} screenshots in ${artifacts}`,
  );
} catch (error) {
  if (app) {
    const page = await app.firstWindow();
    await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => undefined);
  }
  throw error;
} finally {
  try {
    if (app) {
      await app.close();
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
