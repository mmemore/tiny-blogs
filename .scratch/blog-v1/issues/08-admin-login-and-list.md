# 08: 后台——登录与管理列表

**What to build:** 浏览器里的第一段后台体验：登录页、会话的客户端侧管理（内存 access + 自动刷新），以及含草稿的文章管理列表。Naive UI 从这张票接入且只在后台 chunk 出现。

**Blocked by:** 04 文章写侧闭环；06 前台基础——令牌与壳层

**Status:** ready-for-agent

- [x] 登录页：凭证错误与限流 429 都有明确反馈；access 只存内存（Pinia），不落 localStorage、不写 cookie
- [x] access 过期时自动调用 refresh 后重放原请求；刷新失败跳登录页
- [x] 文章管理列表：含草稿（状态列可区分）、搜索、分页，调管理接口
- [x] Naive UI 仅在 `/admin` 路由 chunk 按需加载；`themeOverrides` 引用共享主题令牌，与前台观感一致
- [x] 退出登录清除会话并跳回前台
