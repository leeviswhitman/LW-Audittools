/**
 * 底稿输出模块
 *
 * 将各模块处理结果格式化为标准审计底稿输出，包括：
 * 1. 序时账清洗结果表
 * 2. 科目余额表标准化结果
 * 3. 勾稽差异表
 * 4. 联查凭证记录表
 * 5. 抽凭样本清单
 * 6. 异常事项汇总表
 * 7. 自动处理日志
 * 8. 审计说明草稿
 *
 * 所有输出均附加"系统生成草稿，需人工复核"声明。
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  JournalEntryRow,
  TrialBalanceRow,
  ReconciliationIssue,
  WorkpaperOutput,
  WorkpaperOutputType,
  AuditLog,
} from '../models';
import type { SamplingResult } from './SampleEngine';
import type { VoucherLinkResult } from './VoucherLinker';
import { logAction } from '../utils/logger';

/** 插件版本 */
const PLUGIN_VERSION = '1.0.0';

/** 底稿输出格式化行（通用） */
export type OutputRow = (string | number | boolean | null)[];

/** 带表头和数据行的完整输出 */
export interface SheetOutput {
  headers: string[];
  rows: OutputRow[];
  disclaimer: string;
}

/** 审计说明草稿输出 */
export interface AuditMemoDraft {
  title: string;
  content: string;
  disclaimer: string;
  generatedAt: string;
  version: string;
}

const DISCLAIMER =
  '【系统提示】以下内容为系统生成草稿，需项目组复核后使用。本结果仅为程序辅助，审计结论由注册会计师做出职业判断。';

// ============================================================
// 1. 序时账清洗结果表
// ============================================================

export function formatJournalOutput(entries: JournalEntryRow[]): SheetOutput {
  const headers = [
    '序号', '凭证日期', '凭证字号', '凭证编号', '分录序号',
    '摘要', '科目编码', '科目名称', '辅助核算',
    '借方金额', '贷方金额', '方向', '余额',
    '对方科目编码', '对方科目名称', '单据号',
    '业务员', '部门', '往来单位',
    '是否手工凭证', '是否红字冲销',
    '异常标注', '数据来源', '原始行号', '导入时间',
    '需人工复核',
  ];

  const rows: OutputRow[] = entries.map((e, idx) => [
    idx + 1,
    e.voucherDate,
    e.voucherType ?? '',
    e.voucherNo,
    e.entrySeq ?? '',
    e.summary ?? '',
    e.accountCode,
    e.accountName ?? '',
    e.auxiliaryInfo ?? '',
    e.debit || '',
    e.credit || '',
    e.direction ?? '',
    e.balance ?? '',
    e.counterAccountCode ?? '',
    e.counterAccountName ?? '',
    e.documentNo ?? '',
    e.operator ?? '',
    e.department ?? '',
    e.partyName ?? '',
    e.isManual ? '是' : '',
    e.isReversal ? '是' : '',
    (e.anomalyFlags ?? []).join('；'),
    e.sourceSheet ?? '',
    e.sourceRow ?? '',
    e.importedAt ?? '',
    '是',
  ]);

  return { headers, rows, disclaimer: DISCLAIMER };
}

// ============================================================
// 2. 科目余额表标准化结果
// ============================================================

export function formatTrialBalanceOutput(rows: TrialBalanceRow[]): SheetOutput {
  const headers = [
    '序号', '科目编码', '科目名称', '层级', '父级科目编码', '正常余额方向',
    '期初借方', '期初贷方',
    '本期借方', '本期贷方', '本期净发生额',
    '期末借方', '期末贷方',
    '勾稽状态', '异常标注',
    '数据来源', '期间标识', '需人工复核',
  ];

  const rows2: OutputRow[] = rows.map((r, idx) => [
    idx + 1,
    r.accountCode,
    r.accountName,
    r.level ?? '',
    r.parentCode ?? '',
    r.normalDirection ?? '',
    r.beginDebit,
    r.beginCredit,
    r.currentDebit,
    r.currentCredit,
    r.netMovement ?? '',
    r.endDebit,
    r.endCredit,
    r.reconcileStatus === 'matched' ? '已匹配' :
      r.reconcileStatus === 'unmatched' ? '不匹配' : '待核实',
    (r.anomalyFlags ?? []).join('；'),
    r.sourceSheet ?? '',
    r.periodKey,
    '是',
  ]);

  return { headers, rows: rows2, disclaimer: DISCLAIMER };
}

// ============================================================
// 3. 勾稽差异表
// ============================================================

