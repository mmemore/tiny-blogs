/**
 * 前后端共享的契约层：常量、联合类型与纯函数。
 *
 * 纪律（见 `docs/design/fields-and-interfaces.md` §4.1、ADR-0005）：
 * - 本包不得引入 Node-only 或浏览器-only 依赖，必须能在预渲染（Node）与浏览器两侧求值。
 * - 派生规则（曲目号、阅读时长等）只在这里实现一次，禁止两端各写一份。
 * - 术语以 `GLOSSARY.md` 为准：Post / Tag / Archive / Admin。
 */

/** HTTP 层统一前缀。Nest 的 `setGlobalPrefix` 与前端请求路径共用这一个常量。 */
export const API_PREFIX = 'api';

export * from './post-status';
export * from './errors';
export * from './identity';
export * from './health';
export * from './content';
export * from './markdown';
export * from './content-view';
export * from './upload';
