/**
 * 一键抽凭页面
 *
 * 提供完整的审计抽样界面，支持多种抽样方法。
 */

import React, { useState } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { sampleVouchers, type SamplingParams } from '../../../modules/SampleEngine';
import { ExcelAdapter } from '../../../excel/ExcelAdapter';
import { formatSampleListOutput, recordWorkpaperOutput } from '../../../modules/WorkpaperGenerator';

export const SamplingPage: React.FC = () => {
  const {
    journalEntries, operator,
    addSamplingResult, samplingResult, setLoading, isLoading,
  } = useAuditStore();

  const [method, setMethod] = useState<SamplingParams['method']>('risk_oriented');
  const [materialityThreshold, setMaterialityThreshold] = useState('500000');
  const [topN, setTopN] = useState('20');
  const [randomCount, setRandomCount] = useState('30');
  const [randomSeed, setRandomSeed] = useState('');
  const [interval, setInterval] = useState('10');
  const [error, setError] = useState('');
  const [exportDone, setExportDone] = useState(false);

  const handleSample = () => {
    if (journalEntries.length === 0) {
      setError('请先导入并处理序时账数据');
      return;
    }

    setError('');
    setLoading(true, '正在执行抽样...');
    try {
      const params: SamplingParams = {
        method,
        operator,
        materialityThreshold: Number(materialityThreshold) || 500000,
        topN: Number(topN) || 20,
        randomCount: Number(randomCount) || 30,
        randomSeed: randomSeed ? Number(randomSeed) : undefined,
        interval: Number(interval) || 10,
        includePeriodEnd: true,
        includeWeekend: true,
        includeSensitiveKeywords: true,
        includeManualVouchers: true,
        includeReversals: true,
      };

      const result = sampleVouchers(journalEntries, params);
      addSamplingResult(result);
    } catch (e) {
      setError(`抽样失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!samplingResult) return;
    setLoading(true, '正在导出抽凭清单...');
    try {
      const output = formatSampleListOutput(samplingResult);
      const sheetName = await ExcelAdapter.writeNewSheet(
        `抽凭样本清单_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}`,
        output.headers,
        output.rows,
        true
      );
      recordWorkpaperOutput('sample_list', sheetName, samplingResult.sampleSize, operator);
      setExportDone(true);
    } catch (e) {
      setError(`导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const methodOptions = [
    { value: 'significant_item', label: '重大项目全选（金额超过重要性水平）' },
    { value: 'top_n', label: 'Top N 金额抽样（取最大 N 笔）' },
    { value: 'random', label: '随机抽样' },
    { value: 'stratified_random', label: '分层随机抽样' },
    { value: 'systematic', label: '固定间隔抽样' },
    { value: 'risk_oriented', label: '风险导向抽样（期末、敏感摘要、非工作日等）' },
  ];

  return (
    <div className="page-body">
      <div className="disclaimer-bar">
        ⚠️ 抽样结果仅为审计程序辅助，抽样范围与判断需由注册会计师根据审计目标确定。
        所有样本需人工复核后方可作为审计证据。
      </div>

      {/* 抽样参数设置 */}
      <div className="card">
        <div className="card-title">⚙️ 抽样参数</div>

        <div className="form-group">
          <label className="form-label">抽样方法</label>
          <select
            className="form-control"
            value={method}
            onChange={(e) => setMethod(e.target.value as SamplingParams['method'])}
          >
            {methodOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {(method === 'significant_item') && (
          <div className="form-group">
            <label className="form-label">重要性水平（元）</label>
            <input
              className="form-control"
              type="number"
              value={materialityThreshold}
              onChange={(e) => setMaterialityThreshold(e.target.value)}
              placeholder="如：500000"
            />
          </div>
        )}

        {method === 'top_n' && (
          <div className="form-group">
            <label className="form-label">抽取前 N 条</label>
            <input
              className="form-control"
              type="number"
              value={topN}
              onChange={(e) => setTopN(e.target.value)}
              min="1"
            />
          </div>
        )}

        {method === 'random' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label className="form-label">抽样数量</label>
              <input
                className="form-control"
                type="number"
                value={randomCount}
                onChange={(e) => setRandomCount(e.target.value)}
                min="1"
              />
            </div>
            <div className="form-group">
              <label className="form-label">随机种子（可留空）</label>
              <input
                className="form-control"
                type="number"
                value={randomSeed}
                onChange={(e) => setRandomSeed(e.target.value)}
                placeholder="留空=当前时间"
              />
            </div>
          </div>
        )}

        {method === 'systematic' && (
          <div className="form-group">
            <label className="form-label">抽样间隔</label>
            <input
              className="form-control"
              type="number"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              min="1"
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleSample}
            disabled={isLoading || journalEntries.length === 0}
          >
            🎯 执行抽样
          </button>
          <span style={{ fontSize: '11px', color: '#666' }}>
            总体：{journalEntries.length.toLocaleString()} 条分录
          </span>
        </div>

        {error && <div style={{ color: '#d32f2f', fontSize: '11px', marginTop: '6px' }}>❌ {error}</div>}
      </div>

      {/* 抽样结果 */}
      {samplingResult && (
        <>
          <div className="card">
            <div className="card-title">📊 抽样统计</div>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-value">{samplingResult.populationSize.toLocaleString()}</div>
                <div className="stat-label">总体规模</div>
              </div>
              <div className="stat-card">
                <div className="stat-value success">{samplingResult.sampleSize}</div>
                <div className="stat-label">样本量</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{samplingResult.nonSampledCount.toLocaleString()}</div>
                <div className="stat-label">未抽中</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {((samplingResult.sampleSize / samplingResult.populationSize) * 100).toFixed(1)}%
                </div>
                <div className="stat-label">抽样比例</div>
              </div>
            </div>

            <div className="btn-group" style={{ marginTop: '8px' }}>
              <button
                className="btn btn-primary"
                onClick={handleExport}
                disabled={isLoading}
              >
                📤 导出《抽凭样本清单》到新 Sheet
              </button>
              {exportDone && (
                <span style={{ fontSize: '11px', color: '#388e3c' }}>✅ 已导出</span>
              )}
            </div>
          </div>

          {/* 样本预览 */}
          <div className="card">
            <div className="card-title">
              📋 样本预览（前 50 条）
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>样本号</th>
                    <th>凭证号</th>
                    <th>日期</th>
                    <th>摘要</th>
                    <th>科目</th>
                    <th>借方</th>
                    <th>贷方</th>
                    <th>抽样原因</th>
                    <th>复核状态</th>
                    <th>需人工复核</th>
                  </tr>
                </thead>
                <tbody>
                  {samplingResult.samples.slice(0, 50).map((s) => (
                    <tr key={s.sampleNo}>
                      <td>{s.sampleNo}</td>
                      <td>{s.sourceVoucherNo}</td>
                      <td>{s.voucherDate}</td>
                      <td title={s.summary}>{(s.summary ?? '').substring(0, 20)}</td>
                      <td>{s.accountCode ?? ''}</td>
                      <td>{s.debit ? s.debit.toLocaleString() : ''}</td>
                      <td>{s.credit ? s.credit.toLocaleString() : ''}</td>
                      <td title={s.samplingReason} style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.samplingReason.substring(0, 30)}
                      </td>
                      <td>
                        <span className="badge badge-warning">待复核</span>
                      </td>
                      <td>
                        <span className="badge badge-error">是</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {samplingResult.samples.length > 50 && (
                <p style={{ fontSize: '11px', color: '#666', marginTop: '6px', textAlign: 'center' }}>
                  仅显示前 50 条，请导出到 Sheet 查看全部 {samplingResult.samples.length} 条。
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {journalEntries.length === 0 && (
        <div className="card">
          <p style={{ fontSize: '12px', color: '#666', textAlign: 'center', padding: '20px' }}>
            请先在"数据导入"页面导入并处理序时账数据，再执行抽凭程序。
          </p>
        </div>
      )}
    </div>
  );
};
