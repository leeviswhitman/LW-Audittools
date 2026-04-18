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

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/') urlPath = '/src/taskpane/index.html';

  // Sanitize: reject any path containing traversal sequences or non-printable chars
  if (/\.\./.test(urlPath) || /[^\x20-\x7E]/.test(urlPath)) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // Strip leading slashes and resolve the final path
  const filePath = path.resolve(DIST, urlPath.replace(/^\/+/, ''));

  // Containment check: ensure the resolved path stays inside DIST
  if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found: ' + urlPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
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
