# 11: v1 验收与交付

**What to build:** v1 的收口：以真实用户身份把全链路走一遍并留下可复现的说明。这张票不新增功能，它的产出是"任何人 clone 后能按 README 跑起来"这个事实本身。

**Blocked by:** 09 后台——编辑器与图片上传；10 预渲染与发布链路

**Status:** ready-for-agent

- [x] 全链路手动回归：登录 → 写作 → 上传图片 → 发布 → `pnpm release` → 静态站验证正文与 meta → 中文搜索命中
- [x] 测试全绿：API HTTP 边界（supertest）+ 构建冒烟 + shared 纯函数单测
- [x] README 三段式：本地启动 / 测试 / 发布，不含任何个人信息（对照 AGENTS.md 隐私红线）
- [x] 隐私与密钥终扫：`git grep` 密钥模式零命中；`.env.example` 与代码读取的变量一致
- [x] 空库 → 迁移 → 种子 → 跑起来的完整演练一次通过
