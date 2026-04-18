/**
 * 数据清洗模块单元测试
 *
 * 测试场景：
 * - 正常数据清洗
 * - 日期格式标准化
 * - 金额格式标准化（逗号、括号负数、全角）
 * - 空值处理
 * - 向下填充
 * - 合计行删除
 * - 边界场景
 */

import { describe, it, expect } from 'vitest';
import { parseAmount } from '../src/utils/numberUtils';
import { parseDate } from '../src/utils/dateUtils';
import { guessFieldName, autoDetectMappings } from '../src/utils/fieldMapper';
import { cleanSheetData } from '../src/modules/DataCleaner';
import type { MappingConfig } from '../src/models';
import type { RawSheetData } from '../src/excel/ExcelAdapter';

// ─── 金额解析测试 ────────────────────────────────────────────

describe('parseAmount', () => {
  it('解析带千位分隔符的金额', () => {
    expect(parseAmount('1,234,567.89')).toBe(1234567.89);
  });

  it('解析括号负数', () => {
    expect(parseAmount('(1,234.56)')).toBe(-1234.56);
  });

  it('解析标准负数', () => {
    expect(parseAmount('-9876.54')).toBe(-9876.54);
  });

  it('解析全角数字', () => {
    expect(parseAmount('１２３４')).toBe(1234);
  });

  it('解析带元符号的金额', () => {
    expect(parseAmount('¥1234.56')).toBe(1234.56);
  });

  it('空值返回 0', () => {
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount('')).toBe(0);
  });

  it('已是数字类型直接返回', () => {
    expect(parseAmount(99999)).toBe(99999);
    expect(parseAmount(0)).toBe(0);
  });

  it('无效字符串返回 NaN', () => {
    expect(isNaN(parseAmount('abc') as number)).toBe(true);
  });
});

// ─── 日期解析测试 ────────────────────────────────────────────

describe('parseDate', () => {
  it('解析 YYYY-MM-DD 格式', () => {
    expect(parseDate('2023-12-31')).toBe('2023-12-31');
  });

  it('解析 YYYY/MM/DD 格式', () => {
    expect(parseDate('2023/12/31')).toBe('2023-12-31');
  });

  it('解析 YYYYMMDD 格式', () => {
    expect(parseDate('20231231')).toBe('2023-12-31');
  });

  it('解析中文日期格式', () => {
    expect(parseDate('2023年12月31日')).toBe('2023-12-31');
  });

  it('解析 Excel 序列号', () => {
    // Excel 序列号 44927 = 2023-01-01
    expect(parseDate(44927)).toBe('2023-01-01');
  });

  it('空值返回 null', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('无效日期返回 null', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });

  it('Date 对象转换', () => {
    expect(parseDate(new Date('2023-06-15'))).toBe('2023-06-15');
  });
});

// ─── 字段映射测试 ────────────────────────────────────────────

describe('guessFieldName', () => {
  it('识别借方金额字段', () => {
    expect(guessFieldName('借方发生额')).toBe('debit');
    expect(guessFieldName('Debit')).toBe('debit');
    expect(guessFieldName('借方')).toBe('debit');
  });

  it('识别贷方金额字段', () => {
    expect(guessFieldName('贷方发生额')).toBe('credit');
    expect(guessFieldName('Credit')).toBe('credit');
  });

  it('识别凭证号字段', () => {
    expect(guessFieldName('凭证编号')).toBe('voucherNo');
    expect(guessFieldName('Voucher No.')).toBe('voucherNo');
    expect(guessFieldName('凭证号')).toBe('voucherNo');
  });

  it('识别科目编码字段', () => {
    expect(guessFieldName('科目编码')).toBe('accountCode');
    expect(guessFieldName('Account Code')).toBe('accountCode');
    expect(guessFieldName('科目代码')).toBe('accountCode');
  });

  it('识别日期字段', () => {
    expect(guessFieldName('凭证日期')).toBe('voucherDate');
    expect(guessFieldName('日期')).toBe('voucherDate');
  });

  it('识别摘要字段', () => {
    expect(guessFieldName('摘要')).toBe('summary');
    expect(guessFieldName('summary')).toBe('summary');
  });

  it('无法识别时返回 null', () => {
    expect(guessFieldName('完全无法识别的列名xyz')).toBeNull();
  });
});

describe('autoDetectMappings', () => {
  it('从表头行自动生成映射建议', () => {
    const headers = ['日期', '凭证号', '摘要', '科目编码', '借方', '贷方'];
    const mappings = autoDetectMappings(headers, 'journal');
    expect(mappings).toHaveLength(6);
    expect(mappings.find((m) => m.sourceColumn === '日期')?.targetField).toBe('voucherDate');
    expect(mappings.find((m) => m.sourceColumn === '借方')?.targetField).toBe('debit');
    expect(mappings.find((m) => m.sourceColumn === '贷方')?.dataType).toBe('number');
  });
});

