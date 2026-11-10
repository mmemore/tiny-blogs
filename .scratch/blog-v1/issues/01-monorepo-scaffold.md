# 01: Monorepo 骨架与开发环境

**What to build:** 新机器 clone 后两条命令即可开工的本地环境：容器里跑 MySQL，宿主机上同时热更新 API 与前台占位页；类型与规范检查一条命令全跑。这是一切后续票的地基，不含任何业务行为。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `docker compose -f compose.dev.yml up -d` 启动 MySQL 8 与 Adminer，数据落命名卷，销毁重建容器数据不丢
- [x] `pnpm dev` 同时启动 API 与 web 占位页；`/api/health` 返回 `{ status, uptime }`；web 热更新可用
- [x] workspace 三包（web / api / shared）类型互相引用；`pnpm typecheck` 与 `pnpm lint` 全绿
- [x] API 启动时校验必需环境变量，缺失即 fail-fast 报出变量名，不回退硬编码默认值
- [x] `.env.example` 与实际读取的变量一一对应；无 `.env` 入库
