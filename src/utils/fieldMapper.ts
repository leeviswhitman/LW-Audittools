/**
 * 字段映射工具模块
 *
 * 自动识别中英文混用的表头，将原始列名映射到系统标准字段名。
 * 支持别名匹配、模糊匹配、用户确认机制。
 */

import type { FieldMapping } from '../models';

/**
 * 标准字段别名映射表
 * key = 标准字段名
 * value = 可能的别名列表（中英文均包含，全部小写后比较）
 */
export const FIELD_ALIASES: Record<string, string[]> = {
  // ── 序时账字段 ──────────────────────────────────────────────
  voucherDate: [
    '日期', '凭证日期', '记账日期', '入账日期', '过账日期',
    'date', 'voucher date', 'posting date', 'entry date',
  ],
  voucherType: [
    '凭证字号', '字号', '凭证类型', '凭证字',
    'voucher type', 'type',
  ],
  voucherNo: [
    '凭证编号', '凭证号', '凭证号码', '票据号', '凭证序号',
    'voucher no', 'voucher no.', 'voucher number', 'no', 'no.',
  ],
  entrySeq: [
    '行号', '分录序号', '序号', '行序号',
    'seq', 'sequence', 'line no', 'line number',
  ],
  summary: [
    '摘要', '业务摘要', '备注', '说明', '经济业务内容',
    'summary', 'remark', 'description', 'memo', 'narration',
  ],
  accountCode: [
    '科目编码', '科目代码', '会计科目编码', '科目编号', '账户编码',
    'account code', 'account no', 'account number', 'code',
  ],
  accountName: [
    '科目名称', '会计科目', '科目', '账户名称',
    'account name', 'account', 'subject',
  ],
  auxiliaryInfo: [
    '辅助核算', '辅助项', '核算项目', '核算维度', '项目',
    'auxiliary', 'sub ledger', 'cost center',
  ],
  debit: [
    '借方', '借方金额', '借方发生额', '借方数', '借',
    'debit', 'dr', 'dr amount',
  ],
  credit: [
    '贷方', '贷方金额', '贷方发生额', '贷方数', '贷',
    'credit', 'cr', 'cr amount',
  ],
  balance: [
    '余额', '期末余额', '账户余额', '累计余额',
    'balance', 'closing balance',
  ],
  counterAccountCode: [
    '对方科目编码', '对方科目代码', '对科目编码',
    'contra account code', 'counter account',
  ],
  counterAccountName: [
    '对方科目', '对方科目名称', '对科目',
    'contra account', 'counter account name',
  ],
  documentNo: [
    '单据号', '发票号', '合同号', '订单号', '凭证附件号', '票号',
    'document no', 'invoice no', 'contract no', 'order no',
  ],
  operator: [
    '业务员', '录入人', '制单人', '会计', '操作员', '制单人员',
    'operator', 'user', 'entered by', 'prepared by',
  ],
  department: [
    '部门', '部门名称', '成本中心', '车间', '分公司',
    'department', 'dept', 'cost center', 'branch',
  ],
  partyName: [
    '往来单位', '客户', '供应商', '对方单位', '客商名称', '单位名称',
    'party name', 'customer', 'vendor', 'supplier', 'client',
  ],

  // ── 科目余额表字段 ────────────────────────────────────────
  parentCode: [
    '上级科目编码', '父科目', '上级编码',
    'parent code', 'parent account',
  ],
  level: [
    '科目级次', '层级', '级次',
    'level', 'account level',
  ],
  beginDebit: [
    '期初借方', '期初借方余额', '年初借方', '开始借方',
    'opening debit', 'beginning debit', 'begin debit',
  ],
  beginCredit: [
    '期初贷方', '期初贷方余额', '年初贷方', '开始贷方',
    'opening credit', 'beginning credit', 'begin credit',
  ],
  currentDebit: [
    '本期借方', '本期借方发生额', '发生借方', '当期借方',
    'current debit', 'period debit', 'debit movement',
  ],
  currentCredit: [
    '本期贷方', '本期贷方发生额', '发生贷方', '当期贷方',
    'current credit', 'period credit', 'credit movement',
  ],
  endDebit: [
    '期末借方', '期末借方余额', '结束借方',
    'closing debit', 'ending debit', 'end debit',
  ],
  endCredit: [
    '期末贷方', '期末贷方余额', '结束贷方',
    'closing credit', 'ending credit', 'end credit',
  ],
};

