/**
 * 核心数据模型 - TypeScript 接口定义
 *
 * 遵循中国注册会计师审计准则数据规范，服务于审计底稿编制与审计程序执行。
 * 所有实体均保留来源追溯、时间戳和操作者信息，以满足审计留痕要求。
 */

// ============================================================
// 1. TrialBalanceRow - 科目余额表行
// ============================================================

/** 科目层级枚举 */
export type AccountLevel = 1 | 2 | 3 | 4 | 5;

/** 余额方向枚举（借方为正、贷方为负） */
export type BalanceDirection = 'debit' | 'credit' | 'none';

/**
 * 科目余额表行
 * - 主键：accountCode（科目编码）+ periodKey（期间标识，如 "2023-12"）
 * - 来源：客户提供的科目余额表 Sheet
 * - 必填：accountCode, accountName, periodKey
 * - 可选：parentCode, level, beginDebit, beginCredit 等余额字段
 * - 校验规则：
 *   1. beginDebit + currentDebit - currentCredit = endDebit（借方余额科目）
 *   2. beginCredit + currentCredit - currentDebit = endCredit（贷方余额科目）
 *   3. accountCode 不可为空
 *   4. 父级科目借贷汇总应等于子级之和
 */
export interface TrialBalanceRow {
  /** 唯一行 ID（系统生成，UUID） */
  id: string;
  /** 科目编码（必填，唯一标识，如 "1001"、"1002.01"） */
  accountCode: string;
  /** 科目名称（必填） */
  accountName: string;
  /** 期间标识，如 "2023-12"（必填） */
  periodKey: string;
  /** 父级科目编码（可选，用于多级科目树） */
  parentCode?: string;
  /** 科目层级（1-5，可选，自动计算） */
  level?: AccountLevel;
  /** 余额方向（借/贷，可选，从科目性质推断） */
  normalDirection?: BalanceDirection;

  /** 期初借方余额 */
  beginDebit: number;
  /** 期初贷方余额 */
  beginCredit: number;
  /** 本期借方发生额 */
  currentDebit: number;
  /** 本期贷方发生额 */
  currentCredit: number;
  /** 期末借方余额 */
  endDebit: number;
  /** 期末贷方余额 */
  endCredit: number;

  /** 计算本期净发生额（借为正，贷为负） */
  netMovement?: number;
  /** 勾稽状态（与序时账是否匹配） */
  reconcileStatus?: 'matched' | 'unmatched' | 'pending';
  /** 异常标注 */
  anomalyFlags?: string[];
  /** 原始行号（来自导入 Sheet） */
  sourceRow?: number;
  /** 数据来源 Sheet 名 */
  sourceSheet?: string;
  /** 导入时间戳 */
  importedAt?: string;
}

// ============================================================
// 2. JournalEntryRow - 序时账分录行
// ============================================================

/**
 * 序时账分录行（明细账/日记账单行）
 * - 主键：id（系统生成 UUID）
 * - 来源：客户提供的序时账/明细账 Sheet
 * - 必填：voucherDate, voucherNo, accountCode, debit/credit 二选一
 * - 校验规则：
 *   1. debit 和 credit 不能同时为非零
 *   2. debit 和 credit 不能同时为空（且不为0）
 *   3. voucherNo 不可为空
 *   4. accountCode 不可为空
 *   5. 日期不能早于 1990-01-01 或晚于当前日期
 */
