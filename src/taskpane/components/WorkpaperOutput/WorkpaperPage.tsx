/**
 * 底稿输出页面
 */

import React, { useState } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { ExcelAdapter } from '../../../excel/ExcelAdapter';
import {
  formatJournalOutput,
  formatTrialBalanceOutput,
  formatReconciliationOutput,
  formatAnomalyOutput,
  formatLogOutput,
  generateAuditMemoDraft,
  recordWorkpaperOutput,
} from '../../../modules/WorkpaperGenerator';
import { getAllLogs } from '../../../utils/logger';

export const WorkpaperPage: React.FC = () => {
  const {
    journalEntries, trialBalanceRows,
    reconciliationIssues, samplingResult,
    operator, clientName, periodKey,
    setLoading, isLoading,
  } = useAuditStore();

  const [exportStatus, setExportStatus] = useState<Record<string, 'idle' | 'done' | 'error'>>({});
  const [error, setError] = useState('');

  const setStatus = (key: string, status: 'idle' | 'done' | 'error') => {
    setExportStatus((prev) => ({ ...prev, [key]: status }));
  };

  const doExport = async (key: string, task: () => Promise<void>) => {
    setError('');
    setLoading(true, `正在导出 ${key}...`);
    try {
      await task();
      setStatus(key, 'done');
    } catch (e) {
      setError(`${key} 导出失败：${e instanceof Error ? e.message : String(e)}`);
      setStatus(key, 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportJournal = () => doExport('序时账清洗结果', async () => {
    const output = formatJournalOutput(journalEntries);
    const sheetName = await ExcelAdapter.writeNewSheet('序时账清洗结果', output.headers, output.rows, true);
    recordWorkpaperOutput('journal_cleaned', sheetName, journalEntries.length, operator);
  });

  const exportTrialBalance = () => doExport('余额表标准化结果', async () => {
    const output = formatTrialBalanceOutput(trialBalanceRows);
    const sheetName = await ExcelAdapter.writeNewSheet('余额表标准化结果', output.headers, output.rows, true);
    recordWorkpaperOutput('trial_balance_standardized', sheetName, trialBalanceRows.length, operator);
  });

  const exportReconciliation = () => doExport('勾稽差异表', async () => {
    const output = formatReconciliationOutput(reconciliationIssues);
    const sheetName = await ExcelAdapter.writeNewSheet('余额表与序时账勾稽差异表', output.headers, output.rows, true);
    recordWorkpaperOutput('reconciliation_diff', sheetName, reconciliationIssues.length, operator);
  });

  const exportAnomalies = () => doExport('异常事项汇总', async () => {
    const output = formatAnomalyOutput(journalEntries);
    const sheetName = await ExcelAdapter.writeNewSheet('异常事项汇总表', output.headers, output.rows, true);
    recordWorkpaperOutput('anomaly_summary', sheetName, output.rows.length, operator);
  });

  const exportLog = () => doExport('处理日志', async () => {
    const logs = getAllLogs();
    const output = formatLogOutput(logs);
    const sheetName = await ExcelAdapter.writeNewSheet('自动处理日志', output.headers, output.rows, false);
    recordWorkpaperOutput('process_log', sheetName, logs.length, operator);
  });

  const exportMemo = () => doExport('审计说明草稿', async () => {
    const draft = generateAuditMemoDraft({
      clientName,
      periodKey,
      journalCount: journalEntries.length,
      tbRowCount: trialBalanceRows.length,
      anomalyCount: journalEntries.filter((e) => e.anomalyFlags && e.anomalyFlags.length > 0).length,
      sampleCount: samplingResult?.sampleSize ?? 0,
      reconciliationIssues,
      hasErrors: reconciliationIssues.some((i) => i.severity === 'error'),
    });

    const headers = ['审计说明草稿'];
    const rows = [
      ['【标题】' + draft.title],
      [''],
      [draft.disclaimer],
      [''],
      ...draft.content.split('\n').map((line) => [line]),
      [''],
      [`生成时间：${draft.generatedAt}  版本：${draft.version}`],
    ];

    const sheetName = await ExcelAdapter.writeNewSheet('审计说明草稿', headers, rows, false);
    recordWorkpaperOutput('audit_memo_draft', sheetName, rows.length, operator);
  });

  const OutputItem: React.FC<{
    title: string;
    desc: string;
    disabled: boolean;
    onExport: () => void;
  }> = ({ title, desc, disabled, onExport }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '12px' }}>{title}</div>
        <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {exportStatus[title] === 'done' && <span style={{ fontSize: '11px', color: '#388e3c' }}>✅</span>}
        {exportStatus[title] === 'error' && <span style={{ fontSize: '11px', color: '#d32f2f' }}>❌</span>}
        <button
          className="btn btn-secondary btn-sm"
          onClick={onExport}
          disabled={disabled || isLoading}
        >
          导出 →
        </button>
      </div>
    </div>
  );

  return (
    <div className="page-body">
      <div className="disclaimer-bar">
        ⚠️ 所有输出均为系统生成草稿，需项目组复核后方可作为审计底稿。
      </div>

      <div className="card">
        <div className="card-title">📄 底稿输出清单</div>

        <OutputItem
          title="① 序时账清洗结果"
          desc={`清洗后标准序时账，共 ${journalEntries.length.toLocaleString()} 条分录`}
          disabled={journalEntries.length === 0}
          onExport={exportJournal}
        />
        <OutputItem
          title="② 科目余额表标准化结果"
          desc={`标准化余额表，共 ${trialBalanceRows.length} 个科目`}
          disabled={trialBalanceRows.length === 0}
          onExport={exportTrialBalance}
        />
        <OutputItem
          title="③ 余额表与序时账勾稽差异表"
          desc={`勾稽差异，共 ${reconciliationIssues.length} 项（${reconciliationIssues.filter((i) => i.severity === 'error').length} 错误）`}
          disabled={reconciliationIssues.length === 0}
          onExport={exportReconciliation}
        />
        <OutputItem
          title="④ 异常事项汇总表"
          desc={`异常分录，共 ${journalEntries.filter((e) => e.anomalyFlags && e.anomalyFlags.length > 0).length} 条`}
          disabled={journalEntries.length === 0}
          onExport={exportAnomalies}
        />
        <OutputItem
          title="⑤ 自动处理日志"
          desc="系统操作全日志，不可篡改，仅可追加"
          disabled={false}
          onExport={exportLog}
        />
        <OutputItem
          title="⑥ 审计说明草稿"
          desc="中文书面风格审计说明，需人工复核后使用"
          disabled={journalEntries.length === 0}
          onExport={exportMemo}
        />
      </div>

      {error && (
        <div className="card">
          <div style={{ color: '#d32f2f', fontSize: '12px' }}>❌ {error}</div>
        </div>
      )}

      <div className="card">
        <div className="card-title">💡 输出说明</div>
        <ul style={{ fontSize: '11px', lineHeight: '1.8', color: '#555', paddingLeft: '16px' }}>
          <li>所有输出 Sheet 第一行均包含人工复核免责声明</li>
          <li>输出结果保留原始数据来源、行号和时间戳，便于追溯</li>
          <li>审计说明草稿采用中国会计师事务所常见书面风格，但不得作为已执行程序的直接证明</li>
          <li>所有输出均记录在审计日志中，包含操作者和时间</li>
        </ul>
      </div>
    </div>
  );
};
