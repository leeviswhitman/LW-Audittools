/**
 * 联查凭证页面
 *
 * 支持从余额表科目下钻到序时账明细，
 * 从分录追溯同凭证全部分录，查看凭证借贷平衡及附件索引。
 */

import React, { useState } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { linkByAccount, linkByVoucherNo, linkByDocumentNo } from '../../../modules/VoucherLinker';
import type { VoucherLinkResult } from '../../../modules/VoucherLinker';

type SearchMode = 'account' | 'voucher' | 'document';

export const VoucherLinkPage: React.FC = () => {
  const { journalEntries, vouchers, trialBalanceRows, operator, setCurrentPage } = useAuditStore();

  const [mode, setMode] = useState<SearchMode>('account');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<VoucherLinkResult | null>(null);
  const [error, setError] = useState('');

  const hasData = journalEntries.length > 0;

  const handleSearch = () => {
    if (!query.trim()) {
      setError('请输入查询条件');
      return;
    }
    if (!hasData) {
      setError('请先导入序时账数据');
      return;
    }
    setError('');
    try {
      let res: VoucherLinkResult;
      if (mode === 'account') {
        res = linkByAccount(query.trim(), journalEntries, operator);
      } else if (mode === 'document') {
        res = linkByDocumentNo(query.trim(), journalEntries, operator);
      } else {
        // voucher: find a matching entry to use linkByVoucherNo
        const entry = journalEntries.find((e) => e.voucherNo === query.trim());
        if (!entry) {
          setError(`未找到凭证号"${query}"的分录`);
          return;
        }
        res = linkByVoucherNo(entry, journalEntries, vouchers, [], operator);
      }
      setResult(res);
    } catch (e) {
      setError(`联查失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (!hasData) {
    return (
      <div className="page-body">
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div style={{ fontSize: '28px', marginBottom: '12px' }}>🔍</div>
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
        ⚠️ 联查结果仅供审计参考，相似凭证及冲销检测需审计人员独立核实，不构成审计结论。
      </div>

      {/* 搜索区 */}
      <div className="card">
        <div className="card-title">🔍 联查凭证</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* 模式选择 */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['account', 'voucher', 'document'] as SearchMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setResult(null); setError(''); }}
                style={{
                  padding: '5px 10px',
                  fontSize: '11px',
                  background: mode === m ? '#1e3a5f' : '#f0f0f0',
                  color: mode === m ? '#fff' : '#555',
                  border: '1px solid ' + (mode === m ? '#1e3a5f' : '#ccc'),
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                {m === 'account' ? '📊 按科目' : m === 'voucher' ? '📄 按凭证号' : '📋 按单据号'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder={
                mode === 'account'
                  ? '输入科目编码，如：1001'
                  : mode === 'voucher'
                  ? '输入凭证号，如：0001'
                  : '输入单据号/发票号'
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1, fontSize: '12px', padding: '5px 8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <button className="btn btn-primary" onClick={handleSearch}>
              🔍 查询
            </button>
          </div>

          {/* 快速选择（科目模式下显示余额表科目列表） */}
          {mode === 'account' && trialBalanceRows.length > 0 && (
            <div style={{ fontSize: '11px', color: '#666' }}>
              常用科目：
              {trialBalanceRows.slice(0, 8).map((r) => (
                <button
                  key={r.accountCode}
                  onClick={() => { setQuery(r.accountCode); }}
                  style={{
                    marginLeft: '4px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    background: query === r.accountCode ? '#1e3a5f' : '#e8edf2',
                    color: query === r.accountCode ? '#fff' : '#1e3a5f',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  {r.accountCode}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div style={{ color: '#d32f2f', fontSize: '11px' }}>❌ {error}</div>
          )}
        </div>
      </div>

      {/* 查询结果 */}
      {result && (
        <>
          <div className="card">
            <div className="card-title">📊 查询结果概览</div>
            <div style={{ fontSize: '11px', color: '#555', marginBottom: '8px' }}>
              查询路径：<strong>{result.queryPath}</strong>
            </div>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-value">{result.relatedEntries.length.toLocaleString()}</div>
                <div className="stat-label">关联分录</div>
              </div>
              {result.voucher && (
                <div className={`stat-card ${result.isBalanced ? 'success' : 'error'}`}>
                  <div className="stat-value">{result.isBalanced ? '平衡' : '差异'}</div>
                  <div className="stat-label">凭证借贷</div>
                </div>
              )}
              <div className={`stat-card ${result.similarVouchers.length > 0 ? 'warning' : ''}`}>
                <div className="stat-value">{result.similarVouchers.length}</div>
                <div className="stat-label">相似凭证</div>
              </div>
              <div className={`stat-card ${result.reversalPairs.length > 0 ? 'warning' : ''}`}>
                <div className="stat-value">{result.reversalPairs.length}</div>
                <div className="stat-label">疑似冲销对</div>
              </div>
            </div>
            {result.voucher && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#555' }}>
                凭证 <strong>{result.voucher.voucherNo}</strong>（{result.voucher.voucherDate}）
                借方：{result.voucher.totalDebit.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                ／贷方：{result.voucher.totalCredit.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                {result.voucher.difference > 0 && (
                  <span style={{ color: '#d32f2f' }}>
                    ，差额：{result.voucher.difference.toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 关联分录明细 */}
          {result.relatedEntries.length > 0 && (
            <div className="card">
              <div className="card-title">📋 关联分录明细（{result.relatedEntries.length} 条）</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>凭证号</th>
                      <th>摘要</th>
                      <th>科目编码</th>
                      <th>科目名称</th>
                      <th>对方科目</th>
                      <th>借方</th>
                      <th>贷方</th>
                      <th>单据号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.relatedEntries.slice(0, 200).map((e) => (
                      <tr key={e.id}>
                        <td>{e.voucherDate}</td>
                        <td style={{ fontWeight: 600 }}>{e.voucherNo}</td>
                        <td style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.summary ?? ''}
                        </td>
                        <td>{e.accountCode}</td>
                        <td>{e.accountName ?? ''}</td>
                        <td>{e.counterAccountCode ?? ''}</td>
                        <td style={{ textAlign: 'right' }}>
                          {e.debit > 0 ? e.debit.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : ''}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {e.credit > 0 ? e.credit.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : ''}
                        </td>
                        <td>{e.documentNo ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.relatedEntries.length > 200 && (
                <p style={{ fontSize: '11px', color: '#666', marginTop: '6px', textAlign: 'center' }}>
                  仅显示前 200 条，共 {result.relatedEntries.length} 条
                </p>
              )}
            </div>
          )}

          {/* 相似凭证 */}
          {result.similarVouchers.length > 0 && (
            <div className="card">
              <div className="card-title">⚠️ 相似凭证（摘要+金额相同，需复核）</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>凭证号</th>
                      <th>日期</th>
                      <th>摘要</th>
                      <th>借方合计</th>
                      <th>贷方合计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.similarVouchers.map((v) => (
                      <tr key={v.id} className="anomaly">
                        <td style={{ fontWeight: 600 }}>{v.voucherNo}</td>
                        <td>{v.voucherDate}</td>
                        <td>{v.summary ?? ''}</td>
                        <td style={{ textAlign: 'right' }}>{v.totalDebit.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right' }}>{v.totalCredit.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 冲销对 */}
          {result.reversalPairs.length > 0 && (
            <div className="card">
              <div className="card-title">🔄 疑似相邻日期冲销对（需人工复核）</div>
              {result.reversalPairs.map(({ a, b }, idx) => (
                <div key={idx} style={{ fontSize: '11px', color: '#555', marginBottom: '6px', padding: '6px', background: '#fff8e1', borderRadius: '4px' }}>
                  <div>A：{a.voucherDate} 凭证 {a.voucherNo}，科目 {a.accountCode}，借方 {a.debit}／贷方 {a.credit}，摘要：{a.summary ?? '-'}</div>
                  <div>B：{b.voucherDate} 凭证 {b.voucherNo}，科目 {b.accountCode}，借方 {b.debit}／贷方 {b.credit}，摘要：{b.summary ?? '-'}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
