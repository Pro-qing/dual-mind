/* global window, document, getComputedStyle */
import { _electron } from 'playwright-core';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';

const root = process.cwd();
const executable = await downloadAndUnzipVSCode(process.env.VSCODE_TEST_VERSION || 'stable');
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
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
let app;
const captures = [];
async function launch(folder = workspace) {
  app = await _electron.launch({
    executablePath: executable,
    args: [
      '--no-sandbox',
      '--disable-gpu',
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
  await f.evaluate(() => window.scrollTo(0, 0));
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
  await f.getByLabel('Base URL', { exact: false }).fill('https://example.test/v1');
  await f.getByLabel('Default model ID', { exact: false }).fill('verification-model');
  await click(f, 'Save connection');
  await saved(f);
  await screenshot(page, f, 'en-api-settings');
  assert.ok(await f.getByRole('button', { name: 'Test connection', exact: true }).isDisabled());
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
  await click(f, 'Reviewer 角色');
  await screenshot(page, f, 'zh-roles-narrow');
  await f.getByLabel('界面语言', { exact: true }).selectOption('en');
  await click(f, 'Back to tasks');
  await click(f, 'View examples');
  await screenshot(page, f, 'en-workbench-narrow');
  await click(f, 'Exit examples');
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
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify({ version, passed: true, screenshots: captures, profile, workspace }, null, 2),
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
  if (app) {
    await app.close();
  }
}
