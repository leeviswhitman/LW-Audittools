/**
 * 联查凭证模块
 *
 * 提供从余额表 → 序时账明细 → 凭证 → 单据线索的穿透链条查询能力。
 * 支持：
 * 1. 从余额表科目联查对应全部序时账记录
 * 2. 从序时账分录联查同凭证全部分录
 * 3. 凭证借贷平衡检查
 * 4. 重复模式检测
 * 5. 相邻日期冲销检测
 * 6. 附件索引展示
 * 7. 联查路径日志
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  JournalEntryRow,
  VoucherGroup,
  AttachmentIndex,
} from '../models';
import { logAction } from '../utils/logger';
import { roundAmount } from '../utils/numberUtils';

/** 联查结果对象 */
export interface VoucherLinkResult {
  /** 查询路径描述 */
  queryPath: string;
  /** 目标凭证 */
  voucher?: VoucherGroup;
  /** 相关分录列表 */
  relatedEntries: JournalEntryRow[];
  /** 相关凭证列表（同摘要/金额） */
  similarVouchers: VoucherGroup[];
  /** 相邻日期冲销对 */
  reversalPairs: Array<{ a: JournalEntryRow; b: JournalEntryRow }>;
  /** 附件索引 */
  attachments: AttachmentIndex[];
  /** 是否借贷平衡 */
  isBalanced?: boolean;
  /** 差额 */
  difference?: number;
  /** 操作时间戳 */
  queriedAt: string;
}

/**
 * 从余额表科目联查对应全部序时账记录
 * @param accountCode 科目编码
 * @param entries 全部序时账分录
 * @param operator 操作者
 * @returns 联查结果
 */
export function linkByAccount(
  accountCode: string,
  entries: JournalEntryRow[],
  operator = 'system'
): VoucherLinkResult {
  const relatedEntries = entries.filter(
    (e) => e.accountCode === accountCode || e.counterAccountCode === accountCode
  );

  const result: VoucherLinkResult = {
    queryPath: `余额表科目[${accountCode}] → 序时账明细`,
    relatedEntries,
    similarVouchers: [],
    reversalPairs: [],
    attachments: [],
    queriedAt: new Date().toISOString(),
  };

  logAction('link_voucher', `联查凭证：科目 ${accountCode}，找到 ${relatedEntries.length} 条分录`, {
    operator,
    moduleName: 'VoucherLinker',
    affectedCount: relatedEntries.length,
    parameters: { accountCode },
  });

  return result;
}

/**
 * 从序时账分录联查同凭证全部分录
 * @param entry 目标分录
 * @param allEntries 全部序时账分录
 * @param allVouchers 全部凭证聚合对象
 * @param attachmentIndex 附件索引（可选）
 * @param operator 操作者
 */
export function linkByVoucherNo(
  entry: JournalEntryRow,
  allEntries: JournalEntryRow[],
  allVouchers: VoucherGroup[],
  attachmentIndex: AttachmentIndex[] = [],
  operator = 'system'
): VoucherLinkResult {
  const { voucherNo, voucherDate } = entry;

  // 找到同凭证所有分录
  const relatedEntries = allEntries.filter(
    (e) => e.voucherNo === voucherNo && e.voucherDate === voucherDate
  );

  // 找到凭证聚合对象
  const voucher = allVouchers.find(
    (v) => v.voucherNo === voucherNo && v.voucherDate === voucherDate
  );

  // 查找相似凭证（相同摘要 + 接近金额）
  const similarVouchers = findSimilarVouchers(entry, allVouchers);

  // 查找相邻日期冲销
  const reversalPairs = findReversalPairs(entry, allEntries);

  // 查找附件
  const attachments = attachmentIndex.filter((a) => a.voucherNo === voucherNo);

  const result: VoucherLinkResult = {
    queryPath: `分录[${voucherNo}/${voucherDate}] → 凭证全部分录`,
    voucher,
    relatedEntries,
    similarVouchers,
    reversalPairs,
    attachments,
    isBalanced: voucher?.isBalanced,
    difference: voucher?.difference,
    queriedAt: new Date().toISOString(),
  };

  logAction('link_voucher', `联查凭证：凭证号 ${voucherNo}，找到 ${relatedEntries.length} 条分录`, {
    operator,
    moduleName: 'VoucherLinker',
    affectedCount: relatedEntries.length,
    parameters: { voucherNo, voucherDate },
  });

  return result;
}

