/* global window, document, getComputedStyle */
import { verifyReviewScenes } from './verify-review-scenes.mjs';
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
const artifacts = resolve('.vscode-test/ui-validation', version, 'sidebar');
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
let recoveryFault;
const recoveryChecks = [];
let readingOnly = false;
let repeatToolFailure = false;
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
      const planning = body.tools.some(
        (tool) => (tool.function?.name || tool.name) === 'submit_plan',
      );
      const answering = body.tools.some(
        (tool) => (tool.function?.name || tool.name) === 'submit_answer',
      );
      if (
        recoveryFault?.remaining &&
        !planning &&
        !answering &&
        (recoveryFault.agent === 'worker' ? worker && workerTurns >= 1 : !worker)
      ) {
        recoveryFault.remaining--;
        response.writeHead(recoveryFault.status, { 'Retry-After': '8' });
        response.end('Local recovery fixture failure');
        return;
      }
      const turn = worker ? ++workerTurns : ++reviewTurns;
      if (worker && holdWorker) {
        workerRequestObserved?.();
        return;
      }
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
      const artifactPath = readingOnly ? 'reading-result.txt' : 'result.txt';
      const plan = {
        objective: `Write fixed to ${artifactPath}`,
        requirements: 'Provide the requested artifact',
        steps: ['Inspect related files', `Write and verify ${artifactPath}`],
        criteria: [
          {
            id: 'result',
            description: `${artifactPath} contains fixed`,
            verification: readingOnly ? 'reading' : 'command',
            evidence: `Inspect ${artifactPath} and actual execution evidence`,
            reason: readingOnly ? 'A plain text document can be directly inspected' : '',
          },
        ],
        revisionReason: planning ? '' : 'Repair the failed artifact and provide new evidence',
      };
      const step = (turn - 1) % (readingOnly ? 2 : 3);
      const approve = (handoff?.round ?? 0) > 1;
      const userHandoff = messages
        .filter((m) => m.role === 'user')
        .map((m) => {
          try {
            return JSON.parse(m.content);
          } catch {
            return undefined;
          }
        })
        .filter((m) => m?.handoff === 'user_messages')
        .at(-1);
      if (answering && userHandoff?.currentPlan) {
        plan.revisionReason = 'Apply the queued modification';
      }
      let call =
        answering && !JSON.stringify(userHandoff?.messages).includes('modification')
          ? {
              name: 'submit_answer',
              arguments: JSON.stringify({
                answer:
                  'The result was verified using recorded evidence. This is a read-only answer.',
              }),
            }
          : planning
            ? { name: 'submit_plan', arguments: JSON.stringify(plan) }
            : worker
              ? step === 0
                ? {
                    name: 'write_file',
                    arguments: JSON.stringify({
                      path: artifactPath,
                      content: longCommand || turn > 1 ? 'fixed' : 'bad',
                    }),
                  }
                : !readingOnly && step === 1
                  ? {
                      name: 'run_command',
                      arguments: JSON.stringify({
                        name: 'Verify result',
                        command: `${process.platform === 'win32' ? '& ' : ''}'${process.execPath.replaceAll("'", process.platform === 'win32' ? "''" : "'\\''")}' -e '${longCommand ? 'require("node:fs").writeFileSync("command-started",String(process.pid));setInterval(()=>{},1000)' : 'if(require("node:fs").readFileSync("result.txt","utf8")!=="fixed")process.exit(1)'}'`,
                        purpose: 'verify',
                        criterionIds: ['result'],
                      }),
                    }
                  : {
                      name: 'finish_work',
                      arguments: JSON.stringify({
                        summary: `Updated ${artifactPath} for acceptance.`,
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
                    verdict: approve ? 'pass' : 'fail',
                    risk: approve ? 'low' : 'medium',
                    confidence: approve ? 0.95 : 0.7,
                    issues: approve ? [] : ['The artifact needs repair.'],
                    evidence: [`Inspected the actual ${artifactPath} and supplied host evidence`],
                    reasoning: 'Judge the actual artifact and recorded verification.',
                    nextStep: {
                      action: approve ? 'finish' : 'continue',
                      instructions: approve ? '' : 'Repair the artifact and verify again.',
                    },
                    summary: approve ? 'Artifact accepted.' : 'Fix the failed artifact.',
                    ...(approve ? {} : { nextPlan: plan }),
                  }),
                };
      if (repeatToolFailure && worker) {
        call = {
          name: 'read_file',
          arguments: JSON.stringify({ path: 'missing-no-progress.txt' }),
        };
      }
      const id = `${worker ? 'worker' : 'reviewer'}-${turn}`;
      const publicText =
        call.name === 'submit_review' && approve
          ? 'Artifact reviewed.\nTASK_COMPLETE\n'
          : 'Working on the isolated task artifact.\n';
      response.setHeader('Content-Type', 'text/event-stream');
      const events = request.url.endsWith('/responses')
        ? [
            { type: 'response.output_text.delta', delta: publicText },
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
                    content: publicText,
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
    authorized:
      request.headers.authorization === `Bearer ${testKey}` ||
      request.headers['x-api-key'] === testKey,
    hasBody: Boolean(request.headers['content-length'] || request.headers['transfer-encoding']),
  });
  response.setHeader('Content-Type', 'application/json');
  if (
    (request.headers.authorization !== `Bearer ${testKey}` &&
      request.headers['x-api-key'] !== testKey) ||
    request.method !== 'GET' ||
    !request.url?.split('?')[0].endsWith('/v1/models')
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
    JSON.stringify({
      data: (responseMode === 'empty' ? [] : modelIds).map((id) => ({
        id,
        supported_endpoints: ['chat/completions', 'responses', 'messages'],
      })),
      has_more: false,
    }),
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
      ...(process.env.DUAL_MIND_RESOURCE_UI === '1'
        ? ['--renderer-process-limit=2', '--js-flags=--max-old-space-size=128']
        : []),
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
          actualWidth = Math.max(bounds.width, minimumWidth, 700);
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
      if (await page.locator('.part.sidebar').isVisible()) {
        await sidebarWidth(page, width < 600 ? 240 : width < 1000 ? 480 : 1200);
      }
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
async function sidebarWidth(page, width, secondary = false) {
  const sidebar = page.locator(secondary ? '.part.auxiliarybar' : '.part.sidebar');
  const bounds = await sidebar.boundingBox();
  assert.ok(bounds, 'The native sidebar is visible');
  const edge = secondary ? bounds.x : bounds.x + bounds.width;
  const sashes = await page.locator('.monaco-sash.vertical').evaluateAll((items) =>
    items
      .map((item) => {
        const r = item.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, height: r.height };
      })
      .filter((r) => r.height > 100),
  );
  const sash = sashes.sort((a, b) => Math.abs(a.x - edge) - Math.abs(b.x - edge))[0];
  assert.ok(sash && Math.abs(sash.x - edge) < 10, 'Native sidebar resize sash');
  await page.mouse.move(sash.x, sash.y);
  await page.mouse.down();
  await page.mouse.move(
    sash.x + (secondary ? bounds.width - width : width - bounds.width),
    sash.y,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForFunction(
    ({ selector, width }) =>
      Math.abs(document.querySelector(selector).getBoundingClientRect().width - width) < 8,
    { selector: secondary ? '.part.auxiliarybar' : '.part.sidebar', width },
  );
}
async function click(f, name) {
  await f
    .page()
    .locator(
      '.notifications-toasts .codicon-notifications-clear, .notifications-toasts .codicon-close',
    )
    .evaluateAll((buttons) => buttons.forEach((button) => button.click()));
  const selector = f.getByRole('combobox', { name: /Settings category|设置类别/ });
  if (await selector.isVisible()) {
    const option = selector.getByRole('option', { name, exact: true });
    if (await option.count()) {
      await selector.selectOption(await option.getAttribute('value'));
      return;
    }
  }
  let button = f.getByRole('button', { name, exact: true }).first();
  if (!(await button.isVisible()) && (await f.locator('.task-details').count())) {
    const details = f.locator('.task-details');
    if ((await details.getAttribute('open')) === null) {
      await details.locator('summary').click();
    }
    button = f.getByRole('button', { name, exact: true }).first();
  }
  await button.click();
}
async function language(f, value) {
  const selector = f.getByLabel(/^(Language|界面语言)$/);
  if (await selector.isVisible()) {
    await selector.selectOption(value);
  } else {
    // Changing the native setting also exercises locale updates with a drawer open.
    const file = join(profile, 'User/settings.json');
    const settings = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify({ ...settings, 'dualMind.language': value }));
    await f.waitForFunction((locale) => document.documentElement.lang === locale, value);
  }
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
  console.log(`Captured ${name} (${metrics.width}px)`);
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
async function validateInterface() {
  let page = await launch();
  // Remove the native explorer to give the editor its own wide design canvas.
  await page
    .locator('.activitybar')
    .getByRole('tab', { name: /DualMind/ })
    .click();
  let f = await frame(page);
  await f.getByRole('heading', { name: 'No tasks yet', exact: true }).waitFor();
  await sidebarWidth(page, 1200);
  await screenshot(page, f, 'en-empty');
  await page.locator('.part.sidebar .action-label.codicon-add:visible').first().click();
  await f.getByRole('dialog', { name: 'New task', exact: true }).waitFor();
  await click(f, 'Cancel');
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
  await click(f, 'Fix retry cancellation');
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
  await language(f, 'zh-CN');
  await f.getByRole('dialog', { name: 'Unsaved role instructions', exact: true }).waitFor();
  await click(f, 'Cancel');
  assert.equal(
    await f.getByLabel('Review instructions', { exact: false }).inputValue(),
    'English review instructions retained across UI language changes.',
  );
  await language(f, 'zh-CN');
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
  await language(f, 'en');
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
  await click(f, 'Persistent UI task');
  await screenshot(page, f, 'en-task-detail');
  assert.ok(
    await f
      .locator('.chat-composer')
      .evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight + 1),
    'The composer stays within the viewport',
  );
  assert.equal(await f.locator('.instruction-snapshot').count(), 0);
  assert.equal(await f.locator('.model-bar').count(), 2);
  await click(f, 'Settings');
  await language(f, 'zh-CN');
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
  await f.locator('.task-details > summary').click();
  assert.ok((await f.locator('.task-details .task-metadata').innerText()).includes('7'));
  await command(page, 'DualMind: Open Workbench');
  f = await frame(page);
  assert.equal(await page.locator('.tab').filter({ hasText: 'DualMind' }).count(), 0);
  // Task snapshots remain English while the surrounding UI is Chinese.
  assert.equal(await f.locator('.instruction-snapshot').count(), 0);
  assert.equal(await f.locator('.model-bar').count(), 2);
  await click(f, '返回主页');
  await click(f, '查看示例');
  await click(f, '修复重试取消问题');
  if (await f.locator('details[open]').count()) {
    await f.locator('details summary').click();
  }
  await screenshot(page, f, 'zh-workbench');
  await size(820, 1040);
  await screenshot(page, f, 'zh-workbench-narrow');
  const columns = await f
    .locator('.task-chat')
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
  const defaultWorker = f.getByRole('combobox', {
    name: 'Worker（执行者） 模型 ID',
    exact: true,
  });
  await defaultWorker.click();
  await assertMenuBounds(f);
  await screenshot(page, f, 'zh-task-defaults-models-narrow');
  await defaultWorker.press('Escape');
  await language(f, 'en');
  await f.getByRole('heading', { name: 'Defaults for new tasks', exact: true }).waitFor();
  await size(360, 1040);
  await screenshot(page, f, 'en-settings-category-240');
  assert.equal(
    await f.getByRole('combobox', { name: 'Settings category' }).getByRole('option').count(),
    6,
  );
  await language(f, 'zh-CN');
  await size(820, 1040);
  await click(f, 'Reviewer 角色');
  await screenshot(page, f, 'zh-roles-narrow');
  await language(f, 'en');
  await f.getByRole('button', { name: /^Back to (?:task|home)$/ }).click();
  await click(f, 'View examples');
  await screenshot(page, f, 'en-workbench-narrow');
  await click(f, 'Exit examples');
  await click(f, 'Persistent UI task');
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
      'Write fixed to result.txt, run the configured check, and independently review the artifact.\n' +
        Array.from(
          { length: 24 },
          (_, i) =>
            `Acceptance note ${i + 1}: preserve task state and verify the actual saved artifact.`,
        ).join('\n'),
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
  await f.locator('.process-message').first().waitFor();
  assert.ok(!(await f.locator('.chat-messages').innerText()).includes('reviewer-private-state'));
  const requirementCard = f.locator('[data-message-id^="requirements:initial:"]');
  await requirementCard.scrollIntoViewIfNeeded();
  const sizeButton = requirementCard.getByRole('button', { name: 'Expand message', exact: true });
  assert.equal(await sizeButton.innerText(), '');
  assert.equal(await sizeButton.locator('svg').count(), 1);
  const body = requirementCard.locator('.chat-message-body');
  assert.ok(
    await body.evaluate((el) => el.scrollHeight > el.clientHeight && el.clientHeight <= 240),
  );
  await body.evaluate((el) => {
    el.scrollTop = 65;
  });
  await sizeButton.click();
  assert.ok(await body.evaluate((el) => el.clientHeight > 240));
  await screenshot(page, f, 'en-chat-expanded-icons');
  await requirementCard.getByRole('button', { name: 'Compact message', exact: true }).click();
  await screenshot(page, f, 'en-chat-compact-icons');

  await click(f, 'Tools, checks and review evidence');
  await f.locator('.evidence-record').first().waitFor();
  await f.locator('.evidence-record').evaluateAll((items) =>
    items.forEach((item) => {
      item.open = true;
    }),
  );
  await f.locator('.command-output').evaluateAll((items) =>
    items.forEach((item) => {
      item.open = true;
    }),
  );
  assert.ok((await f.locator('.evidence-panel').innerText()).includes('FAIL'));
  assert.ok((await f.locator('.evidence-panel').innerText()).includes('PASS'));
  await f.locator('[data-error-code="commandFailed"]').first().waitFor();
  assert.match(
    await f.locator('[data-error-code="commandFailed"]').first().innerText(),
    /Command .+ failed/,
  );
  await screenshot(page, f, 'en-command-error-history');
  const errorRecord = f
    .locator('.evidence-item')
    .filter({ has: f.locator('[data-error-code="commandFailed"]') })
    .first();
  await errorRecord.getByRole('button', { name: 'Minimize record', exact: true }).click();
  assert.equal(await errorRecord.getAttribute('data-minimized'), 'true');
  assert.ok(await errorRecord.locator('summary .chat-error-badge').isVisible());
  await errorRecord.getByRole('button', { name: 'Restore record', exact: true }).click();
  assert.ok(await errorRecord.locator('details.evidence-record').evaluate((el) => el.open));
  await f.locator('.evidence-list').evaluate((el) => {
    el.scrollTop = 90;
  });
  const evidenceScroll = await f.locator('.evidence-list').evaluate((el) => el.scrollTop);
  await click(f, 'Minimize evidence panel');
  assert.ok(await f.locator('.evidence-rail').isVisible());
  const chatWidth = await f
    .locator('.chat-main')
    .evaluate((el) => el.getBoundingClientRect().width);
  await screenshot(page, f, 'en-chat-panel-minimized');
  await f
    .locator('.evidence-rail')
    .getByRole('button', { name: 'Restore evidence panel', exact: true })
    .click();
  assert.ok(
    (await f.locator('.chat-main').evaluate((el) => el.getBoundingClientRect().width)) < chatWidth,
  );
  assert.ok(
    Math.abs((await f.locator('.evidence-list').evaluate((el) => el.scrollTop)) - evidenceScroll) <=
      2,
  );

  await language(f, 'zh-CN');
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
  await requirementCard.getByRole('button', { name: '展开消息', exact: true }).click();
  await click(f, '最小化证据面板');
  await screenshot(page, f, 'zh-chat-panel-minimized');
  await click(f, '返回主页');
  await click(f, 'Persistent UI task');
  await f.locator('.evidence-rail').waitFor();
  assert.equal(await requirementCard.getAttribute('data-expanded'), 'true');
  await requirementCard.getByRole('button', { name: '紧凑显示', exact: true }).click();
  await f
    .locator('.evidence-rail')
    .getByRole('button', { name: '恢复证据面板', exact: true })
    .click();

  await language(f, 'en');
  await screenshot(page, f, 'en-execution-complete');
  if (process.env.DUAL_MIND_UI_REVIEW_ONLY === '1') {
    await verifyReviewScenes({
      page,
      frame: f,
      profile,
      sidebarWidth,
      screenshot,
      language,
      click,
      executable,
    });
    await writeFile(
      join(artifacts, 'review-scenes-results.json'),
      JSON.stringify(
        {
          version,
          passed: true,
          screenshots: captures,
          themes: ['light', 'dark', 'hc-dark', 'hc-light'],
          widths: [240, 320, 480, 1200],
          locales: ['en', 'zh-CN'],
        },
        null,
        2,
      ),
    );
    console.log(
      `Approved review scenes passed on VS Code ${version}; ${captures.length} screenshots.`,
    );
    return;
  }

  await size(820, 1040);
  await f.getByRole('dialog', { name: 'Tools, checks and review evidence' }).waitFor();
  await screenshot(page, f, 'en-execution-evidence-drawer');
  await f.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await screenshot(page, f, 'en-execution-narrow');
  await requirementCard.scrollIntoViewIfNeeded();
  assert.ok(
    await body.evaluate((el) => el.scrollHeight > el.clientHeight && el.clientHeight <= 180),
  );
  await screenshot(page, f, 'en-chat-compact-narrow');
  await click(f, 'Tools, checks and review evidence');
  await click(f, 'Minimize evidence panel');
  assert.equal(await f.getByRole('dialog').count(), 0);
  await f.getByRole('button', { name: 'Restore evidence panel', exact: true }).waitFor();
  await screenshot(page, f, 'en-chat-minimized-narrow');
  await click(f, 'Restore evidence panel');
  await f.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

  await size(1600, 1100);
  const taskWorktrees = await fixtureGit('worktree', 'list', '--porcelain');
  const taskDirectory = taskWorktrees
    .split('\n\n')
    .find((block) => block.includes('refs/heads/dualmind/'))
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
  await command(page, 'DualMind: Open Workbench');
  f = await frame(page);
  const workersBeforeAnswer = workerTurns;
  await f.getByLabel('Follow up or request changes', { exact: true }).fill('Explain the result');
  await click(f, 'Send');
  await f
    .getByText('The result was verified using recorded evidence. This is a read-only answer.', {
      exact: true,
    })
    .waitFor();
  assert.equal(workerTurns, workersBeforeAnswer);
  await f.getByRole('status').filter({ hasText: 'Completed — acceptance passed' }).waitFor();
  assert.equal(await f.getByText('Execution #0', { exact: true }).count(), 0);
  await screenshot(page, f, 'en-chat-followup-answer');
  await f
    .getByLabel('Follow up or request changes', { exact: true })
    .fill('Continue modification in this task directory');
  await click(f, 'Send');
  await f
    .getByRole('status')
    .filter({ hasText: /Worker executing|Planning/ })
    .waitFor();
  await f
    .getByRole('status')
    .filter({ hasText: 'Completed — acceptance passed' })
    .waitFor({ timeout: 60000 });
  assert.equal(await readFile(join(taskDirectory, 'result.txt'), 'utf8'), 'fixed');
  await screenshot(page, f, 'en-chat-followup-modification');
  await click(f, 'Tools, checks and review evidence');
  await click(f, 'Minimize evidence panel');
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
  await f
    .getByLabel('Follow up or request changes', { exact: true })
    .fill('Explain after this operation');
  await click(f, 'Send');
  await f.locator('.request-heading').getByText('Pending', { exact: true }).waitFor();
  await screenshot(page, f, 'en-chat-queued-message');
  await f.locator('.chat-activity').filter({ hasText: 'Running command' }).waitFor();
  await f.locator('.evidence-rail .chat-count').waitFor();
  assert.ok(await f.locator('.evidence-rail').isVisible());
  await screenshot(page, f, 'en-chat-command-activity');

  await click(f, 'Stop');
  await f
    .getByRole('status')
    .filter({ hasText: /^Stopped(?: ·|$)/ })
    .waitFor();
  const stoppedPid = Number(await readFile(marker, 'utf8'));
  await assert.rejects(readFile(`/proc/${stoppedPid}/stat`), { code: 'ENOENT' });
  assert.equal(await f.locator('.activity-spinner').count(), 0);
  await screenshot(page, f, 'en-command-stopped');
  longCommand = false;
  holdWorker = true;
  const nextRequest = new Promise((resolve) => {
    workerRequestObserved = resolve;
  });
  await click(f, 'Restart execution');
  await nextRequest;
  await f.locator('.chat-activity').filter({ hasText: 'Waiting for model response' }).waitFor();
  await screenshot(page, f, 'en-chat-silent-wait');
  const requestsBeforeReload = inferenceRequests.length;
  await command(page, 'View: Close Primary Side Bar');
  await page.locator('.part.sidebar').waitFor({ state: 'hidden' });
  assert.equal(inferenceRequests.length, requestsBeforeReload);
  await command(page, 'DualMind: Open Workbench');
  await page.locator('.part.sidebar').waitFor({ state: 'visible' });
  await f.getByRole('status').filter({ hasText: 'Worker executing' }).waitFor();
  assert.equal(
    inferenceRequests.length,
    requestsBeforeReload,
    'Hiding and revealing keeps the active request',
  );
  await screenshot(page, f, 'en-running-sidebar-revealed');
  const executingFrame = f;
  const executionDetached = page.waitForEvent('framedetached', {
    predicate: (candidate) => candidate === executingFrame,
    timeout: 30000,
  });
  await command(page, 'Developer: Reload Window');
  await executionDetached;
  await command(page, 'DualMind: Open Workbench');
  f = await frame(page);
  await f.getByRole('status').filter({ hasText: 'Interrupted' }).waitFor();
  assert.equal(
    inferenceRequests.length,
    requestsBeforeReload,
    'Reload must not replay model requests',
  );
  assert.equal(await readFile(join(taskDirectory, 'result.txt'), 'utf8'), 'fixed');
  assert.equal(await f.locator('.activity-spinner').count(), 0);
  assert.ok(await f.locator('.evidence-rail').isVisible());
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
      await command(page, 'DualMind: Open Workbench');
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
    await f
      .getByLabel('Follow up or request changes', { exact: true })
      .fill('Continue modification with the existing uncommitted result');
    await click(f, 'Send');
    await f
      .getByRole('status')
      .filter({ hasText: /Worker executing|Planning/ })
      .waitFor();
    await f
      .getByRole('status')
      .filter({ hasText: 'Completed — acceptance passed' })
      .waitFor({ timeout: 60000 });
    assert.equal(await readFile(join(workspace, 'result.txt'), 'utf8'), 'fixed');
    assert.equal(
      (await fixtureGit('symbolic-ref', '--short', 'HEAD')).trim(),
      mode === 'branch' ? 'ui-target' : originalBranch,
    );
    await screenshot(page, f, `en-chat-${mode}-continuation`);
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
    .fill('Write fixed to reading-result.txt and verify by reading this text document.');
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
  await f
    .getByRole('heading', { name: /Reviewer.*Execution plan · v2/ })
    .first()
    .waitFor();
  await f.getByText('Acceptance passed', { exact: true }).first().waitFor();
  await screenshot(page, f, 'en-reading-acceptance');
  await language(f, 'zh-CN');
  await f.getByRole('status').filter({ hasText: '已完成：验收通过' }).waitFor();
  await screenshot(page, f, 'zh-reading-acceptance');
  await size(820, 1040);
  await screenshot(page, f, 'zh-reading-acceptance-narrow');
  await size(1600, 1100);
  await language(f, 'en');
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
  await command(page, 'DualMind: Open Workbench');
  f = await frame(page);
  await f.getByRole('status').filter({ hasText: 'Interrupted' }).waitFor();
  assert.equal(inferenceRequests.length, readingRequestCount, 'Reload never replays Worker calls');
  await f
    .getByRole('heading', { name: /Reviewer.*Execution plan · v1/ })
    .first()
    .waitFor();
  await screenshot(page, f, 'en-reading-reload-interrupted');
  holdWorker = false;
  workerTurns = 0;
  reviewTurns = 0;
  const resumedFromReload = inferenceRequests.length;
  await click(f, 'Continue execution');
  await f
    .getByRole('status')
    .filter({ hasText: 'Completed — acceptance passed' })
    .waitFor({ timeout: 60000 });
  assert.ok(
    JSON.stringify(inferenceRequests[resumedFromReload].body).includes('execution_recovery'),
  );
  assert.equal(await f.locator('.recovery-notice').count(), 0);
  await screenshot(page, f, 'en-recovery-after-reload-complete');
  recoveryChecks.push('explicit reload recovery');

  for (const agent of ['worker', 'reviewer']) {
    workerTurns = 0;
    reviewTurns = 0;
    recoveryFault = { agent, remaining: 1, status: 401 };
    await click(f, 'Restart execution');
    await f
      .getByRole('status')
      .filter({ hasText: /^Failed(?: ·|$)/ })
      .waitFor({ timeout: 30000 });
    const notice = f.getByRole('region', { name: 'Execution recovery' });
    await notice.waitFor();
    assert.ok(
      (await notice.innerText()).includes(
        agent === 'worker' ? 'Worker · Implementation' : 'Reviewer · Acceptance',
      ),
    );
    assert.ok(await f.getByRole('button', { name: 'Continue execution', exact: true }).isEnabled());
    assert.equal(await f.locator('.activity-spinner').count(), 0);
    if (!(await f.locator('.evidence-rail').isVisible())) {
      await click(f, 'Tools, checks and review evidence');
      await click(f, 'Minimize evidence panel');
    }
    await screenshot(page, f, `en-recovery-${agent}-failed`);
    if (agent === 'worker') {
      await language(f, 'zh-CN');
      await screenshot(page, f, 'zh-recovery-worker-failed');
      await size(820, 1040);
      await screenshot(page, f, 'zh-recovery-worker-narrow');
      assert.ok(await f.getByRole('button', { name: '继续执行', exact: true }).isEnabled());
      await language(f, 'en');
      await screenshot(page, f, 'en-recovery-worker-narrow');
      await size(1600, 1100);
    }
    const requestOffset = inferenceRequests.length;
    // Two transient Responses failures after manually fixing the Reviewer account.
    recoveryFault = agent === 'reviewer' ? { agent, remaining: 2, status: 503 } : undefined;
    await click(f, 'Continue execution');
    if (agent === 'reviewer') {
      await f
        .locator('.chat-activity')
        .filter({ hasText: 'Waiting to retry' })
        .waitFor({ timeout: 15000 });
      await screenshot(page, f, 'en-recovery-retry-wait');
      await language(f, 'zh-CN');
      await size(820, 1040);
      await f.locator('.chat-activity').filter({ hasText: '等待重试' }).waitFor();
      await screenshot(page, f, 'zh-recovery-retry-narrow');
      await size(1600, 1100);
      await language(f, 'en');
    }
    await f
      .getByRole('status')
      .filter({ hasText: 'Completed — acceptance passed' })
      .waitFor({ timeout: 60000 });
    assert.ok(JSON.stringify(inferenceRequests[requestOffset].body).includes('execution_recovery'));
    assert.equal(inferenceRequests[requestOffset].worker, agent === 'worker');
    assert.ok(await f.locator('.evidence-rail').isVisible());
    assert.equal(await f.locator('.recovery-notice').count(), 0);
    await screenshot(page, f, `en-recovery-${agent}-complete`);
    recoveryChecks.push(`${agent} failure continues its saved role with panel preferences`);
  }
  recoveryFault = undefined;
  // Exercise the approved lifecycle controls against real disposable Git worktrees.
  await f.getByRole('button', { name: 'Model context usage', exact: true }).click();
  await screenshot(page, f, 'en-context-usage');
  await f.getByRole('button', { name: 'Task artifacts', exact: true }).click();
  await f.locator('.artifact-panel .artifact-facts').waitFor();
  const lifecycleDirectory = await f
    .locator('.artifact-panel .artifact-facts dd')
    .first()
    .innerText();
  await screenshot(page, f, 'en-artifacts-ready');
  await click(f, 'Commit task changes');
  await f
    .getByRole('dialog')
    .getByLabel('Commit message', { exact: true })
    .fill('test: preserve task artifact / 保存任务成果');
  await screenshot(page, f, 'en-artifact-commit');
  await f.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  await click(f, 'Merge into target branch');
  await screenshot(page, f, 'en-artifact-merge');
  await f.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  await f.getByText('Integrated; verify target', { exact: true }).waitFor();
  await writeFile(
    join(lifecycleDirectory, 'saved-ui-note.txt'),
    'Retain this untracked user file.',
  );
  await click(f, 'Refresh preview');
  await click(f, 'Clean up worktree');
  await screenshot(page, f, 'en-artifact-cleanup');
  await f.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await f.locator('.chat-composer textarea').count(), 0);
  await screenshot(page, f, 'en-artifact-cleaned-history');
  await click(f, 'Settings');
  await click(f, 'Model context');
  await f.getByRole('combobox', { name: 'Model ID', exact: true }).fill('example-model-alpha');
  await f
    .getByRole('spinbutton', { name: 'Known context window (tokens)', exact: true })
    .fill('65536');
  await click(f, 'Save');
  await saved(f, 'Context settings saved');
  await screenshot(page, f, 'en-context-settings');
  await click(f, 'Saved artifacts');
  await f.getByRole('heading', { name: 'Reading acceptance task', exact: true }).waitFor();
  await screenshot(page, f, 'en-saved-artifacts');
  await click(f, 'Restore as new task');
  await f
    .getByRole('dialog')
    .getByLabel('Task name', { exact: false })
    .fill('Restored UI artifact');
  await click(f, 'Create task');
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  await f.getByRole('heading', { name: 'Restored UI artifact', exact: true }).waitFor();
  await f.getByRole('button', { name: 'Task artifacts', exact: true }).click();
  await f.locator('.artifact-panel .artifact-facts').waitFor();
  const restoredDirectory = await f
    .locator('.artifact-panel .artifact-facts dd')
    .first()
    .innerText();
  assert.equal(
    await readFile(join(restoredDirectory, 'saved-ui-note.txt'), 'utf8'),
    'Retain this untracked user file.',
  );
  for (const width of [240, 320, 480]) {
    await sidebarWidth(page, width);
    await screenshot(page, f, `en-artifact-restored-${width}`);
  }
  await language(f, 'zh-CN');
  await screenshot(page, f, 'zh-artifact-restored-narrow');
  await language(f, 'en');
  await sidebarWidth(page, 1200);
  await click(f, 'Delete task: Restored UI artifact');
  await f.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await f.getByRole('button', { name: 'Reading acceptance task', exact: true }).click();
  await click(f, 'Delete task: Reading acceptance task');
  await f.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await f.getByRole('heading', { name: 'No tasks yet', exact: true }).waitFor();
  readingOnly = false;
  await click(f, 'Settings');
  await language(f, 'zh-CN');
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
  // Repeated ordinary failures must remain visible when evidence is minimized.
  await language(f, 'en');
  readingOnly = true;
  repeatToolFailure = true;
  workerTurns = 0;
  reviewTurns = 0;
  await size(1600, 1100);
  await click(f, 'New task');
  await f.getByLabel('Task name', { exact: false }).fill('Repeated tool error UI');
  await f
    .getByLabel('Task requirements', { exact: false })
    .fill('Read related files and verify the plain text artifact.');
  await f.getByRole('radio', { name: /^Feature/ }).check();
  await f
    .getByLabel('Reviewer Connection', { exact: true })
    .selectOption({ label: 'UI reviewer endpoint' });
  await click(f, 'Create task');
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  await click(f, 'Start');
  await f
    .locator('.recovery-notice')
    .getByText('Paused after repeated errors', { exact: false })
    .waitFor();
  assert.equal(workerTurns, 3);
  await click(f, 'Tools, checks and review evidence');
  await click(f, 'Minimize evidence panel');
  for (const locale of ['en', 'zh-CN']) {
    await language(f, locale);
    for (const width of [240, 320, 480]) {
      await sidebarWidth(page, width);
      await f.locator('.recovery-notice').scrollIntoViewIfNeeded();
      assert.ok(await f.locator('.recovery-notice').isVisible());
      await screenshot(page, f, `${locale}-tool-pause-${width}`);
    }
  }
  await language(f, 'en');
  await sidebarWidth(page, 1200);
  await f
    .getByRole('textbox', { name: 'Feedback for this task', exact: true })
    .fill('Inspect existing paths and continue with the requested artifact.');
  await click(f, 'Send feedback');
  await f.waitForFunction(() => document.querySelector('.recovery-notice textarea')?.value === '');
  repeatToolFailure = false;
  workerTurns = 0;
  await click(f, 'Continue execution');
  await f
    .getByRole('status')
    .filter({ hasText: 'Completed — acceptance passed' })
    .waitFor({ timeout: 30000 });
  assert.equal(await f.locator('.recovery-notice').count(), 0);
  await screenshot(page, f, 'en-tool-pause-repaired');
  if (process.env.DUAL_MIND_SKIP_REVIEW_UI !== '1') {
    await verifyReviewScenes({
      page,
      frame: f,
      profile,
      sidebarWidth,
      screenshot,
      language,
      click,
      executable,
    });
  }
  await click(f, 'Delete task: Repeated tool error UI');
  await f.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await f.getByRole('heading', { name: 'No tasks yet', exact: true }).waitFor();
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
        taskBranchesCreated: 4,
        repeatedToolPausePassed: true,
        approvedReviewScenesPassed: process.env.DUAL_MIND_SKIP_REVIEW_UI !== '1',
        themeMatrix: [
          'Light Modern',
          'Dark Modern',
          'Default High Contrast',
          'Default High Contrast Light',
        ],
        lifecycleArtifactsPassed: true,
        contextWindowSettingsPassed: true,
        savedArtifactRestorePassed: true,
        readingAcceptancePassed: true,
        readingRevisionCyclePassed: true,
        inferenceRequests: inferenceRequests.length,
        activityBarEntry: true,
        reloadInterrupted: true,
        recoveryChecks,
        directBranchModes: ['current', 'branch'],
      },
      null,
      2,
    ),
  );
  console.log(
    `Real Webview UI verification passed on VS Code ${version}; ${captures.length} screenshots in ${artifacts}`,
  );
}
try {
  await validateInterface();
} catch (error) {
  console.error(error);
  if (app) {
    const page = await app.firstWindow().catch(() => undefined);
    if (page) {
      await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => undefined);
      await writeFile(
        join(artifacts, 'failure-dom.txt'),
        await page.locator('body').innerText(),
      ).catch(() => undefined);
    }
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

// Resource-conscious callers may run the native suite separately.
if (process.env.DUAL_MIND_SKIP_NATIVE_UI !== '1' && process.env.DUAL_MIND_UI_REVIEW_ONLY !== '1') {
  await import('./verify-sidebar.mjs');
}
