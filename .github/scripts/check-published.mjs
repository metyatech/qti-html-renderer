import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Post-publish verification: confirm the registry actually serves the new
// version, that a clean isolated install resolves the registry build (not the
// local workspace), and that the published artifact behaves as documented.
const name = process.env.PACKAGE_NAME ?? 'qti-html-renderer';
const version = process.env.PACKAGE_VERSION;
if (!version) {
  console.error('PACKAGE_VERSION is required.');
  process.exit(1);
}

const baseTmp = process.env.RUNNER_TEMP ?? tmpdir();
const run = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', ...opts }).trim();
const fail = (msg) => {
  console.error(`Published-artifact verification failed: ${msg}`);
  process.exit(1);
};

const NS = 'xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0"';

// 1) Retry until the registry reports the new version (publish propagation lag).
let visible = '';
for (let attempt = 1; attempt <= 20; attempt += 1) {
  try {
    visible = run(`npm view ${name}@${version} version`);
  } catch {
    visible = '';
  }
  if (visible === version) break;
  console.log(`Attempt ${attempt}: ${name}@${version} not visible yet (got "${visible}"). Waiting 15s...`);
  execSync('sleep 15');
}
if (visible !== version) fail(`registry did not report version ${version} after retries`);
console.log(`Registry reports ${name}@${version}.`);

// 2) repository URL points at this GitHub repository.
const repoUrl = run(`npm view ${name}@${version} repository.url`);
const slug = process.env.REPO_SLUG ?? '';
if (!repoUrl.includes(`github.com/${slug}`)) fail(`repository.url "${repoUrl}" does not match github.com/${slug}`);
console.log(`repository.url matches: ${repoUrl}`);

// 3) tarball URL and integrity are retrievable.
const tarballUrl = run(`npm view ${name}@${version} dist.tarball`);
const integrity = run(`npm view ${name}@${version} dist.integrity`);
if (!tarballUrl || !integrity) fail('dist.tarball or dist.integrity missing from registry metadata');
console.log(`tarball: ${tarballUrl}`);
console.log(`integrity: ${integrity}`);

// 4) Install ONLY the registry version into an isolated temp dir.
const installDir = mkdtempSync(join(baseTmp, 'qhr-verify-'));
writeFileSync(
  join(installDir, 'package.json'),
  JSON.stringify({ name: 'verify-consumer', private: true, type: 'module' }, null, 2),
);
execSync(`npm install ${name}@${version}`, { cwd: installDir, stdio: 'inherit' });

const pkgDir = join(installDir, 'node_modules', name);
const installedPkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
if (installedPkg.version !== version) fail(`installed version ${installedPkg.version} does not equal ${version}`);

// 5) dist build artifacts exist.
for (const rel of ['dist/index.js', 'dist/index.d.ts']) {
  if (!existsSync(join(pkgDir, rel))) fail(`${rel} missing from the installed package`);
}

// 6) type definitions include InteractionInfo.
const dts = readFileSync(join(pkgDir, 'dist/index.d.ts'), 'utf8');
if (!dts.includes('InteractionInfo')) fail('InteractionInfo missing from dist/index.d.ts');

// 7) Import the registry build (explicit path inside the temp install dir, so
//    it cannot be the local workspace dist).
const entryUrl = pathToFileURL(join(pkgDir, 'dist/index.js')).href;
if (!entryUrl.includes(installDir.replace(/\\/g, '/'))) fail('resolved entry is outside the temp install dir');
const mod = await import(entryUrl);
const exportNames = [
  'applyResponsesToPromptHtml',
  'renderQtiItemForExplanations',
  'renderQtiItemForReport',
  'renderQtiItemForScoring',
  'rewriteHtmlImageSources',
];
for (const exportName of exportNames) {
  if (typeof mod[exportName] !== 'function') fail(`export ${exportName} is not a function`);
}
console.log(`Imported registry build from ${entryUrl}`);

const { renderQtiItemForScoring, renderQtiItemForReport } = mod;

// 8) Missing-identifier declaration must not throw and must be treated as unmatched.
const xmlMissingId = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item ${NS} identifier="item-missing" title="Missing Id">
  <qti-response-declaration>
    <qti-correct-response><qti-value>B</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-choice-interaction response-identifier="CHOICE" max-choices="1">
      <qti-simple-choice identifier="A">Alpha</qti-simple-choice>
      <qti-simple-choice identifier="B">Beta</qti-simple-choice>
    </qti-choice-interaction>
  </qti-item-body>
</qti-assessment-item>`;
let parsed;
try {
  parsed = renderQtiItemForScoring(xmlMissingId);
} catch (error) {
  fail(`missing-identifier declaration threw: ${error}`);
}
let choice = parsed.interactions.find((interaction) => interaction.id === 'CHOICE');
if (!choice || choice.declarationIdentifier !== null || choice.correctResponse.length !== 0) {
  fail('missing-identifier declaration was not treated as unmatched');
}

// 9) Duplicate declaration must not bind.
const xmlDuplicate = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item ${NS} identifier="item-dup" title="Duplicate">
  <qti-response-declaration identifier="CHOICE">
    <qti-correct-response><qti-value>A</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="CHOICE">
    <qti-correct-response><qti-value>B</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-choice-interaction response-identifier="CHOICE" max-choices="1">
      <qti-simple-choice identifier="A">Alpha</qti-simple-choice>
      <qti-simple-choice identifier="B">Beta</qti-simple-choice>
    </qti-choice-interaction>
  </qti-item-body>
</qti-assessment-item>`;
parsed = renderQtiItemForScoring(xmlDuplicate);
choice = parsed.interactions.find((interaction) => interaction.id === 'CHOICE');
if (!choice || choice.declarationIdentifier !== null || choice.correctResponse.length !== 0) {
  fail('duplicate declaration must not bind');
}

// 10) bare br renders in both the scoring and report paths.
const xmlBr = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item ${NS} identifier="item-br" title="Br">
  <qti-item-body><p>line1<br/>line2</p></qti-item-body>
</qti-assessment-item>`;
const scoring = renderQtiItemForScoring(xmlBr);
if (!scoring.promptHtml.includes('<br')) fail('scoring path did not render bare br as <br');
const report = renderQtiItemForReport(xmlBr, 'item-br');
if (!report.questionHtml.includes('<br')) fail('report path did not render bare br as <br');

// 11) Published tarball contains exactly the 6 allowed files.
const packDir = mkdtempSync(join(baseTmp, 'qhr-pack-'));
const packOut = JSON.parse(run(`npm pack ${name}@${version} --pack-destination "${packDir}" --json`));
const tarPath = join(packDir, packOut[0].filename);
const listed = run(`tar -tzf "${tarPath}"`)
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.endsWith('/'))
  .map((line) => line.replace(/^package\//, ''))
  .sort();
const expectedFiles = [
  'LICENSE',
  'README.md',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/index.js.map',
  'package.json',
].sort();
const tarballMatches =
  listed.length === expectedFiles.length && listed.every((file, index) => file === expectedFiles[index]);
if (!tarballMatches) {
  fail(
    `published tarball file set mismatch. Expected ${JSON.stringify(expectedFiles)} but got ${JSON.stringify(listed)}`,
  );
}
console.log('Published tarball contains exactly the 6 allowed files.');

console.log('All published-artifact verifications passed.');
