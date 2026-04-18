/**
 * 序时账标准化模块
 *
 * 将清洗后的原始数据行转换为标准 JournalEntryRow 对象，
 * 执行数据完整性校验和异常识别，生成凭证聚合对象（VoucherGroup）。
 *
 * 主要功能：
 * 1. 字段映射到标准 JournalEntryRow
 * 2. 异常分录识别（借贷同时有值、科目缺失等）
 * 3. 凭证维度聚合（按凭证号聚合分录）
 * 4. 按月汇总发生额
 * 5. 异常分录提取
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  JournalEntryRow,
  VoucherGroup,
  DataImportResult,
} from '../models';
import { roundAmount } from '../utils/numberUtils';
import { getMonthKey, isReasonableDate } from '../utils/dateUtils';
import { defaultRuleEngine } from '../engine/RuleEngine';
import { logAction } from '../utils/logger';

/** 月度发生额汇总 */
export interface MonthlyMovement {
  monthKey: string;      // YYYY-MM
  accountCode: string;
  accountName?: string;
  totalDebit: number;
  totalCredit: number;
  voucherCount: number;
  entryCount: number;
}

/** 科目发生额汇总 */
export interface AccountMovementSummary {
  accountCode: string;
  accountName?: string;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  voucherCount: number;
  entryCount: number;
  monthlyBreakdown: MonthlyMovement[];
}

/** 序时账处理结果 */
export interface JournalProcessResult {
  entries: JournalEntryRow[];
  vouchers: VoucherGroup[];
  accountSummaries: AccountMovementSummary[];
  anomalies: JournalEntryRow[];
  totalDebit: number;
  totalCredit: number;
  isOverallBalanced: boolean;
  importResult: DataImportResult<JournalEntryRow>;
}

/**
 * 将清洗后的记录数组转换为标准 JournalEntryRow 数组
 *
 * @param cleanedRows 经过 DataCleaner 处理的记录数组
 * @param sourceSheet 数据来源 Sheet 名
 * @param operator 操作者
 * @returns JournalEntryRow 数组
 */
