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
import { FieldMappingPage } from './components/FieldMapping/FieldMappingPage';
import { CleaningPage } from './components/Cleaning/CleaningPage';
import { JournalAnalysisPage } from './components/JournalAnalysis/JournalAnalysisPage';
import { TrialBalancePage } from './components/TrialBalance/TrialBalancePage';
import { VoucherLinkPage } from './components/VoucherLink/VoucherLinkPage';
import { SettingsPage } from './components/Settings/SettingsPage';
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
      case 'field_mapping':
        return <FieldMappingPage />;
      case 'cleaning':
        return <CleaningPage />;
      case 'journal':
        return <JournalAnalysisPage />;
      case 'trial_balance':
        return <TrialBalancePage />;
      case 'voucher_link':
        return <VoucherLinkPage />;
      case 'settings':
        return <SettingsPage />;
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
          <span style={{ fontSize: '10px', color: '#888' }}>LW 审计工具箱 v1.1</span>
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

export default App;
