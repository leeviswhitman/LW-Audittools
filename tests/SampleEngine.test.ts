/**
 * 一键抽凭（SampleEngine）单元测试
 */

import { describe, it, expect } from 'vitest';
import { sampleVouchers } from '../src/modules/SampleEngine';
import { parseJournalEntries } from '../src/modules/JournalProcessor';
import type { JournalEntryRow } from '../src/models';

const buildEntry = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  _sourceRow: 2,
  voucherDate: '2023-06-15',
  voucherNo: `V${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
  summary: '采购付款',
  accountCode: '1001',
  debit: 10000,
  credit: 0,
  ...overrides,
});

// 构建一批测试分录
function buildTestEntries(count: number): JournalEntryRow[] {
  const rows = Array.from({ length: count }, (_, i) =>
    buildEntry({
      voucherNo: `V${String(i + 1).padStart(4, '0')}`,
      debit: (i + 1) * 1000,
      voucherDate: i % 7 === 6 ? '2023-01-07' : '2023-06-15', // 每7条有一条周末
    })
  );
  return parseJournalEntries(rows).data;
}

describe('sampleVouchers - 重大项目全选', () => {
  it('金额超过重要性水平全部纳入样本', () => {
    const entries = buildTestEntries(20);
    const result = sampleVouchers(entries, {
      method: 'significant_item',
      materialityThreshold: 15000,
    });

    expect(result.samples.every((s) => s.humanReviewRequired === true)).toBe(true);
    expect(result.samples.every((s) => s.samplingMethod === 'significant_item')).toBe(true);
    // 所有样本金额应 >= 15000
    result.samples.forEach((s) => {
      const entry = entries.find((e) => e.voucherNo === s.sourceVoucherNo);
      expect((entry?.debit ?? 0) + (entry?.credit ?? 0)).toBeGreaterThanOrEqual(15000);
    });
  });
});

describe('sampleVouchers - Top N', () => {
  it('取前 N 条最大金额', () => {
    const entries = buildTestEntries(30);
    const result = sampleVouchers(entries, {
      method: 'top_n',
      topN: 10,
    });

    expect(result.sampleSize).toBe(10);
    expect(result.populationSize).toBe(30);
    expect(result.nonSampledCount).toBe(20);
  });
});

describe('sampleVouchers - 随机抽样', () => {
  it('随机抽取指定数量', () => {
    const entries = buildTestEntries(100);
    const result = sampleVouchers(entries, {
      method: 'random',
      randomCount: 25,
      randomSeed: 12345,
    });

    expect(result.sampleSize).toBe(25);
  });

  it('相同种子产生相同样本（可复现）', () => {
    const entries = buildTestEntries(100);
    const r1 = sampleVouchers(entries, { method: 'random', randomCount: 10, randomSeed: 42 });
    const r2 = sampleVouchers(entries, { method: 'random', randomCount: 10, randomSeed: 42 });

    expect(r1.samples.map((s) => s.sourceVoucherNo)).toEqual(
      r2.samples.map((s) => s.sourceVoucherNo)
    );
  });

  it('不同种子产生不同样本', () => {
    const entries = buildTestEntries(100);
    const r1 = sampleVouchers(entries, { method: 'random', randomCount: 20, randomSeed: 1 });
    const r2 = sampleVouchers(entries, { method: 'random', randomCount: 20, randomSeed: 2 });

    const s1 = new Set(r1.samples.map((s) => s.sourceVoucherNo));
    const s2 = new Set(r2.samples.map((s) => s.sourceVoucherNo));
    // 不同种子几乎不可能完全相同
    const overlap = [...s1].filter((v) => s2.has(v)).length;
    expect(overlap).toBeLessThan(20); // 不全重叠
  });
});

describe('sampleVouchers - 固定间隔', () => {
  it('按间隔抽样', () => {
    const entries = buildTestEntries(30);
    const result = sampleVouchers(entries, {
      method: 'systematic',
      interval: 3,
      startOffset: 0,
    });

    expect(result.sampleSize).toBe(10); // 30 / 3 = 10
  });
});

describe('sampleVouchers - 风险导向', () => {
  it('抽取非工作日入账', () => {
    const entries = buildTestEntries(20); // 每7条有一条周末
    const result = sampleVouchers(entries, {
      method: 'risk_oriented',
      includeWeekend: true,
      includePeriodEnd: false,
      includeSensitiveKeywords: false,
      includeManualVouchers: false,
      includeReversals: false,
    });

    expect(result.sampleSize).toBeGreaterThan(0);
    expect(result.samples.every((s) => s.samplingReason.includes('非工作日'))).toBe(true);
  });

  it('抽取含敏感关键词的摘要', () => {
    const entries = parseJournalEntries([
      buildEntry({ summary: '暂估收入', voucherNo: 'RISK001' }),
      buildEntry({ summary: '正常采购', voucherNo: 'NORMAL001' }),
      buildEntry({ summary: '冲销调整', voucherNo: 'RISK002' }),
    ]).data;

    const result = sampleVouchers(entries, {
      method: 'risk_oriented',
      includeSensitiveKeywords: true,
      includeWeekend: false,
      includePeriodEnd: false,
      includeManualVouchers: false,
      includeReversals: false,
    });

    const sampledNos = result.samples.map((s) => s.sourceVoucherNo);
    expect(sampledNos).toContain('RISK001');
    expect(sampledNos).toContain('RISK002');
  });
});

describe('sampleVouchers - 去重', () => {
  it('同一凭证号不会重复抽取', () => {
    const entries = parseJournalEntries([
      // 同一凭证号的两条分录
      buildEntry({ voucherNo: 'DUP001', accountCode: '1001', debit: 10000, credit: 0 }),
      buildEntry({ voucherNo: 'DUP001', accountCode: '2202', debit: 0, credit: 10000 }),
    ]).data;

    const result = sampleVouchers(entries, {
      method: 'significant_item',
      materialityThreshold: 0, // 全选
    });

    const sampledNos = result.samples.map((s) => s.sourceVoucherNo);
    const unique = new Set(sampledNos);
    // DUP001 只出现一次
    expect(sampledNos.filter((n) => n === 'DUP001')).toHaveLength(1);
    expect(unique.size).toBe(sampledNos.length);
  });
});

describe('sampleVouchers - 样本记录属性', () => {
  it('样本记录包含所有必要字段', () => {
    const entries = buildTestEntries(5);
    const result = sampleVouchers(entries, { method: 'top_n', topN: 3 });

    for (const s of result.samples) {
      expect(s.sampleNo).toBeTruthy();
      expect(s.sourceVoucherNo).toBeTruthy();
      expect(s.samplingMethod).toBe('top_n');
      expect(s.samplingReason).toBeTruthy();
      expect(s.batchId).toBeTruthy();
      expect(s.sampledAt).toBeTruthy();
      expect(s.humanReviewRequired).toBe(true); // 永远为 true
    }
  });

  it('样本编号格式正确（S001, S002...）', () => {
    const entries = buildTestEntries(3);
    const result = sampleVouchers(entries, { method: 'top_n', topN: 3 });

    expect(result.samples[0].sampleNo).toBe('S001');
    expect(result.samples[1].sampleNo).toBe('S002');
    expect(result.samples[2].sampleNo).toBe('S003');
  });
});
