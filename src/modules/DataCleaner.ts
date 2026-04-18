/**
 * 数据清洗模块
 *
 * 对从 Excel 读取的原始数据进行标准化清洗，包括：
 * - 统一日期格式
 * - 统一金额字段为数值
 * - 处理空值、全角半角、隐藏空格
 * - 向下填充日期、凭证号等缺失字段
 * - 删除合计行、小计行、页眉页脚干扰行
 * - 输出清洗日志
 *
 * 性能要求：支持百万级行数，使用批量处理而非逐单元格操作。
 */

import type {
  CleaningLogEntry,
  DataImportResult,
  MappingConfig,
} from '../models';
import { parseDate } from '../utils/dateUtils';
import { parseAmount, fullWidthToHalfWidth } from '../utils/numberUtils';
import type { RawSheetData } from '../excel/ExcelAdapter';
import { isSummaryRow } from '../excel/SheetScanner';
import { logAction } from '../utils/logger';

/** 清洗选项 */
export interface CleaningOptions {
  /** 向下填充的字段名列表（如 ["voucherDate", "voucherNo"]） */
  fillDownFields?: string[];
  /** 是否删除合计行 */
  removeSummaryRows?: boolean;
  /** 是否处理合并单元格（已展开的空值视为向下填充） */
  handleMergedCells?: boolean;
  /** 操作者 */
  operator?: string;
  /** 项目 ID */
  projectId?: string;
}

/**
 * 对原始 Sheet 数据进行清洗，返回清洗后的记录数组（对象数组）
 *
 * @param rawData 原始 Sheet 数据（二维数组，第一行为表头）
 * @param mappingConfig 字段映射配置
 * @param options 清洗选项
 * @returns 清洗结果
 */
export function cleanSheetData(
  rawData: RawSheetData,
  mappingConfig: MappingConfig,
  options: CleaningOptions = {}
): DataImportResult<Record<string, unknown>> {
  const {
    fillDownFields = ['voucherDate', 'voucherNo', 'voucherType', 'accountCode'],
    removeSummaryRows = true,
    operator = 'system',
    projectId,
  } = options;

  const cleaningLog: CleaningLogEntry[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const data: Record<string, unknown>[] = [];
  let skippedRows = 0;

  if (rawData.length < 2) {
    return {
      data: [],
      errors: [{ row: 0, message: '数据为空或只有表头' }],
      cleaningLog: [],
      totalRows: rawData.length,
      successRows: 0,
      skippedRows: 0,
      importedAt: new Date().toISOString(),
    };
  }

  // 构建列索引映射：标准字段名 → 原始列索引
  const fieldToColIndex = buildFieldToColIndex(mappingConfig, rawData[0]);
  // 构建标准字段名 → 数据类型映射
  const fieldToType = buildFieldToType(mappingConfig);

  // 上次非空值缓存（用于向下填充）
  const lastValues: Record<string, unknown> = {};

  // 获取用于识别合计行的字段列索引
  const headerMappings = rawData[0].map((_, colIdx) => {
    const mapping = mappingConfig.mappings.find(
      (m) =>
        rawData[0]
          .findIndex((h) => String(h ?? '') === m.sourceColumn) === colIdx
    );
    return mapping?.targetField ?? '';
  });

  // 处理数据行（从第2行开始，跳过表头）
  for (let rowIdx = 1; rowIdx < rawData.length; rowIdx++) {
    const rawRow = rawData[rowIdx];

    // 1. 跳过全空行
    if (isCompletelyEmpty(rawRow)) {
      skippedRows++;
      continue;
    }

    // 2. 跳过合计行
    if (removeSummaryRows && isSummaryRow(rawRow, headerMappings)) {
      skippedRows++;
      cleaningLog.push({
        rowIndex: rowIdx + 1,
        fieldName: '_row',
        originalValue: rawRow[0],
        cleanedValue: null,
        rule: '删除合计/小计行',
      });
      continue;
    }

    // 3. 逐字段清洗
    const cleanedRow: Record<string, unknown> = {};
    let hasError = false;

    for (const mapping of mappingConfig.mappings) {
      const colIndex = fieldToColIndex.get(mapping.targetField);
      if (colIndex === undefined || colIndex < 0) continue;

      const rawValue = rawRow[colIndex] ?? null;
      const fieldType = fieldToType.get(mapping.targetField) ?? 'string';

      try {
        const cleaned = cleanFieldValue(
          rawValue,
          fieldType,
          rowIdx + 1,
          mapping.targetField,
          cleaningLog
        );
        cleanedRow[mapping.targetField] = cleaned;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ row: rowIdx + 1, message: `字段 "${mapping.targetField}": ${msg}` });
        hasError = true;
        cleanedRow[mapping.targetField] = rawValue; // 保留原值
      }
    }

    // 4. 向下填充
    for (const field of fillDownFields) {
      const val = cleanedRow[field];
      if (val === null || val === undefined || val === '') {
        if (lastValues[field] !== undefined) {
          cleaningLog.push({
            rowIndex: rowIdx + 1,
            fieldName: field,
            originalValue: val,
            cleanedValue: lastValues[field],
            rule: '向下填充缺失字段',
          });
          cleanedRow[field] = lastValues[field];
        }
      } else {
        lastValues[field] = val;
      }
    }

    // 5. 保留 _sourceRow 方便追溯
    cleanedRow['_sourceRow'] = rowIdx + 1;

    if (!hasError || Object.keys(cleanedRow).length > 1) {
      data.push(cleanedRow);
    }
  }

  // 记录操作日志
  logAction('clean_data', `数据清洗完成：共 ${rawData.length - 1} 行，成功 ${data.length} 行，跳过 ${skippedRows} 行`, {
    operator,
    moduleName: 'DataCleaner',
    affectedCount: data.length,
    result: errors.length === 0 ? 'success' : 'partial',
    projectId,
  });

  return {
    data,
    errors,
    cleaningLog,
    totalRows: rawData.length - 1,
    successRows: data.length,
    skippedRows,
    importedAt: new Date().toISOString(),
  };
}

