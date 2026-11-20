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

const designDirectory = join(root, 'docs/design');
const designEntries = (await readdir(designDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);
const svgFiles = designEntries.filter((name) => name.endsWith('.svg')).sort();
const requiredScenes = [
  'dual-mind-workbench',
  'dual-mind-api-settings',
  'dual-mind-reviewer-roles',
  'dual-mind-new-task',
  'dual-mind-delete-task',
  'dual-mind-api-model-discovery',
  'dual-mind-task-model-selection',
];
for (const scene of requiredScenes) {
  if (!svgFiles.includes(`${scene}.svg`)) {
    errors.push(`docs/design/${scene}.svg: missing required design scene`);
  }
}
for (const name of designEntries.filter((entry) => entry.endsWith('.png'))) {
  if (!svgFiles.includes(name.replace(/\.png$/, '.svg'))) {
    errors.push(`docs/design/${name}: preview has no matching SVG source`);
  }
}

for (const name of svgFiles) {
  const label = `docs/design/${name}`;
  const svg = await readFile(join(designDirectory, name), 'utf8');
  const rootTag = svg.match(/<svg\b[^>]*>/)?.[0] || '';
  if (
    !/\bviewBox=["']0 0 1440 900["']/.test(rootTag) ||
    !/\bwidth=["']1440["']/.test(rootTag) ||
    !/\bheight=["']900["']/.test(rootTag) ||
    !/<title\b[^>]*>[^<]+<\/title>/.test(svg) ||
    !/<desc\b[^>]*>[^<]+<\/desc>/.test(svg) ||
    !/<text\b/.test(svg)
  ) {
    errors.push(`${label}: expected a 1440 × 900 SVG with a title, description, and editable text`);
  }
  if (
    /<(?:script|foreignObject|image|animate(?:Motion|Transform)?|set)\b|\son\w+\s*=|@import|@font-face/i.test(
      svg,
    )
  ) {
    errors.push(`${label}: only static vector elements and editable text are allowed`);
  }
  for (const [, target] of svg.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g)) {
    if (!target.startsWith('#')) {
      errors.push(`${label}: external reference ${target}`);
    }
  }
  for (const [, target] of svg.matchAll(/url\(\s*["']?([^)'"]+)["']?\s*\)/gi)) {
    if (!target.trim().startsWith('#')) {
      errors.push(`${label}: external CSS resource ${target.trim()}`);
    }
  }

  const preview = name.replace(/\.svg$/, '.png');
  try {
    const png = await readFile(join(designDirectory, preview));
    if (
      png.length < 24 ||
      !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      png.readUInt32BE(16) !== 1440 ||
      png.readUInt32BE(20) !== 900
    ) {
      errors.push(`docs/design/${preview}: expected a 1440 × 900 PNG preview`);
    }
  } catch (error) {
    errors.push(`docs/design/${preview}: cannot read the matching PNG preview (${error.code})`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${files.length} Markdown files, ${links} local links, ${pairs.length} language pairs, and ${svgFiles.length} SVG/PNG design pairs.`,
  );
}
