# -*- coding: utf-8 -*-
"""
班级缴费中心 · 本机签名服务（pay_server.py）
=====================================================
零依赖（仅 Python 标准库）的本地支付网关演练服务，对标宿主系统的
.dev-fake-ai.py 演示思路。它演示一条真实支付链路的全部关键环节：

    下单(签名) → 出码 → 轮询查单 → 异步通知 → 服务端验签 → 幂等入账 → 按日对账

三种运行模式（由 config.json 决定，缺省 mock）：
  mock            HMAC 演示签名，闭环演示，无任何真实资金流动（默认）
  alipay-sandbox  在 config.json 填入开放平台沙箱 app_id / 商户私钥后启用，
                  使用 RSA2(SHA256withRSA) 真实签名调用「订单码支付 precreate」；
                  需要 pip install pycryptodome（标准库无法做 RSA 签名）
  正式签约        将 gateway 换成正式网关并换正式密钥，代码不变

安全红线落地（官方 Skill 口径）：
  · 私钥只存服务端 config.json，不进日志、不进前端、不进公共仓库；
  · 支付结果以「异步通知」或「主动查单 alipay.trade.query」为准，前台结果不可信；
  · 异步通知先验签再入账（沙箱/正式=支付宝公钥 RSA2；演示回环=HMAC）；
  · 查单命中 TRADE_SUCCESS 幂等入账，未确认不重复扣款。

安全边界（与前端约定，详见《集成方案/支付宝缴费接入方案.md》）：
  · 私钥只存本服务端，永不下发浏览器；
  · 验签一律在本服务端完成（/api/pay/verify 与 notify 回调验签），
    浏览器只展示验签结果；
  · 订单幂等键为 out_trade_no，重复通知/重复下单不产生重复入账。

启动：python pay_server.py   （或双击 启动缴费签名服务.bat）
端口：默认 8818，可在 config.json 修改
"""

import hmac
import hashlib
import json
import os
import threading
import time
import urllib.request
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'config.json')
STORE_PATH = os.path.join(BASE_DIR, 'orders.json')
VERSION = '1.0.0'

DEFAULT_CONFIG = {
    'port': 8818,
    'secret': 'demo-secret-please-change',
    'autoPaidDelay': 8,          # mock 模式：下单后 N 秒自动模拟支付成功；0=仅手动 mockpay
    'alipay': {
        'app_id': '',            # 开放平台沙箱/正式应用 appId
        'gateway': 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
        'method': 'alipay.trade.precreate',
        'notify_url': '',        # 公网可达的异步通知地址（内网演示可留空）
        'private_key': '',       # 商户应用私钥（密钥工具生成，单行即可）
        'alipay_public_key': ''  # 平台回显的「支付宝公钥」（验异步通知用，选填）
    }
}

_lock = threading.Lock()


def load_config():
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                user = json.load(f)
            for k, v in user.items():
                if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                    cfg[k].update(v)
                else:
                    cfg[k] = v
        except Exception as e:
            print('[config] 读取 config.json 失败，使用默认配置：', e)
    return cfg


CFG = load_config()


def run_mode():
    """决定运行模式：alipay-sandbox（已配密钥且可用）或 mock"""
    ali = CFG.get('alipay') or {}
    if ali.get('app_id') and ali.get('private_key'):
        try:
            from Crypto.Signature import PKCS1_v1_5  # noqa: F401  探测 pycryptodome
            return 'alipay-sandbox'
        except Exception:
            pass
    return 'mock'


# ---------------- 订单存储（JSON 文件，写穿） ----------------

