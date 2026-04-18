/**
 * 项目概览页面
 */

import React from 'react';
import { useAuditStore } from '../../store/auditStore';

export const OverviewPage: React.FC = () => {
  const {
    clientName, periodKey, operator,
    journalEntries, trialBalanceRows, vouchers,
    reconciliationSummary, samplingResult,
    setProjectInfo, setCurrentPage,
  } = useAuditStore();

  return (
    <div className="page-body">
      <div className="disclaimer-bar">
        ⚠️ 本插件为审计辅助工具，所有自动分析结果仅供参考，需审计人员进行独立的职业判断与复核。
      </div>

      {/* 项目设置卡片 */}
      <div className="card">
        <div className="card-title">📁 项目信息</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <div className="form-group">
            <label className="form-label">客户名称</label>
            <input
              className="form-control"
              value={clientName}
              onChange={(e) => setProjectInfo({ clientName: e.target.value })}
              placeholder="输入客户名称"
            />
          </div>
          <div className="form-group">
            <label className="form-label">审计期间</label>
            <input
              className="form-control"
              value={periodKey}
              onChange={(e) => setProjectInfo({ periodKey: e.target.value })}
              placeholder="如：2023年度 / 2023-12"
            />
          </div>
          <div className="form-group">
            <label className="form-label">操作者</label>
            <input
              className="form-control"
              value={operator}
              onChange={(e) => setProjectInfo({ operator: e.target.value })}
              placeholder="输入姓名"
            />
          </div>
        </div>
      </div>

      {/* 数据统计 */}
      <div className="card">
        <div className="card-title">📊 数据概况</div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{journalEntries.length.toLocaleString()}</div>
            <div className="stat-label">序时账分录</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{trialBalanceRows.length}</div>
            <div className="stat-label">余额表科目</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{vouchers.length.toLocaleString()}</div>
            <div className="stat-label">凭证数</div>
          </div>
          <div
            className={`stat-card ${reconciliationSummary?.hasErrors ? 'error' : reconciliationSummary ? 'success' : ''}`}
          >
            <div className="stat-value">
              {reconciliationSummary ? reconciliationSummary.errorCount : '--'}
            </div>
            <div className="stat-label">勾稽错误</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {samplingResult ? samplingResult.sampleSize : '--'}
            </div>
            <div className="stat-label">抽样数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {journalEntries.filter((e) => e.anomalyFlags && e.anomalyFlags.length > 0).length}
            </div>
            <div className="stat-label">异常分录</div>
          </div>
        </div>
      </div>

      {/* 快速入口 */}
      <div className="card">
        <div className="card-title">🚀 快速操作</div>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={() => setCurrentPage('import')}>
            📥 导入数据
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentPage('journal')}
            disabled={journalEntries.length === 0}
          >
            📋 序时账分析
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentPage('sampling')}
            disabled={journalEntries.length === 0}
          >
            🎯 一键抽凭
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentPage('reconciliation')}
            disabled={journalEntries.length === 0 || trialBalanceRows.length === 0}
          >
            ✅ 勾稽校验
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentPage('workpaper')}
            disabled={journalEntries.length === 0}
          >
            📄 底稿输出
          </button>
        </div>
      </div>

      {/* 审计流程引导 */}
      <div className="card">
        <div className="card-title">📌 建议工作流程</div>
        <div style={{ fontSize: '11px', lineHeight: '2', color: '#444' }}>
          <div>① 导入数据（序时账 + 科目余额表）</div>
          <div>② 确认字段映射配置</div>
          <div>③ 执行数据清洗</div>
          <div>④ 序时账标准化分析</div>
          <div>⑤ 余额表与序时账勾稽校验</div>
          <div>⑥ 一键抽凭（选择抽样方法）</div>
          <div>⑦ 联查凭证（追溯证据链）</div>
          <div>⑧ 输出底稿（审计说明 + 结果表）</div>
        </div>
      </div>
    </div>
  );
};
