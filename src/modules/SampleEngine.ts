/**
 * 一键抽凭模块（审计抽样引擎）
 *
 * 基于"审计抽样思维"设计，而非简单随机抽数。
 * 支持：
 * - 重大项目全选
 * - Top N 金额抽样
 * - 随机抽样
 * - 分层随机抽样
 * - 固定间隔抽样
 * - 风险导向抽样（期末入账、敏感摘要、非工作日等）
 * - 用户自定义条件抽样
 *
 * 每次抽样自动记录：样本编号、来源、抽样方法、原因、参数，便于复核。
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  JournalEntryRow,
  SampleRecord,
  SamplingMethod,
  SampleStratum,
} from '../models';
import { isWeekend, isPeriodEnd } from '../utils/dateUtils';
import { roundAmount } from '../utils/numberUtils';
import { logAction } from '../utils/logger';

/** 抽样参数 */
export interface SamplingParams {
  /** 抽样方法 */
  method: SamplingMethod;
  /** 操作者 */
  operator?: string;
  /** 项目 ID */
  projectId?: string;

  // ── 重大项目 / Top N ──────────────────────────────────────
  /** 重要性水平（元），金额超过此值全选 */
  materialityThreshold?: number;
  /** Top N 取前 N 条 */
  topN?: number;

  // ── 随机抽样 ──────────────────────────────────────────────
  /** 随机抽样数量 */
  randomCount?: number;
  /** 随机种子（固定种子可复现） */
  randomSeed?: number;

  // ── 分层随机 ──────────────────────────────────────────────
  /** 分层配置（层级 → 抽样数量） */
  stratumConfig?: Array<{
    stratum: SampleStratum;
    minAmount?: number;
    maxAmount?: number;
    count: number;
  }>;

  // ── 固定间隔 ──────────────────────────────────────────────
  /** 间隔（每隔 N 条取一条） */
  interval?: number;
  /** 起始偏移（0-based） */
  startOffset?: number;

  // ── 风险导向 ──────────────────────────────────────────────
  /** 是否包含期末入账（最后 N 天） */
  includePeriodEnd?: boolean;
  periodEndDays?: number;
  /** 是否包含非工作日入账 */
  includeWeekend?: boolean;
  /** 是否包含敏感摘要关键词 */
  includeSensitiveKeywords?: boolean;
  sensitiveKeywords?: string[];
  /** 是否包含手工凭证 */
  includeManualVouchers?: boolean;
  /** 是否包含红字冲销 */
  includeReversals?: boolean;

  // ── 自定义条件 ────────────────────────────────────────────
  /** 自定义筛选函数 */
  customFilter?: (entry: JournalEntryRow) => boolean;
  /** 自定义筛选描述（用于记录抽样原因） */
  customFilterDescription?: string;
}

/** 抽样执行结果 */
export interface SamplingResult {
  /** 样本记录列表 */
  samples: SampleRecord[];
  /** 抽样批次 ID */
  batchId: string;
  /** 总体规模（总分录数） */
  populationSize: number;
  /** 样本量 */
  sampleSize: number;
  /** 抽样参数摘要 */
  parameterSummary: Record<string, unknown>;
  /** 未抽中总体规模 */
  nonSampledCount: number;
  /** 抽样时间戳 */
  sampledAt: string;
  /** 操作者 */
  sampledBy: string;
  /** 是否需要人工复核（始终 true） */
  humanReviewRequired: true;
}

/** 默认敏感摘要关键词 */
const DEFAULT_SENSITIVE_KEYWORDS = [
  '暂估', '冲销', '调整', '重分类', '补提', '更正', '错账',
  '手工', '临时', '特殊', '关联', '往来',
];

/**
 * 执行抽样，返回样本记录和批次信息
 *
 * @param entries 序时账分录（已清洗、已标准化）
 * @param params 抽样参数
 * @returns 抽样结果
 */