export interface JournalEntryRow {
  /** 唯一行 ID（系统生成，UUID） */
  id: string;
  /** 凭证日期（必填，ISO 格式 YYYY-MM-DD） */
  voucherDate: string;
  /** 凭证字号（如"记字第001号"，可选） */
  voucherType?: string;
  /** 凭证编号（必填，如 "001"、"2023-0001"） */
  voucherNo: string;
  /** 分录序号（同一凭证内的行号，从1开始） */
  entrySeq?: number;
  /** 摘要（可选，建议填写） */
  summary?: string;
  /** 科目编码（必填） */
  accountCode: string;
  /** 科目名称（可选，从余额表映射） */
  accountName?: string;
  /** 辅助核算（核算维度，如客户名、项目名） */
  auxiliaryInfo?: string;
  /** 借方金额（单位：元，与 credit 二选一，0 表示无） */
  debit: number;
  /** 贷方金额（单位：元，与 debit 二选一，0 表示无） */
  credit: number;
  /** 方向（借/贷，系统自动推断） */
  direction?: BalanceDirection;
  /** 余额（该行记账后账户余额） */
  balance?: number;
  /** 对方科目编码（可选） */
  counterAccountCode?: string;
  /** 对方科目名称（可选） */
  counterAccountName?: string;
  /** 单据号（可选，发票号/合同号/订单号） */
  documentNo?: string;
  /** 业务员（可选） */
  operator?: string;
  /** 部门（可选） */
  department?: string;
  /** 客户/供应商名称（可选） */
  partyName?: string;
  /** 是否手工凭证（可选，true=手工，false=系统凭证） */
  isManual?: boolean;
  /** 是否红字冲销（可选） */
  isReversal?: boolean;
  /** 异常标注列表 */
  anomalyFlags?: string[];
  /** 原始行号 */
  sourceRow?: number;
  /** 数据来源 Sheet 名 */
  sourceSheet?: string;
  /** 导入时间戳 */
  importedAt?: string;
}

// ============================================================
// 3. VoucherGroup - 凭证聚合对象
// ============================================================

/**
 * 凭证聚合对象（将同一凭证号的所有分录聚合为一个凭证）
 * - 主键：voucherNo + voucherDate
 * - 来源：JournalEntryRow 聚合
 * - 必填：voucherNo, voucherDate, entries
 * - 校验规则：
 *   1. 凭证借贷合计必须相等（借贷平衡）
 *   2. 至少有一借一贷
 */
export interface VoucherGroup {
  /** 唯一 ID（系统生成） */
  id: string;
  /** 凭证编号（必填） */
  voucherNo: string;
  /** 凭证日期（必填） */
  voucherDate: string;
  /** 凭证字号 */
  voucherType?: string;
  /** 该凭证全部分录 */
  entries: JournalEntryRow[];
  /** 借方合计 */
  totalDebit: number;
  /** 贷方合计 */
  totalCredit: number;
  /** 是否借贷平衡 */
  isBalanced: boolean;
  /** 差额（不为0则异常） */
  difference: number;
  /** 摘要（取第一条分录摘要） */
  summary?: string;
  /** 涉及科目列表 */
  accountCodes: string[];
  /** 单据编号集合 */
  documentNos?: string[];
  /** 是否含手工凭证分录 */
  hasManualEntry?: boolean;
  /** 是否含红字冲销 */
  hasReversal?: boolean;
  /** 异常标注 */
  anomalyFlags?: string[];
  /** 附件索引（关联 AttachmentIndex） */
  attachmentIds?: string[];
}

// ============================================================
// 4. SampleRecord - 抽样记录
// ============================================================

/** 抽样方法枚举 */
export type SamplingMethod =
  | 'significant_item'   // 重大项目全选
  | 'top_n'              // Top N 金额抽样
  | 'random'             // 随机抽样
  | 'stratified_random'  // 分层随机抽样
  | 'systematic'         // 固定间隔抽样
  | 'risk_oriented'      // 风险导向抽样
  | 'custom_condition';  // 用户自定义条件

/** 抽样层级枚举 */
export type SampleStratum = 'significant' | 'high_risk' | 'normal' | 'custom';

/**
 * 抽样记录（一键抽凭输出的单条样本）
 * - 主键：sampleNo（样本编号）
 * - 来源：SampleEngine 执行结果
 * - 必填：sampleNo, sourceVoucherNo, samplingMethod, samplingReason
 * - 校验规则：不允许重复抽取同一凭证号（可配置豁免）
 */
