// Build only the public website source allowlist; internal operations data is never copied.
const fs = require('node:fs');
const path = require('node:path');

const source = __dirname;
const output = path.join(source, 'dist');
const publicEntries = [
  'index.html',
  'robots.txt',
  'sitemap.xml',
  'assets',
  'knowknow',
  'douyin-reply',
  'services',
  'contact',
  'en',
];

function requirePath(target) {
  try {
    fs.accessSync(target, fs.constants.R_OK);
    return fs.statSync(target);
  } catch {
    throw new Error(`Public build source is missing or unreadable: ${target}`);
  }
}

for (const entry of publicEntries) requirePath(path.join(source, entry));

let siteOrigin;
try {
  const configured = String(process.env.SITE_ORIGIN || 'https://yuanfengxixi.cn').trim();
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.origin !== configured || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SITE_ORIGIN must be a canonical HTTPS origin without a path, query, or fragment');
  }
  siteOrigin = url.origin;
} catch (error) {
  throw new Error(`Invalid SITE_ORIGIN: ${error.message}`);
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const entry of publicEntries) {
  fs.cpSync(path.join(source, entry), path.join(output, entry), { recursive: true });
}

const redirects = [
  ['guide/index.html', '/knowknow/guide/'],
  ['guide/record-ideas.html', '/knowknow/guide/record-ideas.html'],
  ['guide/find-notes.html', '/knowknow/guide/find-notes.html'],
  ['guide/data-control.html', '/knowknow/guide/data-control.html'],
  ['app/index.html', '/knowknow/app/'],
  ['legal/privacy.html', '/knowknow/legal/privacy.html'],
  ['legal/terms.html', '/knowknow/legal/terms.html'],
];
for (const [legacyPath, targetPath] of redirects) {
  const destination = path.join(output, legacyPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const canonical = `${siteOrigin}${targetPath}`;
  fs.writeFileSync(
    destination,
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="${canonical}"><meta http-equiv="refresh" content="0;url=${targetPath}"><title>页面已迁移</title></head><body><p>页面已迁移至 <a href="${targetPath}">${canonical}</a>。</p><script>location.replace(${JSON.stringify(targetPath)}+location.search+location.hash)</script></body></html>`,
  );
}

console.log(`Built ${publicEntries.length} public source entries to ${output}`);