// ─── 数据清洗主流程测试 ──────────────────────────────────────

describe('cleanSheetData', () => {
  const buildMappingConfig = (): MappingConfig => ({
    id: 'test-cfg',
    name: '测试配置',
    dataType: 'journal',
    mappings: [
      { sourceColumn: '日期', targetField: 'voucherDate', required: true, dataType: 'date', confirmed: true },
      { sourceColumn: '凭证号', targetField: 'voucherNo', required: true, dataType: 'string', confirmed: true },
      { sourceColumn: '摘要', targetField: 'summary', required: false, dataType: 'string', confirmed: true },
      { sourceColumn: '科目编码', targetField: 'accountCode', required: true, dataType: 'string', confirmed: true },
      { sourceColumn: '借方', targetField: 'debit', required: false, dataType: 'number', confirmed: true },
      { sourceColumn: '贷方', targetField: 'credit', required: false, dataType: 'number', confirmed: true },
    ],
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
  });

  it('正常数据清洗', () => {
    const rawData: RawSheetData = [
      ['日期', '凭证号', '摘要', '科目编码', '借方', '贷方'],
      ['2023/01/15', '001', '采购付款', '1001', '10000', ''],
      ['2023-01-16', '002', '销售收款', '1122', '', '20000'],
    ];

    const result = cleanSheetData(rawData, buildMappingConfig());
    expect(result.successRows).toBe(2);
    expect(result.data[0]['voucherDate']).toBe('2023-01-15');
    expect(result.data[0]['debit']).toBe(10000);
    expect(result.data[1]['credit']).toBe(20000);
  });

  it('向下填充缺失的凭证号', () => {
    const rawData: RawSheetData = [
      ['日期', '凭证号', '摘要', '科目编码', '借方', '贷方'],
      ['2023-01-15', '001', '采购付款', '1001', '10000', ''],
      ['', '', '采购付款-2', '1002', '', '10000'],
    ];

    const result = cleanSheetData(rawData, buildMappingConfig(), {
      fillDownFields: ['voucherDate', 'voucherNo'],
    });

    expect(result.data[1]['voucherNo']).toBe('001');
    expect(result.data[1]['voucherDate']).toBe('2023-01-15');
    expect(result.cleaningLog.some((l) => l.rule === '向下填充缺失字段')).toBe(true);
  });

  it('删除合计行', () => {
    const rawData: RawSheetData = [
      ['日期', '凭证号', '摘要', '科目编码', '借方', '贷方'],
      ['2023-01-15', '001', '采购付款', '1001', '10000', ''],
      ['合计', '', '', '', '10000', ''],  // 合计行
      ['2023-01-16', '002', '销售收款', '1002', '', '20000'],
    ];

    const result = cleanSheetData(rawData, buildMappingConfig(), { removeSummaryRows: true });
    expect(result.successRows).toBe(2); // 合计行被删除
    expect(result.skippedRows).toBe(1);
  });

  it('处理带千位分隔符的金额', () => {
    const rawData: RawSheetData = [
      ['日期', '凭证号', '摘要', '科目编码', '借方', '贷方'],
      ['2023-01-15', '001', '采购付款', '1001', '1,234,567.89', ''],
    ];

    const result = cleanSheetData(rawData, buildMappingConfig());
    expect(result.data[0]['debit']).toBe(1234567.89);
  });

  it('处理括号负数金额', () => {
    const rawData: RawSheetData = [
      ['日期', '凭证号', '摘要', '科目编码', '借方', '贷方'],
      ['2023-01-15', '001', '红字冲销', '1001', '(5000)', ''],
    ];

    const result = cleanSheetData(rawData, buildMappingConfig());
    expect(result.data[0]['debit']).toBe(-5000);
  });

  it('跳过全空行', () => {
    const rawData: RawSheetData = [
      ['日期', '凭证号', '摘要', '科目编码', '借方', '贷方'],
      ['2023-01-15', '001', '采购', '1001', '1000', ''],
      [null, null, null, null, null, null],  // 全空行
      ['2023-01-16', '002', '销售', '1002', '', '1000'],
    ];

    const result = cleanSheetData(rawData, buildMappingConfig());
    expect(result.successRows).toBe(2);
    expect(result.skippedRows).toBe(1);
  });

  it('空 Sheet 返回空结果', () => {
    const result = cleanSheetData([], buildMappingConfig());
    expect(result.successRows).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});
