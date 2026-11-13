# -*- coding: utf-8 -*-
"""
沙箱自检脚本：读 config.json → 真实调用支付宝沙箱下单 → 打印结果
用法：python 沙箱自检.py   （或双击 沙箱自检.bat）
"""
import json
import io
import os
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.dirname(os.path.abspath(__file__)))

cfg = json.load(io.open('config.json', encoding='utf-8'))
ali = cfg['alipay']

print('=' * 56)
print(' 沙箱自检 · app_id=%s' % (ali['app_id'] or '(未填)'))
print('=' * 56)
for k in ('gateway', 'alipay_public_key'):
    v = str(ali.get(k, ''))
    print(' %s: %s' % (k, (v[:44] + '…') if len(v) > 46 else (v or '(空)')))
print(' private_key: %s' % ('已填（%d 字符）' % len(ali['private_key']) if ali['private_key'] else '空'))

import importlib.util
spec = importlib.util.spec_from_file_location('ps', 'pay_server.py')
ps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ps)

mode = ps.run_mode()
print('\n 运行模式: %s' % mode)
if mode != 'alipay-sandbox':
    print(' ✕ 未进入沙箱模式：检查 app_id 与 private_key 是否都已填写')
    input(' 回车退出…')
    sys.exit(1)

no = 'BJSELF%s' % int(time.time())
t0 = time.time()
qr, err = ps.alipay_precreate(no, '沙箱自检·班级缴费', 1)   # 0.01 元
ms = int((time.time() - t0) * 1000)
if qr:
    print('\n ✓ 下单成功（%dms）—— 密钥与网关全部打通！' % ms)
    print('   out_trade_no:', no)
    print('   qr_code     :', qr)
    st, tno, msg = ps.alipay_trade_query(no)
    print('   主动查单    : status=%s %s' % (st, msg or ''))
    print('\n 下一步：缴费中心学生端扫码，或用沙箱钱包 App 扫上面的码付 0.01 元，')
    print(' 收银台会通过主动查单自动确认「支付成功」。')
else:
    print('\n ✕ 下单失败（%dms）' % ms)
    print('   ', err)
    if '验签出错' in err:
        print('   → 沙箱当前生效的公钥不是这对密钥。去沙箱控制台：')
        print('     「接口加签方式 → 系统默认密钥 → 查看」，把页面上的')
        print('     「应用私钥」与「支付宝公钥」分别填进 config.json 并重启本服务。')
if sys.stdin.isatty():
    input('\n 回车退出…')