/**
 * 从单据号/合同号/发票号联查上下游记录
 * @param documentNo 单据号
 * @param entries 全部序时账分录
 * @param operator 操作者
 */
export function linkByDocumentNo(
  documentNo: string,
  entries: JournalEntryRow[],
  operator = 'system'
): VoucherLinkResult {
  const relatedEntries = entries.filter(
    (e) => e.documentNo === documentNo
  );

  const result: VoucherLinkResult = {
    queryPath: `单据号[${documentNo}] → 关联分录`,
    relatedEntries,
    similarVouchers: [],
    reversalPairs: [],
    attachments: [],
    queriedAt: new Date().toISOString(),
  };

  logAction('link_voucher', `联查凭证：单据号 ${documentNo}，找到 ${relatedEntries.length} 条关联记录`, {
    operator,
    moduleName: 'VoucherLinker',
    affectedCount: relatedEntries.length,
    parameters: { documentNo },
  });

  return result;
}

/**
 * 查找相似凭证（相同摘要/金额/对方科目的重复模式）
 */
function findSimilarVouchers(
  entry: JournalEntryRow,
  allVouchers: VoucherGroup[]
): VoucherGroup[] {
  if (!entry.summary || entry.summary.length < 2) return [];

  const amount = entry.debit || entry.credit;
  const similar: VoucherGroup[] = [];

  for (const v of allVouchers) {
    if (v.voucherNo === entry.voucherNo && v.voucherDate === entry.voucherDate) continue;
    if (!v.summary) continue;

    const hasSimilarSummary = entry.summary && v.summary === entry.summary;
    const hasSimilarAmount =
      amount > 0 &&
      (Math.abs(v.totalDebit - amount) < 0.01 ||
        Math.abs(v.totalCredit - amount) < 0.01);

    if (hasSimilarSummary && hasSimilarAmount) {
      similar.push(v);
    }
  }

  return similar.slice(0, 10); // 最多返回 10 条
}

/**
 * 查找相邻日期冲销（相同科目+金额相反，日期相差不超过 30 天）
 */
function findReversalPairs(
  entry: JournalEntryRow,
  allEntries: JournalEntryRow[]
): Array<{ a: JournalEntryRow; b: JournalEntryRow }> {
  const pairs: Array<{ a: JournalEntryRow; b: JournalEntryRow }> = [];
  const entryAmount = entry.debit - entry.credit;

  if (Math.abs(entryAmount) < 0.01) return [];

  const entryDate = new Date(entry.voucherDate);
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  for (const other of allEntries) {
    if (other.id === entry.id) continue;
    if (other.accountCode !== entry.accountCode) continue;

    const otherAmount = other.debit - other.credit;
    if (!amountsNearlyOpposite(entryAmount, otherAmount)) continue;

    const otherDate = new Date(other.voucherDate);
    if (Math.abs(otherDate.getTime() - entryDate.getTime()) <= THIRTY_DAYS) {
      pairs.push({ a: entry, b: other });
    }
  }

  return pairs.slice(0, 5);
}

function amountsNearlyOpposite(a: number, b: number): boolean {
  return Math.abs(Math.abs(a) - Math.abs(b)) < 0.01 && Math.sign(a) !== Math.sign(b);
}

/**
 * 将联查结果格式化为底稿输出行
 */
export function formatLinkResultForOutput(result: VoucherLinkResult): Record<string, unknown>[] {
  return result.relatedEntries.map((e, idx) => ({
    序号: idx + 1,
    凭证号: e.voucherNo,
    日期: e.voucherDate,
    摘要: e.summary ?? '',
    科目编码: e.accountCode,
    科目名称: e.accountName ?? '',
    对方科目: e.counterAccountCode ?? '',
    借方金额: e.debit || '',
    贷方金额: e.credit || '',
    单据号: e.documentNo ?? '',
    借贷平衡: result.isBalanced ? '是' : '否',
    联查路径: result.queryPath,
    查询时间: result.queriedAt,
    需人工复核: '是',
  }));
}

// 引入 roundAmount 避免循环依赖警告
const _roundAmount = roundAmount;
void _roundAmount;
void uuidv4;
