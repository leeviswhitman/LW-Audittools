/**
 * 审计规则引擎
 *
 * 基于 JSON 规则配置，对数据进行自动化校验与异常识别。
 * 规则不写死在 UI 或业务逻辑中，而是通过此引擎统一管理，便于扩展和维护。
 *
 * 规则格式参见 rules/defaultRules.json
 */

import type { JournalEntryRow, TrialBalanceRow, VoucherGroup } from '../models';
import { isWeekend, isPeriodEnd } from '../utils/dateUtils';
import { amountsEqual } from '../utils/numberUtils';
import defaultRulesJson from './rules/defaultRules.json';

// ============================================================
// 规则定义接口
// ============================================================

/** 规则条件操作符 */
export type RuleOperator =
  | 'isEmpty'
  | 'isNotNumber'
  | 'invalidDate'
  | 'lengthLessThan'
  | 'greaterThan'
  | 'startsWith'
  | 'notEqualZero'
  | 'rollForwardFailed'
  | 'reconcileDifference'
  | 'bothDebitCreditNonZero'
  | 'bothDebitCreditZero'
  | 'isPeriodEnd'
  | 'isWeekend'
  | 'containsKeywords'
  | 'amountGreaterThanMateriality'
  | 'always';

/** 规则条件定义 */
export interface RuleCondition {
  field?: string;
  operator: RuleOperator;
  value?: unknown;
  tolerance?: number;
  additional?: {
    field: string;
    operator: RuleOperator;
    value?: unknown;
  };
}

/** 规则定义 */
export interface AuditRule {
  ruleId: string;
  ruleName: string;
  ruleCategory:
    | 'field_integrity'
    | 'data_format'
    | 'balance_direction'
    | 'reconciliation'
    | 'anomaly_detection'
    | 'sampling'
    | 'output_template';
  description: string;
  applicableDataType: 'journal' | 'trial_balance' | 'voucher' | 'cross' | 'all';
  condition: RuleCondition;
  severity: 'error' | 'warning' | 'info';
  outputAction: string;
  humanReviewRequired: boolean;
}

/** 规则执行结果 */
export interface RuleResult {
  ruleId: string;
  ruleName: string;
  severity: 'error' | 'warning' | 'info';
  triggered: boolean;
  message: string;
  affectedField?: string;
  rowIndex?: number;
  humanReviewRequired: boolean;
}

// ============================================================
// 规则引擎类
// ============================================================

export class RuleEngine {
  private rules: AuditRule[];

  constructor(rules?: AuditRule[]) {
    this.rules = rules ?? (defaultRulesJson as AuditRule[]);
  }