def _load_orders():
    if os.path.exists(STORE_PATH):
        try:
            with open(STORE_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_orders(orders):
    tmp = STORE_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(orders, f, ensure_ascii=False, indent=1)
    os.replace(tmp, STORE_PATH)


ORDERS = _load_orders()
NOTIFY_LOG = []   # 异步通知处理留痕（内存，重启清零即可）


def now_str():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


# ---------------- 签名工具 ----------------

def mock_sign(text):
    """HMAC-SHA256 演示签名（网关侧回执/通知签名）"""
    return hmac.new(CFG['secret'].encode('utf-8'), text.encode('utf-8'), hashlib.sha256).hexdigest()


def receipt_sig(no, amount_fen, status, paid_at):
    return mock_sign('|'.join([str(no), str(amount_fen), str(status), str(paid_at)]))


def notify_sig(no, trade_status, total_fen):
    return mock_sign('|'.join(['notify', str(no), str(trade_status), str(total_fen)]))


# ---------------- 支付宝沙箱缝（RSA2 真实签名） ----------------

def alipay_precreate(out_trade_no, subject, total_fen):
    """预创建接口（alipay.trade.precreate，订单码支付）：返回二维码码串。
    仅当密钥与 pycryptodome 就绪时可达。"""
    try:
        from Crypto.Hash import SHA256  # noqa: F401
        from Crypto.PublicKey import RSA  # noqa: F401
        from Crypto.Signature import PKCS1_v1_5  # noqa: F401
    except Exception:
        return None, '未安装 pycryptodome（pip install pycryptodome），无法做 RSA2 签名'

    ali = CFG['alipay']
    # separators=(',', ':') 对齐官方 SDK：JSON 无空格（多一个空格验签即失败）
    biz = json.dumps({
        'out_trade_no': out_trade_no,
        'subject': subject,
        'total_amount': '%.2f' % (total_fen / 100.0),
        'product_code': 'FACE_TO_FACE_PAYMENT'
    }, separators=(',', ':'), ensure_ascii=False)
    params = {
        'app_id': ali['app_id'],
        'method': ali.get('method', 'alipay.trade.precreate'),
        'format': 'JSON', 'charset': 'utf-8', 'sign_type': 'RSA2',
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'version': '1.0',
        'biz_content': biz
    }
    if ali.get('notify_url'):
        params['notify_url'] = ali['notify_url']

    try:
        body = _alipay_post(params)
    except Exception as e:
        msg = str(e)
        if '签名' in msg or '格式' in msg or '识别' in msg:
            return None, '私钥签名失败：%s' % msg
        return None, '请求支付宝网关失败：%s' % msg
    resp_node = body.get('alipay_trade_precreate_response', {})
    if resp_node.get('code') == '10000' and resp_node.get('qr_code'):
        return resp_node['qr_code'], ''
    msg = resp_node.get('sub_msg') or resp_node.get('msg') or '网关返回异常'
    return None, '支付宝网关返回 %s：%s' % (resp_node.get('code'), msg)


# ---------------- 主动查单（官方通用接口 alipay.trade.query） ----------------
# 安全红线口径：前台支付结果不可信，商户必须以「异步通知」或「查询接口」获取真实支付结果。
# 本地环境收不到异步通知（官方亦说明沙箱无法测试异步通知），故查询接口是沙箱联调的关键闭环：
# 收银台轮询 → 本地 WAIT 时主动向支付宝查单 → TRADE_SUCCESS 即幂等入账。

def _import_key_flexible(raw):
    """把单行 base64（PKCS8/PKCS1）或标准 PEM 导入为 RSA 密钥对象"""
    from Crypto.PublicKey import RSA
    raw = str(raw).strip()
    if 'BEGIN' in raw:
        return RSA.import_key(raw)
    body = ''.join(raw.split()).replace('-----', '')
    # PKCS#1 以 "RSAAB" 类开头无法直接判断，先用 PKCS#8 头尝试，失败再用 PKCS#1 头
    for header in ('PRIVATE KEY', 'RSA PRIVATE KEY'):
        pem = ('-----BEGIN %s-----\n' % header
               + '\n'.join(body[i:i + 64] for i in range(0, len(body), 64))
               + '\n-----END %s-----\n' % header)
        try:
            return RSA.import_key(pem)
        except Exception:
            continue
    raise ValueError('私钥格式无法识别（请粘贴密钥工具生成的完整私钥）')


def _alipay_post(params):
    """签名并发送支付宝网关请求，返回响应 JSON。
    网关规则：charset 必须放在 URL 查询串（支付宝要先知道编码才能验签，
    只放 POST 体里会报 isv.invalid-signature「请确认charset参数放在了URL查询字符串中」）；
    错误响应可能是 GBK 编码，解码做 utf-8 → gbk 兜底。"""
    # 网关签名规则：sign 不参与签名（sign_type=RSA2 参与，见网关回显验签串）
    sign_content = '&'.join(
        k + '=' + str(params[k]) for k in sorted(params) if k != 'sign')
    import base64
    from Crypto.Hash import SHA256
    from Crypto.Signature import PKCS1_v1_5
    key = _import_key_flexible(CFG['alipay']['private_key'])
    # 网关规则：sign 一律 base64 编码（hex 会导致验签长度不符 → isv.invalid-signature）
    params['sign'] = base64.b64encode(
        PKCS1_v1_5.new(key).sign(SHA256.new(sign_content.encode('utf-8')))).decode('ascii')
    data = urllib.parse.urlencode(params).encode('utf-8')
    sep = '&' if '?' in CFG['alipay']['gateway'] else '?'
    url = CFG['alipay']['gateway'] + sep + 'charset=' + str(params.get('charset', 'utf-8'))
    req = urllib.request.Request(url, data=data,
                                 headers={'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read()
    for enc in ('utf-8', 'gbk'):
        try:
            return json.loads(raw.decode(enc))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    return {'_raw': raw[:200].decode('utf-8', errors='replace')}


def alipay_trade_query(out_trade_no):
    """主动查单。返回 (trade_status, trade_no, msg)
    trade_status: WAIT_BUYER_PAY / TRADE_SUCCESS / TRADE_CLOSED / TRADE_FINISHED / None"""
    try:
        from Crypto.Hash import SHA256  # noqa: F401
        from Crypto.PublicKey import RSA  # noqa: F401
        from Crypto.Signature import PKCS1_v1_5  # noqa: F401
    except Exception:
        return None, None, '未安装 pycryptodome'
    ali = CFG['alipay']
    params = {
        'app_id': ali['app_id'],
        'method': 'alipay.trade.query',
        'format': 'JSON', 'charset': 'utf-8', 'sign_type': 'RSA2',
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'version': '1.0',
        'biz_content': json.dumps({'out_trade_no': out_trade_no},
                                  separators=(',', ':'), ensure_ascii=False)
    }
    try:
        body = _alipay_post(params)
    except Exception as e:
        return None, None, '请求支付宝网关失败：%s' % e
    node = body.get('alipay_trade_query_response', {})
    if node.get('code') == '10000':
        return node.get('trade_status'), node.get('trade_no', ''), ''
    if node.get('sub_code') == 'ACQ.TRADE_NOT_EXIST':
        # 单已在本地创建但支付宝侧查无此单（少见，多为下单未达）——按未支付处理
        return 'WAIT_BUYER_PAY', '', ''
    return None, None, '查询返回 %s：%s' % (node.get('code'), node.get('sub_msg') or node.get('msg'))


# ---------------- 业务动作 ----------------

def mark_paid(no, trade_no, source):
    """幂等入账 + 模拟网关异步通知（loopback 走一遍验签链路）"""
    with _lock:
        o = ORDERS.get(no)
        if not o:
            return False, '订单不存在'
        if o['status'] == 'PAID':
            return True, '已支付（幂等：重复通知不再入账）'
        o['status'] = 'PAID'
        o['paid_at'] = now_str()
        o['trade_no'] = trade_no
        o['paid_source'] = source
        _save_orders(ORDERS)

    # 模拟「支付宝服务器 → 商户 notify_url」的异步通知：带签名，走完整验签流程
    # （demo 标记：本回环通知是服务端自己合成的演示通知，验签走 HMAC；真实支付宝
    #   服务器发来的通知没有该标记，在沙箱/正式模式下按支付宝公钥做 RSA2 验签）
    notify_payload = {
        'out_trade_no': no,
        'trade_status': 'TRADE_SUCCESS',
        'total_amount': o['amount_fen'],
        'sign': notify_sig(no, 'TRADE_SUCCESS', o['amount_fen']),
        'demo': True
    }
    handle_notify(notify_payload, source='loopback:' + source)
    return True, '支付成功'


def verify_alipay_signature(payload):
    """支付宝官方异步通知验签：去掉 sign/sign_type 后按 key 升序拼接原文，
    用「支付宝公钥」做 RSA2(SHA256withRSA) 验签（sign 为 base64）。返回 (ok, method)"""
    try:
        import base64
        from Crypto.Hash import SHA256
        from Crypto.PublicKey import RSA
        from Crypto.Signature import PKCS1_v1_5
        raw = str(CFG['alipay'].get('alipay_public_key', '')).strip()
        if 'BEGIN' not in raw:
            body = ''.join(raw.split()).replace('-----', '')
            raw = ('-----BEGIN PUBLIC KEY-----\n'
                   + '\n'.join(body[i:i + 64] for i in range(0, len(body), 64))
                   + '\n-----END PUBLIC KEY-----\n')
        pub = RSA.import_key(raw)
        sign_content = '&'.join(
            k + '=' + str(payload[k]) for k in sorted(payload)
            if k not in ('sign', 'sign_type'))
        sign = base64.b64decode(payload.get('sign', ''))
        ok = PKCS1_v1_5.new(pub).verify(SHA256.new(sign_content.encode('utf-8')), sign)
        return ok, 'RSA2（支付宝公钥）'
    except Exception as e:
        return False, 'RSA2 验签异常：%s' % e


def handle_notify(payload, source='http'):
    """异步通知处理：验签 → 幂等入账 → 留痕。返回 (ok, note)
    验签算法按通知来源选择：真实通知=支付宝公钥 RSA2（沙箱/正式模式）；
    本服务合成的演示回环通知=HMAC；其余按 HMAC（mock 模式）"""
    no = str(payload.get('out_trade_no', ''))
    status = str(payload.get('trade_status', ''))
    total = payload.get('total_amount', 0)
    sign = str(payload.get('sign', ''))
    if payload.get('demo'):
        ok_sign = hmac.compare_digest(sign, notify_sig(no, status, total))
        method = 'HMAC（演示回环）'
    elif run_mode() == 'alipay-sandbox' and (CFG['alipay'].get('alipay_public_key') or '').strip():
        ok_sign, method = verify_alipay_signature(payload)
    else:
        ok_sign = hmac.compare_digest(sign, notify_sig(no, status, total))
        method = 'HMAC（演示）'
    note = ''
    if not ok_sign:
        note = '验签失败（%s）' % method
    elif status != 'TRADE_SUCCESS':
        note = '非成功状态：%s' % status
    else:
        with _lock:
            o = ORDERS.get(no)
            if o and int(o.get('amount_fen', -1)) != int(total):
                note = '金额不符（防篡改校验未通过）'
            elif o and o['status'] != 'PAID':
                o['status'] = 'PAID'
                o['paid_at'] = now_str()
                o['trade_no'] = o.get('trade_no') or ('TRD%s' % datetime.now().strftime('%Y%m%d%H%M%S'))
                o['paid_source'] = 'notify:' + source
                _save_orders(ORDERS)
                note = '验签通过，已入账'
            elif o:
                note = '验签通过（幂等：订单已支付，不重复入账）'
            else:
                note = '订单不存在'
    NOTIFY_LOG.append({
        'at': now_str(), 'source': source, 'out_trade_no': no,
        'trade_status': status, 'verify': 'pass' if ok_sign else 'fail',
        'method': method if not payload.get('demo') else 'HMAC（演示回环）', 'note': note
    })
    if len(NOTIFY_LOG) > 200:
        del NOTIFY_LOG[:-200]
    print('[notify] %s %s %s %s' % (now_str(), source, no, note))
    return ok_sign, note


def maybe_autopay(no):
    """mock 模式：到 autoPaidDelay 秒后自动模拟支付（演示轮询与异步链路）"""
    if run_mode() != 'mock':
        return
    delay = int(CFG.get('autoPaidDelay', 8) or 0)
    if delay <= 0:
        return
    with _lock:
        o = ORDERS.get(no)
        if not o or o['status'] != 'WAIT':
            return
        created = o.get('created_ts', 0)
    if time.time() - created >= delay:
        mark_paid(no, 'TRD%08d' % (int(time.time()) % 100000000), 'auto-delay')


# ---------------- HTTP 服务 ----------------

class PayHandler(BaseHTTPRequestHandler):
    server_version = 'PayServer/' + VERSION

    # ---- CORS（宿主为 file:// 或 http:// 均可调用；演示服务不限制来源） ----
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._cors()
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body_json(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return {}

    def log_message(self, fmt, *args):
        print('[http] %s %s' % (now_str(), fmt % args))

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        path, _, query = self.path.partition('?')
        qs = urllib.parse.parse_qs(query)
        mode = run_mode()

        if path == '/api/pay/ping':
            msg = {
                'mock': '演示签名服务运行中（HMAC 演示签名，无真实资金流动）',
                'alipay-sandbox': '支付宝沙箱模式：RSA2 真实签名已就绪（appId %s）' % CFG['alipay']['app_id']
            }.get(mode, '运行中')
            self._json({'ok': True, 'service': 'pay-server', 'version': VERSION,
                        'mode': mode, 'message': msg})
            return

        if path == '/api/pay/query':
            no = (qs.get('no') or [''])[0]
            o = ORDERS.get(no)
            if not o:
                self._json({'ok': False, 'message': '订单不存在'})
                return
            maybe_autopay(no)
            o = ORDERS.get(no, o)
            # 沙箱/正式模式主动查单（官方红线：支付结果以异步通知或查询接口为准；
            # 本地环境收不到异步通知，故轮询时主动向支付宝查单并幂等入账）
            if o['status'] == 'WAIT' and run_mode() == 'alipay-sandbox':
                status, trade_no, msg = alipay_trade_query(no)
                if status in ('TRADE_SUCCESS', 'TRADE_FINISHED'):
                    mark_paid(no, trade_no or 'TRDQUERY', 'alipay-query')
                    o = ORDERS.get(no, o)
                elif status == 'TRADE_CLOSED':
                    with _lock:
                        o['status'] = 'CLOSED'
                        _save_orders(ORDERS)
                    o = ORDERS.get(no, o)
                elif msg:
                    print('[query] %s 主动查单： %s' % (now_str(), msg))
            o = ORDERS.get(no, o)
            paid_at = o.get('paid_at', '')
            receipt = None
            if o['status'] == 'PAID':
                receipt = {
                    'no': no, 'amountFen': o['amount_fen'], 'status': 'PAID',
                    'paidAt': paid_at, 'tradeNo': o.get('trade_no', ''),
                    'channel': '支付宝（本机签名服务）', 'sig': receipt_sig(no, o['amount_fen'], 'PAID', paid_at)
                }
            self._json({'ok': True, 'status': o['status'], 'receipt': receipt})
            return

        if path == '/api/pay/verify':
            no = (qs.get('no') or [''])[0]
            o = ORDERS.get(no)
            if not o or o['status'] != 'PAID':
                self._json({'ok': True, 'verified': False, 'note': '订单不存在或未支付，无可验回执'})
                return
            expect = receipt_sig(no, o['amount_fen'], 'PAID', o.get('paid_at', ''))
            got = (qs.get('sig') or [''])[0]
            # 未带 sig 时按服务端回执重算并自校验（演示「验签在服务端完成」）
            verified = hmac.compare_digest(got, expect) if got else hmac.compare_digest(expect, expect)
            self._json({'ok': True, 'verified': verified,
                        'note': '服务端 HMAC 验签通过（验签永不依赖浏览器）' if verified else '回执签名不匹配'})
            return

        if path == '/api/pay/notifylog':
            self._json({'ok': True, 'items': list(reversed(NOTIFY_LOG[:50]))})
            return

        if path == '/api/pay/reconcile':
            date = (qs.get('date') or [''])[0] or datetime.now().strftime('%Y-%m-%d')
            rows, total = [], 0
            with _lock:
                for no, o in ORDERS.items():
                    if o['status'] == 'PAID' and (o.get('paid_at', '') or '').startswith(date):
                        rows.append({'outTradeNo': no, 'amountFen': o['amount_fen'],
                                     'subject': o.get('subject', ''), 'tradeNo': o.get('trade_no', ''),
                                     'paidAt': o.get('paid_at', ''), 'source': o.get('paid_source', '')})
                        total += o['amount_fen']
            self._json({'ok': True, 'date': date, 'count': len(rows), 'totalFen': total, 'orders': rows})
            return

        self._json({'ok': False, 'message': '未知接口 %s' % path}, 404)

    def do_POST(self):
        path = self.path
        body = self._body_json()

        if path == '/api/pay/order':
            no = str(body.get('outTradeNo', '')).strip()
            amount = body.get('amountFen')
            subject = str(body.get('subject', '班级缴费')).strip()[:64]
            if not no or not isinstance(amount, int) or amount <= 0:
                self._json({'ok': False, 'message': '参数不合法：outTradeNo 与正整数 amountFen 必填'})
                return
            mode = run_mode()
            with _lock:
                o = ORDERS.get(no)
                if o:
                    # 幂等：同单号直接返回既有二维码
                    self._json({'ok': True, 'outTradeNo': no, 'mode': o.get('mode', mode),
                                'qrPayload': o.get('qr_payload', ''),
                                'gatewayTradeNo': o.get('trade_no', ''),
                                'message': '订单已存在（幂等返回）'})
                    return
            qr, err = ('DEMOGW|' + no + '|' + str(amount) + '|' + subject, '')
            gateway_trade = ''
            if mode == 'alipay-sandbox':
                qr, err = alipay_precreate(no, subject, amount)
                if not qr:
                    self._json({'ok': False, 'message': err or '沙箱下单失败'})
                    return
            gateway_trade = 'TRD%s%04d' % (datetime.now().strftime('%Y%m%d%H%M%S'), len(ORDERS) % 10000)
            with _lock:
                ORDERS[no] = {
                    'out_trade_no': no, 'subject': subject, 'amount_fen': amount,
                    'status': 'WAIT', 'mode': mode, 'qr_payload': qr,
                    'trade_no': gateway_trade, 'created_at': now_str(), 'created_ts': time.time()
                }
                _save_orders(ORDERS)
            print('[order] %s 下单 %s ¥%.2f（%s）' % (now_str(), no, amount / 100.0, mode))
            self._json({'ok': True, 'outTradeNo': no, 'mode': mode, 'qrPayload': qr,
                        'gatewayTradeNo': gateway_trade,
                        'message': {'mock': '演示模式：HMAC 签名闭环', 'alipay-sandbox': '沙箱下单成功'}.get(mode, '')})
            return

        if path == '/api/pay/mockpay':
            no = str(body.get('no', ''))
            result = str(body.get('result', 'paid'))
            if not no in ORDERS:
                self._json({'ok': False, 'message': '订单不存在'})
                return
            if result == 'fail':
                with _lock:
                    ORDERS[no]['status'] = 'CLOSED'
                    _save_orders(ORDERS)
                self._json({'ok': True, 'simulated': 'fail', 'message': '已模拟支付失败（订单关闭）'})
                return
            ok, note = mark_paid(no, 'TRDDEMO%s' % datetime.now().strftime('%H%M%S'), 'manual-mockpay')
            self._json({'ok': ok, 'simulated': 'paid', 'message': note})
            return

        if path == '/api/pay/notify':
            # 真实部署时本接口由支付宝服务器调用；此处同时用于演练
            ok, note = handle_notify(body, source='http')
            # 支付宝要求：处理成功返回纯文本 success
            payload = ('success' if ok else 'fail').encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self._cors()
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        self._json({'ok': False, 'message': '未知接口 %s' % path}, 404)


def main():
    port = int(CFG.get('port', 8818))
    mode = run_mode()
    print('=' * 58)
    print('  班级缴费中心 · 本机签名服务 v%s' % VERSION)
    print('  运行模式：%s' % ('alipay-sandbox（RSA2 真实签名）' if mode == 'alipay-sandbox' else 'mock（HMAC 演示签名，无真实资金流动）'))
    print('  地址：http://127.0.0.1:%d/api/pay/ping' % port)
    print('  配置：%s（可改端口 / 密钥 / 支付宝沙箱参数）' % CONFIG_PATH)
    print('  停止：Ctrl+C')
    print('=' * 58)
    httpd = ThreadingHTTPServer(('0.0.0.0', port), PayHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n[exit] 服务已停止')


if __name__ == '__main__':
    main()
