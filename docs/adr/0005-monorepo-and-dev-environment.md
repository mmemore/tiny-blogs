# ADR-0005: pnpm workspace 单仓与两套 compose 的环境形态

## Status

Accepted（2026-11-09）

## Context

前后端同栈 TS、个人单人开发。需要同时保证：类型跨端共享、前端 HMR 开发体验、数据库环境与生产一致。

## Decision

- 仓库结构：pnpm workspace monorepo，`apps/web`、`apps/api`、`packages/shared`。
- 开发：`compose.dev.yml` 仅起 MySQL 8 + Adminer；web/api 在宿主机直跑，保留 Vite HMR 与 Nest watch。
- 生产：`compose.yml`（web 静态产物 + api + db + 反代）在部署阶段补齐。
- 图片存储抽为 StorageService 接口，v1 本地卷实现（hash 命名、类型与大小校验），预留对象存储实现位。

## Consequences

- DTO 改动两侧 TS 即时报错，这是选 TS 全栈的核心收益。
- 数据库只在容器里跑，环境一致性由 compose 保证；开发热更新不受容器化拖累。
- 评论（Giscus）依赖公开仓库 Discussions；仓库当前私有，v1 只做占位，转 public 后填配置即启用。
