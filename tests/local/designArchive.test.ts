import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';

async function archive(context: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'dualmind-design-check-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const path of [
    'scripts',
    'docs/en',
    'docs/zh',
    'docs/design/v0.0.1',
    'docs/design/v0.0.2',
    'docs/design/v9.8.7',
  ]) {
    await mkdir(join(root, path), { recursive: true });
  }
  await copyFile('scripts/check-docs.mjs', join(root, 'scripts/check-docs.mjs'));
  for (const name of ['README', 'CONTRIBUTING', 'CODE_OF_CONDUCT', 'SECURITY', 'CHANGELOG']) {
    await writeFile(join(root, `${name}.md`), `[中文](./${name}.zh.md)\n`);
    await writeFile(join(root, `${name}.zh.md`), `[English](./${name}.md)\n`);
  }
  for (const [version, names] of [
    ['v0.0.1', ['workbench', 'api-settings', 'reviewer-roles', 'new-task', 'delete-task']],
    ['v0.0.2', ['api-model-discovery', 'task-model-selection']],
  ] as const) {
    for (const name of names) {
      for (const extension of ['svg', 'png']) {
        const path = `docs/design/${version}/dual-mind-${name}.${extension}`;
        await copyFile(path, join(root, path));
      }
    }
  }
  for (const extension of ['svg', 'png']) {
    await copyFile(
      `docs/design/v0.0.5/dual-mind-sidebar-left-proposal.${extension}`,
      join(root, `docs/design/v9.8.7/future.${extension}`),
    );
  }
  await writeFile(
    join(root, 'docs/design/v9.8.7/README.md'),
    '[SVG](./future.svg) · [PNG](./future.png)\n',
  );
  return {
    root,
    check: () =>
      spawnSync(process.execPath, ['scripts/check-docs.mjs'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
      }),
  };
}

test('versioned design checks discover new folders and preserve links and image validation', async (context) => {
  const { root, check } = await archive(context);
  const result = check();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /8 SVG\/PNG design pairs/);
  await writeFile(
    join(root, 'docs/design/v9.8.7/future.svg'),
    '<svg><script>invalid</script></svg>',
  );
  await writeFile(join(root, 'docs/design/v9.8.7/future.png'), 'not a PNG');
  const invalid = check();
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /v9\.8\.7\/future\.svg: expected a 1440/);
  assert.match(invalid.stderr, /only static vector elements/);
  assert.match(invalid.stderr, /v9\.8\.7\/future\.png: expected a 1440/);
});

test('missing versioned previews, broken archive links and original scenes fail validation', async (context) => {
  const { root, check } = await archive(context);
  await rm(join(root, 'docs/design/v9.8.7/future.png'));
  await rm(join(root, 'docs/design/v0.0.1/dual-mind-workbench.svg'));
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /README\.md: missing or invalid local link .\/future\.png/);
  assert.match(result.stderr, /v9\.8\.7\/future\.png: cannot read the matching PNG/);
  assert.match(result.stderr, /v0\.0\.1\/dual-mind-workbench\.svg: missing required design scene/);
  assert.match(result.stderr, /v0\.0\.1\/dual-mind-workbench\.png: preview has no matching SVG/);
});

test('loose assets and unversioned or deeply nested folders cannot silently bypass design checks', async (context) => {
  const { root, check } = await archive(context);
  for (const folder of ['', 'unversioned', 'v9.8.7/nested']) {
    await mkdir(join(root, 'docs/design', folder), { recursive: true });
    for (const extension of ['svg', 'png']) {
      await copyFile(
        join(root, `docs/design/v9.8.7/future.${extension}`),
        join(root, 'docs/design', folder, `loose.${extension}`),
      );
    }
  }
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /docs\/design\/loose\.svg: expected an asset inside one v/);
  assert.match(result.stderr, /unversioned\/loose\.png: expected an asset inside one v/);
  assert.match(result.stderr, /v9\.8\.7\/nested\/loose\.svg: expected an asset inside one v/);
});
