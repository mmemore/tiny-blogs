# 06: 前台基础——令牌与壳层

**What to build:** 视觉方向 06（彩胶俱乐部）的落地面：主题令牌单一定义、自托管字体、站头页脚，以及首页与文章列表两个高频页面的可用版（SPA 实时拉数据）。页面按预渲染兼容纪律写，为票 10 铺路。

**Blocked by:** 05 读侧公开接口

**Status:** ready-for-agent

- [x] Tailwind v4 + CSS 变量主题：暖白/墨/日晒橘 + 四色彩胶（v1 橘 / v2 蓝 / v3 绿 / v4 莓红），令牌单一定义，供后续 Naive `themeOverrides` 同源引用
- [x] 字体自托管子集（Archivo / Noto Sans SC / Space Mono），产物无 `fonts.googleapis.com` 直连，无 FOUT 闪烁
- [x] 站头（导航当前态）、页脚、响应式断点
- [x] 首页：hero 为最新一篇 + 曲目表（编号着色、时长）；列表页：分页与搜索（调公开 API）
- [x] 首页 hero 与列表对 `track` 的展示与 `toTrack` 派生值一致
- [x] 所有数据获取位于 setup/async 阶段（预渲染兼容纪律，票 10 的前提）
- [x] `pnpm build` 成功；admin 代码不在前台首屏 chunk