export function sampleVouchers(
  entries: JournalEntryRow[],
  params: SamplingParams
): SamplingResult {
  const batchId = uuidv4();
  const sampledAt = new Date().toISOString();
  const operator = params.operator ?? 'system';

  let selectedEntries: Array<{ entry: JournalEntryRow; reason: string; stratum: SampleStratum }> = [];

  switch (params.method) {
    case 'significant_item':
      selectedEntries = sampleSignificantItems(entries, params);
      break;
    case 'top_n':
      selectedEntries = sampleTopN(entries, params);
      break;
    case 'random':
      selectedEntries = sampleRandom(entries, params);
      break;
    case 'stratified_random':
      selectedEntries = sampleStratified(entries, params);
      break;
    case 'systematic':
      selectedEntries = sampleSystematic(entries, params);
      break;
    case 'risk_oriented':
      selectedEntries = sampleRiskOriented(entries, params);
      break;
    case 'custom_condition':
      selectedEntries = sampleCustom(entries, params);
      break;
    default:
      selectedEntries = [];
  }

  // 去重（同一凭证不重复抽取）
  const seen = new Set<string>();
  const deduped = selectedEntries.filter(({ entry }) => {
    const key = `${entry.voucherNo}__${entry.voucherDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 生成样本记录
  const samples: SampleRecord[] = deduped.map(({ entry, reason, stratum }, idx) => ({
    sampleNo: `S${String(idx + 1).padStart(3, '0')}`,
    sourceVoucherNo: entry.voucherNo,
    sourceEntryId: entry.id,
    voucherDate: entry.voucherDate,
    summary: entry.summary,
    accountCode: entry.accountCode,
    accountName: entry.accountName,
    counterAccountCode: entry.counterAccountCode,
    debit: entry.debit || undefined,
    credit: entry.credit || undefined,
    netAmount: roundAmount(entry.debit - entry.credit),
    samplingMethod: params.method,
    samplingReason: reason,
    samplingRuleId: getRuleIdForMethod(params.method),
    stratum,
    attachmentObtained: false,
    reviewStatus: 'pending',
    batchId,
    sampledAt,
    sampledBy: operator,
    humanReviewRequired: true,
  }));

  const paramSummary: Record<string, unknown> = {
    method: params.method,
    populationSize: entries.length,
    sampleSize: samples.length,
    ...buildParamSummary(params),
  };

  logAction('sample_voucher', `一键抽凭：方法 ${params.method}，从 ${entries.length} 条中抽取 ${samples.length} 个样本`, {
    operator,
    moduleName: 'SampleEngine',
    affectedCount: samples.length,
    parameters: paramSummary,
    projectId: params.projectId,
  });

  return {
    samples,
    batchId,
    populationSize: entries.length,
    sampleSize: samples.length,
    parameterSummary: paramSummary,
    nonSampledCount: entries.length - samples.length,
    sampledAt,
    sampledBy: operator,
    humanReviewRequired: true,
  };
}

// ─── 各抽样方法实现 ──────────────────────────────────────────

function sampleSignificantItems(
  entries: JournalEntryRow[],
  params: SamplingParams
): Array<{ entry: JournalEntryRow; reason: string; stratum: SampleStratum }> {
  const threshold = params.materialityThreshold ?? 0;
  return entries
    .filter((e) => Math.abs(e.debit + e.credit) >= threshold)
    .map((e) => ({
      entry: e,
      reason: `金额 ${e.debit + e.credit} 超过重要性水平 ${threshold}`,
      stratum: 'significant' as SampleStratum,
    }));
}

function sampleTopN(
  entries: JournalEntryRow[],
  params: SamplingParams
): Array<{ entry: JournalEntryRow; reason: string; stratum: SampleStratum }> {
  const n = params.topN ?? 10;
  const sorted = [...entries].sort(
    (a, b) => (b.debit + b.credit) - (a.debit + a.credit)
  );
  return sorted.slice(0, n).map((e, idx) => ({
    entry: e,
    reason: `按金额降序排列，位于第 ${idx + 1} 名（${e.debit + e.credit}）`,
    stratum: 'significant' as SampleStratum,
  }));
}

function sampleRandom(
  entries: JournalEntryRow[],
  params: SamplingParams
): Array<{ entry: JournalEntryRow; reason: string; stratum: SampleStratum }> {
  const count = Math.min(params.randomCount ?? 30, entries.length);
  const shuffled = seededShuffle([...entries], params.randomSeed ?? Date.now());
  return shuffled.slice(0, count).map((e) => ({
    entry: e,
    reason: `随机抽样（种子：${params.randomSeed ?? 'auto'}）`,
    stratum: 'normal' as SampleStratum,
  }));
}

function sampleStratified(
  entries: JournalEntryRow[],
  params: SamplingParams
): Array<{ entry: JournalEntryRow; reason: string; stratum: SampleStratum }> {
  const stratumConfig = params.stratumConfig ?? [
    { stratum: 'significant', minAmount: 1000000, count: 5 },
    { stratum: 'high_risk', minAmount: 100000, maxAmount: 999999, count: 10 },
    { stratum: 'normal', count: 15 },
  ];

  const result: Array<{ entry: JournalEntryRow; reason: string; stratum: SampleStratum }> = [];

  for (const config of stratumConfig) {
    let pool = entries.filter((e) => {
      const amt = e.debit + e.credit;
      const aboveMin = config.minAmount === undefined || amt >= config.minAmount;
      const belowMax = config.maxAmount === undefined || amt <= config.maxAmount;
      return aboveMin && belowMax;
    });

    const shuffled = seededShuffle([...pool], params.randomSeed ?? Date.now());
    const selected = shuffled.slice(0, config.count);

    result.push(
      ...selected.map((e) => ({
        entry: e,
        reason: `分层抽样 - ${config.stratum}层（金额范围：${config.minAmount ?? 0}-${config.maxAmount ?? '∞'}）`,
        stratum: config.stratum,
      }))
    );
  }

  return result;
}

function sampleSystematic(
  entries: JournalEntryRow[],
  params: SamplingParams
): Array<{ entry: JournalEntryRow; reason: string; stratum: SampleStratum }> {
  const interval = params.interval ?? Math.max(1, Math.floor(entries.length / 30));
  const offset = params.startOffset ?? 0;
  const result: Array<{ entry: JournalEntryRow; reason: string; stratum: SampleStratum }> = [];

  for (let i = offset; i < entries.length; i += interval) {
    result.push({
      entry: entries[i],
      reason: `固定间隔抽样，间隔 ${interval}，起始偏移 ${offset}`,
      stratum: 'normal',
    });
  }

  return result;
}

function sampleRiskOriented(
  entries: JournalEntryRow[],
  params: SamplingParams
): Array<{ entry: JournalEntryRow; reason: string; stratum: SampleStratum }> {
  const keywords = params.sensitiveKeywords ?? DEFAULT_SENSITIVE_KEYWORDS;
  const periodEndDays = params.periodEndDays ?? 5;
  const result: Array<{ entry: JournalEntryRow; reason: string; stratum: SampleStratum }> = [];

  for (const entry of entries) {
    const reasons: string[] = [];

    // 期末入账
    if (params.includePeriodEnd !== false && entry.voucherDate && isPeriodEnd(entry.voucherDate, periodEndDays)) {
      reasons.push(`期末入账（${entry.voucherDate}，月末最后 ${periodEndDays} 天）`);
    }

    // 非工作日
    if (params.includeWeekend !== false && entry.voucherDate && isWeekend(entry.voucherDate)) {
      reasons.push(`非工作日入账（${entry.voucherDate}）`);
    }

    // 敏感摘要关键词
    if (params.includeSensitiveKeywords !== false && entry.summary) {
      const found = keywords.filter((kw) => (entry.summary ?? '').includes(kw));
      if (found.length > 0) {
        reasons.push(`摘要含敏感关键词：${found.join('、')}`);
      }
    }

    // 手工凭证
    if (params.includeManualVouchers !== false && entry.isManual) {
      reasons.push('手工凭证');
    }

    // 红字冲销
    if (params.includeReversals !== false && entry.isReversal) {
      reasons.push('红字冲销');
    }

    if (reasons.length > 0) {
      result.push({
        entry,
        reason: `风险导向抽样：${reasons.join('；')}`,
        stratum: 'high_risk',
      });
    }
  }

  return result;
}

function sampleCustom(
  entries: JournalEntryRow[],
  params: SamplingParams
): Array<{ entry: JournalEntryRow; reason: string; stratum: SampleStratum }> {
  if (!params.customFilter) return [];
  const description = params.customFilterDescription ?? '用户自定义条件';

  return entries
    .filter((e) => params.customFilter!(e))
    .map((e) => ({
      entry: e,
      reason: `自定义条件抽样：${description}`,
      stratum: 'custom' as SampleStratum,
    }));
}

// ─── 工具函数 ────────────────────────────────────────────────

/**
 * 基于种子的 Fisher-Yates 洗牌（确保可复现）
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0x100000000);
  };

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRuleIdForMethod(method: SamplingMethod): string {
  const map: Record<SamplingMethod, string> = {
    significant_item: 'SP-001',
    top_n: 'SP-001',
    random: 'SP-002',
    stratified_random: 'SP-003',
    systematic: 'SP-004',
    risk_oriented: 'SP-005',
    custom_condition: 'SP-006',
  };
  return map[method] ?? 'SP-000';
}

function buildParamSummary(params: SamplingParams): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  if (params.materialityThreshold !== undefined) summary['重要性水平'] = params.materialityThreshold;
  if (params.topN !== undefined) summary['Top N'] = params.topN;
  if (params.randomCount !== undefined) summary['随机数量'] = params.randomCount;
  if (params.randomSeed !== undefined) summary['随机种子'] = params.randomSeed;
  if (params.interval !== undefined) summary['抽样间隔'] = params.interval;
  if (params.includePeriodEnd !== undefined) summary['包含期末入账'] = params.includePeriodEnd;
  if (params.includeWeekend !== undefined) summary['包含非工作日'] = params.includeWeekend;
  return summary;
}
