# ADR-0004: 内容存 MySQL，发布链路为全量重建

## Status

Accepted（2026-11-09）

## Context

文章存在 MySQL（配合后台 CRUD），而前台是静态产物（ADR-0001）。两者之间必须有一条明确定义的同步链路。

## Decision

- API 提供受服务间 token 保护的 `GET /api/build/export`，输出全部已发布文章/标签 JSON。
- `pnpm release`：拉导出数据 → vite-ssg 全量预渲染 → 产出 `dist`。发布文章后需触发一次 release。
- Markdown 只存原文；HTML 渲染统一在前端管线完成（预渲染期与客户端同一实现）。
- 中文搜索用 MySQL 全文索引，必须 `WITH PARSER ngram`。

## Consequences

- 发布到线上可见存在约 1 分钟构建延迟；文章量在数百篇内全量重建可控。
- 同一导出接口兼作数据备份入口。
- 服务器/CI 触发 rebuild 属部署期工作，本链路设计为其预留了原子步骤。
