/**
 * 勾稽校验模块
 *
 * 执行各类勾稽校验，包括：
 * 1. 科目余额表与序时账勾稽
 * 2. 借贷平衡校验
 * 3. 期初期末滚动校验
 * 4. 同一凭证借贷平衡校验
 * 5. 科目编码与名称一致性校验
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  JournalEntryRow,
  TrialBalanceRow,
  VoucherGroup,
  ReconciliationIssue,
} from '../models';
import { roundAmount, amountsEqual } from '../utils/numberUtils';
import { logAction } from '../utils/logger';

/** 勾稽汇总结果 */
export interface ReconciliationSummary {
  issues: ReconciliationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  hasErrors: boolean;
  checkedAt: string;
  operator: string;
}

/**
 * 执行完整勾稽校验套件
 *
 * @param tbRows 余额表行
 * @param entries 序时账分录
 * @param vouchers 凭证聚合对象
 * @param operator 操作者
 * @returns 完整勾稽结果
 */
export function runFullReconciliation(
  tbRows: TrialBalanceRow[],
  entries: JournalEntryRow[],
  vouchers: VoucherGroup[],
  operator = 'system'
): ReconciliationSummary {
  const allIssues: ReconciliationIssue[] = [];

  // 1. 凭证借贷平衡
  allIssues.push(...checkVoucherBalance(vouchers));

  // 2. 余额表期初期末滚动
  allIssues.push(...checkTrialBalanceRollForward(tbRows));

  // 3. 余额表与序时账勾稽
  allIssues.push(...checkTrialVsJournal(tbRows, entries));

  // 4. 科目编码与名称一致性
  allIssues.push(...checkAccountConsistency(entries));

  // 5. 科目余额表借贷合计平衡
  allIssues.push(...checkTrialBalanceOverall(tbRows));

  const errorCount = allIssues.filter((i) => i.severity === 'error').length;
  const warningCount = allIssues.filter((i) => i.severity === 'warning').length;
  const infoCount = allIssues.filter((i) => i.severity === 'info').length;

  logAction('reconcile', `勾稽校验完成：${errorCount} 个错误，${warningCount} 个警告，${infoCount} 个提示`, {
    operator,
    moduleName: 'ReconciliationEngine',
    affectedCount: allIssues.length,
    result: errorCount === 0 ? 'success' : 'partial',
  });

  return {
    issues: allIssues,
    errorCount,
    warningCount,
    infoCount,
    hasErrors: errorCount > 0,
    checkedAt: new Date().toISOString(),
    operator,
  };
}

/**
 * 1. 凭证借贷平衡校验（VoucherGroup 级别）
 */
export function checkVoucherBalance(
  vouchers: VoucherGroup[]
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  for (const v of vouchers) {
    if (!v.isBalanced) {
      issues.push({
        id: uuidv4(),
        reconcileType: 'voucher_balance',
        description: `凭证 ${v.voucherNo}（${v.voucherDate}）借贷不平衡：借方合计 ${v.totalDebit}，贷方合计 ${v.totalCredit}，差额 ${v.difference}`,
        severity: 'error',
        accountCode: undefined,
        periodKey: v.voucherDate?.substring(0, 7),
        difference: v.difference,
        voucherNos: [v.voucherNo],
        detectedAt: new Date().toISOString(),
        ruleId: 'RC-001',
        humanReviewRequired: true,
      });
    }
  }
  return issues;
}

/**
 * 2. 余额表期初期末滚动校验
 */
export function checkTrialBalanceRollForward(
  tbRows: TrialBalanceRow[]
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  for (const row of tbRows) {
    const netMovement = row.currentDebit - row.currentCredit;
    const expectedNet = (row.beginDebit - row.beginCredit) + netMovement;
    const expectedEndDebit = Math.max(0, expectedNet);
    const expectedEndCredit = Math.max(0, -expectedNet);

    const debitOk = amountsEqual(row.endDebit, expectedEndDebit, 0.01);
    const creditOk = amountsEqual(row.endCredit, expectedEndCredit, 0.01);

    if (!debitOk || !creditOk) {
      const diff = roundAmount(
        Math.abs(row.endDebit - expectedEndDebit) +
        Math.abs(row.endCredit - expectedEndCredit)
      );
      issues.push({
        id: uuidv4(),
        reconcileType: 'period_roll_forward',
        description: `科目 ${row.accountCode}（${row.accountName}）期初期末滚动不平，差额 ${diff}`,
        severity: 'error',
        accountCode: row.accountCode,
        periodKey: row.periodKey,
        trialBalanceAmount: row.endDebit - row.endCredit,
        journalAmount: expectedEndDebit - expectedEndCredit,
        difference: diff,
        detectedAt: new Date().toISOString(),
        ruleId: 'RC-002',
        humanReviewRequired: true,
      });
    }
  }
  return issues;
}

/**
 * 3. 余额表与序时账本期发生额勾稽
 */
