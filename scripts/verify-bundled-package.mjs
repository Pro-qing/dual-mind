import { open } from 'yauzl';
import { checkBytes, checkElf } from './bundled-tools.mjs';

export function verifyBundledPackage(
  filename,
  manifest,
  permissions = process.platform !== 'win32',
) {
  const expected = new Map(
    manifest.tools.flatMap((tool) =>
      tool.files.map((file) => [`extension/dist/tools/${file.path}`, file]),
    ),
  );
  const manifestPath = 'extension/dist/tools/manifest.json';
  return new Promise((resolve, reject) => {
    open(filename, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) {
        reject(error);
        return;
      }
      const names = new Set(),
        matched = new Set();
      const fail = (failure) => {
        zip.close();
        reject(failure);
      };
      zip.on('error', fail);
      zip.on('entry', (entry) => {
        if (names.has(entry.fileName)) {
          fail(new Error(`Duplicate VSIX entry: ${entry.fileName}`));
          return;
        }
        names.add(entry.fileName);
        const file = expected.get(entry.fileName);
        if (!file && entry.fileName !== manifestPath) {
          zip.readEntry();
          return;
        }
        if (
          (file && entry.uncompressedSize !== file.bytes) ||
          entry.uncompressedSize > 32 * 1024 * 1024 ||
          (file?.executable && permissions && !((entry.externalFileAttributes >>> 16) & 0o111))
        ) {
          fail(new Error(`Invalid VSIX tool size or executable permissions: ${entry.fileName}`));
          return;
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            fail(streamError);
            return;
          }
          const chunks = [];
          stream.on('error', fail);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            try {
              const data = Buffer.concat(chunks);
              if (file) {
                checkBytes(data, file);
                if (file.executable) {
                  checkElf(data);
                }
              } else if (JSON.stringify(JSON.parse(data)) !== JSON.stringify(manifest)) {
                throw new Error('VSIX tool manifest mismatch.');
              }
              matched.add(entry.fileName);
              zip.readEntry();
            } catch (failure) {
              fail(failure);
            }
          });
        });
      });
      zip.on('end', () => {
        if (matched.size !== expected.size + 1) {
          reject(new Error('VSIX is missing bundled executables, licenses or manifest.'));
        } else {
          resolve({ checkedFiles: matched.size, executablePermissions: permissions });
        }
      });
      zip.readEntry();
    });
  });
}
