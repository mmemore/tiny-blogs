/**
 * 展示层的格式化工具。
 *
 * 时区纪律：所有日期**固定按东八区格式化**，不用运行环境的本地时区。
 * 原因是预渲染在构建机上跑、页面在读者浏览器里水合（hydration），
 * 两边时区不同会让同一篇文章出现两个日期，甚至造成水合不一致。
 */
import type { Accent, Track } from '@tiny-blogs/shared';

/** 展示用时区：与站点读者一致，且与构建机无关。 */
const DISPLAY_TIME_ZONE = 'Asia/Shanghai';

/**
 * 取某时刻在东八区的各个字段。
 *
 * @param iso ISO 8601 时间字符串。
 * @returns 年 / 月 / 日（月与日不补零）。
 */
function parts(iso: string): { year: string; month: string; day: string; hour: string; minute: string } {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const result: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(iso))) {
    if (part.type !== 'literal') {
      result[part.type] = part.value;
    }
  }

  return {
    year: result.year ?? '1970',
    month: result.month ?? '01',
    day: result.day ?? '01',
    hour: result.hour ?? '00',
    minute: result.minute ?? '00',
  };
}

/**
 * 日期 → `2026.11.02`。
 *
 * @param iso ISO 8601 时间字符串。
 * @returns 点分日期；`null` 透传为空串。
 */
export function formatDate(iso: string | null): string {
  if (iso === null) {
    return '';
  }
  const value = parts(iso);
  return `${value.year}.${value.month}.${value.day}`;
}

/**
 * 日期 → `11.02`（曲目表里的短格式）。
 *
 * @param iso ISO 8601 时间字符串。
 * @returns 月.日。
 */
export function formatMonthDay(iso: string | null): string {
  if (iso === null) {
    return '';
  }
  const value = parts(iso);
  return `${value.month}.${value.day}`;
}

/**
 * 日期 → `2026`。
 *
 * @param iso ISO 8601 时间字符串。
 * @returns 四位年份。
 */
export function formatYear(iso: string | null): string {
  return iso === null ? '' : parts(iso).year;
}

/**
 * 日期 → `21:30`。
 *
 * @param iso ISO 8601 时间字符串。
 * @returns 时:分。
 */
export function formatTime(iso: string | null): string {
  if (iso === null) {
    return '';
  }
  const value = parts(iso);
  return `${value.hour}:${value.minute}`;
}

/**
 * 阅读时长 → `9′`（曲目表用）。
 *
 * @param minutes 后端算好的分钟数（前端**不重算**）。
 * @returns 带分秒符的字符串。
 */
export function formatDuration(minutes: number): string {
  return `${String(minutes)}′`;
}

/**
 * 阅读时长 → `9 MIN`（封套与详情页用）。
 *
 * @param minutes 后端算好的分钟数。
 * @returns 大写标注。
 */
export function formatMinutesLabel(minutes: number): string {
  return `${String(minutes)} MIN`;
}

/**
 * 彩胶配色的 CSS 变量名。
 *
 * 颜色只在 `styles/tokens.css` 定义一次，这里只做 `v1..v4 → --color-v1..v4` 的映射，
 * 组件里不会出现任何十六进制色值。
 *
 * @param accent 后端给出的配色标识。
 * @returns 可直接放进 `style` 的 `var(--color-*)`。
 */
export function accentColor(accent: Accent): string {
  return `var(--color-${accent})`;
}

/** 配色 → 中文胶名（封套上的 `A1 · 橘胶`）。 */
const ACCENT_LABEL: Readonly<Record<Accent, string>> = {
  v1: '橘胶',
  v2: '蓝胶',
  v3: '绿胶',
  v4: '莓红胶',
};

/**
 * 配色 → 中文胶名。
 *
 * @param accent 后端给出的配色标识。
 * @returns 如 `橘胶`。
 */
export function accentLabel(accent: Accent): string {
  return ACCENT_LABEL[accent];
}

/**
 * 曲目号 + 胶名的完整标注。
 *
 * @param track 后端派生的曲目号。
 * @returns 如 `A1 · 橘胶`。
 */
export function trackCaption(track: Track): string {
  return `${track.no} · ${accentLabel(track.accent)}`;
}

/**
 * 把标签数组拼成 `Vue · 构建`。
 *
 * @param tags 标签列表。
 * @returns 用中点连接的字符串；空数组返回空串。
 */
export function joinTagNames(tags: readonly { name: string }[]): string {
  return tags.map((tag) => tag.name).join(' · ');
}
