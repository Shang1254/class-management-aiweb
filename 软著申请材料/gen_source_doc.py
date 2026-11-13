# -*- coding: utf-8 -*-
"""
《高校班级综合管理系统》源程序文档（软件著作权 · 程序鉴别材料）生成脚本
- 规范：每页 50 行，提交前 30 页 + 后 30 页（不足 60 页全部提交）
- 页眉标注「软件名称 + 版本号」，页脚为 Word 自动页码
- 输出：./高校班级综合管理系统_源程序.docx
运行：python 软著申请材料/gen_source_doc.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sz_common import (ROOT, HERE, NAME_VER, set_header_footer, new_doc, fixed_line)

OUT = os.path.join(HERE, '高校班级综合管理系统_源程序.docx')

LINES_PER_PAGE = 50
FRONT_PAGES = 30
BACK_PAGES = 30
WRAP_AT = 108

FILES = ['index.html', 'css/style.css', 'js/utils.js', 'js/store.js', 'js/auth.js', 'js/ui.js',
         'js/weather.js', 'js/cn-calendar.js', 'js/ai.js', 'js/pages/ai.js', 'js/app.js']


def collect_files():
    pages = [f for f in os.listdir(os.path.join(ROOT, 'js', 'pages')) if f.endswith('.js')]
    return FILES + ['js/pages/' + f for f in sorted(pages)]


def wrap(line):
    out = []
    while len(line) > WRAP_AT:
        out.append(line[:WRAP_AT])
        line = '        ' + line[WRAP_AT:]
    out.append(line)
    return out


def gather_lines():
    lines = []
    for rel in collect_files():
        p = os.path.join(ROOT, rel.replace('/', os.sep))
        if not os.path.exists(p):
            continue
        lines.append('/* ================= 源文件：' + rel + ' ================= */')
        with open(p, encoding='utf-8', errors='ignore') as f:
            for raw in f:
                s = raw.rstrip('\n').rstrip('\r').replace('\t', '    ').rstrip()
                lines.extend(wrap(s))
        lines.append('')
    return lines


def emit_block(doc, lines):
    for i in range(0, len(lines), LINES_PER_PAGE):
        chunk = lines[i:i + LINES_PER_PAGE]
        for ln in chunk:
            fixed_line(doc, ln)
        for _ in range(LINES_PER_PAGE - len(chunk)):
            fixed_line(doc, '')
        if i + LINES_PER_PAGE < len(lines):
            doc.add_page_break()


def main():
    all_lines = gather_lines()
    total_lines = len(all_lines)
    total_pages = (total_lines + LINES_PER_PAGE - 1) // LINES_PER_PAGE
    front = all_lines[:FRONT_PAGES * LINES_PER_PAGE]
    back = all_lines[-(BACK_PAGES * LINES_PER_PAGE):]

    doc = new_doc()
    set_header_footer(doc, '源程序')

    fixed_line(doc, NAME_VER + '  源程序（程序鉴别材料）', size=10, bold=True)
    fixed_line(doc, '源程序共 %d 行 / %d 页（每页 50 行）；本册提交前 %d 页与后 %d 页'
                    % (total_lines, total_pages, FRONT_PAGES, BACK_PAGES), size=8)
    emit_block(doc, front)

    doc.add_page_break()
    fixed_line(doc, '（中间部分略；以下为源程序最后 %d 页，完整源程序见项目源文件）' % BACK_PAGES, size=8)
    emit_block(doc, back)

    doc.save(OUT)
    print('源程序文档已生成 ->', OUT)
    print('  源程序 %d 行 / %d 页；本册含前 %d 页 + 后 %d 页' % (total_lines, total_pages, FRONT_PAGES, BACK_PAGES))
    print('  文件大小：%.1f KB' % (os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
