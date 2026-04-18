/**
 * 主 App 组件
 * 
 * 负责路由到各功能页面，管理加载状态遮罩。
 */

import React from 'react';
import { useAuditStore } from './store/auditStore';
import { Sidebar } from './components/Layout/Sidebar';
import { OverviewPage } from './components/Layout/OverviewPage';
import { DataImportPage } from './components/DataImport/DataImportPage';
import { SamplingPage } from './components/SampleSelection/SamplingPage';
import { ReconciliationPage } from './components/Reconciliation/ReconciliationPage';
import { WorkpaperPage } from './components/WorkpaperOutput/WorkpaperPage';
import { AuditLogPage } from './components/AuditLog/AuditLogPage';
import './styles/main.css';

/** 页面标题映射 */
const PAGE_TITLES: Record<string, string> = {
  overview: '项目概览',
  import: '数据导入',
  field_mapping: '字段映射',
  cleaning: '数据清洗',
  journal: '序时账分析',
  trial_balance: '科目余额表分析',
  voucher_link: '联查凭证',
  sampling: '一键抽凭',
  reconciliation: '勾稽校验',
  workpaper: '底稿输出',
  settings: '系统设置',
  audit_log: '审计日志',
};

const App: React.FC = () => {
  const { currentPage, isLoading, loadingMessage } = useAuditStore();

  const renderPage = () => {
    switch (currentPage) {
      case 'overview':
        return <OverviewPage />;
      case 'import':
        return <DataImportPage />;
      case 'sampling':
        return <SamplingPage />;
      case 'reconciliation':
        return <ReconciliationPage />;
      case 'workpaper':
        return <WorkpaperPage />;
      case 'audit_log':
        return <AuditLogPage />;
      // 其他页面占位（V2 实现）
      case 'field_mapping':
        return <PlaceholderPage title="字段映射" desc={'在"数据导入"扫描工作簿后，此处可手动调整字段映射配置，支持保存为模板。（V1.1 实现）'} />;
      case 'cleaning':
        return <PlaceholderPage title="数据清洗" desc="查看数据清洗日志，手动复核清洗结果，处理未识别项。（V1.1 实现）" />;
      case 'journal':
        return <PlaceholderPage title="序时账分析" desc="查看序时账发生额汇总、月度趋势、异常分录列表、按科目/日期/凭证号筛选。（V1.1 实现）" />;
      case 'trial_balance':
        return <PlaceholderPage title="科目余额表分析" desc="查看余额表标准化结果、科目层级树、余额方向异常、勾稽状态。（V1.1 实现）" />;
      case 'voucher_link':
        return <PlaceholderPage title="联查凭证" desc="从余额表科目下钻到序时账明细，从分录追溯同凭证全部分录，查看凭证平衡及附件索引。（V1.1 实现）" />;
      case 'settings':
        return <PlaceholderPage title="系统设置" desc="配置重要性水平、抽样规则、合计行关键词、默认字段映射模板等。（V1.1 实现）" />;
      default:
        return <OverviewPage />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h2>{PAGE_TITLES[currentPage] ?? currentPage}</h2>
          <span style={{ fontSize: '10px', color: '#888' }}>LW 审计工具箱 v1.0</span>
        </div>
        {renderPage()}
      </div>

      {/* 加载遮罩 */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <span>{loadingMessage || '处理中...'}</span>
        </div>
      )}
    </div>
  );
};

/** 功能占位页面（待实现功能） */
const PlaceholderPage: React.FC<{ title: string; desc: string }> = ({ title, desc }) => (
  <div className="page-body">
    <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
      <div style={{ fontSize: '28px', marginBottom: '12px' }}>🔧</div>
      <h3 style={{ fontSize: '14px', color: '#1e3a5f', marginBottom: '8px' }}>{title}</h3>
      <p style={{ fontSize: '12px', color: '#666', lineHeight: '1.8' }}>{desc}</p>
    </div>
  </div>
);

export default App;
