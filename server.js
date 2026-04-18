#!/usr/bin/env node
/**
 * LW 审计工具箱 - 本地离线服务器
 *
 * 用途：将 dist/ 目录作为静态站点托管在本地，供 Excel 插件离线加载。
 * 运行：node server.js
 * 依赖：仅使用 Node.js 内置模块，无需 npm install。
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3002;
const DIST = path.resolve(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

/**
 * Build an index of every file under `dir`, keyed by its URL path.
 * File system paths in the index are derived from trusted directory traversal
 * (not from user input), so requests are resolved via Map lookup only.
 */
function buildFileIndex(dir) {
  const index = new Map();
  function walk(fsDir, urlBase) {
    for (const entry of fs.readdirSync(fsDir, { withFileTypes: true })) {
      const fsPath = path.join(fsDir, entry.name);
      const urlKey = urlBase + '/' + entry.name;
      if (entry.isDirectory()) {
        walk(fsPath, urlKey);
      } else {
        index.set(urlKey, fsPath);
      }
    }
  }
  walk(dir, '');
  return index;
}

if (!fs.existsSync(DIST)) {
  console.error('错误：dist/ 目录不存在。请先解压发布包，确保 dist/ 和 server.js 在同一目录。');
  process.exit(1);
}

// Build the index once at startup; file paths come from the filesystem, not user input.
const FILE_INDEX = buildFileIndex(DIST);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = (req.url || '/').split('?')[0];
  const lookupKey = urlPath === '/' ? '/src/taskpane/index.html' : urlPath;

  // Resolve the file path exclusively from the pre-built index (no user data in fs calls).
  const filePath = FILE_INDEX.get(lookupKey);
  if (!filePath) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║        LW 审计工具箱  ·  本地离线版                ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');
  console.log('✓ 本地服务已启动：http://localhost:' + PORT);
  console.log('');
  console.log('Excel 加载步骤：');
  console.log('  1. 保持此窗口运行（勿关闭）');
  console.log('  2. 打开 Excel → 插入 → 加载项 → 上传我的加载项');
  console.log('  3. 选择解压目录中的 manifest-local.xml');
  console.log('  4. 点击"开始"选项卡 → "打开审计工具箱"');
  console.log('');
  console.log('按 Ctrl+C 可停止服务。');
});
