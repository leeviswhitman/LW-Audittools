/**
 * 数据导入页面
 *
 * 扫描当前工作簿所有 Sheet，识别数据类型，供用户选择导入目标。
 */

import React, { useState } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { ExcelAdapter } from '../../../excel/ExcelAdapter';
import { guessSheetType, detectHeaderRow } from '../../../excel/SheetScanner';
import type { SheetScanResult } from '../../../excel/SheetScanner';

export const DataImportPage: React.FC = () => {
  const {
    setLoading, setSheetList, setScanResults, setCurrentPage,
    scanResults, isLoading,
  } = useAuditStore();

  const [scanDone, setScanDone] = useState(false);
  const [error, setError] = useState<string>('');

  /** 扫描工作簿所有 Sheet */
  const handleScan = async () => {
    setError('');
    setLoading(true, '正在扫描工作簿...');
    try {
      const sheets = await ExcelAdapter.getSheetList();
      setSheetList(sheets);

      const results: SheetScanResult[] = [];
      for (const sheet of sheets) {
        if (sheet.rowCount === 0) {
          results.push({
            sheetInfo: sheet,
            guessedType: 'unknown',
            confidence: 'low',
            detectedHeaders: [],
            mappedFields: [],
            reason: '空工作表',
          });
          continue;
        }

        // 读取表头区域
        const data = await ExcelAdapter.readSheetData(sheet.name, 1, 1, Math.min(15, sheet.rowCount));
        const { headerRowIndex } = detectHeaderRow(data);
        const headerRow = data[headerRowIndex] ?? [];
        const headers = headerRow.map((v) => (v === null || v === undefined ? '' : String(v).trim())).filter(Boolean);

        const guess = guessSheetType(headers);
        results.push({
          sheetInfo: sheet,
          guessedType: guess.type,
          confidence: guess.confidence,
          detectedHeaders: headers,
          mappedFields: guess.mappedFields,
          reason: guess.reason,
        });
      }

      setScanResults(results);
      setScanDone(true);
    } catch (e) {
      setError(`扫描失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const typeLabel: Record<string, string> = {
    journal: '序时账/明细账',
    trial_balance: '科目余额表',
    voucher_detail: '凭证明细',
    attachment_index: '附件索引',
    subsidiary: '辅助明细',
    unknown: '未识别',
  };

  const confidenceColor = (c: string) => {
    if (c === 'high') return '#388e3c';
    if (c === 'medium') return '#f57c00';
    return '#888';
  };

  return (
    <div className="page-body">
      <div className="disclaimer-bar">
        ⚠️ 请确保您已打开包含审计数据的 Excel 工作簿，然后点击"扫描工作簿"开始识别。
      </div>

      <div className="card">
        <div className="card-title">📥 工作簿扫描</div>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={handleScan} disabled={isLoading}>
            {isLoading ? '⏳ 扫描中...' : '🔍 扫描工作簿'}
          </button>
          {scanDone && (
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentPage('field_mapping')}
            >
              → 配置字段映射
            </button>
          )}
        </div>

        {error && (
          <div style={{ color: '#d32f2f', fontSize: '12px', marginTop: '8px' }}>
            ❌ {error}
          </div>
        )}
      </div>

      {scanResults.length > 0 && (
        <div className="card">
          <div className="card-title">📋 工作表识别结果（共 {scanResults.length} 个工作表）</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>工作表名</th>
                  <th>行数</th>
                  <th>列数</th>
                  <th>识别类型</th>
                  <th>置信度</th>
                  <th>识别原因</th>
                  <th>检测到的字段</th>
                </tr>
              </thead>
              <tbody>
                {scanResults.map((r) => (
                  <tr key={r.sheetInfo.name} className={r.guessedType === 'unknown' ? '' : ''}>
                    <td style={{ fontWeight: 600 }}>{r.sheetInfo.name}</td>
                    <td>{r.sheetInfo.rowCount.toLocaleString()}</td>
                    <td>{r.sheetInfo.columnCount}</td>
                    <td>
                      <span className={`badge ${
                        r.guessedType === 'journal' ? 'badge-info' :
                        r.guessedType === 'trial_balance' ? 'badge-success' :
                        'badge-warning'
                      }`}>
                        {typeLabel[r.guessedType] ?? r.guessedType}
                      </span>
                    </td>
                    <td style={{ color: confidenceColor(r.confidence) }}>
                      {r.confidence === 'high' ? '高' : r.confidence === 'medium' ? '中' : '低'}
                    </td>
                    <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.reason}
                    </td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.mappedFields.slice(0, 6).join('、')}
                      {r.mappedFields.length > 6 ? `...等${r.mappedFields.length}个` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scanDone && scanResults.filter(r => r.guessedType === 'unknown').length > 0 && (
        <div className="card">
          <div className="card-title">⚠️ 未识别工作表</div>
          <p style={{ fontSize: '11px', color: '#666' }}>
            以下工作表未能自动识别数据类型，请在"字段映射"页面手动配置，
            或确认这些工作表不包含审计相关数据。
          </p>
          <ul style={{ fontSize: '11px', marginTop: '6px', paddingLeft: '16px' }}>
            {scanResults
              .filter((r) => r.guessedType === 'unknown')
              .map((r) => (
                <li key={r.sheetInfo.name}>{r.sheetInfo.name}</li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
};
