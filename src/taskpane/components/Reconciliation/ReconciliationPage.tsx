/**
 * 勾稽校验页面
 */

import React, { useState } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { runFullReconciliation } from '../../../modules/ReconciliationEngine';
import { ExcelAdapter } from '../../../excel/ExcelAdapter';
import {
  formatReconciliationOutput,
  recordWorkpaperOutput,
} from '../../../modules/WorkpaperGenerator';

export const ReconciliationPage: React.FC = () => {
  const {
    journalEntries, trialBalanceRows, vouchers,
    operator, setLoading, isLoading,
    setReconciliationSummary, setReconciliationIssues,
    reconciliationSummary, reconciliationIssues,
  } = useAuditStore();

  const [error, setError] = useState('');
  const [exportDone, setExportDone] = useState(false);

  const handleReconcile = () => {
    if (journalEntries.length === 0 || trialBalanceRows.length === 0) {
      setError('需要先导入序时账和科目余额表数据');
      return;
    }
    setError('');
    setLoading(true, '正在执行勾稽校验...');
    try {
      const summary = runFullReconciliation(trialBalanceRows, journalEntries, vouchers, operator);
      setReconciliationSummary(summary);
      setReconciliationIssues(summary.issues);
    } catch (e) {
      setError(`勾稽失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (reconciliationIssues.length === 0) return;
    setLoading(true, '正在导出勾稽差异表...');
    try {
      const output = formatReconciliationOutput(reconciliationIssues);
      const sheetName = await ExcelAdapter.writeNewSheet(
        `勾稽差异表_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}`,
        output.headers,
        output.rows,
        true
      );
      recordWorkpaperOutput('reconciliation_diff', sheetName, reconciliationIssues.length, operator);
      setExportDone(true);
    } catch (e) {
      setError(`导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const severityLabel = (s: string) =>
    s === 'error' ? '错误' : s === 'warning' ? '警告' : '提示';

  const severityBadge = (s: string) =>
    s === 'error' ? 'badge-error' : s === 'warning' ? 'badge-warning' : 'badge-info';

  return (
    <div className="page-body">
      <div className="disclaimer-bar">
        ⚠️ 勾稽差异需审计人员结合具体情况做出职业判断，系统识别结果仅为辅助，不代表审计结论。
      </div>

      <div className="card">
        <div className="card-title">✅ 执行勾稽校验</div>
        <p style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
          将执行以下校验：①凭证借贷平衡 ②余额表期初期末滚动 ③余额表与序时账发生额勾稽 ④科目名称一致性 ⑤余额表整体平衡
        </p>
        <div className="btn-group">
          <button
            className="btn btn-primary"
            onClick={handleReconcile}
            disabled={isLoading || journalEntries.length === 0 || trialBalanceRows.length === 0}
          >
            ✅ 执行勾稽校验
          </button>
          {reconciliationIssues.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={handleExport}
              disabled={isLoading}
            >
              📤 导出《勾稽差异表》
            </button>
          )}
          {exportDone && <span style={{ fontSize: '11px', color: '#388e3c' }}>✅ 已导出</span>}
        </div>
        {(journalEntries.length === 0 || trialBalanceRows.length === 0) && (
          <p style={{ fontSize: '11px', color: '#888', marginTop: '6px' }}>
            ⚠️ 需要同时导入序时账（{journalEntries.length} 条）和科目余额表（{trialBalanceRows.length} 行）才能执行勾稽
          </p>
        )}
        {error && <div style={{ color: '#d32f2f', fontSize: '11px', marginTop: '6px' }}>❌ {error}</div>}
      </div>

      {reconciliationSummary && (
        <>
          <div className="card">
            <div className="card-title">📊 勾稽结果概览</div>
            <div className="stat-grid">
              <div className={`stat-card ${reconciliationSummary.errorCount > 0 ? 'error' : 'success'}`}>
                <div className="stat-value">{reconciliationSummary.errorCount}</div>
                <div className="stat-label">错误项</div>
              </div>
              <div className={`stat-card ${reconciliationSummary.warningCount > 0 ? 'warning' : ''}`}>
                <div className="stat-value">{reconciliationSummary.warningCount}</div>
                <div className="stat-label">警告项</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{reconciliationSummary.infoCount}</div>
                <div className="stat-label">提示项</div>
              </div>
              <div className={`stat-card ${!reconciliationSummary.hasErrors ? 'success' : 'error'}`}>
                <div className="stat-value">{reconciliationSummary.hasErrors ? '有差异' : '通过'}</div>
                <div className="stat-label">总体状态</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">🔍 差异明细（共 {reconciliationIssues.length} 项）</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>严重程度</th>
                    <th>勾稽类型</th>
                    <th>科目编码</th>
                    <th>差额</th>
                    <th>描述</th>
                    <th>需人工复核</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationIssues.slice(0, 100).map((issue, idx) => (
                    <tr
                      key={issue.id}
                      className={issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'anomaly' : ''}
                    >
                      <td>{idx + 1}</td>
                      <td>
                        <span className={`badge ${severityBadge(issue.severity)}`}>
                          {severityLabel(issue.severity)}
                        </span>
                      </td>
                      <td>{issue.reconcileType}</td>
                      <td>{issue.accountCode ?? ''}</td>
                      <td>{issue.difference != null ? issue.difference.toLocaleString() : ''}</td>
                      <td
                        title={issue.description}
                        style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {issue.description.split('\n')[0]}
                      </td>
                      <td><span className="badge badge-error">是</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reconciliationIssues.length > 100 && (
                <p style={{ fontSize: '11px', color: '#666', marginTop: '6px', textAlign: 'center' }}>
                  仅显示前 100 条，导出 Sheet 查看全部。
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
