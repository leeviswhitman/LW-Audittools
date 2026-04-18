/**
 * 科目余额表分析页面
 *
 * 展示标准化后的科目余额表，包括余额方向异常、期初期末滚动校验结果、勾稽状态。
 */

import React, { useMemo, useState } from 'react';
import { useAuditStore } from '../../store/auditStore';

export const TrialBalancePage: React.FC = () => {
  const { trialBalanceRows, setCurrentPage } = useAuditStore();

  const [filterCode, setFilterCode] = useState('');
  const [showAnomalyOnly, setShowAnomalyOnly] = useState(false);

  const anomalyRows = useMemo(
    () => trialBalanceRows.filter((r) => r.anomalyFlags && r.anomalyFlags.length > 0),
    [trialBalanceRows]
  );

  const totalEndDebit = useMemo(
    () => trialBalanceRows.reduce((s, r) => s + r.endDebit, 0),
    [trialBalanceRows]
  );
  const totalEndCredit = useMemo(
    () => trialBalanceRows.reduce((s, r) => s + r.endCredit, 0),
    [trialBalanceRows]
  );

  const filtered = useMemo(() => {
    let rows = showAnomalyOnly ? anomalyRows : trialBalanceRows;
    if (filterCode) {
      rows = rows.filter(
        (r) =>
          r.accountCode.includes(filterCode) ||
          r.accountName.includes(filterCode)
      );
    }
    return rows;
  }, [trialBalanceRows, anomalyRows, filterCode, showAnomalyOnly]);

  if (trialBalanceRows.length === 0) {
    return (
      <div className="page-body">
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚖️</div>
          <h3 style={{ fontSize: '14px', color: '#1e3a5f', marginBottom: '8px' }}>暂无科目余额表数据</h3>
          <p style={{ fontSize: '12px', color: '#666' }}>
            请先在「字段映射」页面完成科目余额表导入（选择"科目余额表"数据类型）。
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: '12px' }}
            onClick={() => setCurrentPage('field_mapping')}
          >
            → 前往字段映射
          </button>
        </div>
      </div>
    );
  }

  const directionLabel = (d?: string) => {
    if (d === 'debit') return '借';
    if (d === 'credit') return '贷';
    return '-';
  };

  const reconcileStatusLabel = (s?: string) => {
    if (s === 'matched') return { label: '✅ 已勾稽', cls: 'badge-success' };
    if (s === 'unmatched') return { label: '❌ 差异', cls: 'badge-error' };
    return { label: '⏳ 待校验', cls: 'badge-warning' };
  };

  return (
    <div className="page-body">
      <div className="disclaimer-bar">
        ⚠️ 余额方向异常及勾稽状态仅供参考，需审计人员结合被审计单位具体情况独立复核。
      </div>

      {/* 概览统计 */}
      <div className="card">
        <div className="card-title">📊 科目余额表概览</div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{trialBalanceRows.length}</div>
            <div className="stat-label">科目总数</div>
          </div>
          <div className={`stat-card ${anomalyRows.length > 0 ? 'warning' : 'success'}`}>
            <div className="stat-value">{anomalyRows.length}</div>
            <div className="stat-label">异常科目</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {trialBalanceRows.filter((r) => r.reconcileStatus === 'matched').length}
            </div>
            <div className="stat-label">已勾稽科目</div>
          </div>
          <div className={`stat-card ${Math.abs(totalEndDebit - totalEndCredit) > 0.01 ? 'error' : 'success'}`}>
            <div className="stat-value">
              {Math.abs(totalEndDebit - totalEndCredit) < 0.01 ? '平衡' : '差异'}
            </div>
            <div className="stat-label">期末余额</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '20px', marginTop: '8px', fontSize: '11px', color: '#555' }}>
          <span>期末借方合计：<strong style={{ color: '#1e3a5f' }}>{totalEndDebit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
          <span>期末贷方合计：<strong style={{ color: '#1e3a5f' }}>{totalEndCredit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
        </div>
      </div>

      {/* 筛选 */}
      <div className="card">
        <div className="card-title">🔍 科目余额表明细（{filtered.length} 行）</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="按科目编码/名称筛选..."
            value={filterCode}
            onChange={(e) => setFilterCode(e.target.value)}
            style={{ flex: 1, minWidth: '120px', fontSize: '11px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px' }}
          />
          <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showAnomalyOnly}
              onChange={(e) => setShowAnomalyOnly(e.target.checked)}
            />
            仅显示异常科目
          </label>
          {filterCode && (
            <button className="btn btn-secondary" onClick={() => setFilterCode('')}>清除</button>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>科目编码</th>
                <th>科目名称</th>
                <th>期初借方</th>
                <th>期初贷方</th>
                <th>本期借方</th>
                <th>本期贷方</th>
                <th>期末借方</th>
                <th>期末贷方</th>
                <th>正常方向</th>
                <th>勾稽状态</th>
                <th>异常</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map((r) => {
                const status = reconcileStatusLabel(r.reconcileStatus);
                return (
                  <tr
                    key={r.id}
                    className={r.anomalyFlags && r.anomalyFlags.length > 0 ? 'anomaly' : ''}
                  >
                    <td style={{ fontWeight: 600 }}>{r.accountCode}</td>
                    <td>{r.accountName}</td>
                    <td style={{ textAlign: 'right', fontSize: '11px' }}>
                      {r.beginDebit > 0 ? r.beginDebit.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '11px' }}>
                      {r.beginCredit > 0 ? r.beginCredit.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '11px' }}>
                      {r.currentDebit > 0 ? r.currentDebit.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '11px' }}>
                      {r.currentCredit > 0 ? r.currentCredit.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600 }}>
                      {r.endDebit > 0 ? r.endDebit.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600 }}>
                      {r.endCredit > 0 ? r.endCredit.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : ''}
                    </td>
                    <td style={{ textAlign: 'center' }}>{directionLabel(r.normalDirection)}</td>
                    <td>
                      <span className={`badge ${status.cls}`} style={{ fontSize: '10px' }}>
                        {status.label}
                      </span>
                    </td>
                    <td style={{ fontSize: '10px', color: '#d32f2f', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={(r.anomalyFlags ?? []).join('\n')}>
                      {r.anomalyFlags && r.anomalyFlags.length > 0
                        ? r.anomalyFlags[0]
                        : ''}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', color: '#888', fontSize: '11px' }}>无匹配结果</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 300 && (
          <p style={{ fontSize: '11px', color: '#666', marginTop: '6px', textAlign: 'center' }}>
            仅显示前 300 行，共 {filtered.length} 行
          </p>
        )}
      </div>
    </div>
  );
};
