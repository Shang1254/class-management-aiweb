# -*- coding: utf-8 -*-
"""技术文档 Markdown → DOCX → PDF 构建脚本
- 解析标题/段落/表格/列表/图片（**粗体** 与 `code` 行内格式）
- 封面 + 目录（两遍生成页码）+ 页脚 第X页/共Y页
- 用 LibreOffice 转 PDF，pypdf 校验页数
"""
import io, os, re, subprocess, sys
from PIL import Image
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_BREAK
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

BASE = r'C:\Users\商子轩\Desktop\班级管理系统'
MD = os.path.join(BASE, '参赛材料', '技术文档.md')
DOCX = os.path.join(BASE, '参赛材料', '技术文档.docx')
PDF = os.path.join(BASE, '参赛材料', '技术文档.pdf')
TOC_PAGES = os.path.join(BASE, '参赛材料', '.toc_pages.json')

INK = RGBColor(0x1C, 0x23, 0x33)
BLUE = RGBColor(0x1D, 0x5D, 0xD8)
GOLD = RGBColor(0x8A, 0x6A, 0x2A)


def set_font(run, name='宋体', size=10.5, bold=False, color=INK):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    r = run._element.rPr.rFonts
    r.set(qn('w:eastAsia'), name)


def add_field(par, instr):
    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), instr)
    run = OxmlElement('w:r')
    t = OxmlElement('w:t')
    t.text = '1'
    run.append(t)
    fld.append(run)
    par._p.append(fld)


def inline_runs(par, text, size=10.5, base_color=INK):
    """解析 **粗体** 与 `code`（支持粗体内嵌代码）"""
    for part in re.split(r'(\*\*[^*]+\*\*)', text):
        if not part:
            continue
        bold = part.startswith('**') and part.endswith('**')
        inner = part[2:-2] if bold else part
        for tk in re.split(r'(`[^`]+`)', inner):
            if not tk:
                continue
            if tk.startswith('`') and tk.endswith('`'):
                r = par.add_run(tk[1:-1]); set_font(r, 'Consolas', size - 1, bold, RGBColor(0x6A, 0x4F, 0x18))
            else:
                r = par.add_run(tk); set_font(r, '黑体' if bold else '宋体', size, bold, base_color)


