@echo off
chcp 65001 >nul
cd /d "%~dp0"
python 沙箱自检.py
pause
