/**
 * 数据清洗日志页面
 *
 * 展示上次数据导入时的清洗操作日志与错误明细。
 */

import React, { useState } from 'react';
import { useAuditStore } from '../../store/auditStore';

export const CleaningPage: React.FC = () => {
  const { cleaningLog, cleaningErrors, journalEntries, trialBalanceRows, setCurrentPage } = useAuditStore();

  const [showAll, setShowAll] = useState(false);
  const PREVIEW_LIMIT = 100;

  const displayLog = showAll ? cleaningLog : cleaningLog.slice(0, PREVIEW_LIMIT);

  const ruleStats = cleaningLog.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.rule] = (acc[entry.rule] ?? 0) + 1;
    return acc;
  }, {});

  if (cleaningLog.length === 0 && cleaningErrors.length === 0) {
    return (
      <div className="page-body">
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div style={{ fontSize: '28px', marginBottom: '12px' }}>🧹</div>
          <h3 style={{ fontSize: '14px', color: '#1e3a5f', marginBottom: '8px' }}>暂无清洗日志</h3>
          <p style={{ fontSize: '12px', color: '#666' }}>
            请先在「字段映射」页面执行数据导入，系统将自动记录数据清洗操作。
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

  return (
    <div className="page-body">
      <div className="disclaimer-bar">
        ⚠️ 清洗日志记录系统自动处理的字段转换，请复核异常项后再使用清洗结果。
      </div>

      {/* 统计概览 */}
      <div className="card">
        <div className="card-title">📊 清洗结果概览</div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{cleaningLog.length.toLocaleString()}</div>
            <div className="stat-label">清洗操作数</div>
          </div>
          <div className={`stat-card ${cleaningErrors.length > 0 ? 'error' : 'success'}`}>
            <div className="stat-value">{cleaningErrors.length}</div>
            <div className="stat-label">错误行数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{journalEntries.length.toLocaleString()}</div>
            <div className="stat-label">序时账分录</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{trialBalanceRows.length.toLocaleString()}</div>
            <div className="stat-label">余额表行数</div>
          </div>
        </div>
      </div>

      {/* 清洗规则统计 */}
      {Object.keys(ruleStats).length > 0 && (
        <div className="card">
          <div className="card-title">📈 清洗规则汇总</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>清洗规则</th>
                  <th>触发次数</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(ruleStats)
                  .sort((a, b) => b[1] - a[1])
                  .map(([rule, count]) => (
                    <tr key={rule}>
                      <td>{rule}</td>
                      <td style={{ fontWeight: 600, color: '#1e3a5f' }}>{count.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 错误明细 */}
      {cleaningErrors.length > 0 && (
        <div className="card">
          <div className="card-title">❌ 错误明细（{cleaningErrors.length} 行）</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>行号</th>
                  <th>错误信息</th>
                </tr>
              </thead>
              <tbody>
                {cleaningErrors.slice(0, 50).map((e, idx) => (
                  <tr key={idx} className="error">
                    <td>{e.row}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cleaningErrors.length > 50 && (
              <p style={{ fontSize: '11px', color: '#666', marginTop: '6px', textAlign: 'center' }}>
                仅显示前 50 条错误
              </p>
            )}
          </div>
        </div>
      )}

      {/* 清洗明细 */}
      {cleaningLog.length > 0 && (
        <div className="card">
          <div className="card-title">🔍 清洗操作明细（{cleaningLog.length.toLocaleString()} 条）</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>行号</th>
                  <th>字段名</th>
                  <th>清洗前值</th>
                  <th>清洗后值</th>
                  <th>清洗规则</th>
                </tr>
              </thead>
              <tbody>
                {displayLog.map((entry, idx) => (
                  <tr key={idx}>
                    <td>{entry.rowIndex}</td>
                    <td>{entry.fieldName}</td>
                    <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.originalValue === null || entry.originalValue === undefined
                        ? <span style={{ color: '#aaa' }}>空</span>
                        : String(entry.originalValue)}
                    </td>
                    <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#388e3c' }}>
                      {entry.cleanedValue === null || entry.cleanedValue === undefined
                        ? <span style={{ color: '#aaa' }}>空</span>
                        : String(entry.cleanedValue)}
                    </td>
                    <td style={{ fontSize: '11px', color: '#666' }}>{entry.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cleaningLog.length > PREVIEW_LIMIT && (
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? '▲ 收起' : `▼ 显示全部 ${cleaningLog.length.toLocaleString()} 条`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
