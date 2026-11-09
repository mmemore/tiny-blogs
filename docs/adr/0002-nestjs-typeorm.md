# ADR-0002: 后端选 NestJS + TypeORM

## Status

Accepted（2026-11-09）

## Context

作者为 TS 前端背景，希望前后端共享同一套语言与类型以减少上下文切换。候选：FastAPI（需引入 Python 3.10+ 环境且无法与前端共享类型）、Next.js API Routes（见 ADR-0001）、NestJS + Prisma、NestJS + TypeORM、Hono 等轻量 Node 框架。

## Decision

NestJS 作为后端框架（TS、Module/Controller/Service 分层、DTO 校验、Guard/Interceptor 体系，与前端共享 `packages/shared` 类型）。ORM 用 TypeORM：Nest 生态中搭配最成熟、示例最丰富、装饰器实体与框架风格统一，且原生支持 MySQL 全文索引（ngram），无需为全文检索绕道原生 SQL。

## Consequences

- 三条使用纪律（都是实践中容易踩的坑）：
  1. `synchronize` 永远 `false`，schema 只经 migration 变更；
  2. migration 生成后必须人工审查再提交；
  3. 复杂查询直接 QueryBuilder 写 SQL，不硬凑链式 API。
- 接受 TypeORM 的已知代价：维护活跃度下滑、深关联类型推导退化、迁移生成质量不稳需手改。
- 全文索引无需 Prisma 的 `$queryRaw` 变通。
