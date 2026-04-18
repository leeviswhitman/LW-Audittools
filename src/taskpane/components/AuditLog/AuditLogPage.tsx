/**
 * 审计日志页面
 */

import React, { useEffect } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { getAllLogs } from '../../../utils/logger';

export const AuditLogPage: React.FC = () => {
  const { auditLogs, setAuditLogs } = useAuditStore();

  useEffect(() => {
    setAuditLogs(getAllLogs());
  }, [setAuditLogs]);

  const actionLabel: Record<string, string> = {
    import_data: '导入数据',
    clean_data: '数据清洗',
    map_fields: '字段映射',
    standardize_journal: '标准化序时账',
    standardize_trial_balance: '标准化余额表',
    link_voucher: '联查凭证',
    sample_voucher: '抽凭',
    reconcile: '勾稽校验',
    export_sheet: '导出 Sheet',
    generate_workpaper: '生成底稿',
    apply_rule: '应用规则',
    user_review: '人工复核',
    system_error: '系统错误',
  };

  return (
    <div className="page-body">
      <div className="disclaimer-bar">
        📝 操作日志按时间顺序追加，不可删除，记录所有系统操作行为。
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>📝 审计操作日志（共 {auditLogs.length} 条）</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setAuditLogs(getAllLogs())}
          >
            🔄 刷新
          </button>
        </div>

        {auditLogs.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '20px' }}>
            暂无操作日志。执行数据导入、清洗、抽凭等操作后将自动记录。
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>时间</th>
                  <th>操作类型</th>
                  <th>模块</th>
                  <th>描述</th>
                  <th>影响记录数</th>
                  <th>结果</th>
                  <th>操作者</th>
                  <th>版本</th>
                </tr>
              </thead>
              <tbody>
                {[...auditLogs].reverse().map((log, idx) => (
                  <tr
                    key={log.id}
                    className={log.result === 'failure' ? 'error' : log.result === 'partial' ? 'anomaly' : ''}
                  >
                    <td>{auditLogs.length - idx}</td>
                    <td>{new Date(log.timestamp).toLocaleString('zh-CN')}</td>
                    <td>{actionLabel[log.action] ?? log.action}</td>
                    <td>{log.moduleName ?? ''}</td>
                    <td
                      title={log.description}
                      style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {log.description}
                    </td>
                    <td>{log.affectedCount != null ? log.affectedCount.toLocaleString() : ''}</td>
                    <td>
                      <span
                        className={`badge ${
                          log.result === 'success' ? 'badge-success' :
                          log.result === 'failure' ? 'badge-error' :
                          'badge-warning'
                        }`}
                      >
                        {log.result === 'success' ? '成功' : log.result === 'failure' ? '失败' : '部分'}
                      </span>
                    </td>
                    <td>{log.operator}</td>
                    <td>{log.version ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
