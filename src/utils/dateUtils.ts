/**
 * 日期工具模块
 *
 * 处理中国审计实务中常见的各种日期格式，统一转换为 ISO 格式（YYYY-MM-DD）。
 * 支持中文日期、Excel 序列号、多种分隔符格式。
 */

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

/** Excel 起始日期（1900-01-01 对应序列号 1，注意 Excel 的 1900年2月29日 bug） */
const EXCEL_EPOCH = new Date(1899, 11, 30); // 1899-12-30

/** 支持的日期格式列表（按优先级排列） */
const DATE_FORMATS = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'YYYY.MM.DD',
  'YYYYMMDD',
  'YYYY年MM月DD日',
  'YY-MM-DD',
  'YY/MM/DD',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'MM-DD-YYYY',
  'YYYY年M月D日',
  'M月D日',
];

/**
 * 将各种日期输入统一解析为 ISO 格式（YYYY-MM-DD）
 * @param raw 原始值（字符串、数字、Date）
 * @returns ISO 日期字符串，无法解析时返回 null
 */
export function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;

  // 1. 已经是 Date 对象
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return dayjs(raw).format('YYYY-MM-DD');
  }

  // 2. Excel 序列号（数字类型）
  if (typeof raw === 'number') {
    return parseExcelSerialDate(raw);
  }

  const str = String(raw).trim();

  // 3. 空字符串
  if (!str) return null;

  // 4. 尝试各种字符串格式
  for (const fmt of DATE_FORMATS) {
    const d = dayjs(str, fmt, true);
    if (d.isValid()) {
      return d.format('YYYY-MM-DD');
    }
  }

  // 5. 宽松解析（兜底）
  const d = dayjs(str);
  if (d.isValid()) {
    return d.format('YYYY-MM-DD');
  }

  return null;
}

/**
 * 将 Excel 序列号转换为 ISO 日期字符串
 * @param serial Excel 日期序列号（如 44927 = 2023-01-01）
 */
export function parseExcelSerialDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 99999) return null;
  const date = new Date(EXCEL_EPOCH.getTime() + serial * 86400000);
  return dayjs(date).format('YYYY-MM-DD');
}

/**
 * 判断日期是否为非工作日（周六、周日）
 * @param isoDate ISO 格式日期 YYYY-MM-DD
 */
export function isWeekend(isoDate: string): boolean {
  const d = dayjs(isoDate);
  const dow = d.day(); // 0=Sunday, 6=Saturday
  return dow === 0 || dow === 6;
}

/**
 * 判断日期是否在期末（月份最后 N 天）
 * @param isoDate ISO 格式日期
 * @param lastNDays 期末天数阈值（默认 5）
 */
export function isPeriodEnd(isoDate: string, lastNDays = 5): boolean {
  const d = dayjs(isoDate);
  const lastDayOfMonth = d.daysInMonth();
  return d.date() > lastDayOfMonth - lastNDays;
}

/**
 * 将日期格式化为中文显示
 * @param isoDate ISO 日期字符串
 */
export function formatChineseDate(isoDate: string): string {
  const d = dayjs(isoDate);
  if (!d.isValid()) return isoDate;
  return d.format('YYYY年MM月DD日');
}

/**
 * 获取日期所在月份标识（YYYY-MM）
 */
export function getMonthKey(isoDate: string): string {
  return dayjs(isoDate).format('YYYY-MM');
}

/**
 * 验证日期是否合理（1990-01-01 至今）
 */
export function isReasonableDate(isoDate: string): boolean {
  const d = dayjs(isoDate);
  if (!d.isValid()) return false;
  const minDate = dayjs('1990-01-01');
  const maxDate = dayjs().add(1, 'day'); // 允许明天（系统时钟差异）
  return d.isAfter(minDate) && d.isBefore(maxDate);
}
