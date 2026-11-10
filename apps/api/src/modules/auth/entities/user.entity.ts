import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * `users` 表（契约 §2）。
 *
 * 列名与数据库保持一致；`synchronize` 恒为 false，所以这里的元数据只是查询用的映射，
 * 任何结构变更都必须走迁移。
 *
 * `id` 用 `number` 承载：自增主键远小于 `Number.MAX_SAFE_INTEGER`，
 * 且契约把 `id` 定义为 number（`PostRecord.id`）。
 */
@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 32 })
  username!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  /** 自增即令该用户所有已签发的 access/refresh 失效（强制下线）。 */
  @Column({ name: 'token_version', type: 'int', unsigned: true, default: 0 })
  tokenVersion!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
