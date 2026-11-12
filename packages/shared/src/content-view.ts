/**
 * 公开读侧的类型与投影函数（契约 §3、§4.1、§5）。
 *
 * 三个派生值——`track`（曲目号）、`readingMinutes`（时长）、`headings`（目录）——
 * 只在这里实现一次。数据库不存它们，前台不自己算，导出快照与线上接口因此不可能不一致。
 */
import type { PostRecord, TagRef } from './content';
import { estimateReadingMinutes, renderMarkdown, type Heading } from './markdown';

/** 彩胶配色（契约 §3：橘 / 蓝 / 绿 / 莓红，四色一圈轮下去）。 */
export type Accent = 'v1' | 'v2' | 'v3' | 'v4';

/** 曲目号：面、编号、目录号与配色，全部由 `published_seq` 派生。 */
export interface Track {
  /** 形如 `A1`…`B4`：面字母 + 面内序号。 */
  readonly no: string;
  /** 面字母：每 4 篇换一个（A、B、C…）。 */
  readonly side: string;
  /** 形如 `TB—001`：三位补零的稳定编号。 */
  readonly catalog: string;
  /** 配色标识，前端映射成 CSS 变量。 */
  readonly accent: Accent;
}

/** 指向一篇文章的最小信息（列表项、上下篇、归档、导出都用它）。 */
export interface PostRef {
  readonly slug: string;
  readonly title: string;
  readonly track: Track;
}

/** 列表项（契约 §5 `PostSummary`）：不含正文，也不含 `contentMd`。 */
export interface PostSummary {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
  readonly readingMinutes: number;
  readonly track: Track;
  readonly tags: readonly TagRef[];
}

/** 详情（契约 §5 `PostDetail`）：HTML + 目录 + 上下篇，**不含** `contentMd`。 */
export interface PostDetail extends PostSummary {
  readonly html: string;
  readonly headings: readonly Heading[];
  /** 更早发布的一篇；没有则 `null`。 */
  readonly prev: PostRef | null;
  /** 更晚发布的一篇；没有则 `null`。 */
  readonly next: PostRef | null;
}

/** 标签 + 已发布文章数（契约 §5 `TagWithCount`）。 */
export interface TagWithCount extends TagRef {
  readonly count: number;
}

/** 归档里的一年。`count` 是该年已发布文章总数。 */
export interface ArchiveYear {
  readonly year: number;
  readonly count: number;
  /** 月份倒序；组内文章按 `published_seq` 降序（契约 §3）。 */
  readonly months: readonly ArchiveMonth[];
}

/** 归档里的一个月。 */
export interface ArchiveMonth {
  readonly month: number;
  readonly posts: readonly PostRef[];
}

/** 站点元信息（`ContentSnapshot.site`，构建期写进 `<head>` 与 OG 标签）。 */
export interface SiteMeta {
  readonly title: string;
  readonly description: string;
  readonly author: string;
  readonly ogImage: string;
}

/** 构建/备份快照（契约 §5 `ContentSnapshot`）。 */
export interface ContentSnapshot {
  readonly version: 1;
  readonly generatedAt: string;
  readonly site: SiteMeta;
  /** 快照里的文章**带** `contentMd`：构建期要拿原文渲染与建索引。 */
  readonly posts: readonly (PostDetail & { readonly contentMd: string })[];
  readonly tags: readonly TagWithCount[];
  readonly archive: readonly ArchiveYear[];
}

/** 列表查询条件（契约 §5 `GET /api/posts`）。 */
export interface ListQuery {
  readonly page: number;
  readonly pageSize: number;
  /** 标签 slug。 */
  readonly tag?: string;
  /** 全文检索关键词。 */
  readonly q?: string;
  readonly year?: number;
  readonly month?: number;
}

/** 列表默认每页条数（契约 §5）。 */
export const DEFAULT_PAGE_SIZE = 8;

/** 列表每页上限（契约 §5：`pageSize ≤ 24`）。 */
export const MAX_PAGE_SIZE = 24;

/**
 * 后台列表默认每页条数。
 *
 * 与公开列表的 8 不同：读者是"一页看完一段"，编辑是"扫一遍找那篇"，
 * 所以后台一屏放 20 条；上限仍是后端的 100（见 `AdminPostQueryDto`）。
 */
export const DEFAULT_ADMIN_PAGE_SIZE = 20;

/**
 * 站点默认元信息。
 *
 * v1 只有一个站点，不引配置项；后续接入 `SITE_*` 环境变量时
 * 只需把这里换成从 `ApiEnv` 读取，投影函数与快照形状不受影响。
 */
export const DEFAULT_SITE_META: SiteMeta = {
  title: 'Tiny Blogs',
  description: '一个自带写作后台的个人博客：Vue 3 预渲染前台 + NestJS API + MySQL。',
  author: 'Tiny Blogs',
  ogImage: '/og-default.png',
};

