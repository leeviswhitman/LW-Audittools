@echo off
chcp 65001 >nul 2>&1
echo.
echo  LW 审计工具箱 — 本地离线版
echo  ═══════════════════════════
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [错误] 未检测到 Node.js。
    echo  请先从 https://nodejs.org 下载并安装 Node.js（推荐 LTS 版本），
    echo  安装后重新运行此脚本。
    echo.
    pause
    exit /b 1
)

echo  正在启动本地服务，请稍候...
echo.
node "%~dp0server.js"
pause