export function checkTrialVsJournal(
  tbRows: TrialBalanceRow[],
  entries: JournalEntryRow[]
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  // 按科目汇总序时账
  const journalSummary = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) {
    if (!e.accountCode) continue;
    const existing = journalSummary.get(e.accountCode);
    if (existing) {
      existing.debit = roundAmount(existing.debit + e.debit);
      existing.credit = roundAmount(existing.credit + e.credit);
    } else {
      journalSummary.set(e.accountCode, { debit: e.debit, credit: e.credit });
    }
  }

  for (const row of tbRows) {
    const jData = journalSummary.get(row.accountCode);
    const jDebit = jData?.debit ?? 0;
    const jCredit = jData?.credit ?? 0;

    const debitOk = amountsEqual(row.currentDebit, jDebit, 0.01);
    const creditOk = amountsEqual(row.currentCredit, jCredit, 0.01);

    if (!debitOk || !creditOk) {
      const diff = roundAmount(
        Math.abs(row.currentDebit - jDebit) + Math.abs(row.currentCredit - jCredit)
      );
      issues.push({
        id: uuidv4(),
        reconcileType: 'trial_balance_vs_journal',
        description: `科目 ${row.accountCode}（${row.accountName}）余额表本期发生额与序时账汇总不符：
          余额表借方 ${row.currentDebit} vs 序时账 ${jDebit}（差 ${roundAmount(row.currentDebit - jDebit)}）；
          余额表贷方 ${row.currentCredit} vs 序时账 ${jCredit}（差 ${roundAmount(row.currentCredit - jCredit)}）`,
        severity: jData ? 'error' : 'warning',
        accountCode: row.accountCode,
        periodKey: row.periodKey,
        trialBalanceAmount: row.currentDebit - row.currentCredit,
        journalAmount: jDebit - jCredit,
        difference: diff,
        detectedAt: new Date().toISOString(),
        ruleId: 'RC-003',
        humanReviewRequired: true,
      });
      row.reconcileStatus = 'unmatched';
    } else {
      row.reconcileStatus = 'matched';
    }
  }
  return issues;
}

/**
 * 4. 科目编码与名称一致性校验
 * 同一科目编码对应多个不同科目名称时报警
 */
export function checkAccountConsistency(
  entries: JournalEntryRow[]
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  // accountCode → Set<accountName>
  const codeToNames = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.accountCode || !e.accountName) continue;
    const existing = codeToNames.get(e.accountCode);
    if (existing) {
      existing.add(e.accountName);
    } else {
      codeToNames.set(e.accountCode, new Set([e.accountName]));
    }
  }

  for (const [code, names] of codeToNames) {
    if (names.size > 1) {
      issues.push({
        id: uuidv4(),
        reconcileType: 'account_name_consistency',
        description: `科目编码 ${code} 对应多个名称：${[...names].join('、')}，请确认是否存在科目名称不一致`,
        severity: 'warning',
        accountCode: code,
        detectedAt: new Date().toISOString(),
        humanReviewRequired: true,
      });
    }
  }
  return issues;
}

/**
 * 5. 余额表整体借贷合计平衡校验（仅一级科目）
 */
export function checkTrialBalanceOverall(
  tbRows: TrialBalanceRow[]
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  // 仅取一级科目（level === 1 或不含父级科目的行）
  const level1Rows = tbRows.filter((r) => r.level === 1 || !r.parentCode);
  if (level1Rows.length === 0) return [];

  const totalBeginDebit = roundAmount(level1Rows.reduce((s, r) => s + r.beginDebit, 0));
  const totalBeginCredit = roundAmount(level1Rows.reduce((s, r) => s + r.beginCredit, 0));
  const totalEndDebit = roundAmount(level1Rows.reduce((s, r) => s + r.endDebit, 0));
  const totalEndCredit = roundAmount(level1Rows.reduce((s, r) => s + r.endCredit, 0));

  if (!amountsEqual(totalBeginDebit, totalBeginCredit, 0.01)) {
    issues.push({
      id: uuidv4(),
      reconcileType: 'debit_credit_balance',
      description: `余额表期初借贷合计不平衡：借方合计 ${totalBeginDebit}，贷方合计 ${totalBeginCredit}，差额 ${roundAmount(totalBeginDebit - totalBeginCredit)}`,
      severity: 'error',
      difference: roundAmount(Math.abs(totalBeginDebit - totalBeginCredit)),
      detectedAt: new Date().toISOString(),
      humanReviewRequired: true,
    });
  }

  if (!amountsEqual(totalEndDebit, totalEndCredit, 0.01)) {
    issues.push({
      id: uuidv4(),
      reconcileType: 'debit_credit_balance',
      description: `余额表期末借贷合计不平衡：借方合计 ${totalEndDebit}，贷方合计 ${totalEndCredit}，差额 ${roundAmount(totalEndDebit - totalEndCredit)}`,
      severity: 'error',
      difference: roundAmount(Math.abs(totalEndDebit - totalEndCredit)),
      detectedAt: new Date().toISOString(),
      humanReviewRequired: true,
    });
  }

  return issues;
}
