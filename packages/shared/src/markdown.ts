/**
 * Markdown → HTML / 目录 / 阅读时长（契约 §3、§4.1）。
 *
 * 深度来源：一次调用同时产出三样东西，调用方（预渲染、编辑器预览、详情页、导出）
 * 不需要各自实现三遍，也不会出现三份不一致的规则。
 *
 * 纪律：
 * - **无 I/O、无 Node-only 依赖**：markdown-it 与 highlight.js 都能在 Node 与浏览器里求值，
 *   因此同一份函数既供 `vite-ssg` 预渲染，也供运行时详情页。
 * - **不允许原始 HTML**：`html: false` 让 markdown 里的 `<script>` 被转义成文本，
 *   不需要额外引 sanitizer（v1 的正文只由作者本人在后台书写，且这里已是最严格的一档）。
 * - 目录锚点固定为 `t1`、`t2`…（契约 §5 `PostDetail.headings[].id`），
 *   与标题文字无关，改标题不会让旧链接失效。
 */
import hljs from 'highlight.js/lib/common';
import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';

/** 阅读速度：中文 400 字/分钟（契约 §3）。 */
const PROSE_CHARS_PER_MINUTE = 400;

/** 代码阅读速度：20 行/分钟（契约 §3）。 */
const CODE_LINES_PER_MINUTE = 20;

/** 目录项。`level` 只收 h2/h3——h1 是文章标题，不进目录。 */
export interface Heading {
  readonly level: 2 | 3;
  readonly text: string;
  readonly id: string;
}

/** `renderMarkdown()` 的返回值。 */
export interface RenderedMarkdown {
  readonly html: string;
  readonly headings: readonly Heading[];
  readonly readingMinutes: number;
}

/** 转义表，供代码高亮降级时使用（与 markdown-it 的 `escapeHtml` 保持一致）。 */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * 把标题标签名转成目录层级。
 *
 * @param tag 形如 `h2`、`h3` 的标签名。
 * @returns 2 / 3，其余返回 `null`（不进目录）。
 */
function toHeadingLevel(tag: string): 2 | 3 | null {
  if (tag === 'h2') {
    return 2;
  }
  if (tag === 'h3') {
    return 3;
  }
  return null;
}

/**
 * 最小 HTML 转义。
 *
 * @param value 原始文本。
 * @returns 转义后的文本。
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * 语法高亮。未知语言或高亮失败时退回转义后的纯文本——渲染永远不抛异常。
 *
 * @param code 代码块内容。
 * @param language 语言标识（来自 ``` 后面的信息串）。
 * @returns 已转义、可直接塞进 `<code>` 的 HTML 片段。
 */
function highlightCode(code: string, language: string): string {
  if (language !== '' && hljs.getLanguage(language) !== undefined) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch {
      // 高亮失败只影响观感，不能影响文章可读性，降级为纯文本。
      return escapeHtml(code);
    }
  }
  return escapeHtml(code);
}

/** 唯一的 markdown-it 实例（纯函数，可共享；每个实例都建一套 rule 是浪费）。 */
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
  highlight: highlightCode,
});

// 解析阶段就分配锚点：HTML 与 headings 列表因此必然用同一套编号。
markdown.core.ruler.push('assign_heading_anchors', (state) => {
  let counter = 0;
  for (const token of state.tokens) {
    if (token.type !== 'heading_open') {
      continue;
    }
    if (toHeadingLevel(token.tag) === null) {
      continue;
    }
    counter += 1;
    token.attrSet('id', `t${counter}`);
  }
});

/**
 * 统计代码行数（空行不计，避免大段空行把时长撑大）。
 *
 * @param code 代码块内容。
 * @returns 有效行数。
 */
function countCodeLines(code: string): number {
  let lines = 0;
  for (const line of code.split('\n')) {
    if (line.trim() !== '') {
      lines += 1;
    }
  }
  return lines;
}

/**
 * 统计正文字数：按 Unicode 码点计、忽略空白。
 *
 * 中英文统一按字符计（v1 内容以中文为主，契约只规定了中文 400 字/分钟这一档）；
 * 行内代码算正文，因为它是被"读"的，不是被"扫"的代码块。
 *
 * @param text 一段纯文本。
 * @returns 字符数。
 */
function countChars(text: string): number {
  let chars = 0;
  for (const char of text) {
    if (!/\s/.test(char)) {
      chars += 1;
    }
  }
  return chars;
}

/**
 * 从已解析的 token 流算阅读时长。
 *
 * @param tokens markdown-it 顶层 token。
 * @returns `Math.max(1, ceil(正文/400 + 代码行/20))`。
 */
function readingMinutesFromTokens(tokens: readonly Token[]): number {
  let proseChars = 0;
  let codeLines = 0;

  for (const token of tokens) {
    if (token.type === 'fence' || token.type === 'code_block') {
      codeLines += countCodeLines(token.content);
      continue;
    }
    if (token.type !== 'inline' || token.children === null) {
      continue;
    }
    for (const child of token.children) {
      if (child.type === 'text' || child.type === 'code_inline') {
        proseChars += countChars(child.content);
      }
    }
  }

  const minutes = proseChars / PROSE_CHARS_PER_MINUTE + codeLines / CODE_LINES_PER_MINUTE;
  return Math.max(1, Math.ceil(minutes));
}

/**
 * 从已解析的 token 流提取目录。
 *
 * @param tokens markdown-it 顶层 token（锚点已由 core rule 写入）。
 * @returns 按出现顺序排列的 h2/h3。
 */
function collectHeadings(tokens: readonly Token[]): Heading[] {
  const headings: Heading[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.type !== 'heading_open') {
      continue;
    }
    const level = toHeadingLevel(token.tag);
    if (level === null) {
      continue;
    }
    const rawId = token.attrGet('id');
    if (rawId === null) {
      continue;
    }
    const id = String(rawId);
    // heading_open 后面紧跟的就是承载文字内容的 inline token。
    const inline = tokens[index + 1];
    headings.push({ level, text: inline === undefined ? '' : String(inline.content), id });
  }

  return headings;
}

/**
 * 渲染 Markdown：一次调用拿到 HTML、目录与阅读时长。
 *
 * @param md Markdown 原文。
 * @returns 渲染结果；空串输入得到空 HTML、空目录、`readingMinutes = 1`。
 */
export function renderMarkdown(md: string): RenderedMarkdown {
  const tokens = markdown.parse(md, {});
  return {
    html: markdown.renderer.render(tokens, markdown.options, {}),
    headings: collectHeadings(tokens),
    readingMinutes: readingMinutesFromTokens(tokens),
  };
}

/**
 * 只算阅读时长（列表页只要这个值，不需要生成 HTML）。
 *
 * 与 `renderMarkdown().readingMinutes` 共用同一套 token 统计，因此列表与详情
 * 两处的时长永远一致——这正是"规则只写一次"的意思。
 *
 * @param md Markdown 原文。
 * @returns 至少为 1 的整数分钟。
 */
export function estimateReadingMinutes(md: string): number {
  return readingMinutesFromTokens(markdown.parse(md, {}));
}
