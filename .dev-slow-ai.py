# -*- coding: utf-8 -*-
"""慢速假模型（仅用于验证前端"已等待 N 秒"计时器与超时设置）：每个请求延迟 6 秒返回。
运行：python .dev-slow-ai.py 8904
"""
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin', '*'))
        self.send_header('Access-Control-Allow-Headers', 'authorization,content-type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        self.rfile.read(n)
        time.sleep(6)                      # 模拟本机模型加载 + 慢速生成
        content = '【今日学工日报】（慢速服务示例）\n\n一、今日概况\n    用于验证前端计时器与会话超时设置。'
        out = json.dumps({'choices': [{'message': {'role': 'assistant', 'content': content}}]},
                         ensure_ascii=False).encode()
        self.send_response(200)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8904
    print('slow-ai listening on', port)
    HTTPServer(('127.0.0.1', port), H).serve_forever()
