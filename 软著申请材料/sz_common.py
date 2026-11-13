# -*- coding: utf-8 -*-
"""
软著申请材料 · 公共配置与 Word 工具
- 统一维护软件名称/版本/申请信息，确保「申请表—代码页眉—说明书」完全一致
- 改名只需修改本文件 SYS_NAME / SYS_SHORT / VERSION 三个常量后重跑三个生成脚本
"""
import os
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# ============ 申请信息（与申请表逐字一致） ============
SYS_NAME = '高校班级综合管理系统'          # 软件全称（功能定位 + 系统，符合登记命名规范）
SYS_SHORT = '班级管理系统'                 # 软件简称（不得与全称相同）
VERSION = 'V1.0'                           # 版本号（证书以申请表为准）
NAME_VER = SYS_NAME + ' ' + VERSION        # 页眉统一署名
DATE = '2026 年 10 月'
FINISH_DATE = '2026 年 10 月 4 日'         # 开发完成日期
PUBLISH_STATE = '未发表'
DEV_MODE = '单独开发'
RIGHTS = '原始取得，全部权利'

# 软著申请表「软件功能与技术特点」栏（字数受官网限制，脚本内校验）
FEATURE_MAIN = ('面向高校班级管理场景，提供班级与学生档案、成绩录入与统计分析、考勤与签到、请假审批、'
                '作业发布与批改、随堂测验与自动阅卷、学科竞赛登记、奖助学金管理、健康日报与位置打卡、'
                '课表与通知、学业预警、资料下载等一体化管理，按管理员、任课教师、辅导员、学生四级权限使用。')
FEATURE_TECH = ('HTML5+CSS3+JavaScript 原生单页应用，无须服务器；本地数据库存储与全量备份；'
                '四级角色权限；数据可视化；地理逆解析定位。')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def check_lengths():
    return len(FEATURE_MAIN), len(FEATURE_TECH)   # 应 ≤200 / ≤100


# ============ Word 通用工具 ============
def _font(run, font, size, bold=False):
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run._element.rPr.rFonts.set(qn('w:eastAsia'), font)


def set_header_footer(doc, doc_kind):
    """页眉：左「软件名称 版本号」  右「源程序 / 说明书」；页脚：第 X 页 共 Y 页（Word 域，自动编号）"""
    sec = doc.sections[0]
    # 页眉
    hp = sec.header.paragraphs[0]
    hp.text = ''
    hp.paragraph_format.tab_stops.add_tab_stop(Cm(17.0), WD_TAB_ALIGNMENT.RIGHT)
    _font(hp.add_run(NAME_VER), '宋体', 9)
    _font(hp.add_run('\t' + doc_kind), '宋体', 9)
    # 页脚
    fp = sec.footer.paragraphs[0]
    fp.text = ''
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _font(fp.add_run('第 '), '宋体', 9)
    _add_field(fp, 'PAGE')
    _font(fp.add_run(' 页  共 '), '宋体', 9)
    _add_field(fp, 'NUMPAGES')
    _font(fp.add_run(' 页'), '宋体', 9)


def _add_field(paragraph, instr):
    run = paragraph.add_run()
    _font(run, '宋体', 9)
    b = OxmlElement('w:fldChar'); b.set(qn('w:fldCharType'), 'begin')
    t = OxmlElement('w:instrText'); t.set(qn('xml:space'), 'preserve'); t.text = instr
    e = OxmlElement('w:fldChar'); e.set(qn('w:fldCharType'), 'end')
    run._r.append(b); run._r.append(t); run._r.append(e)


def new_doc(line_pt=11.6, font='Consolas', size=8.5, margins=(1.7, 1.6, 1.9, 1.9)):
    top, bottom, left, right = margins
    doc = Document()
    st = doc.styles['Normal']
    st.font.name = font
    st.font.size = Pt(size)
    st.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    st.paragraph_format.space_before = Pt(0)
    st.paragraph_format.space_after = Pt(0)
    st.paragraph_format.line_spacing = Pt(line_pt)
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.top_margin, sec.bottom_margin = Cm(top), Cm(bottom)
    sec.left_margin, sec.right_margin = Cm(left), Cm(right)
    sec.header_distance, sec.footer_distance = Cm(0.8), Cm(0.8)
    return doc


def fixed_line(doc, text, size=8.5, bold=False, line_pt=11.6):
    """定高单行（用于固定每页行数的鉴别材料）"""
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = Pt(line_pt)
    _font(p.add_run(text if text else ''), '宋体', size, bold)
    return p
