'use strict';

const Prism = require('prismjs');

const armGas = {
  comment: [
    { pattern: /\/\*[\s\S]*?\*\//, greedy: true },
    { pattern: /(^|[^\\])(?:@|\/\/|;) .*/m, lookbehind: true, greedy: true },
    { pattern: /(^\s*)#(?![\w(]).*/m, lookbehind: true, greedy: true }
  ],
  string: { pattern: /(["'])(?:\\.|(?!\1)[^\\\r\n])*\1/, greedy: true },
  directive: { pattern: /(^\s*)\.[a-z][\w.]*/im, lookbehind: true, alias: 'property' },
  label: { pattern: /(^\s*)[.$_a-z][\w.$-]*(?=:)/im, lookbehind: true, alias: 'symbol' },
  instruction: {
    pattern: /\b(?:adc|add|adr|adrp|and|asr|b(?:al|cc|cs|eq|ge|gt|hi|le|ls|lt|mi|ne|pl|vc|vs)?|bic|bl|blr|bx|cbnz|cbz|cmp|cmn|eor|ldm|ldr|ldrb|ldrh|ldp|lsl|lsr|mov|movk|movn|movt|movw|mrs|msr|mul|mvn|nop|orr|pop|push|ret|ror|rsb|sbc|smull|stm|str|strb|strh|stp|sub|svc|teq|tst|ubfx|udiv|umull|uxth|wfe|wfi)\b/i,
    alias: 'keyword'
  },
  register: {
    pattern: /\b(?:r(?:1[0-5]|[0-9])|[xw](?:[12]?\d|3[01])|sp|lr|pc|fp|ip|cpsr|spsr|xzr|wzr)\b/i,
    alias: 'variable'
  },
  immediate: { pattern: /#-?(?:0x[\da-f]+|\d+)/i, alias: 'number' },
  number: /\b(?:0x[\da-f]+|0b[01]+|\d+)\b/i,
  operator: /(?:<<|>>|[-+*/%&|^~!=<>])+/,
  punctuation: /[()[\]{},:]/
};

const riscv = {
  comment: [
    { pattern: /\/\*[\s\S]*?\*\//, greedy: true },
    { pattern: /(^|[^\\])(?:#|\/\/).*/m, lookbehind: true, greedy: true }
  ],
  string: { pattern: /(["'])(?:\\.|(?!\1)[^\\\r\n])*\1/, greedy: true },
  directive: { pattern: /(^\s*)\.[a-z][\w.]*/im, lookbehind: true, alias: 'property' },
  label: { pattern: /(^\s*)[.$_a-z][\w.$-]*(?=:)/im, lookbehind: true, alias: 'symbol' },
  relocation: { pattern: /%(?:hi|lo|pcrel_hi|pcrel_lo|got_pcrel_hi|tprel_hi|tprel_lo)\b/i, alias: 'function' },
  instruction: {
    pattern: /\b(?:add|addi|addiw|addw|and|andi|auipc|beq|bge|bgeu|blt|bltu|bne|call|csrr|csrrc|csrrci|csrrs|csrrsi|csrrw|csrrwi|div|divu|ebreak|ecall|fence|j|jal|jalr|jr|la|lb|lbu|ld|lh|lhu|li|lui|lw|lwu|mv|mul|mulh|mulhsu|mulhu|neg|nop|not|or|ori|rem|remu|ret|sb|sd|seqz|sh|sll|slli|slt|slti|sltiu|sltu|snez|sra|srai|srl|srli|sub|sw|tail|wfi|xor|xori|f(?:add|sub|mul|div|sqrt|min|max|sgnj|mv|cvt)\.[sd])\b/i,
    alias: 'keyword'
  },
  csr: { pattern: /\b(?:mstatus|misa|medeleg|mideleg|mie|mtvec|mscratch|mepc|mcause|mtval|mip|sstatus|sie|stvec|sscratch|sepc|scause|stval|sip|satp)\b/i, alias: 'constant' },
  register: {
    pattern: /\b(?:x(?:[12]?\d|3[01])|zero|ra|sp|gp|tp|t[0-6]|s(?:[01]|[2-9]|1[01])|a[0-7]|fp)\b/i,
    alias: 'variable'
  },
  number: /(?:-?\b(?:0x[\da-f]+|0b[01]+|\d+)\b)/i,
  operator: /(?:<<|>>|[-+*/%&|^~!=<>])+/,
  punctuation: /[()[\]{},:]/
};

const devicetree = {
  comment: [
    { pattern: /\/\*[\s\S]*?\*\//, greedy: true },
    { pattern: /\/\/.*/, greedy: true }
  ],
  preprocessor: { pattern: /^\s*#(?:include|define|if|ifdef|ifndef|elif|else|endif)\b.*$/m, alias: 'property' },
  string: { pattern: /"(?:\\.|[^"\\\r\n])*"/, greedy: true },
  directive: { pattern: /\/(?:dts-v1|plugin|include|delete-node|delete-property)\//, alias: 'keyword' },
  reference: { pattern: /&[a-z_][\w-]*/i, alias: 'variable' },
  label: { pattern: /\b[a-z_][\w-]*(?=\s*:)/i, alias: 'symbol' },
  property: { pattern: /(?:#[a-z][\w-]*|[a-z_][\w,-]*)(?=\s*(?:=|;))/i, alias: 'property' },
  node: { pattern: /(?:^|[\s,{])\/?[a-z_][\w,.-]*(?:@[\da-f]+)?(?=\s*\{)/im, lookbehind: true, alias: 'class-name' },
  boolean: /\b(?:true|false|okay|disabled|reserved|fail|fail-sss)\b/,
  number: /\b(?:0x[\da-f]+|\d+)\b/i,
  operator: /=/,
  punctuation: /[{}[\]<>;,:]/
};

const kconfig = {
  string: { pattern: /"(?:\\.|[^"\\\r\n])*"/, greedy: true },
  comment: { pattern: /#.*/, greedy: true },
  help: { pattern: /(^\s*(?:help|---help---)\s*\r?\n)(?:[ \t]+.*(?:\r?\n|$))+/m, lookbehind: true, alias: 'string' },
  keyword: /\b(?:config|menuconfig|choice|endchoice|menu|endmenu|if|endif|source|rsource|osource|orsource|comment|help|mainmenu|depends\s+on|select|imply|visible\s+if|prompt|default|range|option|optional)\b/,
  type: { pattern: /\b(?:bool|tristate|int|hex|string|def_bool|def_tristate)\b/, alias: 'class-name' },
  symbol: { pattern: /(^\s*(?:config|menuconfig|select|imply|depends\s+on|default)\s+)[A-Z][A-Z0-9_]*/m, lookbehind: true, alias: 'constant' },
  boolean: /\b(?:y|m|n)\b/,
  number: /\b(?:0x[\da-f]+|\d+)\b/i,
  operator: /&&|\|\||!=|[!=<>]/,
  punctuation: /[(){}:,]/
};

const memoryMap = {
  address: { pattern: /(^|\n)[ \t]*0x[\da-f]+(?:_[\da-f]+)*\b/im, lookbehind: true },
  'memory-border': { pattern: /[┌┐├┤└┘│─]/ },
  'region-name': { pattern: /\b(?:System Region|External Device|External RAM|Peripheral|SRAM|Code)\b/ }
};

const regionTree = {
  'region-title': {
    pattern: /\b(?:Region|Subregion)\b|(?:地址属性|保护属性|内存属性)/
  },
  'region-value': {
    pattern: /\b(?:Normal|Device(?:-nGnRnE|-nGnRE|-nGRE|-GRE)?|Strongly-ordered|Non-cacheable|Cacheable|Write-(?:Through|Back)|Read Only|Read\/Write|Executable|Enable|Disable|Inner Shareable|Outer Shareable|Non-shareable|Privileged Only|Non-privileged allowed)\b/
  },
  'region-property': {
    pattern: /\b(?:Base|Limit|Privileged|Unprivileged|Read|Write|Execute|XN|Memory Type|Cache Attribute|Shareability|AttrIndx|RBAR|RLAR|MAIR(?:0|1)?|Access Permission)\b/
  },
  number: { pattern: /\b(?:0x[\da-f]+|\d+(?:\.\d+)?)\b/i, alias: 'number' },
  operator: /\//,
  'tree-glyph': { pattern: /[│├└─]/ }
};

function isRegionTreeText(source) {
  const lines = String(source || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length || !/^(?:Region|Subregion)$/.test(lines[0])) return false;
  const glyphLines = lines.filter(line => /[│├└─]/.test(line));
  if (glyphLines.length < 2) return false;
  return lines.some(line => /(?:地址属性|保护属性|内存属性|Base|Limit|Memory Type|Cache Attribute|Shareability|Normal|Device|Cacheable)/.test(line));
}

function isMemoryMapText(source) {
  const lines = String(source || '').split(/\r?\n/).map(line => line.trimEnd()).filter(line => line.trim());
  const addressLines = lines.filter(line => /^0x[\da-f]+(?:_[\da-f]+)*\s+/.test(line));
  const borderLines = lines.filter(line => /[┌┐├┤└┘]/.test(line));
  const regionNames = lines.filter(line => /(?:System Region|External Device|External RAM|Peripheral|SRAM|Code)/.test(line));
  return addressLines.length >= 3 && borderLines.length >= 3 && regionNames.length >= 3;
}

Prism.languages['arm-gas'] = armGas;
Prism.languages.armgas = armGas;
Prism.languages['region-tree'] = regionTree;
Prism.languages['memory-map'] = memoryMap;
Prism.languages.region = regionTree;
Prism.languages.regiontree = regionTree;
Prism.languages.riscv = riscv;
Prism.languages['riscv-asm'] = riscv;
Prism.languages.devicetree = devicetree;
Prism.languages.dts = devicetree;
Prism.languages.kconfig = kconfig;

module.exports = { Prism, armGas, riscv, devicetree, kconfig, regionTree, memoryMap, isRegionTreeText, isMemoryMapText };
