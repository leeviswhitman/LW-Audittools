/**
 * 勾稽校验模块单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  checkVoucherBalance,
  checkTrialBalanceRollForward,
  checkTrialVsJournal,
  checkAccountConsistency,
  checkTrialBalanceOverall,
} from '../src/modules/ReconciliationEngine';
import { aggregateVouchers, parseJournalEntries } from '../src/modules/JournalProcessor';
import { parseTrialBalance } from '../src/modules/TrialBalanceProcessor';

describe('checkVoucherBalance', () => {
  it('借贷平衡的凭证通过校验', () => {
    const { data: entries } = parseJournalEntries([
      { _sourceRow: 1, voucherDate: '2023-01-01', voucherNo: 'V001', accountCode: '1001', summary: '测试', debit: 10000, credit: 0 },
      { _sourceRow: 2, voucherDate: '2023-01-01', voucherNo: 'V001', accountCode: '2202', summary: '测试', debit: 0, credit: 10000 },
    ]);
    const vouchers = aggregateVouchers(entries);
    const issues = checkVoucherBalance(vouchers);
    expect(issues).toHaveLength(0);
  });

  it('借贷不平衡的凭证报错', () => {
    const { data: entries } = parseJournalEntries([
      { _sourceRow: 1, voucherDate: '2023-01-01', voucherNo: 'V002', accountCode: '1001', summary: '测试', debit: 10000, credit: 0 },
      { _sourceRow: 2, voucherDate: '2023-01-01', voucherNo: 'V002', accountCode: '2202', summary: '测试', debit: 0, credit: 9000 }, // 差1000
    ]);
    const vouchers = aggregateVouchers(entries);
    const issues = checkVoucherBalance(vouchers);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].difference).toBeCloseTo(1000, 1);
  });
});

describe('checkTrialBalanceRollForward', () => {
  it('期初期末滚动正确的通过', () => {
    const { data: rows } = parseTrialBalance([
      {
        _sourceRow: 1, accountCode: '1001', accountName: '现金',
        beginDebit: 100000, beginCredit: 0,
        currentDebit: 50000, currentCredit: 30000,
        endDebit: 120000, endCredit: 0, // 100000 + 50000 - 30000 = 120000 ✓
      },
    ]);
    const issues = checkTrialBalanceRollForward(rows);
    expect(issues).toHaveLength(0);
  });

  it('期初期末滚动错误时报错', () => {
    const { data: rows } = parseTrialBalance([
      {
        _sourceRow: 1, accountCode: '1001', accountName: '现金',
        beginDebit: 100000, beginCredit: 0,
        currentDebit: 50000, currentCredit: 30000,
        endDebit: 110000, endCredit: 0, // 错误，应为 120000
      },
    ]);
    const issues = checkTrialBalanceRollForward(rows);
    expect(issues).toHaveLength(1);
    expect(issues[0].difference).toBeCloseTo(10000, 1);
  });
});

describe('checkTrialVsJournal', () => {
  it('余额表与序时账一致时无差异', () => {
    const { data: tbRows } = parseTrialBalance([
      {
        _sourceRow: 1, accountCode: '1001', accountName: '现金',
        beginDebit: 0, beginCredit: 0,
        currentDebit: 50000, currentCredit: 30000,
        endDebit: 20000, endCredit: 0,
      },
    ]);
    const { data: entries } = parseJournalEntries([
      { _sourceRow: 1, voucherDate: '2023-01-01', voucherNo: 'V001', accountCode: '1001', summary: '测试', debit: 50000, credit: 0 },
      { _sourceRow: 2, voucherDate: '2023-01-02', voucherNo: 'V002', accountCode: '1001', summary: '测试', debit: 0, credit: 30000 },
    ]);

    const issues = checkTrialVsJournal(tbRows, entries);
    expect(issues).toHaveLength(0);
    expect(tbRows[0].reconcileStatus).toBe('matched');
  });

  it('余额表与序时账不一致时报差异', () => {
    const { data: tbRows } = parseTrialBalance([
      {
        _sourceRow: 1, accountCode: '1001', accountName: '现金',
        beginDebit: 0, beginCredit: 0,
        currentDebit: 50000, currentCredit: 30000,
        endDebit: 20000, endCredit: 0,
      },
    ]);
    const { data: entries } = parseJournalEntries([
      // 序时账借方少 1000
      { _sourceRow: 1, voucherDate: '2023-01-01', voucherNo: 'V001', accountCode: '1001', summary: '测试', debit: 49000, credit: 0 },
      { _sourceRow: 2, voucherDate: '2023-01-02', voucherNo: 'V002', accountCode: '1001', summary: '测试', debit: 0, credit: 30000 },
    ]);

    const issues = checkTrialVsJournal(tbRows, entries);
    expect(issues).toHaveLength(1);
    expect(issues[0].difference).toBeCloseTo(1000, 1);
    expect(tbRows[0].reconcileStatus).toBe('unmatched');
  });
});

describe('checkAccountConsistency', () => {
  it('同一科目编码对应多个名称时报警告', () => {
    const { data: entries } = parseJournalEntries([
      { _sourceRow: 1, voucherDate: '2023-01-01', voucherNo: 'V001', accountCode: '1001', accountName: '库存现金', summary: '测试', debit: 1000, credit: 0 },
      { _sourceRow: 2, voucherDate: '2023-01-02', voucherNo: 'V002', accountCode: '1001', accountName: '现金及现金等价物', summary: '测试', debit: 2000, credit: 0 }, // 同编码不同名称
    ]);

    const issues = checkAccountConsistency(entries);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('同一科目编码名称一致时无问题', () => {
    const { data: entries } = parseJournalEntries([
      { _sourceRow: 1, voucherDate: '2023-01-01', voucherNo: 'V001', accountCode: '1001', accountName: '库存现金', summary: '测试', debit: 1000, credit: 0 },
      { _sourceRow: 2, voucherDate: '2023-01-02', voucherNo: 'V002', accountCode: '1001', accountName: '库存现金', summary: '测试', debit: 2000, credit: 0 },
    ]);

    const issues = checkAccountConsistency(entries);
    expect(issues).toHaveLength(0);
  });
});

describe('checkTrialBalanceOverall', () => {
  it('整体借贷平衡通过', () => {
    const { data: rows } = parseTrialBalance([
      { _sourceRow: 1, accountCode: '1001', accountName: '现金', beginDebit: 100000, beginCredit: 0, currentDebit: 50000, currentCredit: 30000, endDebit: 120000, endCredit: 0 },
      { _sourceRow: 2, accountCode: '2202', accountName: '应付账款', beginDebit: 0, beginCredit: 100000, currentDebit: 30000, currentCredit: 50000, endDebit: 0, endCredit: 120000 },
    ]);

    const issues = checkTrialBalanceOverall(rows);
    expect(issues).toHaveLength(0);
  });

  it('整体借贷不平衡时报错', () => {
    const { data: rows } = parseTrialBalance([
      { _sourceRow: 1, accountCode: '1001', accountName: '现金', beginDebit: 100000, beginCredit: 0, currentDebit: 50000, currentCredit: 30000, endDebit: 120000, endCredit: 0 },
      { _sourceRow: 2, accountCode: '2202', accountName: '应付账款', beginDebit: 0, beginCredit: 50000, currentDebit: 30000, currentCredit: 50000, endDebit: 0, endCredit: 70000 },
      // 期初：借 100000 ≠ 贷 50000，整体不平
    ]);

    const issues = checkTrialBalanceOverall(rows);
    expect(issues.some((i) => i.reconcileType === 'debit_credit_balance')).toBe(true);
  });
});
