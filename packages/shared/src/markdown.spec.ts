/**
 * `renderMarkdown` / `estimateReadingMinutes` 的纯函数单测（票 05）。
 *
 * 这些用例是"派生规则只写一次"的护栏：前台预渲染、详情页、导出快照都调这两个函数，
 * 只要它们的行为被钉住，四处展示就不可能分叉。
 */
import { describe, expect, it } from 'vitest';
import { estimateReadingMinutes, renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('一次产出 HTML、目录与阅读时长', () => {
    const result = renderMarkdown('## 第一节\n\n正文内容。\n');

    expect(result.html).toContain('<h2 id="t1">第一节</h2>');
    expect(result.headings).toEqual([{ level: 2, text: '第一节', id: 't1' }]);
    expect(result.readingMinutes).toBe(1);
  });

  it('目录只收 h2/h3，锚点按出现顺序编号（h1 是文章标题，不进目录）', () => {
    const result = renderMarkdown(
      ['# 文章标题', '', '## 为什么要预渲染', '', '正文。', '', '### 取舍', '', '正文。', '', '## 结论', ''].join('\n'),
    );

    expect(result.headings).toEqual([
      { level: 2, text: '为什么要预渲染', id: 't1' },
      { level: 3, text: '取舍', id: 't2' },
      { level: 2, text: '结论', id: 't3' },
    ]);
    // 锚点与标题文字解耦：改标题不会让旧链接失效。
    expect(result.html).toContain('<h2 id="t1">为什么要预渲染</h2>');
    expect(result.html).toContain('<h3 id="t2">取舍</h3>');
    expect(result.html).toContain('<h1>文章标题</h1>');
  });

  it('原始 HTML 一律转义，不接受内联脚本', () => {
    const result = renderMarkdown('<script>alert("xss")</script>');

    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;');
  });

  it('代码块按语言高亮；未知语言降级为纯文本而不抛异常', () => {
    const highlighted = renderMarkdown('```ts\nconst answer: number = 42;\n```');
    expect(highlighted.html).toContain('class="language-ts"');
    expect(highlighted.html).toContain('hljs-keyword');

    const fallback = renderMarkdown('```not-a-language\nconst answer = 42;\n```');
    expect(fallback.html).toContain('const answer = 42;');
    expect(fallback.html).toContain('class="language-not-a-language"');
  });
});

describe('readingMinutes', () => {
  it('中文按 400 字/分钟：800 字 → 2 分钟', () => {
    const body = '字'.repeat(800);
    expect(renderMarkdown(body).readingMinutes).toBe(2);
    expect(estimateReadingMinutes(body)).toBe(2);
  });

  it('中文不足一档也至少 1 分钟；空文档同样为 1', () => {
    expect(renderMarkdown('字'.repeat(50)).readingMinutes).toBe(1);
    expect(renderMarkdown('').readingMinutes).toBe(1);
  });

  it('代码块按 20 行/分钟：41 行代码 → 3 分钟', () => {
    const code = Array.from({ length: 41 }, (_, index) => `const value${String(index)} = ${String(index)};`).join('\n');
    const result = renderMarkdown(['```ts', code, '```'].join('\n'));

    expect(result.readingMinutes).toBe(Math.ceil(41 / 20));
    expect(result.readingMinutes).toBe(3);
  });

  it('代码块的空白行不计入代码行数', () => {
    const code = ['const a = 1;', '', '   ', 'const b = 2;'].join('\n');
    expect(renderMarkdown(['```ts', code, '```'].join('\n')).readingMinutes).toBe(1);
  });

  it('正文与代码累加后向上取整', () => {
    const prose = '字'.repeat(400); // 1 分钟
    const code = Array.from({ length: 10 }, (_, index) => `line ${String(index)}`).join('\n'); // 0.5 分钟
    const result = renderMarkdown([prose, '', '```ts', code, '```'].join('\n'));

    expect(result.readingMinutes).toBe(2);
  });

  it('列表与详情用同一套规则：估算值与渲染值完全一致', () => {
    const md = ['## 标题', '', '字'.repeat(500), '', '```ts', 'const a = 1;', '```'].join('\n');
    expect(estimateReadingMinutes(md)).toBe(renderMarkdown(md).readingMinutes);
  });
});