export interface SampleRecord {
  /** 样本编号（系统自动生成，如 "S001"） */
  sampleNo: string;
  /** 来源凭证号（关联 VoucherGroup） */
  sourceVoucherNo: string;
  /** 来源分录 ID（关联 JournalEntryRow） */
  sourceEntryId?: string;
  /** 凭证日期 */
  voucherDate: string;
  /** 摘要 */
  summary?: string;
  /** 科目编码 */
  accountCode?: string;
  /** 科目名称 */
  accountName?: string;
  /** 对方科目编码 */
  counterAccountCode?: string;
  /** 借方金额 */
  debit?: number;
  /** 贷方金额 */
  credit?: number;
  /** 净金额（借为正，贷为负） */
  netAmount?: number;
  /** 抽样方法（必填） */
  samplingMethod: SamplingMethod;
  /** 抽样原因描述（必填，可解释） */
  samplingReason: string;
  /** 抽样规则 ID（关联规则引擎） */
  samplingRuleId?: string;
  /** 样本层级 */
  stratum?: SampleStratum;
  /** 是否已获取附件 */
  attachmentObtained?: boolean;
  /** 复核状态 */
  reviewStatus?: 'pending' | 'approved' | 'rejected' | 'noted';
  /** 审计人员备注 */
  auditorNote?: string;
  /** 抽样批次 ID（同一次抽样操作共享） */
  batchId: string;
  /** 抽样时间戳 */
  sampledAt: string;
  /** 操作者 */
  sampledBy?: string;
  /** 是否需要人工复核（始终为 true，不可关闭） */
  humanReviewRequired: true;
}

// ============================================================
// 5. ReconciliationIssue - 勾稽差异
// ============================================================

/** 勾稽类型枚举 */
export type ReconciliationType =
  | 'trial_balance_vs_journal'  // 余额表与序时账勾稽
  | 'debit_credit_balance'       // 借贷平衡校验
  | 'period_roll_forward'        // 期初期末滚动校验
  | 'voucher_balance'            // 凭证借贷平衡
  | 'account_name_consistency'   // 科目名称一致性
  | 'parent_child_sum';          // 父子科目汇总

/**
 * 勾稽差异记录
 * - 主键：id（UUID）
 * - 来源：ReconciliationEngine 执行结果
 * - 必填：reconcileType, description, severity
 */
export interface ReconciliationIssue {
  /** 唯一 ID */
  id: string;
  /** 勾稽类型 */
  reconcileType: ReconciliationType;
  /** 差异描述 */
  description: string;
  /** 严重程度 */
  severity: 'error' | 'warning' | 'info';
  /** 涉及科目编码 */
  accountCode?: string;
  /** 期间标识 */
  periodKey?: string;
  /** 余额表侧金额 */
  trialBalanceAmount?: number;
  /** 序时账侧金额 */
  journalAmount?: number;
  /** 差额 */
  difference?: number;
  /** 涉及凭证号 */
  voucherNos?: string[];
  /** 是否已处理 */
  resolved?: boolean;
  /** 处理说明 */
  resolution?: string;
  /** 检测时间戳 */
  detectedAt: string;
  /** 关联规则 ID */
  ruleId?: string;
  /** 是否需要人工复核 */
  humanReviewRequired: boolean;
}

// ============================================================
// 6. AuditLog - 操作日志
// ============================================================

/** 日志操作类型枚举 */
export type AuditLogAction =
  | 'import_data'          // 导入数据
  | 'clean_data'           // 数据清洗
  | 'map_fields'           // 字段映射
  | 'standardize_journal'  // 标准化序时账
  | 'standardize_trial_balance' // 标准化余额表
  | 'link_voucher'         // 联查凭证
  | 'sample_voucher'       // 抽凭
  | 'reconcile'            // 勾稽校验
  | 'export_sheet'         // 导出 Sheet
  | 'generate_workpaper'   // 生成底稿
  | 'apply_rule'           // 应用规则
  | 'user_review'          // 人工复核
  | 'system_error';        // 系统错误

