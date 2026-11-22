import { writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RecoveryStore, type RecoveryOperation } from '../../../src/execution/recovery';

async function main() {
  const [folder, runId, operationId, mode] = process.argv.slice(2);
  const records = new RecoveryStore(folder, runId);
  await records.load();
  const operation: RecoveryOperation = {
    id: operationId,
    generation: 1,
    kind: 'tool',
    phase: 'worker',
    agent: 'worker',
    name: 'write_file',
    status: 'started',
    time: new Date().toISOString(),
    args: { path: 'artifact.txt', content: 'written before crash' },
  };
  await records.operation(operation);
  await writeFile(join(folder, 'artifact.txt'), 'written before crash');
  if (mode === 'completed') {
    await records.operation({
      ...operation,
      status: 'succeeded',
      result: { written: 'artifact.txt' },
    });
  }
  if (mode === 'torn') {
    await appendFile(join(folder, `${runId}.journal`), '{"version":1');
  }
  process.kill(process.pid, 'SIGKILL');
}
void main();
