/**
 * 字段映射配置页面
 *
 * 展示扫描到的工作表，允许用户确认/调整字段映射，然后执行数据导入。
 */

import React, { useState, useCallback } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { ExcelAdapter } from '../../../excel/ExcelAdapter';
import { detectHeaderRow } from '../../../excel/SheetScanner';
import { autoDetectMappings, getMissingRequiredFields, FIELD_DATA_TYPES } from '../../../utils/fieldMapper';
import { cleanSheetData } from '../../../modules/DataCleaner';
import { parseJournalEntries, aggregateVouchers } from '../../../modules/JournalProcessor';
import { parseTrialBalance } from '../../../modules/TrialBalanceProcessor';
import type { MappingConfig, FieldMapping } from '../../../models';
import { v4 as uuidv4 } from 'uuid';

const STANDARD_FIELD_LABELS: Record<string, string> = {
  voucherDate: '凭证日期',
  voucherType: '凭证字号',
  voucherNo: '凭证编号',
  entrySeq: '行号',
  summary: '摘要',
  accountCode: '科目编码',
  accountName: '科目名称',
  auxiliaryInfo: '辅助核算',
  debit: '借方金额',
  credit: '贷方金额',
  balance: '余额',
  counterAccountCode: '对方科目编码',
  counterAccountName: '对方科目名称',
  documentNo: '单据号',
  operator: '业务员',
  department: '部门',
  partyName: '往来单位',
  parentCode: '上级科目编码',
  level: '科目级次',
  beginDebit: '期初借方',
  beginCredit: '期初贷方',
  currentDebit: '本期借方',
  currentCredit: '本期贷方',
  endDebit: '期末借方',
  endCredit: '期末贷方',
};

