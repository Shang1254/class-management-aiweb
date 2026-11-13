@echo off
chcp 65001 > nul
title Ollama 服务（班级管理系统 · 本地大模型）
set "OLLAMA_MODELS=E:\OllamaModels"
set "OLLAMA_ORIGINS=*"
set "OLLAMA_KEEP_ALIVE=30m"
echo 正在启动 Ollama 本地大模型服务…
echo   模型目录：%OLLAMA_MODELS%
echo   跨域来源：%OLLAMA_ORIGINS%（允许本系统以 file:// 或 http://localhost 方式调用）
echo.
echo 服务启动后请保持本窗口开启；关闭窗口即停止服务。
echo 自检：浏览器打开 http://127.0.0.1:11434  应能看到 "Ollama is running"
echo.
"%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
pause
