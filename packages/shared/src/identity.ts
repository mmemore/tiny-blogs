/**
 * 身份相关的最小契约：鉴权模块产出 `Principal`，写侧（authoring）与
 * 后台接口只认它，绝不从请求体里读作者身份。
 */
export interface Principal {
  readonly id: number;
  readonly username: string;
}

/** `GET /api/auth/me` 的响应体。 */
export type MeResponse = Principal;

/** 登录/刷新成功后的响应体（refresh token 只经 httpOnly cookie 传输）。 */
export interface TokenResponse {
  readonly accessToken: string;
}