export function formatReconciliationOutput(issues: ReconciliationIssue[]): SheetOutput {
  const headers = [
    '序号', '勾稽类型', '严重程度', '科目编码', '期间', '差异描述',
    '余额表金额', '序时账金额', '差额',
    '涉及凭证号', '是否已处理', '处理说明', '检测时间', '需人工复核',
  ];

  const typeLabel: Record<string, string> = {
    trial_balance_vs_journal: '余额表与序时账勾稽',
    debit_credit_balance: '借贷平衡',
    period_roll_forward: '期初期末滚动',
    voucher_balance: '凭证借贷平衡',
    account_name_consistency: '科目名称一致性',
    parent_child_sum: '父子级汇总',
  };

  const rows: OutputRow[] = issues.map((issue, idx) => [
    idx + 1,
    typeLabel[issue.reconcileType] ?? issue.reconcileType,
    issue.severity === 'error' ? '错误' : issue.severity === 'warning' ? '警告' : '提示',
    issue.accountCode ?? '',
    issue.periodKey ?? '',
    issue.description,
    issue.trialBalanceAmount ?? '',
    issue.journalAmount ?? '',
    issue.difference ?? '',
    (issue.voucherNos ?? []).join('；'),
    issue.resolved ? '是' : '否',
    issue.resolution ?? '',
    issue.detectedAt,
    '是',
  ]);

  return { headers, rows, disclaimer: DISCLAIMER };
}

// ============================================================
// 4. 抽凭样本清单
// ============================================================

export function formatSampleListOutput(result: SamplingResult): SheetOutput {
  const headers = [
    '样本编号', '凭证号', '凭证日期', '摘要', '科目编码', '科目名称',
    '对方科目', '借方金额', '贷方金额', '净金额',
    '抽样方法', '抽样原因', '样本层级', '是否获取附件',
    '复核状态', '审计人员备注',
    '抽样批次', '抽样时间', '操作者', '需人工复核',
  ];

  const methodLabel: Record<string, string> = {
    significant_item: '重大项目全选',
    top_n: 'Top N 金额',
    random: '随机抽样',
    stratified_random: '分层随机',
    systematic: '固定间隔',
    risk_oriented: '风险导向',
    custom_condition: '自定义条件',
  };

  const rows: OutputRow[] = result.samples.map((s) => [
    s.sampleNo,
    s.sourceVoucherNo,
    s.voucherDate,
    s.summary ?? '',
    s.accountCode ?? '',
    s.accountName ?? '',
    s.counterAccountCode ?? '',
    s.debit ?? '',
    s.credit ?? '',
    s.netAmount ?? '',
    methodLabel[s.samplingMethod] ?? s.samplingMethod,
    s.samplingReason,
    s.stratum ?? '',
    s.attachmentObtained ? '是' : '否',
    s.reviewStatus === 'approved' ? '已复核' :
      s.reviewStatus === 'rejected' ? '有异议' :
        s.reviewStatus === 'noted' ? '已记录' : '待复核',
    s.auditorNote ?? '',
    s.batchId,
    s.sampledAt,
    s.sampledBy ?? '',
    '是',
  ]);

  // 在末尾添加统计信息
  rows.push([]);
  rows.push([
    `【统计摘要】`,
    `总体规模：${result.populationSize} 条`,
    `样本量：${result.sampleSize} 条`,
    `未抽中：${result.nonSampledCount} 条`,
    `抽样比例：${((result.sampleSize / result.populationSize) * 100).toFixed(1)}%`,
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
  ]);

  return { headers, rows, disclaimer: DISCLAIMER };
}

// ============================================================
// 5. 异常事项汇总表
// ============================================================

export function formatAnomalyOutput(entries: JournalEntryRow[]): SheetOutput {
  const anomalies = entries.filter(
    (e) => e.anomalyFlags && e.anomalyFlags.length > 0
  );

  const headers = [
    '序号', '凭证号', '凭证日期', '摘要', '科目编码', '科目名称',
    '借方金额', '贷方金额', '异常类型及说明',
    '数据来源', '原始行号', '需人工复核',
  ];

  const rows: OutputRow[] = anomalies.map((e, idx) => [
    idx + 1,
    e.voucherNo,
    e.voucherDate,
    e.summary ?? '',
    e.accountCode,
    e.accountName ?? '',
    e.debit || '',
    e.credit || '',
    (e.anomalyFlags ?? []).join('；'),
    e.sourceSheet ?? '',
    e.sourceRow ?? '',
    '是',
  ]);

  return { headers, rows, disclaimer: DISCLAIMER };
}

// ============================================================
// 6. 联查凭证记录表
// ============================================================

export function formatVoucherLinkOutput(linkResult: VoucherLinkResult): SheetOutput {
  const headers = [
    '序号', '凭证号', '凭证日期', '摘要', '科目编码', '科目名称',
    '对方科目', '借方金额', '贷方金额',
    '单据号', '借贷平衡', '联查路径', '查询时间', '需人工复核',
  ];

  const rows: OutputRow[] = linkResult.relatedEntries.map((e, idx) => [
    idx + 1,
    e.voucherNo,
    e.voucherDate,
    e.summary ?? '',
    e.accountCode,
    e.accountName ?? '',
    e.counterAccountCode ?? '',
    e.debit || '',
    e.credit || '',
    e.documentNo ?? '',
    linkResult.isBalanced ? '是' : linkResult.isBalanced === false ? '否' : '未知',
    linkResult.queryPath,
    linkResult.queriedAt,
    '是',
  ]);

  return { headers, rows, disclaimer: DISCLAIMER };
}

