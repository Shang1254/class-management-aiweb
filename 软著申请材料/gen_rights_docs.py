# -*- coding: utf-8 -*-
"""
权属文件生成脚本（B 方案 · 使用许可说明 / D 方案 · 著作权共有协议）
=================================================================
用途：软件著作权归属与使用安排的两种方案文本，用于与学校（学院/科研管理部门）沟通签署。
说明：本脚本输出的是**通用模板**，不构成法律意见；签署前建议由学校科研管理部门或法务确认，
      并按实际情况填写空白项（证件号、登记号、项目名称与编号、比例、日期等）。
运行：python 软著申请材料/gen_rights_docs.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sz_common import (SYS_NAME, SYS_SHORT, VERSION, NAME_VER, FINISH_DATE, HERE,
                       _font, _add_field)
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

AL = {'l': WD_ALIGN_PARAGRAPH.LEFT, 'c': WD_ALIGN_PARAGRAPH.CENTER, 'r': WD_ALIGN_PARAGRAPH.RIGHT,
      'j': WD_ALIGN_PARAGRAPH.JUSTIFY}
SRC_SUMMARY = '35 个源文件、15950 行（HTML 1 个 / CSS 1 个 / JavaScript 33 个；源程序文档排版后 17070 行）'


def new_legal_doc():
    doc = Document()
    st = doc.styles['Normal']
    st.font.name = '宋体'
    st.font.size = Pt(12)
    st.element.rPr.rFonts.set(qn_eastasia(), '宋体')
    st.paragraph_format.space_after = Pt(4)
    st.paragraph_format.line_spacing = Pt(22)
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.top_margin, sec.bottom_margin = Cm(2.6), Cm(2.4)
    sec.left_margin, sec.right_margin = Cm(2.8), Cm(2.6)
    # 页脚：第 X 页 共 Y 页
    fp = sec.footer.paragraphs[0]
    fp.alignment = AL['c']
    _font(fp.add_run('第 '), '宋体', 9)
    _add_field(fp, 'PAGE')
    _font(fp.add_run(' 页  共 '), '宋体', 9)
    _add_field(fp, 'NUMPAGES')
    _font(fp.add_run(' 页'), '宋体', 9)
    return doc


def qn_eastasia():
    from docx.oxml.ns import qn
    return qn('w:eastAsia')


def title(doc, text, size=18):
    p = doc.add_paragraph()
    p.alignment = AL['c']
    p.paragraph_format.space_after = Pt(6)
    _font(p.add_run(text), '黑体', size, True)


def subtitle(doc, text, size=12):
    p = doc.add_paragraph()
    p.alignment = AL['c']
    p.paragraph_format.space_after = Pt(14)
    _font(p.add_run(text), '楷体', size)


def head(doc, text, size=13):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    _font(p.add_run(text), '黑体', size, True)


def para(doc, text, indent=True, size=12, align='j'):
    p = doc.add_paragraph()
    p.alignment = AL[align]
    p.paragraph_format.space_after = Pt(4)
    if indent:
        p.paragraph_format.first_line_indent = Pt(24)
    _font(p.add_run(text), '宋体', size)
    return p


def item(doc, text, size=12):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Pt(24)
    p.paragraph_format.space_after = Pt(3)
    _font(p.add_run(text), '宋体', size)
    return p


def kv_table(doc, rows, widths=(4.2, 11.0), label_size=11.5):
    t = doc.add_table(rows=0, cols=len(rows[0]))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = ''
            p = cells[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            _font(p.add_run(str(v)), '宋体', label_size)
    for r in t.rows:
        for i, w in enumerate(widths):
            if i < len(r.cells):
                r.cells[i].width = Cm(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def sign_line(doc, text, aligns='l'):
    p = doc.add_paragraph()
    p.alignment = AL[aligns]
    p.paragraph_format.space_before = Pt(6)
    _font(p.add_run(text), '宋体', 12)
    return p


# =====================================================================
# B 方案：《计算机软件使用许可说明》
# =====================================================================
def doc_license():
    doc = new_legal_doc()
    title(doc, '计算机软件使用许可说明')
    subtitle(doc, '（' + NAME_VER + '）')

    para(doc, '许可人（著作权人）：林一舟        身份证号：______________________________', indent=False)
    para(doc, '被许可人：武汉晴川学院（计算机学院）        统一社会信用代码：______________________________', indent=False)
    para(doc, '鉴于：许可人独立设计并开发完成了本说明第一条所述计算机软件，现许可人自愿就该软件向被许可人'
              '授予使用许可，双方就许可事项说明如下：')

    head(doc, '第一条  软件基本情况')
    kv_table(doc, [
        ['软件全称', SYS_NAME + '（简称：' + SYS_SHORT + '）'],
        ['版本号', VERSION],
        ['开发完成日期', FINISH_DATE],
        ['开发方式', '许可人独立开发（非职务作品、非委托开发成果）'],
        ['源程序规模', SRC_SUMMARY],
        ['权利归属', '著作权（含署名权、修改权、复制权、发行权、信息网络传播权等全部权利）归许可人所有'],
        ['登记情况', '□ 尚未登记　　□ 已登记，登记号：________________（以中国版权保护中心登记为准）'],
    ])

    head(doc, '第二条  许可内容')
    item(doc, '1. 许可范围：被许可人可在本校教学、学生管理、行政办公、成果展示与宣传范围内使用本软件；')
    item(doc, '2. 使用方式：被许可人可自行部署、复制并安装于学校服务器或校内设备，供校内师生在授权范围内使用；')
    item(doc, '3. 许可性质：永久、免费、非独占、不可转授（详见第三条限制）；')
    item(doc, '4. 展示与宣传：被许可人可在教学、汇报、评估与宣传材料中展示本软件的界面与功能，'
               '但应以适当方式注明"开发者：林一舟"。')

    head(doc, '第三条  许可限制')
    item(doc, '1. 被许可人不得将本软件转让、出售、出租、出质或作价出资给任何第三方；')
    item(doc, '2. 被许可人不得向校外第三方转授权（包括任何形式的商业许可）；')
    item(doc, '3. 被许可人不得移除、篡改本软件中的署名与版权信息；')
    item(doc, '4. 被许可人如需对本软件进行商业化使用或对外合作，须另行取得许可人书面同意。')

    head(doc, '第四条  双方其他约定')
    item(doc, '1. 许可人保留全部著作权与处置权，可自行使用、许可他人使用或向版权登记机构申请登记；')
    item(doc, '2. 被许可人在使用中提出的功能建议与需求，双方可就后续版本另行协商；')
    item(doc, '3. 本软件涉及学生个人信息等数据，被许可人应遵守个人信息保护相关法律法规，'
               '限于教学与管理目的使用并采取必要的安全措施；')
    item(doc, '4. 本许可为永久许可，不因被许可人内部机构调整或人员变动而失效。')

    head(doc, '第五条  其他')
    item(doc, '1. 本说明自双方签字（盖章）之日起生效；')
    item(doc, '2. 本说明一式三份，许可人、被许可人及学校科研管理部门各执一份，具有同等效力；')
    item(doc, '3. 未尽事宜由双方友好协商解决。')

    doc.add_paragraph()
    sign_line(doc, '许可人（签字）：____________________        日期：______ 年 ____ 月 ____ 日')
    sign_line(doc, '被许可人（盖章）：武汉晴川学院计算机学院   代表签字：____________________')
    sign_line(doc, '                                                          日期：______ 年 ____ 月 ____ 日')
    sign_line(doc, '备案（学校科研管理部门，可选）：____________________        日期：______ 年 ____ 月 ____ 日')

    out = os.path.join(HERE, '权属文件', '使用许可说明（B方案·个人独有+学校免费使用）.docx')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    doc.save(out)
    return out


# =====================================================================
# B+ 方案：《使用许可说明》（校内免费 + 校外商用权利保留）
# =====================================================================
def doc_license_plus():
    doc = new_legal_doc()
    title(doc, '计算机软件使用许可说明')
    subtitle(doc, '（' + NAME_VER + ' · 校内免费使用，校外商业使用不在授权范围）')

    para(doc, '许可人（著作权人）：林一舟        身份证号：______________________________', indent=False)
    para(doc, '被许可人：武汉晴川学院（计算机学院）        统一社会信用代码：______________________________', indent=False)
    para(doc, '鉴于：许可人独立设计并开发完成了本说明第一条所述计算机软件，现许可人就该软件向被许可人'
              '授予校内使用许可；为明确许可边界（尤其是校外商业使用不包含在本许可范围内），'
              '双方说明如下：')

    head(doc, '第一条  软件基本情况')
    kv_table(doc, [
        ['软件全称', SYS_NAME + '（简称：' + SYS_SHORT + '）'],
        ['版本号', VERSION],
        ['开发完成日期', FINISH_DATE],
        ['开发方式', '许可人独立开发（非职务作品、非委托开发成果）'],
        ['源程序规模', SRC_SUMMARY],
        ['权利归属', '著作权（含全部财产权）归许可人所有，本说明不构成著作权转让或共有'],
        ['登记情况', '□ 尚未登记　　□ 已登记，登记号：________________（以中国版权保护中心登记为准）'],
    ])

    head(doc, '第二条  许可内容（校内范围）')
    item(doc, '1. 被许可人可在本校教学、学生管理、行政办公、成果展示与宣传范围内永久、免费使用本软件；')
    item(doc, '2. 可自行部署、复制并安装于学校服务器或校内设备，供校内师生在授权范围内使用；')
    item(doc, '3. 可在教学、汇报、评估与宣传材料中展示本软件的界面与功能，应注明"开发者：林一舟"。')

    head(doc, '第三条  许可边界（重点条款）')
    item(doc, '1. 本许可仅限被许可人所在学校内部使用，不含任何校外使用或商业使用权利；')
    item(doc, '2. 许可人保留以自己的名义向其他院校、机构或企业进行许可、合作、定制开发、'
               '商业化运营的全部权利，被许可人不得干涉，亦不参与相关收益分配；')
    item(doc, '3. 被许可人不得将本软件转让、出售、出租、出质、转授权给任何第三方（含合作办学单位、'
               '关联机构与其他院校）；')
    item(doc, '4. 被许可人不得移除本软件中的署名与版权信息，不得反向工程或用于开发同类产品；')
    item(doc, '5. 被许可人如有超出本许可范围的使用需求（如对校外提供培训、对外演示经营等），'
               '须另行取得许可人书面同意并另行约定条件。')

    head(doc, '第四条  后续合作（可选）')
    item(doc, '1. 被许可人如希望获得新增功能、二次开发、数据迁移或长期技术支持，'
               '可与许可人另行签订《技术服务合同》或《软件定制开发合同》，费用另计；')
    item(doc, '2. 被许可人提出的改进建议被采纳并形成新版本的，新版本权利仍归许可人，'
               '被许可人可继续在校内免费使用。')

    head(doc, '第五条  其他')
    item(doc, '1. 被许可人应遵守个人信息保护相关法律法规，妥善管理软件中的学生数据；')
    item(doc, '2. 本说明自双方签字（盖章）之日起生效；永久有效，不因机构调整或人员变动失效；')
    item(doc, '3. 一式三份，许可人、被许可人及学校科研管理部门各执一份，具有同等效力；')
    item(doc, '4. 未尽事宜双方友好协商解决。')

    doc.add_paragraph()
    sign_line(doc, '许可人（签字）：____________________        日期：______ 年 ____ 月 ____ 日')
    sign_line(doc, '被许可人（盖章）：武汉晴川学院计算机学院   代表签字：____________________')
    sign_line(doc, '                                                          日期：______ 年 ____ 月 ____ 日')
    sign_line(doc, '备案（学校科研管理部门，可选）：____________________        日期：______ 年 ____ 月 ____ 日')

    out = os.path.join(HERE, '权属文件', '使用许可说明（B+方案·校内免费+校外商用归学生）.docx')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    doc.save(out)
    return out


# =====================================================================
# D 方案：《计算机软件著作权共有协议》
# =====================================================================
def doc_coowner():
    doc = new_legal_doc()
    title(doc, '计算机软件著作权共有协议')
    subtitle(doc, '（' + NAME_VER + '）')

    para(doc, '甲方（自然人）：林一舟        身份证号：______________________________', indent=False)
    para(doc, '联系方式：________________________________', indent=False)
    para(doc, '乙方（单位）：武汉晴川学院', indent=False)
    para(doc, '统一社会信用代码：________________________    法定代表人／授权代表：________________________', indent=False)
    para(doc, '鉴于：甲方系乙方在校学生，独立设计并开发完成了本协议第一条所述计算机软件；'
              '为明确该软件著作权的归属与行使方式，促进成果应用与保护，双方经平等协商，达成如下协议：', indent=False)

    head(doc, '第一条  软件基本情况')
    kv_table(doc, [
        ['软件全称', SYS_NAME + '（简称：' + SYS_SHORT + '）'],
        ['版本号', VERSION],
        ['开发完成日期', FINISH_DATE],
        ['开发语言与环境', 'HTML5 + CSS3 + JavaScript；浏览器端运行，无需服务器'],
        ['源程序规模', SRC_SUMMARY],
        ['开发过程', '由甲方独立设计并开发完成；乙方未另行下达开发任务，'
                     '亦未提供经费、设备或数据等物质技术条件支持'],
        ['（如适用）项目支持', '□ 无　　□ 有：乙方通过项目"________________________"（编号：____________）'
                               '提供了经费／设备／数据支持'],
    ])

    head(doc, '第二条  著作权归属与共有方式')
    item(doc, '1. 双方共同享有本协议第一条所述软件的著作权（含署名权、修改权、复制权、发行权、'
               '信息网络传播权等），本协议作为著作权共有及权属证明材料；')
    item(doc, '2. 共有方式：□ 共同共有　　□ 按份共有（甲方 ______%，乙方 ______%）；')
    item(doc, '3. 无论采取何种共有方式，双方确认甲方为本软件的开发者，乙方为本软件的开发支持单位。')

    head(doc, '第三条  权利行使规则')
    item(doc, '1. 各自实施：任何一方均可在本校教学、科研、管理、展示范围内独立实施本软件，'
               '无需另行取得对方同意，所得收益归实施方所有（另有约定除外）；')
    item(doc, '2. 处分行为：转让、专有许可、出质等处分本软件著作权的行为，'
               '须经双方书面一致同意；所得收益按第二条约定比例分配，未约定比例的，双方协商确定，'
               '协商不成的平均分配；')
    item(doc, '3. 普通许可：任何一方可单独对外进行非专有（普通）许可，但应事先书面告知另一方，'
               '所得收益按前项规则分配；')
    item(doc, '4. 协商不成时的行使：除转让、专有许可、出质外，任何一方不得无正当理由阻止另一方'
               '依本协议行使权利。')

    head(doc, '第四条  著作权登记')
    item(doc, '1. 双方同意以双方为共同著作权人向中国版权保护中心申请计算机软件著作权登记，'
               '本协议作为权属证明材料提交；')
    item(doc, '2. 登记中使用的软件名称与版本号以双方确认的申请信息为准（' + NAME_VER + '）；')
    item(doc, '3. 登记费、代理服务费等费用由　□ 甲方　□ 乙方　□ 双方按比例（______%）承担。')

    head(doc, '第五条  署名、成果认定与宣传')
    item(doc, '1. 本软件以适当方式署名："开发者：林一舟　开发支持单位：武汉晴川学院"；')
    item(doc, '2. 双方均可将本软件用于成果统计、评奖评优、项目结题、汇报展示与宣传，'
               '但不得损害对方合法权益，不得作虚假陈述；')
    item(doc, '3. 乙方在对外宣传中使用本软件信息，应事先告知甲方。')

    head(doc, '第六条  后续版本与维护')
    item(doc, '1. 后续版本的开发与维护由甲方负责或主导，乙方应提供必要的支持与配合；')
    item(doc, '2. 后续版本（含升级、修改）的著作权归属适用本协议；')
    item(doc, '3. 乙方如需委托第三方开发本软件的衍生版本或再开发，须经甲方书面同意，'
               '并另行约定权利归属；')
    item(doc, '4. 维护期限、维护费用及技术支持方式由双方另行协商（可签订补充协议）。')

    head(doc, '第七条  数据安全与合规')
    item(doc, '1. 本软件运行中涉及在校学生个人信息等数据，乙方作为数据管理者应采取必要的'
               '安全保护措施，遵守《中华人民共和国个人信息保护法》等法律法规；')
    item(doc, '2. 软件部署与使用不得超出教学、科研与行政管理目的；'
               '涉及数据对外提供的，应依法依规另行履行相应程序。')

    head(doc, '第八条  保密')
    item(doc, '除法律法规要求或双方书面同意外，任何一方不得向第三方披露本协议的内容'
               '及履行中知悉的对方未公开信息。')

    head(doc, '第九条  争议解决')
    item(doc, '本协议的订立、效力、解释与履行适用中华人民共和国法律。'
               '履行中发生争议，双方应友好协商解决；协商不成的，'
               '任何一方可向乙方所在地有管辖权的人民法院提起诉讼。')

    head(doc, '第十条  生效与其他')
    item(doc, '1. 本协议自双方签字（盖章）之日起生效；')
    item(doc, '2. 本协议一式三份，甲乙双方各执一份，学校科研管理部门备案一份，具有同等效力；')
    item(doc, '3. 项目立项文件、任务书、开发者证明等材料可作为本协议附件，与本协议具有同等效力；')
    item(doc, '4. 本协议未尽事宜，双方可签订补充协议，补充协议与本协议具有同等效力。')

    doc.add_paragraph()
    sign_line(doc, '甲方（签字）：____________________        身份证号：______________________________')
    sign_line(doc, '                                                          日期：______ 年 ____ 月 ____ 日')
    doc.add_paragraph()
    sign_line(doc, '乙方（盖章）：武汉晴川学院')
    sign_line(doc, '法定代表人或授权代表（签字）：____________________')
    sign_line(doc, '                                                          日期：______ 年 ____ 月 ____ 日')
    sign_line(doc, '备案（学校科研管理部门）：____________________        日期：______ 年 ____ 月 ____ 日')

    out = os.path.join(HERE, '权属文件', '计算机软件著作权共有协议（D方案·学生与学校共有）.docx')
    doc.save(out)
    return out


if __name__ == '__main__':
    p1 = doc_license()
    p2 = doc_license_plus()
    p3 = doc_coowner()
    for p in (p1, p2, p3):
        print('已生成 ->', p, '(%.1f KB)' % (os.path.getsize(p) / 1024))
