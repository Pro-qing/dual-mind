const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { gzipSync, gunzipSync } = require('node:zlib');
const helpers = import('../scripts/bundled-tools.mjs');
async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dualmind-tools-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
function elf() {
  const binary = Buffer.alloc(120);
  Buffer.from('7f454c460201', 'hex').copy(binary);
  binary.writeUInt16LE(62, 18);
  binary.writeBigUInt64LE(64n, 32);
  binary.writeUInt16LE(56, 54);
  binary.writeUInt16LE(1, 56);
  binary.writeUInt32LE(1, 64);
  return binary;
}
async function fixture(name = 'jq') {
  const { digest } = await helpers,
    binary = elf(),
    license = Buffer.from('Fixture license\n');
  const archive = {
    url: 'https://github.com/jqlang/jq/releases/download/fixture/tool',
    sha256: digest(binary),
    bytes: binary.length,
    format: 'raw',
  };
  const tool = {
    name,
    version: '1.0.0',
    archive,
    files: [
      {
        path: `linux-x64/${name}/${name}`,
        sha256: archive.sha256,
        bytes: binary.length,
        executable: true,
      },
      {
        path: `linux-x64/${name}/COPYING`,
        url: 'https://raw.githubusercontent.com/jqlang/jq/fixture/COPYING',
        sha256: digest(license),
        bytes: license.length,
        executable: false,
      },
    ],
  };
  return {
    tool,
    binary,
    license,
    downloader: async (asset) => (asset.url === archive.url ? binary : license),
  };
}
function tar(name, data, type = '0') {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 12);
  header.fill(32, 148, 156);
  header.write(type, 156, 1);
  const sum = [...header].reduce((a, b) => a + b, 0);
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return gzipSync(
    Buffer.concat([
      header,
      data,
      Buffer.alloc((512 - (data.length % 512)) % 512),
      Buffer.alloc(1024),
    ]),
  );
}
test('locked manifest has three exact tools and rejects untrusted paths and sources', async () => {
  const { loadManifest, validateManifest } = await helpers;
  const manifest = await loadManifest();
  assert.deepEqual(
    manifest.tools.map((t) => t.name),
    ['rg', 'fd', 'jq'],
  );
  for (const mutate of [
    (m) => (m.tools[0].files[0].path = '../../outside'),
    (m) => (m.tools[0].archive.url = 'http://github.com/file'),
    (m) => (m.tools[0].archive.url = 'https://example.com/file'),
    (m) => (m.tools[1].name = 'rg'),
    (m) => (m.tools[0].archive.bytes = 100 * 1024 * 1024),
  ]) {
    const copy = structuredClone(manifest);
    mutate(copy);
    assert.throws(() => validateManifest(copy));
  }
});
test('archive reader extracts exact members and rejects links, traversal, duplicates and truncation', async () => {
  const { extractArchive } = await helpers;
  const data = Buffer.from('ok');
  assert.deepEqual(extractArchive(tar('bin/rg', data), new Set(['bin/rg'])).get('bin/rg'), data);
  for (const [name, type] of [
    ['../rg', '0'],
    ['/rg', '0'],
    ['bin/rg', '2'],
    ['bin/rg', '1'],
  ]) {
    assert.throws(() => extractArchive(tar(name, data, type), new Set([name])));
  }
  assert.throws(() => extractArchive(tar('bin/rg', data), new Set(['missing'])));
  assert.throws(() => extractArchive(Buffer.from('broken'), new Set()));
  const original = gunzipSync(tar('bin/rg', data));
  const member = original.subarray(0, original.length - 1024);
  assert.throws(() =>
    extractArchive(
      gzipSync(Buffer.concat([member, member, Buffer.alloc(1024)])),
      new Set(['bin/rg']),
    ),
  );
  const badHeader = Buffer.from(original);
  badHeader[1] ^= 1;
  assert.throws(() => extractArchive(gzipSync(badHeader), new Set(['bin/rg'])));
  assert.throws(() => extractArchive(gzipSync(original.subarray(0, 513)), new Set(['bin/rg'])));
});
test('download verifies size/hash and only follows bounded HTTPS upstream redirects', async () => {
  const { downloadAsset } = await helpers;
  const f = await fixture();
  assert.deepEqual(
    await downloadAsset(f.tool.archive, async () => new Response(f.binary)),
    f.binary,
  );
  await assert.rejects(
    downloadAsset(f.tool.archive, async () => new Response(Buffer.alloc(121))),
    /exceeded/,
  );
  await assert.rejects(
    downloadAsset(f.tool.archive, async () => new Response(Buffer.alloc(120))),
    /mismatch/,
  );
  await assert.rejects(
    downloadAsset(
      f.tool.archive,
      async () =>
        new Response(null, { status: 302, headers: { location: 'http://github.com/file' } }),
    ),
    /HTTPS/,
  );
  await assert.rejects(
    downloadAsset(
      f.tool.archive,
      async () =>
        new Response(null, { status: 302, headers: { location: 'https://github.com/again' } }),
    ),
    /redirects/,
  );
  await assert.rejects(
    downloadAsset(f.tool.archive, async () => new Response(null, { status: 404 })),
    /404/,
  );
});
test('validated cache is reused offline and failed new downloads retain the previous version', async (t) => {
  const { fetchTool, verifyFiles, cacheKey } = await helpers,
    cache = await temporary(t),
    f = await fixture();
  assert.equal(await fetchTool(f.tool, cache, f.downloader), 'downloaded');
  assert.equal(
    await fetchTool(f.tool, cache, async () => {
      throw Error('offline');
    }),
    'cached',
  );
  const next = structuredClone(f.tool);
  next.version = '1.0.1';
  await assert.rejects(
    fetchTool(next, cache, async () => {
      throw Error('offline');
    }),
    /offline/,
  );
  await verifyFiles(path.join(cache, cacheKey(f.tool)), f.tool);
  assert.equal((await fs.readdir(cache)).length, 1);
});
test('corrupt cache cannot replace a valid prepared output on failed offline preparation', async (t) => {
  const { fetchTool, prepareTools, verifyPrepared, cacheKey } = await helpers,
    root = await temporary(t),
    cache = path.join(root, 'cache'),
    output = path.join(root, 'prepared');
  const fixtures = await Promise.all(['rg', 'fd', 'jq'].map(fixture));
  const manifest = {
    schemaVersion: 1,
    platform: 'linux',
    arch: 'x64',
    tools: fixtures.map((f) => f.tool),
  };
  for (const f of fixtures) {
    await fetchTool(f.tool, cache, f.downloader);
  }
  await prepareTools(manifest, cache, output);
  await verifyPrepared(manifest, output);
  await fs.writeFile(
    path.join(cache, cacheKey(fixtures[0].tool), fixtures[0].tool.files[0].path),
    'bad',
  );
  await assert.rejects(prepareTools(manifest, cache, output), /tools:fetch/);
  await verifyPrepared(manifest, output);
});
test('ELF validation rejects wrong architecture, dynamic loader and malformed headers', async () => {
  const { checkElf } = await helpers;
  checkElf(elf());
  for (const mutate of [
    (b) => b.writeUInt16LE(183, 18),
    (b) => b.writeUInt32LE(3, 64),
    (b) => b.writeBigUInt64LE(9999999n, 32),
  ]) {
    const data = elf();
    mutate(data);
    assert.throws(() => checkElf(data));
  }
});
test('cache validation rejects executable permission loss and symlinks', async (t) => {
  const { fetchTool, verifyFiles, cacheKey } = await helpers,
    cache = await temporary(t),
    f = await fixture();
  await fetchTool(f.tool, cache, f.downloader);
  const directory = path.join(cache, cacheKey(f.tool)),
    file = path.join(directory, f.tool.files[0].path);
  if (process.platform !== 'win32') {
    await fs.chmod(file, 0o644);
    await assert.rejects(verifyFiles(directory, f.tool));
    await fs.chmod(file, 0o755);
    const copy = file + '.copy';
    await fs.rename(file, copy);
    await fs.symlink(copy, file);
    await assert.rejects(verifyFiles(directory, f.tool));
  }
});
