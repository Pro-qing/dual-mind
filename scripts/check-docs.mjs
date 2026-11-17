import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ignored = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'release',
  '.vscode-test',
  '.test-workspace',
  'coverage',
]);
const errors = [];

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(path)));
    } else if (entry.isFile() && extname(path) === '.md') {
      files.push(path);
    }
  }
  return files;
}

const files = await markdownFiles(root);
let links = 0;
for (const file of files) {
  const content = (await readFile(file, 'utf8')).replace(/```[\s\S]*?```/g, '');
  const destinations = [
    ...Array.from(content.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g), (m) => m[1]),
    ...Array.from(content.matchAll(/(?:href|src)=["']([^"']+)["']/g), (m) => m[1]),
  ];
  for (const destination of destinations) {
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(destination)) {
      continue;
    }
    try {
      const path = decodeURIComponent(destination.split(/[?#]/)[0]);
      const target = path.startsWith('/')
        ? resolve(root, path.slice(1))
        : resolve(dirname(file), path);
      await stat(target);
      links += 1;
    } catch {
      errors.push(`${relative(root, file)}: missing or invalid local link ${destination}`);
    }
  }
}

const rootPairs = ['README', 'CONTRIBUTING', 'CODE_OF_CONDUCT', 'SECURITY', 'CHANGELOG'];
const pairs = rootPairs.map((name) => [`${name}.md`, `${name}.zh.md`]);
for (const entry of await readdir(join(root, 'docs/en'))) {
  if (entry.endsWith('.md')) {
    pairs.push([`docs/en/${entry}`, `docs/zh/${entry}`]);
  }
}
for (const entry of await readdir(join(root, 'docs/zh'))) {
  if (entry.endsWith('.md') && !pairs.some(([, zh]) => zh === `docs/zh/${entry}`)) {
    errors.push(`docs/zh/${entry}: missing English counterpart`);
  }
}
for (const [english, chinese] of pairs) {
  for (const [source, target] of [
    [english, chinese],
    [chinese, english],
  ]) {
    try {
      const content = await readFile(join(root, source), 'utf8');
      const targetPath = relative(dirname(join(root, source)), join(root, target)).replaceAll(
        '\\',
        '/',
      );
      if (!content.includes(targetPath)) {
        errors.push(`${source}: missing language switch to ${target}`);
      }
    } catch {
      errors.push(`Missing bilingual document: ${source}`);
    }
  }
}

const svg = await readFile(join(root, 'docs/design/dual-mind-workbench.svg'), 'utf8');
if (
  !/<svg\b[^>]*viewBox="0 0 1440 900"/.test(svg) ||
  !/<title\b/.test(svg) ||
  !/<desc\b/.test(svg)
) {
  errors.push('SVG must declare a 1440 × 900 viewBox and accessible title/description.');
}
if (/<(?:script|foreignObject|image)\b|\son\w+\s*=|@import|@font-face/i.test(svg)) {
  errors.push('SVG must contain only static vector elements and editable text.');
}
for (const [, target] of svg.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
  if (!target.startsWith('#')) {
    errors.push(`SVG contains an external reference: ${target}`);
  }
}
if (/url\(\s*["']?(?!#)[a-z/]/i.test(svg)) {
  errors.push('SVG contains an external CSS resource.');
}

const png = await readFile(join(root, 'docs/design/dual-mind-workbench.png'));
if (
  png.length < 24 ||
  !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
  png.readUInt32BE(16) !== 1440 ||
  png.readUInt32BE(20) !== 900
) {
  errors.push('The README preview must be a 1440 × 900 PNG.');
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${files.length} Markdown files, ${links} local links, ${pairs.length} language pairs, and design assets.`,
  );
}
