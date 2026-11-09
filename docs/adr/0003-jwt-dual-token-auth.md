# ADR-0003: JWT 双 token 鉴权（内存 access + httpOnly refresh + 轮换）

## Status

Accepted（2026-11-09）

## Context

后台为单管理员（种子账号，无注册）。更简单的方案是服务端 session cookie；本项目选择 JWT，是为多客户端（网页后台、将来的移动端/CLI）与后续多用户扩展保留空间，并借 `token_version` 补回 session 方案天然具备的"强制下线"能力。

## Decision

- access token：15 分钟，仅存前端内存（Pinia），不落 localStorage。
- refresh token：30 天，httpOnly + SameSite=Strict cookie，路径限定 `/api/auth`，服务端只存哈希（`refresh_tokens` 表）。
- refresh 轮换：每次刷新签发新 refresh 并作废旧值；旧 token 二次出现视为重放，撤销该用户全部会话。
- `users.token_version` 随 JWT 携带；提升 version 即强制全端下线（改密码/踢人）。
- 密码 argon2id 哈希；登录接口 `@nestjs/throttler` 限流。

## Consequences

- XSS 偷不到凭据（access 不落盘、refresh 对 JS 不可见）；CSRF 由 SameSite=Strict + 路径限定缓解。
- "JWT 也能踢人"通过 token_version 实现，保留无状态校验的同时获得撤销能力。
- 相比 session 方案多出轮换与重放检测逻辑，换来多用户扩展时无需重写鉴权。
