'use strict';

const { isRegionTreeText, isMemoryMapText } = require('./prism-custom');

function rewriteRegionTreeFences(source) {
  return String(source || '').replace(
    /(^|\n)([ \t]*)(`{3,}|~{3,})text[ \t]*\r?\n([\s\S]*?)\r?\n\2\3(?=\n|$)/g,
    (match, prefix, indent, marker, content) => {
      if (isMemoryMapText(content)) {
        return `${prefix}${indent}${marker}memory-map\n${content}\n${indent}${marker}`;
      }
      if (isRegionTreeText(content)) {
        return `${prefix}${indent}${marker}region-tree\n${content}\n${indent}${marker}`;
      }
      return match;
    }
  );
}

hexo.extend.filter.register('before_post_render', data => {
  data.content = rewriteRegionTreeFences(data.content);
  return data;
}, 5);

module.exports = { rewriteRegionTreeFences };
