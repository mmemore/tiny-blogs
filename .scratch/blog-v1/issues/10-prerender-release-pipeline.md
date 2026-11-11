# 10: 预渲染与发布链路

**What to build:** 把"内容在数据库里"变成"搜索引擎能抓的静态 HTML"的那条链路：受 token 保护的构建导出、vite-ssg 全量预渲染、一条 `pnpm release` 命令，以及可重复执行的构建冒烟检查。这是全项目技术风险最高的一张票，故所有真实页面就绪后才做。

**Blocked by:** 04 文章写侧闭环；07 前台内容页

**Status:** ready-for-agent

- [x] `GET /api/build/export` 校验 `X-Build-Token`，返回 `ContentSnapshot`（version / site / posts 含原文 / tags / archive）
- [x] `pnpm release`：拉快照 → vite-ssg 全量预渲染 → 产出 dist；构建路由只来自快照，`/admin` 永不参与
- [x] dist 里的文章页是静态 HTML：正文直接在源码中、title/OG meta 正确、无空壳
- [x] 草稿不生成路由；构建失败保留上一版产物
- [x] 构建冒烟脚本：断言关键页面存在、meta 正确、无 fonts.googleapis.com 直连，可重复执行
- [x] `BUILD_EXPORT_TOKEN` 只存在于构建进程环境，不出现在任何前端产物（对照 AGENTS.md 密钥红线验证）
