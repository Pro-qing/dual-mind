import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
export const defaultCache = path.join(root, 'out/bundled-tools/cache');
export const defaultOutput = path.join(root, 'dist/tools');
const maximumBytes = 32 * 1024 * 1024;
export const digest = (data) => createHash('sha256').update(data).digest('hex');
const safePath = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.includes('\\') &&
  !value.includes(':') &&
  !value.startsWith('/') &&
  !value.split('/').some((part) => part === '..' || part === '.' || !part);
const hosts = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'git.musl-libc.org',
]);
function checkUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password) {
    throw new Error('Tool download must use an approved upstream HTTPS host.');
  }
  return url;
}
export function validateManifest(manifest) {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.platform !== 'linux' ||
    manifest.arch !== 'x64' ||
    !Array.isArray(manifest.tools) ||
    manifest.tools.length !== 3
  ) {
    throw new Error('Invalid bundled tool manifest.');
  }
  const names = new Set();
  for (const tool of manifest.tools) {
    if (
      !['rg', 'fd', 'jq'].includes(tool.name) ||
      names.has(tool.name) ||
      !/^\d+\.\d+\.\d+$/.test(tool.version)
    ) {
      throw new Error('Invalid tool identity.');
    }
    names.add(tool.name);
    checkUrl(tool.archive.url);
    if (
      !['tar.gz', 'raw'].includes(tool.archive.format) ||
      !Array.isArray(tool.files) ||
      tool.files.length < 2
    ) {
      throw new Error('Invalid tool files.');
    }
    const files = new Set();
    for (const entry of [tool.archive, ...tool.files]) {
      if (
        !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        !Number.isSafeInteger(entry.bytes) ||
        entry.bytes < 1 ||
        entry.bytes > maximumBytes
      ) {
        throw new Error('Invalid tool digest or size.');
      }
    }
    for (const file of tool.files) {
      if (
        !safePath(file.path) ||
        !file.path.startsWith(`linux-x64/${tool.name}/`) ||
        files.has(file.path) ||
        typeof file.executable !== 'boolean'
      ) {
        throw new Error('Invalid or duplicate tool path.');
      }
      files.add(file.path);
      if (file.member && !safePath(file.member)) {
        throw new Error('Invalid archive member.');
      }
      if (file.url) {
        checkUrl(file.url);
      }
    }
    const executables = tool.files.filter((file) => file.executable);
    if (executables.length !== 1 || executables[0].path !== `linux-x64/${tool.name}/${tool.name}`) {
      throw new Error('Invalid tool executable.');
    }
  }
  return manifest;
}
export async function loadManifest() {
  return validateManifest(
    JSON.parse(await readFile(path.join(root, 'resources/tools/manifest.json'), 'utf8')),
  );
}
export function checkBytes(data, expected) {
  if (data.length !== expected.bytes || digest(data) !== expected.sha256) {
    throw new Error(`Tool size or SHA-256 mismatch: ${expected.path || expected.url}`);
  }
}
export function checkElf(data) {
  if (
    data.length < 64 ||
    data.subarray(0, 6).toString('hex') !== '7f454c460201' ||
    data.readUInt16LE(18) !== 62
  ) {
    throw new Error('Expected a Linux x64 ELF executable.');
  }
  const offset = Number(data.readBigUInt64LE(32)),
    width = data.readUInt16LE(54),
    count = data.readUInt16LE(56);
  if (
    !Number.isSafeInteger(offset) ||
    width < 56 ||
    !count ||
    count > 128 ||
    offset + width * count > data.length
  ) {
    throw new Error('Invalid ELF program headers.');
  }
  for (let index = 0; index < count; index++) {
    if (data.readUInt32LE(offset + index * width) === 3) {
      throw new Error('Bundled tools must not require a dynamic loader.');
    }
  }
}
/** Bounded, exact-member extraction; never writes paths supplied by an archive. */
export function extractArchive(compressed, wanted) {
  const tar = gunzipSync(compressed, { maxOutputLength: maximumBytes });
  const selected = new Map(),
    seen = new Set();
  const text = (header, start, length) =>
    header
      .subarray(start, start + length)
      .toString('utf8')
      .replace(/\0.*$/s, '');
  const octal = (field) => {
    const value = field.replace(/\0/g, '').trim();
    if (!/^[0-7]+$/.test(value)) {
      throw new Error('Invalid tar number.');
    }
    return Number.parseInt(value, 8);
  };
  let offset = 0,
    ended = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) {
      ended = true;
      break;
    }
    const checksum = [...header].reduce(
      (sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value),
      0,
    );
    if (checksum !== octal(text(header, 148, 8))) {
      throw new Error('Invalid tar checksum.');
    }
    const prefix = text(header, 345, 155),
      leaf = text(header, 0, 100);
    const name = (prefix ? `${prefix}/${leaf}` : leaf).replace(/\/$/, '');
    const type = header[156],
      size = octal(text(header, 124, 12));
    if (
      !safePath(name) ||
      seen.has(name) ||
      ![0, 48, 53].includes(type) ||
      size > maximumBytes ||
      offset + 512 + size > tar.length
    ) {
      throw new Error('Unsafe, linked, duplicate or truncated archive member.');
    }
    seen.add(name);
    if (wanted.has(name)) {
      if (type === 53) {
        throw new Error('Expected a regular tool file.');
      }
      selected.set(name, tar.subarray(offset + 512, offset + 512 + size));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!ended || [...wanted].some((name) => !selected.has(name))) {
    throw new Error('Incomplete tool archive.');
  }
  return selected;
}
export async function downloadAsset(asset, fetcher = fetch) {
  let url = checkUrl(asset.url);
  const signal = AbortSignal.timeout(30_000);
  for (let redirect = 0; redirect <= 5; redirect++) {
    const response = await fetcher(url, { redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) {
        throw new Error('Missing tool redirect location.');
      }
      url = checkUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`Tool download failed: HTTP ${response.status}`);
    }
    const reader = response.body.getReader(),
      parts = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        size += value.length;
        if (size > asset.bytes) {
          throw new Error('Tool download exceeded its locked size.');
        }
        parts.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const result = Buffer.concat(parts);
    checkBytes(result, asset);
    return result;
  }
  throw new Error('Too many tool download redirects.');
}
export const cacheKey = (tool) => `${tool.name}-${tool.version}-${digest(JSON.stringify(tool))}`;
export async function verifyFiles(
  directory,
  tool,
  executablePermissions = process.platform !== 'win32',
) {
  const base = await realpath(directory);
  for (const file of tool.files) {
    const target = path.join(directory, file.path),
      info = await lstat(target);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size !== file.bytes ||
      !(await realpath(target)).startsWith(base + path.sep)
    ) {
      throw new Error(`Invalid cached tool file: ${file.path}`);
    }
    const bytes = await readFile(target);
    checkBytes(bytes, file);
    if (file.executable) {
      checkElf(bytes);
      if (executablePermissions) {
        await access(target, constants.X_OK);
        if (!(info.mode & 0o111)) {
          throw new Error(`Missing executable permission: ${file.path}`);
        }
      }
    }
  }
}
async function replaceDirectory(staging, destination) {
  const backup = `${destination}.previous-${randomUUID()}`;
  let moved = false;
  try {
    await rename(destination, backup);
    moved = true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  try {
    await rename(staging, destination);
  } catch (error) {
    if (moved) {
      await rename(backup, destination);
    }
    throw error;
  }
  if (moved) {
    await rm(backup, { recursive: true, force: true });
  }
}
export async function fetchTool(tool, cache, downloader = downloadAsset) {
  await mkdir(cache, { recursive: true });
  const target = path.join(cache, cacheKey(tool));
  try {
    await verifyFiles(target, tool);
    return 'cached';
  } catch {
    // Keep the old cache until a complete replacement has passed validation.
  }
  const staging = await mkdtemp(path.join(cache, '.fetch-'));
  try {
    const archive = await downloader(tool.archive);
    checkBytes(archive, tool.archive);
    const entries =
      tool.archive.format === 'tar.gz'
        ? extractArchive(
            archive,
            new Set(tool.files.filter((file) => file.member).map((file) => file.member)),
          )
        : undefined;
    for (const file of tool.files) {
      const data = file.url ? await downloader(file) : entries ? entries.get(file.member) : archive;
      if (!data) {
        throw new Error(`Missing archive file: ${file.path}`);
      }
      checkBytes(data, file);
      const output = path.join(staging, file.path);
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, data, { mode: file.executable ? 0o755 : 0o644 });
    }
    await verifyFiles(staging, tool);
    await replaceDirectory(staging, target);
    return 'downloaded';
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
export async function prepareTools(manifest, cache = defaultCache, output = defaultOutput) {
  validateManifest(manifest);
  for (const tool of manifest.tools) {
    try {
      await verifyFiles(path.join(cache, cacheKey(tool)), tool);
    } catch {
      throw new Error(
        `Missing or invalid ${tool.name} cache. Run npm run tools:fetch, then retry. Build is offline.`,
      );
    }
  }
  await mkdir(path.dirname(output), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(output), '.tools-'));
  try {
    for (const tool of manifest.tools) {
      for (const file of tool.files) {
        const destination = path.join(staging, file.path);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(path.join(cache, cacheKey(tool), file.path), destination);
        await chmod(destination, file.executable ? 0o755 : 0o644);
      }
      await verifyFiles(staging, tool);
    }
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await replaceDirectory(staging, output);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
export async function verifyPrepared(manifest, directory = defaultOutput) {
  const actual = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(manifest)) {
    throw new Error('Prepared tool manifest differs from the locked source manifest.');
  }
  for (const tool of manifest.tools) {
    await verifyFiles(directory, tool);
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const manifest = await loadManifest();
    if (process.argv[2] === 'fetch') {
      for (const tool of manifest.tools) {
        console.log(`${tool.name} ${tool.version}: ${await fetchTool(tool, defaultCache)}`);
      }
    } else if (process.argv[2] === 'prepare') {
      await prepareTools(manifest);
      console.log('Prepared three offline Linux x64 tools.');
    } else if (process.argv[2] === 'verify') {
      await verifyPrepared(manifest);
      console.log('Verified tool hashes, architecture, permissions and licenses.');
    } else {
      throw new Error('Usage: node scripts/bundled-tools.mjs fetch|prepare|verify');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
