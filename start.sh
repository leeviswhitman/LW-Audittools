#!/bin/bash
echo ""
echo " LW 审计工具箱 — 本地离线版"
echo " ═══════════════════════════"
echo ""

if ! command -v node &> /dev/null; then
    echo " [错误] 未检测到 Node.js。"
    echo " 请先从 https://nodejs.org 下载并安装 Node.js（推荐 LTS 版本），"
    echo " 安装后重新运行此脚本。"
    echo ""
    exit 1
fi

echo " 正在启动本地服务，请稍候..."
echo ""
node "$(dirname "$0")/server.js"
