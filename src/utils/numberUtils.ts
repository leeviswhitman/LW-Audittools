/**
 * 数字工具模块
 *
 * 处理中国财务报表中常见的各种金额格式，统一转换为 JavaScript number。
 * 支持带逗号千位分隔符、括号负数、全角数字、空格等格式。
 */

/**
 * 将各种金额字符串解析为标准 number
 * 支持：
 *   - "1,234,567.89"  → 1234567.89
 *   - "(1,234.56)"    → -1234.56  （括号表示负数）
 *   - "-1234.56"      → -1234.56
 *   - "１２３４"       → 1234  （全角数字）
 *   - "1234元"        → 1234
 *   - ""              → 0
 *   - null / undefined→ 0
 *
 * @param raw 原始值
 * @returns 解析后的浮点数，无法解析时返回 NaN
 */
export function parseAmount(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;

  let str = String(raw).trim();
  if (str === '' || str === '-') return 0;

  // 1. 全角数字转半角
  str = fullWidthToHalfWidth(str);

  // 2. 去除货币单位、空格
  str = str.replace(/[元¥$,\s]/g, '');

  // 3. 括号负数：(1234.56) → -1234.56
  const bracketMatch = str.match(/^\(([0-9.]+)\)$/);
  if (bracketMatch) {
    return -parseFloat(bracketMatch[1]);
  }

  // 4. 直接解析
  const num = parseFloat(str);
  return Number.isNaN(num) ? NaN : num;
}

/**
 * 全角字符转半角
 */
export function fullWidthToHalfWidth(str: string): string {
  return str
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      // 全角数字/字母/符号：0xFF01-0xFF5E → 0x0021-0x007E
      if (code >= 0xff01 && code <= 0xff5e) {
        return String.fromCharCode(code - 0xfee0);
      }
      // 全角空格
      if (code === 0x3000) return ' ';
      return ch;
    })
    .join('');
}

/**
 * 判断字符串是否可解析为有效金额（非 NaN、非 Infinity）
 */
export function isValidAmount(raw: unknown): boolean {
  const n = parseAmount(raw);
  return Number.isFinite(n);
}

/**
 * 格式化金额为中文财务显示（保留2位小数，千位分隔）
 */
export function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  return amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * 对浮点数进行会计精度舍入（四舍五入至指定小数位）
 * 避免 JS 浮点精度问题（如 0.1 + 0.2 !== 0.3）
 * @param value 原始值
 * @param decimals 小数位数（默认 2）
 */
export function roundAmount(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * 检查两个金额是否在容差范围内相等（处理浮点精度）
 * @param a 金额 a
 * @param b 金额 b
 * @param tolerance 容差（默认 0.005 元）
 */
export function amountsEqual(a: number, b: number, tolerance = 0.005): boolean {
  return Math.abs(a - b) <= tolerance;
}
