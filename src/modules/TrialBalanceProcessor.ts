/**
 * 科目余额表标准化模块
 *
 * 将清洗后的原始数据转换为标准 TrialBalanceRow，执行：
 * 1. 多级科目层级识别
 * 2. 余额方向推断
 * 3. 期初期末滚动校验
 * 4. 父子级汇总校验
 * 5. 与序时账勾稽
 * 6. 输出差异和异常项
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  TrialBalanceRow,
  AccountLevel,
  BalanceDirection,
  ReconciliationIssue,
  DataImportResult,
} from '../models';
import { roundAmount, amountsEqual } from '../utils/numberUtils';
import { defaultRuleEngine } from '../engine/RuleEngine';
import { logAction } from '../utils/logger';
import type { AccountMovementSummary } from './JournalProcessor';

/** 余额方向正常性规则（科目编码前缀 → 正常方向） */
const NORMAL_DIRECTION_RULES: Array<{ prefix: string; direction: BalanceDirection }> = [
  { prefix: '1', direction: 'debit' },   // 资产类
  { prefix: '2', direction: 'credit' },  // 负债类
  { prefix: '3', direction: 'credit' },  // 所有者权益类
  { prefix: '4', direction: 'credit' },  // 成本类（通常借方，期末结转后为0）
  { prefix: '5', direction: 'credit' },  // 损益类-收入
  { prefix: '6', direction: 'debit' },   // 损益类-费用
];

/** 科目余额表处理结果 */
export interface TrialBalanceProcessResult {
  rows: TrialBalanceRow[];
  anomalyRows: TrialBalanceRow[];
  rollForwardIssues: ReconciliationIssue[];
  directionIssues: ReconciliationIssue[];
  parentChildIssues: ReconciliationIssue[];
  importResult: DataImportResult<TrialBalanceRow>;
}

/**
 * 将清洗后的记录数组转换为标准 TrialBalanceRow 数组
 */
export function parseTrialBalance(
  cleanedRows: Record<string, unknown>[],
  sourceSheet = '',
  periodKey = '',
  operator = 'system'
): DataImportResult<TrialBalanceRow> {
  const data: TrialBalanceRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const importedAt = new Date().toISOString();

  for (const row of cleanedRows) {
    const sourceRow = row['_sourceRow'] as number | undefined;

    try {
      const tbRow = mapToTrialBalanceRow(row, sourceSheet, periodKey, importedAt);

      // 规则引擎校验
      const ruleResults = defaultRuleEngine.validateTrialBalanceRow(tbRow, sourceRow);
      if (ruleResults.length > 0) {
        tbRow.anomalyFlags = ruleResults.map((r) => `[${r.ruleId}] ${r.message}`);
      }

      data.push(tbRow);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ row: sourceRow ?? 0, message: msg });
    }
  }

  // 推断科目层级
  inferAccountLevels(data);

  logAction('standardize_trial_balance', `余额表标准化：共 ${data.length} 行科目，${errors.length} 条错误`, {
    operator,
    moduleName: 'TrialBalanceProcessor',
    affectedCount: data.length,
    result: errors.length === 0 ? 'success' : 'partial',
  });

  return {
    data,
    errors,
    cleaningLog: [],
    totalRows: cleanedRows.length,
    successRows: data.length,
    skippedRows: cleanedRows.length - data.length - errors.length,
    importedAt,
  };
}

/**
 * 映射清洗后记录到 TrialBalanceRow
 */