/**
 * 对单个字段值进行类型清洗
 */
function cleanFieldValue(
  raw: unknown,
  fieldType: 'string' | 'number' | 'date' | 'boolean',
  rowIndex: number,
  fieldName: string,
  log: CleaningLogEntry[]
): unknown {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  let rawStr = String(raw);

  // 清除隐藏空格、全角字符
  const normalized = fullWidthToHalfWidth(rawStr.trim());
  if (normalized !== rawStr) {
    log.push({
      rowIndex,
      fieldName,
      originalValue: raw,
      cleanedValue: normalized,
      rule: '全角转半角/去除隐藏空格',
    });
    rawStr = normalized;
  }

  switch (fieldType) {
    case 'date': {
      const parsed = parseDate(rawStr);
      if (parsed === null && rawStr !== '') {
        log.push({
          rowIndex,
          fieldName,
          originalValue: raw,
          cleanedValue: null,
          rule: '日期解析失败，设为 null',
        });
      } else if (parsed !== rawStr) {
        log.push({
          rowIndex,
          fieldName,
          originalValue: raw,
          cleanedValue: parsed,
          rule: `日期格式统一为 YYYY-MM-DD`,
        });
      }
      return parsed;
    }

    case 'number': {
      const parsed = parseAmount(rawStr);
      if (isNaN(parsed)) {
        log.push({
          rowIndex,
          fieldName,
          originalValue: raw,
          cleanedValue: 0,
          rule: '金额解析失败，设为 0',
        });
        return 0;
      }
      if (parsed !== Number(rawStr)) {
        log.push({
          rowIndex,
          fieldName,
          originalValue: raw,
          cleanedValue: parsed,
          rule: '金额格式标准化',
        });
      }
      return parsed;
    }

    case 'boolean': {
      const lower = rawStr.toLowerCase();
      return lower === 'true' || lower === '1' || lower === '是' || lower === 'yes';
    }

    case 'string':
    default:
      return rawStr;
  }
}

/**
 * 构建 targetField → 列索引 的映射
 */
function buildFieldToColIndex(
  config: MappingConfig,
  headerRow: (string | number | boolean | null)[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const mapping of config.mappings) {
    const colIdx = headerRow.findIndex(
      (h) => String(h ?? '').trim() === mapping.sourceColumn
    );
    if (colIdx >= 0) {
      map.set(mapping.targetField, colIdx);
    }
  }
  return map;
}

/**
 * 构建 targetField → 数据类型 的映射
 */
function buildFieldToType(
  config: MappingConfig
): Map<string, 'string' | 'number' | 'date' | 'boolean'> {
  const map = new Map<string, 'string' | 'number' | 'date' | 'boolean'>();
  for (const mapping of config.mappings) {
    map.set(mapping.targetField, mapping.dataType);
  }
  return map;
}

/**
 * 检查数据行是否完全为空
 */
function isCompletelyEmpty(row: (string | number | boolean | null)[]): boolean {
  return row.every((v) => v === null || v === undefined || v === '');
}

/**
 * 从清洗后的记录提取指定字段为字符串数组（用于向下填充检测）
 */
export function extractColumn(
  data: Record<string, unknown>[],
  fieldName: string
): (string | null)[] {
  return data.map((row) => {
    const v = row[fieldName];
    return v === null || v === undefined ? null : String(v);
  });
}