def build(toc_map=None):
    doc = Document()
    # 页面 A4
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.3)
    sec.top_margin = Cm(2.2); sec.bottom_margin = Cm(2.0)

    # 默认样式
    st = doc.styles['Normal']
    st.font.name = '宋体'; st.font.size = Pt(10.5)
    st.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    st.paragraph_format.space_after = Pt(4)
    st.paragraph_format.line_spacing = 1.35

    # 页脚页码
    footer = sec.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for t in ('第 ',):
        r = footer.add_run(t); set_font(r, '宋体', 8.5, False, RGBColor(0x66, 0x66, 0x66))
    add_field(footer, 'PAGE')
    r = footer.add_run(' 页 / 共 '); set_font(r, '宋体', 8.5, False, RGBColor(0x66, 0x66, 0x66))
    add_field(footer, 'NUMPAGES')
    r = footer.add_run(' 页'); set_font(r, '宋体', 8.5, False, RGBColor(0x66, 0x66, 0x66))

    # ===== 封面 =====
    for _ in range(4):
        doc.add_paragraph()
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('班级管理系统'); set_font(r, '黑体', 30, True, BLUE)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('技 术 文 档'); set_font(r, '黑体', 20, True, INK)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_before = Pt(18)
    r = p.add_run('2026 第九届传智杯全国大学生数智创新与 AI 应用大赛'); set_font(r, '楷体', 13, False, GOLD)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('AI WEB 网页开发挑战赛 · B 组'); set_font(r, '楷体', 13, False, GOLD)
    for _ in range(6):
        doc.add_paragraph()
    meta = [
        ('参赛者', '商子轩'),
        ('学　　校', '武汉晴川学院'),
        ('学　　院', '计算机学院'),
        ('专　　业', '计算机科学与技术（专升本）'),
        ('年　　级', '2025 级'),
        ('演示账号', 'judge / 123456'),
        ('代码仓库', 'https://github.com/Shang1254/class-management-aiweb'),
        ('文档版本', 'V1.0 · 2026-11'),
    ]
    for k, v in meta:
        p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(k + '：'); set_font(r, '宋体', 11, False, RGBColor(0x55, 0x55, 0x55))
        r = p.add_run(v); set_font(r, '宋体', 11, True, INK)
    p = doc.add_paragraph(); p.add_run().add_break(WD_BREAK.PAGE)

    # ===== 目录 =====
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('目　　录'); set_font(r, '黑体', 16, True, INK)
    p.paragraph_format.space_after = Pt(14)
    toc_entries = []
    if toc_map:
        for (level, title), pg in toc_map:
            toc_entries.append((title, pg, level))
    else:
        toc_entries = [(t, 0, lv) for lv, t in []]  # 第一遍先空
    if not toc_entries:
        # 第一遍：占位目录（所有二级标题，页码 0）
        for line in open(MD, encoding='utf-8'):
            if line.startswith('## '):
                toc_entries.append((line[3:].strip(), 0, 1))
    for title, pg, lv in toc_entries:
        p = doc.add_paragraph()
        pf = p.paragraph_format
        pf.tab_stops.add_tab_stop(Cm(16.2), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
        r = p.add_run(title); set_font(r, '宋体' if lv > 1 else '黑体', 10.5, lv == 1, INK)
        r = p.add_run('\t' + (str(pg) if pg else '')); set_font(r, '宋体', 10.5, False, RGBColor(0x66, 0x66, 0x66))
    p = doc.add_paragraph(); p.add_run().add_break(WD_BREAK.PAGE)

    # ===== 正文解析 =====
    lines = open(MD, encoding='utf-8').read().split('\n')
    i, n = 0, len(lines)
    first_h1_done = False
    while i < n:
        line = lines[i].rstrip()
        if not line.strip():
            i += 1; continue
        # 图片
        m = re.match(r'!\[(.*?)\]\((.*?)\)', line)
        if m:
            alt, rel = m.group(1), m.group(2)
            path = os.path.join(BASE, rel.replace('/', os.sep))
            if os.path.exists(path):
                w, h = Image.open(path).size
                maxw = 15.0
                wcm = min(maxw, w / 96.0 * 2.54)
                hcm = wcm * h / w
                if hcm > 19:
                    hcm = 19; wcm = hcm * w / h
                p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_before = Pt(6); p.paragraph_format.space_after = Pt(2)
                p.add_run().add_picture(path, width=Cm(wcm))
                cap = doc.add_paragraph(); cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                r = cap.add_run(alt); set_font(r, '宋体', 9, False, RGBColor(0x66, 0x66, 0x66))
                cap.paragraph_format.space_after = Pt(8)
            i += 1; continue
        # 标题
        if line.startswith('# '):
            i += 1; continue  # 书名已在封面
        if line.startswith('## '):
            txt = line[3:].strip()
            p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(14); p.paragraph_format.space_after = Pt(6)
            r = p.add_run(txt); set_font(r, '黑体', 15, True, BLUE)
            i += 1; continue
        if line.startswith('### '):
            txt = line[4:].strip()
            p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(10); p.paragraph_format.space_after = Pt(4)
            r = p.add_run(txt); set_font(r, '黑体', 12, True, INK)
            i += 1; continue
        # 表格
        if line.strip().startswith('|'):
            rows = []
            while i < n and lines[i].strip().startswith('|'):
                rows.append(lines[i].strip()); i += 1
            cells = [[c.strip() for c in r.strip('|').split('|')] for r in rows]
            cells = [r for r in cells if not all(re.match(r'^-+$', c) or c == '' for c in r)]
            if cells:
                t = doc.add_table(rows=len(cells), cols=len(cells[0]))
                t.style = 'Table Grid'; t.alignment = WD_TABLE_ALIGNMENT.CENTER
                for ri, row in enumerate(cells):
                    for ci, val in enumerate(row[:len(cells[0])]):
                        cell = t.cell(ri, ci)
                        cell.text = ''
                        cp = cell.paragraphs[0]
                        cp.paragraph_format.space_after = Pt(0)
                        inline_runs(cp, val, 9, INK)
                        if ri == 0:
                            for run in cp.runs:
                                run.font.bold = True
                                run.font.name = '黑体'; run._element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
                doc.add_paragraph().paragraph_format.space_after = Pt(2)
            continue
        # 列表
        if line.startswith('- '):
            p = doc.add_paragraph(style='List Bullet')
            p.paragraph_format.space_after = Pt(2)
            inline_runs(p, line[2:])
            i += 1; continue
        # 分隔线/前言
        if line.strip() == '---':
            i += 1; continue
        # 正文段落（含 1. 2. 编号）
        p = doc.add_paragraph()
        inline_runs(p, line)
        i += 1

    doc.save(DOCX)
    print('DOCX 已生成')


def soffice_pdf():
    if os.path.exists(PDF):
        os.remove(PDF)
    subprocess.run([
        r'C:\Program Files\LibreOffice\program\soffice.exe',
        '--headless', '--convert-to', 'pdf', '--outdir',
        os.path.dirname(PDF), DOCX
    ], check=True, capture_output=True)
    print('PDF 已生成')


def count_pages():
    from pypdf import PdfReader
    return len(PdfReader(PDF).pages)


def find_toc_pages():
    """在 PDF 文本中定位各二级标题首次出现的页码（跳过封面与目录页）"""
    from pypdf import PdfReader
    r = PdfReader(PDF)
    texts = [(pg.extract_text() or '').replace(' ', '').replace('\n', '') for pg in r.pages]
    result = []
    for line in open(MD, encoding='utf-8'):
        if line.startswith('## '):
            title = line[3:].strip()
            key = title.replace(' ', '')
            pg = 0
            for idx, t in enumerate(texts, 1):
                if idx <= 2:      # 跳过第 1 页封面、第 2 页目录（目录自身包含所有标题）
                    continue
                if key and key in t:
                    pg = idx; break
            result.append(((2, title), pg))
    return result


if __name__ == '__main__':
    # 第一遍：占位目录
    build(None); soffice_pdf()
    pages1 = count_pages()
    print('第一遍页数:', pages1)
    # 第二遍：写入真实页码
    toc = find_toc_pages()
    build(toc); soffice_pdf()
    pages2 = count_pages()
    print('最终页数:', pages2)
    print('目录页码:', {t: p for (l, t), p in toc})
    assert pages2 <= 30, '超出 30 页限制: %d' % pages2
    print('PASS: 页数 ≤ 30')
