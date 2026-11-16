// markdown 唯一来源：legal 页 parse 与聊天页 parseBlocks 共享一个行内核心。
// AI 回复排版解析器：把 markdown 风格文本解析成渲染块（heading / bullet / para），
// 聊天页 WXML 按块渲染出层级（标题加粗、列表悬挂缩进、关键词加粗），替代旧的"剥平成纯文本"。
// 同时兼容历史消息里的「· 列表」和复盘报告的「【】标题」。
// 约束：纯函数、无小程序 API，node 可直接离线测试（tests/test-md-blocks.js）。
// 支持：# ## ### 标题、> 引用、- 列表、**加粗**、普通段落、空行。
// legal 返回 blocks: [{ type: 'h1'|'h2'|'h3'|'quote'|'li'|'p'|'gap', spans: [{text, bold}] }]

// 一行文字 -> 段片数组 [{t, b?}]，**xx** 解析为 b:true
function parseInlineCore(text) {
  var segments = [];
  var re = /\*\*(.+?)\*\*/g;
  var lastIndex = 0;
  var m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) segments.push({ t: text.slice(lastIndex, m.index), b: false });
    segments.push({ t: m[1], b: true });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) segments.push({ t: text.slice(lastIndex), b: false });
  if (!segments.length) segments.push({ t: text, b: false });
  return segments;
}

// 剥掉不渲染的行内标记（斜体/删除线/行内代码/引用）。
function stripInlineMarks(s) {
  return s
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2');
}

function parseInline(text) {
  return parseInlineCore(text).map(function (segment) {
    return { text: segment.t, bold: !!segment.b };
  });
}

function parse(md) {
  if (!md) return [];
  const blocks = [];
  const lines = String(md).split('\n');
  let prevGap = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();

    if (!t) {
      // 连续空行合并成一个间隔
      if (!prevGap && blocks.length) { blocks.push({ type: 'gap', spans: [] }); prevGap = true; }
      continue;
    }
    prevGap = false;

    if (t.startsWith('### ')) blocks.push({ type: 'h3', spans: parseInline(t.slice(4)) });
    else if (t.startsWith('## ')) blocks.push({ type: 'h2', spans: parseInline(t.slice(3)) });
    else if (t.startsWith('# ')) blocks.push({ type: 'h1', spans: parseInline(t.slice(2)) });
    else if (t.startsWith('> ')) blocks.push({ type: 'quote', spans: parseInline(t.slice(2)) });
    else if (/^[-·•] /.test(t)) blocks.push({ type: 'li', spans: parseInline(t.slice(2)) });
    else if (/^\d+\. /.test(t)) blocks.push({ type: 'li', spans: parseInline(t) });
    else blocks.push({ type: 'p', spans: parseInline(t) });
  }
  // 去尾部 gap
  while (blocks.length && blocks[blocks.length - 1].type === 'gap') blocks.pop();
  return blocks;
}

// 纯文本超过该字符数默认折叠——防超长复盘回复占满聊天流
var FOLD_THRESHOLD = 360;

// 用户气泡一行放得下的中文字数：气泡文字区宽 528rpx ÷ 字号 28rpx ≈ 18
// （528 = 750 屏宽 − 聊天区左右 28×2 − 消息行左 78 右 40 − 气泡内边距 24×2）
var USER_LINE_CHARS = 18;
// 用户消息超过这么多行才给"收起"——防自己发的长文占满整屏把 AI 回复顶出视野
var USER_FOLD_LINES = 5;

// 一段 emoji 只占一个字形宽，匹配到就整体换成一个汉字再数。
// 构成：代理对（一个 emoji 占两个 UTF-16 码元）或变体选择符，
// 中间可用零宽连接符串成一串（全家福 emoji 就是四个人拼起来的，共 11 个码元）。
// 用 new RegExp + ASCII 转义写，不把 emoji / 零宽字符直接贴进源码——那些字符在编辑器里是隐形的，
// 后面改代码的人看不见就会改坏（本文件 2026-08-22 就被这样改坏过一次）
var EMOJI_SEQ = new RegExp(
  '(?:[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|\\uFE0F)' +
  '(?:\\u200D(?:[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|\\uFE0F))*',
  'g'
);

// 估算一段文字渲染成多少行（全角算 1 格、半角算 0.5 格），纯函数不依赖布局。
// 只用于判断"要不要给收起按钮"，差一两行不影响观感，不追求精确。
function estimateLines(text, perLine) {
  var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  var total = 0;
  for (var i = 0; i < lines.length; i++) {
    // emoji 先压成单个字形再数。按 UTF-16 码元硬数会把 😂 算成 2 格、把 👨‍👩‍👧‍👦 算成 9.5 格，
    // 估高了就会给不该折叠的消息挂上"展开全部"——而 CSS 的 line-clamp 不到 5 行不裁剪，
    // 点了界面零变化，等于一个坏掉的按钮。宁可估少不给按钮，也不给点不动的按钮
    var line = lines[i].replace(EMOJI_SEQ, '中');
    var width = 0;
    for (var j = 0; j < line.length; j++) {
      // 0x2E80 起是中日韩部首/汉字/全角标点区，之前的基本都是半角
      width += line.charCodeAt(j) >= 0x2e80 ? 1 : 0.5;
    }
    total += Math.max(1, Math.ceil(width / perLine));
  }
  return total;
}

