/**
 * 关于页正文。
 *
 * 内容来自仓库内的本地 Markdown（`about.md`），**不占表、不占接口**：
 * 它的变更频率跟代码一样低，跟着代码走反而更好审。
 *
 * 渲染放在模块加载时做一次：
 * - 同一个 HTML 被所有访问复用，不用每次进页面都跑一遍解析；
 * - `renderMarkdown` 来自 `@tiny-blogs/shared`，与文章详情用的是同一条管线，
 *   所以"关于页能渲染的东西"和"文章能渲染的东西"不会出现两套规则。
 *
 * 代价：markdown-it 会进这个模块所在的 chunk。因此关于页在路由表里是**懒加载**的，
 * 主包不会被它拖大（详情页则是直接消费接口给的 HTML，浏览器端完全不需要 markdown-it）。
 */
import { renderMarkdown } from '@tiny-blogs/shared';
import markdown from './about.md?raw';

/** 渲染好的关于页 HTML。 */
export const ABOUT_HTML: string = renderMarkdown(markdown).html;
