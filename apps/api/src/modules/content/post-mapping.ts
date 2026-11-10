/**
 * 文章实体 → 领域记录的投影，以及标签的批量读取。
 *
 * 写侧（`authoring`）与读侧（`content`）都用这一份实现：
 * 否则"后台看到的时间格式"与"前台看到的时间格式"迟早会分叉。
 */
import type { EntityManager } from 'typeorm';
import type { PostRecord, TagRef } from '@tiny-blogs/shared';
import type { PostEntity } from './entities/post.entity';

/**
 * 批量读取文章标签。
 *
 * @param manager 事务管理器或全局管理器。
 * @param postIds 文章 id 列表。
 * @returns `postId → 标签列表`（按名称升序）；无标签的文章不在 map 里。
 */
export async function loadTagRefs(
  manager: EntityManager,
  postIds: readonly number[],
): Promise<Map<number, TagRef[]>> {
  const result = new Map<number, TagRef[]>();
  if (postIds.length === 0) {
    return result;
  }

  const rows = await manager
    .createQueryBuilder()
    .select('pt.post_id', 'postId')
    .addSelect('t.name', 'name')
    .addSelect('t.slug', 'slug')
    .from('post_tags', 'pt')
    .innerJoin('tags', 't', 't.id = pt.tag_id')
    .where('pt.post_id IN (:...postIds)', { postIds: [...postIds] })
    .orderBy('t.name', 'ASC')
    .getRawMany<{ postId: number | string; name: string; slug: string }>();

  for (const row of rows) {
    const postId = Number(row.postId);
    const list = result.get(postId) ?? [];
    list.push({ name: row.name, slug: row.slug });
    result.set(postId, list);
  }

  return result;
}

/**
 * 实体 → 领域记录（时间为 ISO 字符串）。
 *
 * @param post 文章实体。
 * @param tags 该文章的标签，缺省为空。
 * @returns `PostRecord`。
 */
export function toPostRecord(post: PostEntity, tags: readonly TagRef[] = []): PostRecord {
  return {
    id: post.id,
    authorId: post.authorId,
    title: post.title,
    slug: post.slug,
    summary: post.summary,
    contentMd: post.contentMd,
    status: post.status,
    publishedSeq: post.publishedSeq,
    publishedAt: toIsoOrNull(post.publishedAt),
    updatedAt: post.updatedAt.toISOString(),
    tags,
  };
}

/**
 * Date → ISO 字符串（null 透传）。
 *
 * @param value 时间或 null。
 * @returns ISO 8601 字符串或 null。
 */
export function toIsoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}
