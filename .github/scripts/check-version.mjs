import { readFileSync, appendFileSync } from 'node:fs';

// Enforce a strict vMAJOR.MINOR.PATCH tag and assert that the tag, package.json,
// and both package-lock.json version fields all agree before anything is published.
const tag = process.env.TAG_NAME ?? '';
const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
if (!match) {
  console.error(`Invalid tag "${tag}". Expected strictly vMAJOR.MINOR.PATCH (for example v0.1.3).`);
  process.exit(1);
}
const tagVersion = `${match[1]}.${match[2]}.${match[3]}`;

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

const versions = {
  tag: tagVersion,
  'package.json': pkg.version,
  'package-lock.json (top level)': lock.version,
  'package-lock.json (packages[""])': lock.packages?.['']?.version,
};
console.log('Version sources:', JSON.stringify(versions, null, 2));

if (new Set(Object.values(versions)).size !== 1) {
  console.error('Version mismatch across tag, package.json, and package-lock.json. Refusing to publish.');
  process.exit(1);
}

const envFile = process.env.GITHUB_ENV;
if (envFile) {
  appendFileSync(envFile, `PACKAGE_NAME=${pkg.name}\nPACKAGE_VERSION=${pkg.version}\n`);
}
console.log(`All versions agree: ${pkg.name}@${pkg.version}`);
