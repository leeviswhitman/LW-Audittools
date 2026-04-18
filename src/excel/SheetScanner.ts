/**
 * Sheet 扫描器
 *
 * 扫描工作簿中所有 Sheet，自动识别可能的数据类型
 * （序时账、科目余额表、凭证明细、附件索引等）。
 */

import type { SheetInfo, RawSheetData } from './ExcelAdapter';
import { guessFieldName } from '../utils/fieldMapper';

/** Sheet 数据类型推断结果 */
export type SheetDataTypeGuess =
  | 'journal'          // 序时账 / 明细账
  | 'trial_balance'    // 科目余额表
  | 'voucher_detail'   // 凭证明细
  | 'attachment_index' // 附件索引表
  | 'subsidiary'       // 辅助明细（往来明细等）
  | 'unknown';         // 无法识别

/** Sheet 识别结果 */
export interface SheetScanResult {
  sheetInfo: SheetInfo;
  guessedType: SheetDataTypeGuess;
  confidence: 'high' | 'medium' | 'low';
  detectedHeaders: string[];
  mappedFields: string[];
  reason: string;
}

/**
 * Sheet 关键字权重配置（用于类型推断）
 */
const TYPE_KEYWORDS: Record<SheetDataTypeGuess, string[]> = {
  journal: [
    'voucherDate', 'voucherNo', 'voucherType', 'debit', 'credit',
    'summary', 'accountCode', 'accountName',
  ],
  trial_balance: [
    'accountCode', 'accountName', 'beginDebit', 'beginCredit',
    'currentDebit', 'currentCredit', 'endDebit', 'endCredit',
  ],
  voucher_detail: [
    'voucherNo', 'documentNo', 'attachmentNo',
  ],
  attachment_index: [
    'attachmentNo', 'filePath', 'imageSystemNo',
  ],
  subsidiary: [
    'partyName', 'auxiliaryInfo', 'documentNo',
  ],
  unknown: [],
};

/**
 * 从表头列名推断 Sheet 数据类型
 * @param headers 表头列名数组
 * @returns 识别结果
 */
export function guessSheetType(headers: string[]): {
  type: SheetDataTypeGuess;
  confidence: 'high' | 'medium' | 'low';
  mappedFields: string[];
  reason: string;
} {
  // 将所有表头映射到标准字段
  const mappedFields = headers
    .map((h) => guessFieldName(h))
    .filter((f): f is string => f !== null);

  const fieldSet = new Set(mappedFields);

  // 计算每种类型的匹配分数
  const scores: Record<string, number> = {};
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (type === 'unknown') continue;
    const matched = keywords.filter((k) => fieldSet.has(k)).length;
    scores[type] = matched;
  }

  // 找最高分
  let bestType: SheetDataTypeGuess = 'unknown';
  let bestScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type as SheetDataTypeGuess;
    }
  }

  // 计算置信度
  const totalKeywords = TYPE_KEYWORDS[bestType]?.length ?? 1;
  const ratio = bestScore / totalKeywords;

  let confidence: 'high' | 'medium' | 'low';
  if (ratio >= 0.6) confidence = 'high';
  else if (ratio >= 0.3) confidence = 'medium';
  else confidence = 'low';

  if (bestScore === 0) {
    return {
      type: 'unknown',
      confidence: 'low',
      mappedFields,
      reason: '无法匹配已知数据类型',
    };
  }

  return {
    type: bestType,
    confidence,
    mappedFields,
    reason: `匹配 ${bestType} 类型 ${bestScore}/${totalKeywords} 个关键字段`,
  };
}

/**
 * 扫描 Sheet 的前几行，检测是否存在多段表头或隐藏的数据起始行
 * @param data 完整 Sheet 数据（二维数组）
 * @returns 表头所在行号（0-based）和数据起始行号
 */
export function detectHeaderRow(data: RawSheetData): {
  headerRowIndex: number;
  dataStartRowIndex: number;
} {
  // 扫描前 10 行，寻找最可能的表头行
  const maxScanRows = Math.min(10, data.length);

  let bestHeaderRow = 0;
  let bestMappedCount = 0;

  for (let i = 0; i < maxScanRows; i++) {
    const row = data[i];
    const nonEmpty = row.filter((v) => v !== null && v !== '' && v !== undefined);
    if (nonEmpty.length === 0) continue;

    const mapped = nonEmpty.filter(
      (v) => guessFieldName(String(v)) !== null
    ).length;

    if (mapped > bestMappedCount) {
      bestMappedCount = mapped;
      bestHeaderRow = i;
    }
  }

  return {
    headerRowIndex: bestHeaderRow,
    dataStartRowIndex: bestHeaderRow + 1,
  };
}

/**
 * 检测合计行、小计行（用于后续删除）
 * @param row 数据行
 * @param headers 已映射的标准字段名列表
 */
export function isSummaryRow(
  row: (string | number | boolean | null)[],
  headerMappings: string[]
): boolean {
  // 检查文本字段中是否含有合计/小计关键词
  const SUMMARY_KEYWORDS = [
    '合计', '小计', '总计', '汇总', '期末', '期初',
    'total', 'subtotal', 'grand total', 'sum',
  ];

  for (let i = 0; i < Math.min(row.length, 5); i++) {
    const cellText = String(row[i] ?? '').trim();
    if (SUMMARY_KEYWORDS.some((kw) => cellText.includes(kw))) {
      return true;
    }
  }

  // 检查是否数字字段全部为空（只有文字行）
  const numericFieldIndexes = headerMappings
    .map((field, idx) => ({ field, idx }))
    .filter(({ field }) =>
      ['debit', 'credit', 'beginDebit', 'currentDebit', 'endDebit'].includes(field)
    )
    .map(({ idx }) => idx);

  if (numericFieldIndexes.length > 0) {
    const allNumericEmpty = numericFieldIndexes.every((idx) => {
      const v = row[idx];
      return v === null || v === '' || v === undefined;
    });
    // 如果第一列有文字且数字列全空，很可能是标题/合计行
    const firstColText = String(row[0] ?? '').trim();
    if (allNumericEmpty && firstColText.length > 0) {
      return true;
    }
  }

  return false;
}