/** 一首"面"（side）容纳的曲目数（契约 §3：每 4 篇换一个字母）。 */
const TRACKS_PER_SIDE = 4;

/** 面的字母表上限：A–Z，即 104 篇；超出后曲目号会越过 `Z`，故显式拒绝。 */
const MAX_SIDES = 26;

/**
 * 配色轮换。用 `switch` 而不是数组下标，是因为 `noUncheckedIndexedAccess` 下
 * 下标访问的结果是 `Accent | undefined`，`switch` 能拿到真正的封闭联合。
 *
 * @param offset `(seq - 1) % 4`。
 * @returns 对应配色。
 */
function accentAt(offset: number): Accent {
  switch (offset) {
    case 1:
      return 'v2';
    case 2:
      return 'v3';
    case 3:
      return 'v4';
    default:
      return 'v1';
  }
}

/**
 * 由发布序号派生曲目号（契约 §3）。
 *
 * 规则：`side = A + floor((seq-1)/4)`（每 4 篇换一个字母），`no = side + ((seq-1)%4 + 1)`，
 * `catalog = 'TB—' + 三位补零 seq`，`accent` 四色轮转。
 *
 * @param seq 发布序号（1 起）。
 * @returns 曲目号。
 * @throws {RangeError} 序号不是正整数，或超出 `A`–`Z` 共 104 篇的容量。
 */
export function toTrack(seq: number): Track {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new RangeError(`toTrack() 只接受 >= 1 的整数序号，收到 ${String(seq)}`);
  }

  const offset = seq - 1;
  const sideIndex = Math.floor(offset / TRACKS_PER_SIDE);
  if (sideIndex >= MAX_SIDES) {
    throw new RangeError(`发布序号 ${String(seq)} 超出曲目号容量（最多 ${String(MAX_SIDES * TRACKS_PER_SIDE)} 篇）`);
  }

  const side = String.fromCharCode('A'.charCodeAt(0) + sideIndex);
  return {
    no: `${side}${String((offset % TRACKS_PER_SIDE) + 1)}`,
    side,
    catalog: `TB\u2014${String(seq).padStart(3, '0')}`,
    accent: accentAt(offset % TRACKS_PER_SIDE),
  };
}

/**
 * 取记录里的发布序号；未发布时抛错。
 *
 * `toPostSummary` / `toPostRef` 只服务于公开面，公开面在模块内部已保证
 * "只有 published"，所以拿到 `null` 说明调用方用错了——早失败好过返回假编号。
 *
 * @param post 文章记录。
 * @returns 发布序号。
 */
function requirePublishedSeq(post: PostRecord): number {
  if (post.publishedSeq === null) {
    throw new Error(`文章 ${post.slug} 尚未发布，不能投影为公开视图`);
  }
  return post.publishedSeq;
}

/**
 * 记录 → 列表项，阅读时长由调用方传入（详情页已经渲染过一次，不必重复解析）。
 *
 * @param post 文章记录。
 * @param readingMinutes 已算好的阅读时长。
 * @returns 列表项。
 */
function toSummaryWith(post: PostRecord, readingMinutes: number): PostSummary {
  return {
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    readingMinutes,
    track: toTrack(requirePublishedSeq(post)),
    // 只暴露契约规定的两个字段，实体的其它列不泄漏到公开面。
    tags: (post.tags ?? []).map((tag) => ({ name: tag.name, slug: tag.slug })),
  };
}

/**
 * 记录 → 列表项（契约 §4.1 `toPostSummary`）。不含 `contentMd`，也不含 `html`。
 *
 * @param post 文章记录（必须已发布）。
 * @returns 列表项。
 */
export function toPostSummary(post: PostRecord): PostSummary {
  return toSummaryWith(post, estimateReadingMinutes(post.contentMd));
}

/**
 * 记录 → 最小引用（上下篇、归档、导出共用）。
 *
 * @param post 文章记录（必须已发布）。
 * @returns 引用。
 */
export function toPostRef(post: PostRecord): PostRef {
  return {
    slug: post.slug,
    title: post.title,
    track: toTrack(requirePublishedSeq(post)),
  };
}

/**
 * 记录 → 详情（契约 §4.1 `toPostDetail`）。
 *
 * @param post 文章记录（必须已发布）。
 * @param prev 更早的一篇，没有传 `null`。
 * @param next 更晚的一篇，没有传 `null`。
 * @returns 详情：列表项字段 + `html` + `headings` + `prev` + `next`。
 */
export function toPostDetail(
  post: PostRecord,
  prev: PostRef | null = null,
  next: PostRef | null = null,
): PostDetail {
  const rendered = renderMarkdown(post.contentMd);
  return {
    // 正文只解析一次：HTML、目录、时长来自同一次渲染。
    ...toSummaryWith(post, rendered.readingMinutes),
    html: rendered.html,
    headings: rendered.headings,
    prev,
    next,
  };
}
