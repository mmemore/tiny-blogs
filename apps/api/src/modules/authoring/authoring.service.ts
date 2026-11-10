import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type Repository } from 'typeorm';
import {
  POST_STATUS,
  type AdminPostDetail,
  type AdminPostListItem,
  type Page,
  type PostInput,
  type PostRecord,
  type PostStatus,
  type Principal,
  type TagInput,
  type TagRef,
} from '@tiny-blogs/shared';
import { ApiError } from '../../common/errors/api-error';
import { loadTagRefs, toIsoOrNull, toPostRecord } from '../content/post-mapping';
import { PostEntity } from '../content/entities/post.entity';
import { TagEntity } from '../content/entities/tag.entity';

/** 后台列表的查询条件（契约 §5「管理」）。 */
export interface AdminPostQuery {
  readonly status?: PostStatus;
  readonly q?: string;
  readonly page: number;
  readonly pageSize: number;
}

/** 发布序号竞争时的重试次数。 */
const PUBLISH_RETRY_LIMIT = 5;

/**
 * 写侧（契约 §4.3）。所有不变量都在这里：
 * - `create` 的 `author_id` 取自登录态，调用方无法指定；
 * - `update` 用 `expectedUpdatedAt` 做乐观锁，不匹配 → 409 `STALE_WRITE`；
 * - `publish` 幂等：已发布直接返回；首次发布才分配 `max(seq)+1` 与 `published_at`；
 * - `update/publish/unpublish/remove` 一律先校验归属，非作者 403。
 */
