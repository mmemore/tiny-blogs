/**
 * Naive UI 主题覆盖：色值**全部来自 `styles/tokens.css` 的 CSS 变量**，本文件不出现十六进制。
 *
 * 为什么不能直接把 `var(--color-accent)` 字符串塞给 Naive：
 * 组件库拿到颜色后要做数学（changeColor / 加透明度生成 hover、focus、错误态），
 * `var()` 字符串在 `seemly/rgba` 里直接抛 `Invalid color value`，整棵组件树渲染报错
 * （真机已复现）。所以这里在浏览器里用 `getComputedStyle` 把令牌**解析成具体色值**
 * 再交给 Naive——定义仍然只有 tokens.css 一处，改令牌后台跟着变，纪律没有被绕开。
 *
 * 为什么必须在运行时解析而不是构建期内联：Tailwind v4 的 `@theme` 在构建期
 * 把令牌写进 `:root`，构建期拿不到"最终值"的可靠来源；而后台页面只会在浏览器里跑
 * （不在预渲染白名单），运行时解析是安全的。
 *
 * 这些页面只被 `/admin` 懒加载路由引用，所以这份映射永远不会进前台入口 chunk。
 */
import type { GlobalThemeOverrides } from 'naive-ui';

/**
 * 读取令牌。
 *
 * @param name 形如 `--color-accent` 的 CSS 变量名。
 * @param fallback 解析失败时的兜底（仅用于非浏览器环境，后台实际不会走到）。
 * @returns 形如 `#e0693f` 的具体色值。
 */
function token(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

/**
 * 解析失败时的兜底色。
 *
 * 刻意用同一个中性灰而不是"把 tokens.css 的值抄一份"：
 * 抄一份就形成第二处色值定义，改令牌时它不会跟着变，正是纪律要防的事。
 * 走到兜底说明样式还没加载或非浏览器环境，整块灰掉比"看起来正常但颜色是旧的"更诚实。
 */
const FALLBACK = '#808080';

/** 解析后的调色板（模块加载时取一次；后台页面的生命周期内令牌不会变）。 */
const palette = {
  bg: token('--color-bg', FALLBACK),
  paper: token('--color-paper', FALLBACK),
  ink: token('--color-ink', FALLBACK),
  body: token('--color-body', FALLBACK),
  dim: token('--color-dim', FALLBACK),
  faint: token('--color-faint', FALLBACK),
  line: token('--color-line', FALLBACK),
  line2: token('--color-line2', FALLBACK),
  accent: token('--color-accent', FALLBACK),
  accentDark: token('--color-accent-dark', FALLBACK),
};

/**
 * 把 `#rrggbb` 解析成 RGB 三元组。
 *
 * @param hex 十六进制色值（支持 `#rgb` 与 `#rrggbb`）。
 * @returns 0–255 的 [r, g, b]；解析失败返回黑色。
 */
function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : value;
  const full = Number.parseInt(expanded, 16);
  if (Number.isNaN(full) || expanded.length !== 6) {
    return [0, 0, 0];
  }
  return [(full >> 16) & 0xff, (full >> 8) & 0xff, full & 0xff];
}

/**
 * 给色值加透明度（Naive 需要能直接求值的颜色，alpha 层自己在这一处拼）。
 *
 * @param color 十六进制色值。
 * @param alpha 0–1。
 * @returns 形如 `rgb(224 105 63 / 0.18)` 的 CSS 颜色。
 */
function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = hexToRgb(color);
  return `rgb(${String(r)} ${String(g)} ${String(b)} / ${String(alpha)})`;
}

/** 后台通用的主题覆盖（亮色，主色日晒橘）。 */
export const adminThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: palette.accentDark,
    primaryColorHover: palette.accent,
    primaryColorPressed: palette.accentDark,
    primaryColorSuppl: palette.accent,
    bodyColor: palette.paper,
    cardColor: palette.paper,
    modalColor: palette.paper,
    popoverColor: palette.paper,
    textColorBase: palette.ink,
    textColor1: palette.ink,
    textColor2: palette.body,
    textColor3: palette.dim,
    borderColor: palette.line2,
    dividerColor: palette.line,
    hoverColor: palette.bg,
    fontFamily: 'var(--font-sans)',
    fontFamilyMono: 'var(--font-mono)',
    fontSize: '13px',
    fontSizeSmall: '12.5px',
    borderRadius: '4px',
    borderRadiusSmall: '3px',
    heightMedium: '34px',
    heightLarge: '40px',
    errorColor: palette.accentDark,
  },
  Input: {
    border: `1px solid ${palette.line2}`,
    borderHover: `1px solid ${palette.accent}`,
    borderFocus: `1px solid ${palette.accent}`,
    boxShadowFocus: withAlpha(palette.accent, 0.18),
    caretColor: palette.accentDark,
    color: palette.paper,
    textColor: palette.ink,
    placeholderColor: palette.faint,
  },
  Button: {
    textColor: palette.body,
    border: `1px solid ${palette.line2}`,
    borderHover: `1px solid ${palette.accent}`,
    borderPressed: `1px solid ${palette.accentDark}`,
    textColorHover: palette.accentDark,
    textColorPressed: palette.accentDark,
    colorPrimary: palette.accentDark,
    colorHoverPrimary: palette.accent,
    colorPressedPrimary: palette.accentDark,
    colorFocusPrimary: palette.accent,
    borderPrimary: `1px solid ${palette.accentDark}`,
    borderHoverPrimary: `1px solid ${palette.accent}`,
    borderPressedPrimary: `1px solid ${palette.accentDark}`,
    textColorPrimary: palette.paper,
    textColorHoverPrimary: palette.paper,
    textColorPressedPrimary: palette.paper,
    textColorFocusPrimary: palette.paper,
    rippleColorPrimary: palette.accent,
  },
  Select: {
    peers: {
      InternalSelection: {
        border: `1px solid ${palette.line2}`,
        borderHover: `1px solid ${palette.accent}`,
        borderFocus: `1px solid ${palette.accent}`,
        boxShadowFocus: withAlpha(palette.accent, 0.18),
        color: palette.paper,
        textColor: palette.ink,
        placeholderColor: palette.faint,
      },
      InternalSelectMenu: {
        optionTextColor: palette.body,
        optionTextColorActive: palette.accentDark,
        optionCheckColor: palette.accentDark,
      },
    },
  },
  Tag: {
    borderRadius: '4px',
  },
  Pagination: {
    itemBorder: `1px solid ${palette.line2}`,
    itemBorderActive: `1px solid ${palette.ink}`,
    itemBorderHover: `1px solid ${palette.accent}`,
    itemColorActive: palette.ink,
    itemColorActiveHover: palette.ink,
    itemTextColor: palette.dim,
    itemTextColorHover: palette.accentDark,
    itemTextColorActive: palette.paper,
  },
  Modal: {
    borderRadius: '8px',
  },
  Message: {
    borderRadius: '4px',
  },
};
