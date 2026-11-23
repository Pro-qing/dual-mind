import { createHash } from 'node:crypto';
import { lstat, readdir, readlink, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import * as path from 'node:path';
import { OperationError } from '../shared/errors';
import type { ArtifactFile } from '../shared/artifacts';
import type { GitProcess } from './process';

const generated = new Set([
  'node_modules',
  '.venv',
  'venv',
  'target',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  '__pycache__',
]);
const byteLimit = 256 * 1024 * 1024;
const entryLimit = 200_000;
export const artifactHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const validOperationId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const validCommit = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value);
export function artifactPath(root: string, relative: string): string {
  if (
    !relative ||
    relative.includes('\0') ||
    relative.includes('\\') ||
    path.isAbsolute(relative) ||
    path.win32.isAbsolute(relative) ||
    relative
      .split('/')
      .some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')
  ) {
    throw new OperationError('artifactUnsafe');
  }
  return path.join(root, ...relative.split('/'));
}
async function file(directory: string, name: string, algorithm: string): Promise<ArtifactFile> {
  const target = artifactPath(directory, name);
  // Never follow a parent link, even if files changed since the directory scan.
  let parent = directory;
  for (const component of name.split('/').slice(0, -1)) {
    parent = path.join(parent, component);
    const stat = await lstat(parent).catch((error) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (!stat) {
      return { path: name, kind: 'missing', mode: 0, hash: '', bytes: 0 };
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new OperationError('artifactUnsafe');
    }
  }
  const info = await lstat(target).catch((error) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
  if (!info) {
    return { path: name, kind: 'missing', mode: 0, hash: '', bytes: 0 };
  }
  if (info.isSymbolicLink()) {
    const link = Buffer.from(await readlink(target));
    return {
      path: name,
      kind: 'link',
      mode: 0o777,
      bytes: link.length,
      hash: createHash(algorithm).update(`blob ${link.length}\0`).update(link).digest('hex'),
    };
  }
  if (!info.isFile() || info.nlink !== 1 || info.size > byteLimit) {
    throw new OperationError('artifactUnsafe');
  }
  const handle = await open(
    target,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== info.size || stat.ino !== info.ino) {
      throw new OperationError('artifactChanged');
    }
    const hash = createHash(algorithm).update(`blob ${stat.size}\0`);
    let read = 0;
    for await (const bytes of handle.createReadStream({ autoClose: false })) {
      read += bytes.length;
      if (read > byteLimit) {
        throw new OperationError('artifactUnsafe');
      }
      hash.update(bytes);
    }
    const after = await handle.stat();
    if (read !== stat.size || after.mtimeMs !== stat.mtimeMs || after.size !== stat.size) {
      throw new OperationError('artifactChanged');
    }
    return {
      path: name,
      kind: 'file',
      mode: stat.mode & 0o777,
      bytes: stat.size,
      hash: hash.digest('hex'),
    };
  } finally {
    await handle.close();
  }
}
export async function objectFormat(git: GitProcess, directory: string) {
  const config = await git.run(['config', '--get', 'extensions.objectFormat'], directory);
  if (config.code === 1) {
    return 'sha1';
  }
  const format = config.stdout.trim();
  if (config.code || !['sha1', 'sha256'].includes(format)) {
    throw new OperationError('artifactUnsafe');
  }
  return format;
}
export async function gitFiles(git: GitProcess, directory: string): Promise<ArtifactFile[]> {
  const names = [
    ...new Set(
      (
        await git.checked(
          ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
          directory,
        )
      )
        .split('\0')
        .filter(Boolean),
    ),
  ].sort();
  const algorithm = await objectFormat(git, directory);
  const files: ArtifactFile[] = [];
  let bytes = 0;
  for (const name of names) {
    const item = await file(directory, name, algorithm);
    bytes += item.bytes;
    if (bytes > byteLimit || files.length >= 20_000) {
      throw new OperationError('artifactUnsafe');
    }
    files.push(item);
  }
  return files;
}
/** Include ignored user files. Only wholly untracked generated directories are excluded. */
export async function inventory(git: GitProcess, directory: string) {
  const algorithm = await objectFormat(git, directory);
  const tracked = (await git.checked(['ls-files', '--cached', '-z'], directory))
    .split('\0')
    .filter(Boolean);
  const files: ArtifactFile[] = [];
  const excluded: string[] = [];
  let entries = 0,
    bytes = 0;
  async function scan(relative: string, skip = false) {
    const folder = relative ? artifactPath(directory, relative) : directory;
    const stat = await lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new OperationError('artifactUnsafe');
    }
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (++entries > entryLimit) {
        throw new OperationError('artifactUnsafe');
      }
      if (entry.name.toLowerCase() === '.git') {
        if (relative) {
          throw new OperationError('artifactUnsafe');
        }
        continue;
      }
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const omit =
          !skip &&
          generated.has(entry.name) &&
          !tracked.some((p) => p === name || p.startsWith(name + '/'));
        if (omit) {
          excluded.push(name);
        }
        // Even excluded directories must not hide a nested repository.
        await scan(name, skip || omit);
      } else if (!skip) {
        const item = await file(directory, name, algorithm);
        bytes += item.bytes;
        if (bytes > byteLimit || files.length >= 20_000) {
          throw new OperationError('artifactUnsafe');
        }
        files.push(item);
      }
    }
  }
  await scan('');
  for (const name of tracked) {
    if (!files.some((f) => f.path === name)) {
      files.push(await file(directory, name, algorithm));
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, excluded: excluded.sort() };
}
export function contentHash(files: ArtifactFile[]) {
  return artifactHash(
    files
      .filter((f) => f.kind !== 'missing')
      .map(({ path, kind, hash, mode }) => ({
        path,
        kind,
        hash,
        executable: Boolean(mode & 0o111),
      })),
  );
}
export async function treeFiles(git: GitProcess, directory: string, ref: string) {
  const tree = new Map<string, { mode: string; hash: string }>();
  for (const record of (await git.checked(['ls-tree', '-r', '-z', ref], directory))
    .split('\0')
    .filter(Boolean)) {
    const tab = record.indexOf('\t');
    const [mode, type, hash] = record.slice(0, tab).split(' ');
    if (tab < 0 || type !== 'blob' || !validCommit(hash)) {
      throw new OperationError('artifactUnsafe');
    }
    tree.set(record.slice(tab + 1), { mode, hash });
  }
  return tree;
}
export function sameFiles(left: ArtifactFile[], right: ArtifactFile[]) {
  const normalized = (files: ArtifactFile[]) =>
    files.filter((f) => f.kind !== 'missing').sort((a, b) => a.path.localeCompare(b.path));
  return contentHash(normalized(left)) === contentHash(normalized(right));
}
/** Used only for a previously registered removal that Git has already partly completed. */
export async function verifyResidual(
  directory: string,
  files: ArtifactFile[],
  excluded: string[],
  algorithm: string,
) {
  let entries = 0;
  async function scan(relative: string) {
    const folder = relative ? artifactPath(directory, relative) : directory;
    const stat = await lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new OperationError('artifactUnsafe');
    }
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (++entries > entryLimit || entry.name.toLowerCase() === '.git') {
        throw new OperationError('artifactUnsafe');
      }
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await scan(name);
      } else if (!excluded.some((p) => name.startsWith(p + '/'))) {
        const item = await file(directory, name, algorithm);
        const expected = files.find((f) => f.path === name);
        if (!expected || contentHash([item]) !== contentHash([expected])) {
          throw new OperationError('artifactChanged');
        }
      }
    }
  }
  await scan('');
}
