import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  errorMessages,
  evidenceReasons,
  formatError,
  errorText,
  OperationError,
  redactError,
  toAppError,
} from '../../src/shared/errors';
import { GitTaskError } from '../../src/git/process';
import { fixture } from './fixtures';
import { secretKey } from '../../src/core/store';

test('error translations have matching parameters and preserve caller values literally', () => {
  for (const [code, translations] of Object.entries(errorMessages)) {
    assert.match(translations[1], /[\u4e00-\u9fff]/, code);
    const tokens = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(tokens(translations[0]), tokens(translations[1]), code);
  }
  const fault = toAppError(new OperationError('preparationFailed', { name: '$& 检查 <file>' }));
  assert.equal(formatError('zh-CN', fault), '准备命令执行失败：$& 检查 <file>');
  assert.equal(formatError('en', fault), 'Preparation failed: $& 检查 <file>');
  const git = toAppError(new GitTaskError('dirtyRepository', 'Original path context.'));
  assert.match(formatError('zh-CN', git), /未提交/);
  assert.equal(git.details, 'Original path context.');
});

test('unknown and legacy errors retain details while the primary message follows the locale', () => {
  const legacy = toAppError('Model request timed out.', 'legacyExecution');
  assert.equal(
    legacy.code,
    'legacyExecution',
    'Do not guess codes from historical English strings',
  );
  assert.match(errorText('zh-CN', legacy), /该次运行失败/);
  assert.match(errorText('zh-CN', legacy), /Model request timed out\./);
  const unknown = toAppError(Object.assign(new Error('EACCES /project/file'), { code: 'EACCES' }));
  assert.equal(unknown.code, 'operationFailed');
  assert.match(formatError('zh-CN', unknown), /操作失败/);
  assert.equal(unknown.details, 'EACCES /project/file');
  assert.deepEqual(toAppError({ code: 'constructor', params: {}, stack: 'private' }), {
    code: 'operationFailed',
  });
  assert.deepEqual(
    toAppError({ code: 'inferenceHttp', params: { status: 503, invalid: {}, missing: undefined } }),
    { code: 'inferenceHttp', params: { status: 503 } },
  );
});

test('error parameters and details redact secrets before size limits and preserve the original object', () => {
  const key = 'key/with space';
  const original = {
    code: 'preparationFailed' as const,
    params: { name: key },
    details: `${key} ${encodeURIComponent(key)} Bearer raw-token https://name:password@example.test/path?api_key=hidden`,
  };
  const fault = redactError(original, [key, 'key']);
  const serialized = JSON.stringify(fault);
  for (const value of [key, encodeURIComponent(key), 'raw-token', 'password', 'hidden']) {
    assert.ok(!serialized.includes(value));
  }
  assert.ok(serialized.includes('[redacted]'));
  assert.equal(original.params.name, key);
  assert.equal(
    redactError({ code: 'operationFailed', details: 'a'.repeat(13000) }).details?.length,
    12000,
  );
});

test('host error formatting redacts all saved connection keys and fails closed if storage cannot be read', async () => {
  const f = fixture();
  await f.store.dispatch({
    kind: 'connection.save',
    input: { name: 'Endpoint', baseUrl: 'http://localhost/v1', defaultModel: '' },
  });
  const id = (await f.store.snapshot()).connections[0].id;
  f.secrets.set(secretKey(id), 'private-host-key');
  const fault = await f.store.publicError(
    new OperationError(
      'preparationFailed',
      { name: 'private-host-key' },
      'Unknown error private-host-key',
    ),
  );
  for (const locale of ['en', 'zh-CN'] as const) {
    assert.ok(!errorText(locale, fault).includes('private-host-key'));
  }
  f.ports.secrets.get = async () => {
    throw new Error('secret store failed');
  };
  assert.deepEqual(await f.store.publicError(new Error('private-host-key')), {
    code: 'operationFailed',
  });
});

test('previous systemd errors remain readable after the runner change', () => {
  const stored = { code: 'systemdLimits', details: 'Historical probe result' };
  assert.equal(toAppError(stored).code, 'systemdLimits');
  assert.match(errorText('en', toAppError(stored)), /User systemd/);
  assert.match(errorText('zh-CN', toAppError(stored)), /用户级 systemd/);
  assert.match(errorText('zh-CN', toAppError(stored)), /Historical probe result/);
});

test('evidence reasons are bilingual, preserve literal fields and fall back for unknown legacy reasons', () => {
  for (const [reason, translations] of Object.entries(evidenceReasons)) {
    const tokens = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(tokens(translations[0]), tokens(translations[1]), reason);
    assert.match(translations[1], /[\u4e00-\u9fff]/, reason);
    for (const locale of ['en', 'zh-CN'] as const) {
      const rendered = formatError(locale, {
        code: 'evidenceInvalid',
        params: {
          reason,
          criterionId: 'criterion-$&',
          commandId: 'cmd-$&',
          expected: 2,
          actual: 1,
          blockers: 'Required test failed',
        },
      });
      assert.match(rendered, /criterion-\$&/);
      assert.match(rendered, /cmd-\$&/);
      assert.doesNotMatch(rendered, /\{\w+\}/);
    }
  }
  for (const reason of ['futureReason', '__proto__', 'constructor']) {
    assert.equal(
      formatError('en', { code: 'evidenceInvalid', params: { reason } }),
      errorMessages.evidenceInvalid[0],
    );
  }
});
