/**
 * 序时账处理模块单元测试
 *
 * 测试场景：
 * - 标准分录解析
 * - 凭证聚合
 * - 科目汇总
 * - 异常分录识别
 * - 边界条件
 */

import { describe, it, expect } from 'vitest';
import {
  parseJournalEntries,
  aggregateVouchers,
  summarizeByAccount,
  extractAnomalies,
} from '../src/modules/JournalProcessor';

// 构建测试记录
const buildRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  _sourceRow: 2,
  voucherDate: '2023-01-15',
  voucherNo: '001',
  summary: '采购付款',
  accountCode: '1001',
  accountName: '库存现金',
  debit: 10000,
  credit: 0,
  ...overrides,
});

describe('parseJournalEntries', () => {
  it('正常解析序时账分录', () => {
    const rows = [
      buildRow({ debit: 10000, credit: 0 }),
      buildRow({ voucherNo: '001', accountCode: '2202', debit: 0, credit: 10000 }),
    ];
    const result = parseJournalEntries(rows);
    expect(result.successRows).toBe(2);
    expect(result.data[0].accountCode).toBe('1001');
    expect(result.data[0].debit).toBe(10000);
    expect(result.data[1].credit).toBe(10000);
  });

  it('识别借贷同时有值的异常分录', () => {
    const rows = [buildRow({ debit: 5000, credit: 3000 })];
    const result = parseJournalEntries(rows);
    expect(result.data[0].anomalyFlags?.length).toBeGreaterThan(0);
    expect(result.data[0].anomalyFlags?.some((f) => f.includes('AN-001'))).toBe(true);
  });

  it('识别借贷同时为零的异常分录', () => {
    const rows = [buildRow({ debit: 0, credit: 0 })];
    const result = parseJournalEntries(rows);
    expect(result.data[0].anomalyFlags?.some((f) => f.includes('AN-002'))).toBe(true);
  });

  it('识别凭证号缺失', () => {
    const rows = [buildRow({ voucherNo: '' })];
    const result = parseJournalEntries(rows);
    expect(result.data[0].anomalyFlags?.some((f) => f.includes('FI-001'))).toBe(true);
  });

  it('识别科目编码缺失', () => {
    const rows = [buildRow({ accountCode: '' })];
    const result = parseJournalEntries(rows);
    expect(result.data[0].anomalyFlags?.some((f) => f.includes('FI-002'))).toBe(true);
  });

  it('识别摘要过短（少于2字符）', () => {
    const rows = [buildRow({ summary: 'A' })];
    const result = parseJournalEntries(rows);
    expect(result.data[0].anomalyFlags?.some((f) => f.includes('FI-003'))).toBe(true);
  });

  it('识别期末入账风险', () => {
    const rows = [buildRow({ voucherDate: '2023-12-29', summary: '期末调整' })];
    const result = parseJournalEntries(rows);
    expect(result.data[0].anomalyFlags?.some((f) => f.includes('AN-003'))).toBe(true);
  });

  it('识别非工作日入账', () => {
    // 2023-01-07 是周六
    const rows = [buildRow({ voucherDate: '2023-01-07' })];
    const result = parseJournalEntries(rows);
    expect(result.data[0].anomalyFlags?.some((f) => f.includes('AN-004'))).toBe(true);
  });

  it('识别敏感摘要关键词', () => {
    const rows = [buildRow({ summary: '暂估入账调整' })];
    const result = parseJournalEntries(rows);
    expect(result.data[0].anomalyFlags?.some((f) => f.includes('AN-005'))).toBe(true);
  });

  it('推断借方方向', () => {
    const rows = [buildRow({ debit: 10000, credit: 0 })];
    const result = parseJournalEntries(rows);
    expect(result.data[0].direction).toBe('debit');
  });

  it('推断贷方方向', () => {
    const rows = [buildRow({ debit: 0, credit: 5000 })];
    const result = parseJournalEntries(rows);
    expect(result.data[0].direction).toBe('credit');
  });
});

describe('aggregateVouchers', () => {
  it('将同凭证号分录聚合为 VoucherGroup', () => {
    const { data: entries } = parseJournalEntries([
      buildRow({ voucherNo: 'V001', accountCode: '1001', debit: 10000, credit: 0 }),
      buildRow({ voucherNo: 'V001', accountCode: '2202', debit: 0, credit: 10000 }),
      buildRow({ voucherNo: 'V002', accountCode: '6001', debit: 5000, credit: 0 }),
      buildRow({ voucherNo: 'V002', accountCode: '1001', debit: 0, credit: 5000 }),
    ]);

    const vouchers = aggregateVouchers(entries);
    expect(vouchers).toHaveLength(2);

    const v001 = vouchers.find((v) => v.voucherNo === 'V001');
    expect(v001?.totalDebit).toBe(10000);
    expect(v001?.totalCredit).toBe(10000);
    expect(v001?.isBalanced).toBe(true);
    expect(v001?.entries).toHaveLength(2);
  });

  it('识别借贷不平衡凭证', () => {
    const { data: entries } = parseJournalEntries([
      buildRow({ voucherNo: 'V003', accountCode: '1001', debit: 10000, credit: 0 }),
      buildRow({ voucherNo: 'V003', accountCode: '2202', debit: 0, credit: 9999 }), // 差1元
    ]);

    const vouchers = aggregateVouchers(entries);
    const v003 = vouchers.find((v) => v.voucherNo === 'V003');
    expect(v003?.isBalanced).toBe(false);
    expect(v003?.difference).toBeCloseTo(1, 2);
    expect(v003?.anomalyFlags?.length).toBeGreaterThan(0);
  });
});

describe('summarizeByAccount', () => {
  it('按科目汇总发生额', () => {
    const { data: entries } = parseJournalEntries([
      buildRow({ voucherNo: 'V001', accountCode: '1001', voucherDate: '2023-01-10', debit: 10000, credit: 0 }),
      buildRow({ voucherNo: 'V002', accountCode: '1001', voucherDate: '2023-02-15', debit: 20000, credit: 0 }),
      buildRow({ voucherNo: 'V003', accountCode: '2202', voucherDate: '2023-01-10', debit: 0, credit: 30000 }),
    ]);

    const summaries = summarizeByAccount(entries);
    const acct1001 = summaries.find((s) => s.accountCode === '1001');
    expect(acct1001?.totalDebit).toBe(30000);
    expect(acct1001?.totalCredit).toBe(0);
    expect(acct1001?.netMovement).toBe(30000);
    expect(acct1001?.monthlyBreakdown).toHaveLength(2);
  });
});

describe('extractAnomalies', () => {
  it('提取有异常标注的分录', () => {
    const { data: entries } = parseJournalEntries([
      buildRow({ debit: 5000, credit: 5000 }), // 借贷同时有值
      buildRow({ debit: 1000, credit: 0 }),     // 正常
    ]);

    const anomalies = extractAnomalies(entries);
    expect(anomalies.length).toBeGreaterThan(0);
  });
});