function mapToTrialBalanceRow(
  row: Record<string, unknown>,
  sourceSheet: string,
  periodKey: string,
  importedAt: string
): TrialBalanceRow {
  const accountCode = String(row['accountCode'] ?? '').trim();
  if (!accountCode) {
    throw new Error('科目编码不能为空');
  }

  const beginDebit = roundAmount(Number(row['beginDebit'] ?? 0));
  const beginCredit = roundAmount(Number(row['beginCredit'] ?? 0));
  const currentDebit = roundAmount(Number(row['currentDebit'] ?? 0));
  const currentCredit = roundAmount(Number(row['currentCredit'] ?? 0));
  const endDebit = roundAmount(Number(row['endDebit'] ?? 0));
  const endCredit = roundAmount(Number(row['endCredit'] ?? 0));

  // 推断余额方向
  const normalDirection = inferNormalDirection(accountCode);

  return {
    id: uuidv4(),
    accountCode,
    accountName: String(row['accountName'] ?? '').trim(),
    periodKey: periodKey || String(row['periodKey'] ?? ''),
    parentCode: toStringOrUndef(row['parentCode']),
    normalDirection,
    beginDebit,
    beginCredit,
    currentDebit,
    currentCredit,
    endDebit,
    endCredit,
    netMovement: roundAmount(currentDebit - currentCredit),
    reconcileStatus: 'pending',
    anomalyFlags: [],
    sourceRow: row['_sourceRow'] as number | undefined,
    sourceSheet,
    importedAt,
  };
}

/**
 * 自动推断科目的正常余额方向（根据科目编码前缀）
 */
function inferNormalDirection(accountCode: string): BalanceDirection {
  for (const rule of NORMAL_DIRECTION_RULES) {
    if (accountCode.startsWith(rule.prefix)) {
      return rule.direction;
    }
  }
  return 'debit'; // 默认借方
}

/**
 * 自动推断科目层级（基于科目编码点位或长度）
 * 规则：
 * - 4位及以内为一级（如 "1001"）
 * - 6-7位为二级（如 "100101"）
 * - 8位以上为三级及以下
 * - 含 "." 时按点分隔数推断（如 "1001.01" = 2级）
 */
function inferAccountLevels(rows: TrialBalanceRow[]): void {
  for (const row of rows) {
    const code = row.accountCode;
    if (code.includes('.')) {
      const parts = code.split('.');
      row.level = Math.min(parts.length, 5) as AccountLevel;
    } else {
      const len = code.length;
      if (len <= 4) row.level = 1;
      else if (len <= 6) row.level = 2;
      else if (len <= 8) row.level = 3;
      else row.level = 4;
    }

    // 推断 parentCode（若未提供）
    if (!row.parentCode && row.level && row.level > 1) {
      if (code.includes('.')) {
        const parts = code.split('.');
        row.parentCode = parts.slice(0, -1).join('.');
      } else {
        // 按长度截取父级
        const parentLen = code.length <= 6 ? 4 : code.length - 2;
        row.parentCode = code.substring(0, parentLen);
      }
    }
  }
}

/**
 * 校验期初期末滚动（period roll-forward）
 * 期初 + 本期借方 - 本期贷方 = 期末（借方）
 * 或
 * 期初贷方 + 本期贷方 - 本期借方 = 期末贷方
 *
 * @param rows 余额表行数组
 * @returns 差异列表
 */
export function validateRollForward(rows: TrialBalanceRow[]): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  for (const row of rows) {
    // 净发生额 = 本期借方 - 本期贷方
    const netMovement = row.currentDebit - row.currentCredit;

    // 期末借方余额 = max(0, 期初借方 - 期初贷方 + 净发生额)
    const expectedNet = (row.beginDebit - row.beginCredit) + netMovement;
    const expectedEndDebit = Math.max(0, expectedNet);
    const expectedEndCredit = Math.max(0, -expectedNet);

    const debitOk = amountsEqual(row.endDebit, expectedEndDebit, 0.01);
    const creditOk = amountsEqual(row.endCredit, expectedEndCredit, 0.01);

    if (!debitOk || !creditOk) {
      issues.push({
        id: uuidv4(),
        reconcileType: 'period_roll_forward',
        description: `科目 ${row.accountCode}（${row.accountName}）期初期末滚动不平：
          期初余额（借 ${row.beginDebit}，贷 ${row.beginCredit}）
          + 净发生额（${netMovement.toFixed(2)}）
          = 期末应为（借 ${expectedEndDebit.toFixed(2)}，贷 ${expectedEndCredit.toFixed(2)}）
          实际期末（借 ${row.endDebit}，贷 ${row.endCredit}）`,
        severity: 'error',
        accountCode: row.accountCode,
        periodKey: row.periodKey,
        trialBalanceAmount: row.endDebit - row.endCredit,
        journalAmount: expectedEndDebit - expectedEndCredit,
        difference: roundAmount(
          Math.abs(row.endDebit - expectedEndDebit) +
          Math.abs(row.endCredit - expectedEndCredit)
        ),
        detectedAt: new Date().toISOString(),
        ruleId: 'RC-002',
        humanReviewRequired: true,
      });
    }
  }

  return issues;
}

