import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type Repository, type SelectQueryBuilder } from 'typeorm';
import {
  DEFAULT_SITE_META,
  MAX_PAGE_SIZE,
  POST_STATUS,
  toPostDetail,
  toPostRef,
  toPostSummary,
  type ArchiveMonth,
  type ArchiveYear,
  type ContentSnapshot,
  type ListQuery,
  type Page,
  type PostDetail,
  type PostRef,
  type PostSummary,
  type TagWithCount,
} from '@tiny-blogs/shared';
import { PostEntity } from './entities/post.entity';
import type { ContentQuery } from './content-query';
import { loadTagRefs, toPostRecord } from './post-mapping';

/** 归档分组时用到的中间结构：`PostRef` 本身不含序号，排序要额外记住它。 */
interface ArchivedRef {
  readonly seq: number;
  readonly ref: PostRef;
}

/** 相邻篇文章的方向：`older` 更早、`newer` 更晚。 */
type NeighbourDirection = 'older' | 'newer';

/**
 * 公开读侧（契约 §4.2）。所有不变量都在这个类里，调用方只管拿结果：
 *
 * - **只返回已发布**：每个查询都从 `publishedPosts()` 出发，`status` 条件不可能漏加；
 * - **草稿与不存在等价**：`findPublished` 对两者都返回 `null`，HTTP 层统一 404；
 * - **排序恒定**：`published_at DESC, published_seq DESC`，分页因此稳定，
 *   预渲染与运行时看到的顺序一致；
 * - 派生值（`track` / `readingMinutes` / `headings`）全部来自 shared 的同一份实现。
 */
