/**
 * 科目余额表处理模块单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  parseTrialBalance,
  validateRollForward,
  validateBalanceDirections,
  reconcileWithJournal,
} from '../src/modules/TrialBalanceProcessor';
import type { TrialBalanceRow } from '../src/models';

const buildTBRow = (overrides: Partial<TrialBalanceRow> = {}): Record<string, unknown> => ({
  _sourceRow: 2,
  accountCode: '1001',
  accountName: '库存现金',
  beginDebit: 100000,
  beginCredit: 0,
  currentDebit: 50000,
  currentCredit: 30000,
  endDebit: 120000,
  endCredit: 0,
  ...overrides,
});

describe('parseTrialBalance', () => {
  it('正常解析余额表行', () => {
    const rows = [buildTBRow()];
    const result = parseTrialBalance(rows, '', '2023-12');
    expect(result.successRows).toBe(1);
    expect(result.data[0].accountCode).toBe('1001');
    expect(result.data[0].currentDebit).toBe(50000);
  });

  it('自动推断科目层级', () => {
    const rows = [
      buildTBRow({ accountCode: '1001' }),        // 4位 → 1级
      buildTBRow({ accountCode: '100101' }),       // 6位 → 2级
      buildTBRow({ accountCode: '10010101' }),     // 8位 → 3级
    ];
    const result = parseTrialBalance(rows);
    expect(result.data[0].level).toBe(1);
    expect(result.data[1].level).toBe(2);
    expect(result.data[2].level).toBe(3);
  });

  it('推断一级科目余额方向', () => {
    const assetRow = buildTBRow({ accountCode: '1001' }); // 1开头 → 借方
    const liabilityRow = buildTBRow({ accountCode: '2202' }); // 2开头 → 贷方

    const result = parseTrialBalance([assetRow, liabilityRow]);
    expect(result.data[0].normalDirection).toBe('debit');
    expect(result.data[1].normalDirection).toBe('credit');
  });

  it('科目编码为空时报错', () => {
    const rows = [buildTBRow({ accountCode: '' })];
    const result = parseTrialBalance(rows);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('科目编码不能为空');
  });
});

describe('validateRollForward', () => {
  it('正常期初期末滚动通过验证', () => {
    const rows = parseTrialBalance([
      buildTBRow({
        beginDebit: 100000,
        beginCredit: 0,
        currentDebit: 50000,
        currentCredit: 30000,
        endDebit: 120000, // 100000 + 50000 - 30000 = 120000 ✓
        endCredit: 0,
      }),
    ]).data;

    const issues = validateRollForward(rows);
    expect(issues).toHaveLength(0);
  });

  it('期初期末不平衡时报错', () => {
    const rows = parseTrialBalance([
      buildTBRow({
        beginDebit: 100000,
        beginCredit: 0,
        currentDebit: 50000,
        currentCredit: 30000,
        endDebit: 99999, // 期末错误（应为 120000）
        endCredit: 0,
      }),
    ]).data;

    const issues = validateRollForward(rows);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].reconcileType).toBe('period_roll_forward');
  });
});

describe('validateBalanceDirections', () => {
  it('应收账款出现贷方余额时报警告', () => {
    const rows = parseTrialBalance([
      buildTBRow({
        accountCode: '1122',
        accountName: '应收账款',
        endDebit: 0,
        endCredit: 50000, // 贷方余额异常
      }),
    ]).data;

    const issues = validateBalanceDirections(rows);
    expect(issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('应付账款出现借方余额时报警告', () => {
    const rows = parseTrialBalance([
      buildTBRow({
        accountCode: '2202',
        accountName: '应付账款',
        endDebit: 30000, // 借方余额异常
        endCredit: 0,
      }),
    ]).data;

    const issues = validateBalanceDirections(rows);
    expect(issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('正常余额方向无问题', () => {
    const rows = parseTrialBalance([
      buildTBRow({
        accountCode: '1001',
        accountName: '库存现金',
        endDebit: 50000,
        endCredit: 0,
      }),
    ]).data;

    const issues = validateBalanceDirections(rows);
    expect(issues).toHaveLength(0);
  });
});

describe('reconcileWithJournal', () => {
  it('余额表与序时账发生额一致时匹配', () => {
    const rows = parseTrialBalance([
      buildTBRow({
        accountCode: '1001',
        currentDebit: 50000,
        currentCredit: 30000,
      }),
    ]).data;

    const journalSummaries = [
      {
        accountCode: '1001',
        accountName: '库存现金',
        totalDebit: 50000,
        totalCredit: 30000,
        netMovement: 20000,
        voucherCount: 5,
        entryCount: 10,
        monthlyBreakdown: [],
      },
    ];

    const issues = reconcileWithJournal(rows, journalSummaries);
    expect(issues).toHaveLength(0);
    expect(rows[0].reconcileStatus).toBe('matched');
  });

  it('余额表与序时账发生额不一致时报错', () => {
    const rows = parseTrialBalance([
      buildTBRow({
        accountCode: '1001',
        currentDebit: 50000,
        currentCredit: 30000,
      }),
    ]).data;

    const journalSummaries = [
      {
        accountCode: '1001',
        accountName: '库存现金',
        totalDebit: 49000, // 差 1000
        totalCredit: 30000,
        netMovement: 19000,
        voucherCount: 5,
        entryCount: 10,
        monthlyBreakdown: [],
      },
    ];

    const issues = reconcileWithJournal(rows, journalSummaries);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(rows[0].reconcileStatus).toBe('unmatched');
  });

  it('序时账中无对应科目时报警告', () => {
    const rows = parseTrialBalance([
      buildTBRow({ accountCode: '9999', currentDebit: 10000, currentCredit: 0 }),
    ]).data;

    const issues = reconcileWithJournal(rows, []);
    // 9999 科目在序时账中不存在，应报警告（序时账金额为0，余额表有值）
    expect(issues.length).toBeGreaterThan(0);
  });
});