// 整段文本 -> 块数组
// 块类型：{type:'heading', segments} | {type:'bullet', ordinal?, segments} | {type:'para', segments}
function parseBlocks(text) {
  if (!text || typeof text !== 'string') return [];
  var lines = text.replace(/\r\n?/g, '\n').split('\n');
  var blocks = [];
  var paraLines = [];

  function parseChatInline(line) {
    var t = line.replace(/^>\s?/, '');
    return parseInlineCore(t).map(function (segment) {
      var parsed = { t: stripInlineMarks(segment.t) };
      if (segment.b) parsed.b = true;
      return parsed;
    });
  }

  function flushPara() {
    if (!paraLines.length) return;
    var segments = [];
    for (var i = 0; i < paraLines.length; i++) {
      if (i > 0) segments.push({ t: '\n' });
      var segs = parseChatInline(paraLines[i]);
      for (var j = 0; j < segs.length; j++) segments.push(segs[j]);
    }
    blocks.push({ type: 'para', segments: segments });
    paraLines = [];
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var m;
    if (!line) { flushPara(); continue; }
    // 兼容清洗逻辑接入前已落盘的内容：代码围栏只是模型包装，不作为笔记正文展示。
    if (/^```/.test(line)) { flushPara(); continue; }
    // ## 标题 或 整行【标题】（复盘报告风格）
    if ((m = line.match(/^#{1,6}\s+(.+)$/))) {
      flushPara();
      blocks.push({ type: 'heading', segments: parseChatInline(m[1]) });
      continue;
    }
    if ((m = line.match(/^【(.+)】$/))) {
      flushPara();
      blocks.push({ type: 'heading', segments: parseChatInline(m[1]) });
      continue;
    }
    // 水平分隔线：丢弃
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) { flushPara(); continue; }
    // 无序列表：- * + • ·（后两种来自存量内容）
    if ((m = line.match(/^[-*+•·]\s+(.+)$/))) {
      flushPara();
      blocks.push({ type: 'bullet', segments: parseChatInline(m[1]) });
      continue;
    }
    // 有序列表：1. / 1、（点号后必须有空格——防"1.5 万""2.0 版本"这类行首小数被劈成列表）
    if ((m = line.match(/^(\d{1,2})(?:\.\s+|、\s*)(.+)$/))) {
      flushPara();
      blocks.push({ type: 'bullet', ordinal: m[1] + '.', segments: parseChatInline(m[2]) });
      continue;
    }
    paraLines.push(line);
  }
  flushPara();
  // 补稳定 key（WXML wx:key 用；index 不是列表项属性，直接写 wx:key="index" 是无效 key）
  for (var bi = 0; bi < blocks.length; bi++) {
    blocks[bi].k = bi;
    var segs = blocks[bi].segments;
    for (var si = 0; si < segs.length; si++) segs[si].k = si;
  }
  return blocks;
}

// 给单条渲染用消息补排版字段（blocks/foldable/folded）。
// 只用于 setData 的渲染数据，禁止写进 wx.Storage（存前用 sanitizeForStore 剥掉）。
// folded 已有值时保留——用户点过"展开"后重渲染不能弹回折叠。
function decorateMessage(m) {
  if (m && m.role === 'ai' && m.notes) {
    m = Object.assign({}, m, { notes: require('./reply-cards').selectCards(m.notes) });
  }
  if (!m || !m.text) return m;
  // 用户自己发的消息不做 markdown 解析（用户打的字就是字面意思），只判断要不要折叠
  if (m.role === 'user') {
    if (estimateLines(m.text, USER_LINE_CHARS) <= USER_FOLD_LINES) return m;
    return Object.assign({}, m, {
      foldable: true,
      folded: m.folded === undefined ? true : m.folded,
    });
  }
  if (m.role !== 'ai') return m;
  var blocks = parseBlocks(m.text);
  if (!blocks.length) return m;
  var foldable = m.text.length > FOLD_THRESHOLD;
  return Object.assign({}, m, {
    blocks: blocks,
    foldable: foldable,
    folded: m.folded === undefined ? foldable : m.folded,
  });
}

// 存储前剥掉纯渲染字段，保证 wx.Storage 里的消息保持"text 是唯一事实"
function sanitizeForStore(messages) {
  return (messages || []).map(function (m) {
    if (!m || (m.blocks === undefined && m.foldable === undefined && m.folded === undefined)) return m;
    var copy = Object.assign({}, m);
    delete copy.blocks;
    delete copy.foldable;
    delete copy.folded;
    return copy;
  });
}

const markdownExports = {
  FOLD_THRESHOLD: FOLD_THRESHOLD,
  USER_LINE_CHARS: USER_LINE_CHARS,
  USER_FOLD_LINES: USER_FOLD_LINES,
  estimateLines: estimateLines,
  parse: parse,
  parseBlocks: parseBlocks,
  decorateMessage: decorateMessage,
  sanitizeForStore: sanitizeForStore,
  stripInlineMarks: stripInlineMarks,
};
if (typeof module !== 'undefined' && module.exports) module.exports = markdownExports;
if (typeof window !== 'undefined') window.zhizhiMarkdown = { parseBlocks };
