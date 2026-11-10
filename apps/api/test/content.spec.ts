/**
 * 公开读侧的 HTTP 边界测试（票 05）。
 *
 * 数据直接插库（票 05 的票面说明允许："可与 03/04 并行，测试数据直插数据库"），
 * 因此这些用例只验证读侧行为，不依赖写侧接口是否可用。
 *
 * 两条关键断言：**草稿在公开面上结构性不可见**、**中文关键词能命中**。
 */
import type { DataSource } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ArchiveYear, PostDetail, PostSummary, TagWithCount } from '@tiny-blogs/shared';
import { ContentService } from '../src/modules/content/content.service';
import { closeTestApp, createTestApp, type TestContext } from './helpers/app';
import { createUser, resetDatabase } from './helpers/db';

/** 一条已发布文章的种数据。 */
interface PublishedSeed {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly contentMd: string;
  readonly seq: number;
  /** MySQL `DATETIME` 字面量（连接按 UTC 存取，与库里的值一一对应）。 */
  readonly publishedAt: string;
}

/** 普通正文：不含任何检索关键词。 */
const PLAIN_CONTENT = '## 小节\n\n普通的正文内容。';

/** 命中"预渲染"的文章内容。 */
const PRERENDER_CONTENT = '## 为什么要预渲染\n\n预渲染让搜索引擎直接读到正文，首屏也不用等 JS。';

/** 命中"调优"的文章内容。 */
const MYSQL_CONTENT = '## 索引与慢查询\n\n数据库调优先看执行计划，再看索引覆盖。';

/**
 * 10 篇已发布 + 1 篇草稿的固定种数据。
 *
 * 用固定时间而不是"当前时间"：排序、归档、分页断言的期望值必须是写死的，
 * 否则测试自己就会变成一个需要解释的变量。
 */
const PUBLISHED_SEEDS: readonly PublishedSeed[] = [
  { slug: 'pressing-one', title: '第一篇：开场曲', summary: '第一张唱片的 A 面开场曲。', contentMd: PLAIN_CONTENT, seq: 1, publishedAt: '2025-12-31 00:00:00' },
  { slug: 'prerender-why', title: '用 vite-ssg 给博客做预渲染', summary: '运行时 SSR 要养一台常驻 Node。', contentMd: PRERENDER_CONTENT, seq: 2, publishedAt: '2026-01-15 00:00:00' },
  { slug: 'mysql-tuning', title: '慢查询先看执行计划', summary: '索引不是越多越好。', contentMd: MYSQL_CONTENT, seq: 3, publishedAt: '2026-01-20 00:00:00' },
  { slug: 'tie-a', title: '同一秒发布的前一篇', summary: '与下一篇共享发布时间。', contentMd: PLAIN_CONTENT, seq: 4, publishedAt: '2026-02-01 00:00:00' },
  { slug: 'tie-b', title: '同一秒发布的后一篇', summary: '与上一篇共享发布时间。', contentMd: PLAIN_CONTENT, seq: 5, publishedAt: '2026-02-01 00:00:00' },
  { slug: 'side-b-one', title: 'B 面第一首', summary: '换了面，配色重新轮一圈。', contentMd: PLAIN_CONTENT, seq: 6, publishedAt: '2026-03-01 00:00:00' },
  { slug: 'side-b-two', title: 'B 面第二首', summary: '承接上一首。', contentMd: PLAIN_CONTENT, seq: 7, publishedAt: '2026-03-02 00:00:00' },
  { slug: 'side-b-three', title: 'B 面第三首', summary: '本面倒数第二首。', contentMd: PLAIN_CONTENT, seq: 8, publishedAt: '2026-03-03 00:00:00' },
  { slug: 'side-b-four', title: 'B 面第四首', summary: '本面最后一首。', contentMd: PLAIN_CONTENT, seq: 9, publishedAt: '2026-03-04 00:00:00' },
  { slug: 'side-c-two', title: 'C 面第二首', summary: '进入第 9 篇之后的新面。', contentMd: PLAIN_CONTENT, seq: 10, publishedAt: '2026-03-05 00:00:00' },
];

/**
 * 插一篇已发布文章。
 *
 * @param dataSource 数据源。
 * @param authorId 作者 id。
 * @param seed 种数据。
 * @returns 文章 id。
 */
async function insertPublished(
  dataSource: DataSource,
  authorId: number,
  seed: PublishedSeed,
): Promise<number> {
  const result = (await dataSource.query(
    `INSERT INTO posts (author_id, title, slug, summary, content_md, status, published_seq, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?, ?)`,
    [
      authorId,
      seed.title,
      seed.slug,
      seed.summary,
      seed.contentMd,
      seed.seq,
      seed.publishedAt,
      seed.publishedAt,
      seed.publishedAt,
    ],
  )) as { insertId: number };
  return result.insertId;
}

