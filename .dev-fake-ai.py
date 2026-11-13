# -*- coding: utf-8 -*-
"""
本地假模型服务器（仅用于开发实测：验证前端 AI 链路的请求构造 / 解析 / 错误处理）
- 模拟 OpenAI 兼容接口 POST /v1/chat/completions，带 CORS 头
- 按提示词关键词返回不同内容：出题→JSON 数组；通知→通知文本；简报→简报文本；其他→问答
运行：python /tmp/fake_ai.py  （监听 8901）
"""
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

NL = chr(10)

QUIZ = [
    {"type": "单选", "stem": "二叉树中序遍历的访问顺序是？",
     "options": ["根—左—右", "左—根—右", "左—右—根", "右—根—左"], "answer": "B", "points": 20},
    {"type": "多选", "stem": "下列属于二叉树的遍历方式的有？",
     "options": ["前序遍历", "中序遍历", "后序遍历", "广度压缩"], "answer": "ABC", "points": 20},
    {"type": "判断", "stem": "完全二叉树一定可以用顺序存储结构表示。",
     "options": ["对", "错"], "answer": "对", "points": 20},
]

NOTICE = ("关于开展秋季运动会报名的通知\n"
          "各位同学：\n"
          "    现将秋季运动会报名有关事项通知如下：\n"
          "    一、时间：11 月 20 日（周五）14:00\n"
          "    二、地点：学校运动场\n"
          "    三、报名要求：每班限报 10 人，请于 11 月 15 日前将名单报体育委员汇总；参赛同学注意赛前热身。\n"
          "    请相互转告，按时参加。\n\n"
          "                                            〇〇〇（发布人）")

REPORT = ("【计科20252302班 学情简报】（2026-2027-1）\n\n"
          "一、总体情况\n"
          "    本班在册学生 31 人，本学期平均分与及格率总体稳定，近 30 天出勤情况良好；重点关注学生若干名。\n\n"
          "二、主要问题\n"
          "    1. 个别课程不及格，需组织补考复习；\n"
          "    2. 少数同学存在迟到与缺勤，需加强提醒。\n\n"
          "三、建议措施\n"
          "    1. 逐一谈话关注学业困难学生；\n"
          "    2. 组织学习互助小组；\n"
          "    3. 加强考勤与请假管理。")


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin', '*'))
        self.send_header('Access-Control-Allow-Headers', 'authorization,content-type')
        self.send_header('Access-Control-Allow-Methods', 'POST,OPTIONS')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(n) or b'{}')
        prompt = json.dumps(body.get('messages', []), ensure_ascii=False)
        auth = self.headers.get('Authorization') or ''
        if auth and 'bad' in auth:
            self.send_response(401)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': {'message': 'invalid api key'}}).encode())
            return
        if '日报' in prompt:
            content = NL.join([
                '【今日学工日报】', '',
                '一、今日概况',
                '    健康日报填报率 100%，体温异常 3 人，校外动向 2 人；待审批请假 1 件；重点关注学生 8 人。', '',
                '二、需要立即处理',
                '    1. 待审批请假 1 件（10 月 6—8 日，家中有事需返乡）；',
                '    2. 体温异常 3 人，请核实健康状况并跟踪；',
                '    3. 校外动向 2 人，请核对行程与安全；',
                '    4. 国家奖学金申请节点进行中（剩余 4 天）。', '',
                '三、重点关注',
                '    出勤率低于 85%：5 人；缺勤 3 次以上：2 人；学业预警：1 人。', '',
                '四、建议动作',
                '    1. 逐一审批待处理请假，明确返校时间；',
                '    2. 当天联系未报与体温异常学生核实情况；',
                '    3. 对重点关注学生安排谈话，必要时联系家长；',
                '    4. 提醒学生按期提交奖助材料。'])
        elif 'JSON 数组' in prompt or '命题' in prompt:
            content = '```json\n' + json.dumps(QUIZ, ensure_ascii=False) + '\n```'
        elif '通知' in prompt:
            content = NOTICE
        elif '学情简报' in prompt:
            content = REPORT
        else:
            content = '依据资料：国家奖学金标准 10000 元/人·学年，每年 9—10 月申报，需先由学院初评并公示。（依据来源见下方列表）'
        out = json.dumps({'choices': [{'message': {'role': 'assistant', 'content': content}}]}, ensure_ascii=False).encode()
        self.send_response(200)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def do_GET(self):
        if self.path.startswith('/api/tags'):
            out = json.dumps({'models': [
                {'name': 'qwen2.5:7b', 'size': 4700000000},
                {'name': 'qwen2.5:3b', 'size': 1900000000},
                {'name': 'deepseek-r1:7b', 'size': 4700000000}
            ]}, ensure_ascii=False).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(out)))
            self.end_headers()
            self.wfile.write(out)
            return
        self.send_response(404)
        self._cors()
        self.end_headers()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8901
    print('fake-ai listening on', port)
    HTTPServer(('127.0.0.1', port), H).serve_forever()
