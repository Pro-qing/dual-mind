/* global window, document */
import { _electron } from 'playwright-core';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const executable =
  process.env.VSCODE_TEST_EXECUTABLE ||
  (await downloadAndUnzipVSCode(process.env.VSCODE_TEST_VERSION || 'stable'));
const version = JSON.parse(
  await readFile(join(dirname(executable), 'resources/app/package.json'), 'utf8'),
).version;
const artifacts = resolve('.vscode-test/ui-validation', version, 'sidebar-native');
const temporary = await mkdtemp(join(tmpdir(), 'dualmind-sidebar-'));
const profile = join(temporary, 'profile');
const workspace = join(temporary, 'workspace');
const legacy = join(temporary, 'legacy');
const broken = join(temporary, 'broken');
for (const path of [artifacts, workspace, legacy, broken, join(profile, 'User')]) {
  await mkdir(path, { recursive: true });
}
await writeFile(
  join(profile, 'User/settings.json'),
  JSON.stringify({
    'workbench.startupEditor': 'none',
    'security.workspace.trust.enabled': false,
    'window.commandCenter': false,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'chat.disableAIFeatures': true,
    'git.enabled': false,
    'dualMind.language': 'en',
    'window.restoreWindows': 'all',
    'workbench.panel.defaultLocation': 'bottom',
  }),
);
// A disposable previous-version extension creates a real serialized editor tab.
// Its identity is the same, so VS Code restores it through the production serializer.
await writeFile(
  join(legacy, 'package.json'),
  JSON.stringify({
    name: 'dual-mind',
    publisher: 'Pro-qing',
    version: '0.0.4',
    engines: { vscode: '^1.100.0' },
    main: './extension.cjs',
    activationEvents: ['onStartupFinished'],
  }),
);
await writeFile(
  join(legacy, 'extension.cjs'),
  `const vscode = require('vscode');
exports.activate = () => {
 vscode.window.registerWebviewPanelSerializer('dualMind.workbench', {deserializeWebviewPanel: async () => {}});
 const p = vscode.window.createWebviewPanel('dualMind.workbench', 'DualMind', vscode.ViewColumn.One, {enableScripts:true, retainContextWhenHidden:true});
 p.webview.html = '<!doctype html><html><body><h1 id="legacy">Legacy workbench fixture</h1><script>acquireVsCodeApi().setState({version:1,navigation:{view:"defaults",returnTo:{view:"home"}},chats:{}});</script></body></html>';
};`,
);
for (const path of [
  'package.json',
  'package.nls.json',
  'package.nls.zh-cn.json',
  'dist',
  'resources',
]) {
  await cp(join(root, path), join(broken, path), { recursive: true });
}
const mainJs = await readFile(join(root, 'dist/webview/main.js'));
await writeFile(
  join(broken, 'dist/webview/main.js'),
  'throw new Error("Intentional sidebar initialization fault");',
);
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
let app;
const checks = [];
async function launch(extension = root) {
  app = await _electron.launch({
    executablePath: executable,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      ...(process.env.DUAL_MIND_RESOURCE_UI === '1'
        ? [
            '--disable-extensions',
            '--renderer-process-limit=2',
            '--js-flags=--max-old-space-size=128',
          ]
        : []),
      '--password-store=basic',
      '--skip-welcome',
      '--skip-release-notes',
      ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : []),
      `--user-data-dir=${profile}`,
      `--extensions-dir=${join(temporary, 'extensions')}`,
      `--extensionDevelopmentPath=${extension}`,
      workspace,
    ],
    env: environment,
    timeout: 45000,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await page.waitForSelector('.monaco-workbench');
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.unmaximize();
      w.setSize(1600, 1100);
    }
  });
  return page;
}
async function close() {
  if (app) {
    await app.close();
    app = undefined;
  }
}
async function command(page, name) {
  await page
    .locator('.menubar-menu-button')
    .filter({ hasText: /^View$/ })
    .click({ delay: 100 });
  await page.getByRole('menuitem', { name: /Command Palette/ }).click({ delay: 250 });
  await page.locator('.quick-input-widget input').fill(`>${name}`);
  await page
    .locator('.quick-input-list .monaco-list-row')
    .filter({ hasText: name })
    .first()
    .click();
}
async function frame(page, selector = '.dm-app') {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      if (
        await f
          .locator(selector)
          .count()
          .catch(() => 0)
      ) {
        return f;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Missing frame ${selector}`);
}
async function capture(page, f, name) {
  await page
    .locator('.notifications-toasts .codicon-notifications-clear')
    .evaluateAll((buttons) => buttons.forEach((button) => button.click()));
  await f
    .locator('.toast .icon-button')
    .evaluateAll((buttons) => buttons.forEach((button) => button.click()));
  assert.ok(
    await f.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
    `${name}: no horizontal overflow`,
  );
  await page.screenshot({ path: join(artifacts, `${name}.png`) });
  checks.push(name);
  console.log(`Sidebar: ${name}`);
}
async function resize(page, width, secondary = false) {
  const selector = secondary ? '.part.auxiliarybar' : '.part.sidebar';
  const bounds = await page.locator(selector).boundingBox();
  assert.ok(bounds);
  const edge = secondary ? bounds.x : bounds.x + bounds.width;
  const sashes = await page.locator('.monaco-sash.vertical').evaluateAll((items) =>
    items
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, height: r.height };
      })
      .filter((r) => r.height > 100),
  );
  const sash = sashes.sort((a, b) => Math.abs(a.x - edge) - Math.abs(b.x - edge))[0];
  assert.ok(sash && Math.abs(sash.x - edge) < 10);
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
    { selector, width },
  );
}
async function assertNoTabs(page) {
  assert.equal(await page.locator('.tab').filter({ hasText: 'DualMind' }).count(), 0);
}

try {
  let page = await launch(legacy);
  await frame(page, '#legacy');
  await close();
  page = await launch(broken);
  const old = await frame(page, '#retry');
  // A broken sidebar must not discard the legacy tab. The 20-second host timeout
  // makes the next click rebuild a fresh page and test the actual retry path.
  await page
    .getByText(/workbench.*(timed out|initialize)|工作台.*超时/i)
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => undefined);
  assert.equal(await page.locator('.tab').filter({ hasText: 'DualMind' }).count(), 1);
  await capture(page, old, 'migration-failure-retains-tab');
  await writeFile(join(broken, 'dist/webview/main.js'), mainJs);
  await old.locator('#retry').click();
  let f = await frame(page);
  await f.getByRole('heading', { name: 'Defaults for new tasks', exact: true }).waitFor();
  await page.locator('.tab').filter({ hasText: 'DualMind' }).waitFor({ state: 'hidden' });
  await capture(page, f, 'migration-retry-imports-settings');
  await close();
  page = await launch();
  f = await frame(page);
  assert.equal(
    await f.getByRole('combobox', { name: 'Settings category' }).inputValue(),
    'defaults',
  );
  await f.getByRole('combobox', { name: 'Settings category' }).selectOption('roles');
  await f.getByRole('heading', { name: /Reviewer role/i }).waitFor();
  await close();
  page = await launch(legacy);
  await frame(page, '#legacy');
  await close();
  page = await launch();
  f = await frame(page);
  await f.getByRole('combobox', { name: 'Settings category' }).waitFor();
  assert.equal(
    await f.getByRole('combobox', { name: 'Settings category' }).inputValue(),
    'roles',
    'Existing sidebar state wins over the older tab',
  );
  await page.locator('.tab').filter({ hasText: 'DualMind' }).waitFor({ state: 'hidden' });
  await capture(page, f, 'existing-sidebar-state-wins');
  await f.getByRole('button', { name: 'Back to home', exact: true }).click();
  await f.getByRole('button', { name: 'New task', exact: true }).click();
  await f.getByLabel(/Task name/).fill('Sidebar layout verification');
  await f
    .getByLabel(/Task requirements/)
    .fill(
      Array.from(
        { length: 50 },
        (_, i) =>
          `Requirement ${i + 1}: preserve chat, narrow controls and native layout. 中文路径与长消息。`,
      ).join('\n'),
    );
  await f.getByRole('radio', { name: /^Bug/ }).click();
  await f.getByRole('button', { name: 'Create task', exact: true }).click();
  await f.locator('.task-chat').waitFor();
  const composer = f.locator('.chat-composer textarea');
  await composer.fill('Unsent draft retained while opening Settings.');
  await f.getByRole('button', { name: 'Settings', exact: true }).click();
  await f.getByRole('combobox', { name: 'Settings category' }).selectOption('defaults');
  await f.getByRole('button', { name: 'Back to task', exact: true }).click();
  assert.equal(await composer.inputValue(), 'Unsent draft retained while opening Settings.');
  for (const locale of ['en', 'zh-CN']) {
    await f.getByRole('button', { name: /^(Settings|设置)$/ }).click();
    await f.getByLabel(/^(Language|界面语言)$/).selectOption(locale);
    await f.getByRole('button', { name: /^(Back to task|返回任务)$/ }).click();
    for (const width of [240, 320, 480, 800]) {
      await resize(page, width);
      await f.waitForFunction((width) => window.innerWidth <= width + 2, width);
      assert.ok(
        await composer.evaluate((e) => {
          const r = e.getBoundingClientRect();
          return r.top > 0 && r.bottom <= window.innerHeight;
        }),
        'Composer stays inside the sidebar',
      );
      await capture(page, f, `${locale}-task-${width}`);
    }
  }
  await f.getByRole('button', { name: '设置', exact: true }).click();
  await f.getByLabel('界面语言', { exact: true }).selectOption('en');
  await f.getByRole('button', { name: 'Back to task', exact: true }).click();
  await resize(page, 360);
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.setSize(1600, 460);
    }
  });
  await composer.scrollIntoViewIfNeeded();
  await capture(page, f, 'short-window-controls');
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.setSize(1600, 1100);
    }
  });
  await command(page, 'DualMind: Keep Terminal in Editor Area');
  const before = await f.evaluate(() => window.innerHeight);
  await command(page, 'View: Toggle Terminal');
  await page.locator('.part.panel').waitFor({ state: 'visible' });
  assert.equal(await f.evaluate(() => window.innerHeight), before);
  await capture(page, f, 'primary-centered-terminal');
  const panel = await page.locator('.part.panel').boundingBox();
  const horizontal = await page.locator('.monaco-sash.horizontal').evaluateAll((items) =>
    items
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width };
      })
      .filter((r) => r.width > 100),
  );
  const divider = horizontal.sort((a, b) => Math.abs(a.y - panel.y) - Math.abs(b.y - panel.y))[0];
  assert.ok(divider && Math.abs(divider.y - panel.y) < 10);
  await page.mouse.move(divider.x, divider.y);
  await page.mouse.down();
  await page.mouse.move(divider.x, divider.y - 120, { steps: 8 });
  await page.mouse.up();
  assert.equal(await f.evaluate(() => window.innerHeight), before);
  await capture(page, f, 'resized-terminal-preserves-sidebar-height');
  await command(page, 'View: Set Panel Alignment to Justify');
  await f.waitForFunction((height) => window.innerHeight < height - 100, before);
  await command(page, 'DualMind: Keep Terminal in Editor Area');
  await f.waitForFunction((height) => window.innerHeight === height, before);
  await capture(page, f, 'manual-terminal-alignment-restores-height');
  await page
    .locator('.activitybar')
    .getByRole('tab', { name: /DualMind/ })
    .click({ button: 'right', delay: 250 });
  await page.getByRole('menuitem', { name: /^Move To/ }).click({ delay: 250 });
  // VS Code attaches submenu mouse-up handlers after a 100ms guard.
  await page.getByRole('menuitem', { name: /Secondary Side Bar/ }).click({ delay: 250 });
  f = await frame(page);
  await page.locator('.part.auxiliarybar').waitFor({ state: 'visible' });
  await resize(page, 400, true);
  await capture(page, f, 'secondary-sidebar-terminal');
  await command(page, 'DualMind: Open Workbench');
  await assertNoTabs(page);
  assert.ok(await page.locator('.part.auxiliarybar').isVisible());
  await command(page, 'View: Toggle Primary Side Bar Position');
  f = await frame(page);
  await capture(page, f, 'swapped-sidebar-positions');
  await command(page, 'View: Toggle Primary Side Bar Position');
  f = await frame(page);
  await f.locator('.task-details summary').click();
  await f
    .locator('.chat-composer textarea')
    .fill('Draft retained while the secondary sidebar is hidden.');
  await command(page, 'View: Toggle Secondary Side Bar Visibility');
  await page.locator('.part.auxiliarybar').waitFor({ state: 'hidden' });
  await command(page, 'DualMind: Open Workbench');
  await page.locator('.part.auxiliarybar').waitFor({ state: 'visible' });
  f = await frame(page);
  assert.equal(
    await f.locator('.chat-composer textarea').inputValue(),
    'Draft retained while the secondary sidebar is hidden.',
  );
  await close();
  page = await launch();
  f = await frame(page);
  await page.locator('.part.auxiliarybar').waitFor({ state: 'visible' });
  await f.locator('.task-chat').waitFor();
  assert.notEqual(
    await f.locator('.task-details').getAttribute('open'),
    null,
    'Detail preference survives view recreation and reload',
  );
  await assertNoTabs(page);
  await capture(page, f, 'secondary-location-reload');
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify({ version, passed: true, checks, profile, workspace }, null, 2),
  );
  console.log(`Native sidebar verification passed on ${version}; ${checks.length} checks.`);
} catch (error) {
  console.error(error);
  const page = await app?.firstWindow().catch(() => undefined);
  if (page) {
    await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => undefined);
    await writeFile(
      join(artifacts, 'failure-dom.txt'),
      await page.locator('body').innerText(),
    ).catch(() => undefined);
  }
  throw error;
} finally {
  await close();
}
