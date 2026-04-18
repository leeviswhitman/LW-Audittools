/**
 * 入口文件
 * 
 * 等待 Office.js 初始化完成后，挂载 React 应用。
 * 在非 Office 环境（如开发调试）下，直接启动 React 应用。
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

function renderApp() {
  const root = document.getElementById('root');
  if (!root) {
    console.error('[LW-Audit] 找不到 #root 元素');
    return;
  }
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Office.js 初始化
if (typeof Office !== 'undefined') {
  Office.onReady((info) => {
    console.log('[LW-Audit] Office.js 就绪，平台：', info.platform, '宿主：', info.host);
    renderApp();
  });
} else {
  // 非 Office 环境下直接渲染（开发调试用）
  console.warn('[LW-Audit] Office.js 未加载，以开发模式运行（部分 Excel 功能不可用）');
  renderApp();
}