/**
 * 校验余额方向异常
 * @param rows 余额表行数组
 * @returns 差异列表
 */
export function validateBalanceDirections(rows: TrialBalanceRow[]): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  for (const row of rows) {
    const direction = row.normalDirection;
    if (!direction || direction === 'none') continue;

    if (direction === 'debit' && row.endCredit > 0.01) {
      issues.push({
        id: uuidv4(),
        reconcileType: 'period_roll_forward',
        description: `科目 ${row.accountCode}（${row.accountName}）正常应为借方余额，但期末出现贷方余额 ${row.endCredit}，需关注`,
        severity: 'warning',
        accountCode: row.accountCode,
        periodKey: row.periodKey,
        difference: row.endCredit,
        detectedAt: new Date().toISOString(),
        humanReviewRequired: true,
      });
    }

    if (direction === 'credit' && row.endDebit > 0.01) {
      issues.push({
        id: uuidv4(),
        reconcileType: 'period_roll_forward',
        description: `科目 ${row.accountCode}（${row.accountName}）正常应为贷方余额，但期末出现借方余额 ${row.endDebit}，需关注`,
        severity: 'warning',
        accountCode: row.accountCode,
        periodKey: row.periodKey,
        difference: row.endDebit,
        detectedAt: new Date().toISOString(),
        humanReviewRequired: true,
      });
    }
  }

  return issues;
}

/**
 * 与序时账发生额进行勾稽
 * @param tbRows 余额表行数组
 * @param journalSummaries 序时账按科目汇总结果
 * @returns 勾稽差异列表
 */
export function reconcileWithJournal(
  tbRows: TrialBalanceRow[],
  journalSummaries: AccountMovementSummary[]
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  // 建立序时账汇总索引
  const journalIndex = new Map(journalSummaries.map((s) => [s.accountCode, s]));

  for (const row of tbRows) {
    const journal = journalIndex.get(row.accountCode);
    const tbDebit = row.currentDebit;
    const tbCredit = row.currentCredit;
    const jDebit = journal?.totalDebit ?? 0;
    const jCredit = journal?.totalCredit ?? 0;

    const debitOk = amountsEqual(tbDebit, jDebit, 0.01);
    const creditOk = amountsEqual(tbCredit, jCredit, 0.01);

    if (!debitOk || !creditOk) {
      const debitDiff = roundAmount(tbDebit - jDebit);
      const creditDiff = roundAmount(tbCredit - jCredit);

      issues.push({
        id: uuidv4(),
        reconcileType: 'trial_balance_vs_journal',
        description: `科目 ${row.accountCode}（${row.accountName}）余额表与序时账本期发生额不符：
          余额表借方 ${tbDebit}，序时账借方 ${jDebit}，差额 ${debitDiff}；
          余额表贷方 ${tbCredit}，序时账贷方 ${jCredit}，差额 ${creditDiff}`,
        severity: journal ? 'error' : 'warning',
        accountCode: row.accountCode,
        periodKey: row.periodKey,
        trialBalanceAmount: tbDebit - tbCredit,
        journalAmount: jDebit - jCredit,
        difference: roundAmount(Math.abs(debitDiff) + Math.abs(creditDiff)),
        detectedAt: new Date().toISOString(),
        ruleId: 'RC-003',
        humanReviewRequired: true,
      });
    } else {
      // 标记已匹配
      row.reconcileStatus = 'matched';
    }

    // 标记未匹配
    if (issues.find((i) => i.accountCode === row.accountCode)) {
      row.reconcileStatus = 'unmatched';
    }
  }

  return issues;
}

function toStringOrUndef(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v).trim() || undefined;
}
