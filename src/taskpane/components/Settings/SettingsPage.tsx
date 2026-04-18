/**
 * 系统设置页面
 *
 * 配置重要性水平、抽样规则、合计行关键词、风险关键词等。
 */

import React, { useState, useEffect } from 'react';
import { useAuditStore } from '../../store/auditStore';

export const SettingsPage: React.FC = () => {
  const { settings, setSettings } = useAuditStore();

  const [materialityInput, setMaterialityInput] = useState(String(settings.materialityThreshold));
  const [summaryKeywordsInput, setSummaryKeywordsInput] = useState(settings.summaryRowKeywords.join('、'));
  const [sensitiveKeywordsInput, setSensitiveKeywordsInput] = useState(settings.sensitiveKeywords.join('、'));
  const [randomSeedInput, setRandomSeedInput] = useState(settings.defaultRandomSeed !== null ? String(settings.defaultRandomSeed) : '');
  const [saved, setSaved] = useState(false);

  // Sync when settings change externally
  useEffect(() => {
    setMaterialityInput(String(settings.materialityThreshold));
    setSummaryKeywordsInput(settings.summaryRowKeywords.join('、'));
    setSensitiveKeywordsInput(settings.sensitiveKeywords.join('、'));
    setRandomSeedInput(settings.defaultRandomSeed !== null ? String(settings.defaultRandomSeed) : '');
  }, [settings]);

  const handleSave = () => {
    const materiality = Number(materialityInput);
    if (isNaN(materiality) || materiality < 0) return;

    const summaryKeywords = summaryKeywordsInput
      .split(/[,，、;\s]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    const sensitiveKeywords = sensitiveKeywordsInput
      .split(/[,，、;\s]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    const seed = randomSeedInput.trim() === '' ? null : Number(randomSeedInput);

    setSettings({
      materialityThreshold: materiality,
      summaryRowKeywords: summaryKeywords,
      sensitiveKeywords,
      defaultRandomSeed: seed !== null && !isNaN(seed) ? seed : null,
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings({
      materialityThreshold: 500000,
      summaryRowKeywords: ['合计', '小计', '总计', '期末合计', '期初合计', '年合计', 'total', 'subtotal'],
      sensitiveKeywords: ['返点', '折扣', '佣金', '回扣', '关联', '股东', '补贴', '奖励'],
      defaultRandomSeed: null,
    });
  };

  return (
    <div className="page-body">
      <div className="disclaimer-bar">
        ⚠️ 系统设置影响抽凭、清洗等模块的行为，修改后将在下次执行对应操作时生效。
      </div>

      {/* 重要性水平 */}
      <div className="card">
        <div className="card-title">💰 重要性水平</div>
        <p style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
          用于"重大项目全选"抽样方法的阈值。金额（绝对值）超过此数值的分录将全部纳入抽样。
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="number"
            value={materialityInput}
            onChange={(e) => { setMaterialityInput(e.target.value); setSaved(false); }}
            min="0"
            step="10000"
            style={{ width: '140px', fontSize: '12px', padding: '5px 8px', border: '1px solid #ccc', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '11px', color: '#666' }}>元</span>
          <span style={{ fontSize: '11px', color: '#888' }}>
            当前：{settings.materialityThreshold.toLocaleString()} 元
          </span>
        </div>
      </div>

      {/* 合计行关键词 */}
      <div className="card">
        <div className="card-title">🧹 合计行关键词</div>
        <p style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
          数据清洗时，摘要或科目名称中包含以下关键词的行将被识别为合计行并跳过。
          多个关键词用顿号（、）或逗号分隔。
        </p>
        <textarea
          value={summaryKeywordsInput}
          onChange={(e) => { setSummaryKeywordsInput(e.target.value); setSaved(false); }}
          rows={3}
          style={{ width: '100%', fontSize: '11px', padding: '5px 8px', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }}
        />
        <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>
          已配置 {summaryKeywordsInput.split(/[,，、;\s]+/).filter(Boolean).length} 个关键词
        </div>
      </div>

      {/* 风险关键词 */}
      <div className="card">
        <div className="card-title">⚠️ 风险摘要关键词</div>
        <p style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
          "风险导向抽样"时，分录摘要中包含以下关键词的将被标记为风险分录并优先抽取。
          多个关键词用顿号（、）或逗号分隔。
        </p>
        <textarea
          value={sensitiveKeywordsInput}
          onChange={(e) => { setSensitiveKeywordsInput(e.target.value); setSaved(false); }}
          rows={3}
          style={{ width: '100%', fontSize: '11px', padding: '5px 8px', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }}
        />
        <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>
          已配置 {sensitiveKeywordsInput.split(/[,，、;\s]+/).filter(Boolean).length} 个关键词
        </div>
      </div>

      {/* 随机种子 */}
      <div className="card">
        <div className="card-title">🎲 默认随机种子</div>
        <p style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
          固定随机种子可使随机抽样结果可重现。留空表示每次随机，填入整数则固定种子。
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="number"
            value={randomSeedInput}
            onChange={(e) => { setRandomSeedInput(e.target.value); setSaved(false); }}
            placeholder="留空 = 每次随机"
            style={{ width: '140px', fontSize: '12px', padding: '5px 8px', border: '1px solid #ccc', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '11px', color: '#888' }}>
            当前：{settings.defaultRandomSeed !== null ? settings.defaultRandomSeed : '不固定'}
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="card">
        <div className="btn-group">
          <button className="btn btn-primary" onClick={handleSave}>
            💾 保存设置
          </button>
          <button className="btn btn-secondary" onClick={handleReset}>
            🔄 恢复默认值
          </button>
          {saved && (
            <span style={{ fontSize: '11px', color: '#388e3c' }}>✅ 已保存</span>
          )}
        </div>
      </div>
    </div>
  );
};
