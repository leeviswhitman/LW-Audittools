/**
 * 侧边导航组件
 */

import React from 'react';
import { useAuditStore, type NavPage } from '../../store/auditStore';

interface NavItemDef {
  id: NavPage;
  icon: string;
  label: string;
  group: string;
}

const NAV_ITEMS: NavItemDef[] = [
  { id: 'overview', icon: '📊', label: '项目概览', group: '概览' },
  { id: 'import', icon: '📥', label: '数据导入', group: '数据' },
  { id: 'field_mapping', icon: '🔗', label: '字段映射', group: '数据' },
  { id: 'cleaning', icon: '🧹', label: '数据清洗', group: '数据' },
  { id: 'journal', icon: '📋', label: '序时账分析', group: '分析' },
  { id: 'trial_balance', icon: '⚖️', label: '科目余额表', group: '分析' },
  { id: 'voucher_link', icon: '🔍', label: '联查凭证', group: '分析' },
  { id: 'sampling', icon: '🎯', label: '一键抽凭', group: '审计' },
  { id: 'reconciliation', icon: '✅', label: '勾稽校验', group: '审计' },
  { id: 'workpaper', icon: '📄', label: '底稿输出', group: '输出' },
  { id: 'settings', icon: '⚙️', label: '系统设置', group: '系统' },
  { id: 'audit_log', icon: '📝', label: '审计日志', group: '系统' },
];

export const Sidebar: React.FC = () => {
  const { currentPage, setCurrentPage, clientName, periodKey } = useAuditStore();

  const groups = Array.from(new Set(NAV_ITEMS.map((i) => i.group)));

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>🔧 LW 审计工具</h1>
        <p>{clientName || '未设置项目'}</p>
        {periodKey && <p>{periodKey}</p>}
      </div>

      {groups.map((group) => (
        <div key={group} className="nav-group">
          <div className="nav-group-label">{group}</div>
          {NAV_ITEMS.filter((item) => item.group === group).map((item) => (
            <div
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => setCurrentPage(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
};
