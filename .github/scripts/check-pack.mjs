import { readFileSync } from 'node:fs';

// Assert that `npm pack --dry-run --json` would ship exactly the allowed file
// set and nothing else (no src, test, node_modules, .github, .omo, .npmrc,
// tarballs, or temporary JSON).
const packJsonPath = process.env.PACK_JSON;
if (!packJsonPath) {
  console.error('PACK_JSON environment variable is required.');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(packJsonPath, 'utf8'));
const entry = Array.isArray(raw) ? raw[0] : raw;
const actual = entry.files.map((file) => file.path).sort();
const expected = [
  'LICENSE',
  'README.md',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/index.js.map',
  'package.json',
].sort();

console.log('Packed files:', actual);

const matches = actual.length === expected.length && actual.every((file, index) => file === expected[index]);
if (!matches) {
  const missing = expected.filter((file) => !actual.includes(file));
  const extra = actual.filter((file) => !expected.includes(file));
  console.error('Pack content mismatch. Refusing to publish.');
  if (missing.length) console.error('Missing files:', missing);
  if (extra.length) console.error('Unexpected files:', extra);
  process.exit(1);
}
console.log('Pack content is exactly the 6 allowed files.');