@Injectable()
export class AuthoringService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PostEntity) private readonly posts: Repository<PostEntity>,
    @InjectRepository(TagEntity) private readonly tags: Repository<TagEntity>,
  ) {}

  /**
   * 新建草稿。
   *
   * @param input 文章字段。
   * @param actor 当前登录者（作者）。
   * @returns 新记录。
   * @throws {ApiError} slug 冲突 → 409 `SLUG_TAKEN`；标签不存在 → 422。
   */
  async create(input: PostInput, actor: Principal): Promise<PostRecord> {
    return this.dataSource.transaction(async (manager) => {
      const tagIds = await this.resolveTagIds(manager, input.tagSlugs);
      const now = new Date();

      let postId: number;
      try {
        const inserted = (await manager.query(
          `INSERT INTO posts (author_id, title, slug, summary, content_md, status, published_seq, published_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
          [
            actor.id,
            input.title,
            input.slug,
            input.summary,
            input.contentMd,
            POST_STATUS.draft,
            now,
            now,
          ],
        )) as { insertId: number };
        postId = inserted.insertId;
      } catch (error) {
        throw this.translateWriteError(error, input.slug);
      }

      await this.replacePostTags(manager, postId, tagIds);
      const created = await this.loadPostOrFail(manager, input.slug);
      return this.record(created, await loadTagRefs(manager, [postId]));
    });
  }

  /**
   * 更新文章（乐观锁）。
   *
   * @param slug 当前 slug。
   * @param input 新字段（`input.slug` 与参数不同即视为改 slug）。
   * @param expectedUpdatedAt 客户端读到的 `updatedAt`。
   * @param actor 当前登录者。
   * @returns 更新后的记录。
   * @throws {ApiError} 404/403；`STALE_WRITE` 409；slug 冲突 409；标签不存在 422。
   */
  async update(
    slug: string,
    input: PostInput,
    expectedUpdatedAt: string,
    actor: Principal,
  ): Promise<PostRecord> {
    const expected = new Date(expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      throw ApiError.validationFailed('expectedUpdatedAt 必须是 ISO 8601 时间');
    }

    return this.dataSource.transaction(async (manager) => {
      const post = await this.loadPostOrFail(manager, slug);
      this.assertOwnership(post, actor);

      if (toSeconds(post.updatedAt) !== toSeconds(expected)) {
        throw ApiError.conflict(
          '这篇文章在你编辑期间已被更新，请刷新后再保存',
          'STALE_WRITE',
        );
      }

      const tagIds = await this.resolveTagIds(manager, input.tagSlugs);
      const now = new Date();

      try {
        await manager.query(
          `UPDATE posts SET title = ?, slug = ?, summary = ?, content_md = ?, updated_at = ? WHERE id = ?`,
          [input.title, input.slug, input.summary, input.contentMd, now, post.id],
        );
      } catch (error) {
        throw this.translateWriteError(error, input.slug);
      }

      await this.replacePostTags(manager, post.id, tagIds);
      const updated = await this.loadPostOrFail(manager, input.slug);
      return this.record(updated, await loadTagRefs(manager, [post.id]));
    });
  }

  /**
   * 发布。首次发布分配序号与发布时间，重复发布幂等。
   *
   * 并发安全：行级写锁 + `max(seq)+1` + `published_seq` 唯一索引，冲突时重试整个事务。
   *
   * @param slug 文章 slug。
   * @param actor 当前登录者。
   * @returns 发布后的记录。
   */
  async publish(slug: string, actor: Principal): Promise<PostRecord> {
    for (let attempt = 1; attempt <= PUBLISH_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.dataSource.transaction(async (manager) => {
          const post = await manager.getRepository(PostEntity).findOne({
            where: { slug },
            lock: { mode: 'pessimistic_write' },
          });
          if (post === null) {
            throw ApiError.notFound('文章不存在');
          }
          this.assertOwnership(post, actor);

          if (post.status === POST_STATUS.published) {
            // 幂等：已发布不再改动任何字段（编号与首次发布时间都不变）。
            return this.record(post, await loadTagRefs(manager, [post.id]));
          }

          const now = new Date();
          const publishedSeq =
            post.publishedSeq ?? (await this.nextPublishedSeq(manager));

          await manager.query(
            `UPDATE posts SET status = ?, published_seq = ?, published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?`,
            [POST_STATUS.published, publishedSeq, now, now, post.id],
          );

          const published = await this.loadPostOrFail(manager, slug);
          return this.record(published, await loadTagRefs(manager, [post.id]));
        });
      } catch (error) {
        // 两个并发发布同时算出了同一个序号：唯一索引会挡住，重算重试。
        if (isDuplicateEntry(error) && attempt < PUBLISH_RETRY_LIMIT) {
          continue;
        }
        throw error;
      }
    }

    throw ApiError.conflict('发布序号竞争激烈，请稍后重试');
  }

  /**
   * 取消发布。保留 `published_seq` 与 `published_at`（编号永不位移）。
   *
   * @param slug 文章 slug。
   * @param actor 当前登录者。
   * @returns 取消发布后的记录。
   */
  async unpublish(slug: string, actor: Principal): Promise<PostRecord> {
    return this.dataSource.transaction(async (manager) => {
      const post = await this.loadPostOrFail(manager, slug);
      this.assertOwnership(post, actor);

      if (post.status === POST_STATUS.draft) {
        return this.record(post, await loadTagRefs(manager, [post.id]));
      }

      await manager.query(`UPDATE posts SET status = ?, updated_at = ? WHERE id = ?`, [
        POST_STATUS.draft,
        new Date(),
        post.id,
      ]);

      const updated = await this.loadPostOrFail(manager, slug);
      return this.record(updated, await loadTagRefs(manager, [post.id]));
    });
  }

  /**
   * 硬删（个人博客无需软删，数据可从导出恢复）。`post_tags` 由外键级联清理。
   *
   * @param slug 文章 slug。
   * @param actor 当前登录者。
   */
  async remove(slug: string, actor: Principal): Promise<void> {
    const post = await this.posts.findOne({ where: { slug } });
    if (post === null) {
      throw ApiError.notFound('文章不存在');
    }
    this.assertOwnership(post, actor);
    await this.posts.delete({ id: post.id });
  }

  /**
   * 后台列表（含草稿）。
   *
   * @param query 过滤与分页。
   * @returns 分页结果。
   */
  async list(query: AdminPostQuery): Promise<Page<AdminPostListItem>> {
    const qb = this.posts.createQueryBuilder('post');

    if (query.status !== undefined) {
      qb.andWhere('post.status = :status', { status: query.status });
    }
    if (query.q !== undefined && query.q.trim() !== '') {
      qb.andWhere('(post.title LIKE :like OR post.slug LIKE :like)', {
        like: `%${query.q.trim()}%`,
      });
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy('post.updated_at', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getMany();

    const tagMap = await loadTagRefs(this.dataSource.manager, rows.map((row) => row.id));

    return {
      items: rows.map((row) => this.toAdminListItem(row, tagMap)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /**
   * 后台编辑视图（含 Markdown 原文）。
   *
   * @param slug 文章 slug。
   * @returns 详情或 `null`。
   */
  async findForEdit(slug: string): Promise<AdminPostDetail | null> {
    const post = await this.posts.findOne({ where: { slug } });
    if (post === null) {
      return null;
    }
    const tagMap = await loadTagRefs(this.dataSource.manager, [post.id]);
    return {
      ...this.toAdminListItem(post, tagMap),
      contentMd: post.contentMd,
    };
  }

  /**
   * 标签列表（含未被使用的标签，后台需要管理它们）。
   *
   * @returns 按名称排序的标签。
   */
  async listTags(): Promise<readonly TagRef[]> {
    const rows = await this.tags.find({ order: { name: 'ASC' } });
    return rows.map((row) => ({ name: row.name, slug: row.slug }));
  }

  /**
   * 新建标签。
   *
   * @param input 名称与 slug。
   * @returns 新标签。
   * @throws {ApiError} 重名/重 slug → 409。
   */
  async createTag(input: TagInput): Promise<TagRef> {
    try {
      await this.tags.insert({
        name: input.name,
        slug: input.slug,
        createdAt: new Date(),
      });
    } catch (error) {
      throw this.translateTagError(error, input);
    }
    return { name: input.name, slug: input.slug };
  }

  /**
   * 改标签（名称与 slug 都可改）。
   *
   * @param slug 当前 slug。
   * @param input 新名称与新 slug。
   * @returns 更新后的标签。
   */
  async updateTag(slug: string, input: TagInput): Promise<TagRef> {
    const existing = await this.tags.findOne({ where: { slug } });
    if (existing === null) {
      throw ApiError.notFound('标签不存在');
    }

    try {
      await this.tags.update({ id: existing.id }, { name: input.name, slug: input.slug });
    } catch (error) {
      throw this.translateTagError(error, input);
    }

    return { name: input.name, slug: input.slug };
  }

  /**
   * 删除标签（`post_tags` 由外键级联清理，文章本身不受影响）。
   *
   * @param slug 标签 slug。
   */
  async removeTag(slug: string): Promise<void> {
    const existing = await this.tags.findOne({ where: { slug } });
    if (existing === null) {
      throw ApiError.notFound('标签不存在');
    }
    await this.tags.delete({ id: existing.id });
  }

  /**
   * 取下一个发布序号。
   *
   * @param manager 事务管理器。
   * @returns `max(published_seq) + 1`。
   */
  private async nextPublishedSeq(manager: EntityManager): Promise<number> {
    const rows = (await manager.query(
      'SELECT COALESCE(MAX(published_seq), 0) AS maxSeq FROM posts',
    )) as Array<{ maxSeq: number | string | null }>;
    const maxSeq = rows[0]?.maxSeq ?? 0;
    return Number(maxSeq) + 1;
  }

  /**
   * 按 slug 读取文章，不存在即 404。
   *
   * @param manager 事务管理器。
   * @param slug 文章 slug。
   * @returns 文章实体。
   */
  private async loadPostOrFail(manager: EntityManager, slug: string): Promise<PostEntity> {
    const post = await manager.getRepository(PostEntity).findOne({ where: { slug } });
    if (post === null) {
      throw ApiError.notFound('文章不存在');
    }
    return post;
  }

  /**
   * 归属校验：非作者一律 403（v1 单管理员也要有，防止多作者上线才暴露）。
   *
   * @param post 目标文章。
   * @param actor 当前登录者。
   */
  private assertOwnership(post: PostEntity, actor: Principal): void {
    if (post.authorId !== actor.id) {
      throw ApiError.forbidden('只能操作自己的文章');
    }
  }

  /**
   * 把标签 slug 解析成 id，未知 slug 直接 422（不静默丢弃）。
   *
   * @param manager 事务管理器。
   * @param slugs 标签 slug 列表。
   * @returns 标签 id 列表（去重）。
   */
  private async resolveTagIds(
    manager: EntityManager,
    slugs: readonly string[],
  ): Promise<readonly number[]> {
    const unique = [...new Set(slugs)];
    if (unique.length === 0) {
      return [];
    }

    const found = await manager.getRepository(TagEntity).find({
      where: unique.map((slug) => ({ slug })),
      select: { id: true, slug: true },
    });
    const foundSlugs = new Set(found.map((tag) => tag.slug));
    const missing = unique.filter((slug) => !foundSlugs.has(slug));
    if (missing.length > 0) {
      throw ApiError.validationFailed(`标签不存在：${missing.join(', ')}`);
    }

    return found.map((tag) => tag.id);
  }

  /**
   * 用给定标签集合整体替换文章的标签关联。
   *
   * @param manager 事务管理器。
   * @param postId 文章 id。
   * @param tagIds 目标标签 id 集合。
   */
  private async replacePostTags(
    manager: EntityManager,
    postId: number,
    tagIds: readonly number[],
  ): Promise<void> {
    const existingRows = (await manager.query('SELECT tag_id FROM post_tags WHERE post_id = ?', [
      postId,
    ])) as Array<{ tag_id: number }>;
    const existing = new Set(existingRows.map((row) => Number(row.tag_id)));
    const target = new Set(tagIds.map(Number));

    for (const tagId of existing) {
      if (!target.has(tagId)) {
        await manager.query('DELETE FROM post_tags WHERE post_id = ? AND tag_id = ?', [postId, tagId]);
      }
    }
    for (const tagId of target) {
      if (!existing.has(tagId)) {
        await manager.query('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)', [postId, tagId]);
      }
    }
  }

  /**
   * 实体 → 领域记录（标签从批量读取的映射里取）。
   *
   * 投影本身在 `content/post-mapping` 里，读侧写侧共用同一份，避免两处时间格式分叉。
   *
   * @param post 文章实体。
   * @param tagMap 标签映射。
   * @returns `PostRecord`（时间为 ISO 字符串）。
   */
  private record(post: PostEntity, tagMap: Map<number, TagRef[]>): PostRecord {
    return toPostRecord(post, tagMap.get(post.id) ?? []);
  }

  /**
   * 实体 → 后台列表项。
   *
   * @param post 文章实体。
   * @param tagMap 标签映射。
   * @returns 列表项。
   */
  private toAdminListItem(post: PostEntity, tagMap: Map<number, TagRef[]>): AdminPostListItem {
    return {
      slug: post.slug,
      title: post.title,
      summary: post.summary,
      status: post.status,
      authorId: post.authorId,
      publishedSeq: post.publishedSeq,
      publishedAt: toIsoOrNull(post.publishedAt),
      updatedAt: post.updatedAt.toISOString(),
      tags: tagMap.get(post.id) ?? [],
    };
  }

  /**
   * 把唯一键冲突翻译成 409 `SLUG_TAKEN`，其余原样抛出。
   *
   * @param error 捕获到的异常。
   * @param slug 触发冲突的 slug。
   * @returns 规范化后的异常。
   */
  private translateWriteError(error: unknown, slug: string): unknown {
    if (isDuplicateEntry(error)) {
      return ApiError.conflict(`slug 已被占用：${slug}`, 'SLUG_TAKEN');
    }
    return error;
  }

  /**
   * 把标签的唯一键冲突翻译成 409。
   *
   * @param error 捕获到的异常。
   * @param input 触发的标签入参。
   * @returns 规范化后的异常。
   */
  private translateTagError(error: unknown, input: TagInput): unknown {
    if (isDuplicateEntry(error)) {
      return ApiError.conflict(`标签重名或 slug 已被占用：${input.name} / ${input.slug}`);
    }
    return error;
  }
}

/**
 * 取整到秒（数据库 `datetime` 只有秒精度，比较时必须对齐）。
 *
 * @param value 时间。
 * @returns 秒级时间戳。
 */
function toSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1000);
}

/**
 * 判断是否为 MySQL 唯一键冲突（`ER_DUP_ENTRY`）。
 *
 * @param error 捕获到的异常。
 * @returns 命中重复键返回 true。
 */
function isDuplicateEntry(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY'
  );
}
