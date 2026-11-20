const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseOsRelease, evaluateEnvironment } = require('../scripts/check-environment.cjs');
const { getNodeVersionError } = require('../scripts/check-node.cjs');
const { getGitVersionError } = require('../scripts/check-git.cjs');

function ubuntu(version, overrides = {}) {
  return {
    platform: 'linux',
    arch: 'x64',
    release: { ID: 'ubuntu', VERSION_ID: version },
    nodeVersion: 'v24.22.3',
    gitVersion: 'git version 2.25.1',
    ...overrides,
  };
}

test('reads quoted and unquoted os-release fields without executing shell content', () => {
  const release = parseOsRelease(
    [
      '# comment',
      'ID=ubuntu',
      'VERSION_ID="20.04"',
      "PRETTY_NAME='Ubuntu 20.04.6 LTS'",
      'NAME=$(not-a-command)',
      '',
    ].join('\n'),
  );
  assert.equal(release.ID, 'ubuntu');
  assert.equal(release.VERSION_ID, '20.04');
  assert.equal(release.PRETTY_NAME, 'Ubuntu 20.04.6 LTS');
  assert.equal(release.NAME, '$(not-a-command)');
});

for (const version of ['18.04', '19.10', '20.03', '9.10']) {
  test('rejects Ubuntu ' + version + ' with a minimum-version explanation', () => {
    const result = evaluateEnvironment(ubuntu(version));
    assert.equal(result.verified, false);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /Ubuntu 20\.04 or newer/);
  });
}

for (const version of ['20.04', '20.04.6', '20.10', '22.04', '24.04']) {
  test('accepts Ubuntu ' + version + ' amd64 with Node.js 24', () => {
    assert.deepEqual(evaluateEnvironment(ubuntu(version)), {
      errors: [],
      warnings: [],
      verified: true,
    });
  });
}

for (const version of ['v10.19.0', 'v20.20.2', 'v22.0.0', 'v26.0.0']) {
  test('rejects development Node.js ' + version + ' and explains nvm selection', () => {
    const result = evaluateEnvironment(ubuntu('20.04', { nodeVersion: version }));
    assert.equal(result.verified, false);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /Node\.js 24/);
    assert.match(result.errors[0], /nvm install/);
    assert.match(result.errors[0], /nvm use/);
  });
}

test('retains the standalone Node check for supported versions', () => {
  assert.equal(getNodeVersionError('v24.0.0'), null);
  assert.equal(getNodeVersionError('24.22.3'), null);
});

test('warns for ARM64 without introducing an architecture install restriction', () => {
  const result = evaluateEnvironment(ubuntu('20.04', { arch: 'arm64' }));
  assert.deepEqual(result.errors, []);
  assert.equal(result.verified, false);
  assert.match(result.warnings.join(' '), /arm64.*not yet validated/);
});

for (const platform of ['win32', 'darwin']) {
  test('warns for ' + platform + ' without introducing a platform install restriction', () => {
    const result = evaluateEnvironment({
      platform,
      arch: 'x64',
      nodeVersion: 'v24.22.3',
      gitVersion: 'git version 2.43.0',
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.verified, false);
    assert.match(result.warnings.join(' '), /not yet validated/);
  });
}

test('does not treat a different distribution or Ubuntu derivative as validated Ubuntu', () => {
  for (const release of [
    { ID: 'debian', VERSION_ID: '12' },
    { ID: 'linuxmint', ID_LIKE: 'ubuntu', VERSION_ID: '22' },
    {},
  ]) {
    const result = evaluateEnvironment(ubuntu('20.04', { release }));
    assert.deepEqual(result.errors, []);
    assert.equal(result.verified, false);
    assert.ok(result.warnings.length > 0);
  }
});

test('does not silently validate an unreadable Ubuntu version', () => {
  const result = evaluateEnvironment(ubuntu('unknown'));
  assert.deepEqual(result.errors, []);
  assert.equal(result.verified, false);
  assert.match(result.warnings.join(' '), /could not be verified/);
});

test('still rejects old Ubuntu and Node when the architecture is unvalidated', () => {
  const result = evaluateEnvironment(ubuntu('18.04', { arch: 'arm64', nodeVersion: 'v10.19.0' }));
  assert.equal(result.errors.length, 2);
  assert.equal(result.warnings.length, 1);
});

test('Git dependency accepts supported vendor versions and rejects missing or old Git', () => {
  for (const version of [
    'git version 2.25.0',
    'git version 2.43.0',
    'git version 2.45.1.windows.1',
    'git version 2.39.5 (Apple Git-154)',
    'git version 3.0.0',
  ]) {
    assert.equal(getGitVersionError(version), null);
  }
  for (const version of ['', undefined, 'git version 2.24.9', 'unknown']) {
    const result = evaluateEnvironment(ubuntu('24.04', { gitVersion: version }));
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /Git 2.25.*apt-get install git/);
    assert.equal(result.verified, false);
  }
});
