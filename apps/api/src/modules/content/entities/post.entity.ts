import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { PostStatus } from '@tiny-blogs/shared';

/**
 * `posts` 表（契约 §2）。
 *
 * 只做映射，不做结构管理（`synchronize` 恒 false）；`updated_at` 由应用写入，
 * 因为它同时是乐观锁的版本依据（不用 `ON UPDATE CURRENT_TIMESTAMP`）。
 */
@Entity({ name: 'posts' })
export class PostEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: number;

  @Column({ name: 'author_id', type: 'bigint', unsigned: true })
  authorId!: number;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 140 })
  slug!: string;

  @Column({ type: 'varchar', length: 200 })
  summary!: string;

  @Column({ name: 'content_md', type: 'mediumtext' })
  contentMd!: string;

  @Column({ type: 'enum', enum: ['draft', 'published'], default: 'draft' })
  status!: PostStatus;

  /** 首次发布时分配（`max(seq)+1`），此后永不变更；取消发布也保留。 */
  @Column({ name: 'published_seq', type: 'int', unsigned: true, nullable: true })
  publishedSeq!: number | null;

  /** 首次发布时间；再次发布不改写。 */
  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  /** 兼作乐观锁版本：任何写入都必须显式更新它。 */
  @Column({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
