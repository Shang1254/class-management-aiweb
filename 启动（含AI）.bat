@echo off
rem ============================================================
rem  班级管理系统 · 一键启动（含本机大模型）
rem ------------------------------------------------------------
rem  1) 依次找 Ollama：项目内便携版 → PATH → 默认安装路径
rem     （把 ollama.exe 与模型放进项目，整包即可拷给别人自带 AI）
rem  2) 启动本机模型服务（已在运行则跳过），并设置跨域与模型目录
rem  3) 用默认浏览器打开系统首页（打开后无需任何 AI 配置）
rem
rem  用法： 双击本文件                 正常启动
rem         启动（含AI）.bat check      只检查并打印诊断（不启动任何东西）
rem ============================================================
setlocal enabledelayedexpansion
chcp 936 >nul
cd /d "%~dp0"
set "CHECK="
if /i "%~1"=="check" set "CHECK=1"

echo.
echo ===== 班级管理系统 · 启动检查 =====
echo 项目目录：%CD%

set "OLLAMA_EXE="
if exist "%CD%\工具\ollama\ollama.exe" set "OLLAMA_EXE=%CD%\工具\ollama\ollama.exe"
if not defined OLLAMA_EXE for /f "delims=" %%I in ('where ollama 2^>nul') do if not defined OLLAMA_EXE set "OLLAMA_EXE=%%I"
if not defined OLLAMA_EXE if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not defined OLLAMA_EXE if exist "%ProgramFiles%\Ollama\ollama.exe" set "OLLAMA_EXE=%ProgramFiles%\Ollama\ollama.exe"
if defined OLLAMA_EXE echo [1/3] Ollama 可执行文件：!OLLAMA_EXE!
if not defined OLLAMA_EXE echo [1/3] Ollama 可执行文件：未找到（未安装，也未放入 工具\ollama\）
if not defined OLLAMA_EXE echo       系统照常可用：AI 会自动降级为离线模板与资料检索。

if exist "%CD%\模型\" echo [2/3] 模型目录：使用项目内 .\模型 目录
if exist "%CD%\模型\" set "OLLAMA_MODELS=%CD%\模型"
if not exist "%CD%\模型\" echo [2/3] 模型目录：沿用系统已设置的 OLLAMA_MODELS（未使用项目内目录）

netstat -ano | findstr /r ":11434 .*LISTENING" >nul 2>&1
if not errorlevel 1 echo [3/3] 模型服务：已在运行（127.0.0.1:11434），跳过启动
if errorlevel 1 echo [3/3] 模型服务：未在运行

if defined CHECK goto :report
if errorlevel 1 goto :startsvc
goto :report

:startsvc
if not defined OLLAMA_EXE goto :report
echo       正在启动模型服务…
set "OLLAMA_ORIGINS=*"
if not defined OLLAMA_KEEP_ALIVE set "OLLAMA_KEEP_ALIVE=30m"
start "Ollama 模型服务（关闭该窗口即停止服务）" /min cmd /c ""!OLLAMA_EXE!" serve"
for /l %%T in (1,1,20) do call :waitone
goto :report

:waitone
timeout /t 1 >nul
netstat -ano | findstr /r ":11434 .*LISTENING" >nul 2>&1
if errorlevel 1 exit /b 0
exit /b 1

:report
netstat -ano | findstr /r ":11434 .*LISTENING" >nul 2>&1
if not errorlevel 1 echo [----] 端口 11434：正在监听 OK
if errorlevel 1 echo [----] 端口 11434：未监听（AI 将使用离线模板兜底）
if not defined OLLAMA_EXE goto :afterlist
if not defined CHECK echo [----] 本机已安装的模型：
if not defined CHECK "!OLLAMA_EXE!" list

:afterlist
if defined CHECK echo. & echo 检查完毕：未启动任何服务、未打开浏览器。 & goto :eof

echo.
echo 正在打开系统首页…（打开后无需任何 AI 配置，会自动接入本机模型）
start "" "%CD%\index.html"
echo.
echo 提示：本窗口可关闭；模型服务在单独的最小化窗口里跑，关掉它即停止服务。
timeout /t 5 >nul
endlocal
