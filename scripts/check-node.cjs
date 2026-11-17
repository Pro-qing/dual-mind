// Keep this file compatible with Node.js 10 so the setup error stays readable.
function getNodeVersionError(version) {
  const major = Number(String(version).replace(/^v/, '').split('.')[0]);
  if (major === 24) {
    return null;
  }
  return (
    'DualMind development requires Node.js 24 via nvm. Current version: ' +
    version +
    '\n' +
    'Run "nvm install" and "nvm use" in the repository, then retry.'
  );
}

if (require.main === module) {
  const error = getNodeVersionError(process.version);
  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = { getNodeVersionError };
