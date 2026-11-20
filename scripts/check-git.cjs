// Shared by preinstall and the bundled host; keep compatible with Node.js 10.
function getGitVersionError(version) {
  const match = /^git version (\d+)\.(\d+)(?:\.[\w.-]+)?(?: \([^\r\n]*\))?\s*$/.exec(
    String(version || '').trim(),
  );
  if (match && (Number(match[1]) > 2 || (Number(match[1]) === 2 && Number(match[2]) >= 25))) {
    return null;
  }
  return (
    'DualMind requires Git 2.25 or newer on PATH. Detected: ' +
    (version || 'not available') +
    '. Install Git (Ubuntu: sudo apt-get install git), then retry.'
  );
}
module.exports = { getGitVersionError };
