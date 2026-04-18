/**
 * 序时账分析页面
 *
 * 展示序时账的科目发生额汇总、月度趋势、异常分录列表，
 * 支持按科目编码筛选。
 */

import React, { useMemo, useState } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { summarizeByAccount, extractAnomalies } from '../../../modules/JournalProcessor';

type TabId = 'summary' | 'monthly' | 'anomaly';

export const JournalAnalysisPage: React.FC = () => {
  const { journalEntries, vouchers, setCurrentPage } = useAuditStore();

  const [tab, setTab] = useState<TabId>('summary');
  const [filterCode, setFilterCode] = useState('');
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

  const accountSummaries = useMemo(() => summarizeByAccount(journalEntries), [journalEntries]);
  const anomalies = useMemo(() => extractAnomalies(journalEntries), [journalEntries]);

  const totalDebit = useMemo(
    () => journalEntries.reduce((s, e) => s + e.debit, 0),
    [journalEntries]
  );
  const totalCredit = useMemo(
    () => journalEntries.reduce((s, e) => s + e.credit, 0),
    [journalEntries]
  );

  const filteredSummaries = filterCode
    ? accountSummaries.filter(
        (s) =>
          s.accountCode.includes(filterCode) ||
          (s.accountName ?? '').includes(filterCode)
      )
    : accountSummaries;

  if (journalEntries.length === 0) {
    return (
      <div className="page-body">
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div style={{ fontSize: '28px', marginBottom: '12px' }}>📋</div>
          <h3 style={{ fontSize: '14px', color: '#1e3a5f', marginBottom: '8px' }}>暂无序时账数据</h3>
          <p style={{ fontSize: '12px', color: '#666' }}>
            请先在「字段映射」页面完成序时账数据导入。
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
        ⚠️ 以下分析结果仅为辅助参考，所有异常分录需由审计人员独立复核，系统不提供审计结论。
      </div>

      {/* 概览统计 */}
      <div className="card">
        <div className="card-title">📊 序时账总览</div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{journalEntries.length.toLocaleString()}</div>
            <div className="stat-label">分录总数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{vouchers.length.toLocaleString()}</div>
            <div className="stat-label">凭证总数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{accountSummaries.length}</div>
            <div className="stat-label">涉及科目</div>
          </div>
          <div className={`stat-card ${anomalies.length > 0 ? 'warning' : 'success'}`}>
            <div className="stat-value">{anomalies.length}</div>
            <div className="stat-label">异常分录</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '20px', marginTop: '8px', fontSize: '11px', color: '#555' }}>
          <span>借方合计：<strong style={{ color: '#1e3a5f' }}>{totalDebit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
          <span>贷方合计：<strong style={{ color: '#1e3a5f' }}>{totalCredit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
          <span style={{ color: Math.abs(totalDebit - totalCredit) > 0.01 ? '#d32f2f' : '#388e3c' }}>
            {Math.abs(totalDebit - totalCredit) < 0.01 ? '✅ 借贷平衡' : `⚠️ 差额：${(totalDebit - totalCredit).toFixed(2)}`}
          </span>
        </div>
      </div>

      {/* 标签切换 */}
      <div className="card" style={{ padding: '0' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0' }}>
          {(['summary', 'monthly', 'anomaly'] as TabId[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '8px 4px',
                background: tab === t ? '#1e3a5f' : 'transparent',
                color: tab === t ? '#fff' : '#555',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: tab === t ? 600 : 400,
              }}
            >
              {t === 'summary' ? '科目汇总' : t === 'monthly' ? '月度趋势' : `异常分录（${anomalies.length}）`}
            </button>
          ))}
        </div>

        <div style={{ padding: '12px' }}>
          {/* 科目汇总 */}
          {tab === 'summary' && (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="按科目编码/名称筛选..."
                  value={filterCode}
                  onChange={(e) => setFilterCode(e.target.value)}
                  style={{ flex: 1, fontSize: '11px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
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
                      <th>借方合计</th>
                      <th>贷方合计</th>
                      <th>净发生额</th>
                      <th>凭证数</th>
                      <th>分录数</th>
                      <th>月度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSummaries.map((s) => (
                      <React.Fragment key={s.accountCode}>
                        <tr
                          style={{ cursor: s.monthlyBreakdown.length > 1 ? 'pointer' : undefined }}
                          onClick={() =>
                            s.monthlyBreakdown.length > 1 &&
                            setExpandedAccount(expandedAccount === s.accountCode ? null : s.accountCode)
                          }
                        >
                          <td style={{ fontWeight: 600 }}>{s.accountCode}</td>
                          <td>{s.accountName ?? ''}</td>
                          <td style={{ textAlign: 'right' }}>
                            {s.totalDebit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {s.totalCredit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'right', color: s.netMovement >= 0 ? '#388e3c' : '#d32f2f' }}>
                            {s.netMovement.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td>{s.voucherCount}</td>
                          <td>{s.entryCount}</td>
                          <td style={{ color: '#888', fontSize: '10px' }}>
                            {s.monthlyBreakdown.length > 1 ? `${expandedAccount === s.accountCode ? '▲' : '▼'} ${s.monthlyBreakdown.length}月` : '-'}
                          </td>
                        </tr>
                        {expandedAccount === s.accountCode &&
                          s.monthlyBreakdown.map((m) => (
                            <tr key={m.monthKey} style={{ background: '#f8f9fa', fontSize: '11px' }}>
                              <td style={{ paddingLeft: '20px', color: '#888' }}>↳ {m.monthKey}</td>
                              <td colSpan={1} />
                              <td style={{ textAlign: 'right' }}>
                                {m.totalDebit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {m.totalCredit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td colSpan={4} />
                            </tr>
                          ))}
                      </React.Fragment>
                    ))}
                    {filteredSummaries.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', color: '#888', fontSize: '11px' }}>无匹配结果</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* 月度趋势 */}
          {tab === 'monthly' && (() => {
            const monthMap = new Map<string, { debit: number; credit: number; count: number }>();
            for (const entry of journalEntries) {
              if (!entry.voucherDate) continue;
              const mk = entry.voucherDate.slice(0, 7);
              const existing = monthMap.get(mk);
              if (existing) {
                existing.debit += entry.debit;
                existing.credit += entry.credit;
                existing.count++;
              } else {
                monthMap.set(mk, { debit: entry.debit, credit: entry.credit, count: 1 });
              }
            }
            const months = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            return (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>月份</th>
                      <th>借方发生额</th>
                      <th>贷方发生额</th>
                      <th>净发生额</th>
                      <th>分录数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map(([mk, d]) => (
                      <tr key={mk}>
                        <td style={{ fontWeight: 600 }}>{mk}</td>
                        <td style={{ textAlign: 'right' }}>
                          {d.debit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {d.credit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', color: (d.debit - d.credit) >= 0 ? '#388e3c' : '#d32f2f' }}>
                          {(d.debit - d.credit).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td>{d.count.toLocaleString()}</td>
                      </tr>
                    ))}
                    {months.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: '#888' }}>无月度数据</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* 异常分录 */}
          {tab === 'anomaly' && (
            <>
              {anomalies.length === 0 ? (
                <p style={{ fontSize: '11px', color: '#388e3c', textAlign: 'center', padding: '16px 0' }}>
                  ✅ 未发现异常分录
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>凭证号</th>
                        <th>摘要</th>
                        <th>科目编码</th>
                        <th>借方</th>
                        <th>贷方</th>
                        <th>异常标注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {anomalies.slice(0, 200).map((e) => (
                        <tr key={e.id} className="anomaly">
                          <td>{e.voucherDate}</td>
                          <td>{e.voucherNo}</td>
                          <td style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.summary ?? ''}
                          </td>
                          <td>{e.accountCode}</td>
                          <td style={{ textAlign: 'right' }}>{e.debit > 0 ? e.debit.toLocaleString() : ''}</td>
                          <td style={{ textAlign: 'right' }}>{e.credit > 0 ? e.credit.toLocaleString() : ''}</td>
                          <td style={{ fontSize: '10px', color: '#d32f2f', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(e.anomalyFlags ?? []).join('；')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {anomalies.length > 200 && (
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '6px', textAlign: 'center' }}>
                      仅显示前 200 条，共 {anomalies.length} 条异常分录
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
