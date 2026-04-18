/**
 * Zustand 全局状态管理
 *
 * 管理插件运行时的核心状态，包括项目信息、数据集、处理结果和 UI 状态。
 * 支持多模块之间的状态共享，便于联查、抽凭等跨模块操作。
 */

import { create } from 'zustand';
import type {
  JournalEntryRow,
  TrialBalanceRow,
  VoucherGroup,
  ReconciliationIssue,
  AuditLog,
  MappingConfig,
} from '../../models';
import type { SheetInfo } from '../../excel/ExcelAdapter';
import type { SheetScanResult } from '../../excel/SheetScanner';
import type { SamplingResult } from '../../modules/SampleEngine';
import type { ReconciliationSummary } from '../../modules/ReconciliationEngine';

// ─── 导航页面定义 ───────────────────────────────────────────

export type NavPage =
  | 'overview'
  | 'import'
  | 'field_mapping'
  | 'cleaning'
  | 'journal'
  | 'trial_balance'
  | 'voucher_link'
  | 'sampling'
  | 'reconciliation'
  | 'workpaper'
  | 'settings'
  | 'audit_log';

// ─── 全局 Store 状态 ─────────────────────────────────────────

export interface AuditStore {
  // ── 项目信息 ───────────────────────────────────────────────
  projectId: string;
  clientName: string;
  periodKey: string;
  operator: string;

  // ── UI 状态 ────────────────────────────────────────────────
  currentPage: NavPage;
  isLoading: boolean;
  loadingMessage: string;

  // ── Sheet 扫描结果 ─────────────────────────────────────────
  sheetList: SheetInfo[];
  scanResults: SheetScanResult[];

  // ── 字段映射配置 ───────────────────────────────────────────
  journalMappingConfig: MappingConfig | null;
  trialBalanceMappingConfig: MappingConfig | null;

  // ── 处理后数据 ─────────────────────────────────────────────
  journalEntries: JournalEntryRow[];
  trialBalanceRows: TrialBalanceRow[];
  vouchers: VoucherGroup[];

  // ── 处理结果 ───────────────────────────────────────────────
  reconciliationSummary: ReconciliationSummary | null;
  reconciliationIssues: ReconciliationIssue[];
  samplingResult: SamplingResult | null;
  samplingHistory: SamplingResult[];

  // ── 日志 ───────────────────────────────────────────────────
  auditLogs: AuditLog[];

  // ── Actions ────────────────────────────────────────────────
  setCurrentPage: (page: NavPage) => void;
  setLoading: (loading: boolean, message?: string) => void;
  setProjectInfo: (info: { clientName?: string; periodKey?: string; operator?: string }) => void;
  setSheetList: (sheets: SheetInfo[]) => void;
  setScanResults: (results: SheetScanResult[]) => void;
  setJournalMappingConfig: (config: MappingConfig | null) => void;
  setTrialBalanceMappingConfig: (config: MappingConfig | null) => void;
  setJournalEntries: (entries: JournalEntryRow[]) => void;
  setTrialBalanceRows: (rows: TrialBalanceRow[]) => void;
  setVouchers: (vouchers: VoucherGroup[]) => void;
  setReconciliationSummary: (summary: ReconciliationSummary | null) => void;
  setReconciliationIssues: (issues: ReconciliationIssue[]) => void;
  setSamplingResult: (result: SamplingResult | null) => void;
  addSamplingResult: (result: SamplingResult) => void;
  addAuditLog: (log: AuditLog) => void;
  setAuditLogs: (logs: AuditLog[]) => void;
  reset: () => void;
}

const initialState = {
  projectId: `proj_${Date.now()}`,
  clientName: '',
  periodKey: '',
  operator: '审计人员',
  currentPage: 'overview' as NavPage,
  isLoading: false,
  loadingMessage: '',
  sheetList: [],
  scanResults: [],
  journalMappingConfig: null,
  trialBalanceMappingConfig: null,
  journalEntries: [],
  trialBalanceRows: [],
  vouchers: [],
  reconciliationSummary: null,
  reconciliationIssues: [],
  samplingResult: null,
  samplingHistory: [],
  auditLogs: [],
};

export const useAuditStore = create<AuditStore>((set) => ({
  ...initialState,

  setCurrentPage: (page) => set({ currentPage: page }),

  setLoading: (loading, message = '') =>
    set({ isLoading: loading, loadingMessage: message }),

  setProjectInfo: (info) =>
    set((state) => ({
      clientName: info.clientName ?? state.clientName,
      periodKey: info.periodKey ?? state.periodKey,
      operator: info.operator ?? state.operator,
    })),

  setSheetList: (sheets) => set({ sheetList: sheets }),
  setScanResults: (results) => set({ scanResults: results }),

  setJournalMappingConfig: (config) => set({ journalMappingConfig: config }),
  setTrialBalanceMappingConfig: (config) => set({ trialBalanceMappingConfig: config }),

  setJournalEntries: (entries) => set({ journalEntries: entries }),
  setTrialBalanceRows: (rows) => set({ trialBalanceRows: rows }),
  setVouchers: (vouchers) => set({ vouchers }),

  setReconciliationSummary: (summary) => set({ reconciliationSummary: summary }),
  setReconciliationIssues: (issues) => set({ reconciliationIssues: issues }),

  setSamplingResult: (result) => set({ samplingResult: result }),
  addSamplingResult: (result) =>
    set((state) => ({
      samplingResult: result,
      samplingHistory: [result, ...state.samplingHistory],
    })),

  addAuditLog: (log) =>
    set((state) => ({ auditLogs: [...state.auditLogs, log] })),
  setAuditLogs: (logs) => set({ auditLogs: logs }),

  reset: () => set({ ...initialState, projectId: `proj_${Date.now()}` }),
}));
