@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  ==============================================
echo   班级缴费中心 · 本机签名服务（pay_server.py）
echo   演示真实支付链路：下单/回调/验签/对账
echo  ==============================================
echo.
where python >nul 2>nul
if errorlevel 1 (
  echo  [!] 未检测到 Python，请先安装 Python 3 并勾选 Add to PATH
  pause
  exit /b 1
)
python pay_server.py
echo.
echo  服务已退出。
pause
