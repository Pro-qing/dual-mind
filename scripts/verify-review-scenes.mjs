/* global document, window, getComputedStyle */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/** Exercise approved scenes in the real extension's existing isolated test profile. */
export async function verifyReviewScenes({
  page,
  frame: f,
  profile,
  sidebarWidth,
  screenshot,
  language,
  click,
  executable,
}) {
  const settingsFile = join(profile, 'User/settings.json');
  const themePackage = JSON.parse(
    await readFile(
      join(dirname(executable), 'resources/app/extensions/theme-defaults/package.json'),
      'utf8',
    ),
  );
  const themeIds = themePackage.contributes.themes.map((theme) => theme.id);
  const themeId = (name) => (themeIds.includes(name) ? name : `Default ${name}`);
  const closeEvidence = async () => {
    if (await f.locator('.evidence-panel').isVisible()) {
      await f
        .locator('.evidence-panel')
        .getByRole('button', { name: /^(Close|关闭)$/ })
        .click();
    }
  };
  await closeEvidence();
  await language(f, 'en');
  await sidebarWidth(page, 1200);
  await f.locator('.chat-messages .request-group').first().waitFor();
  const newest = f.locator('.chat-messages .request-group').last();
  await newest.locator('.request-heading').click();
  const collapsed = await newest.locator('.request-heading').getAttribute('aria-expanded');
  await click(f, 'Settings');
  await click(f, 'API Connections');
  const provider = f.getByRole('combobox', { name: 'Provider', exact: true });
  const protocol = f.getByRole('combobox', { name: 'Inference protocol', exact: true });
  const original = { provider: await provider.inputValue(), protocol: await protocol.inputValue() };
  await provider.selectOption('commandCode');
  await protocol.selectOption('anthropic');
  assert.ok(await f.getByRole('button', { name: 'Test & fetch models', exact: true }).isDisabled());
  await click(f, 'Save connection');
  await f.getByRole('button', { name: 'Test & fetch models', exact: true }).waitFor();
  await click(f, 'Test & fetch models');
  await f.getByText('Model list accessible', { exact: true }).waitFor();
  await screenshot(page, f, 'en-provider-command-code-anthropic');
  await provider.selectOption(original.provider);
  await protocol.selectOption(original.protocol);
  await click(f, 'Save connection');
  await f.getByRole('button', { name: 'Back to task', exact: true }).click();
  assert.equal(await newest.locator('.request-heading').getAttribute('aria-expanded'), collapsed);
  await f
    .locator('.chat-messages')
    .getByRole('button', { name: 'Expand all requests', exact: true })
    .click();

  for (const [theme, bodyClass, suffix] of [
    ['Light Modern', 'vscode-light', 'light'],
    ['Dark Modern', 'vscode-dark', 'dark'],
    ['Default High Contrast', 'vscode-high-contrast', 'hc-dark'],
    ['Default High Contrast Light', 'vscode-high-contrast-light', 'hc-light'],
  ]) {
    const settings = JSON.parse(await readFile(settingsFile, 'utf8'));
    await writeFile(
      settingsFile,
      JSON.stringify({ ...settings, 'workbench.colorTheme': themeId(theme) }),
    );
    await f.waitForFunction((expected) => document.body.classList.contains(expected), bodyClass);
    for (const locale of ['en', 'zh-CN']) {
      await language(f, locale);
      for (const width of [240, 320, 480, 1200]) {
        await sidebarWidth(page, width);
        await f
          .locator('.toast .icon-button')
          .evaluateAll((buttons) => buttons.forEach((button) => button.click()));
        const metrics = await f.evaluate(() => {
          const probe = document.createElement('div');
          probe.style.backgroundColor = 'var(--vscode-sideBar-background)';
          document.body.append(probe);
          const expected = getComputedStyle(probe).backgroundColor;
          probe.remove();
          const composer = document.querySelector('.chat-composer').getBoundingClientRect();
          return {
            expected,
            background: getComputedStyle(document.documentElement).backgroundColor,
            composerBottom: composer.bottom,
            viewport: window.innerHeight,
          };
        });
        assert.equal(
          metrics.background,
          metrics.expected,
          `${theme}: background must use the host sidebar color`,
        );
        assert.ok(
          metrics.composerBottom <= metrics.viewport + 2,
          `${theme}/${locale}/${width}: composer must stay visible`,
        );
        await screenshot(page, f, `${locale}-review-${suffix}-${width}`);
      }
    }
    await language(f, 'en');
    await f.getByRole('button', { name: 'Model context usage', exact: true }).click();
    assert.equal(
      await f
        .getByRole('button', { name: 'Model context usage', exact: true })
        .getAttribute('aria-expanded'),
      'true',
    );
    await f.getByRole('button', { name: 'Task artifacts', exact: true }).click();
    assert.equal(
      await f
        .getByRole('button', { name: 'Model context usage', exact: true })
        .getAttribute('aria-expanded'),
      'false',
    );
    await f.locator('.artifact-panel .artifact-facts').waitFor();
    await f.getByRole('button', { name: 'Task artifacts', exact: true }).click();
    await click(f, 'Tools, checks and review evidence');
    await f
      .locator('.evidence-list')
      .getByRole('button', { name: 'Expand all requests', exact: true })
      .click();
    await screenshot(page, f, `en-grouped-evidence-${suffix}`);
    await closeEvidence();
    await click(f, 'Settings');
    await click(f, 'API Connections');
    await sidebarWidth(page, 320);
    const contrast = await f.locator('.settings-item.selected').evaluate((element) => {
      const rgba = (color) => {
        const values = color.match(/[\d.]+/g).map(Number);
        return [values[0], values[1], values[2], values[3] ?? 1];
      };
      const luminance = (channels) => {
        const linear = channels.slice(0, 3).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      };
      // High-contrast selection fills can be translucent; composite the ancestor surfaces.
      const ancestors = [];
      for (let node = element; node; node = node.parentElement) {
        ancestors.unshift(node);
      }
      const background = ancestors.reduce(
        (under, node) => {
          const over = rgba(getComputedStyle(node).backgroundColor);
          return under.map((value, index) => value * (1 - over[3]) + over[index] * over[3]);
        },
        [255, 255, 255],
      );
      const front = luminance(rgba(getComputedStyle(element.querySelector('strong')).color));
      const back = luminance(background);
      return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
    });
    assert.ok(contrast >= 4.5, `${theme}: selected connection text contrast ${contrast}`);
    await screenshot(page, f, `en-provider-${suffix}-320`);
    await f.getByRole('button', { name: 'Back to task', exact: true }).click();
    await sidebarWidth(page, 1200);
  }
}
