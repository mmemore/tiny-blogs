import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * `tags` 表（契约 §2）。slug 由后台手填，v1 不做拼音生成。
 */
@Entity({ name: 'tags' })
export class TagEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 24 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  slug!: string;

  @Column({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