export function parseJournalEntries(
  cleanedRows: Record<string, unknown>[],
  sourceSheet = '',
  operator = 'system'
): DataImportResult<JournalEntryRow> {
  const data: JournalEntryRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const importedAt = new Date().toISOString();

  for (const row of cleanedRows) {
    const sourceRow = row['_sourceRow'] as number | undefined;

    try {
      const entry = mapToJournalEntry(row, sourceSheet, importedAt);

      // 执行规则引擎校验
      const ruleResults = defaultRuleEngine.validateJournalEntry(entry, sourceRow);
      if (ruleResults.length > 0) {
        entry.anomalyFlags = ruleResults.map((r) => `[${r.ruleId}] ${r.message}`);
      }

      data.push(entry);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ row: sourceRow ?? 0, message: msg });
    }
  }

  logAction('standardize_journal', `序时账标准化：共 ${data.length} 条分录，${errors.length} 条错误`, {
    operator,
    moduleName: 'JournalProcessor',
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
 * 将一条清洗后的记录映射为 JournalEntryRow
 */
function mapToJournalEntry(
  row: Record<string, unknown>,
  sourceSheet: string,
  importedAt: string
): JournalEntryRow {
  const debit = roundAmount(Number(row['debit'] ?? 0));
  const credit = roundAmount(Number(row['credit'] ?? 0));

  return {
    id: uuidv4(),
    voucherDate: String(row['voucherDate'] ?? ''),
    voucherType: toString(row['voucherType']),
    voucherNo: String(row['voucherNo'] ?? ''),
    entrySeq: toNumberOrUndef(row['entrySeq']),
    summary: toString(row['summary']),
    accountCode: String(row['accountCode'] ?? ''),
    accountName: toString(row['accountName']),
    auxiliaryInfo: toString(row['auxiliaryInfo']),
    debit,
    credit,
    direction: debit > 0 ? 'debit' : credit > 0 ? 'credit' : 'none',
    balance: toNumberOrUndef(row['balance']),
    counterAccountCode: toString(row['counterAccountCode']),
    counterAccountName: toString(row['counterAccountName']),
    documentNo: toString(row['documentNo']),
    operator: toString(row['operator']),
    department: toString(row['department']),
    partyName: toString(row['partyName']),
    isManual: row['isManual'] === true || row['isManual'] === '是',
    isReversal: row['isReversal'] === true || row['isReversal'] === '是' || debit < 0 || credit < 0,
    sourceRow: toNumberOrUndef(row['_sourceRow']),
    sourceSheet,
    importedAt,
    anomalyFlags: [],
  };
}

/**
 * 按凭证号聚合分录，生成 VoucherGroup 列表
 *
 * @param entries 序时账分录数组
 * @returns VoucherGroup 数组
 */
export function aggregateVouchers(entries: JournalEntryRow[]): VoucherGroup[] {
  // 按 voucherNo + voucherDate 分组
  const groups = new Map<string, JournalEntryRow[]>();

  for (const entry of entries) {
    const key = `${entry.voucherNo}__${entry.voucherDate}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const vouchers: VoucherGroup[] = [];

  for (const [, groupEntries] of groups) {
    const first = groupEntries[0];
    const totalDebit = roundAmount(
      groupEntries.reduce((sum, e) => sum + e.debit, 0)
    );
    const totalCredit = roundAmount(
      groupEntries.reduce((sum, e) => sum + e.credit, 0)
    );
    const difference = roundAmount(Math.abs(totalDebit - totalCredit));
    const isBalanced = difference < 0.005;

    const accountCodes = [...new Set(groupEntries.map((e) => e.accountCode).filter(Boolean))];
    const documentNos = [...new Set(
      groupEntries.map((e) => e.documentNo).filter((d): d is string => !!d)
    )];

    const voucher: VoucherGroup = {
      id: uuidv4(),
      voucherNo: first.voucherNo,
      voucherDate: first.voucherDate,
      voucherType: first.voucherType,
      entries: groupEntries,
      totalDebit,
      totalCredit,
      isBalanced,
      difference,
      summary: first.summary,
      accountCodes,
      documentNos: documentNos.length > 0 ? documentNos : undefined,
      hasManualEntry: groupEntries.some((e) => e.isManual),
      hasReversal: groupEntries.some((e) => e.isReversal),
      anomalyFlags: [],
    };

    // 规则引擎校验凭证平衡
    const voucherRules = defaultRuleEngine.validateVoucher(voucher);
    if (voucherRules.length > 0) {
      voucher.anomalyFlags = voucherRules.map((r) => `[${r.ruleId}] ${r.message}`);
    }

    vouchers.push(voucher);
  }

  // 按日期+凭证号排序
  return vouchers.sort((a, b) => {
    const dateCmp = a.voucherDate.localeCompare(b.voucherDate);
    if (dateCmp !== 0) return dateCmp;
    return a.voucherNo.localeCompare(b.voucherNo);
  });
}

/**
 * 按科目汇总发生额（含月度拆分）
 *
 * @param entries 序时账分录数组
 * @returns 科目发生额汇总数组
 */
export function summarizeByAccount(
  entries: JournalEntryRow[]
): AccountMovementSummary[] {
  // 按科目编码分组
  const accountMap = new Map<
    string,
    {
      accountName?: string;
      entries: JournalEntryRow[];
      voucherNos: Set<string>;
    }
  >();

  for (const entry of entries) {
    const code = entry.accountCode;
    if (!code) continue;

    const existing = accountMap.get(code);
    if (existing) {
      existing.entries.push(entry);
      existing.voucherNos.add(entry.voucherNo);
      if (!existing.accountName && entry.accountName) {
        existing.accountName = entry.accountName;
      }
    } else {
      accountMap.set(code, {
        accountName: entry.accountName,
        entries: [entry],
        voucherNos: new Set([entry.voucherNo]),
      });
    }
  }

  const summaries: AccountMovementSummary[] = [];

  for (const [code, { accountName, entries: acctEntries, voucherNos }] of accountMap) {
    const totalDebit = roundAmount(acctEntries.reduce((s, e) => s + e.debit, 0));
    const totalCredit = roundAmount(acctEntries.reduce((s, e) => s + e.credit, 0));

    // 月度拆分
    const monthlyMap = new Map<string, { debit: number; credit: number; entries: JournalEntryRow[] }>();
    for (const entry of acctEntries) {
      if (!entry.voucherDate) continue;
      const mk = getMonthKey(entry.voucherDate);
      const existing = monthlyMap.get(mk);
      if (existing) {
        existing.debit = roundAmount(existing.debit + entry.debit);
        existing.credit = roundAmount(existing.credit + entry.credit);
        existing.entries.push(entry);
      } else {
        monthlyMap.set(mk, { debit: entry.debit, credit: entry.credit, entries: [entry] });
      }
    }

    const monthlyBreakdown: MonthlyMovement[] = [];
    for (const [monthKey, { debit, credit, entries: mEntries }] of monthlyMap) {
      const voucherSet = new Set(mEntries.map((e) => e.voucherNo));
      monthlyBreakdown.push({
        monthKey,
        accountCode: code,
        accountName,
        totalDebit: debit,
        totalCredit: credit,
        voucherCount: voucherSet.size,
        entryCount: mEntries.length,
      });
    }

    summaries.push({
      accountCode: code,
      accountName,
      totalDebit,
      totalCredit,
      netMovement: roundAmount(totalDebit - totalCredit),
      voucherCount: voucherNos.size,
      entryCount: acctEntries.length,
      monthlyBreakdown: monthlyBreakdown.sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
    });
  }

  return summaries.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

/**
 * 提取异常分录（anomalyFlags 不为空的分录）
 */
export function extractAnomalies(entries: JournalEntryRow[]): JournalEntryRow[] {
  return entries.filter(
    (e) => e.anomalyFlags && e.anomalyFlags.length > 0
  );
}

/**
 * 验证日期字段合理性（批量）
 */
export function validateJournalDates(entries: JournalEntryRow[]): {
  valid: JournalEntryRow[];
  invalid: JournalEntryRow[];
} {
  const valid: JournalEntryRow[] = [];
  const invalid: JournalEntryRow[] = [];

  for (const entry of entries) {
    if (
      !entry.voucherDate ||
      !isReasonableDate(entry.voucherDate)
    ) {
      if (!entry.anomalyFlags) entry.anomalyFlags = [];
      entry.anomalyFlags.push(`[DF-001] 日期无效或超出合理范围：${entry.voucherDate}`);
      invalid.push(entry);
    } else {
      valid.push(entry);
    }
  }

  return { valid, invalid };
}

// ─── 工具函数 ────────────────────────────────────────────────

function toString(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v).trim() || undefined;
}

function toNumberOrUndef(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}