// ============================================================
// 7. 处理日志输出
// ============================================================

export function formatLogOutput(logs: AuditLog[]): SheetOutput {
  const headers = [
    '序号', '操作时间', '操作类型', '模块', '操作描述',
    '影响记录数', '操作结果', '操作者', '错误信息', '版本号',
  ];

  const actionLabel: Record<string, string> = {
    import_data: '导入数据',
    clean_data: '数据清洗',
    map_fields: '字段映射',
    standardize_journal: '标准化序时账',
    standardize_trial_balance: '标准化余额表',
    link_voucher: '联查凭证',
    sample_voucher: '抽凭',
    reconcile: '勾稽校验',
    export_sheet: '导出 Sheet',
    generate_workpaper: '生成底稿',
    apply_rule: '应用规则',
    user_review: '人工复核',
    system_error: '系统错误',
  };

  const rows: OutputRow[] = logs.map((log, idx) => [
    idx + 1,
    log.timestamp,
    actionLabel[log.action] ?? log.action,
    log.moduleName ?? '',
    log.description,
    log.affectedCount ?? '',
    log.result === 'success' ? '成功' : log.result === 'failure' ? '失败' : '部分成功',
    log.operator,
    log.errorMessage ?? '',
    log.version ?? '',
  ]);

  return { headers, rows, disclaimer: DISCLAIMER };
}

// ============================================================
// 8. 审计说明草稿
// ============================================================

export function generateAuditMemoDraft(params: {
  clientName?: string;
  periodKey?: string;
  journalCount: number;
  tbRowCount: number;
  anomalyCount: number;
  sampleCount: number;
  reconciliationIssues: ReconciliationIssue[];
  hasErrors: boolean;
}): AuditMemoDraft {
  const {
    clientName = '___（客户名称）___',
    periodKey = '___（期间）___',
    journalCount,
    tbRowCount,
    anomalyCount,
    sampleCount,
    reconciliationIssues,
    hasErrors,
  } = params;

  const errorIssues = reconciliationIssues.filter((i) => i.severity === 'error');
  const warnIssues = reconciliationIssues.filter((i) => i.severity === 'warning');

  const reconcileConclusion = !hasErrors
    ? '将标准化后的科目余额表与序时账发生额进行勾稽，未见重大异常。'
    : `将标准化后的科目余额表与序时账发生额进行勾稽，发现以下差异（详见《余额表与序时账勾稽差异表》）：
${errorIssues.slice(0, 5).map((i, idx) => `    ${idx + 1}. ${i.description.split('\n')[0]}`).join('\n')}
${errorIssues.length > 5 ? `    …共 ${errorIssues.length} 项错误，${warnIssues.length} 项警告` : ''}`;

  const content = `
依据中国注册会计师审计准则关于审计证据、工作底稿、风险应对、抽样与职业判断的要求，对${clientName}${periodKey}度财务报表审计中基础数据程序执行情况说明如下：

一、数据导入与标准化
检查客户提供的序时账（共 ${journalCount} 条分录）及科目余额表（共 ${tbRowCount} 个科目），按统一字段规则完成清洗与标准化处理，处理过程中发现并记录异常项 ${anomalyCount} 条（详见《异常事项汇总表》）。

二、勾稽校验
${reconcileConclusion}

三、抽凭程序
依据抽样计划，对序时账进行抽凭，共抽取样本 ${sampleCount} 笔（详见《抽凭样本清单》）。进一步对选定样本执行联查凭证程序，已记录联查路径（详见《联查凭证记录表》），并对样本附件获取情况逐笔标注，等待审计人员执行核查。

四、特别说明
以上程序均为系统辅助程序，自动处理结果仅供审计人员参考，不构成审计结论。所有系统自动识别的异常项、差异项和抽样结果，均需经项目组注册会计师独立复核与职业判断后，方可作为审计工作底稿依据。

—— 以上审计说明草稿由 LW 审计工具箱（版本 ${PLUGIN_VERSION}）自动生成 ——
  `.trim();

  return {
    title: `${clientName} ${periodKey} 基础数据处理程序说明（草稿）`,
    content,
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
    version: PLUGIN_VERSION,
  };
}

// ============================================================
// 工作底稿输出元数据记录
// ============================================================

export function recordWorkpaperOutput(
  outputType: WorkpaperOutputType,
  sheetName: string,
  rowCount: number,
  operator = 'system',
  params?: Record<string, unknown>
): WorkpaperOutput {
  const output: WorkpaperOutput = {
    id: uuidv4(),
    outputType,
    sheetName,
    rowCount,
    outputAt: new Date().toISOString(),
    outputBy: operator,
    version: PLUGIN_VERSION,
    parameterSummary: params,
    hasMemo: outputType === 'audit_memo_draft',
    humanReviewRequired: true,
  };

  logAction('generate_workpaper', `底稿输出：${sheetName}（${rowCount} 行）`, {
    operator,
    moduleName: 'WorkpaperGenerator',
    affectedCount: rowCount,
    parameters: params,
  });

  return output;
}
