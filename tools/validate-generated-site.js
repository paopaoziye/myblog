'use strict';

const fs = require('fs');
const path = require('path');

const publicDir = path.resolve(__dirname, '../public');
const summaryLimit = [...'M-profile的内存管理机制，主要围绕Armv8-M'].length;
const errors = [];
const htmlFiles = [];
let regionTreeBlocks = 0;
let memoryMapBlocks = 0;


function addError(file, message) {
  errors.push(`${path.relative(publicDir, file)}: ${message}`);
}

function resolveLocalReference(file, value) {
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(value)) return null;
  const clean = decodeURIComponent(value.split(/[?#]/, 1)[0]);
  if (!clean.startsWith('/')) return null;
  const relative = clean.replace(/^\/+/, '');
  const candidates = [
    path.join(publicDir, relative),
    path.join(publicDir, relative, 'index.html')
  ];
  if (relative.endsWith('/')) candidates.push(path.join(publicDir, relative, 'index.html'));
  return candidates;
}

function inspectHtml(file) {
  const source = fs.readFileSync(file, 'utf8');
  const codeBlocks = [...source.matchAll(/<pre\b[^>]*class="[^"]*language-([^" ]+)[^"]*"[^>]*>[\s\S]*?<\/pre>/gi)];
  for (const block of codeBlocks) {
    const language = block[1].toLowerCase();
    const content = block[0];
    if (language === 'region-tree') {
      regionTreeBlocks++;
      for (const token of ['region-title', 'region-property', 'region-value']) {
        if (!content.includes(`token ${token}`)) addError(file, `Region tree is missing ${token} token`);
      }
    } else if (language === 'memory-map') {
      memoryMapBlocks++;
      for (const token of ['address', 'memory-border', 'region-name']) {
        if (!content.includes(`token ${token}`)) addError(file, `memory map is missing ${token} token`);
      }
    } else if (language === 'text' && /token (?:region-title|region-property|region-value|address|memory-border|region-name)/.test(content)) {
      addError(file, 'ordinary text contains specialized diagram tokens');
    }
  }
  const description = source.match(/<meta name="description" content="([^"]*)"/i);
  if (description && [...description[1]].length > summaryLimit) {
    addError(file, `description exceeds ${summaryLimit} characters`);
  }
  const ids = new Set();
  const idPattern = /\bid=["']([^"']+)["']/gi;
  let match;
  while ((match = idPattern.exec(source))) {
    if (ids.has(match[1]) && !/^busuanzi_|^(?:sitetime|searchModal|searchInput|searchResult|backTop)$/.test(match[1])) {
      addError(file, `duplicate id: ${match[1]}`);
    }
    ids.add(match[1]);
  }

  const imagePattern = /<img\b[^>]*>/gi;
  while ((match = imagePattern.exec(source))) {
    const tag = match[0];
    const alt = tag.match(/\balt=["']([^"']*)["']/i);
    if (!alt || !alt[1].trim()) addError(file, 'image is missing a non-empty alt attribute');
    for (const attribute of ['src', 'data-original']) {
      const reference = tag.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, 'i'));
      if (!reference) continue;
      const candidates = resolveLocalReference(file, reference[1]);
      if (candidates && !candidates.some(candidate => fs.existsSync(candidate))) {
        addError(file, `${attribute} does not resolve: ${reference[1]}`);
      }
    }
  }

  const referencePattern = /\b(?:href|src|data-original)=["']([^"']+)["']/gi;
  while ((match = referencePattern.exec(source))) {
    const value = match[1];
    if (/^http:/i.test(value)) addError(file, `insecure HTTP resource: ${value}`);
    const candidates = resolveLocalReference(file, value);
    if (candidates && !candidates.some(candidate => fs.existsSync(candidate))) {
      addError(file, `local reference does not resolve: ${value}`);
    }
  }

  // A page may intentionally include the same library in separate widgets;
  // script duplication is checked only for the post code-block assets.
  const scripts = [...source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map(item => item[1].split(/[?#]/, 1)[0]);
  const seenScripts = new Set();
  for (const script of scripts) {
    if (/\/libs\/codeBlock\//i.test(script) && seenScripts.has(script)) {
      addError(file, `duplicate code-block script: ${script}`);
    }
    seenScripts.add(script);
  }

  const effectsScripts = scripts.filter(script => /\/js\/effects\.js$/i.test(script));
  if (effectsScripts.length > 1) addError(file, `expected at most one effects manager script, found ${effectsScripts.length}`);
  for (const legacyScript of [
    /\/js\/cursor\.js$/i,
    /\/libs\/others\/clicklove\.js$/i,
    /\/libs\/background\/(?:canvas-nest|ribbon(?:-refresh|-dynamic)?(?:\.min)?)\.js$/i,
    /\/live2dw\/lib\/L2Dwidget\.min\.js(?:[?#].*)?$/i
  ]) {
    if (scripts.some(script => legacyScript.test(script))) addError(file, 'decorative effect bypasses the effects manager');
  }
  const effectsTag = source.match(/<script\b[^>]*\bsrc=["'][^"']*\/js\/effects\.js["'][^>]*>/i);
  const effectsBootstrap = source.match(/<script>\s*window\.MateryEffects\.init\(\{/i);
  if (!effectsBootstrap) addError(file, 'missing effects manager bootstrap');
  else if (!effectsTag || effectsTag.index > effectsBootstrap.index) addError(file, 'effects manager loads after its bootstrap');
  if (/<script>\s*L2Dwidget\.init\(/i.test(source)) addError(file, 'Live2D is initialized outside the effects manager');

  const configuredAssets = [...source.matchAll(/\bsrc:\s*["'](\/[^"']+)["']/g)]
    .map(item => item[1].split(/[?#]/, 1)[0]);
  for (const asset of configuredAssets) {
    if (/\/(?:js\/cursor|libs\/(?:others\/clicklove|background\/(?:canvas-nest|ribbon))|live2dw\/lib\/L2Dwidget)/i.test(asset) &&
        !fs.existsSync(path.join(publicDir, asset.replace(/^\/+/, '')))) {
      addError(file, `configured effects asset does not resolve: ${asset}`);
    }
  }

  for (const required of ['rel="canonical"', 'property="og:title"', 'name="twitter:card"']) {
    if (!source.includes(required)) addError(file, `missing ${required}`);
  }
  htmlFiles.push(file);
}

function walk(directory) {
  if (!fs.existsSync(directory)) {
    console.error('Generated site not found. Run npm run build first.');
    process.exit(1);
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name.endsWith('.html')) inspectHtml(target);
  }
}

walk(publicDir);
if (!htmlFiles.length) errors.push('no generated HTML files found');
if (!regionTreeBlocks) errors.push('no generated Region tree blocks found');
if (!memoryMapBlocks) errors.push('no generated memory map blocks found');
if (!fs.existsSync(path.join(publicDir, 'search.xml'))) errors.push('missing generated search.xml');

const siteUrl = 'https://paopaoziye.github.io';
const atomPath = path.join(publicDir, 'atom.xml');
const sitemapPath = path.join(publicDir, 'sitemap.xml');
for (const [file, root, item, label] of [
  [atomPath, /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i, /<entry\b/i, 'Atom feed'],
  [sitemapPath, /<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i, /<url\b/i, 'sitemap']
]) {
  if (!fs.existsSync(file)) {
    errors.push(`missing generated ${label}: ${path.basename(file)}`);
    continue;
  }
  const xml = fs.readFileSync(file, 'utf8');
  if (!root.test(xml)) errors.push(`${label} has an unexpected root element`);
  if (!item.test(xml)) errors.push(`${label} contains no entries`);
  if (!xml.includes(siteUrl)) errors.push(`${label} contains no production site URL`);
  if (/https?:\/\//i.test(xml.replace(new RegExp(siteUrl, 'g'), '')) && /<(?:id|link|loc|uri)\b[^>]*>\s*http:\/\//i.test(xml)) {
    errors.push(`${label} contains an insecure HTTP URL`);
  }
}

if (!errors.length && htmlFiles.length) {
  const atomAlternate = /<link\b[^>]*rel=["']alternate["'][^>]*type=["']application\/atom\+xml["'][^>]*href=["'][^"']*atom\.xml["'][^>]*>/i;
  for (const file of htmlFiles) {
    if (!atomAlternate.test(fs.readFileSync(file, 'utf8'))) addError(file, 'missing Atom feed alternate link');
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Generated-site validation passed: ${htmlFiles.length} HTML files checked`);