/**
 * 插一篇草稿（没有序号、没有发布时间）。
 *
 * @param dataSource 数据源。
 * @param authorId 作者 id。
 * @param slug 文章 slug。
 * @returns 文章 id。
 */
async function insertDraft(dataSource: DataSource, authorId: number, slug: string): Promise<number> {
  const result = (await dataSource.query(
    `INSERT INTO posts (author_id, title, slug, summary, content_md, status, published_seq, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', NULL, NULL, ?, ?)`,
    [authorId, '未完成的草稿', slug, '草稿不该被任何人看到。', PLAIN_CONTENT, '2026-04-01 00:00:00', '2026-04-01 00:00:00'],
  )) as { insertId: number };
  return result.insertId;
}

/**
 * 插一个标签。
 *
 * @param dataSource 数据源。
 * @param name 标签名。
 * @param slug 标签 slug。
 * @returns 标签 id。
 */
async function insertTag(dataSource: DataSource, name: string, slug: string): Promise<number> {
  const result = (await dataSource.query(
    'INSERT INTO tags (name, slug, created_at) VALUES (?, ?, ?)',
    [name, slug, '2025-12-01 00:00:00'],
  )) as { insertId: number };
  return result.insertId;
}

/**
 * 把标签挂到文章上。
 *
 * @param dataSource 数据源。
 * @param postId 文章 id。
 * @param tagId 标签 id。
 */
async function linkTag(dataSource: DataSource, postId: number, tagId: number): Promise<void> {
  await dataSource.query('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)', [postId, tagId]);
}

