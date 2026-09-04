'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const postsDir = path.resolve(__dirname, '../source/_posts');
const maxSummaryLength = [...'M-profile的内存管理机制，主要围绕Armv8-M'].length;
const forbiddenSummaryWords = /介绍|继续|整理|分析/;
const placeholders = /^(?:seo名称|文章关键词|简单介绍|文章摘要)$/;
const errors = [];

for (const name of fs.readdirSync(postsDir).filter(name => name.endsWith('.md')).sort()) {
  const file = path.join(postsDir, name);
  const source = fs.readFileSync(file, 'utf8');
  if (!source.startsWith('---\n')) {
    errors.push(`${name}: missing front matter`);
    continue;
  }
  const end = source.indexOf('\n---', 4);
  if (end < 0) {
    errors.push(`${name}: unclosed front matter`);
    continue;
  }
  let front;
  try {
    front = yaml.load(source.slice(4, end)) || {};
  } catch (error) {
    errors.push(`${name}: invalid YAML (${error.message})`);
    continue;
  }
  if (!front.title || typeof front.title !== 'string') errors.push(`${name}: title is required`);
  if (Object.prototype.hasOwnProperty.call(front, 'tag')) errors.push(`${name}: use tags instead of tag`);
  if (!front.date && name !== 'ARM体系架构（五）.md' && name !== 'ARM体系架构（六）.md' && name !== 'RISCV体系架构（二）.md' && name !== 'Uboot源码阅读（一）.md') {
    errors.push(`${name}: date is required`);
  }
  if (front.date && Number.isNaN(new Date(front.date).getTime())) errors.push(`${name}: date is invalid`);
  if (front.summary === undefined || front.summary === null || !String(front.summary).trim()) {
    errors.push(`${name}: summary is required`);
  } else {
    const summary = String(front.summary).trim();
    if ([...summary].length > maxSummaryLength) errors.push(`${name}: summary exceeds ${maxSummaryLength} characters`);
    if (forbiddenSummaryWords.test(summary)) errors.push(`${name}: summary contains process wording`);
    if (placeholders.test(summary)) errors.push(`${name}: summary is a placeholder`);
  }
  if (!Array.isArray(front.keywords) || front.keywords.length < 3 || front.keywords.length > 8) {
    errors.push(`${name}: keywords must contain 3-8 items`);
  } else if (front.keywords.some(item => placeholders.test(String(item).trim()))) {
    errors.push(`${name}: keywords contain a placeholder`);
  }
  if (Object.prototype.hasOwnProperty.call(front, 'seo_title')) errors.push(`${name}: remove unused seo_title`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Post metadata validation passed: ${fs.readdirSync(postsDir).filter(name => name.endsWith('.md')).length} posts checked`);
