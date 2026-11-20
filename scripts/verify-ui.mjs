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
    'workbench.activityBar.location': 'hidden',
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
const server = createServer((request, response) => {
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
  await app.evaluate(
    ({ BrowserWindow }, bounds) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.setSize(bounds.width, bounds.height);
      }
    },
    { width, height },
  );
}
async function command(page, name) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+P');
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
async function click(f, name) {
  await f.getByRole('button', { name, exact: true }).first().click();
}
async function saved(f, text = 'Saved locally') {
  await f.getByRole('status').filter({ hasText: text }).waitFor();
}
async function dismiss(f) {
  const button = f.locator('.toast .icon-button');
  if (await button.count()) {
    await button.click();
  }
}
async function screenshot(page, f, name) {
  await dismiss(f);
  if (!(await f.getByRole('listbox').count())) {
    await f.evaluate(() => window.scrollTo(0, 0));
  }
  await page.screenshot({ path: join(artifacts, `${name}.png`) });
  const metrics = await f.evaluate(() => ({
    width: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    metrics.scroll <= metrics.width + 2,
    `${name}: horizontal overflow ${JSON.stringify(metrics)}`,
  );
  captures.push(`${name}.png`);
}
async function assertMenuBounds(f) {
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
  await page.keyboard.press('Control+b');
  await command(page, 'DualMind: Open Workbench');
  let f = await frame(page);
  await f.getByRole('heading', { name: 'No tasks yet', exact: true }).waitFor();
  await screenshot(page, f, 'en-empty');
  await click(f, 'View examples');
  await screenshot(page, f, 'en-workbench');
  assert.equal(await f.locator('.task-item').count(), 4);
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
  await click(f, 'Back to tasks');
  await click(f, 'New task');
  await f.getByLabel('Task name', { exact: false }).fill('Persistent UI draft');
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
  await click(f, 'Create draft');
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  await f.getByRole('heading', { name: 'Persistent UI draft', exact: true }).waitFor();
  await f.locator('details summary').click();
  assert.equal(
    await f.locator('.instruction-snapshot').innerText(),
    'English review instructions retained across UI language changes.',
  );
  await click(f, 'Settings');
  await f.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  await click(f, '返回任务');
  await screenshot(page, f, 'zh-local-draft');
  // Reload exercises real global/workspace storage, configuration, serializer and Webview assets.
  const oldFrame = f;
  const detached = page.waitForEvent('framedetached', {
    predicate: (candidate) => candidate === oldFrame,
    timeout: 30000,
  });
  await command(page, 'Developer: Reload Window');
  await detached;
  f = await frame(page);
  await f.getByRole('heading', { name: 'Persistent UI draft', exact: true }).waitFor();
  await f.getByRole('button', { name: '设置', exact: true }).first().waitFor();
  await click(f, '编辑草稿');
  assert.equal(
    await f.getByRole('combobox', { name: 'Worker（执行者） 模型 ID', exact: true }).inputValue(),
    'example-model-alpha',
  );
  assert.equal(
    await f.getByRole('combobox', { name: 'Reviewer（审查者） 模型 ID', exact: true }).inputValue(),
    'manual-reviewer-model',
  );
  await f.getByLabel('最大轮次', { exact: true }).fill('7');
  await click(f, '保存草稿');
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await f.locator('.task-controls > span strong').innerText(), '7');
  await command(page, 'DualMind: Open Workbench');
  f = await frame(page);
  assert.equal(await page.locator('.tab').filter({ hasText: 'DualMind' }).count(), 1);
  // Task snapshots remain English while the surrounding UI is Chinese.
  await f.locator('details summary').click();
  assert.equal(
    await f.locator('.instruction-snapshot').innerText(),
    'English review instructions retained across UI language changes.',
  );
  await click(f, '查看示例');
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
  await click(f, 'Back to tasks');
  await click(f, 'View examples');
  await screenshot(page, f, 'en-workbench-narrow');
  await click(f, 'Exit examples');
  await click(f, 'Edit draft');
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
  await f.getByRole('heading', { name: 'Persistent UI draft', exact: true }).waitFor();
  await click(f, 'Delete task: Persistent UI draft');
  await screenshot(page, f, 'en-delete-task');
  await f.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await f.getByRole('heading', { name: 'No tasks yet', exact: true }).waitFor();
  assert.ok(requests.length >= 6);
  assert.ok(
    requests.every((request) => request.method === 'GET' && request.authorized && !request.hasBody),
  );
  assert.equal(
    await fixtureGit('for-each-ref', '--format=%(refname)', 'refs/heads/'),
    initialBranches,
    'Drafts, settings and model discovery must not create branches',
  );
  assert.equal(await fixtureGit('worktree', 'list', '--porcelain'), initialWorktrees);
  assert.equal(await fixtureGit('status', '--porcelain'), '');
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify(
      {
        version,
        passed: true,
        screenshots: captures,
        profile,
        workspace,
        modelQueries: requests.length,
        taskBranchesCreated: 0,
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
