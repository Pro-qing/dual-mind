import { uptime } from 'node:os';
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { OperationError } from '../shared/errors';

export class CommandShutdownError extends OperationError {
  constructor() {
    super('commandShutdown');
  }
}
const execute = promisify(execFile);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function signalGroup(pid: number, signal: NodeJS.Signals | 0) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false;
    }
    throw new CommandShutdownError();
  }
}
export async function groupAlive(pid: number): Promise<boolean> {
  if (!signalGroup(pid, 0)) {
    return false;
  }
  if (process.platform === 'darwin') {
    const { stdout } = await execute('/bin/ps', ['-axo', 'pgid=,stat='], {
      timeout: 2000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.split('\n').some((line) => {
      const [group, state] = line.trim().split(/\s+/);
      return Number(group) === pid && state && !/^[ZX]/.test(state);
    });
  }
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/.test(entry)) {
      continue;
    }
    try {
      const stat = await readFile(`/proc/${entry}/stat`, 'utf8');
      const [state, , group] = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      if (Number(group) === pid && state !== 'Z' && state !== 'X') {
        return true;
      }
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code || '')) {
        throw new CommandShutdownError();
      }
    }
  }
  return false;
}
export interface WindowsProcess {
  pid: number;
  parent: number;
  created: string;
}
export function descendants(
  rows: WindowsProcess[],
  known: Map<number, string>,
  root: number,
  since: number,
) {
  // Creation times distinguish a tracked process from a later reuse of its PID.
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (
        !known.has(row.pid) &&
        Date.parse(row.created) >= since &&
        (row.pid === root || row.parent === root || known.has(row.parent))
      ) {
        const parent = rows.find((p) => p.pid === row.parent);
        if (known.has(row.parent) && parent && known.get(row.parent) !== parent.created) {
          continue;
        }
        known.set(row.pid, row.created);
        changed = true;
      }
    }
  }
  return rows.filter((row) => known.get(row.pid) === row.created);
}
const systemDirectory = () => path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
export async function windowsProcesses(timeoutMs = 5000): Promise<WindowsProcess[]> {
  const { stdout } = await execute(
    path.win32.join(systemDirectory(), 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | Where-Object { $_.CreationDate } | ForEach-Object { @{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;created=$_.CreationDate.ToUniversalTime().ToString('o')} }) | ConvertTo-Json -Compress",
    ],
    { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
  );
  const rows: unknown = JSON.parse(stdout);
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) =>
        !row ||
        !Number.isInteger(row.pid) ||
        !Number.isInteger(row.parent) ||
        !Number.isFinite(Date.parse(row.created)),
    )
  ) {
    throw new CommandShutdownError();
  }
  return rows;
}
/** Own the process group/tree until it has stopped, even after the parent exits. */
export class ProcessTree {
  private readonly known = new Map<number, string>();
  private pending?: Promise<WindowsProcess[]>;
  private timer?: ReturnType<typeof setInterval>;
  private failed = false;
  constructor(
    private readonly pid: number,
    private readonly since: number,
  ) {
    if (process.platform === 'win32') {
      this.timer = setInterval(() => {
        void this.scan().catch(() => {
          this.failed = true;
        });
      }, 250);
    }
  }
  private scan(timeoutMs = 5000) {
    this.pending ??= windowsProcesses(timeoutMs)
      .then((rows) => descendants(rows, this.known, this.pid, this.since))
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  dispose() {
    clearInterval(this.timer);
  }
  async stop(
    closed: () => boolean,
    parentExited = false,
  ): Promise<{ backgroundIncomplete: boolean }> {
    this.dispose();
    const start = Date.now();
    let backgroundIncomplete = false;
    if (process.platform === 'win32') {
      // Query again after killing: taskkill success alone is not proof of termination.
      while (Date.now() - start < 15000) {
        const alive = await this.scan(Math.min(5000, Math.max(1, 15000 - (Date.now() - start))));
        if (parentExited && alive.some((row) => row.pid !== this.pid)) {
          backgroundIncomplete = true;
        }
        if (!alive.length && closed()) {
          if (this.failed) {
            throw new CommandShutdownError();
          }
          return { backgroundIncomplete };
        }
        for (const row of alive) {
          const remaining = 15000 - (Date.now() - start);
          if (remaining <= 0) {
            throw new CommandShutdownError();
          }
          await execute(
            path.win32.join(systemDirectory(), 'taskkill.exe'),
            ['/PID', String(row.pid), '/T', '/F'],
            { timeout: Math.min(3000, remaining), windowsHide: true },
          ).catch(() => undefined);
        }
        await delay(50);
      }
    } else {
      // Observe survivors before signalling; cleanup success is not command success.
      backgroundIncomplete = parentExited && (await groupAlive(this.pid));
      signalGroup(this.pid, 'SIGTERM');
      let forced = false;
      while (Date.now() - start < 10000) {
        if (Date.now() - start >= 3000 && !forced) {
          signalGroup(this.pid, 'SIGKILL');
          forced = true;
        }
        if (!(await groupAlive(this.pid)) && closed()) {
          return { backgroundIncomplete };
        }
        await delay(25);
      }
    }
    throw new CommandShutdownError();
  }
}

/** Process creation identity is persisted separately from shell text and environment values. */
export interface ProcessIdentity {
  platform: NodeJS.Platform;
  pid: number;
  created: string;
  boot?: string;
  uptime?: number;
}
export async function processIdentity(pid: number): Promise<ProcessIdentity | undefined> {
  if (process.platform === 'win32') {
    const row = (await windowsProcesses()).find((row) => row.pid === pid);
    return row
      ? {
          platform: process.platform,
          pid,
          created: row.created,
          uptime: uptime(),
        }
      : undefined;
  }
  if (process.platform === 'linux') {
    try {
      const raw = await readFile(`/proc/${pid}/stat`, 'utf8');
      const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
      return {
        platform: process.platform,
        pid,
        created: fields[19],
        boot: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
      };
    } catch (error) {
      // A short-lived process can disappear after opening /proc/<pid>/stat.
      if (['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        return undefined;
      }
      throw error;
    }
  }
  if (process.platform === 'darwin') {
    const { stdout } = await execute('/bin/ps', ['-axo', 'pid=,lstart='], {
      timeout: 2000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const row = stdout
      .split('\n')
      .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
      .find((row) => Number(row?.[1]) === pid);
    return row
      ? {
          platform: process.platform,
          pid,
          created: row[2],
          uptime: uptime(),
        }
      : undefined;
  }
  throw new CommandShutdownError();
}
export async function recoverProcess(identity?: ProcessIdentity): Promise<void> {
  if (
    !identity ||
    identity.platform !== process.platform ||
    !Number.isSafeInteger(identity.pid) ||
    identity.pid < 1
  ) {
    throw new OperationError('recoveryProcessUnknown');
  }
  try {
    if (
      identity.boot &&
      process.platform === 'linux' &&
      identity.boot !== (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
    ) {
      return;
    }
    if (
      identity.uptime !== undefined &&
      Number.isFinite(identity.uptime) &&
      identity.uptime >= 0 &&
      uptime() < identity.uptime
    ) {
      return;
    }
    const current = await processIdentity(identity.pid);
    if (process.platform !== 'win32' && !(await groupAlive(identity.pid))) {
      return;
    }
    // With a missing/reused leader we cannot prove that orphaned descendants belong to this run.
    if (!current || current.created !== identity.created) {
      throw new OperationError('recoveryProcessUnknown');
    }
    const tree = new ProcessTree(identity.pid, Date.parse(identity.created) || 0);
    try {
      await tree.stop(() => true);
    } finally {
      tree.dispose();
    }
  } catch {
    throw new OperationError('recoveryProcessUnknown');
  }
}
