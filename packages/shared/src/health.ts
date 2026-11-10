/**
 * `GET /api/health` 的响应体。
 * `uptime` 为进程已运行秒数（整数）。
 */
export interface HealthResponse {
  readonly status: 'ok';
  readonly uptime: number;
}
