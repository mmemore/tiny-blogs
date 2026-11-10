# 03: 鉴权闭环

**What to build:** 用 curl 就能走完的完整会话生命周期：登录拿短效 access → 访问受保护接口 → 过期后用 httpOnly cookie 里的 refresh 换新 → 检测到重放时全端下线。安全不变量（XSS 偷不走凭据、可强制踢人）由模块内部保证。

**Blocked by:** 02 Schema、迁移与种子管理员

**Status:** ready-for-agent

- [ ] 登录成功返回 access token（15 分钟），refresh 写入 httpOnly + SameSite=Strict + Path=/api/auth 的 cookie（30 天）
- [ ] 登录失败统一 401 `INVALID_CREDENTIALS`，不区分是用户名还是口令错
- [ ] refresh 轮换：签发新 refresh 并作废旧值；被作废的 refresh 二次出现 → 撤销该用户全部会话并 `token_version` 自增
- [ ] `token_version` 提升后，该用户所有旧 access 一律 401（强制下线）
- [ ] 登录限流：同 IP 每分钟 5 次后返回 429
- [ ] `GET /api/auth/me` 与 `POST /api/auth/logout` 行为符合契约 §5
- [ ] supertest 在 HTTP 边界覆盖以上每条路径（含正常流与攻击流）
