# ADR-0001: 前后端分离，Vue 3 SPA + 构建期预渲染，而非 Nuxt/Next SSR

## Status

Accepted（2026-11-09）

## Context

博客需要 SEO（可被收录、分享卡片正确）与一个网页写作后台。作者技术栈已定为 Vue 3 + TS + Vite + Pinia。候选方案：Nuxt 3（Vue 生态 SSR 框架）、Next.js（React，仅当 API 用）、或守住 Vite 用构建期预渲染。

## Decision

前后端分离：前端 Vue 3 + `vite-ssg` 构建期全量预渲染；后端 NestJS 纯 API。不引入运行时 SSR 服务。

## Consequences

- 文章页拿到静态 HTML，SEO 与分享卡片正确；交互页仍是 SPA。
- 必须维护"发布 → 导出 → 全量重建"链路，发布后约 1 分钟延迟才在线上可见。
- 构建期需要能访问 API（受 token 保护的导出接口）。
- 不需要维护 Node 渲染服务的内存、并发与降级逻辑；放弃的 SSR 能力（实时内容）对个人博客无实际收益。
- "用 Next.js 只当 API"被否决：放弃其渲染能力后相对轻量 Node 框架无优势。