export const FieldMappingPage: React.FC = () => {
  const {
    scanResults, operator, periodKey,
    setLoading, isLoading,
    setJournalEntries, setTrialBalanceRows, setVouchers,
    setJournalMappingConfig, setTrialBalanceMappingConfig,
    setCleaningLog, addAuditLog,
    setCurrentPage,
  } = useAuditStore();

  const [selectedSheetName, setSelectedSheetName] = useState('');
  const [selectedDataType, setSelectedDataType] = useState<'journal' | 'trial_balance'>('journal');
  const [mappings, setMappings] = useState<FieldMapping[] | null>(null);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [error, setError] = useState('');
  const [importDone, setImportDone] = useState(false);

  /** 加载选定工作表的表头，生成字段映射建议 */
  const handleLoadMappings = useCallback(async () => {
    if (!selectedSheetName) return;
    setError('');
    setLoadingMappings(true);
    try {
      const data = await ExcelAdapter.readSheetData(selectedSheetName, 1, 1, 15);
      const { headerRowIndex } = detectHeaderRow(data);
      const headerRow = data[headerRowIndex] ?? [];
      const headers = headerRow
        .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
        .filter(Boolean);

      const detected = autoDetectMappings(headers, selectedDataType);
      setMappings(detected);
    } catch (e) {
      setError(`读取表头失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingMappings(false);
    }
  }, [selectedSheetName, selectedDataType]);

  /** 更新某行映射的 targetField */
  const handleTargetChange = (index: number, newTarget: string) => {
    if (!mappings) return;
    const updated = mappings.map((m, i) =>
      i === index
        ? {
            ...m,
            targetField: newTarget,
            dataType: (FIELD_DATA_TYPES[newTarget] ?? 'string') as FieldMapping['dataType'],
            confirmed: true,
          }
        : m
    );
    setMappings(updated);
  };

  /** 执行数据导入 */
  const handleImport = async () => {
    if (!mappings || !selectedSheetName) return;

    const missing = getMissingRequiredFields(mappings, selectedDataType);
    if (missing.length > 0) {
      setError(`缺少必填字段映射：${missing.map((f) => STANDARD_FIELD_LABELS[f] ?? f).join('、')}`);
      return;
    }

    setError('');
    setLoading(true, '正在导入数据...');
    try {
      const config: MappingConfig = {
        id: uuidv4(),
        name: `${selectedSheetName} - ${selectedDataType === 'journal' ? '序时账' : '科目余额表'}`,
        dataType: selectedDataType,
        mappings,
        sourceSheet: selectedSheetName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const sheetInfo = scanResults.find((r) => r.sheetInfo.name === selectedSheetName)?.sheetInfo;
      const totalRows = sheetInfo?.rowCount ?? 5000;
      const rawData = await ExcelAdapter.readSheetData(selectedSheetName, 1, 1, totalRows);

      const cleanResult = cleanSheetData(rawData, config, {
        operator,
        fillDownFields: selectedDataType === 'journal'
          ? ['voucherDate', 'voucherNo', 'voucherType']
          : [],
      });

      setCleaningLog(cleanResult.cleaningLog, cleanResult.errors);

      if (selectedDataType === 'journal') {
        const parseResult = parseJournalEntries(cleanResult.data, selectedSheetName, operator);
        const vouchers = aggregateVouchers(parseResult.data);
        setJournalEntries(parseResult.data);
        setVouchers(vouchers);
        setJournalMappingConfig(config);
        addAuditLog({
          id: uuidv4(),
          action: 'import_data',
          description: `导入序时账：${parseResult.data.length} 条分录，来自 Sheet「${selectedSheetName}」`,
          timestamp: new Date().toISOString(),
          operator,
          moduleName: 'FieldMappingPage',
          affectedCount: parseResult.data.length,
          result: parseResult.errors.length === 0 ? 'success' : 'partial',
        });
      } else {
        const parseResult = parseTrialBalance(
          cleanResult.data, selectedSheetName, periodKey, operator
        );
        setTrialBalanceRows(parseResult.data);
        setTrialBalanceMappingConfig(config);
        addAuditLog({
          id: uuidv4(),
          action: 'import_data',
          description: `导入科目余额表：${parseResult.data.length} 行科目，来自 Sheet「${selectedSheetName}」`,
          timestamp: new Date().toISOString(),
          operator,
          moduleName: 'FieldMappingPage',
          affectedCount: parseResult.data.length,
          result: parseResult.errors.length === 0 ? 'success' : 'partial',
        });
      }

      setImportDone(true);
    } catch (e) {
      setError(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-body">
      <div className="disclaimer-bar">
        ⚠️ 字段映射确认后将执行完整数据导入（清洗 → 解析 → 存储），请确认映射正确后再点击导入。
      </div>

      <div className="card">
        <div className="card-title">🔗 选择工作表</div>
        {scanResults.length === 0 ? (
          <p style={{ fontSize: '11px', color: '#888' }}>
            请先在「数据导入」页面扫描工作簿。
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', color: '#555' }}>
              共扫描到 {scanResults.length} 个工作表。
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                style={{ flex: 1, minWidth: '120px', fontSize: '12px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px' }}
                value={selectedSheetName}
                onChange={(e) => {
                  setSelectedSheetName(e.target.value);
                  setMappings(null);
                  setImportDone(false);
                  const r = scanResults.find((s) => s.sheetInfo.name === e.target.value);
                  if (r?.guessedType === 'trial_balance') setSelectedDataType('trial_balance');
                  else setSelectedDataType('journal');
                }}
              >
                <option value="">-- 请选择工作表 --</option>
                {scanResults.map((r) => (
                  <option key={r.sheetInfo.name} value={r.sheetInfo.name}>
                    {r.sheetInfo.name}（{r.guessedType === 'journal' ? '序时账' : r.guessedType === 'trial_balance' ? '余额表' : '未识别'}，{r.sheetInfo.rowCount.toLocaleString()} 行）
                  </option>
                ))}
              </select>
              <select
                style={{ fontSize: '12px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px' }}
                value={selectedDataType}
                onChange={(e) => {
                  setSelectedDataType(e.target.value as 'journal' | 'trial_balance');
                  setMappings(null);
                }}
              >
                <option value="journal">序时账/明细账</option>
                <option value="trial_balance">科目余额表</option>
              </select>
              <button
                className="btn btn-primary"
                onClick={handleLoadMappings}
                disabled={!selectedSheetName || loadingMappings || isLoading}
              >
                {loadingMappings ? '⏳ 读取中...' : '🔍 读取字段映射'}
              </button>
            </div>
          </div>
        )}
        {error && (
          <div style={{ color: '#d32f2f', fontSize: '11px', marginTop: '6px' }}>❌ {error}</div>
        )}
      </div>

      {mappings && (
        <div className="card">
          <div className="card-title">📋 字段映射配置（{mappings.length} 列）</div>
          <p style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
            请检查每列的映射是否正确。若未能自动识别，请从下拉列表手动选择标准字段名。
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>原始列名</th>
                  <th>映射到标准字段</th>
                  <th>数据类型</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m, idx) => (
                  <tr key={`${m.sourceColumn}-${idx}`}>
                    <td style={{ fontWeight: 600 }}>{m.sourceColumn}</td>
                    <td>
                      <select
                        style={{ width: '100%', fontSize: '11px', padding: '2px 4px', border: '1px solid #ccc', borderRadius: '3px' }}
                        value={m.targetField}
                        onChange={(e) => handleTargetChange(idx, e.target.value)}
                      >
                        {Object.entries(STANDARD_FIELD_LABELS).map(([field, label]) => (
                          <option key={field} value={field}>{label}（{field}）</option>
                        ))}
                        <option value={m.sourceColumn}>忽略此列（{m.sourceColumn}）</option>
                      </select>
                    </td>
                    <td style={{ fontSize: '11px' }}>{m.dataType}</td>
                    <td>
                      <span className={`badge ${m.confirmed ? 'badge-success' : 'badge-warning'}`}>
                        {m.confirmed ? '已识别' : '未识别'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="btn-group" style={{ marginTop: '12px' }}>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={isLoading}
            >
              {isLoading ? '⏳ 导入中...' : '📥 执行数据导入'}
            </button>
            {importDone && (
              <>
                <span style={{ fontSize: '11px', color: '#388e3c' }}>✅ 导入完成</span>
                <button
                  className="btn btn-secondary"
                  onClick={() => setCurrentPage('cleaning')}
                >
                  → 查看清洗日志
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