describe('public read api', () => {
  let context: TestContext;
  let content: ContentService;
  let draftId: number;
  const postIds = new Map<string, number>();
  const tagIds = new Map<string, number>();

  beforeAll(async () => {
    context = await createTestApp();
    await resetDatabase(context.dataSource);

    const author = await createUser(context.dataSource, 'author-one', 'author-one-password');

    for (const seed of PUBLISHED_SEEDS) {
      const postId = await insertPublished(context.dataSource, author.id, seed);
      postIds.set(seed.slug, postId);
    }
    draftId = await insertDraft(context.dataSource, author.id, 'secret-draft');

    for (const [name, slug] of [
      ['Vue', 'vue'],
      ['MySQL', 'mysql'],
      ['未公开', 'ghost'],
    ] as const) {
      tagIds.set(slug, await insertTag(context.dataSource, name, slug));
    }

    await linkTag(context.dataSource, postIds.get('pressing-one') ?? 0, tagIds.get('vue') ?? 0);
    await linkTag(context.dataSource, postIds.get('prerender-why') ?? 0, tagIds.get('vue') ?? 0);
    await linkTag(context.dataSource, postIds.get('mysql-tuning') ?? 0, tagIds.get('mysql') ?? 0);
    // 只挂在草稿上的标签：公开标签列表里不应该出现。
    await linkTag(context.dataSource, draftId, tagIds.get('ghost') ?? 0);

    content = context.app.get(ContentService);
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  it('列表：默认 8 条/页，排序恒为 published_at DESC, published_seq DESC', async () => {
    const response = await request(context.app.getHttpServer()).get('/api/posts').expect(200);
    const body = response.body as { items: PostSummary[]; page: number; pageSize: number; total: number };

    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(8);
    expect(body.total).toBe(PUBLISHED_SEEDS.length);
    expect(body.items).toHaveLength(8);
    expect(body.items.map((item) => item.slug)).toEqual([
      'side-c-two',
      'side-b-four',
      'side-b-three',
      'side-b-two',
      'side-b-one',
      // 同一秒发布的两篇按序号倒序：seq 5 在 seq 4 之前。
      'tie-b',
      'tie-a',
      'mysql-tuning',
    ]);
  });

  it('列表项含派生 track 与 readingMinutes，不含正文（contentMd / html）', async () => {
    // 一页取满（24 = 契约上限），这样能同时检查第 10 篇与第 2 篇的派生值。
    const response = await request(context.app.getHttpServer())
      .get('/api/posts?pageSize=24')
      .expect(200);
    const items = (response.body as { items: PostSummary[] }).items;
    const newest = items[0];

    expect(newest?.slug).toBe('side-c-two');
    expect(newest?.track).toEqual({ no: 'C2', side: 'C', catalog: 'TB—010', accent: 'v2' });
    expect(newest?.publishedAt).toBe('2026-03-05T00:00:00.000Z');
    expect(newest?.updatedAt).toBe('2026-03-05T00:00:00.000Z');
    expect(typeof newest?.readingMinutes).toBe('number');
    expect(newest?.readingMinutes).toBeGreaterThanOrEqual(1);

    const prerender = items.find((item) => item.slug === 'prerender-why');
    expect(prerender?.track.catalog).toBe('TB—002');

    for (const item of items) {
      expect(Object.keys(item)).not.toContain('contentMd');
      expect(Object.keys(item)).not.toContain('html');
      expect(item.tags.every((tag) => Object.keys(tag).join(',') === 'name,slug')).toBe(true);
    }
  });

  it('分页：第二页取到剩余文章，page/pageSize 原样回显', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/api/posts?page=2')
      .expect(200);
    const body = response.body as { items: PostSummary[]; page: number; pageSize: number; total: number };

    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(8);
    expect(body.items.map((item) => item.slug)).toEqual(['prerender-why', 'pressing-one']);
  });

  it('分页上限：pageSize 超过 24 与非法数字都返回 422 统一信封', async () => {
    const tooLarge = await request(context.app.getHttpServer())
      .get('/api/posts?pageSize=25')
      .expect(422);
    expect(tooLarge.body).toEqual({
      error: { code: 'VALIDATION_FAILED', message: expect.any(String) },
    });

    await request(context.app.getHttpServer()).get('/api/posts?pageSize=24').expect(200);
    await request(context.app.getHttpServer()).get('/api/posts?page=0').expect(422);
  });

  it('tag 过滤只返回挂着该标签的已发布文章', async () => {
    const vue = await request(context.app.getHttpServer()).get('/api/posts?tag=vue').expect(200);
    expect((vue.body as { items: PostSummary[]; total: number }).items.map((item) => item.slug)).toEqual([
      'prerender-why',
      'pressing-one',
    ]);
    expect((vue.body as { total: number }).total).toBe(2);

    // 只挂在草稿上的标签：公开面上等于不存在。
    const ghost = await request(context.app.getHttpServer()).get('/api/posts?tag=ghost').expect(200);
    expect((ghost.body as { items: PostSummary[]; total: number }).total).toBe(0);
  });

  it('year / month 过滤按半开区间收敛', async () => {
    const year2026 = await request(context.app.getHttpServer()).get('/api/posts?year=2026').expect(200);
    expect((year2026.body as { total: number }).total).toBe(9);

    const year2025 = await request(context.app.getHttpServer()).get('/api/posts?year=2025').expect(200);
    expect((year2025.body as { items: PostSummary[] }).items.map((item) => item.slug)).toEqual([
      'pressing-one',
    ]);

    const february = await request(context.app.getHttpServer())
      .get('/api/posts?year=2026&month=2')
      .expect(200);
    expect((february.body as { items: PostSummary[] }).items.map((item) => item.slug)).toEqual([
      'tie-b',
      'tie-a',
    ]);
  });

  it('中文全文检索：ngram 命中关键词，无关词不命中', async () => {
    const prereender = await request(context.app.getHttpServer())
      .get('/api/posts?q=预渲染')
      .expect(200);
    expect((prereender.body as { items: PostSummary[] }).items.map((item) => item.slug)).toEqual([
      'prerender-why',
    ]);

    // 两字词同样命中（ngram_token_size=2）。
    const tuning = await request(context.app.getHttpServer()).get('/api/posts?q=调优').expect(200);
    expect((tuning.body as { items: PostSummary[] }).items.map((item) => item.slug)).toEqual([
      'mysql-tuning',
    ]);

    const nothing = await request(context.app.getHttpServer())
      .get('/api/posts?q=量子退火')
      .expect(200);
    expect((nothing.body as { items: PostSummary[]; total: number }).total).toBe(0);
  });

  it('详情：返回 html + headings + prev/next，不返回 contentMd', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/api/posts/prerender-why')
      .expect(200);
    const detail = response.body as PostDetail;

    expect(detail.slug).toBe('prerender-why');
    expect(detail.html).toContain('<h2 id="t1">为什么要预渲染</h2>');
    expect(detail.headings).toEqual([
      { level: 2, text: '为什么要预渲染', id: 't1' },
    ]);
    expect(detail.prev).toEqual({
      slug: 'pressing-one',
      title: '第一篇：开场曲',
      track: { no: 'A1', side: 'A', catalog: 'TB—001', accent: 'v1' },
    });
    expect(detail.next).toEqual({
      slug: 'mysql-tuning',
      title: '慢查询先看执行计划',
      track: { no: 'A3', side: 'A', catalog: 'TB—003', accent: 'v3' },
    });
    expect(Object.keys(detail)).not.toContain('contentMd');
  });

  it('详情：同一秒发布的两篇互为上下篇时按序号定序', async () => {
    const older = (await request(context.app.getHttpServer()).get('/api/posts/tie-a').expect(200))
      .body as PostDetail;
    const newer = (await request(context.app.getHttpServer()).get('/api/posts/tie-b').expect(200))
      .body as PostDetail;

    expect(older.next?.slug).toBe('tie-b');
    expect(newer.prev?.slug).toBe('tie-a');
  });

  it('详情：首篇没有更新的、末篇没有更早的', async () => {
    const newest = (await request(context.app.getHttpServer()).get('/api/posts/side-c-two').expect(200))
      .body as PostDetail;
    expect(newest.next).toBeNull();

    const oldest = (await request(context.app.getHttpServer()).get('/api/posts/pressing-one').expect(200))
      .body as PostDetail;
    expect(oldest.prev).toBeNull();
  });

  it('草稿与不存在的 slug 返回完全一样的 404，不泄漏存在性', async () => {
    const draft = await request(context.app.getHttpServer()).get('/api/posts/secret-draft').expect(404);
    const missing = await request(context.app.getHttpServer())
      .get('/api/posts/no-such-post')
      .expect(404);

    expect(draft.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
    expect(draft.body).toEqual(missing.body);
  });

  it('标签列表：只统计已发布文章，按数量降序', async () => {
    const response = await request(context.app.getHttpServer()).get('/api/tags').expect(200);
    const tags = response.body as TagWithCount[];

    expect(tags).toEqual([
      { name: 'Vue', slug: 'vue', count: 2 },
      { name: 'MySQL', slug: 'mysql', count: 1 },
    ]);
    // 只挂在草稿上的标签不出现。
    expect(tags.map((tag) => tag.slug)).not.toContain('ghost');
  });

  it('归档：年 → 月分组，年份与月份倒序，组内按序号降序', async () => {
    const response = await request(context.app.getHttpServer()).get('/api/archives').expect(200);
    const archive = response.body as ArchiveYear[];

    expect(archive.map((year) => year.year)).toEqual([2026, 2025]);
    expect(archive[0]?.count).toBe(9);
    expect(archive[0]?.months.map((month) => month.month)).toEqual([3, 2, 1]);
    expect(archive[0]?.months[0]?.posts.map((post) => post.slug)).toEqual([
      'side-c-two',
      'side-b-four',
      'side-b-three',
      'side-b-two',
      'side-b-one',
    ]);
    expect(archive[1]?.months[0]?.posts.map((post) => post.slug)).toEqual(['pressing-one']);
    // 文章只出现在归档里，顺序与列表一致（seq 降序）。
    expect(archive[0]?.months[1]?.posts.map((post) => post.slug)).toEqual(['tie-b', 'tie-a']);
  });

  it('导出快照与公开接口字段完全一致（同一份投影函数）', async () => {
    const snapshot = await content.exportSnapshot();
    const list = await request(context.app.getHttpServer()).get('/api/posts?pageSize=8').expect(200);
    const detail = await request(context.app.getHttpServer())
      .get('/api/posts/side-c-two')
      .expect(200);
    const tags = await request(context.app.getHttpServer()).get('/api/tags').expect(200);
    const archive = await request(context.app.getHttpServer()).get('/api/archives').expect(200);

    expect(snapshot.version).toBe(1);
    expect(snapshot.posts).toHaveLength(PUBLISHED_SEEDS.length);
    expect(snapshot.posts.map((post) => post.slug)).toEqual(
      (list.body as { items: PostSummary[] }).items.map((item) => item.slug).concat(['prerender-why', 'pressing-one']),
    );

    const first = snapshot.posts[0];
    const detailBody = detail.body as PostDetail;
    expect(first?.slug).toBe(detailBody.slug);
    expect(first?.track).toEqual(detailBody.track);
    expect(first?.readingMinutes).toBe(detailBody.readingMinutes);
    expect(first?.html).toBe(detailBody.html);
    expect(first?.headings).toEqual(detailBody.headings);
    expect(first?.prev).toEqual(detailBody.prev);
    expect(first?.next).toEqual(detailBody.next);
    // 快照多带原文，这正是它与公开详情的唯一差别。
    expect(typeof first?.contentMd).toBe('string');

    expect(snapshot.tags).toEqual(tags.body);
    expect(snapshot.archive).toEqual(archive.body);
    expect(snapshot.site.title).toBeTruthy();
  });

  it('读侧不变量在模块内部：任何查询都拿不到草稿', async () => {
    const list = await request(context.app.getHttpServer()).get('/api/posts?q=草稿').expect(200);
    expect((list.body as { total: number }).total).toBe(0);

    const byTag = await request(context.app.getHttpServer()).get('/api/posts?tag=ghost').expect(200);
    expect((byTag.body as { total: number }).total).toBe(0);

    expect(await content.findPublished('secret-draft')).toBeNull();
  });
});