/**
 * 操作日志
 * - 主键：id（UUID）
 * - 来源：所有核心模块操作触发
 * - 必填：action, description, timestamp
 * - 注意：日志不可删除，仅可追加
 */
export interface AuditLog {
  /** 唯一 ID */
  id: string;
  /** 操作类型 */
  action: AuditLogAction;
  /** 操作描述 */
  description: string;
  /** 操作时间戳（ISO 格式） */
  timestamp: string;
  /** 操作者（登录用户或"system"） */
  operator: string;
  /** 模块名称 */
  moduleName?: string;
  /** 关联数据条数 */
  affectedCount?: number;
  /** 操作参数（JSON 序列化） */
  parameters?: Record<string, unknown>;
  /** 操作结果 */
  result?: 'success' | 'failure' | 'partial';
  /** 错误信息（失败时） */
  errorMessage?: string;
  /** 版本号 */
  version?: string;
  /** 项目 ID（多项目隔离） */
  projectId?: string;
}

// ============================================================
// 7. MappingConfig - 字段映射配置
// ============================================================

/** 字段映射规则（原始列名 → 标准字段名） */
export interface FieldMapping {
  /** 原始列名（来自 Sheet 表头） */
  sourceColumn: string;
  /** 标准字段名（系统内部字段名） */
  targetField: string;
  /** 字段描述 */
  description?: string;
  /** 是否必填 */
  required: boolean;
  /** 数据类型 */
  dataType: 'string' | 'number' | 'date' | 'boolean';
  /** 转换函数名（可选，如 "parseChineseDate"） */
  transformFn?: string;
  /** 是否已确认（需人工确认） */
  confirmed?: boolean;
}

/**
 * 字段映射配置（保存用户上次的映射规则）
 * - 主键：id（UUID）
 * - 来源：用户手动配置 + 系统自动识别建议
 * - 必填：dataType, mappings
 */
export interface MappingConfig {
  /** 配置 ID */
  id: string;
  /** 配置名称（如"A公司2023年序时账"） */
  name: string;
  /** 适用数据类型 */
  dataType: 'journal' | 'trial_balance' | 'voucher' | 'attachment_index';
  /** 字段映射列表 */
  mappings: FieldMapping[];
  /** 来源 Sheet 名 */
  sourceSheet?: string;
  /** 来源表头行号 */
  headerRow?: number;
  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
  /** 是否为默认配置 */
  isDefault?: boolean;
}

// ============================================================
// 8. ImportProfile - 导入模板配置
// ============================================================

/**
 * 导入模板配置（记录一次完整的数据导入参数）
 * - 主键：id（UUID）
 * - 来源：用户配置导入向导时保存
 * - 必填：profileName, dataType, sourceSheet
 */
export interface ImportProfile {
  /** 配置 ID */
  id: string;
  /** 模板名称 */
  profileName: string;
  /** 数据类型 */
  dataType: 'journal' | 'trial_balance' | 'attachment_index' | 'custom';
  /** 来源 Sheet 名 */
  sourceSheet: string;
  /** 表头行号（默认 1） */
  headerRow: number;
  /** 数据起始行号（默认 2） */
  dataStartRow: number;
  /** 数据结束行号（可选，null=自动检测） */
  dataEndRow?: number;
  /** 关联字段映射配置 ID */
  mappingConfigId?: string;
  /** 是否自动识别表头 */
  autoDetectHeader: boolean;
  /** 是否删除合计行 */
  removeSummaryRows: boolean;
  /** 合计行关键词（用于识别合计行） */
  summaryRowKeywords?: string[];
  /** 是否向下填充日期、凭证号等缺失字段 */
  fillDownMissingFields?: boolean;
  /** 创建时间 */
  createdAt: string;
  /** 最后使用时间 */
  lastUsedAt?: string;
}