  /** 添加自定义规则（不影响默认规则） */
  addRule(rule: AuditRule): void {
    const existing = this.rules.findIndex((r) => r.ruleId === rule.ruleId);
    if (existing >= 0) {
      this.rules[existing] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  /** 获取所有规则 */
  getRules(category?: string): AuditRule[] {
    if (category) {
      return this.rules.filter((r) => r.ruleCategory === category);
    }
    return [...this.rules];
  }

  /**
   * 对单条序时账分录执行规则校验
   * @param entry 序时账分录行
   * @param rowIndex 原始行号
   * @returns 规则执行结果列表
   */
  validateJournalEntry(
    entry: JournalEntryRow,
    rowIndex?: number
  ): RuleResult[] {
    const applicableRules = this.rules.filter(
      (r) => r.applicableDataType === 'journal' || r.applicableDataType === 'all'
    );
    return applicableRules
      .map((rule) => this.evaluateJournalRule(rule, entry, rowIndex))
      .filter((r) => r.triggered);
  }

  /**
   * 对单条余额表行执行规则校验
   * @param row 余额表行
   * @param rowIndex 原始行号
   */
  validateTrialBalanceRow(
    row: TrialBalanceRow,
    rowIndex?: number
  ): RuleResult[] {
    const applicableRules = this.rules.filter(
      (r) =>
        r.applicableDataType === 'trial_balance' ||
        r.applicableDataType === 'all'
    );
    return applicableRules
      .map((rule) => this.evaluateTrialBalanceRule(rule, row, rowIndex))
      .filter((r) => r.triggered);
  }

  /**
   * 对凭证聚合对象执行规则校验
   */
  validateVoucher(voucher: VoucherGroup): RuleResult[] {
    const applicableRules = this.rules.filter(
      (r) =>
        r.applicableDataType === 'voucher' || r.applicableDataType === 'all'
    );
    return applicableRules
      .map((rule) => this.evaluateVoucherRule(rule, voucher))
      .filter((r) => r.triggered);
  }

  // ─── 私有评估方法 ────────────────────────────────────────────

  private evaluateJournalRule(
    rule: AuditRule,
    entry: JournalEntryRow,
    rowIndex?: number
  ): RuleResult {
    const base = {
      ruleId: rule.ruleId,
      ruleName: rule.ruleName,
      severity: rule.severity,
      triggered: false,
      message: '',
      humanReviewRequired: rule.humanReviewRequired,
      rowIndex,
    };

    const { condition } = rule;
    const fieldValue = condition.field
      ? (entry as unknown as Record<string, unknown>)[condition.field]
      : undefined;

    switch (condition.operator) {
      case 'isEmpty':
        if (this.isEmpty(fieldValue)) {
          return {
            ...base,
            triggered: true,
            message: `字段 "${condition.field}" 为空 - ${rule.description}`,
            affectedField: condition.field,
          };
        }
        break;

      case 'lengthLessThan':
        if (
          typeof fieldValue === 'string' &&
          fieldValue.trim().length < (condition.value as number)
        ) {
          return {
            ...base,
            triggered: true,
            message: `字段 "${condition.field}" 内容过短（${fieldValue.trim().length}字符）- ${rule.description}`,
            affectedField: condition.field,
          };
        }
        break;

      case 'invalidDate':
        if (this.isEmpty(fieldValue) || !this.isValidDateStr(String(fieldValue))) {
          return {
            ...base,
            triggered: true,
            message: `字段 "${condition.field}" 日期格式无效："${fieldValue}"`,
            affectedField: condition.field,
          };
        }
        break;

      case 'isNotNumber':
        if (
          fieldValue !== undefined &&
          fieldValue !== null &&
          fieldValue !== '' &&
          isNaN(Number(fieldValue))
        ) {
          return {
            ...base,
            triggered: true,
            message: `字段 "${condition.field}" 值 "${fieldValue}" 不是有效数值`,
            affectedField: condition.field,
          };
        }
        break;

      case 'bothDebitCreditNonZero':
        if (entry.debit !== 0 && entry.credit !== 0) {
          return {
            ...base,
            triggered: true,
            message: `借贷方同时有值：借方 ${entry.debit}，贷方 ${entry.credit}`,
          };
        }
        break;

      case 'bothDebitCreditZero':
        if ((entry.debit === 0 || entry.debit == null) &&
            (entry.credit === 0 || entry.credit == null)) {
          return {
            ...base,
            triggered: true,
            message: '借方和贷方均为零或空，无效分录',
          };
        }
        break;

      case 'isPeriodEnd':
        if (entry.voucherDate && isPeriodEnd(entry.voucherDate, condition.value as number)) {
          return {
            ...base,
            triggered: true,
            message: `凭证日期 ${entry.voucherDate} 为期末（月末最后 ${condition.value} 天），需关注截止期`,
            affectedField: 'voucherDate',
          };
        }
        break;

      case 'isWeekend':
        if (entry.voucherDate && isWeekend(entry.voucherDate)) {
          return {
            ...base,
            triggered: true,
            message: `凭证日期 ${entry.voucherDate} 为非工作日（周末）`,
            affectedField: 'voucherDate',
          };
        }
        break;

      case 'containsKeywords': {
        const keywords = condition.value as string[];
        const summaryText = String(fieldValue ?? '');
        const found = keywords.filter((kw) => summaryText.includes(kw));
        if (found.length > 0) {
          return {
            ...base,
            triggered: true,
            message: `摘要含敏感关键词：${found.join('、')}`,
            affectedField: condition.field,
          };
        }
        break;
      }
    }

    return base;
  }

  private evaluateTrialBalanceRule(
    rule: AuditRule,
    row: TrialBalanceRow,
    rowIndex?: number
  ): RuleResult {
    const base = {
      ruleId: rule.ruleId,
      ruleName: rule.ruleName,
      severity: rule.severity,
      triggered: false,
      message: '',
      humanReviewRequired: rule.humanReviewRequired,
      rowIndex,
    };

    const { condition } = rule;
    const fieldValue = condition.field
      ? (row as unknown as Record<string, unknown>)[condition.field]
      : undefined;

    switch (condition.operator) {
      case 'isEmpty':
        if (this.isEmpty(fieldValue)) {
          return {
            ...base,
            triggered: true,
            message: `字段 "${condition.field}" 为空`,
            affectedField: condition.field,
          };
        }
        break;

      case 'rollForwardFailed': {
        const tolerance = condition.tolerance ?? 0.01;
        // 期初借方 + 本期借方 - 本期贷方 = 期末借方
        const expectedEndDebit = row.beginDebit + row.currentDebit - row.currentCredit;
        // 期初贷方 + 本期贷方 - 本期借方 = 期末贷方
        const expectedEndCredit = row.beginCredit + row.currentCredit - row.currentDebit;

        if (
          !amountsEqual(row.endDebit, expectedEndDebit < 0 ? 0 : expectedEndDebit, tolerance) ||
          !amountsEqual(row.endCredit, expectedEndCredit < 0 ? 0 : expectedEndCredit, tolerance)
        ) {
          return {
            ...base,
            triggered: true,
            message: `科目 ${row.accountCode} 期初期末滚动不平：期末借方应为 ${expectedEndDebit.toFixed(2)}，实际为 ${row.endDebit}`,
          };
        }
        break;
      }

      case 'startsWith':
        if (
          typeof fieldValue === 'string' &&
          fieldValue.startsWith(String(condition.value))
        ) {
          // 检查 additional 条件
          if (condition.additional) {
            const addValue = (row as unknown as Record<string, unknown>)[condition.additional.field];
            if (this.evaluateSimpleCondition(condition.additional.operator, addValue, condition.additional.value)) {
              return {
                ...base,
                triggered: true,
                message: `${rule.description}（科目：${row.accountCode}）`,
                affectedField: condition.field,
              };
            }
          }
        }
        break;
    }

    return base;
  }

  private evaluateVoucherRule(
    rule: AuditRule,
    voucher: VoucherGroup
  ): RuleResult {
    const base = {
      ruleId: rule.ruleId,
      ruleName: rule.ruleName,
      severity: rule.severity,
      triggered: false,
      message: '',
      humanReviewRequired: rule.humanReviewRequired,
    };

    const { condition } = rule;

    if (condition.operator === 'notEqualZero') {
      const tolerance = condition.tolerance ?? 0.005;
      if (Math.abs(voucher.difference) > tolerance) {
        return {
          ...base,
          triggered: true,
          message: `凭证 ${voucher.voucherNo} 借贷不平衡，差额 ${voucher.difference.toFixed(2)}`,
        };
      }
    }

    return base;
  }

  // ─── 工具方法 ────────────────────────────────────────────────

  private isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    return false;
  }

  private isValidDateStr(str: string): boolean {
    const d = new Date(str);
    if (isNaN(d.getTime())) return false;
    const year = d.getFullYear();
    return year >= 1990 && year <= new Date().getFullYear() + 1;
  }

  private evaluateSimpleCondition(
    operator: RuleOperator,
    value: unknown,
    threshold: unknown
  ): boolean {
    switch (operator) {
      case 'greaterThan':
        return Number(value) > Number(threshold);
      case 'isEmpty':
        return value === null || value === undefined || value === '';
      default:
        return false;
    }
  }
}

/** 默认规则引擎实例（单例） */
export const defaultRuleEngine = new RuleEngine();
