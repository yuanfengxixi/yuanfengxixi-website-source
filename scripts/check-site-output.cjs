const fs = require('node:fs');
const path = require('node:path');

const output = path.join(__dirname, '..', 'dist');
const allowed = new Set([
  'app',
  'assets',
  'contact',
  'douyin-reply',
  'en',
  'guide',
  'index.html',
  'knowknow',
  'legal',
  'robots.txt',
  'services',
  'sitemap.xml',
]);
const forbiddenFragments = [
  '.env',
  '.data',
  'CLIENT-REGISTRY',
  'seo-operations',
  '监测结果',
  '监测问题',
  '增长监测',
  '知乎投稿',
];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const relative = path.relative(output, target).split(path.sep).join('/');
    if (forbiddenFragments.some((fragment) => relative.includes(fragment))) {
      throw new Error(`Private path found in site output: ${relative}`);
    }
    if (entry.isDirectory()) walk(target);
  }
}

const actual = new Set(fs.readdirSync(output));
const unexpected = [...actual].filter((entry) => !allowed.has(entry));
const missing = [...allowed].filter((entry) => !actual.has(entry));
if (unexpected.length || missing.length) {
  throw new Error(`Unexpected output entries: ${unexpected.join(', ')}; missing: ${missing.join(', ')}`);
}

for (const required of [
  'index.html',
  'assets/site.css',
  'knowknow/index.html',
  'knowknow/legal/privacy.html',
  'knowknow/legal/terms.html',
  'services/seo/index.html',
  'en/services/seo/index.html',
]) {
  if (!fs.existsSync(path.join(output, required))) throw new Error(`Missing public page: ${required}`);
}

walk(output);
console.log('Static output contains the expected public pages and no internal operations paths.');