/**
 * 标准字段数据类型
 */
export const FIELD_DATA_TYPES: Record<string, 'string' | 'number' | 'date' | 'boolean'> = {
  voucherDate: 'date',
  voucherType: 'string',
  voucherNo: 'string',
  entrySeq: 'number',
  summary: 'string',
  accountCode: 'string',
  accountName: 'string',
  auxiliaryInfo: 'string',
  debit: 'number',
  credit: 'number',
  balance: 'number',
  counterAccountCode: 'string',
  counterAccountName: 'string',
  documentNo: 'string',
  operator: 'string',
  department: 'string',
  partyName: 'string',
  parentCode: 'string',
  level: 'number',
  beginDebit: 'number',
  beginCredit: 'number',
  currentDebit: 'number',
  currentCredit: 'number',
  endDebit: 'number',
  endCredit: 'number',
};

/**
 * 必填字段集合（按数据类型）
 */
export const REQUIRED_FIELDS: Record<string, string[]> = {
  journal: ['voucherDate', 'voucherNo', 'accountCode'],
  trial_balance: ['accountCode', 'accountName'],
};

/**
 * 根据原始列名自动推断标准字段名
 * @param rawColumn 原始列名（原始文本）
 * @returns 匹配的标准字段名，找不到则返回 null
 */
export function guessFieldName(rawColumn: string): string | null {
  const normalized = rawColumn
    .trim()
    .toLowerCase()
    .replace(/[\s_\-\/·•]+/g, '') // 去除空格、下划线、连字符等
    .replace(/[（）()【】\[\]]/g, ''); // 去除括号

  for (const [fieldName, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = alias
        .toLowerCase()
        .replace(/[\s_\-\/·•]+/g, '')
        .replace(/[（）()【】\[\]]/g, '');
      if (normalized === normalizedAlias) {
        return fieldName;
      }
    }
  }

  // 模糊匹配（包含关系）
  for (const [fieldName, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = alias.toLowerCase().replace(/\s+/g, '');
      if (
        normalized.includes(normalizedAlias) ||
        normalizedAlias.includes(normalized)
      ) {
        return fieldName;
      }
    }
  }

  return null;
}

/**
 * 从表头行自动生成字段映射建议
 * @param headers 表头列名数组
 * @param dataType 数据类型（用于标记必填字段）
 * @returns 字段映射建议列表
 */
export function autoDetectMappings(
  headers: string[],
  dataType: 'journal' | 'trial_balance' | 'voucher' | 'attachment_index' = 'journal'
): FieldMapping[] {
  const requiredFields = REQUIRED_FIELDS[dataType] ?? [];

  return headers.map((header) => {
    const guessed = guessFieldName(header);
    const targetField = guessed ?? header; // 无法映射时使用原始列名

    return {
      sourceColumn: header,
      targetField,
      description: guessed ? `自动识别为 "${targetField}"` : '未能自动识别，请手动确认',
      required: requiredFields.includes(targetField),
      dataType: FIELD_DATA_TYPES[targetField] ?? 'string',
      confirmed: guessed !== null, // 自动识别的标记为已确认，未识别的需人工确认
    };
  });
}

/**
 * 验证字段映射是否覆盖所有必填字段
 * @param mappings 字段映射列表
 * @param dataType 数据类型
 * @returns 缺失的必填字段列表
 */
export function getMissingRequiredFields(
  mappings: FieldMapping[],
  dataType: 'journal' | 'trial_balance' = 'journal'
): string[] {
  const requiredFields = REQUIRED_FIELDS[dataType] ?? [];
  const mappedTargets = new Set(mappings.map((m) => m.targetField));
  return requiredFields.filter((f) => !mappedTargets.has(f));
}
