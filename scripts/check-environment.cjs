// Dependency-free and Node.js 10 compatible: this also runs before npm installs packages.
const fs = require('fs');
const childProcess = require('child_process');
const { getNodeVersionError } = require('./check-node.cjs');

function parseOsRelease(contents) {
  const fields = Object.create(null);
  for (const line of contents.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) {
      continue;
    }
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[match[1]] = value;
  }
  return fields;
}

function collectEnvironment() {
  let release = Object.create(null);
  let releaseError = '';
  let glibc = 'not applicable';

  if (process.platform === 'linux') {
    for (const file of ['/etc/os-release', '/usr/lib/os-release']) {
      try {
        release = parseOsRelease(fs.readFileSync(file, 'utf8'));
        releaseError = '';
        break;
      } catch (error) {
        releaseError = error.message;
      }
    }
    const result = childProcess.spawnSync('getconf', ['GNU_LIBC_VERSION'], {
      encoding: 'utf8',
      timeout: 2000,
    });
    glibc = result.status === 0 ? result.stdout.trim() : 'not detected';
  }

  return {
    platform: process.platform,
    arch: process.arch,
    release,
    releaseError,
    glibc,
    nodeVersion: process.version,
    nodePath: process.execPath,
  };
}

function evaluateEnvironment(environment) {
  const errors = [];
  const warnings = [];
  const nodeError = getNodeVersionError(environment.nodeVersion);
  if (nodeError) {
    errors.push(nodeError);
  }

  const release = environment.release || {};
  if (environment.platform === 'linux' && release.ID === 'ubuntu') {
    const version = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(release.VERSION_ID || '');
    if (!version) {
      warnings.push('Ubuntu version could not be verified; this environment is not yet validated.');
    } else if (Number(version[1]) < 20 || (Number(version[1]) === 20 && Number(version[2]) < 4)) {
      errors.push(
        'DualMind requires Ubuntu 20.04 or newer. Detected Ubuntu ' +
          release.VERSION_ID +
          '. Use a supported Ubuntu environment before installing or building from source.',
      );
    }
  } else {
    warnings.push(
      'This platform/distribution is not yet validated. The formal baseline is Ubuntu 20.04+ on x86_64/amd64.',
    );
  }

  if (environment.arch !== 'x64') {
    warnings.push(
      'Architecture ' + environment.arch + ' is not yet validated; the baseline is x86_64/amd64.',
    );
  }

  return { errors, warnings, verified: errors.length === 0 && warnings.length === 0 };
}

function main() {
  const environment = collectEnvironment();
  const result = evaluateEnvironment(environment);
  const release = environment.release;
  console.log('DualMind development environment');
  console.log('OS: ' + (release.PRETTY_NAME || environment.platform));
  console.log(
    'Distribution: ' +
      (release.ID || 'not detected') +
      '; version: ' +
      (release.VERSION_ID || 'not detected'),
  );
  console.log('CPU: ' + environment.arch + (environment.arch === 'x64' ? ' (x86_64/amd64)' : ''));
  console.log('C library: ' + environment.glibc);
  console.log('Node.js: ' + environment.nodeVersion);
  console.log('Node executable: ' + environment.nodePath);
  if (environment.releaseError) {
    console.warn('OS identification: ' + environment.releaseError);
  }
  for (const warning of result.warnings) {
    console.warn('Warning: ' + warning);
  }
  for (const error of result.errors) {
    console.error('Error: ' + error);
  }
  if (result.errors.length > 0) {
    process.exitCode = 1;
  } else if (result.verified) {
    console.log('Environment matches the Ubuntu 20.04+ amd64 / Node.js 24 development baseline.');
  } else {
    console.log('Environment check completed with unvalidated-platform warnings.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseOsRelease, collectEnvironment, evaluateEnvironment };