@Injectable()
export class ContentService implements ContentQuery {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PostEntity) private readonly posts: Repository<PostEntity>,
  ) {}

  /**
   * 已发布文章列表（契约 §5 `GET /api/posts`）。
   *
   * @param query 分页与过滤条件。
   * @returns 分页结果。
   */
  async listPublished(query: ListQuery): Promise<Page<PostSummary>> {
    const page = Math.max(1, Math.trunc(query.page));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(query.pageSize)));

    const builder = this.publishedPosts();

    if (query.tag !== undefined && query.tag !== '') {
      // 用 EXISTS 而不是 JOIN：一篇多标签的文章不会在结果里出现两遍，`getCount()` 也不用去重。
      builder.andWhere(
        `EXISTS (
           SELECT 1 FROM post_tags pt
           INNER JOIN tags tag ON tag.id = pt.tag_id
           WHERE pt.post_id = post.id AND \`tag\`.\`slug\` = :tagSlug
         )`,
        { tagSlug: query.tag },
      );
    }

    if (query.q !== undefined && query.q.trim() !== '') {
      // ngram 全文索引（迁移里带 `WITH PARSER ngram`）；自然语言模式对中文 2 字以上关键词即命中，
      // 且不会把用户输入当作 +、-、* 之类的布尔运算符来解释。
      builder.andWhere(
        'MATCH(`post`.`title`, `post`.`summary`, `post`.`content_md`) AGAINST (:keyword IN NATURAL LANGUAGE MODE)',
        { keyword: query.q.trim() },
      );
    }

    this.applyDateFilter(builder, query);

    const total = await builder.getCount();
    const rows = await builder
      .orderBy('post.publishedAt', 'DESC')
      .addOrderBy('post.publishedSeq', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const tagMap = await loadTagRefs(
      this.dataSource.manager,
      rows.map((row) => row.id),
    );

    return {
      items: rows.map((row) => toPostSummary(toPostRecord(row, tagMap.get(row.id) ?? []))),
      page,
      pageSize,
      total,
    };
  }

  /**
   * 已发布文章详情（契约 §5 `GET /api/posts/:slug`）。
   *
   * @param slug 文章 slug。
   * @returns 详情；草稿与不存在都返回 `null`。
   */
  async findPublished(slug: string): Promise<PostDetail | null> {
    const post = await this.publishedPosts()
      .andWhere('`post`.`slug` = :slug', { slug })
      .getOne();
    if (post === null) {
      return null;
    }

    const [tagMap, prev, next] = await Promise.all([
      loadTagRefs(this.dataSource.manager, [post.id]),
      this.findNeighbour(post, 'older'),
      this.findNeighbour(post, 'newer'),
    ]);

    return toPostDetail(toPostRecord(post, tagMap.get(post.id) ?? []), prev, next);
  }

  /**
   * 标签 + 已发布文章数（契约 §5 `GET /api/tags`）。
   *
   * 只有至少挂了一篇已发布文章的标签才会出现——公开面上"0 篇的标签"没有意义，
   * 后台管理需要的全量标签在 `AuthoringService.listTags()` 里。
   *
   * @returns 按文章数降序、名称升序的标签列表。
   */
  async listTags(): Promise<TagWithCount[]> {
    const rows = (await this.dataSource.query(
      `SELECT tag.name AS name, tag.slug AS slug, COUNT(*) AS postsCount
         FROM tags tag
         INNER JOIN post_tags pt ON pt.tag_id = tag.id
         INNER JOIN posts post ON post.id = pt.post_id AND post.status = ?
        GROUP BY tag.id, tag.name, tag.slug
        ORDER BY postsCount DESC, tag.name ASC`,
      [POST_STATUS.published],
    )) as Array<{ name: string; slug: string; postsCount: number | string }>;

    return rows.map((row) => ({ name: row.name, slug: row.slug, count: Number(row.postsCount) }));
  }

  /**
   * 年月归档（契约 §5 `GET /api/archives`）。
   *
   * @returns 年份倒序、月份倒序，组内按发布序号降序。
   */
  async getArchive(): Promise<ArchiveYear[]> {
    return this.buildArchive(await this.loadOrderedPublished());
  }

  /**
   * 构建/备份快照（契约 §5 `ContentSnapshot`）。
   *
   * 与公开接口共用 `toPostDetail` / `toPostSummary` / `buildArchive`，
   * 因此"构建时写进 HTML 的数据"与"线上接口返回的数据"字段完全一致。
   *
   * 上下篇取自同一份有序列表的相邻元素，不再逐篇查库（N 篇 = 1 次查询）。
   *
   * @returns 全量快照。
   */
  async exportSnapshot(): Promise<ContentSnapshot> {
    const ordered = await this.loadOrderedPublished();
    const tagMap = await loadTagRefs(
      this.dataSource.manager,
      ordered.map((post) => post.id),
    );
    const records = ordered.map((post) => toPostRecord(post, tagMap.get(post.id) ?? []));

    const posts = records.map((record, index) => {
      const older = records[index + 1];
      const newer = records[index - 1];
      const detail = toPostDetail(
        record,
        older === undefined ? null : toPostRef(older),
        newer === undefined ? null : toPostRef(newer),
      );
      // 快照额外带上原文：构建期要渲染与建搜索索引，这正是它与公开详情的唯一差别。
      return { ...detail, contentMd: record.contentMd };
    });

    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      site: DEFAULT_SITE_META,
      posts,
      tags: await this.listTags(),
      archive: this.buildArchive(ordered),
    };
  }

  /**
   * 已发布的查询起点。**所有**读侧查询都从这里出发，`status` 条件不可能漏加。
   *
   * @returns 带 `status = 'published'` 条件的 QueryBuilder。
   */
  private publishedPosts(): SelectQueryBuilder<PostEntity> {
    return this.posts
      .createQueryBuilder('post')
      .where('`post`.`status` = :published', { published: POST_STATUS.published });
  }

  /**
   * 追加 year / month 过滤。
   *
   * 有 year 时用半开区间（`>= from AND < to`），这样能走 `INDEX(status, published_at)`；
   * 只有 month 没有 year 时退化成 `MONTH()` 函数过滤（跨年份看某个月，v1 极少用到）。
   *
   * @param builder 查询构造器。
   * @param query 过滤条件。
   */
  private applyDateFilter(builder: SelectQueryBuilder<PostEntity>, query: ListQuery): void {
    if (query.year !== undefined) {
      const month = query.month ?? 1;
      const from = new Date(Date.UTC(query.year, month - 1, 1, 0, 0, 0));
      const to =
        query.month === undefined
          ? new Date(Date.UTC(query.year + 1, 0, 1, 0, 0, 0))
          : new Date(Date.UTC(query.year, month, 1, 0, 0, 0));

      builder.andWhere('`post`.`published_at` >= :from AND `post`.`published_at` < :to', {
        from: toMysqlDateTime(from),
        to: toMysqlDateTime(to),
      });
      return;
    }

    if (query.month !== undefined) {
      builder.andWhere('MONTH(`post`.`published_at`) = :month', { month: query.month });
    }
  }

  /**
   * 按恒定顺序读取全部已发布文章。
   *
   * @returns 已发布文章实体，`published_at DESC, published_seq DESC`。
   */
  private async loadOrderedPublished(): Promise<PostEntity[]> {
    return this.publishedPosts()
      .orderBy('post.publishedAt', 'DESC')
      .addOrderBy('post.publishedSeq', 'DESC')
      .getMany();
  }

  /**
   * 找相邻的一篇。
   *
   * 用 `(published_at, published_seq)` 元组比较，而不是只看时间：同一秒发布的两篇
   * 也能靠序号排定先后，不会出现"两篇互为上一篇"。
   *
   * @param post 当前文章。
   * @param direction `older` 找更早的一篇，`newer` 找更晚的一篇。
   * @returns 相邻文章引用，没有则 `null`。
   */
  private async findNeighbour(
    post: PostEntity,
    direction: NeighbourDirection,
  ): Promise<PostRef | null> {
    if (post.publishedAt === null || post.publishedSeq === null) {
      return null;
    }

    const at = toMysqlDateTime(post.publishedAt);
    const builder = this.publishedPosts();

    if (direction === 'older') {
      builder
        .andWhere(
          '(`post`.`published_at` < :at OR (`post`.`published_at` = :at AND `post`.`published_seq` < :seq))',
          { at, seq: post.publishedSeq },
        )
        .orderBy('post.publishedAt', 'DESC')
        .addOrderBy('post.publishedSeq', 'DESC');
    } else {
      builder
        .andWhere(
          '(`post`.`published_at` > :at OR (`post`.`published_at` = :at AND `post`.`published_seq` > :seq))',
          { at, seq: post.publishedSeq },
        )
        .orderBy('post.publishedAt', 'ASC')
        .addOrderBy('post.publishedSeq', 'ASC');
    }

    const neighbour = await builder.limit(1).getOne();
    return neighbour === null ? null : toPostRef(toPostRecord(neighbour));
  }

  /**
   * 把已发布文章按 年 → 月 分组（契约 §3 `archive`）。
   *
   * @param posts 已发布文章实体（任意顺序，这里负责排序）。
   * @returns 年份倒序、月份倒序，组内按序号降序。
   */
  private buildArchive(posts: readonly PostEntity[]): ArchiveYear[] {
    const years = new Map<number, Map<number, ArchivedRef[]>>();

    for (const post of posts) {
      if (post.publishedAt === null || post.publishedSeq === null) {
        // 已发布文章理论上两者都有；真出现脏数据时宁可不进归档，也不要编个假编号。
        continue;
      }

      const year = post.publishedAt.getUTCFullYear();
      const month = post.publishedAt.getUTCMonth() + 1;
      const months = years.get(year) ?? new Map<number, ArchivedRef[]>();
      const bucket = months.get(month) ?? [];
      bucket.push({ seq: post.publishedSeq, ref: toPostRef(toPostRecord(post)) });
      months.set(month, bucket);
      years.set(year, months);
    }

    return [...years.entries()]
      .sort((left, right) => right[0] - left[0])
      .map(([year, months]) => {
        const monthList: ArchiveMonth[] = [...months.entries()]
          .sort((left, right) => right[0] - left[0])
          .map(([month, bucket]) => ({
            month,
            posts: [...bucket].sort((left, right) => right.seq - left.seq).map((item) => item.ref),
          }));

        const count = monthList.reduce((sum, item) => sum + item.posts.length, 0);
        return { year, count, months: monthList };
      });
  }
}

/**
 * 把 UTC 时间格式化成 MySQL `DATETIME` 字面量。
 *
 * 连接配置了 `timezone: 'Z'`，库里的 `DATETIME` 一律按 UTC 存取，
 * 所以这里必须用 `getUTC*`，否则区间过滤会整体偏移一个时区。
 *
 * @param date 时间。
 * @returns 形如 `2026-11-01 00:00:00` 的字符串。
 */
function toMysqlDateTime(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${String(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}