// ============================================================
// 9. AttachmentIndex - 附件索引
// ============================================================

/**
 * 附件索引（凭证附件的索引映射）
 * - 主键：id（UUID）
 * - 来源：客户提供的附件索引 Sheet 或手工录入
 * - 必填：voucherNo, attachmentNo
 */
export interface AttachmentIndex {
  /** 唯一 ID */
  id: string;
  /** 凭证编号（关联 VoucherGroup） */
  voucherNo: string;
  /** 附件编号 */
  attachmentNo: string;
  /** 附件名称/描述 */
  attachmentName?: string;
  /** 文件路径或 URL */
  filePath?: string;
  /** 影像系统编号 */
  imageSystemNo?: string;
  /** 页码 */
  pageNo?: number;
  /** 附件类型（如"发票"、"合同"、"入库单"） */
  attachmentType?: string;
  /** 备注 */
  note?: string;
  /** 录入时间 */
  createdAt?: string;
}

// ============================================================
// 10. WorkpaperOutput - 底稿输出对象
// ============================================================

/** 底稿输出类型枚举 */
export type WorkpaperOutputType =
  | 'journal_cleaned'            // 序时账清洗结果
  | 'trial_balance_standardized' // 科目余额表标准化结果
  | 'reconciliation_diff'        // 勾稽差异表
  | 'voucher_link_record'        // 联查凭证记录表
  | 'sample_list'                // 抽凭样本清单
  | 'anomaly_summary'            // 异常事项汇总表
  | 'process_log'                // 自动处理日志
  | 'audit_memo_draft';          // 审计说明草稿

/**
 * 底稿输出对象
 * - 主键：id（UUID）
 * - 来源：WorkpaperGenerator 生成
 * - 必填：outputType, sheetName, rowCount
 * - 注意：所有输出均附有"以下内容为系统生成草稿，需项目组复核后使用"标注
 */
export interface WorkpaperOutput {
  /** 唯一 ID */
  id: string;
  /** 输出类型 */
  outputType: WorkpaperOutputType;
  /** 输出到的 Sheet 名 */
  sheetName: string;
  /** 输出行数 */
  rowCount: number;
  /** 输出时间戳 */
  outputAt: string;
  /** 操作者 */
  outputBy?: string;
  /** 版本号 */
  version: string;
  /** 参数摘要（JSON） */
  parameterSummary?: Record<string, unknown>;
  /** 是否附有审计说明 */
  hasMemo: boolean;
  /** 是否需要人工复核（始终为 true） */
  humanReviewRequired: true;
  /** 复核人 */
  reviewedBy?: string;
  /** 复核时间 */
  reviewedAt?: string;
  /** 关联日志 IDs */
  auditLogIds?: string[];
}

// ============================================================
// 11. CleaningLog - 清洗日志（辅助实体）
// ============================================================

/**
 * 单次字段清洗操作记录
 */
export interface CleaningLogEntry {
  /** 行号 */
  rowIndex: number;
  /** 字段名 */
  fieldName: string;
  /** 清洗前值 */
  originalValue: unknown;
  /** 清洗后值 */
  cleanedValue: unknown;
  /** 清洗规则 */
  rule: string;
}

// ============================================================
// 12. DataImportResult - 数据导入结果（辅助实体）
// ============================================================

/**
 * 数据导入结果
 */
export interface DataImportResult<T> {
  /** 成功解析的数据行 */
  data: T[];
  /** 解析失败行信息 */
  errors: Array<{ row: number; message: string }>;
  /** 清洗操作日志 */
  cleaningLog: CleaningLogEntry[];
  /** 总行数 */
  totalRows: number;
  /** 成功行数 */
  successRows: number;
  /** 跳过行数（合计行等） */
  skippedRows: number;
  /** 导入时间戳 */
  importedAt: string;
}
