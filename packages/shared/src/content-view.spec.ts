/**
 * `toTrack` / `toPostSummary` / `toPostDetail` 的纯函数单测（票 05）。
 *
 * 曲目号规则来自契约 §3，是"唱片编号不因新碟发行而位移"这条隐性需求的可执行版本，
 * 因此逐个序号钉住：A1…A4、B1、B5 之前不能出现任何偏差。
 */
import { describe, expect, it } from 'vitest';
import type { PostRecord } from './content';
import { toPostDetail, toPostRef, toPostSummary, toTrack } from './content-view';

/**
 * 造一条已发布的文章记录。
 *
 * @param overrides 需要覆盖的字段。
 * @returns 文章记录。
 */
function record(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: 1,
    authorId: 1,
    title: '用 vite-ssg 做预渲染',
    slug: 'vite-ssg-prerender',
    summary: '运行时 SSR 要养一台常驻 Node，纯 SPA 又过不了搜索引擎这一关。',
    contentMd: '## 为什么要预渲染\n\n正文内容。',
    status: 'published',
    publishedSeq: 1,
    publishedAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-05T13:30:00.000Z',
    tags: [{ name: 'Vue', slug: 'vue' }],
    ...overrides,
  };
}

describe('toTrack', () => {
  it('每 4 篇换一个面，面内编号从 1 数到 4', () => {
    expect(toTrack(1)).toEqual({ no: 'A1', side: 'A', catalog: 'TB—001', accent: 'v1' });
    expect(toTrack(2)).toEqual({ no: 'A2', side: 'A', catalog: 'TB—002', accent: 'v2' });
    expect(toTrack(3)).toEqual({ no: 'A3', side: 'A', catalog: 'TB—003', accent: 'v3' });
    expect(toTrack(4)).toEqual({ no: 'A4', side: 'A', catalog: 'TB—004', accent: 'v4' });
  });

  it('第 5 篇进入 B 面，配色重新从 v1 开始', () => {
    expect(toTrack(5)).toEqual({ no: 'B1', side: 'B', catalog: 'TB—005', accent: 'v1' });
    expect(toTrack(8)).toEqual({ no: 'B4', side: 'B', catalog: 'TB—008', accent: 'v4' });
  });

  it('第 9 篇进入 C 面，编号三位补零', () => {
    expect(toTrack(9)).toEqual({ no: 'C1', side: 'C', catalog: 'TB—009', accent: 'v1' });
    expect(toTrack(104).catalog).toBe('TB—104');
  });

  it('编号随序号单调递增，不会因为新增文章而回退', () => {
    const catalogues = [1, 2, 3, 47, 48, 99].map((seq) => toTrack(seq).catalog);
    expect(catalogues).toEqual([...catalogues].sort());
  });

  it('非法序号直接报错，不返回假编号', () => {
    expect(() => toTrack(0)).toThrow(RangeError);
    expect(() => toTrack(1.5)).toThrow(RangeError);
    expect(() => toTrack(105)).toThrow(RangeError);
  });
});

describe('toPostSummary', () => {
  it('只产出契约规定的字段，不含 contentMd 与 html', () => {
    const summary = toPostSummary(record());

    expect(summary).toEqual({
      slug: 'vite-ssg-prerender',
      title: '用 vite-ssg 做预渲染',
      summary: '运行时 SSR 要养一台常驻 Node，纯 SPA 又过不了搜索引擎这一关。',
      publishedAt: '2026-11-02T10:00:00.000Z',
      updatedAt: '2026-11-05T13:30:00.000Z',
      readingMinutes: 1,
      track: { no: 'A1', side: 'A', catalog: 'TB—001', accent: 'v1' },
      tags: [{ name: 'Vue', slug: 'vue' }],
    });
    expect(Object.keys(summary)).not.toContain('contentMd');
    expect(Object.keys(summary)).not.toContain('html');
  });

  it('标签只保留 name 与 slug（多余的列不外泄）', () => {
    const summary = toPostSummary(
      record({
        tags: [
          { name: 'Vue', slug: 'vue' },
          { name: 'TypeScript', slug: 'typescript' },
        ],
      }),
    );

    expect(summary.tags).toEqual([
      { name: 'Vue', slug: 'vue' },
      { name: 'TypeScript', slug: 'typescript' },
    ]);
    expect(Object.keys(summary.tags[0] ?? {})).toEqual(['name', 'slug']);
  });

  it('没有标签时返回空数组而不是 undefined', () => {
    expect(toPostSummary(record({ tags: undefined })).tags).toEqual([]);
  });

  it('未发布的记录不能投影成公开视图', () => {
    expect(() => toPostSummary(record({ status: 'draft', publishedSeq: null }))).toThrow(/尚未发布/);
  });
});

describe('toPostDetail / toPostRef', () => {
  it('详情 = 列表项 + html + headings + prev/next，且不含 contentMd', () => {
    const prev = toPostRef(record({ slug: 'older', title: '更早的一篇', publishedSeq: 1 }));
    const next = toPostRef(record({ slug: 'newer', title: '更晚的一篇', publishedSeq: 3 }));

    const detail = toPostDetail(record({ publishedSeq: 2 }), prev, next);

    expect(detail.html).toContain('<h2 id="t1">为什么要预渲染</h2>');
    expect(detail.headings).toEqual([{ level: 2, text: '为什么要预渲染', id: 't1' }]);
    expect(detail.prev).toEqual({ slug: 'older', title: '更早的一篇', track: toTrack(1) });
    expect(detail.next).toEqual({ slug: 'newer', title: '更晚的一篇', track: toTrack(3) });
    expect(Object.keys(detail)).not.toContain('contentMd');
  });

  it('没有上下篇时给 null，前端不必区分 undefined', () => {
    const detail = toPostDetail(record());
    expect(detail.prev).toBeNull();
    expect(detail.next).toBeNull();
  });
});
