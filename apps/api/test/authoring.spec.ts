import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminPostDetail, AdminPostListItem, Page, PostRecord, TagRef } from '@tiny-blogs/shared';
import { closeTestApp, createTestApp, type TestContext } from './helpers/app';
import { createUser, resetDatabase, type SeededUser } from './helpers/db';
import { bearer, login } from './helpers/http';

/** 固定口令（测试专用，不是任何真实凭据）。 */
const PASSWORD = 'correct-horse-battery-staple';

/** 可覆盖的文章字段。 */
interface DraftOverrides {
  title?: string;
  slug?: string;
  summary?: string;
  contentMd?: string;
  tagSlugs?: string[];
}

/** 一篇文章的最小合法载荷。 */
function draftPayload(overrides: DraftOverrides = {}): Record<string, unknown> {
  return {
    title: '用 vite-ssg 给博客做预渲染',
    slug: 'vite-ssg-prerender',
    summary: '运行时 SSR 要养一台常驻 Node，纯 SPA 又过不了搜索引擎这一关。',
    contentMd: '# 为什么要预渲染\n\n正文内容。',
    tagSlugs: [],
    ...overrides,
  };
}

/**
 * 票 04：文章写侧闭环，全部走 HTTP 边界。
 *
 * 两个账号 fixture：作者本人与"另一个用户"，用来证明归属校验真的生效
 * （v1 只有一个管理员，但漏洞往往在加第二个人的那天才暴露）。
 */
