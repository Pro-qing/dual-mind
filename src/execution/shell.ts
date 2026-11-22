import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import type { ExecutionShell } from '../shared/environment';
import { OperationError } from '../shared/errors';
export async function findExecutable(
  program: string,
  env: Record<string, string>,
  platform: NodeJS.Platform = process.platform,
): Promise<string | undefined> {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const value = (name: string) =>
    Object.entries(env).find(([key]) =>
      platform === 'win32' ? key.toUpperCase() === name : key === name,
    )?.[1];
  const directories = paths.isAbsolute(program)
    ? ['']
    : (value('PATH') || '').split(paths.delimiter).filter((dir) => paths.isAbsolute(dir));
  const extensions = platform === 'win32' && !paths.extname(program) ? ['.exe', '.com'] : [''];
  for (const dir of directories) {
    for (const extension of extensions) {
      const candidate = dir ? paths.join(dir, program + extension) : program + extension;
      try {
        await access(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK);
        if ((await stat(candidate)).isFile()) {
          return candidate;
        }
      } catch {
        /* Try the next candidate. */
      }
    }
  }
  return undefined;
}
export async function selectShell(
  env: Record<string, string>,
  platform: NodeJS.Platform = process.platform,
): Promise<ExecutionShell> {
  const candidates: [string, ExecutionShell['kind']][] =
    platform === 'win32'
      ? [
          ['pwsh', 'powershell'],
          [
            path.win32.join(
              env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows',
              'System32',
              'WindowsPowerShell',
              'v1.0',
              'powershell.exe',
            ),
            'powershell',
          ],
          ['powershell', 'powershell'],
          [env.ComSpec || env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe', 'cmd'],
        ]
      : [
          ...(env.SHELL && /\/(bash|zsh)$/.test(env.SHELL)
            ? [[env.SHELL, path.posix.basename(env.SHELL)] as [string, ExecutionShell['kind']]]
            : []),
          [
            platform === 'darwin' ? '/bin/zsh' : '/bin/bash',
            platform === 'darwin' ? 'zsh' : 'bash',
          ],
          ['/bin/sh', 'sh'],
        ];
  for (const [program, kind] of candidates) {
    const found = await findExecutable(program, env, platform);
    if (found) {
      return { program: found, kind };
    }
  }
  throw new OperationError('commandNotFound', {
    name: 'shell',
    program: 'bash/zsh/sh or PowerShell/cmd',
  });
}
export function shellInvocation(
  shell: ExecutionShell,
  command: string,
  login = false,
): { program: string; args: string[] } {
  if (shell.kind === 'powershell') {
    // LASTEXITCODE survives a following successful cmdlet; capture $? before assigning it.
    const script = `$OutputEncoding = [Console]::OutputEncoding = [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)\n$ErrorActionPreference = 'Stop'\n$global:LASTEXITCODE = 0\ntry {\n${command}\n$dualMindSuccess = $?\nif ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\nif (-not $dualMindSuccess) { exit 1 }\n} catch { [Console]::Error.WriteLine($_.ToString()); exit 1 }\n`;
    return {
      program: shell.program,
      args: [
        '-NoLogo',
        '-NonInteractive',
        ...(login ? [] : ['-NoProfile']),
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
    };
  }
  if (shell.kind === 'cmd') {
    return { program: shell.program, args: ['/d', '/s', '/c', `chcp 65001 >nul\r\n${command}`] };
  }
  return {
    program: shell.program,
    args: login
      ? ['-ilc', command]
      : shell.kind === 'bash'
        ? ['--noprofile', '--norc', '-c', command]
        : shell.kind === 'zsh'
          ? ['-f', '-c', command]
          : ['-c', command],
  };
}