describe('post authoring loop', () => {
  let context: TestContext;
  let author: SeededUser;
  let intruder: SeededUser;
  let authorToken: string;
  let intruderToken: string;

  beforeAll(async () => {
    context = await createTestApp();
    await resetDatabase(context.dataSource);

    author = await createUser(context.dataSource, 'author', PASSWORD);
    intruder = await createUser(context.dataSource, 'intruder', PASSWORD);
    authorToken = (await login(context.app, author.username, PASSWORD)).accessToken;
    intruderToken = (await login(context.app, intruder.username, PASSWORD)).accessToken;
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  it('未登录访问后台接口一律 401', async () => {
    const server = context.app.getHttpServer();
    await request(server).get('/api/admin/posts').expect(401);
    await request(server).post('/api/admin/posts').send(draftPayload()).expect(401);
    await request(server).get('/api/admin/tags').expect(401);
    await request(server).delete('/api/admin/posts/whatever').expect(401);
  });

  it('创建草稿：author_id 取自登录态，status=draft，publishedSeq 为空', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/admin/posts')
      .set(bearer(authorToken))
      .send(draftPayload({ slug: 'first-draft', title: '第一篇草稿' }))
      .expect(201);

    const created = response.body as PostRecord;
    expect(created.authorId).toBe(author.id);
    expect(created.status).toBe('draft');
    expect(created.publishedSeq).toBeNull();
    expect(created.publishedAt).toBeNull();
    expect(created.slug).toBe('first-draft');
  });

  it('创建草稿：请求体里自报 authorId 会被 422 拒绝（身份只认登录态）', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/admin/posts')
      .set(bearer(authorToken))
      .send({ ...draftPayload({ slug: 'forged-author' }), authorId: intruder.id })
      .expect(422);

    expect((response.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });

  it('slug 冲突返回 409 SLUG_TAKEN', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/admin/posts')
      .set(bearer(authorToken))
      .send(draftPayload({ slug: 'first-draft', title: '重复 slug' }))
      .expect(409);

    expect(response.body).toEqual({
      error: { code: 'SLUG_TAKEN', message: expect.any(String) },
    });
  });

  it('参数校验失败返回 422 且错误体是统一信封', async () => {
    const server = context.app.getHttpServer();

    const badSlug = await request(server)
      .post('/api/admin/posts')
      .set(bearer(authorToken))
      .send(draftPayload({ slug: 'Not A Slug' }))
      .expect(422);
    expect(badSlug.body).toEqual({
      error: { code: 'VALIDATION_FAILED', message: expect.stringContaining('slug') },
    });

    const emptyTitle = await request(server)
      .post('/api/admin/posts')
      .set(bearer(authorToken))
      .send(draftPayload({ slug: 'no-title', title: '' }))
      .expect(422);
    expect((emptyTitle.body as { error: { message: string } }).error.message).toContain('title');
  });

  it('发布：首次分配 published_seq 与 published_at，重复发布幂等', async () => {
    const server = context.app.getHttpServer();

    const created = (
      await request(server)
        .post('/api/admin/posts')
        .set(bearer(authorToken))
        .send(draftPayload({ slug: 'publish-me', title: '待发布' }))
        .expect(201)
    ).body as PostRecord;
    expect(created.publishedSeq).toBeNull();

    const published = (
      await request(server)
        .post('/api/admin/posts/publish-me/publish')
        .set(bearer(authorToken))
        .expect(200)
    ).body as PostRecord;

    expect(published.status).toBe('published');
    expect(published.publishedSeq).toBe(1);
    expect(published.publishedAt).not.toBeNull();

    // 幂等：再发布一次，编号与首次发布时间都不变
    const republished = (
      await request(server)
        .post('/api/admin/posts/publish-me/publish')
        .set(bearer(authorToken))
        .expect(200)
    ).body as PostRecord;

    expect(republished.publishedSeq).toBe(published.publishedSeq);
    expect(republished.publishedAt).toBe(published.publishedAt);
  });

  it('取消发布保留编号，再次发布编号与首次发布时间都不变', async () => {
    const server = context.app.getHttpServer();

    const firstPublish = (
      await request(server)
        .post('/api/admin/posts/publish-me/publish')
        .set(bearer(authorToken))
        .expect(200)
    ).body as PostRecord;

    const unpublished = (
      await request(server)
        .post('/api/admin/posts/publish-me/unpublish')
        .set(bearer(authorToken))
        .expect(200)
    ).body as PostRecord;
    expect(unpublished.status).toBe('draft');
    expect(unpublished.publishedSeq).toBe(firstPublish.publishedSeq);

    const secondPublish = (
      await request(server)
        .post('/api/admin/posts/publish-me/publish')
        .set(bearer(authorToken))
        .expect(200)
    ).body as PostRecord;
    expect(secondPublish.publishedSeq).toBe(firstPublish.publishedSeq);
    expect(secondPublish.publishedAt).toBe(firstPublish.publishedAt);
  });

  it('第二篇发布拿到递增序号（max(seq)+1）', async () => {
    const server = context.app.getHttpServer();

    await request(server)
      .post('/api/admin/posts')
      .set(bearer(authorToken))
      .send(draftPayload({ slug: 'second-post', title: '第二篇' }))
      .expect(201);

    const published = (
      await request(server)
        .post('/api/admin/posts/second-post/publish')
        .set(bearer(authorToken))
        .expect(200)
    ).body as PostRecord;

    expect(published.publishedSeq).toBe(2);
  });

  it('更新：expectedUpdatedAt 不匹配返回 409 STALE_WRITE（双开标签页不互相覆盖）', async () => {
    const server = context.app.getHttpServer();

    const created = (
      await request(server)
        .post('/api/admin/posts')
        .set(bearer(authorToken))
        .send(draftPayload({ slug: 'conflict-post', title: '会被并发编辑' }))
        .expect(201)
    ).body as PostRecord;

    // `posts.updated_at` 是 DATETIME（秒精度），若建稿与首次保存落在同一秒，
    // 首次保存不会推进 updated_at，旧版本号依旧"新鲜"。先等到下一个秒边界，
    // 保证首次保存写入的时间严格晚于 created.updatedAt。
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // 第一次保存：仍使用建稿时读到的版本（库里没变过，因此必然成功），成功后版本前进
    const firstSave = (
      await request(server)
        .put('/api/admin/posts/conflict-post')
        .set(bearer(authorToken))
        .send({
          ...draftPayload({ slug: 'conflict-post', title: '第一次保存' }),
          expectedUpdatedAt: created.updatedAt,
        })
        .expect(200)
    ).body as PostRecord;
    expect(firstSave.updatedAt).not.toBe(created.updatedAt);

    // 第二次保存：仍带着旧版本号（模拟另一个标签页）→ 拒绝
    const stale = await request(server)
      .put('/api/admin/posts/conflict-post')
      .set(bearer(authorToken))
      .send({
        ...draftPayload({ slug: 'conflict-post', title: '基于旧版本的覆盖' }),
        expectedUpdatedAt: created.updatedAt,
      })
      .expect(409);

    expect(stale.body).toEqual({
      error: { code: 'STALE_WRITE', message: expect.any(String) },
    });

    // 内容仍是第一次保存的版本
    const detail = (
      await request(server)
        .get('/api/admin/posts/conflict-post')
        .set(bearer(authorToken))
        .expect(200)
    ).body as AdminPostDetail;
    expect(detail.title).toBe('第一次保存');
  });

  it('归属校验：第二用户修改/发布/删除他人文章一律 403', async () => {
    const server = context.app.getHttpServer();

    await request(server)
      .post('/api/admin/posts')
      .set(bearer(authorToken))
      .send(draftPayload({ slug: 'owned-by-author', title: '作者的文章' }))
      .expect(201);

    const current = (
      await request(server)
        .get('/api/admin/posts/owned-by-author')
        .set(bearer(authorToken))
        .expect(200)
    ).body as AdminPostDetail;

    await request(server)
      .put('/api/admin/posts/owned-by-author')
      .set(bearer(intruderToken))
      .send({ ...draftPayload({ slug: 'owned-by-author' }), expectedUpdatedAt: current.updatedAt })
      .expect(403);

    await request(server)
      .post('/api/admin/posts/owned-by-author/publish')
      .set(bearer(intruderToken))
      .expect(403);

    await request(server)
      .post('/api/admin/posts/owned-by-author/unpublish')
      .set(bearer(intruderToken))
      .expect(403);

    await request(server)
      .delete('/api/admin/posts/owned-by-author')
      .set(bearer(intruderToken))
      .expect(403);

    // 作者本人不受影响
    await request(server)
      .get('/api/admin/posts/owned-by-author')
      .set(bearer(authorToken))
      .expect(200);
  });

  it('标签：创建、重名 409、改名、挂到文章、删除后关联清理', async () => {
    const server = context.app.getHttpServer();

    await request(server)
      .post('/api/admin/tags')
      .set(bearer(authorToken))
      .send({ name: 'Vue', slug: 'vue' })
      .expect(201);

    const duplicateName = await request(server)
      .post('/api/admin/tags')
      .set(bearer(authorToken))
      .send({ name: 'Vue', slug: 'vue-alias' })
      .expect(409);
    expect((duplicateName.body as { error: { code: string } }).error.code).toBe('CONFLICT');

    const duplicateSlug = await request(server)
      .post('/api/admin/tags')
      .set(bearer(authorToken))
      .send({ name: 'Vue Alias', slug: 'vue' })
      .expect(409);
    expect((duplicateSlug.body as { error: { code: string } }).error.code).toBe('CONFLICT');

    // 挂到文章上
    await request(server)
      .post('/api/admin/posts')
      .set(bearer(authorToken))
      .send(draftPayload({ slug: 'with-tags', title: '带标签的文章', tagSlugs: ['vue'] }))
      .expect(201);

    const list = (
      await request(server).get('/api/admin/posts').set(bearer(authorToken)).expect(200)
    ).body as Page<AdminPostListItem>;
    const tagged = list.items.find((item) => item.slug === 'with-tags');
    expect(tagged?.tags).toEqual([{ name: 'Vue', slug: 'vue' }]);

    // 未知标签 → 422
    const unknownTag = await request(server)
      .post('/api/admin/posts')
      .set(bearer(authorToken))
      .send(draftPayload({ slug: 'unknown-tag', tagSlugs: ['nope'] }))
      .expect(422);
    expect((unknownTag.body as { error: { message: string } }).error.message).toContain('nope');

    // 改名
    const renamed = (
      await request(server)
        .put('/api/admin/tags/vue')
        .set(bearer(authorToken))
        .send({ name: 'Vue 3', slug: 'vue3' })
        .expect(200)
    ).body as TagRef;
    expect(renamed).toEqual({ name: 'Vue 3', slug: 'vue3' });

    // 删除标签后，文章的标签关联被级联清理
    await request(server).delete('/api/admin/tags/vue3').set(bearer(authorToken)).expect(204);

    const tagsAfter = (await request(server).get('/api/admin/tags').set(bearer(authorToken)))
      .body as TagRef[];
    expect(tagsAfter).toEqual([]);

    const detail = (
      await request(server)
        .get('/api/admin/posts/with-tags')
        .set(bearer(authorToken))
        .expect(200)
    ).body as AdminPostDetail;
    expect(detail.tags).toEqual([]);
  });

  it('后台列表：含草稿、可按 status 过滤、total 正确', async () => {
    const server = context.app.getHttpServer();

    const all = (
      await request(server).get('/api/admin/posts').set(bearer(authorToken)).expect(200)
    ).body as Page<AdminPostListItem>;
    expect(all.total).toBeGreaterThanOrEqual(5);
    expect(all.items.some((item) => item.status === 'draft')).toBe(true);
    expect(all.items.some((item) => item.status === 'published')).toBe(true);
    // 列表项必须带 publishedSeq（草稿为 null）
    expect(all.items.every((item) => 'publishedSeq' in item)).toBe(true);

    const drafts = (
      await request(server)
        .get('/api/admin/posts?status=draft')
        .set(bearer(authorToken))
        .expect(200)
    ).body as Page<AdminPostListItem>;
    expect(drafts.items.every((item) => item.status === 'draft')).toBe(true);

    const firstPage = (
      await request(server)
        .get('/api/admin/posts?page=1&pageSize=2')
        .set(bearer(authorToken))
        .expect(200)
    ).body as Page<AdminPostListItem>;
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.pageSize).toBe(2);
  });

  it('硬删：204 之后后台与数据库都不再有这篇（post_tags 一并清理）', async () => {
    const server = context.app.getHttpServer();

    await request(server)
      .post('/api/admin/tags')
      .set(bearer(authorToken))
      .send({ name: '删除测试', slug: 'delete-me-tag' })
      .expect(201);

    const created = (
      await request(server)
        .post('/api/admin/posts')
        .set(bearer(authorToken))
        .send(draftPayload({ slug: 'to-delete', title: '待删除', tagSlugs: ['delete-me-tag'] }))
        .expect(201)
    ).body as PostRecord;

    await request(server)
      .delete('/api/admin/posts/to-delete')
      .set(bearer(authorToken))
      .expect(204);

    await request(server)
      .get('/api/admin/posts/to-delete')
      .set(bearer(authorToken))
      .expect(404);

    const remaining = (await context.dataSource.query(
      'SELECT COUNT(*) AS total FROM post_tags WHERE post_id = ?',
      [created.id],
    )) as Array<{ total: number | string }>;
    expect(Number(remaining[0]?.total ?? -1)).toBe(0);
  });
});
